import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from config import DATA_DIR, PROJECTS_BASE_DIR, settings
from db.database import create_db_and_tables
from utils.encryption import ensure_encryption_key
from routers import models, projects, chat, novel, ai_generate

app = FastAPI(title=settings.app_name, debug=settings.debug)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(models.router, prefix="/api")
app.include_router(projects.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(novel.router, prefix="/api")
app.include_router(ai_generate.router, prefix="/api")

# Serve built frontend in production
if getattr(sys, "frozen", False):
    _frontend_dist = Path(sys._MEIPASS) / "frontend" / "dist"
else:
    _frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"

if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=_frontend_dist, html=True), name="frontend")


@app.on_event("startup")
def on_startup():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_BASE_DIR.mkdir(parents=True, exist_ok=True)
    ensure_encryption_key()
    create_db_and_tables()


@app.get("/api/health")
def health():
    return {"status": "ok"}
