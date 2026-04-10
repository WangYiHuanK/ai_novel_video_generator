from datetime import datetime
from sqlmodel import SQLModel, Field


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    description: str = ""
    genre: str = "other"
    style: str = "commercial"
    language: str = "zh"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ConversationMessage(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(index=True)
    role: str
    content: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
