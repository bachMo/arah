from __future__ import annotations

import asyncio
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.pipeline import run_daily, run_reminders
from app.api.deps import SessionDep, admin_user
from app.api.transparency import month_start
from app.models import LedgerEntry, LedgerKind, Match, Opportunity, Source, User
from app.schemas import LedgerIn, SourceIn, SourcePatch
from app.sources import adapter_kinds, get_adapter

router = APIRouter(prefix="/admin", tags=["administration"], dependencies=[Depends(admin_user)])
_background: set[asyncio.Task] = set()


@router.get("/overview")
async def overview(session: AsyncSession = SessionDep) -> dict:
    users = await session.scalar(select(func.count(User.id))) or 0
    verified = await session.scalar(select(func.count(User.id)).where(User.is_verified.is_(True))) or 0
    opportunities = await session.scalar(select(func.count(Opportunity.id))) or 0
    matches = await session.scalar(select(func.count(Match.id))) or 0
    sources = (await session.scalars(select(Source).order_by(Source.name))).all()
    ledger = (
        await session.scalars(
            select(LedgerEntry)
            .where(LedgerEntry.month == month_start())
            .order_by(LedgerEntry.created_at.desc())
        )
    ).all()
    return {
        "users": users,
        "verified_users": verified,
        "opportunities": opportunities,
        "matches": matches,
        "source_kinds": adapter_kinds(),
        "sources": [
            {
                "id": str(s.id),
                "slug": s.slug,
                "name": s.name,
                "kind": s.kind,
                "url": s.url,
                "enabled": s.enabled,
                "description": s.description,
                "config": s.config,
                "last_status": s.last_status,
                "last_message": s.last_message,
                "last_found": s.last_found,
                "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
            }
            for s in sources
        ],
        "ledger": [
            {
                "id": str(e.id),
                "kind": e.kind.value,
                "label": e.label,
                "amount_xof": e.amount_xof,
                "month": e.month.isoformat(),
            }
            for e in ledger
        ],
    }


@router.post("/run", status_code=202)
async def trigger(kind: Literal["veille", "rappels"] = "veille") -> dict[str, str]:
    job = run_daily("manuel") if kind == "veille" else run_reminders("manuel")
    task = asyncio.create_task(job)
    _background.add(task)
    task.add_done_callback(_background.discard)
    return {"detail": "L'agent est lancé. Suis son activité sur la page Journal."}


@router.post("/sources", status_code=201)
async def create_source(payload: SourceIn, session: AsyncSession = SessionDep) -> dict[str, str]:
    if get_adapter(payload.kind) is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Type de source inconnu.")
    if await session.scalar(select(Source.id).where(Source.slug == payload.slug)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Cet identifiant est déjà utilisé.")
    source = Source(**payload.model_dump())
    session.add(source)
    await session.commit()
    return {"id": str(source.id)}


@router.patch("/sources/{source_id}")
async def update_source(
    source_id: uuid.UUID, payload: SourcePatch, session: AsyncSession = SessionDep
) -> dict[str, str]:
    source = await session.get(Source, source_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Source introuvable.")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(source, key, value)
    await session.commit()
    return {"detail": "Source mise à jour."}


@router.post("/ledger", status_code=201)
async def add_ledger(payload: LedgerIn, session: AsyncSession = SessionDep) -> dict[str, str]:
    entry = LedgerEntry(
        month=payload.month.replace(day=1),
        kind=LedgerKind(payload.kind),
        label=payload.label.strip(),
        amount_xof=payload.amount_xof,
        public_name=payload.public_name.strip(),
    )
    session.add(entry)
    await session.commit()
    return {"id": str(entry.id)}


@router.delete("/ledger/{entry_id}", status_code=204)
async def delete_ledger(entry_id: uuid.UUID, session: AsyncSession = SessionDep) -> None:
    entry = await session.get(LedgerEntry, entry_id)
    if entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    await session.delete(entry)
    await session.commit()
