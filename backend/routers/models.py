from fastapi import APIRouter, HTTPException

from models.model_config import ModelConfigCreate, ModelConfigRead, ModelConfigUpdate, ModelTestResult
from services import model_service

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/", response_model=list[ModelConfigRead])
def list_models():
    return model_service.list_models()


@router.post("/", response_model=ModelConfigRead, status_code=201)
def create_model(data: ModelConfigCreate):
    return model_service.create_model(data)


@router.get("/{model_id}", response_model=ModelConfigRead)
def get_model(model_id: str):
    m = model_service.get_model(model_id)
    if not m:
        raise HTTPException(404, "Model not found")
    return m


@router.put("/{model_id}", response_model=ModelConfigRead)
def update_model(model_id: str, data: ModelConfigUpdate):
    m = model_service.update_model(model_id, data)
    if not m:
        raise HTTPException(404, "Model not found")
    return m


@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: str):
    if not model_service.delete_model(model_id):
        raise HTTPException(404, "Model not found")


@router.post("/{model_id}/test", response_model=ModelTestResult)
async def test_model(model_id: str):
    return await model_service.test_model_connection(model_id)


@router.post("/{model_id}/set-default", status_code=204)
def set_default(model_id: str):
    if not model_service.set_default_model(model_id):
        raise HTTPException(404, "Model not found")
