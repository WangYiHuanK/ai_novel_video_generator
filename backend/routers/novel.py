import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from db.database import get_session
from db.tables import OutlineVersion
from models.novel import ChapterContent, ChapterCreate, ChapterRead, ExportFormat, NarrativeState, OutlineVersionRead
from services import novel_service
from services.model_service import get_default_model_raw
from services.chat_service import _call_ai_sync
from utils.encryption import decrypt

router = APIRouter(prefix="/novel", tags=["novel"])

_DEFAULT_BASE_URL = "https://api.openai.com/v1"


class ChapterSaveRequest(BaseModel):
    title: str
    content: str


@router.get("/{project_id}/chapters", response_model=list[ChapterRead])
def list_chapters(project_id: str):
    return novel_service.list_chapters(project_id)


@router.post("/{project_id}/chapters", response_model=ChapterRead, status_code=201)
def create_chapter(project_id: str, data: ChapterCreate):
    return novel_service.create_chapter(project_id, data)


@router.get("/{project_id}/chapters/{chapter_id}", response_model=ChapterContent)
def get_chapter(project_id: str, chapter_id: str):
    ch = novel_service.get_chapter(project_id, chapter_id)
    if not ch:
        raise HTTPException(404, "Chapter not found")
    return ch


@router.put("/{project_id}/chapters/{chapter_id}", response_model=ChapterContent)
def save_chapter(project_id: str, chapter_id: str, data: ChapterSaveRequest):
    ch = novel_service.save_chapter(project_id, chapter_id, data.title, data.content)
    if not ch:
        raise HTTPException(404, "Chapter not found")
    return ch


@router.delete("/{project_id}/chapters/{chapter_id}", status_code=204)
def delete_chapter(project_id: str, chapter_id: str):
    if not novel_service.delete_chapter(project_id, chapter_id):
        raise HTTPException(404, "Chapter not found")


@router.post("/{project_id}/chapters/{chapter_id}/summarize", response_model=NarrativeState)
async def summarize_chapter(project_id: str, chapter_id: str):
    """Auto-summarize a chapter and extract narrative state (stats/abilities/items/relations)."""
    ch = novel_service.get_chapter(project_id, chapter_id)
    if not ch:
        raise HTTPException(404, "Chapter not found")
    if not ch.content.strip():
        raise HTTPException(400, "Chapter has no content to summarize")

    raw = get_default_model_raw()
    if not raw:
        raise HTTPException(503, "No model configured")

    prompt = f"""请分析以下小说章节，提取主角的状态变化，用简洁的中文填写各字段（没有变化的字段留空字符串）。

章节标题：{ch.title}
章节内容：
{ch.content[:3000]}

请以 JSON 格式返回，字段如下：
- stats: 主角当前数值（等级、境界、战力值等）
- abilities: 本章新获得或强化的能力/技能
- items: 本章新获得的道具/装备/资源
- relations: 本章新增或变化的敌友关系
- other: 其他重要状态变化（位置、任务、秘密等）

只返回 JSON，不要其他文字。"""

    result = await _call_ai_sync(raw, [
        {"role": "system", "content": "你是一个小说状态追踪助手，专门提取主角状态信息，只输出 JSON。"},
        {"role": "user", "content": prompt},
    ])

    # Parse JSON from result
    import json, re
    json_match = re.search(r"\{.*\}", result, re.DOTALL)
    if not json_match:
        raise HTTPException(500, f"Failed to parse AI response: {result[:200]}")

    try:
        data = json.loads(json_match.group())
        ns = NarrativeState(
            stats=str(data.get("stats", "")),
            abilities=str(data.get("abilities", "")),
            items=str(data.get("items", "")),
            relations=str(data.get("relations", "")),
            other=str(data.get("other", "")),
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to parse narrative state: {e}")

    novel_service.save_narrative_state(project_id, chapter_id, ns)
    return ns


@router.get("/{project_id}/chapters/{chapter_id}/narrative-context")
def get_narrative_context(project_id: str, chapter_id: str):
    """Get narrative context from all chapters before this one."""
    ch = novel_service.get_chapter(project_id, chapter_id)
    if not ch:
        raise HTTPException(404, "Chapter not found")
    context = novel_service.get_previous_narrative_context(project_id, ch.order)
    return {"context": context}


@router.get("/{project_id}/export")
def export_novel(project_id: str, format: ExportFormat = Query(ExportFormat.MD)):
    content = novel_service.export_novel(project_id, format)
    ext = format.value
    mime = "text/markdown" if format == ExportFormat.MD else "text/plain"
    return Response(
        content=content,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="novel_{project_id}.{ext}"'},
    )


@router.get("/{project_id}/outline")
def get_outline(project_id: str):
    return {"content": novel_service.get_outline(project_id)}


@router.put("/{project_id}/outline", status_code=204)
def save_outline(project_id: str, body: dict, session: Session = Depends(get_session)):
    content = body.get("content", "")
    novel_service.save_outline(project_id, content)
    session.add(OutlineVersion(
        id=str(uuid.uuid4()),
        project_id=project_id,
        content=content,
        source="manual",
        created_at=datetime.utcnow(),
    ))
    session.commit()


@router.get("/{project_id}/outline/versions", response_model=list[OutlineVersionRead])
def list_outline_versions(project_id: str, session: Session = Depends(get_session)):
    versions = session.exec(
        select(OutlineVersion)
        .where(OutlineVersion.project_id == project_id)
        .order_by(OutlineVersion.created_at.desc())  # type: ignore[attr-defined]
    ).all()
    return list(versions)


class SaveVersionRequest(BaseModel):
    content: str
    source: str = "auto"


@router.post("/{project_id}/outline/versions", response_model=OutlineVersionRead, status_code=201)
def create_outline_version(project_id: str, body: SaveVersionRequest, session: Session = Depends(get_session)):
    v = OutlineVersion(
        id=str(uuid.uuid4()),
        project_id=project_id,
        content=body.content,
        source=body.source,
        created_at=datetime.utcnow(),
    )
    session.add(v)
    session.commit()
    session.refresh(v)
    return v


@router.delete("/{project_id}/outline/versions/{version_id}", status_code=204)
def delete_outline_version(project_id: str, version_id: str, session: Session = Depends(get_session)):
    v = session.get(OutlineVersion, version_id)
    if not v or v.project_id != project_id:
        raise HTTPException(404, "Version not found")
    session.delete(v)
    session.commit()
