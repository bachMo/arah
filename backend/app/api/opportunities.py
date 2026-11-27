from __future__ import annotations

import math
import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import constellation
from app.agent.observatory import market_overview, user_position
from app.api.deps import SessionDep, current_user, current_user_optional
from app.core.db import utcnow
from app.models import Match, Opportunity, OpportunityKind, Preparation, User
from app.schemas import MatchOut, OpportunityDetail, OpportunityOut, Page

router = APIRouter(tags=["offres"])

Sort = Literal["recent", "deadline", "budget", "relevance"]


def apply_filters(
    query: Select,
    *,
    q: str | None,
    sector: str | None,
    country: str | None,
    kind: str | None,
    open_only: bool,
    contract: str | None = None,
    remote: bool | None = None,
    deadline_within: int | None,
    budget_min: int | None,
) -> Select:
    now = utcnow()
    if q:
        ts_query = func.websearch_to_tsquery("french", q)
        query = query.where(
            or_(Opportunity.search_vector.op("@@")(ts_query), Opportunity.title.ilike(f"%{q}%"))
        )
    if sector:
        query = query.where(Opportunity.sectors.any(sector))
    if country:
        query = query.where(Opportunity.country == country)
    if kind:
        query = query.where(Opportunity.kind == kind)
    if contract:
        query = query.where(Opportunity.contract_type == contract)
    if remote:
        query = query.where(Opportunity.remote.is_(True))
    if open_only:
        query = query.where(or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now))
    if deadline_within:
        query = query.where(Opportunity.deadline_at.between(now, now + timedelta(days=deadline_within)))
    if budget_min:
        query = query.where(Opportunity.budget_xof >= budget_min)
    return query


def opportunity_out(opp: Opportunity, match: Match | None) -> OpportunityOut:
    data = OpportunityOut.model_validate(opp)
    data.match = MatchOut.model_validate(match) if match else None
    return data


@router.get("/opportunities", response_model=Page)
async def list_opportunities(
    q: str | None = Query(default=None, max_length=120),
    sector: str | None = None,
    country: str | None = None,
    kind: str | None = None,
    contract: str | None = None,
    remote: bool | None = None,
    open_only: bool = True,
    deadline_within: int | None = Query(default=None, ge=1, le=365),
    budget_min: int | None = Query(default=None, ge=0),
    sort: Sort = "recent",
    page: int = Query(default=1, ge=1, le=500),
    size: int = Query(default=20, ge=1, le=50),
    user: User | None = Depends(current_user_optional),
    session: AsyncSession = SessionDep,
) -> Page:
    q = q.strip() if q else None
    base = apply_filters(
        select(Opportunity),
        q=q,
        sector=sector,
        country=country,
        kind=kind,
        contract=contract,
        remote=remote,
        open_only=open_only,
        deadline_within=deadline_within,
        budget_min=budget_min,
    )
    total = await session.scalar(select(func.count()).select_from(base.subquery())) or 0
    if sort == "deadline":
        base = base.order_by(Opportunity.deadline_at.asc().nulls_last(), Opportunity.created_at.desc())
    elif sort == "budget":
        base = base.order_by(Opportunity.budget_xof.desc().nulls_last())
    elif sort == "relevance" and q:
        base = base.order_by(
            func.ts_rank(Opportunity.search_vector, func.websearch_to_tsquery("french", q)).desc()
        )
    else:
        base = base.order_by(func.coalesce(Opportunity.published_at, Opportunity.created_at).desc())
    rows = (await session.scalars(base.offset((page - 1) * size).limit(size))).all()
    matches: dict[uuid.UUID, Match] = {}
    if user and rows:
        found = await session.scalars(
            select(Match).where(Match.user_id == user.id, Match.opportunity_id.in_([o.id for o in rows]))
        )
        matches = {m.opportunity_id: m for m in found}
    return Page(
        items=[opportunity_out(o, matches.get(o.id)) for o in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / size)),
    )


@router.get("/opportunities/{opportunity_id}", response_model=OpportunityDetail)
async def get_opportunity(
    opportunity_id: uuid.UUID,
    user: User | None = Depends(current_user_optional),
    session: AsyncSession = SessionDep,
) -> OpportunityDetail:
    opp = await session.get(Opportunity, opportunity_id)
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Cette offre n'existe pas ou a été retirée.")
    data = OpportunityDetail.model_validate(opp)
    if user:
        match = await session.scalar(
            select(Match).where(Match.user_id == user.id, Match.opportunity_id == opp.id)
        )
        if match:
            data.match = MatchOut.model_validate(match)
            if match.seen_at is None:
                match.seen_at = utcnow()
                await session.commit()
        data.has_preparation = bool(
            await session.scalar(
                select(Preparation.id).where(
                    Preparation.user_id == user.id, Preparation.opportunity_id == opp.id
                )
            )
        )
    return data


@router.get("/opportunities/{opportunity_id}/similar", response_model=list[OpportunityOut])
async def similar(opportunity_id: uuid.UUID, session: AsyncSession = SessionDep) -> list[OpportunityOut]:
    opp = await session.get(Opportunity, opportunity_id)
    if opp is None or not opp.sectors:
        return []
    now = utcnow()
    # Une offre d'emploi appelle d'autres offres d'emploi ; les autres types restent entre eux.
    is_job = opp.kind == OpportunityKind.job
    same_family = (
        Opportunity.kind == OpportunityKind.job if is_job else Opportunity.kind != OpportunityKind.job
    )
    rows = (
        await session.scalars(
            select(Opportunity)
            .where(
                Opportunity.id != opp.id,
                Opportunity.sectors.overlap(opp.sectors),
                same_family,
                or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now),
            )
            .order_by(func.similarity(Opportunity.title, opp.title).desc())
            .limit(4)
        )
    ).all()
    return [opportunity_out(o, None) for o in rows]


@router.get("/constellation")
async def get_constellation(
    user: User | None = Depends(current_user_optional), session: AsyncSession = SessionDep
) -> dict:
    now = utcnow()
    opps = (
        await session.scalars(
            select(Opportunity)
            .where(or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now))
            .order_by(Opportunity.created_at.desc())
            .limit(400)
        )
    ).all()
    scores: dict[uuid.UUID, int] | None = None
    key = "public"
    if user and user.profile:
        rows = await session.execute(
            select(Match.opportunity_id, Match.score).where(Match.user_id == user.id)
        )
        scores = {opp_id: score for opp_id, score in rows.all()}
        key = f"user:{user.id}:{len(scores)}:{sum(scores.values())}"
    return constellation.build(list(opps), scores, cache_key=f"{key}:{len(opps)}")


@router.get("/observatory")
async def observatory(sector: str | None = None, session: AsyncSession = SessionDep) -> dict:
    return await market_overview(session, sector)


@router.get("/observatory/me")
async def observatory_me(user: User = Depends(current_user), session: AsyncSession = SessionDep) -> dict:
    return await user_position(session, user)
