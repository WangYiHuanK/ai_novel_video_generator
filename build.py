#!/usr/bin/env python3
"""
Build script: npm build → PyInstaller → dist/AINovelVideoGenerator/
Run from project root: python build.py
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parent
FRONTEND = ROOT / "frontend"
FRONTEND_DIST = FRONTEND / "dist"
DIST = ROOT / "dist"


def run(cmd, cwd=None):
    print(f"\n>>> {' '.join(str(c) for c in cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"[ERROR] Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)


def main():
    print("=" * 50)
    print("  AI Novel Video Generator — Build")
    print("=" * 50)

    # Step 1: Build frontend
    print("\n[1/2] Building frontend...")
    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    run([npm, "install"], cwd=FRONTEND)
    run([npm, "run", "build"], cwd=FRONTEND)

    if not FRONTEND_DIST.exists():
        print(f"[ERROR] Frontend dist not found at {FRONTEND_DIST}")
        sys.exit(1)
    print(f"  Frontend built → {FRONTEND_DIST}")

    # Step 2: PyInstaller
    print("\n[2/2] Packaging with PyInstaller...")
    pyinstaller = shutil.which("pyinstaller")
    if not pyinstaller:
        # Try venv location
        venv_pi = ROOT / ".venv" / "Scripts" / "pyinstaller.exe"
        if venv_pi.exists():
            pyinstaller = str(venv_pi)
        else:
            print("[ERROR] pyinstaller not found. Run: pip install pyinstaller")
            sys.exit(1)

    run([pyinstaller, "app.spec", "--clean"], cwd=ROOT)

    output = DIST / "AINovelVideoGenerator"
    if output.exists():
        print(f"\n{'='*50}")
        print(f"  Build complete!")
        print(f"  Output: {output}")
        print(f"  Executable: {output / 'AINovelVideoGenerator.exe'}")
        print(f"{'='*50}")
    else:
        print(f"[ERROR] Expected output not found at {output}")
        sys.exit(1)


if __name__ == "__main__":
    main()
