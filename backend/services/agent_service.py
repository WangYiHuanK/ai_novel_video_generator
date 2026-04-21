"""Agent engine using OpenAI-compatible tool calling.

The model decides which tools to call; we execute them and feed results back.
This saves context: the model only loads what it needs via tools.
If the model doesn't support tool calling, falls back to plain streaming.
"""
import json
import uuid
from datetime import datetime
from typing import AsyncGenerator

import aiohttp
from sqlmodel import Session

from models.chat import SendMessageRequest, StreamEvent
from services.chat_service import (
    _get_all_history,
    _get_or_build_summary,
    _save_message,
    RECENT_WINDOW,
    _DEFAULT_BASE_URL,
)
from services.model_service import get_default_model_raw, get_model_raw
from services import novel_service
from utils.encryption import decrypt


# ── Tool definitions (OpenAI function-calling format) ──────────────────────

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_outline",
            "description": "读取当前项目的故事大纲",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_outline",
            "description": "保存/更新故事大纲内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "大纲的完整 Markdown 内容"}
                },
                "required": ["content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_chapters",
            "description": "列出所有已有章节的标题和编号",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_chapter",
            "description": "读取指定章节的完整内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {
                        "type": "string",
                        "description": "章节ID，格式为 chapter_N（如 chapter_1）",
                    }
                },
                "required": ["chapter_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_chapter",
            "description": "更新指定章节的标题和/或内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {"type": "string", "description": "章节ID，格式为 chapter_N"},
                    "title": {"type": "string", "description": "新标题（可选）"},
                    "content": {"type": "string", "description": "新正文内容（可选）"},
                },
                "required": ["chapter_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_chapter",
            "description": "创建新章节",
            "parameters": {
                "type": "object",
                "properties": {
                    "order": {"type": "integer", "description": "章节序号"},
                    "title": {"type": "string", "description": "章节标题"},
                    "content": {"type": "string", "description": "章节正文内容"},
                    "summary": {"type": "string", "description": "章节摘要（可选）"},
                },
                "required": ["order", "title", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_chapter",
            "description": "删除指定章节",
            "parameters": {
                "type": "object",
                "properties": {
                    "chapter_id": {"type": "string", "description": "章节ID，格式为 chapter_N"}
                },
                "required": ["chapter_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "expand_outline",
            "description": "在现有大纲基础上扩充章节。工具返回当前大纲内容，模型据此续写后必须调用 save_outline 保存完整大纲（原有+新增，不得省略已有内容）。",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_chapter": {
                        "type": "integer",
                        "description": "从第几章开始扩充（如用户说'从第10章开始扩充'则传10）。不传则从最后一章之后续写。",
                    },
                    "from_part": {
                        "type": "string",
                        "description": "从哪个部分开始扩充（如用户说'扩充第二部分'则传'第二部分'）。不传则从最后一个部分之后续写。",
                    },
                    "count": {
                        "type": "integer",
                        "description": "希望新增的章节数量，默认 5",
                    },
                    "instruction": {
                        "type": "string",
                        "description": "用户对扩充方向的额外要求（如'加入更多战斗场景'、'增加感情线'等）",
                    },
                },
                "required": [],
            },
        },
    },
]

# ── Tool executor ──────────────────────────────────────────────────────────

