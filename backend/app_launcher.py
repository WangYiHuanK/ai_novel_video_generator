"""
PyInstaller entry point for the packaged Windows application.
Starts uvicorn programmatically and opens the browser automatically.
"""
import multiprocessing
import sys
import threading
import time
import webbrowser
from pathlib import Path


def _open_browser():
    time.sleep(1.5)
    webbrowser.open("http://localhost:8000")


def main():
    multiprocessing.freeze_support()  # Required for PyInstaller + multiprocessing

    # Add the backend directory to sys.path so imports work when frozen
    if getattr(sys, "frozen", False):
        backend_dir = Path(sys._MEIPASS)
    else:
        backend_dir = Path(__file__).parent

    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    threading.Thread(target=_open_browser, daemon=True).start()

    import uvicorn
    uvicorn.run(
        "main:app",
        host="127.0.0.1",
        port=8000,
        log_level="warning",
        app_dir=str(backend_dir),
    )


if __name__ == "__main__":
    main()
