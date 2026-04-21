import json
import re
from datetime import datetime
from pathlib import Path

from config import PROJECTS_BASE_DIR
from models.novel import ChapterContent, ChapterCreate, ChapterRead, ExportFormat, NarrativeState
from utils.file_utils import atomic_write_text, safe_path

_NARRATIVE_RE = re.compile(r"<!--narrative_state:(.*?)-->", re.DOTALL)


def _chapters_dir(project_id: str) -> Path:
    return safe_path(PROJECTS_BASE_DIR, project_id, "chapters")


def _parse_chapter_file(path: Path) -> tuple[str, str, str, int, NarrativeState | None]:
    """Returns (title, summary, content_body, word_count, narrative_state)."""
    text = path.read_text(encoding="utf-8")

    # Extract and strip narrative_state comment before processing
    narrative_state: NarrativeState | None = None
    ns_match = _NARRATIVE_RE.search(text)
    if ns_match:
        try:
            narrative_state = NarrativeState(**json.loads(ns_match.group(1).strip()))
        except Exception:
            pass
        text = _NARRATIVE_RE.sub("", text).strip()

    lines = text.split("\n")
    title = lines[0].lstrip("# ").strip() if lines else path.stem
    summary = ""
    body_start = 1

    if len(lines) > 1 and lines[1].strip().startswith("> "):
        summary = lines[1].strip().lstrip("> ").strip()
        body_start = 2

    body = "\n".join(lines[body_start:]).strip() if len(lines) > body_start else ""
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    english = len(re.findall(r"[a-zA-Z]+", text))
    return title, summary, body, chinese + english, narrative_state


def _write_chapter_file(path: Path, title: str, summary: str, content: str, narrative_state: NarrativeState | None) -> None:
    lines = [f"# {title}"]
    if summary:
        lines.append(f"> {summary}")
    lines.append("")
    lines.append(content)
    if narrative_state:
        ns_json = json.dumps(narrative_state.model_dump(), ensure_ascii=False)
        lines.append(f"\n<!--narrative_state:{ns_json}-->")
    atomic_write_text(path, "\n".join(lines))


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
        title, summary, _, word_count, narrative_state = _parse_chapter_file(f)
        result.append(
            ChapterRead(
                id=f.stem,
                title=title,
                order=order,
                summary=summary or None,
                word_count=word_count,
                updated_at=datetime.fromtimestamp(f.stat().st_mtime),
                narrative_state=narrative_state,
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
    title, summary, body, word_count, narrative_state = _parse_chapter_file(path)
    return ChapterContent(
        id=chapter_id,
        title=title,
        order=order,
        summary=summary or None,
        content=body,
        word_count=word_count,
        updated_at=datetime.fromtimestamp(path.stat().st_mtime),
        narrative_state=narrative_state,
    )


def create_chapter(project_id: str, data: ChapterCreate) -> ChapterRead:
    d = _chapters_dir(project_id)
    d.mkdir(parents=True, exist_ok=True)
    path = _chapter_path(project_id, data.order)
    _write_chapter_file(path, data.title, data.summary or "", data.content, None)
    return ChapterRead(
        id=path.stem,
        title=data.title,
        order=data.order,
        summary=data.summary,
        word_count=0,
        updated_at=datetime.utcnow(),
        narrative_state=None,
    )


def save_chapter(project_id: str, chapter_id: str, title: str, content: str, summary: str | None = None) -> ChapterContent | None:
    d = _chapters_dir(project_id)
    path = safe_path(d, f"{chapter_id}.md")
    if not path.exists():
        return None

    _, existing_summary, _, _, existing_ns = _parse_chapter_file(path)
    final_summary = summary if summary is not None else existing_summary
    _write_chapter_file(path, title, final_summary, content, existing_ns)

    match = re.match(r"chapter_(\d+)", chapter_id)
    order = int(match.group(1)) if match else 0
    chinese = len(re.findall(r"[\u4e00-\u9fff]", content))
    english = len(re.findall(r"[a-zA-Z]+", content))
    return ChapterContent(
        id=chapter_id,
        title=title,
        order=order,
        summary=final_summary or None,
        content=content,
        word_count=chinese + english,
        updated_at=datetime.utcnow(),
        narrative_state=existing_ns,
    )


def save_narrative_state(project_id: str, chapter_id: str, narrative_state: NarrativeState) -> bool:
    """Update only the narrative_state of a chapter, preserving everything else."""
    d = _chapters_dir(project_id)
    path = safe_path(d, f"{chapter_id}.md")
    if not path.exists():
        return False
    title, summary, body, _, _ = _parse_chapter_file(path)
    _write_chapter_file(path, title, summary, body, narrative_state)
    return True


def get_previous_narrative_context(project_id: str, before_order: int) -> str:
    """Build a context string from all chapters before `before_order`."""
    chapters = list_chapters(project_id)
    prev = [c for c in chapters if c.order < before_order and c.narrative_state]
    if not prev:
        return ""

    lines = ["【前情提要 — 主角状态追踪】"]
    for ch in prev:
        ns = ch.narrative_state
        lines.append(f"\n{ch.title}：")
        if ns.stats:
            lines.append(f"  数值：{ns.stats}")
        if ns.abilities:
            lines.append(f"  能力：{ns.abilities}")
        if ns.items:
            lines.append(f"  道具：{ns.items}")
        if ns.relations:
            lines.append(f"  关系：{ns.relations}")
        if ns.other:
            lines.append(f"  其他：{ns.other}")
    return "\n".join(lines)


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