def _execute_tool(name: str, args: dict, project_id: str) -> str:
    """Execute a tool and return a string result."""
    try:
        if name == "read_outline":
            content = novel_service.get_outline(project_id)
            return content if content else "（大纲为空）"

        elif name == "save_outline":
            novel_service.save_outline(project_id, args["content"])
            return "大纲已保存。请将完整大纲以 Markdown 表格格式展示给用户（表头：| 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |）。"

        elif name == "list_chapters":
            chapters = novel_service.list_chapters(project_id)
            if not chapters:
                return "（暂无章节）"
            lines = [f"- {ch.id}: {ch.title}（{ch.word_count} 字）" for ch in chapters]
            return "\n".join(lines)

        elif name == "read_chapter":
            ch = novel_service.get_chapter(project_id, args["chapter_id"])
            if ch is None:
                return f"章节 {args['chapter_id']} 不存在"
            return f"# {ch.title}\n\n{ch.content}"

        elif name == "update_chapter":
            chapter_id = args["chapter_id"]
            existing = novel_service.get_chapter(project_id, chapter_id)
            if existing is None:
                return f"章节 {chapter_id} 不存在"
            title = args.get("title", existing.title)
            content = args.get("content", existing.content)
            novel_service.save_chapter(project_id, chapter_id, title, content)
            return f"章节 {chapter_id} 已更新"

        elif name == "create_chapter":
            from models.novel import ChapterCreate
            data = ChapterCreate(
                order=args["order"],
                title=args["title"],
                content=args["content"],
                summary=args.get("summary"),
            )
            ch = novel_service.create_chapter(project_id, data)
            return f"章节 {ch.id} 已创建：{ch.title}"

        elif name == "delete_chapter":
            ok = novel_service.delete_chapter(project_id, args["chapter_id"])
            return "已删除" if ok else f"章节 {args['chapter_id']} 不存在"

        elif name == "expand_outline":
            import re
            count = args.get("count", 5)
            from_chapter = args.get("from_chapter")
            from_part = args.get("from_part")
            instruction = args.get("instruction", "")
            content = novel_service.get_outline(project_id)
            if not content:
                return "（大纲为空，请先创建大纲）"
            nums = [int(m) for m in re.findall(r'第(\d+)章', content)]
            max_chapter = max(nums) if nums else 0

            hint = f"当前大纲内容如下：\n\n{content}\n\n---\n"
            hint += f"当前最大章节号：第{max_chapter}章。\n"
            if from_chapter:
                hint += f"用户要求从第{from_chapter}章开始扩充。\n"
            elif from_part:
                hint += f"用户要求从「{from_part}」开始扩充。\n"
            else:
                hint += f"请从第{max_chapter + 1}章开始续写。\n"
            hint += f"新增约{count}章。\n"
            if instruction:
                hint += f"用户额外要求：{instruction}\n"
            hint += "完成后必须调用 save_outline 保存完整大纲（原有全部内容 + 新增章节），不得省略任何已有内容。\n"
            hint += "输出格式必须严格使用 Markdown 表格：| 章节 | 核心事件 | 冲突点 | 悬念与悬念的揭示 |，分隔行只用英文字符 | :--- |。"
            return hint

        else:
            return f"未知工具：{name}"

    except Exception as e:
        return f"工具执行出错：{e}"


# ── Agentic loop ───────────────────────────────────────────────────────────

MAX_ITERATIONS = 10  # prevent infinite loops


