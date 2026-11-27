from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline import first_match_for_user
from app.agent.profile_extract import ProfileSuggestion, suggest_profile
from app.api.deps import SessionDep, current_user
from app.core.ratelimit import llm_limit
from app.llm.service import BudgetExceeded, get_llm
from app.models import Profile, User
from app.schemas import DescribeIn, ProfileIn, ProfileOut

router = APIRouter(prefix="/profile", tags=["profil"])


@router.get("", response_model=ProfileOut | None)
async def get_profile(user: User = Depends(current_user)) -> Profile | None:
    return user.profile


@router.put("", response_model=ProfileOut)
async def save_profile(
    payload: ProfileIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> Profile:
    if payload.budget_min and payload.budget_max and payload.budget_min > payload.budget_max:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Le montant minimum dépasse le maximum."
        )
    profile = user.profile
    if profile is None:
        profile = Profile(user_id=user.id)
        session.add(profile)
    for field, value in payload.model_dump().items():
        setattr(profile, field, value)
    await session.commit()
    await session.refresh(profile)
    background.add_task(first_match_for_user, user.id)
    return profile


@router.post("/suggest", response_model=ProfileSuggestion, dependencies=[Depends(llm_limit)])
async def suggest(
    payload: DescribeIn, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> ProfileSuggestion:
    try:
        suggestion = await suggest_profile(
            session, get_llm(), payload.description, user_id=user.id, profile_kind=payload.profile_kind
        )
    except BudgetExceeded as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    await session.commit()
    return suggestion
