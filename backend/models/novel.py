from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class ChapterBase(BaseModel):
    title: str
    order: int


class ChapterCreate(ChapterBase):
    content: str = ""


class ChapterRead(ChapterBase):
    id: str
    word_count: int
    updated_at: datetime


class ChapterContent(ChapterRead):
    content: str


class ExportFormat(str, Enum):
    TXT = "txt"
    MD = "md"
