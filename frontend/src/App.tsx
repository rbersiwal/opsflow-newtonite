import { useEffect, useState } from "react"

const API = "http://localhost:8000"

type User = {
  id: number
  name: string
  email: string
  role: string
}

type Team = {
  id: number
  name: string
}

type Work = {
  id: number
  title: string
  description: string
  item_type: string
  status: string
  priority: string
  team_id: number
  assignee_id: number | null
  created_by: number
  due_date: string | null
  version: number
  created_at: string
  updated_at: string
  assignee_name: string | null
  team_name: string | null
}

type Detail = Work & {
  comments: {
    id: number
    user_id: number
    body: string
    created_at: string
    user_name: string
  }[]
  activities: {
    id: number
    user_id: number
    action: string
    old_value: string | null
    new_value: string | null
    created_at: string
    user_name: string
  }[]
}

async function api(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("opsflow_token")

  const headers: any = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(API + path, {
    ...options,
    headers
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({
      detail: "Request failed"
    }))

    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : body.detail?.message || "Request failed"
    )
  }

  if (res.status === 204) return null

  return res.json()
}

/* ================= LOGIN ================= */

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState("admin@example.com")
  const [password, setPassword] = useState("password")
  const [error, setError] = useState("")

  async function submit(e: any) {
    e.preventDefault()
    setError("")

    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      })

      localStorage.setItem("opsflow_token", data.access_token)
      onLogin(data.user)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="login">
      <div className="login-card">

        <div className="brand">
          OPS<span>FLOW</span>
        </div>

        <p className="muted">
          Operational work management
        </p>

        <form onSubmit={submit}>

          <label>Email</label>

          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
          />

          <label>Password</label>

          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <button className="primary wide">
            Sign in
          </button>

        </form>

        <div className="demo">
          Demo: admin@example.com / password
        </div>

      </div>
    </div>
  )
}

/* ================= APP ================= */

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [page, setPage] = useState("dashboard")
  const [selected, setSelected] = useState<number | null>(null)
  const [refresh, setRefresh] = useState(0)

  const [teams, setTeams] = useState<Team[]>([])
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (localStorage.getItem("opsflow_token")) {
      api("/api/me")
        .then(setUser)
        .catch(() => {
          localStorage.removeItem("opsflow_token")
        })
    }
  }, [])

  useEffect(() => {
    if (user) {
      api("/api/teams")
        .then(setTeams)
        .catch(() => setTeams([]))
    }
  }, [user])

  if (!user) {
    return <Login onLogin={setUser} />
  }

  function logout() {
    localStorage.removeItem("opsflow_token")
    setUser(null)
  }

  function openAddWork() {
    setPage("mine")
    setSelected(null)
    setShowCreate(true)
  }

  function handleCreated() {
    setShowCreate(false)
    setPage("mine")
    setSelected(null)
    setRefresh(x => x + 1)
  }

  return (
    <div className="app">

      {/* SIDEBAR */}

      <aside>

        <div className="brand">
          OPS<span>FLOW</span>
        </div>

        <div className="nav">

          {[
            ["dashboard", "Dashboard"],
            ["work", "All Work"],
            ["mine", "My Work"]
          ].map(([id, label]) => (

            <button
              key={id}
              className={page === id ? "nav-active" : ""}
              onClick={() => {
                setPage(id)
                setSelected(null)
              }}
            >
              {label}
            </button>

          ))}

        </div>

        <div className="side-bottom">

          <div className="userbox">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>

          <button onClick={logout}>
            Sign out
          </button>

        </div>

      </aside>

      {/* MAIN */}

      <main>

        <header>

          <div>
            <span className="eyebrow">
              OPERATIONS
            </span>

            <h1>
              {selected
                ? "Work item"
                : page === "dashboard"
                  ? "Dashboard"
                  : page === "mine"
                    ? "My Work"
                    : "All Work"}
            </h1>
          </div>

          <div className="user-pill">
            {user.name}
          </div>

        </header>

        {selected ? (

          <WorkDetail
            id={selected}
            user={user}
            onBack={() => setSelected(null)}
            onChanged={() => setRefresh(x => x + 1)}
          />

        ) : page === "dashboard" ? (

          <Dashboard
            user={user}
            onOpen={setSelected}
            refresh={refresh}
          />

        ) : (

          <WorkList
            mine={page === "mine"}
            user={user}
            onOpen={setSelected}
            refresh={refresh}
            onAddWork={openAddWork}
          />

        )}

      </main>

      {showCreate && user.role !== "VIEWER" && (

        <CreateWorkModal
          teams={teams}
          user={user}
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />

      )}

    </div>
  )
}

