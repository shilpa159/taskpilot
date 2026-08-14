# TaskPilot

A full-stack project management tool with one standout feature: **AI-powered task
breakdown**. Type a high-level goal — *"launch a marketing website"* — and TaskPilot
calls the Anthropic API to draft a sequenced list of subtasks with time estimates,
which you can edit, assign, and track from there.

## What's included

- **Auth** — register / login, bcrypt-hashed passwords, JWT session tokens.
- **Projects** — create projects, invite members by email.
- **Tasks** — title, description, status, priority, due date, assignee, time estimate.
- **AI breakdown** — describe a goal, Claude proposes subtasks with estimates and
  priorities; edit any field inline, drop ones you don't want, then bulk-add the
  rest to the project in one click.
- **Dashboard UI** — a list view and a Kanban board (drag cards between
  To do / In progress / Done) with status + priority filters.

## Stack

| Layer      | Technology                                   |
|------------|-----------------------------------------------|
| Backend    | Python, FastAPI, SQLAlchemy                    |
| Database   | MySQL                                          |
| AI         | Anthropic API (`anthropic` Python SDK)         |
| Frontend   | HTML, CSS, vanilla JavaScript (no framework)   |
| Auth       | bcrypt password hashing + JWT (python-jose)    |
| Deployment | Render (or any host that runs Docker/Python)   |

## Project structure

```
taskpilot/
├── backend/
│   ├── app/
│   │   ├── main.py            FastAPI app, CORS, router wiring
│   │   ├── config.py          Settings loaded from environment variables
│   │   ├── database.py        SQLAlchemy engine/session
│   │   ├── models.py          User, Project, ProjectMember, Task
│   │   ├── schemas.py         Pydantic request/response models
│   │   ├── security.py        Password hashing + JWT helpers
│   │   ├── deps.py            Auth dependency + project-access checks
│   │   └── routers/
│   │       ├── auth.py        /auth/register, /auth/login, /auth/me
│   │       ├── projects.py    /projects, members
│   │       ├── tasks.py       /projects/{id}/tasks CRUD
│   │       └── ai.py          /ai/breakdown, /ai/breakdown/apply
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html             Login / register
│   ├── dashboard.html         Project sidebar, list + Kanban views, modals
│   ├── css/style.css
│   └── js/
│       ├── config.js          Set the backend API URL here
│       ├── api.js             fetch wrapper, JWT storage, toasts
│       ├── auth.js            Login/register page logic
│       └── dashboard.js       Projects, tasks, Kanban D&D, AI breakdown flow
└── render.yaml                 Render Blueprint for deployment
```

## Data model

- `users(id, name, email, password_hash, created_at)`
- `projects(id, name, description, owner_id, created_at)`
- `project_members(id, project_id, user_id, role, joined_at)` — join table; a
  task's assignee must be a project member.
- `tasks(id, project_id, title, description, status, priority, due_date,
  estimated_hours, assignee_id, position, ai_generated, created_at, updated_at)`

Tables are created automatically on first backend startup via
`Base.metadata.create_all()`. That's fine for getting this running quickly; if
you keep building on it, swap in Alembic migrations before the schema stabilizes.

## Running it locally

### 1. Database

Create a MySQL database and user:

```sql
CREATE DATABASE taskpilot CHARACTER SET utf8mb4;
CREATE USER 'taskpilot'@'%' IDENTIFIED BY 'taskpilot';
GRANT ALL PRIVILEGES ON taskpilot.* TO 'taskpilot'@'%';
```

### 2. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# edit .env: set DATABASE_URL, JWT_SECRET_KEY, ANTHROPIC_API_KEY

uvicorn app.main:app --reload --port 8000
```

The API is now at `http://127.0.0.1:8000`, with interactive docs at
`http://127.0.0.1:8000/docs`.

