import json
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator

import aiohttp
from sqlmodel import Session, select

from config import PROJECTS_BASE_DIR
from db.tables import ConversationMessage, ConversationSummary
from models.chat import SendMessageRequest, StreamEvent
from services.model_service import get_default_model_raw, get_model_raw
from utils.encryption import decrypt

RECENT_WINDOW = 10
_DEFAULT_BASE_URL = "https://api.openai.com/v1"

_EXPAND_KEYWORDS = re.compile(
    r"扩充|扩展|续写|延伸|增加章节|补充大纲|继续大纲|扩写大纲|expand.*outline|more.*chapter",
    re.IGNORECASE,
)


def _detect_expand_intent(text: str) -> bool:
    return bool(_EXPAND_KEYWORDS.search(text))


def _load_project_context(project_id: str) -> str:
    """Load outline + chapter list for injection into system prompt."""
    base = Path(PROJECTS_BASE_DIR) / project_id
    parts: list[str] = []

    outline_path = base / "outline.md"
    if outline_path.exists():
        parts.append("【当前大纲】\n" + outline_path.read_text(encoding="utf-8").strip())

    chapters_dir = base / "chapters"
    if chapters_dir.exists():
        chapter_files = sorted(chapters_dir.glob("chapter_*.md"))
        if chapter_files:
            titles = []
            for f in chapter_files:
                first_line = f.read_text(encoding="utf-8").split("\n")[0].lstrip("# ").strip()
                titles.append(first_line)
            parts.append("【已有章节】\n" + "\n".join(f"- {t}" for t in titles))

    return "\n\n".join(parts)


def _get_all_history(session: Session, project_id: str) -> list[ConversationMessage]:
    msgs = session.exec(
        select(ConversationMessage)
        .where(ConversationMessage.project_id == project_id)
        .order_by(ConversationMessage.created_at.asc())  # type: ignore[attr-defined]
    ).all()
    return list(msgs)


def get_history(session: Session, project_id: str) -> list[ConversationMessage]:
    return _get_all_history(session, project_id)


def clear_history(session: Session, project_id: str) -> None:
    msgs = session.exec(
        select(ConversationMessage).where(ConversationMessage.project_id == project_id)
    ).all()
    for m in msgs:
        session.delete(m)
    # Also clear cached summary
    summaries = session.exec(
        select(ConversationSummary).where(ConversationSummary.project_id == project_id)
    ).all()
    for s in summaries:
        session.delete(s)
    session.commit()


def _save_message(session: Session, project_id: str, role: str, content: str) -> ConversationMessage:
    msg = ConversationMessage(
        id=str(uuid.uuid4()),
        project_id=project_id,
        role=role,
        content=content,
        created_at=datetime.utcnow(),
    )
    session.add(msg)
    session.commit()
    session.refresh(msg)
    return msg


async def _call_ai_sync(raw: dict, messages: list[dict]) -> str:
    """Non-streaming AI call for summarization."""
    api_key = decrypt(raw["api_key"])
    base_url = (raw.get("base_url") or _DEFAULT_BASE_URL).rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": raw["model_name"],
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 1024,
        "stream": False,
    }
    async with aiohttp.ClientSession() as http:
        async with http.post(url, headers=headers, json=payload) as resp:
            if resp.status != 200:
                body = await resp.text()
                raise RuntimeError(f"HTTP {resp.status}: {body}")
            data = await resp.json()
            return data["choices"][0]["message"]["content"]


