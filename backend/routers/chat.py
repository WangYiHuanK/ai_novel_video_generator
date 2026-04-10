from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from db.database import get_session
from models.chat import ChatMessage, MessageRole, SendMessageRequest
from services import chat_service

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/{project_id}/history", response_model=list[ChatMessage])
def get_history(project_id: str, session: Session = Depends(get_session)):
    rows = chat_service.get_history(session, project_id)
    return [
        ChatMessage(id=r.id, role=MessageRole(r.role), content=r.content, created_at=r.created_at)
        for r in rows
    ]


@router.post("/{project_id}/send")
async def send_message(
    project_id: str,
    request: SendMessageRequest,
    session: Session = Depends(get_session),
):
    return StreamingResponse(
        chat_service.stream_chat(session, project_id, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{project_id}/history", status_code=204)
def clear_history(project_id: str, session: Session = Depends(get_session)):
    chat_service.clear_history(session, project_id)


@router.get("/{project_id}/export")
def export_history(project_id: str, session: Session = Depends(get_session)):
    rows = chat_service.get_history(session, project_id)
    lines = []
    for r in rows:
        role_label = "用户" if r.role == "user" else "AI"
        lines.append(f"**{role_label}**\n\n{r.content}\n")
    content = "\n---\n\n".join(lines)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="dialogue_{project_id}.md"'},
    )