async def stream_agent(
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

    # Build compressed history context
    all_history = _get_all_history(session, project_id)
    if len(all_history) > RECENT_WINDOW:
        old_msgs = all_history[:-RECENT_WINDOW]
        recent_msgs = all_history[-RECENT_WINDOW:]
    else:
        old_msgs = []
        recent_msgs = all_history

    # System prompt
    system_content = (
        request.system_prompt
        or "你是一位专业小说创作助手。你可以通过工具读取和修改项目的大纲与章节内容。"
        "请根据用户需求，合理使用工具完成任务，不要一次性加载所有内容，按需读取。"
    )
    messages: list[dict] = [{"role": "system", "content": system_content}]

    # Inject current outline as fixed anchor to prevent topic drift
    from pathlib import Path
    from config import PROJECTS_BASE_DIR
    outline_path = Path(PROJECTS_BASE_DIR) / project_id / "outline.md"
    if outline_path.exists():
        outline_text = outline_path.read_text(encoding="utf-8").strip()
        if outline_text:
            messages.append({
                "role": "system",
                "content": f"【当前大纲（固定参考，不得偏离，扩充时必须在此基础上续写）】\n{outline_text}",
            })

    # Inject compressed summary of old messages
    if old_msgs:
        try:
            summary = await _get_or_build_summary(session, project_id, old_msgs, raw)
            messages.append({
                "role": "system",
                "content": f"以下是本次对话之前的历史摘要，供参考：\n{summary}",
            })
        except Exception:
            for h in old_msgs:
                messages.append({"role": h.role, "content": h.content})

    for h in recent_msgs:
        messages.append({"role": h.role, "content": h.content})

    # Agentic loop
    api_key = decrypt(raw["api_key"])
    base_url = (raw.get("base_url") or _DEFAULT_BASE_URL).rstrip("/")
    url = f"{base_url}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    full_text = ""

    try:
        async with aiohttp.ClientSession() as http:
          for _iteration in range(MAX_ITERATIONS):
            payload = {
                "model": raw["model_name"],
                "messages": messages,
                "temperature": request.temperature if request.temperature is not None else raw.get("temperature", 0.7),
                "max_tokens": request.max_tokens if request.max_tokens is not None else raw.get("max_tokens", 4096),
                "tools": TOOLS,
                "tool_choice": "auto",
                "stream": True,
            }
            # Cap thinking budget to prevent Gemma4-style infinite reasoning loops
            if raw.get("enable_thinking"):
                thinking_budget = raw.get("thinking_budget")
                if thinking_budget:
                    payload["thinking"] = {"type": "enabled", "budget_tokens": thinking_budget}
            else:
                payload["thinking"] = {"type": "disabled"}

            if _iteration > 0:
                yield ": keepalive\n\n"

            delta_text = ""
            thinking_text = ""
            thinking_chunks: list[str] = []
            tool_calls_raw: dict[int, dict] = {}

            async with http.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"HTTP {resp.status}: {body}")

                finish_reason = None
                sse_buf = ""
                done_signal = False

                async for raw_chunk in resp.content:
                    sse_buf += raw_chunk.decode("utf-8")
                    while "\n" in sse_buf:
                        line, sse_buf = sse_buf.split("\n", 1)
                        line = line.strip()
                        if not line or not line.startswith("data: "):
                            continue
                        data = line[6:]
                        if data == "[DONE]":
                            done_signal = True
                            break
                        try:
                            chunk = json.loads(data)
                            choice = chunk["choices"][0]
                            finish_reason = choice.get("finish_reason") or finish_reason
                            delta_obj = choice.get("delta", {})

                            thinking = delta_obj.get("reasoning") or delta_obj.get("reasoning_content") or ""
                            if thinking:
                                thinking_text += thinking
                                thinking_chunks.append(thinking)
                                # Detect repetitive thinking: check last 200 chars for loops
                                if len(thinking_text) > 2000:
                                    tail = thinking_text[-1000:]
                                    half = tail[:500]
                                    if tail.count(half[:80]) >= 3:
                                        # Thinking is looping, force break
                                        done_signal = True
                                        finish_reason = "length"
                                        break
                                ev = StreamEvent(event="thinking", data=thinking)
                                yield f"data: {ev.model_dump_json()}\n\n"

                            delta = delta_obj.get("content") or ""
                            if delta:
                                delta_text += delta
                                full_text += delta
                                ev = StreamEvent(event="delta", data=delta)
                                yield f"data: {ev.model_dump_json()}\n\n"

                            for tc in delta_obj.get("tool_calls") or []:
                                idx = tc.get("index", 0)
                                if idx not in tool_calls_raw:
                                    tool_calls_raw[idx] = {"id": "", "name": "", "arguments_str": ""}
                                entry = tool_calls_raw[idx]
                                if tc.get("id"):
                                    entry["id"] = tc["id"]
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    entry["name"] = fn["name"]
                                if fn.get("arguments"):
                                    entry["arguments_str"] += fn["arguments"]

                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                    if done_signal:
                        break

            # Fallback: thinking model ran out of tokens before producing content
            if not delta_text and not tool_calls_raw and finish_reason == "length" and thinking_text:
                delta_text = f"[思考内容（token 不足，请在模型配置中增大 max_tokens）]\n\n{thinking_text}"
                full_text += delta_text
                warn_ev = StreamEvent(event="delta", data=delta_text)
                yield f"data: {warn_ev.model_dump_json()}\n\n"

            if not tool_calls_raw:
                break

            tool_calls_for_msg = []
            for idx in sorted(tool_calls_raw.keys()):
                entry = tool_calls_raw[idx]
                tool_calls_for_msg.append({
                    "id": entry["id"] or str(uuid.uuid4()),
                    "type": "function",
                    "function": {"name": entry["name"], "arguments": entry["arguments_str"]},
                })

            messages.append({
                "role": "assistant",
                "content": delta_text or None,
                "tool_calls": tool_calls_for_msg,
            })

            for tc in tool_calls_for_msg:
                tool_name = tc["function"]["name"]
                try:
                    tool_args = json.loads(tc["function"]["arguments"] or "{}")
                except json.JSONDecodeError:
                    tool_args = {}

                use_ev = StreamEvent(event="tool_use", data=tool_name)
                yield f"data: {use_ev.model_dump_json()}\n\n"

                result = _execute_tool(tool_name, tool_args, project_id)

                result_ev = StreamEvent(event="tool_result", data=result[:200])
                yield f"data: {result_ev.model_dump_json()}\n\n"

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result,
                })

        saved = _save_message(session, project_id, "assistant", full_text)
        done_event = StreamEvent(event="done", data="", message_id=saved.id)
        yield f"data: {done_event.model_dump_json()}\n\n"

    except Exception as e:
        error_event = StreamEvent(event="error", data=str(e))
        yield f"data: {error_event.model_dump_json()}\n\n"