async def _get_or_build_summary(
    session: Session,
    project_id: str,
    old_msgs: list[ConversationMessage],
    raw: dict,
) -> str:
    """Return cached summary or compress old_msgs into one via AI."""
    existing = session.exec(
        select(ConversationSummary).where(ConversationSummary.project_id == project_id)
    ).first()

    last_old_id = old_msgs[-1].id

    # Cache hit: summary already covers up to this message
    if existing and existing.up_to_message_id == last_old_id:
        return existing.summary

    # Build conversation text for summarization
    lines = []
    for m in old_msgs:
        role_label = "用户" if m.role == "user" else "助手"
        lines.append(f"{role_label}: {m.content}")
    conversation_text = "\n".join(lines)

    prompt_messages = [
        {
            "role": "system",
            "content": "你是一个对话摘要助手。请将以下对话历史压缩成简洁的摘要，保留关键信息、决策和重要细节，用于后续对话的上下文参考。摘要用中文，不超过500字。",
        },
        {"role": "user", "content": f"请总结以下对话历史：\n\n{conversation_text}"},
    ]

    summary_text = await _call_ai_sync(raw, prompt_messages)

    # Upsert summary
    if existing:
        existing.summary = summary_text
        existing.up_to_message_id = last_old_id
        existing.updated_at = datetime.utcnow()
        session.add(existing)
    else:
        session.add(ConversationSummary(
            id=str(uuid.uuid4()),
            project_id=project_id,
            up_to_message_id=last_old_id,
            summary=summary_text,
            updated_at=datetime.utcnow(),
        ))
    session.commit()
    return summary_text


