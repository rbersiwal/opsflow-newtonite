from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    email: str
    password: str

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: str

    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class WorkCreate(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    description: str = ""
    item_type: str = "OPERATIONAL"
    priority: str = "MEDIUM"
    team_id: int
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None

class WorkUpdate(BaseModel):
    version: int
    title: Optional[str] = Field(default=None, min_length=3, max_length=240)
    description: Optional[str] = None
    priority: Optional[str] = None
    team_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None

class StatusUpdate(BaseModel):
    version: int
    status: str

class AssignRequest(BaseModel):
    version: int
    assignee_id: Optional[int] = None

class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

class CommentOut(BaseModel):
    id: int
    user_id: int
    body: str
    created_at: datetime
    user_name: str

class ActivityOut(BaseModel):
    id: int
    user_id: int
    action: str
    old_value: Optional[str]
    new_value: Optional[str]
    created_at: datetime
    user_name: str

class WorkOut(BaseModel):
    id: int
    title: str
    description: str
    item_type: str
    status: str
    priority: str
    team_id: int
    assignee_id: Optional[int]
    created_by: int
    due_date: Optional[datetime]
    version: int
    created_at: datetime
    updated_at: datetime
    assignee_name: Optional[str] = None
    team_name: Optional[str] = None

class WorkDetail(WorkOut):
    comments: list[CommentOut] = []
    activities: list[ActivityOut] = []

class PaginatedWork(BaseModel):
    items: list[WorkOut]
    page: int
    limit: int
    total: int
