import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from config import DATA_DIR
from models.model_config import (
    ModelConfigCreate,
    ModelConfigRead,
    ModelConfigUpdate,
    ModelTestResult,
)
from utils.encryption import decrypt, encrypt
from utils.file_utils import atomic_write_text

_CONFIG_FILE = DATA_DIR / "models_config.json"


def _load() -> list[dict]:
    if not _CONFIG_FILE.exists():
        return []
    return json.loads(_CONFIG_FILE.read_text(encoding="utf-8"))


def _save(configs: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write_text(_CONFIG_FILE, json.dumps(configs, ensure_ascii=False, indent=2))


def _mask_key(key: str) -> str:
    if len(key) <= 4:
        return "****"
    return f"****{key[-4:]}"


def _to_read(raw: dict) -> ModelConfigRead:
    masked = _mask_key(decrypt(raw["api_key"]))
    return ModelConfigRead(
        id=raw["id"],
        name=raw["name"],
        provider=raw["provider"],
        model_type=raw.get("model_type", "text"),
        model_name=raw["model_name"],
        base_url=raw.get("base_url"),
        is_default=raw.get("is_default", False),
        is_enabled=raw.get("is_enabled", True),
        max_tokens=raw.get("max_tokens", 4096),
        temperature=raw.get("temperature", 0.7),
        api_key_masked=masked,
        created_at=datetime.fromisoformat(raw["created_at"]),
        updated_at=datetime.fromisoformat(raw["updated_at"]),
    )


def list_models() -> list[ModelConfigRead]:
    return [_to_read(r) for r in _load()]


def get_model_raw(model_id: str) -> dict | None:
    for r in _load():
        if r["id"] == model_id:
            return r
    return None


def get_model(model_id: str) -> ModelConfigRead | None:
    raw = get_model_raw(model_id)
    return _to_read(raw) if raw else None


def get_default_model_raw() -> dict | None:
    configs = _load()
    for r in configs:
        if r.get("is_default") and r.get("is_enabled", True):
            return r
    # fallback: first enabled text model
    for r in configs:
        if r.get("is_enabled", True) and r.get("model_type", "text") == "text":
            return r
    return None


def create_model(data: ModelConfigCreate) -> ModelConfigRead:
    configs = _load()
    now = datetime.utcnow().isoformat()
    raw: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "name": data.name,
        "provider": data.provider.value,
        "model_type": data.model_type.value,
        "model_name": data.model_name,
        "base_url": data.base_url,
        "is_default": data.is_default,
        "is_enabled": data.is_enabled,
        "max_tokens": data.max_tokens,
        "temperature": data.temperature,
        "api_key": encrypt(data.api_key),
        "created_at": now,
        "updated_at": now,
    }
    if data.is_default:
        for c in configs:
            c["is_default"] = False
    configs.append(raw)
    _save(configs)
    return _to_read(raw)


def update_model(model_id: str, data: ModelConfigUpdate) -> ModelConfigRead | None:
    configs = _load()
    for i, raw in enumerate(configs):
        if raw["id"] == model_id:
            raw.update(
                {
                    "name": data.name,
                    "provider": data.provider.value,
                    "model_type": data.model_type.value,
                    "model_name": data.model_name,
                    "base_url": data.base_url,
                    "is_default": data.is_default,
                    "is_enabled": data.is_enabled,
                    "max_tokens": data.max_tokens,
                    "temperature": data.temperature,
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
            if data.api_key is not None:
                raw["api_key"] = encrypt(data.api_key)
            if data.is_default:
                for j, c in enumerate(configs):
                    if j != i:
                        c["is_default"] = False
            configs[i] = raw
            _save(configs)
            return _to_read(raw)
    return None


def delete_model(model_id: str) -> bool:
    configs = _load()
    new_configs = [c for c in configs if c["id"] != model_id]
    if len(new_configs) == len(configs):
        return False
    _save(new_configs)
    return True


def set_default_model(model_id: str) -> bool:
    configs = _load()
    found = False
    for raw in configs:
        if raw["id"] == model_id:
            raw["is_default"] = True
            found = True
        else:
            raw["is_default"] = False
    if found:
        _save(configs)
    return found


async def test_model_connection(model_id: str) -> ModelTestResult:
    import time
    from openai import AsyncOpenAI

    raw = get_model_raw(model_id)
    if raw is None:
        return ModelTestResult(success=False, error="Model not found")
    try:
        api_key = decrypt(raw["api_key"])
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=raw.get("base_url") or None,
        )
        start = time.monotonic()
        await client.chat.completions.create(
            model=raw["model_name"],
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
        )
        latency = int((time.monotonic() - start) * 1000)
        return ModelTestResult(success=True, latency_ms=latency)
    except Exception as e:
        return ModelTestResult(success=False, error=str(e))
