"""LangGraph ReAct Agent for novel writing.

Replaces the hand-written agentic loop in agent_service with LangGraph's
create_react_agent, providing framework-level tool dispatch and streaming.
"""
from pathlib import Path
from typing import AsyncGenerator

from langchain_core.messages import AIMessageChunk, HumanMessage, AIMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent
from sqlmodel import Session

from config import PROJECTS_BASE_DIR
from models.chat import SendMessageRequest, StreamEvent
from services.agent_tools import make_novel_tools
from services.chat_service import (
    _get_all_history,
    _get_or_build_summary,
    _save_message,
    RECENT_WINDOW,
)
from services.model_service import get_default_model_raw, get_model_raw
from utils.encryption import decrypt

_DEFAULT_SYSTEM_PROMPT = (
    "你是一位专业小说创作助手。你可以通过工具读取和修改项目的大纲与章节内容。"
    "请根据用户需求，合理使用工具完成任务，不要一次性加载所有内容，按需读取。"
)

MAX_ITERATIONS = 10


def _build_llm(raw: dict, request: SendMessageRequest) -> ChatOpenAI:
    """Build a ChatOpenAI instance from model config."""
    api_key = decrypt(raw["api_key"])
    base_url = (raw.get("base_url") or "https://api.openai.com/v1").rstrip("/")
    temperature = request.temperature if request.temperature is not None else raw.get("temperature", 0.7)
    max_tokens = request.max_tokens if request.max_tokens is not None else raw.get("max_tokens", 4096)

    kwargs = {}
    if raw.get("enable_thinking") and raw.get("thinking_budget"):
        kwargs["model_kwargs"] = {
            "thinking": {"type": "enabled", "budget_tokens": raw["thinking_budget"]}
        }

    return ChatOpenAI(
        model=raw["model_name"],
        api_key=api_key,
        base_url=base_url,
        temperature=temperature,
        max_tokens=max_tokens,
        streaming=True,
        **kwargs,
    )


def _build_system_message(
    request: SendMessageRequest,
    project_id: str,
    summary: str | None,
) -> str:
    """Assemble the full system prompt (base + outline anchor + history summary)."""
    parts = [request.system_prompt or _DEFAULT_SYSTEM_PROMPT]

    outline_path = Path(PROJECTS_BASE_DIR) / project_id / "outline.md"
    if outline_path.exists():
        outline_text = outline_path.read_text(encoding="utf-8").strip()
        if outline_text:
            parts.append(
                f"【当前大纲（固定参考，不得偏离，扩充时必须在此基础上续写）】\n{outline_text}"
            )

    if summary:
        parts.append(f"以下是本次对话之前的历史摘要：\n{summary}")

    return "\n\n".join(parts)


def _sse(event: StreamEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


async def stream_langgraph_agent(
    session: Session, project_id: str, request: SendMessageRequest
) -> AsyncGenerator[str, None]:
    """Main entry: build agent, stream events, yield SSE strings."""

    # 1. Resolve model config
    raw = None
    if request.model_id:
        raw = get_model_raw(request.model_id)
    if raw is None:
        raw = get_default_model_raw()
    if raw is None:
        yield _sse(StreamEvent(event="error", data="未配置模型，请先在设置中添加模型"))
        return

    # 2. Save user message
    _save_message(session, project_id, "user", request.content)

    # 3. Build conversation history
    all_history = _get_all_history(session, project_id)
    summary = None
    if len(all_history) > RECENT_WINDOW:
        old_msgs = all_history[:-RECENT_WINDOW]
        recent_msgs = all_history[-RECENT_WINDOW:]
        try:
            summary = await _get_or_build_summary(session, project_id, old_msgs, raw)
        except Exception:
            recent_msgs = all_history
    else:
        recent_msgs = all_history

    # 4. Build system prompt
    system_message = _build_system_message(request, project_id, summary)

    # 5. Convert recent messages to LangChain format
    input_messages = []
    for m in recent_msgs:
        if m.role == "user":
            input_messages.append(HumanMessage(content=m.content))
        else:
            input_messages.append(AIMessage(content=m.content))

    # 6. Build LLM and tools
    try:
        llm = _build_llm(raw, request)
    except Exception as e:
        yield _sse(StreamEvent(event="error", data=f"模型初始化失败：{e}"))
        return

    tools = make_novel_tools(project_id)

    # 7. Create LangGraph ReAct agent
    agent = create_react_agent(
        model=llm,
        tools=tools,
        state_modifier=system_message,
    )

    # 8. Stream events
    full_text = ""

    try:
        async for event in agent.astream_events(
            {"messages": input_messages},
            config={"recursion_limit": MAX_ITERATIONS * 2},
            version="v2",
        ):
            kind = event["event"]

            if kind == "on_chat_model_stream":
                chunk = event["data"].get("chunk")
                if isinstance(chunk, AIMessageChunk) and chunk.content:
                    token = chunk.content if isinstance(chunk.content, str) else ""
                    if token:
                        full_text += token
                        yield _sse(StreamEvent(event="delta", data=token))

            elif kind == "on_tool_start":
                tool_name = event.get("name", "")
                yield _sse(StreamEvent(event="tool_use", data=tool_name))

            elif kind == "on_tool_end":
                output = event.get("data", {})
                result_str = str(output.get("output", ""))
                yield _sse(StreamEvent(event="tool_result", data=result_str[:200]))

        # 9. Save assistant message
        if full_text.strip():
            saved = _save_message(session, project_id, "assistant", full_text)
            yield _sse(StreamEvent(event="done", data="", message_id=saved.id))
        else:
            yield _sse(StreamEvent(event="done", data=""))

    except Exception as e:
        yield _sse(StreamEvent(event="error", data=f"Agent 执行出错：{e}"))
