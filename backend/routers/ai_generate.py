"""API endpoints for LangChain-powered novel generation."""
import json
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from services.langchain_service import ChapterGenerationChain, OutlineGenerationChain
from services.novel_service import save_outline, create_chapter, save_chapter

router = APIRouter(prefix="/ai-generate", tags=["ai-generate"])


class OutlineGenerateRequest(BaseModel):
    """Request for generating or updating outline."""
    user_request: str
    model_id: Optional[str] = None


class ChapterGenerateRequest(BaseModel):
    """Request for generating a new chapter."""
    chapter_order: int
    chapter_title: str
    chapter_summary: Optional[str] = None
    user_request: Optional[str] = "按照大纲创作这一章节"
    model_id: Optional[str] = None


class ChapterContinueRequest(BaseModel):
    """Request for continuing an existing chapter."""
    chapter_id: str
    current_content: str
    user_request: Optional[str] = "继续写下去"
    model_id: Optional[str] = None


class ChapterExpandRequest(BaseModel):
    """Request for expanding a section."""
    chapter_order: int
    section_description: str
    user_request: str
    model_id: Optional[str] = None


@router.post("/{project_id}/outline")
async def generate_outline(project_id: str, request: OutlineGenerateRequest):
    """Generate or update outline with AI assistance and memory."""
    try:
        chain = OutlineGenerationChain(project_id, model_id=request.model_id)
        outline_content = await chain.generate(request.user_request)

        # Save the generated outline
        save_outline(project_id, outline_content)

        return {
            "success": True,
            "content": outline_content,
            "message": "大纲已生成并保存"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成大纲失败: {str(e)}")


@router.post("/{project_id}/chapter")
async def generate_chapter(project_id: str, request: ChapterGenerateRequest):
    """Generate a new chapter with full context awareness."""
    try:
        chain = ChapterGenerationChain(project_id, model_id=request.model_id)
        chapter_content = await chain.generate(
            chapter_order=request.chapter_order,
            chapter_title=request.chapter_title,
            chapter_summary=request.chapter_summary,
            user_request=request.user_request
        )

        # Create the chapter
        from models.novel import ChapterCreate
        chapter_data = ChapterCreate(
            title=request.chapter_title,
            order=request.chapter_order,
            summary=request.chapter_summary,
            content=chapter_content
        )
        created_chapter = create_chapter(project_id, chapter_data)

        return {
            "success": True,
            "chapter": created_chapter,
            "content": chapter_content,
            "message": f"第 {request.chapter_order} 章已生成"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"生成章节失败: {str(e)}")


@router.post("/{project_id}/chapter/continue")
async def continue_chapter(project_id: str, request: ChapterContinueRequest):
    """Continue writing an existing chapter."""
    try:
        # Extract chapter order from chapter_id (format: chapter_N)
        import re
        match = re.match(r"chapter_(\d+)", request.chapter_id)
        if not match:
            raise HTTPException(status_code=400, detail="Invalid chapter_id format")

        chapter_order = int(match.group(1))

        chain = ChapterGenerationChain(project_id, model_id=request.model_id)
        continuation = await chain.continue_chapter(
            chapter_order=chapter_order,
            current_content=request.current_content,
            user_request=request.user_request
        )

        return {
            "success": True,
            "content": continuation,
            "message": "章节续写完成"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"续写章节失败: {str(e)}")


@router.post("/{project_id}/chapter/expand")
async def expand_section(project_id: str, request: ChapterExpandRequest):
    """Expand a specific section based on the outline."""
    try:
        chain = ChapterGenerationChain(project_id, model_id=request.model_id)
        expanded_content = await chain.expand_section(
            chapter_order=request.chapter_order,
            section_description=request.section_description,
            user_request=request.user_request
        )

        return {
            "success": True,
            "content": expanded_content,
            "message": "章节部分已扩写"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扩写失败: {str(e)}")


@router.delete("/{project_id}/memory/outline")
def clear_outline_memory(project_id: str):
    """Clear outline generation memory."""
    try:
        chain = OutlineGenerationChain(project_id)
        chain.clear_memory()
        return {"success": True, "message": "大纲对话记忆已清除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除记忆失败: {str(e)}")


@router.delete("/{project_id}/memory/chapter")
def clear_chapter_memory(project_id: str):
    """Clear chapter generation memory."""
    try:
        chain = ChapterGenerationChain(project_id)
        chain.clear_memory()
        return {"success": True, "message": "章节对话记忆已清除"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清除记忆失败: {str(e)}")


class BatchGenerateRequest(BaseModel):
    min_words: int = 3000
    model_id: Optional[str] = None
    skip_done: int = 0


@router.post("/{project_id}/batch-generate")
async def batch_generate_chapters(project_id: str, request: BatchGenerateRequest):
    """Agent that generates all chapters sequentially, continuing until min_words is reached."""
    from services.novel_service import list_chapters, get_chapter, save_chapter as svc_save_chapter

    async def event_stream():
        def send(event: str, data: dict) -> str:
            return f"data: {json.dumps({'event': event, **data}, ensure_ascii=False)}\n\n"

        chapters = list_chapters(project_id)
        if not chapters:
            yield send("error", {"message": "没有章节，请先创建章节"})
            return

        # Skip already done chapters
        chapters_to_process = chapters[request.skip_done:]
        yield send("start", {"total": len(chapters), "message": f"从第 {request.skip_done + 1} 章开始，共 {len(chapters_to_process)} 章待生成"})

        chain = ChapterGenerationChain(project_id, model_id=request.model_id)

        for i, ch in enumerate(chapters_to_process):
            # Check if chapter already meets word count requirement
            existing = get_chapter(project_id, ch.id)
            if existing and existing.word_count >= request.min_words:
                yield send("chapter_done", {
                    "index": i,
                    "chapter_id": ch.id,
                    "words": existing.word_count,
                    "message": f"第 {ch.order} 章已有 {existing.word_count} 字，跳过"
                })
                continue

            yield send("chapter_start", {
                "index": i,
                "chapter_id": ch.id,
                "title": ch.title,
                "message": f"正在生成第 {ch.order} 章：{ch.title}"
            })

            try:
                # Generate initial content
                content = await chain.generate(
                    chapter_order=ch.order,
                    chapter_title=ch.title,
                    chapter_summary=ch.summary,
                    user_request="根据大纲和前文，创作这一章节，保持连贯性，内容丰富详细"
                )

                # Count words
                def count_words(text: str) -> int:
                    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
                    english = len(re.findall(r"[a-zA-Z]+", text))
                    return chinese + english

                words = count_words(content)
                yield send("chapter_progress", {
                    "index": i,
                    "chapter_id": ch.id,
                    "words": words,
                    "message": f"已生成 {words} 字，目标 {request.min_words} 字"
                })

                # Continue until min_words reached
                retry = 0
                while words < request.min_words and retry < 3:
                    retry += 1
                    yield send("chapter_continue", {
                        "index": i,
                        "chapter_id": ch.id,
                        "words": words,
                        "message": f"字数不足，续写中（{words}/{request.min_words}字）..."
                    })
                    continuation = await chain.continue_chapter(
                        chapter_order=ch.order,
                        current_content=content,
                        user_request=f"继续写下去，保持连贯，当前已有{words}字，需要达到{request.min_words}字"
                    )
                    content = content + "\n\n" + continuation
                    words = count_words(content)

                # Save chapter
                svc_save_chapter(project_id, ch.id, ch.title, content)

                yield send("chapter_done", {
                    "index": i,
                    "chapter_id": ch.id,
                    "words": words,
                    "message": f"第 {ch.order} 章完成，共 {words} 字"
                })

            except Exception as e:
                yield send("chapter_error", {
                    "index": i,
                    "chapter_id": ch.id,
                    "message": f"第 {ch.order} 章生成失败: {str(e)}"
                })

        yield send("done", {"message": f"全部 {len(chapters)} 章生成完成！"})

    return StreamingResponse(event_stream(), media_type="text/event-stream")
