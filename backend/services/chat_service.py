import json
import uuid
from datetime import datetime
from typing import AsyncGenerator

import aiohttp
from sqlmodel import Session, select

from db.tables import ConversationMessage
from models.chat import SendMessageRequest, StreamEvent
from services.model_service import get_default_model_raw, get_model_raw
from utils.encryption import decrypt

HISTORY_LIMIT = 20
_DEFAULT_BASE_URL = "https://api.openai.com/v1"


def _get_history(session: Session, project_id: str) -> list[ConversationMessage]:
    msgs = session.exec(
        select(ConversationMessage)
        .where(ConversationMessage.project_id == project_id)
        .order_by(ConversationMessage.created_at.desc())  # type: ignore[attr-defined]
        .limit(HISTORY_LIMIT)
    ).all()
    return list(reversed(msgs))


def get_history(session: Session, project_id: str) -> list[ConversationMessage]:
    return _get_history(session, project_id)


def clear_history(session: Session, project_id: str) -> None:
    msgs = session.exec(
        select(ConversationMessage).where(ConversationMessage.project_id == project_id)
    ).all()
    for m in msgs:
        session.delete(m)
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

    # Build messages list
    history = _get_history(session, project_id)
    messages = []
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})
    for h in history:
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

        full_text = ""
        async with aiohttp.ClientSession() as http:
            async with http.post(url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    raise RuntimeError(f"HTTP {resp.status}: {body}")

                async for raw_line in resp.content:
                    line = raw_line.decode("utf-8").strip()
                    if not line or not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = (chunk["choices"][0]["delta"].get("content")) or ""
                        if delta:
                            full_text += delta
                            event = StreamEvent(event="delta", data=delta)
                            yield f"data: {event.model_dump_json()}\n\n"
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

        # Save assistant message
        saved = _save_message(session, project_id, "assistant", full_text)
        done_event = StreamEvent(event="done", data="", message_id=saved.id)
        yield f"data: {done_event.model_dump_json()}\n\n"

    except Exception as e:
        error_event = StreamEvent(event="error", data=str(e))
        yield f"data: {error_event.model_dump_json()}\n\n"
