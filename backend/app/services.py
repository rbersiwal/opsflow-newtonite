import json
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import WorkItem, Activity, IdempotencyRecord, User

VALID_STATUSES = {"OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"}
TRANSITIONS = {
    "OPEN": {"IN_PROGRESS"},
    "IN_PROGRESS": {"WAITING", "RESOLVED"},
    "WAITING": {"IN_PROGRESS", "RESOLVED"},
    "RESOLVED": {"CLOSED", "IN_PROGRESS"},
    "CLOSED": set(),
}
PRIORITIES = {"LOW", "MEDIUM", "HIGH", "URGENT"}

def add_activity(db, work_id, user_id, action, old=None, new=None):
    db.add(Activity(
        work_item_id=work_id,
        user_id=user_id,
        action=action,
        old_value=None if old is None else str(old),
        new_value=None if new is None else str(new),
    ))

def check_version(item, expected):
    if item.version != expected:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STALE_VERSION",
                "message": "This work item was updated by another user.",
                "server_version": item.version,
            },
        )

def require_idempotency(db, user_id, operation, key):
    if not key:
        return None
    record = db.execute(
        select(IdempotencyRecord).where(
            IdempotencyRecord.key == key,
            IdempotencyRecord.user_id == user_id,
            IdempotencyRecord.operation == operation,
        )
    ).scalar_one_or_none()
    return record

def save_idempotency(db, user_id, operation, key, response):
    if not key:
        return
    db.add(IdempotencyRecord(
        key=key,
        user_id=user_id,
        operation=operation,
        response_json=json.dumps(response, default=str),
    ))
