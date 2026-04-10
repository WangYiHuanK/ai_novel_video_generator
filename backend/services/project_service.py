import json
import shutil
import uuid
from datetime import datetime

from sqlmodel import Session, select

from config import PROJECTS_BASE_DIR
from db.tables import Project
from models.project import ProjectCreate, ProjectRead, ProjectUpdate
from utils.file_utils import atomic_write_text, safe_path


def _count_words(text: str) -> int:
    """Count words/characters for both Chinese and English text."""
    import re
    chinese = len(re.findall(r"[\u4e00-\u9fff]", text))
    english = len(re.findall(r"[a-zA-Z]+", text))
    return chinese + english


def _project_dir(project_id: str):
    return safe_path(PROJECTS_BASE_DIR, project_id)


def _create_filesystem(project_id: str, name: str) -> None:
    base = _project_dir(project_id)
    (base / "chapters").mkdir(parents=True, exist_ok=True)
    (base / "generated" / "images").mkdir(parents=True, exist_ok=True)
    (base / "generated" / "videos").mkdir(parents=True, exist_ok=True)
    (base / "outline.md").write_text(f"# {name} - 故事大纲\n\n", encoding="utf-8")
    (base / "characters.json").write_text("[]", encoding="utf-8")
    (base / "generated" / "scenes.json").write_text("[]", encoding="utf-8")


def _compute_stats(project_id: str) -> tuple[int, int]:
    chapters_dir = _project_dir(project_id) / "chapters"
    if not chapters_dir.exists():
        return 0, 0
    files = sorted(chapters_dir.glob("chapter_*.md"))
    total_words = sum(_count_words(f.read_text(encoding="utf-8")) for f in files)
    return total_words, len(files)


def _row_to_read(row: Project) -> ProjectRead:
    word_count, chapter_count = _compute_stats(row.id)
    return ProjectRead(
        id=row.id,
        name=row.name,
        description=row.description,
        genre=row.genre,  # type: ignore[arg-type]
        style=row.style,  # type: ignore[arg-type]
        language=row.language,
        created_at=row.created_at,
        updated_at=row.updated_at,
        word_count=word_count,
        chapter_count=chapter_count,
    )


def list_projects(session: Session) -> list[ProjectRead]:
    rows = session.exec(select(Project).order_by(Project.updated_at.desc())).all()  # type: ignore[attr-defined]
    return [_row_to_read(r) for r in rows]


def get_project(session: Session, project_id: str) -> ProjectRead | None:
    row = session.get(Project, project_id)
    return _row_to_read(row) if row else None


def create_project(session: Session, data: ProjectCreate) -> ProjectRead:
    now = datetime.utcnow()
    row = Project(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        genre=data.genre.value,
        style=data.style.value,
        language=data.language,
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    # Write project.json to filesystem
    _create_filesystem(row.id, row.name)
    project_json = {
        "id": row.id,
        "name": row.name,
        "description": row.description,
        "genre": row.genre,
        "style": row.style,
        "language": row.language,
        "created_at": row.created_at.isoformat(),
        "updated_at": row.updated_at.isoformat(),
    }
    atomic_write_text(
        _project_dir(row.id) / "project.json",
        json.dumps(project_json, ensure_ascii=False, indent=2),
    )
    return _row_to_read(row)


def update_project(session: Session, project_id: str, data: ProjectUpdate) -> ProjectRead | None:
    row = session.get(Project, project_id)
    if not row:
        return None
    row.name = data.name
    row.description = data.description
    row.genre = data.genre.value
    row.style = data.style.value
    row.language = data.language
    row.updated_at = datetime.utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    return _row_to_read(row)


def delete_project(session: Session, project_id: str) -> bool:
    row = session.get(Project, project_id)
    if not row:
        return False
    session.delete(row)
    session.commit()
    project_dir = _project_dir(project_id)
    if project_dir.exists():
        shutil.rmtree(project_dir)
    return True
