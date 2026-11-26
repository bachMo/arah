"""Journal public de l'agent, coûts du mois et dons : tout est visible par tous."""

from __future__ import annotations

import json
import logging
from datetime import date

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.ratelimit import donation_limit
from app.core.security import constant_time_equals, random_ref, sha256_hex
from app.models import AgentRun, Donation, DonationStatus, LedgerEntry, LedgerKind, LlmCall, Source
from app.schemas import DonationIn

router = APIRouter(tags=["transparence"])
log = logging.getLogger("arah.donations")


def month_start(day: date | None = None) -> date:
    day = day or utcnow().date()
    return day.replace(day=1)


def shift_month(day: date, delta: int) -> date:
    index = day.year * 12 + day.month - 1 + delta
    return date(index // 12, index % 12 + 1, 1)


async def month_totals(session: AsyncSession, month: date) -> dict[str, int]:
    settings = get_settings()
    next_month = shift_month(month, 1)
    ledger = (
        await session.execute(
            select(LedgerEntry.kind, func.coalesce(func.sum(LedgerEntry.amount_xof), 0))
            .where(LedgerEntry.month == month)
            .group_by(LedgerEntry.kind)
        )
    ).all()
    totals = {kind.value: int(amount) for kind, amount in ledger}
    llm_usd = (
        await session.scalar(
            select(func.coalesce(func.sum(LlmCall.cost_usd), 0.0)).where(
                LlmCall.created_at >= month, LlmCall.created_at < next_month
            )
        )
        or 0.0
    )
    llm_xof = round(float(llm_usd) * settings.usd_to_xof)
    return {
        "costs_xof": totals.get("cost", 0) + llm_xof,
        "llm_xof": llm_xof,
        "donations_xof": totals.get("donation", 0),
    }


@router.get("/transparency")
async def transparency(session: AsyncSession = SessionDep) -> dict:
    settings = get_settings()
    this_month = month_start()
    runs = (await session.scalars(select(AgentRun).order_by(AgentRun.started_at.desc()).limit(15))).all()
    sources = (await session.scalars(select(Source).order_by(Source.name))).all()
    history = []
    for offset in range(5, -1, -1):
        month = shift_month(this_month, -offset)
        history.append({"month": month.strftime("%Y-%m"), **(await month_totals(session, month))})
    cost_lines = (
        await session.scalars(
            select(LedgerEntry)
            .where(LedgerEntry.month == this_month, LedgerEntry.kind == LedgerKind.cost)
            .order_by(LedgerEntry.amount_xof.desc())
        )
    ).all()
    donors = (
        await session.scalars(
            select(Donation)
            .where(Donation.status == DonationStatus.paid, Donation.is_public.is_(True))
            .order_by(Donation.paid_at.desc())
            .limit(12)
        )
    ).all()
    usage = (
        await session.execute(
            select(
                LlmCall.purpose,
                func.count(),
                func.coalesce(func.sum(LlmCall.tokens_in + LlmCall.tokens_out), 0),
                func.coalesce(func.sum(LlmCall.cost_usd), 0.0),
            )
            .where(LlmCall.created_at >= this_month)
            .group_by(LlmCall.purpose)
        )
    ).all()
    current = history[-1]
    return {
        "month": {
            **current,
            "goal_xof": settings.donation_monthly_goal_xof,
            "lines": [{"label": c.label, "amount_xof": c.amount_xof} for c in cost_lines],
        },
        "history": history,
        "runs": [
            {
                "id": str(r.id),
                "kind": r.kind,
                "trigger": r.trigger,
                "status": r.status.value,
                "started_at": r.started_at.isoformat(),
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                "stats": r.stats,
                "steps": r.steps,
                "tokens": r.tokens_in + r.tokens_out,
                "cost_xof": round(r.cost_usd * settings.usd_to_xof),
            }
            for r in runs
        ],
        "sources": [
            {
                "slug": s.slug,
                "name": s.name,
                "kind": s.kind,
                "url": s.url,
                "description": s.description,
                "enabled": s.enabled,
                "last_run_at": s.last_run_at.isoformat() if s.last_run_at else None,
                "last_status": s.last_status,
                "last_found": s.last_found,
            }
            for s in sources
            if s.kind != "demo" or s.enabled
        ],
        "donors": [
            {
                "name": d.donor_name or "Anonyme",
                "amount_xof": d.amount_xof,
                "message": d.message,
                "date": d.paid_at.isoformat() if d.paid_at else None,
            }
            for d in donors
        ],
        "llm_usage": [
            {
                "purpose": p,
                "calls": n,
                "tokens": int(t),
                "cost_xof": round(float(c) * settings.usd_to_xof),
            }
            for p, n, t, c in usage
        ],
    }


@router.post("/donations/checkout", dependencies=[Depends(donation_limit)])
async def checkout(payload: DonationIn, session: AsyncSession = SessionDep) -> dict[str, str]:
    settings = get_settings()
    if not settings.paytech_enabled:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Le paiement en ligne n'est pas encore activé. Utilise Wave ou Orange Money.",
        )
    donation = Donation(
        ref=random_ref("DON-"),
        amount_xof=payload.amount_xof,
        donor_name=payload.donor_name.strip(),
        message=payload.message.strip(),
        is_public=payload.is_public,
    )
    session.add(donation)
    await session.commit()
    front, api = settings.public_url.rstrip("/"), settings.api_url.rstrip("/")
    body = {
        "item_name": f"Don à {settings.app_name}",
        "item_price": payload.amount_xof,
        "currency": "XOF",
        "ref_command": donation.ref,
        "command_name": f"Don de {payload.amount_xof} F CFA pour faire vivre {settings.app_name}",
        "env": settings.paytech_env,
        "ipn_url": f"{api}/api/donations/ipn",
        "success_url": f"{front}/soutenir?merci=1",
        "cancel_url": f"{front}/soutenir?annule=1",
        "custom_field": json.dumps({"ref": donation.ref}),
    }
    headers = {"API_KEY": settings.paytech_api_key or "", "API_SECRET": settings.paytech_api_secret or ""}
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://paytech.sn/api/payment/request-payment", json=body, headers=headers
            )
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        log.error("PayTech injoignable : %s", exc)
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail="Le service de paiement ne répond pas. Réessaie."
        ) from exc
    if int(data.get("success", 0)) != 1 or not data.get("redirect_url"):
        log.error("PayTech a refusé la demande : %s", str(data)[:300])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Le paiement n'a pas pu être initialisé.")
    return {"redirect_url": data["redirect_url"]}


