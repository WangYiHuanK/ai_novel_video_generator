from datetime import datetime
from enum import Enum
from typing import Literal
from pydantic import BaseModel


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class ChatMessage(BaseModel):
    id: str
    role: MessageRole
    content: str
    created_at: datetime


class SendMessageRequest(BaseModel):
    content: str
    system_prompt: str | None = None
    model_id: str | None = None
    temperature: float | None = None
    max_tokens: int | None = None


class StreamEvent(BaseModel):
    event: Literal["delta", "done", "error", "thinking", "tool_use", "tool_result"]
    data: str
    message_id: str | None = None
