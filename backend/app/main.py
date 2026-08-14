from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.config import settings
from app.routers import auth, projects, tasks, ai

# Create tables on startup if they don't exist yet (fine for an MVP;
# swap for Alembic migrations as the schema grows).
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="TaskPilot API",
    description="Full-stack project management tool with AI-powered task breakdown.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(ai.router)


@app.get("/")
def root():
    return {"status": "ok", "service": "TaskPilot API"}


@app.get("/health")
def health():
    return {"status": "healthy"}
