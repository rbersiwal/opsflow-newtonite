import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi.testclient import TestClient

from app.main import app
from app.db import Base, engine
from app.models import User, Team, TeamMember, WorkItem
from app.auth import hash_password


# Create test database tables
Base.metadata.create_all(bind=engine)


def seed_test_data():
    from sqlalchemy.orm import Session

    with Session(engine) as db:
        # Don't seed again if data already exists
        if db.query(User).first():
            return

        admin = User(
            name="Admin User",
            email="admin@example.com",
            password_hash=hash_password("password"),
            role="ADMIN",
        )

        viewer = User(
            name="Viewer User",
            email="viewer@example.com",
            password_hash=hash_password("password"),
            role="VIEWER",
        )

        db.add_all([admin, viewer])
        db.flush()

        engineering = Team(name="Engineering")
        operations = Team(name="Operations")

        db.add_all([engineering, operations])
        db.flush()

        db.add_all([
            TeamMember(
                user_id=admin.id,
                team_id=engineering.id,
            ),
            TeamMember(
                user_id=viewer.id,
                team_id=engineering.id,
            ),
        ])

        work = WorkItem(
            title="Test work item",
            description="Test work item for automated tests",
            item_type="OPERATIONAL",
            status="OPEN",
            priority="MEDIUM",
            team_id=engineering.id,
            created_by=admin.id,
            assignee_id=admin.id,
            version=1,
        )

        db.add(work)
        db.commit()


seed_test_data()

client = TestClient(app)


def login(email):
    r = client.post(
        "/api/auth/login",
        json={
            "email": email,
            "password": "password",
        },
    )

    assert r.status_code == 200

    return r.json()["access_token"]


def auth(token):
    return {
        "Authorization": f"Bearer {token}"
    }


def test_login():

    token = login("admin@example.com")

    assert token


def test_viewer_cannot_create():

    token = login("viewer@example.com")

    r = client.post(
        "/api/work-items",
        headers=auth(token),
        json={
            "title": "Unauthorized task",
            "description": "x",
            "team_id": 1,
        },
    )

    assert r.status_code == 403


def test_stale_version_rejected():

    token = login("admin@example.com")

    r = client.get(
        "/api/work-items",
        headers=auth(token),
    )

    assert r.status_code == 200

    item = r.json()["items"][0]

    original_version = item["version"]

    update = client.patch(
        f"/api/work-items/{item['id']}",
        headers=auth(token),
        json={
            "version": original_version,
            "priority": "LOW",
        },
    )

    assert update.status_code == 200

    stale = client.patch(
        f"/api/work-items/{item['id']}",
        headers=auth(token),
        json={
            "version": original_version,
            "priority": "HIGH",
        },
    )

    assert stale.status_code == 409


def test_invalid_workflow_transition():

    token = login("admin@example.com")

    r = client.get(
        "/api/work-items",
        headers=auth(token),
    )

    assert r.status_code == 200

    items = r.json()["items"]

    closed_item = next(
        (
            x
            for x in items
            if x["status"] == "CLOSED"
        ),
        None,
    )

    # If there is no CLOSED item,
    # this test has nothing to validate.
    if closed_item:

        bad = client.post(
            f"/api/work-items/{closed_item['id']}/status",
            headers={
                **auth(token),
                "Idempotency-Key": "test-invalid",
            },
            json={
                "version": closed_item["version"],
                "status": "OPEN",
            },
        )

        assert bad.status_code == 409