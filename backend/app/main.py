import json
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from .db import Base, engine, get_db, SessionLocal
from .models import User, Team, TeamMember, WorkItem, Comment, Activity
from .schemas import *
from .auth import hash_password, verify_password, create_token, get_current_user, require_roles
from .services import *

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
    seed()
    yield

app = FastAPI(title="OpsFlow API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def seed():
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        teams = [Team(name="Engineering"), Team(name="Payments"), Team(name="Operations")]
        db.add_all(teams)
        db.flush()

        users = [
            User(name="Admin User", email="admin@example.com", password_hash=hash_password("password"), role="ADMIN"),
            User(name="Manager User", email="manager@example.com", password_hash=hash_password("password"), role="MANAGER"),
            User(name="Alice Johnson", email="alice@example.com", password_hash=hash_password("password"), role="MEMBER"),
            User(name="View Only", email="viewer@example.com", password_hash=hash_password("password"), role="VIEWER"),
        ]
        db.add_all(users)
        db.flush()

        for user in users[:3]:
            for team in teams:
                db.add(TeamMember(user_id=user.id, team_id=team.id, team_role=user.role))

        work = [
            WorkItem(
                title="Investigate duplicate customer payment",
                description="Customer reports that a payment was charged twice. Review provider and internal transaction logs.",
                item_type="PAYMENT",
                status="IN_PROGRESS",
                priority="HIGH",
                team_id=teams[1].id,
                assignee_id=users[2].id,
                created_by=users[1].id,
            ),
            WorkItem(
                title="Production API latency investigation",
                description="Investigate increased response latency on the production API.",
                item_type="INCIDENT",
                status="OPEN",
                priority="URGENT",
                team_id=teams[0].id,
                assignee_id=None,
                created_by=users[0].id,
            ),
            WorkItem(
                title="Compliance document review",
                description="Review the latest operational compliance request.",
                item_type="COMPLIANCE",
                status="WAITING",
                priority="MEDIUM",
                team_id=teams[2].id,
                assignee_id=users[1].id,
                created_by=users[0].id,
            ),
        ]
        db.add_all(work)
        db.commit()
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/auth/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == data.email)).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "access_token": create_token(user),
        "token_type": "bearer",
        "user": user,
    }

@app.get("/api/me", response_model=UserOut)
def me(user=Depends(get_current_user)):
    return user

@app.get("/api/teams")
def teams(db: Session = Depends(get_db), user=Depends(get_current_user)):
    return db.query(Team).order_by(Team.name).all()

def work_out(db, item):
    assignee = db.get(User, item.assignee_id) if item.assignee_id else None
    team = db.get(Team, item.team_id)
    return WorkOut(
        id=item.id, title=item.title, description=item.description,
        item_type=item.item_type, status=item.status, priority=item.priority,
        team_id=item.team_id, assignee_id=item.assignee_id, created_by=item.created_by,
        due_date=item.due_date, version=item.version, created_at=item.created_at,
        updated_at=item.updated_at,
        assignee_name=assignee.name if assignee else None,
        team_name=team.name if team else None,
    )

@app.get("/api/work-items", response_model=PaginatedWork)
def list_work(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str = "",
    status: str = "",
    priority: str = "",
    team_id: int | None = None,
    assignee_id: int | None = None,
    mine: bool = False,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(WorkItem)
    if search:
        term = f"%{search}%"
        q = q.filter(or_(WorkItem.title.ilike(term), WorkItem.description.ilike(term)))
    if status:
        q = q.filter(WorkItem.status == status)
    if priority:
        q = q.filter(WorkItem.priority == priority)
    if team_id:
        q = q.filter(WorkItem.team_id == team_id)
    if assignee_id:
        q = q.filter(WorkItem.assignee_id == assignee_id)
    if mine:
        q = q.filter(WorkItem.assignee_id == user.id)

    total = q.count()
    items = q.order_by(WorkItem.updated_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return PaginatedWork(
        items=[work_out(db, x) for x in items],
        page=page, limit=limit, total=total
    )

@app.post("/api/work-items", response_model=WorkOut)
def create_work(
    data: WorkCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "MANAGER", "MEMBER")),
):
    if data.priority not in PRIORITIES:
        raise HTTPException(400, "Invalid priority")
    if not db.get(Team, data.team_id):
        raise HTTPException(404, "Team not found")
    if data.assignee_id and not db.get(User, data.assignee_id):
        raise HTTPException(404, "Assignee not found")
    item = WorkItem(**data.model_dump(), created_by=user.id)
    db.add(item)
    db.flush()
    add_activity(db, item.id, user.id, "CREATED", None, item.title)
    db.commit()
    db.refresh(item)
    return work_out(db, item)