@router.post("/donations/ipn")
async def paytech_ipn(request: Request, session: AsyncSession = SessionDep) -> dict[str, str]:
    settings = get_settings()
    if not settings.paytech_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    form = await request.form()
    key_ok = constant_time_equals(
        str(form.get("api_key_sha256", "")), sha256_hex(settings.paytech_api_key or "")
    )
    secret_ok = constant_time_equals(
        str(form.get("api_secret_sha256", "")), sha256_hex(settings.paytech_api_secret or "")
    )
    if not (key_ok and secret_ok):
        log.warning("Notification PayTech rejetée : signature invalide.")
        raise HTTPException(status.HTTP_403_FORBIDDEN)
    ref = str(form.get("ref_command", ""))
    donation = await session.scalar(select(Donation).where(Donation.ref == ref))
    if donation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    event = str(form.get("type_event", ""))
    if event == "sale_complete" and donation.status != DonationStatus.paid:
        amount = int(
            float(str(form.get("final_item_price") or form.get("item_price") or donation.amount_xof))
        )
        donation.status = DonationStatus.paid
        donation.amount_xof = amount
        donation.payment_method = str(form.get("payment_method", ""))[:60]
        donation.paid_at = utcnow()
        session.add(
            LedgerEntry(
                month=month_start(),
                kind=LedgerKind.donation,
                label=f"Don {donation.ref}",
                amount_xof=amount,
                public_name=donation.donor_name if donation.is_public else "",
                message=donation.message,
            )
        )
    elif event == "sale_canceled" and donation.status == DonationStatus.pending:
        donation.status = DonationStatus.cancelled
    await session.commit()
    return {"status": "ok"}
