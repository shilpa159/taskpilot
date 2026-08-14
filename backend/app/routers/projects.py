from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, select

from app.database import get_db
from app import models, schemas
from app.deps import get_current_user, get_project_for_member

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(
    payload: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = models.Project(name=payload.name.strip(), description=payload.description, owner_id=user.id)
    db.add(project)
    db.flush()
    db.add(models.ProjectMember(project_id=project.id, user_id=user.id, role="owner"))
    db.commit()
    db.refresh(project)
    out = schemas.ProjectOut.model_validate(project)
    out.task_count = 0
    return out


@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    member_project_ids = select(models.ProjectMember.project_id).where(
        models.ProjectMember.user_id == user.id
    )
    projects = (
        db.query(models.Project)
        .filter(models.Project.id.in_(member_project_ids))
        .order_by(models.Project.created_at.desc())
        .all()
    )
    results = []
    for p in projects:
        count = db.query(func.count(models.Task.id)).filter(models.Task.project_id == p.id).scalar()
        out = schemas.ProjectOut.model_validate(p)
        out.task_count = count or 0
        results.append(out)
    return results


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    project = get_project_for_member(project_id, db, user)
    count = db.query(func.count(models.Task.id)).filter(models.Task.project_id == project.id).scalar()
    out = schemas.ProjectOut.model_validate(project)
    out.task_count = count or 0
    return out


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(
    project_id: int,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = get_project_for_member(project_id, db, user)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can edit project details")
    if payload.name is not None:
        project.name = payload.name.strip()
    if payload.description is not None:
        project.description = payload.description
    db.commit()
    db.refresh(project)
    count = db.query(func.count(models.Task.id)).filter(models.Task.project_id == project.id).scalar()
    out = schemas.ProjectOut.model_validate(project)
    out.task_count = count or 0
    return out


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    project = get_project_for_member(project_id, db, user)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can delete this project")
    db.delete(project)
    db.commit()
    return None


@router.get("/{project_id}/members", response_model=list[schemas.MemberOut])
def list_members(project_id: int, db: Session = Depends(get_db), user: models.User = Depends(get_current_user)):
    get_project_for_member(project_id, db, user)
    rows = (
        db.query(models.ProjectMember, models.User)
        .join(models.User, models.User.id == models.ProjectMember.user_id)
        .filter(models.ProjectMember.project_id == project_id)
        .all()
    )
    return [
        schemas.MemberOut(id=m.id, user_id=u.id, name=u.name, email=u.email, role=m.role)
        for m, u in rows
    ]


@router.post("/{project_id}/members", response_model=schemas.MemberOut, status_code=201)
def add_member(
    project_id: int,
    payload: schemas.MemberAdd,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = get_project_for_member(project_id, db, user)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can add members")

    target = db.query(models.User).filter(models.User.email == payload.email.lower()).first()
    if not target:
        raise HTTPException(status_code=404, detail="No registered user with that email")

    existing = (
        db.query(models.ProjectMember)
        .filter(models.ProjectMember.project_id == project_id, models.ProjectMember.user_id == target.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member of this project")

    member = models.ProjectMember(project_id=project_id, user_id=target.id, role="member")
    db.add(member)
    db.commit()
    db.refresh(member)
    return schemas.MemberOut(id=member.id, user_id=target.id, name=target.name, email=target.email, role=member.role)


@router.delete("/{project_id}/members/{member_user_id}", status_code=204)
def remove_member(
    project_id: int,
    member_user_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    project = get_project_for_member(project_id, db, user)
    if project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the project owner can remove members")
    if member_user_id == project.owner_id:
        raise HTTPException(status_code=400, detail="Cannot remove the project owner")

    member = (
        db.query(models.ProjectMember)
        .filter(models.ProjectMember.project_id == project_id, models.ProjectMember.user_id == member_user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
    return None