/* ================= CREATE WORK ================= */

function CreateWorkModal({
  teams,
  user,
  onClose,
  onCreated
}: {
  teams: Team[]
  user: User
  onClose: () => void
  onCreated: () => void
}) {

  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [itemType, setItemType] = useState("OPERATIONAL")
  const [priority, setPriority] = useState("MEDIUM")
  const [teamId, setTeamId] = useState("")
  const [assigneeId, setAssigneeId] = useState(String(user.id))
  const [dueDate, setDueDate] = useState("")

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: any) {
    e.preventDefault()

    if (!title.trim()) {
      setError("Title is required")
      return
    }

    if (!teamId) {
      setError("Please select a team")
      return
    }

    setLoading(true)
    setError("")

    try {

      await api("/api/work-items", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          item_type: itemType,
          priority,
          team_id: Number(teamId),
          assignee_id: assigneeId
            ? Number(assigneeId)
            : null,
          due_date: dueDate
            ? `${dueDate}T23:59:59`
            : null
        })
      })

      onCreated()

    } catch (e: any) {

      setError(e.message)

    } finally {

      setLoading(false)

    }
  }

  return (
    <div
      className="modal-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >

      <div className="modal-card">

        <div className="modal-head">

          <div>

            <span className="eyebrow">
              MY WORK
            </span>

            <h2>
              Add new work
            </h2>

          </div>

          <button
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>

        </div>

        <form onSubmit={submit}>

          <div className="form-grid">

            <div className="form-full">

              <label>
                Title
              </label>

              <input
                placeholder="e.g. Investigate payment failure"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
              />

            </div>

            <div className="form-full">

              <label>
                Description
              </label>

              <textarea
                placeholder="Describe what needs to be done and why..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
              />

            </div>

            <div>

              <label>
                Work type
              </label>

              <select
                value={itemType}
                onChange={e => setItemType(e.target.value)}
              >
                <option value="OPERATIONAL">
                  Operational
                </option>

                <option value="INCIDENT">
                  Incident
                </option>

                <option value="CUSTOMER_ISSUE">
                  Customer Issue
                </option>

                <option value="ENGINEERING">
                  Engineering
                </option>

                <option value="PAYMENT">
                  Payment
                </option>

                <option value="COMPLIANCE">
                  Compliance
                </option>

              </select>

            </div>

            <div>

              <label>
                Priority
              </label>

              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
              >

                <option value="LOW">
                  Low
                </option>

                <option value="MEDIUM">
                  Medium
                </option>

                <option value="HIGH">
                  High
                </option>

                <option value="URGENT">
                  Urgent
                </option>

              </select>

            </div>

            <div>

              <label>
                Team
              </label>

              <select
                value={teamId}
                onChange={e => setTeamId(e.target.value)}
              >

                <option value="">
                  Select team
                </option>

                {teams.map(team => (

                  <option
                    key={team.id}
                    value={team.id}
                  >
                    {team.name}
                  </option>

                ))}

              </select>

            </div>

            <div>

              <label>
                Due date
              </label>

              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />

            </div>

          </div>

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          <div className="modal-actions">

            <button
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>

            <button
              className="primary"
              disabled={loading}
            >
              {loading
                ? "Adding..."
                : "Add Work"}
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

/* ================= DASHBOARD ================= */

function Dashboard({
  onOpen,
  refresh
}: {
  user: User
  onOpen: (id: number) => void
  refresh: number
}) {

  const [items, setItems] = useState<Work[]>([])

  useEffect(() => {
    api("/api/work-items?limit=100")
      .then(x => setItems(x.items))
  }, [refresh])

  const urgent =
    items.filter(x => x.priority === "URGENT").length

  const unassigned =
    items.filter(x => !x.assignee_id).length

  const open =
    items.filter(x => x.status !== "CLOSED").length

  return (
    <div>

      <div className="stats">

        <Stat
          label="Open work"
          value={open}
        />

        <Stat
          label="Urgent"
          value={urgent}
          danger
        />

        <Stat
          label="Unassigned"
          value={unassigned}
        />

        <Stat
          label="Total"
          value={items.length}
        />

      </div>

      <div className="grid2">

        <section className="panel">

          <div className="panel-head">

            <h2>
              Needs attention
            </h2>

            <span>
              {urgent} urgent
            </span>

          </div>

          {items
            .filter(
              x =>
                x.priority === "URGENT" ||
                !x.assignee_id
            )
            .slice(0, 6)
            .map(x => (

              <WorkRow
                key={x.id}
                x={x}
                onOpen={onOpen}
              />

            ))}

          {!items.some(
            x =>
              x.priority === "URGENT" ||
              !x.assignee_id
          ) && (

            <Empty
              text="Nothing needs immediate attention."
            />

          )}

        </section>

        <section className="panel">

          <div className="panel-head">
            <h2>
              Recently updated
            </h2>
          </div>

          {items
            .slice(0, 6)
            .map(x => (

              <WorkRow
                key={x.id}
                x={x}
                onOpen={onOpen}
              />

            ))}

        </section>

      </div>

    </div>
  )
}

function Stat({
  label,
  value,
  danger
}: {
  label: string
  value: number
  danger?: boolean
}) {

  return (
    <div className="stat">

      <span>
        {label}
      </span>

      <strong
        className={
          danger ? "danger-text" : ""
        }
      >
        {value}
      </strong>

    </div>
  )
}

/* ================= WORK LIST ================= */

function WorkList({
  mine,
  user,
  onOpen,
  refresh,
  onAddWork
}: {
  mine: boolean
  user: User
  onOpen: (id: number) => void
  refresh: number
  onAddWork: () => void
}) {

  const [items, setItems] = useState<Work[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [priority, setPriority] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {

    setLoading(true)

    const q = new URLSearchParams({
      limit: "100",
      ...(mine ? { mine: "true" } : {})
    })

    if (search) {
      q.set("search", search)
    }

    if (status) {
      q.set("status", status)
    }

    if (priority) {
      q.set("priority", priority)
    }

    api("/api/work-items?" + q)
      .then(x => setItems(x.items))
      .finally(() => setLoading(false))

  }, [
    mine,
    search,
    status,
    priority,
    refresh
  ])

  return (
    <div>

      {/* MY WORK HEADER */}

      {mine ? (

        <div className="my-work-header">

          <div>

            <h2>
              Your work
            </h2>

            <p className="muted">
              Work items assigned to you
            </p>

          </div>

          {user.role !== "VIEWER" && (

            <button
              className="primary"
              onClick={onAddWork}
            >
              + Add Work
            </button>

          )}

        </div>

      ) : (

        <div className="work-page-header">

          <div>

            <h2>
              All work
            </h2>

            <p className="muted">
              All operational work items
            </p>

          </div>

        </div>

      )}

      <div className="toolbar">

        <input
          className="search"
          placeholder="Search work..."
          value={search}
          onChange={e =>
            setSearch(e.target.value)
          }
        />

        <select
          value={status}
          onChange={e =>
            setStatus(e.target.value)
          }
        >

          <option value="">
            All status
          </option>

          {[
            "OPEN",
            "IN_PROGRESS",
            "WAITING",
            "RESOLVED",
            "CLOSED"
          ].map(x => (

            <option key={x}>
              {x}
            </option>

          ))}

        </select>

        <select
          value={priority}
          onChange={e =>
            setPriority(e.target.value)
          }
        >

          <option value="">
            All priority
          </option>

          {[
            "LOW",
            "MEDIUM",
            "HIGH",
            "URGENT"
          ].map(x => (

            <option key={x}>
              {x}
            </option>

          ))}

        </select>

      </div>

      <section className="panel table-panel">

        <div className="table-head">

          <span>
            Work item
          </span>

          <span>
            Status
          </span>

          <span>
            Priority
          </span>

          <span>
            Owner
          </span>

        </div>

        {loading ? (

          <div className="loading">
            Loading...
          </div>

        ) : (

          items.map(x => (

            <div
              className="table-row"
              key={x.id}
              onClick={() =>
                onOpen(x.id)
              }
            >

              <div>

                <strong>
                  {x.title}
                </strong>

                <small>
                  {x.team_name} · {x.item_type}
                </small>

              </div>

              <div>
                <Badge text={x.status} />
              </div>

              <div>
                <Badge text={x.priority} />
              </div>

              <div>
                {x.assignee_name || (
                  <span className="unassigned">
                    Unassigned
                  </span>
                )}
              </div>

            </div>

          ))

        )}

        {!loading && !items.length && (

          <Empty
            text={
              mine
                ? "You don't have any work assigned yet."
                : "No work items match these filters."
            }
          />

        )}

      </section>

    </div>
  )
}

/* ================= WORK ROW ================= */

function WorkRow({
  x,
  onOpen
}: {
  x: Work
  onOpen: (id: number) => void
}) {

  return (

    <div
      className="work-row"
      onClick={() => onOpen(x.id)}
    >

      <div
        className="priority-dot"
        data-p={x.priority}
      />

      <div className="grow">

        <strong>
          {x.title}
        </strong>

        <small>
          {x.team_name} ·{" "}
          {x.assignee_name || "Unassigned"}
        </small>

      </div>

      <Badge text={x.priority} />

    </div>
  )
}

function Badge({ text }: { text: string }) {

  return (
    <span
      className={
        "badge " + text.toLowerCase()
      }
    >
      {text.replace("_", " ")}
    </span>
  )
}

function Empty({ text }: { text: string }) {

  return (
    <div className="empty">
      {text}
    </div>
  )
}

/* ================= WORK DETAIL ================= */

function WorkDetail({
  id,
  onBack,
  onChanged,
  user
}: {
  id: number
  onBack: () => void
  onChanged: () => void
  user: User
}) {

  const [item, setItem] =
    useState<Detail | null>(null)

  const [comment, setComment] =
    useState("")

  const [error, setError] =
    useState("")

  useEffect(() => {

    api(`/api/work-items/${id}`)
      .then(setItem)
      .catch(e => setError(e.message))

  }, [id])

  async function status(status: string) {

    if (!item) return

    try {

      await api(
        `/api/work-items/${id}/status`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key":
              crypto.randomUUID()
          },
          body: JSON.stringify({
            version: item.version,
            status
          })
        }
      )

      setItem(
        await api(
          `/api/work-items/${id}`
        )
      )

      onChanged()

    } catch (e: any) {

      setError(e.message)

    }
  }

  async function assignSelf() {

    if (!item) return

    try {

      await api(
        `/api/work-items/${id}/assign`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key":
              crypto.randomUUID()
          },
          body: JSON.stringify({
            version: item.version,
            assignee_id: user.id
          })
        }
      )

      setItem(
        await api(
          `/api/work-items/${id}`
        )
      )

      onChanged()

    } catch (e: any) {

      setError(e.message)

    }
  }

  async function addComment() {

    if (!comment.trim()) return

    try {

      await api(
        `/api/work-items/${id}/comments`,
        {
          method: "POST",
          body: JSON.stringify({
            body: comment
          })
        }
      )

      setComment("")

      setItem(
        await api(
          `/api/work-items/${id}`
        )
      )

      onChanged()

    } catch (e: any) {

      setError(e.message)

    }
  }

  if (error && !item) {
    return (
      <div className="error">
        {error}
      </div>
    )
  }

  if (!item) {
    return (
      <div className="loading">
        Loading work item...
      </div>
    )
  }

  return (

    <div>

      <button
        className="back"
        onClick={onBack}
      >
        ← Back to work
      </button>

      {error && (
        <div className="error">
          {error}
        </div>
      )}

      <div className="detail-grid">

        <section className="panel detail-main">

          <div className="detail-title">

            <div>

              <div className="eyebrow">
                WORK #{item.id} ·{" "}
                {item.item_type}
              </div>

              <h2>
                {item.title}
              </h2>

            </div>

            <Badge text={item.priority} />

          </div>

          <p className="description">
            {item.description}
          </p>

          <div className="meta-grid">

            <Meta
              label="Status"
              value={item.status}
            />

            <Meta
              label="Priority"
              value={item.priority}
            />

            <Meta
              label="Team"
              value={item.team_name || "-"}
            />

            <Meta
              label="Assignee"
              value={
                item.assignee_name ||
                "Unassigned"
              }
            />

            <Meta
              label="Version"
              value={String(item.version)}
            />

            <Meta
              label="Updated"
              value={
                new Date(
                  item.updated_at
                ).toLocaleString()
              }
            />

          </div>

          <div className="actions">

            {!item.assignee_id && (

              <button
                className="primary"
                onClick={assignSelf}
              >
                Assign to me
              </button>

            )}

            {item.status === "OPEN" && (

              <button
                onClick={() =>
                  status("IN_PROGRESS")
                }
              >
                Start work
              </button>

            )}

            {item.status === "IN_PROGRESS" && (

              <button
                onClick={() =>
                  status("RESOLVED")
                }
              >
                Resolve
              </button>

            )}

            {item.status === "WAITING" && (

              <button
                onClick={() =>
                  status("IN_PROGRESS")
                }
              >
                Resume
              </button>

            )}

            {item.status === "RESOLVED" && (

              <button
                onClick={() =>
                  status("CLOSED")
                }
              >
                Close
              </button>

            )}

          </div>

          <h3>
            Comments
          </h3>

          <div className="comments">

            {item.comments.map(c => (

              <div
                className="comment"
                key={c.id}
              >

                <strong>
                  {c.user_name}
                </strong>

                <small>
                  {new Date(
                    c.created_at
                  ).toLocaleString()}
                </small>

                <p>
                  {c.body}
                </p>

              </div>

            ))}

          </div>

          {user.role !== "VIEWER" && (

            <div className="comment-box">

              <textarea
                placeholder="Add a comment..."
                value={comment}
                onChange={e =>
                  setComment(e.target.value)
                }
              />

              <button
                className="primary add-comment-btn"
                onClick={addComment}
              >
                AddComment
              </button>

            </div>

          )}

        </section>

        <aside className="panel activity">

          <h3>
            Activity history
          </h3>

          {item.activities.map(a => (

            <div
              className="activity-item"
              key={a.id}
            >

              <div className="activity-dot" />

              <div>

                <strong>
                  {a.action.replaceAll(
                    "_",
                    " "
                  )}
                </strong>

                <p>
                  {a.user_name} ·{" "}
                  {new Date(
                    a.created_at
                  ).toLocaleString()}
                </p>

                {a.old_value && (

                  <small>
                    {a.old_value} →{" "}
                    {a.new_value}
                  </small>

                )}

              </div>

            </div>

          ))}

        </aside>

      </div>

    </div>
  )
}

function Meta({
  label,
  value
}: {
  label: string
  value: string
}) {

  return (

    <div>

      <small>
        {label}
      </small>

      <strong>
        {value}
      </strong>

    </div>
  )
}

export default App