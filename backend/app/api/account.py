"""Coffre de documents et réglages des alertes."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep, current_user
from app.core.config import get_settings
from app.core.security import TokenError, read_action_token
from app.models import AlertFrequency, User, VaultDocument
from app.notify.whatsapp import normalize_phone
from app.schemas import AlertSettings, VaultIn, VaultOut

router = APIRouter(tags=["compte"])


@router.get("/vault", response_model=list[VaultOut])
async def list_documents(
    user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> list[VaultDocument]:
    rows = await session.scalars(
        select(VaultDocument)
        .where(VaultDocument.user_id == user.id)
        .order_by(VaultDocument.expires_on.asc().nulls_last(), VaultDocument.created_at)
    )
    return list(rows.all())


@router.post("/vault", response_model=VaultOut, status_code=201)
async def add_document(
    payload: VaultIn, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> VaultDocument:
    count = len(
        (await session.scalars(select(VaultDocument.id).where(VaultDocument.user_id == user.id))).all()
    )
    if count >= 100:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Ton coffre contient déjà 100 documents.")
    doc = VaultDocument(user_id=user.id, **payload.model_dump())
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    return doc


async def _owned(session: AsyncSession, user: User, doc_id: uuid.UUID) -> VaultDocument:
    doc = await session.get(VaultDocument, doc_id)
    if doc is None or doc.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Document introuvable.")
    return doc


@router.put("/vault/{doc_id}", response_model=VaultOut)
async def update_document(
    doc_id: uuid.UUID,
    payload: VaultIn,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> VaultDocument:
    doc = await _owned(session, user, doc_id)
    for key, value in payload.model_dump().items():
        setattr(doc, key, value)
    await session.commit()
    await session.refresh(doc)
    return doc


@router.delete("/vault/{doc_id}", status_code=204)
async def delete_document(
    doc_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> None:
    doc = await _owned(session, user, doc_id)
    await session.delete(doc)
    await session.commit()


@router.get("/settings/alerts", response_model=AlertSettings)
async def get_alerts(user: User = Depends(current_user)) -> AlertSettings:
    return AlertSettings(
        alert_frequency=user.alert_frequency.value,
        alert_min_score=user.alert_min_score,
        alert_email=user.alert_email,
        alert_whatsapp=user.alert_whatsapp,
        reminders_enabled=user.reminders_enabled,
        whatsapp_number=user.whatsapp_number,
        full_name=user.full_name,
    )


@router.put("/settings/alerts", response_model=AlertSettings)
async def save_alerts(
    payload: AlertSettings, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> AlertSettings:
    user.alert_frequency = AlertFrequency(payload.alert_frequency)
    user.alert_min_score = payload.alert_min_score
    user.alert_email = payload.alert_email
    user.reminders_enabled = payload.reminders_enabled
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.whatsapp_number:
        phone = normalize_phone(payload.whatsapp_number)
        if phone is None:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Numéro WhatsApp invalide (ex. +221 77 123 45 67).",
            )
        user.whatsapp_number = phone
    elif payload.whatsapp_number == "":
        user.whatsapp_number = None
    user.alert_whatsapp = bool(
        payload.alert_whatsapp and user.whatsapp_number and get_settings().whatsapp_ready
    )
    await session.commit()
    return await get_alerts(user)


async def _unsubscribe(session: AsyncSession, token: str) -> bool:
    try:
        data = read_action_token(token, "unsubscribe")
        user = await session.get(User, uuid.UUID(data["sub"]))
    except (TokenError, ValueError, KeyError):
        return False
    if user is None:
        return False
    user.alert_frequency = AlertFrequency.off
    await session.commit()
    return True


@router.get("/alerts/unsubscribe")
async def unsubscribe_link(token: str, session: AsyncSession = SessionDep) -> RedirectResponse:
    ok = await _unsubscribe(session, token)
    front = get_settings().public_url.rstrip("/")
    return RedirectResponse(f"{front}/desabonnement?{'ok=1' if ok else 'erreur=1'}", status_code=303)


@router.post("/alerts/unsubscribe")
async def unsubscribe_one_click(
    request: Request, token: str, session: AsyncSession = SessionDep
) -> HTMLResponse:
    # Désinscription en un clic (RFC 8058), déclenchée directement par les messageries.
    ok = await _unsubscribe(session, token)
    return HTMLResponse("OK" if ok else "Lien invalide", status_code=200 if ok else 400)
