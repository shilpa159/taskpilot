from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.deps import get_current_user, get_project_for_member

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["tasks"])


def _to_task_out(task: models.Task, assignee_name: Optional[str]) -> schemas.TaskOut:
    out = schemas.TaskOut.model_validate(task)
    out.assignee_name = assignee_name
    return out


def _assignee_name_map(db: Session, project_id: int) -> dict[int, str]:
    rows = (
        db.query(models.User.id, models.User.name)
        .join(models.ProjectMember, models.ProjectMember.user_id == models.User.id)
        .filter(models.ProjectMember.project_id == project_id)
        .all()
    )
    return {uid: name for uid, name in rows}


def _validate_assignee(db: Session, project_id: int, assignee_id: Optional[int]):
    if assignee_id is None:
        return
    is_member = (
        db.query(models.ProjectMember)
        .filter(models.ProjectMember.project_id == project_id, models.ProjectMember.user_id == assignee_id)
        .first()
    )
    if not is_member:
        raise HTTPException(status_code=400, detail="Assignee must be a member of this project")


@router.get("", response_model=list[schemas.TaskOut])
def list_tasks(
    project_id: int,
    status: Optional[models.TaskStatus] = None,
    priority: Optional[models.TaskPriority] = None,
    assignee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    get_project_for_member(project_id, db, user)
    q = db.query(models.Task).filter(models.Task.project_id == project_id)
    if status:
        q = q.filter(models.Task.status == status)
    if priority:
        q = q.filter(models.Task.priority == priority)
    if assignee_id:
        q = q.filter(models.Task.assignee_id == assignee_id)
    tasks = q.order_by(models.Task.status, models.Task.position, models.Task.created_at).all()

    names = _assignee_name_map(db, project_id)
    return [_to_task_out(t, names.get(t.assignee_id)) for t in tasks]


@router.post("", response_model=schemas.TaskOut, status_code=201)
def create_task(
    project_id: int,
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    get_project_for_member(project_id, db, user)
    _validate_assignee(db, project_id, payload.assignee_id)

    max_pos = (
        db.query(models.Task)
        .filter(models.Task.project_id == project_id, models.Task.status == payload.status)
        .count()
    )
    task = models.Task(
        project_id=project_id,
        title=payload.title.strip(),
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        estimated_hours=payload.estimated_hours,
        assignee_id=payload.assignee_id,
        position=max_pos,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    names = _assignee_name_map(db, project_id)
    return _to_task_out(task, names.get(task.assignee_id))


@router.patch("/{task_id}", response_model=schemas.TaskOut)
def update_task(
    project_id: int,
    task_id: int,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    get_project_for_member(project_id, db, user)
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.project_id == project_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    data = payload.model_dump(exclude_unset=True)
    if "assignee_id" in data:
        _validate_assignee(db, project_id, data["assignee_id"])

    for field, value in data.items():
        setattr(task, field, value)

    db.commit()
    db.refresh(task)
    names = _assignee_name_map(db, project_id)
    return _to_task_out(task, names.get(task.assignee_id))


@router.delete("/{task_id}", status_code=204)
def delete_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    get_project_for_member(project_id, db, user)
    task = db.query(models.Task).filter(models.Task.id == task_id, models.Task.project_id == project_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return None
