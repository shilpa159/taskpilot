import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import anthropic

from app.database import get_db
from app import models, schemas
from app.deps import get_current_user, get_project_for_member
from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai"])

SYSTEM_PROMPT = (
    "You are a project planning assistant embedded in a project management tool. "
    "Given a high-level goal, break it down into a concrete, sequenced list of subtasks "
    "a team could execute. Each subtask needs a short actionable title, a one-sentence "
    "description, a realistic estimated_hours (integer, effort for one person), and a "
    "priority of low, medium, or high. Respond ONLY with a JSON array of objects with keys "
    'exactly: "title", "description", "estimated_hours", "priority". No prose, no markdown '
    "fences, no commentary — just the raw JSON array."
)


def _extract_json_array(text: str) -> list:
    # Strip markdown code fences if the model added them despite instructions
    cleaned = re.sub(r"^```(json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start = cleaned.find("[")
    end = cleaned.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in model response")
    return json.loads(cleaned[start:end + 1])


@router.post("/breakdown", response_model=schemas.BreakdownResponse)
def breakdown_goal(
    payload: schemas.BreakdownRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    get_project_for_member(payload.project_id, db, user)

    if not settings.anthropic_api_key:
        raise HTTPException(
            status_code=503,
            detail="AI breakdown is not configured. Set ANTHROPIC_API_KEY on the server.",
        )

    count_hint = payload.task_count_hint or 6
    user_prompt = (
        f"High-level goal: {payload.goal.strip()}\n\n"
        f"Break this into roughly {count_hint} subtasks (fewer or more if it genuinely "
        "makes more sense). Order them the way a team would actually tackle them."
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
        )
        raw_text = "".join(
            block.text for block in response.content if getattr(block, "type", None) == "text"
        )
        parsed = _extract_json_array(raw_text)
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"AI provider error: {str(e)}")
    except (ValueError, json.JSONDecodeError):
        raise HTTPException(status_code=502, detail="Could not parse the AI response. Please try again.")

    subtasks = []
    for item in parsed:
        try:
            priority = str(item.get("priority", "medium")).lower()
            if priority not in ("low", "medium", "high"):
                priority = "medium"
            subtasks.append(
                schemas.SuggestedSubtask(
                    title=str(item["title"]).strip()[:200],
                    description=str(item.get("description", "")).strip(),
                    estimated_hours=max(0, int(item.get("estimated_hours", 4))),
                    priority=priority,
                )
            )
        except (KeyError, ValueError, TypeError):
            continue

    if not subtasks:
        raise HTTPException(status_code=502, detail="AI response did not contain usable subtasks. Try again.")

    return schemas.BreakdownResponse(goal=payload.goal, subtasks=subtasks)


@router.post("/breakdown/apply", response_model=list[schemas.TaskOut])
def apply_breakdown(
    payload: schemas.BreakdownApplyRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    """Bulk-create tasks in the project from a (possibly edited) list of AI suggestions."""
    get_project_for_member(payload.project_id, db, user)

    if not payload.subtasks:
        raise HTTPException(status_code=400, detail="No subtasks to apply")

    start_pos = (
        db.query(models.Task)
        .filter(models.Task.project_id == payload.project_id, models.Task.status == models.TaskStatus.todo)
        .count()
    )

    created = []
    for i, s in enumerate(payload.subtasks):
        task = models.Task(
            project_id=payload.project_id,
            title=s.title.strip()[:200],
            description=s.description,
            status=models.TaskStatus.todo,
            priority=s.priority,
            estimated_hours=s.estimated_hours,
            position=start_pos + i,
            ai_generated=1,
        )
        db.add(task)
        created.append(task)

    db.commit()
    for t in created:
        db.refresh(t)

    return [schemas.TaskOut.model_validate(t) for t in created]
