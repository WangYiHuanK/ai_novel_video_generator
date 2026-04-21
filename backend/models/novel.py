from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class NarrativeState(BaseModel):
    """Tracks protagonist's evolving state across chapters."""
    stats: str = ""        # 主角数值（等级、战力等）
    abilities: str = ""    # 获得的能力/技能
    items: str = ""        # 获得的道具/装备
    relations: str = ""    # 敌友关系
    other: str = ""        # 其他重要状态


class ChapterBase(BaseModel):
    title: str
    order: int
    summary: str | None = None


class ChapterCreate(ChapterBase):
    content: str = ""


class ChapterRead(ChapterBase):
    id: str
    word_count: int
    updated_at: datetime
    narrative_state: NarrativeState | None = None


class ChapterContent(ChapterRead):
    content: str


class ExportFormat(str, Enum):
    TXT = "txt"
    MD = "md"


class OutlineVersionRead(BaseModel):
    id: str
    project_id: str
    content: str
    source: str
    created_at: datetime
