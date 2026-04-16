import re
from datetime import datetime
from pathlib import Path

from config import PROJECTS_BASE_DIR
from models.novel import ChapterContent, ChapterCreate, ChapterRead, ExportFormat
from utils.file_utils import atomic_write_text, safe_path


def _chapters_dir(project_id: str) -> Path:
    return safe_path(PROJECTS_BASE_DIR, project_id, "chapters")


def _parse_chapter_file(path: Path) -> tuple[str, str, str, int]:
    """Returns (title, summary, content_body, word_count)."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    title = lines[0].lstrip("# ").strip() if lines else path.stem
    summary = ""
    body_start = 1

    # Check if line 1 is summary (starts with "> ")
    if len(lines) > 1 and lines[1].strip().startswith("> "):
        summary = lines[1].strip().lstrip("> ").strip()
        body_start = 2

    body = "\n".join(lines[body_start:]).strip() if len(lines) > body_start else ""
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    english = len(re.findall(r"[a-zA-Z]+", text))
    return title, summary, body, chinese + english


def _chapter_path(project_id: str, order: int) -> Path:
    return _chapters_dir(project_id) / f"chapter_{order}.md"


def list_chapters(project_id: str) -> list[ChapterRead]:
    d = _chapters_dir(project_id)
    if not d.exists():
        return []
    files = sorted(d.glob("chapter_*.md"), key=lambda p: int(p.stem.split("_")[1]))
    result = []
    for f in files:
        order = int(f.stem.split("_")[1])
        title, summary, _, word_count = _parse_chapter_file(f)
        result.append(
            ChapterRead(
                id=f.stem,
                title=title,
                order=order,
                summary=summary or None,
                word_count=word_count,
                updated_at=datetime.fromtimestamp(f.stat().st_mtime),
            )
        )
    return result


def get_chapter(project_id: str, chapter_id: str) -> ChapterContent | None:
    d = _chapters_dir(project_id)
    path = safe_path(d, f"{chapter_id}.md")
    if not path.exists():
        return None
    match = re.match(r"chapter_(\d+)", chapter_id)
    order = int(match.group(1)) if match else 0
    title, summary, body, word_count = _parse_chapter_file(path)
    return ChapterContent(
        id=chapter_id,
        title=title,
        order=order,
        summary=summary or None,
        content=body,
        word_count=word_count,
        updated_at=datetime.fromtimestamp(path.stat().st_mtime),
    )


def create_chapter(project_id: str, data: ChapterCreate) -> ChapterRead:
    d = _chapters_dir(project_id)
    d.mkdir(parents=True, exist_ok=True)
    path = _chapter_path(project_id, data.order)
    lines = [f"# {data.title}"]
    if data.summary:
        lines.append(f"> {data.summary}")
    lines.append("")
    lines.append(data.content)
    content = "\n".join(lines)
    atomic_write_text(path, content)
    return ChapterRead(
        id=path.stem,
        title=data.title,
        order=data.order,
        summary=data.summary,
        word_count=0,
        updated_at=datetime.utcnow(),
    )


def save_chapter(project_id: str, chapter_id: str, title: str, content: str) -> ChapterContent | None:
    d = _chapters_dir(project_id)
    path = safe_path(d, f"{chapter_id}.md")
    if not path.exists():
        return None

    # Preserve existing summary
    _, existing_summary, _, _ = _parse_chapter_file(path)

    lines = [f"# {title}"]
    if existing_summary:
        lines.append(f"> {existing_summary}")
    lines.append("")
    lines.append(content)
    full = "\n".join(lines)

    atomic_write_text(path, full)
    match = re.match(r"chapter_(\d+)", chapter_id)
    order = int(match.group(1)) if match else 0
    chinese = len(re.findall(r"[\u4e00-\u9fff]", content))
    english = len(re.findall(r"[a-zA-Z]+", content))
    return ChapterContent(
        id=chapter_id,
        title=title,
        order=order,
        summary=existing_summary or None,
        content=content,
        word_count=chinese + english,
        updated_at=datetime.utcnow(),
    )


def delete_chapter(project_id: str, chapter_id: str) -> bool:
    d = _chapters_dir(project_id)
    path = safe_path(d, f"{chapter_id}.md")
    if not path.exists():
        return False
    path.unlink()
    return True


def export_novel(project_id: str, fmt: ExportFormat) -> bytes:
    chapters = list_chapters(project_id)
    parts = []
    for ch in chapters:
        full = get_chapter(project_id, ch.id)
        if full is None:
            continue
        if fmt == ExportFormat.MD:
            lines = [f"# {full.title}"]
            if full.summary:
                lines.append(f"> {full.summary}")
            lines.append("")
            lines.append(full.content)
            parts.append("\n".join(lines))
        else:
            lines = [full.title]
            if full.summary:
                lines.append(f"概述：{full.summary}")
            lines.append("")
            lines.append(full.content)
            parts.append("\n".join(lines))
    separator = "\n\n---\n\n" if fmt == ExportFormat.MD else "\n\n\n"
    return separator.join(parts).encode("utf-8")


def get_outline(project_id: str) -> str:
    path = safe_path(PROJECTS_BASE_DIR, project_id, "outline.md")
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def save_outline(project_id: str, content: str) -> None:
    path = safe_path(PROJECTS_BASE_DIR, project_id, "outline.md")
    atomic_write_text(path, content)
