# OpsFlow — Newtonite Software Engineering Challenge

OpsFlow is an internal operational work-management application designed around the requirements in the Newtonite challenge.

## Included
- JWT authentication
- Role-based authorization enforced by the API
- Work item creation, assignment, status and priority changes
- Server-side search, filtering and pagination
- Activity/audit history
- Comments
- Optimistic concurrency using a `version` field
- Idempotency for important mutations
- Workflow transition validation
- PostgreSQL
- React + TypeScript frontend
- FastAPI backend
- Automated backend tests

## Demo accounts
All demo accounts use password: `password`

- admin@example.com — ADMIN
- manager@example.com — MANAGER
- alice@example.com — MEMBER
- viewer@example.com — VIEWER

## Requirements
- Docker Desktop
- Node.js 20+
- Python 3.12+

## 1. Start PostgreSQL

```bash
docker compose up -d db
```

## 2. Start backend

Windows PowerShell:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend:
http://localhost:8000

API docs:
http://localhost:8000/docs

The database and demo data are initialized automatically.

## 3. Start frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend:
http://localhost:5173

## 4. Run tests

```bash
cd backend
pytest -q
```

## Architecture

React/TypeScript
        |
        | REST + JWT
        v
FastAPI
        |
        +---- PostgreSQL
        |
        +---- RBAC
        +---- optimistic concurrency
        +---- idempotency
        +---- audit history

## Important engineering decisions

1. PostgreSQL is used for relational consistency between users, teams, work items, comments and audit events.
2. Work items have a monotonically increasing `version`. Updates include the version observed by the client. A stale version returns HTTP 409 rather than silently overwriting another user's change.
3. Authorization is enforced in backend dependencies and service functions, not only by hiding frontend controls.
4. Important mutations accept an `Idempotency-Key`. A repeated key from the same user returns the previous result rather than performing the operation twice.
5. Status transitions are validated by the backend so clients cannot bypass workflow rules.

## Known limitations
- JWT access tokens are intentionally simple for an assessment MVP.
- Notifications are represented by an in-app activity mechanism rather than a production message broker.
- Full-text search is implemented with PostgreSQL-compatible filtering patterns; production deployment could add PostgreSQL GIN/trigram indexes or a search service.
- The frontend is intentionally focused on the core operational workflow rather than a complete enterprise design system.
