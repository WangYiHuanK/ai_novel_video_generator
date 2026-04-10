from datetime import datetime
from enum import Enum
from pydantic import BaseModel


class Genre(str, Enum):
    FANTASY = "fantasy"
    SCI_FI = "sci_fi"
    ROMANCE = "romance"
    MYSTERY = "mystery"
    THRILLER = "thriller"
    HISTORICAL = "historical"
    CONTEMPORARY = "contemporary"
    OTHER = "other"


class WritingStyle(str, Enum):
    LITERARY = "literary"
    COMMERCIAL = "commercial"
    EXPERIMENTAL = "experimental"
    CLASSIC = "classic"


class ProjectBase(BaseModel):
    name: str
    description: str = ""
    genre: Genre = Genre.OTHER
    style: WritingStyle = WritingStyle.COMMERCIAL
    language: str = "zh"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    word_count: int = 0
    chapter_count: int = 0
