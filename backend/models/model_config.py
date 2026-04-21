from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class ModelProvider(str, Enum):
    OPENAI = "openai"
    DEEPSEEK = "deepseek"
    CLAUDE = "claude"
    ZHIPU = "zhipu"
    CUSTOM = "custom"


class ModelType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"


class ModelConfigBase(BaseModel):
    name: str
    provider: ModelProvider
    model_type: ModelType = ModelType.TEXT
    model_name: str
    base_url: str | None = None
    is_default: bool = False
    is_enabled: bool = True
    max_tokens: int = 4096
    temperature: float = 0.7
    enable_thinking: bool = False
    thinking_budget: int | None = None


class ModelConfigCreate(ModelConfigBase):
    api_key: str


class ModelConfigUpdate(ModelConfigBase):
    api_key: str | None = None


class ModelConfigRead(ModelConfigBase):
    id: str
    api_key_masked: str
    created_at: datetime
    updated_at: datetime


class ModelTestResult(BaseModel):
    success: bool
    latency_ms: int | None = None
    error: str | None = None
