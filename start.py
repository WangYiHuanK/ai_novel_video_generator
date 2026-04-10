#!/usr/bin/env python3
"""Single entry point: starts backend + frontend concurrently.
Usage: python start.py
"""
import os
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"


def find_python():
    venv_python = ROOT / ".venv" / "bin" / "python"
    if venv_python.exists():
        return str(venv_python)
    return sys.executable


def find_npm():
    for candidate in ("npm", "npm.cmd"):
        result = subprocess.run(["which", candidate], capture_output=True, text=True)
        if result.returncode == 0:
            return candidate
    return "npm"


def main():
    python = find_python()
    npm = find_npm()

    print("Starting AI Novel Video Generator...")
    print(f"  Backend  → http://localhost:8000")
    print(f"  Frontend → http://localhost:5173")
    print("Press Ctrl+C to stop.\n")

    procs = []

    try:
        backend_proc = subprocess.Popen(
            [python, "-m", "uvicorn", "main:app", "--reload", "--port", "8000", "--app-dir", str(BACKEND)],
            cwd=BACKEND,
        )
        procs.append(backend_proc)

        frontend_proc = subprocess.Popen(
            [npm, "run", "dev"],
            cwd=FRONTEND,
        )
        procs.append(frontend_proc)

        # Wait for either process to exit
        while all(p.poll() is None for p in procs):
            pass

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()


if __name__ == "__main__":
    main()
