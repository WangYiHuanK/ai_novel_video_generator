#!/usr/bin/env python3
"""Startup script — run from project root: python run.py"""
import subprocess
import sys
from pathlib import Path

backend_dir = Path(__file__).parent / "backend"

subprocess.run(
    [
        sys.executable, "-m", "uvicorn", "main:app",
        "--reload", "--port", "8000",
        "--app-dir", str(backend_dir),
    ],
    cwd=backend_dir,
)
