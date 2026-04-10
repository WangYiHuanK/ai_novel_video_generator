import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings


def _get_data_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path(os.environ.get("APPDATA", Path.home())) / "AINovelVideoGenerator"
    else:
        base = Path(__file__).parent / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _get_projects_dir() -> Path:
    if getattr(sys, "frozen", False):
        base = Path.home() / "Documents" / "AI小说项目"
    else:
        base = Path(__file__).parent.parent / "projects"
    base.mkdir(parents=True, exist_ok=True)
    return base


BASE_DIR = Path(__file__).parent
DATA_DIR = _get_data_dir()
PROJECTS_BASE_DIR = _get_projects_dir()


class Settings(BaseSettings):
    app_name: str = "AI Novel Video Generator"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:8000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