@app.get("/api/work-items/{work_id}", response_model=WorkDetail)
def get_work(work_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    item = db.get(WorkItem, work_id)
    if not item:
        raise HTTPException(404, "Work item not found")
    comments = (
        db.query(Comment, User.name)
        .join(User, User.id == Comment.user_id)
        .filter(Comment.work_item_id == work_id)
        .order_by(Comment.created_at.asc()).all()
    )
    activities = (
        db.query(Activity, User.name)
        .join(User, User.id == Activity.user_id)
        .filter(Activity.work_item_id == work_id)
        .order_by(Activity.created_at.desc()).all()
    )
    base = work_out(db, item)
    return WorkDetail(
        **base.model_dump(),
        comments=[
            CommentOut(id=c.id, user_id=c.user_id, body=c.body, created_at=c.created_at, user_name=n)
            for c, n in comments
        ],
        activities=[
            ActivityOut(id=a.id, user_id=a.user_id, action=a.action, old_value=a.old_value,
                        new_value=a.new_value, created_at=a.created_at, user_name=n)
            for a, n in activities
        ],
    )

@app.patch("/api/work-items/{work_id}", response_model=WorkOut)
def update_work(
    work_id: int,
    data: WorkUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "MANAGER", "MEMBER")),
):
    item = db.execute(
        select(WorkItem).where(WorkItem.id == work_id).with_for_update()
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Work item not found")
    check_version(item, data.version)

    if data.priority and data.priority not in PRIORITIES:
        raise HTTPException(400, "Invalid priority")
    old = {}
    for field in ["title", "description", "priority", "team_id", "assignee_id", "due_date"]:
        value = getattr(data, field)
        if value is not None and value != getattr(item, field):
            old[field] = getattr(item, field)
            setattr(item, field, value)

    if not old:
        return work_out(db, item)

    item.version += 1
    for field, previous in old.items():
        add_activity(db, item.id, user.id, f"CHANGED_{field.upper()}", previous, getattr(item, field))
    db.commit()
    db.refresh(item)
    return work_out(db, item)

@app.post("/api/work-items/{work_id}/assign", response_model=WorkOut)
def assign_work(
    work_id: int,
    data: AssignRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "MANAGER", "MEMBER")),
):
    operation = f"assign:{work_id}"
    previous = require_idempotency(db, user.id, operation, idempotency_key)
    if previous:
        return json.loads(previous.response_json)

    item = db.execute(
        select(WorkItem).where(WorkItem.id == work_id).with_for_update()
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Work item not found")
    check_version(item, data.version)
    if data.assignee_id and not db.get(User, data.assignee_id):
        raise HTTPException(404, "Assignee not found")

    old = item.assignee_id
    item.assignee_id = data.assignee_id
    item.version += 1
    add_activity(db, item.id, user.id, "ASSIGNED", old, data.assignee_id)
    db.flush()
    result = work_out(db, item).model_dump(mode="json")
    save_idempotency(db, user.id, operation, idempotency_key, result)
    db.commit()
    return result

@app.post("/api/work-items/{work_id}/status", response_model=WorkOut)
def update_status(
    work_id: int,
    data: StatusUpdate,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "MANAGER", "MEMBER")),
):
    operation = f"status:{work_id}:{data.status}"
    previous = require_idempotency(db, user.id, operation, idempotency_key)
    if previous:
        return json.loads(previous.response_json)

    item = db.execute(
        select(WorkItem).where(WorkItem.id == work_id).with_for_update()
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, "Work item not found")
    check_version(item, data.version)

    if data.status not in VALID_STATUSES:
        raise HTTPException(400, "Invalid status")
    if data.status not in TRANSITIONS[item.status]:
        raise HTTPException(
            409,
            {"code": "INVALID_TRANSITION", "message": f"Cannot move {item.status} to {data.status}"}
        )

    old = item.status
    item.status = data.status
    item.version += 1
    add_activity(db, item.id, user.id, "STATUS_CHANGED", old, data.status)
    db.flush()
    result = work_out(db, item).model_dump(mode="json")
    save_idempotency(db, user.id, operation, idempotency_key, result)
    db.commit()
    return result

@app.post("/api/work-items/{work_id}/comments", response_model=CommentOut)
def add_comment(
    work_id: int,
    data: CommentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN", "MANAGER", "MEMBER")),
):
    item = db.get(WorkItem, work_id)
    if not item:
        raise HTTPException(404, "Work item not found")
    comment = Comment(work_item_id=work_id, user_id=user.id, body=data.body)
    db.add(comment)
    add_activity(db, work_id, user.id, "COMMENT_ADDED", None, data.body[:100])
    db.commit()
    db.refresh(comment)
    return CommentOut(
        id=comment.id, user_id=user.id, body=comment.body,
        created_at=comment.created_at, user_name=user.name
    )

@app.delete("/api/work-items/{work_id}", status_code=204)
def delete_work(
    work_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("ADMIN")),
):
    item = db.get(WorkItem, work_id)
    if not item:
        raise HTTPException(404, "Work item not found")
    db.query(Comment).filter(Comment.work_item_id == work_id).delete()
    db.query(Activity).filter(Activity.work_item_id == work_id).delete()
    db.delete(item)
    db.commit()
