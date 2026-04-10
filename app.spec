# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for AI Novel Video Generator.
Build command: pyinstaller app.spec --clean
Output: dist/AINovelVideoGenerator/AINovelVideoGenerator.exe
"""
import sys
from pathlib import Path

ROOT = Path(SPECPATH)
BACKEND = ROOT / "backend"
FRONTEND_DIST = ROOT / "frontend" / "dist"

a = Analysis(
    [str(BACKEND / "app_launcher.py")],
    pathex=[str(BACKEND)],
    binaries=[],
    datas=[
        # Bundle built frontend into the package
        (str(FRONTEND_DIST), "frontend/dist"),
    ],
    hiddenimports=[
        # uvicorn internals not auto-detected
        "uvicorn.lifespan.off",
        "uvicorn.lifespan.on",
        "uvicorn.loops.auto",
        "uvicorn.loops.asyncio",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.websockets.auto",
        # async SQLite
        "aiosqlite",
        # SQLAlchemy dialect
        "sqlalchemy.dialects.sqlite",
        "sqlalchemy.dialects.sqlite.aiosqlite",
        # email (used by httpx/openai internally)
        "email.mime.text",
        "email.mime.multipart",
        "email.mime.base",
        # pydantic / pydantic-settings
        "pydantic_settings",
        # cryptography
        "cryptography.fernet",
        "cryptography.hazmat.primitives.kdf.pbkdf2",
        # openai
        "openai",
        "httpx",
        # multipart
        "python_multipart",
        "multipart",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="AINovelVideoGenerator",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,           # No console window for end users
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,               # Add icon path here if you have one: "assets/icon.ico"
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="AINovelVideoGenerator",
)
