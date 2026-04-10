import os
import stat
from pathlib import Path
from cryptography.fernet import Fernet

from config import DATA_DIR

_KEY_FILE = DATA_DIR / "encryption.key"
_fernet: Fernet | None = None


def ensure_encryption_key() -> None:
    """Generate and persist Fernet key on first run."""
    global _fernet
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _KEY_FILE.exists():
        key = Fernet.generate_key()
        _KEY_FILE.write_bytes(key)
        os.chmod(_KEY_FILE, stat.S_IRUSR | stat.S_IWUSR)
    _fernet = Fernet(_KEY_FILE.read_bytes())


def _get_fernet() -> Fernet:
    if _fernet is None:
        ensure_encryption_key()
    return _fernet  # type: ignore[return-value]


def encrypt(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
