from __future__ import annotations

import math
import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.matching import OpportunityData, ProfileData, score_match
from app.api.deps import SessionDep, current_user
from app.api.opportunities import opportunity_out
from app.core.db import utcnow
from app.models import Feedback, Match, MatchStatus, Opportunity, User
from app.schemas import MatchUpdate, OpportunityOut, Page

router = APIRouter(prefix="/radar", tags=["radar"])

ACTIVE = [MatchStatus.new, MatchStatus.interested, MatchStatus.preparing, MatchStatus.submitted]
PREP_DAYS = {"tender": 10, "consultancy": 7, "grant": 12, "competition": 5, "program": 4, "other": 6}


@router.get("", response_model=Page)
async def radar(
    view: Literal[
        "active", "new", "interested", "preparing", "submitted", "ignored", "won", "lost", "all"
    ] = "active",
    min_score: int = Query(default=0, ge=0, le=100),
    sector: str | None = None,
    q: str | None = Query(default=None, max_length=120),
    sort: Literal["score", "deadline", "recent"] = "score",
    page: int = Query(default=1, ge=1, le=500),
    size: int = Query(default=20, ge=1, le=50),
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> Page:
    now = utcnow()
    query = (
        select(Match, Opportunity)
        .join(Opportunity, Opportunity.id == Match.opportunity_id)
        .where(Match.user_id == user.id, Match.score >= min_score)
    )
    if view == "active":
        query = query.where(
            Match.status.in_(ACTIVE), or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now)
        )
    elif view != "all":
        query = query.where(Match.status == MatchStatus(view))
    if sector:
        query = query.where(Opportunity.sectors.any(sector))
    if q:
        query = query.where(
            or_(Opportunity.title.ilike(f"%{q.strip()}%"), Opportunity.issuer.ilike(f"%{q.strip()}%"))
        )
    total = await session.scalar(select(func.count()).select_from(query.subquery())) or 0
    if sort == "deadline":
        query = query.order_by(Opportunity.deadline_at.asc().nulls_last(), Match.score.desc())
    elif sort == "recent":
        query = query.order_by(Match.created_at.desc())
    else:
        query = query.order_by(Match.score.desc(), Opportunity.deadline_at.asc().nulls_last())
    rows = (await session.execute(query.offset((page - 1) * size).limit(size))).all()
    return Page(
        items=[opportunity_out(o, m) for m, o in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / size)),
    )


@router.get("/summary")
async def summary(user: User = Depends(current_user), session: AsyncSession = SessionDep) -> dict:
    now = utcnow()
    open_clause = or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now)
    rows = (
        await session.execute(
            select(Match.status, func.count())
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .where(
                Match.user_id == user.id,
                or_(
                    open_clause, Match.status.in_([MatchStatus.won, MatchStatus.lost, MatchStatus.submitted])
                ),
            )
            .group_by(Match.status)
        )
    ).all()
    counts = {status.value: n for status, n in rows}
    week = (
        await session.scalar(
            select(func.count(Match.id))
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .where(
                Match.user_id == user.id,
                Match.status.in_(ACTIVE),
                Opportunity.deadline_at.between(now, now + timedelta(days=7)),
            )
        )
        or 0
    )
    fresh = (
        await session.scalar(
            select(func.count(Match.id)).where(
                Match.user_id == user.id, Match.created_at >= now - timedelta(hours=24)
            )
        )
        or 0
    )
    unseen = (
        await session.scalar(
            select(func.count(Match.id))
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .where(
                Match.user_id == user.id,
                Match.seen_at.is_(None),
                Match.status == MatchStatus.new,
                open_clause,
            )
        )
        or 0
    )
    best = await session.scalar(
        select(func.max(Match.score))
        .join(Opportunity, Opportunity.id == Match.opportunity_id)
        .where(Match.user_id == user.id, Match.status.in_(ACTIVE), open_clause)
    )
    return {
        "counts": counts,
        "active": sum(counts.get(s.value, 0) for s in ACTIVE),
        "deadlines_this_week": week,
        "new_today": fresh,
        "unseen": unseen,
        "best_score": best or 0,
    }


@router.get("/timeline")
async def timeline(user: User = Depends(current_user), session: AsyncSession = SessionDep) -> list[dict]:
    """Météo des dates limites : les offres suivies, placées sur leur date, avec le temps de préparation estimé."""
    now = utcnow()
    rows = (
        await session.execute(
            select(Match, Opportunity)
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .where(
                Match.user_id == user.id,
                Opportunity.deadline_at.between(now, now + timedelta(days=70)),
                or_(
                    Match.status.in_([MatchStatus.interested, MatchStatus.preparing, MatchStatus.submitted]),
                    (Match.status == MatchStatus.new) & (Match.score >= 70),
                ),
            )
            .order_by(Opportunity.deadline_at)
            .limit(60)
        )
    ).all()
    items = []
    for match, opp in rows:
        prep = PREP_DAYS.get(opp.kind.value, 6) + (4 if (opp.budget_xof or 0) >= 100_000_000 else 0)
        remaining = (opp.deadline_at - now).days
        items.append(
            {
                "id": str(opp.id),
                "title": opp.title,
                "issuer": opp.issuer,
                "deadline": opp.deadline_at.isoformat(),
                "days_left": remaining,
                "prep_days": prep,
                "feasible": remaining >= prep,
                "status": match.status.value,
                "score": match.score,
            }
        )
    return items


@router.patch("/{opportunity_id}", response_model=OpportunityOut)
async def update_match(
    opportunity_id: uuid.UUID,
    payload: MatchUpdate,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> OpportunityOut:
    opp = await session.get(Opportunity, opportunity_id)
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Offre introuvable.")
    match = await session.scalar(
        select(Match).where(Match.user_id == user.id, Match.opportunity_id == opp.id)
    )
    if match is None:
        result = score_match(
            ProfileData.from_model(user.profile) if user.profile else ProfileData(),
            OpportunityData.from_model(opp),
        )
        match = Match(
            user_id=user.id,
            opportunity_id=opp.id,
            score=result.score,
            rules_score=result.score,
            reasons=result.reasons,
            criteria=result.criteria,
            risks=result.risks,
            method="règles",
            notified_at=utcnow(),
            seen_at=utcnow(),
        )
        session.add(match)
    if payload.status:
        match.status = MatchStatus(payload.status)
    if payload.feedback:
        match.feedback = None if payload.feedback == "none" else Feedback(payload.feedback)
        if match.feedback == Feedback.not_relevant and match.status == MatchStatus.new:
            match.status = MatchStatus.ignored
    await session.commit()
    await session.refresh(match)
    return opportunity_out(opp, match)
