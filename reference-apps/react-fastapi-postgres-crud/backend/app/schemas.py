from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Role = Literal["admin", "member"]
TaskStatus = Literal["todo", "in_progress", "done"]


class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    name: str
    role: Role


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: TaskStatus = "todo"


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    status: str
    owner_id: str
    created_at: datetime
    updated_at: datetime


class HealthOut(BaseModel):
    status: str
    database: str
    latency_ms: int | None = None
    error: str | None = None
    timestamp: str
