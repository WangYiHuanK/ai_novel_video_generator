from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from db.database import get_session
from models.project import ProjectCreate, ProjectRead, ProjectUpdate
from services import project_service

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("/", response_model=list[ProjectRead])
def list_projects(session: Session = Depends(get_session)):
    return project_service.list_projects(session)


@router.post("/", response_model=ProjectRead, status_code=201)
def create_project(data: ProjectCreate, session: Session = Depends(get_session)):
    return project_service.create_project(session, data)


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, session: Session = Depends(get_session)):
    p = project_service.get_project(session, project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.put("/{project_id}", response_model=ProjectRead)
def update_project(project_id: str, data: ProjectUpdate, session: Session = Depends(get_session)):
    p = project_service.update_project(session, project_id, data)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, session: Session = Depends(get_session)):
    if not project_service.delete_project(session, project_id):
        raise HTTPException(404, "Project not found")
