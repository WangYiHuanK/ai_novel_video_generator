import os
from pathlib import Path


def safe_path(base: Path, *parts: str) -> Path:
    """Resolve path under base, raising ValueError on traversal attempts."""
    resolved = (base / Path(*parts)).resolve()
    if not str(resolved).startswith(str(base.resolve())):
        raise ValueError(f"Path traversal detected: {parts}")
    return resolved


def atomic_write_text(path: Path, content: str) -> None:
    """Write text to path atomically via a temp file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    os.replace(tmp, path)


def atomic_write_bytes(path: Path, content: bytes) -> None:
    """Write bytes to path atomically via a temp file."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(content)
    os.replace(tmp, path)