You need an Anthropic API key for the AI breakdown feature — get one at
[console.anthropic.com](https://console.anthropic.com). Everything else
(auth, projects, tasks, Kanban) works without it.

### 3. Frontend

The frontend is static HTML/CSS/JS — no build step. Serve it with any static
file server, e.g.:

```bash
cd frontend
python3 -m http.server 5500
```

Open `http://127.0.0.1:5500`. Check `frontend/js/config.js` — it should point
at `http://127.0.0.1:8000`, which matches the backend default.

If you serve the frontend from a different origin/port, add it to
`CORS_ORIGINS` in the backend `.env`.

## Deploying (Render, free tier)

Render's free tier doesn't include managed MySQL, so pair it with a free
external MySQL instance:

1. **Provision MySQL** — free options include a small
   [Aiven](https://aiven.io) MySQL service, [Railway](https://railway.app), or
   PlanetScale's hobby tier. Note the connection details.
2. **Push this repo to GitHub.**
3. **In Render:** New → Blueprint → select the repo. `render.yaml` sets up two
   services:
   - `taskpilot-api` — the FastAPI backend (free web service, Python runtime).
   - `taskpilot-frontend` — the static frontend.
4. **Set environment variables on `taskpilot-api`:**
   - `DATABASE_URL=mysql+pymysql://user:password@host:port/dbname`
   - `ANTHROPIC_API_KEY=<your key>`
   - `CORS_ORIGINS=https://taskpilot-frontend.onrender.com` (your actual
     frontend URL — Render shows it once the static site deploys)
   - `JWT_SECRET_KEY` is auto-generated by the blueprint.
5. **Point the frontend at the API:** edit `frontend/js/config.js` to the
   deployed API URL (`https://taskpilot-api.onrender.com`), commit, and
   redeploy the static site — or set it at build time if you template it.

Render's free web services spin down after inactivity, so the first request
after idle time will be slow (cold start) — expected on the free tier.

### Alternative: AWS free tier

- **Backend**: an EC2 `t2.micro`/`t3.micro` instance running the FastAPI app
  behind `uvicorn`/`gunicorn` (or Elastic Beanstalk), free for 12 months on a
  new account.
- **Database**: RDS for MySQL on `db.t3.micro`, also free-tier eligible for
  12 months.
- **Frontend**: an S3 bucket with static website hosting (free tier covers a
  generous request/storage allowance), optionally fronted by CloudFront.

The application code doesn't change between hosts — only `DATABASE_URL`,
`CORS_ORIGINS`, and `frontend/js/config.js` need updating per environment.

## How the AI breakdown feature works

1. The user opens a project and clicks **AI breakdown**, typing a goal like
   *"Launch a marketing website."*
2. The frontend calls `POST /ai/breakdown` with the goal and project id.
3. The backend calls the Anthropic API with a system prompt instructing it to
   return a JSON array of subtasks (`title`, `description`, `estimated_hours`,
   `priority`) — no task is written to the database yet.
4. The suggestions render as editable rows: the user can rename tasks, adjust
   estimates, change priority, or drop any they don't want.
5. Clicking **Add these tasks to the project** calls
   `POST /ai/breakdown/apply`, which bulk-inserts the (possibly edited) list
   as real tasks in the `todo` column, tagged `ai_generated` so they're
   visibly marked with a ✦ badge in the UI.

## API quick reference

| Method | Path                                      | Purpose                          |
|--------|--------------------------------------------|-----------------------------------|
| POST   | `/auth/register`                           | Create account, returns JWT       |
| POST   | `/auth/login-json`                         | Login (JSON body), returns JWT    |
| GET    | `/auth/me`                                 | Current user                      |
| POST   | `/projects`                                | Create project                    |
| GET    | `/projects`                                | List my projects                  |
| PATCH  | `/projects/{id}`                           | Update project (owner only)       |
| DELETE | `/projects/{id}`                           | Delete project (owner only)       |
| GET/POST | `/projects/{id}/members`                 | List / add members                |
| DELETE | `/projects/{id}/members/{user_id}`         | Remove member                     |
| GET/POST | `/projects/{id}/tasks`                   | List / create tasks                |
| PATCH/DELETE | `/projects/{id}/tasks/{task_id}`     | Update / delete a task            |
| POST   | `/ai/breakdown`                            | Generate subtask suggestions      |
| POST   | `/ai/breakdown/apply`                      | Bulk-create tasks from suggestions|

Full interactive docs are auto-generated by FastAPI at `/docs`.