async def stream_chat(
    session: Session, project_id: str, request: SendMessageRequest
) -> AsyncGenerator[str, None]:
    # Resolve model
    raw = None
    if request.model_id:
        raw = get_model_raw(request.model_id)
    if raw is None:
        raw = get_default_model_raw()
    if raw is None:
        event = StreamEvent(event="error", data="未配置任何可用模型，请先在模型配置页面添加模型")
        yield f"data: {event.model_dump_json()}\n\n"
        return

    # Save user message
    _save_message(session, project_id, "user", request.content)

    # Split history into old (to summarize) and recent (verbatim)
    all_history = _get_all_history(session, project_id)
    if len(all_history) > RECENT_WINDOW:
        old_msgs = all_history[:-RECENT_WINDOW]
        recent_msgs = all_history[-RECENT_WINDOW:]
    else:
        old_msgs = []
        recent_msgs = all_history

    # Build messages list
    messages: list[dict] = []
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})

    # Always inject current outline as a fixed anchor to prevent topic drift
    outline_path = Path(PROJECTS_BASE_DIR) / project_id / "outline.md"
    if outline_path.exists():
        outline_text = outline_path.read_text(encoding="utf-8").strip()
        if outline_text:
            messages.append({
                "role": "system",
                "content": f"【当前大纲（固定参考，不得偏离）】\n{outline_text}",
            })

    # Auto-inject chapter list + expand instructions when user wants to expand the outline
    if _detect_expand_intent(request.content):
        ctx = _load_project_context(project_id)
        if ctx:
            expand_instruction = (
                "用户希望扩充大纲。请在现有章节基础上续写新章节，保持情节连贯。\n"
                "规则：\n"
                "1. 只输出新增的部分和章节，不要重复已有内容\n"
                "2. 新章节编号从现有最大章节号+1开始，保持连续\n"
                "3. 章节命名格式：第n章：副标题（n 为阿拉伯数字）\n"
                "4. 表格格式与原大纲完全一致：章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示\n\n"
                '''5.
                **Markdown 表格格式（必须严格遵守，逐字符对照）**：
                - 表头行：| 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |
                - 分隔行：| :--- | :--- | :--- | :--- |
                - 分隔行只能包含英文冒号、英文短横线和竖线，禁止出现任何中文字符
                - 数据行：| 第n章：副标题 | 事件描述 | 冲突描述 | 悬念描述 |

                示例（请严格模仿此格式）：

                | 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |
                | :--- | :--- | :--- | :--- |
                | 第1章：觉醒之日 | 主角在废墟中觉醒异能 | 异能失控的恐惧 | 神秘符文浮现在手背 |
                | 第2章：初入江湖 | 主角离开村庄前往王都 | 路遇山贼围截 | 山贼首领认出了主角的符文 |
                | 第3章：暗流涌动 | 主角进入冒险者公会 | 被高阶冒险者刁难 | 公会长暗中观察主角 |

                **章节命名规则（必须严格遵守）**：
                - 章节列必须使用"第n章：副标题"格式，n 为阿拉伯数字，从1开始连续编号
                - 禁止使用"阶段"、"幕"、"节"、"回"等其他单位，统一用"章"
                - 禁止省略章号或写错格式（如"第人章"、"第 章"均为错误）

                **扩充大纲规则（扩充时必须遵守）**：
                - 必须返回完整大纲，包含原有所有章节和新增章节，不得省略任何已有内容
                - 新章节编号从现有最大章节号+1开始，保持连续
                - 表格格式与上述示例完全一致

                请严格遵循此格式输出，便于后续创作。
                '''
                + ctx
            )
            messages.append({"role": "system", "content": expand_instruction})

    # Inject compressed summary of old messages if any
    if old_msgs:
        try:
            summary = await _get_or_build_summary(session, project_id, old_msgs, raw)
            messages.append({
                "role": "system",
                "content": f"以下是本次对话之前的历史摘要，供参考：\n{summary}",
            })
        except Exception:
            # If summarization fails, fall back to including old messages directly
            for h in old_msgs:
                messages.append({"role": h.role, "content": h.content})

    for h in recent_msgs:
        messages.append({"role": h.role, "content": h.content})

    # Stream from AI via aiohttp
    try:
        api_key = decrypt(raw["api_key"])
        base_url = (raw.get("base_url") or _DEFAULT_BASE_URL).rstrip("/")
        url = f"{base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": raw["model_name"],
            "messages": messages,
            "temperature": request.temperature if request.temperature is not None else raw.get("temperature", 0.7),
            "max_tokens": request.max_tokens if request.max_tokens is not None else raw.get("max_tokens", 4096),
            "stream": True,
        }
        # Cap thinking budget to prevent infinite reasoning loops
        if raw.get("enable_thinking"):
            thinking_budget = raw.get("thinking_budget")
            if thinking_budget:
                payload["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
        else:
            payload["thinking"] = {"type": "disabled"}

        full_text = ""
        thinking_text = ""
        async with aiohttp.ClientSession() as http:
            async with http.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"HTTP {resp.status}: {body}")

                sse_buf = ""
                finish_reason = None
                async for raw_chunk in resp.content:
                    sse_buf += raw_chunk.decode("utf-8")
                    while "\n" in sse_buf:
                        line, sse_buf = sse_buf.split("\n", 1)
                        line = line.strip()
                        if not line or not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                            choice = chunk["choices"][0]
                            finish_reason = choice.get("finish_reason") or finish_reason
                            delta_obj = choice.get("delta", {})
                            # Thinking content — Ollama uses "reasoning", DeepSeek uses "reasoning_content"
                            thinking = delta_obj.get("reasoning") or delta_obj.get("reasoning_content") or ""
                            if thinking:
                                thinking_text += thinking
                                # Detect repetitive thinking loops
                                if len(thinking_text) > 2000:
                                    tail = thinking_text[-1000:]
                                    half = tail[:500]
                                    if tail.count(half[:80]) >= 3:
                                        finish_reason = "length"
                                        break
                                event = StreamEvent(event="thinking", data=thinking)
                                yield f"data: {event.model_dump_json()}\n\n"
                            delta = delta_obj.get("content") or ""
                            if delta:
                                full_text += delta
                                event = StreamEvent(event="delta", data=delta)
                                yield f"data: {event.model_dump_json()}\n\n"
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue

        # If model ran out of tokens mid-thinking (common with small max_tokens + thinking models),
        # fall back to the thinking text so the user gets something instead of silence.
        if not full_text and finish_reason == "length" and thinking_text:
            full_text = f"[思考内容（token 不足，请在模型配置中增大 max_tokens）]\n\n{thinking_text}"
            warn_ev = StreamEvent(event="delta", data=full_text)
            yield f"data: {warn_ev.model_dump_json()}\n\n"

        # Save assistant message
        saved = _save_message(session, project_id, "assistant", full_text)
        done_event = StreamEvent(event="done", data="", message_id=saved.id)
        yield f"data: {done_event.model_dump_json()}\n\n"

    except Exception as e:
        error_event = StreamEvent(event="error", data=str(e))
        yield f"data: {error_event.model_dump_json()}\n\n"
