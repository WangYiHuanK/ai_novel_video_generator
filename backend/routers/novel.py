from fastapi import APIRouter, HTTPException, Query, Response
from pydantic import BaseModel

from models.novel import ChapterContent, ChapterCreate, ChapterRead, ExportFormat
from services import novel_service

router = APIRouter(prefix="/novel", tags=["novel"])


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
def save_outline(project_id: str, body: dict):
    novel_service.save_outline(project_id, body.get("content", ""))
