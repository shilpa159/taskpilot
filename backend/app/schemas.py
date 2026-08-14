from datetime import datetime, date
from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field, ConfigDict

from app.models import TaskStatus, TaskPriority


# ---------- Auth / Users ----------

class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: EmailStr


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Projects ----------

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    description: Optional[str] = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str]
    owner_id: int
    created_at: datetime
    task_count: int = 0


class MemberAdd(BaseModel):
    email: EmailStr


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    name: str
    email: EmailStr
    role: str


# ---------- Tasks ----------

class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.todo
    priority: TaskPriority = TaskPriority.medium
    due_date: Optional[date] = None
    estimated_hours: Optional[int] = Field(default=None, ge=0, le=2000)
    assignee_id: Optional[int] = None


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    due_date: Optional[date] = None
    estimated_hours: Optional[int] = Field(default=None, ge=0, le=2000)
    assignee_id: Optional[int] = None
    position: Optional[int] = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    due_date: Optional[date]
    estimated_hours: Optional[int]
    assignee_id: Optional[int]
    assignee_name: Optional[str] = None
    position: int
    ai_generated: int
    created_at: datetime
    updated_at: datetime


# ---------- AI breakdown ----------

class BreakdownRequest(BaseModel):
    project_id: int
    goal: str = Field(min_length=3, max_length=2000)
    task_count_hint: Optional[int] = Field(default=None, ge=2, le=20)


class SuggestedSubtask(BaseModel):
    title: str
    description: str
    estimated_hours: int
    priority: TaskPriority


class BreakdownResponse(BaseModel):
    goal: str
    subtasks: List[SuggestedSubtask]


class BreakdownApplyRequest(BaseModel):
    project_id: int
    subtasks: List[SuggestedSubtask]
