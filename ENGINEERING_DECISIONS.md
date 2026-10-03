# Engineering Decisions

## 1. Relational data model
Users, teams, memberships, work items, comments and activity events have relationships that benefit from database constraints and transactions. PostgreSQL was selected.

## 2. Optimistic concurrency
Every work item has a `version`. The client sends the version it last observed. The update succeeds only if that version is still current. Otherwise the API returns 409 Conflict.

This prevents a stale browser from silently overwriting another employee's recent change.

## 3. Server-side authorization
Permissions are checked in FastAPI. The UI may hide actions for convenience, but the API remains the source of truth.

## 4. Idempotent mutations
The assignment and status update endpoints accept an `Idempotency-Key`. If a user repeats the same request with the same key, the server reuses the stored response instead of performing the operation again.

## 5. Audit history
Important changes create immutable activity records. This gives users a timeline showing who changed ownership, priority and workflow state.

## 6. Scope control
The system deliberately does not attempt to become a full Jira replacement. The core workflow was prioritized because the assessment values coherent behavior and engineering reasoning over feature count.
