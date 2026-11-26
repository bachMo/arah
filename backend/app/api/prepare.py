from __future__ import annotations

import re
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import PlainTextResponse
from pypdf.errors import PdfReadError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.writer import draft_response, export_markdown, new_id, read_pdf
from app.api.deps import SessionDep, current_user
from app.core.db import utcnow
from app.core.ratelimit import llm_limit
from app.core.text import normalize
from app.llm.service import BudgetExceeded, get_llm
from app.models import Match, MatchStatus, Opportunity, Preparation, User
from app.schemas import PreparationIn, PreparationOut

router = APIRouter(prefix="/prepare", tags=["préparation"])
MAX_UPLOAD_BYTES = 15 * 1024 * 1024


async def _load(
    session: AsyncSession, user: User, opportunity_id: uuid.UUID
) -> tuple[Opportunity, Preparation | None]:
    opp = await session.get(Opportunity, opportunity_id)
    if opp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Offre introuvable.")
    prep = await session.scalar(
        select(Preparation).where(Preparation.user_id == user.id, Preparation.opportunity_id == opp.id)
    )
    return opp, prep


@router.get("/{opportunity_id}", response_model=PreparationOut | None)
async def get_preparation(
    opportunity_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> Preparation | None:
    _, prep = await _load(session, user, opportunity_id)
    return prep


@router.post("/{opportunity_id}/generate", response_model=PreparationOut, dependencies=[Depends(llm_limit)])
async def generate(
    opportunity_id: uuid.UUID,
    document: UploadFile | None = File(default=None),
    document_text: str = Form(default="", max_length=60000),
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> Preparation:
    opp, prep = await _load(session, user, opportunity_id)
    text = document_text.strip()
    doc_name = ""
    if document is not None and document.filename:
        content = await document.read(MAX_UPLOAD_BYTES + 1)
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="Le fichier dépasse 15 Mo.")
        if not content.startswith(b"%PDF"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Seuls les fichiers PDF sont acceptés.")
        try:
            text = read_pdf(content) or text
        except (PdfReadError, ValueError) as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Impossible de lire ce PDF.") from exc
        doc_name = re.sub(r"[^\w.\- ]", "", document.filename)[:200]

    try:
        draft, method = await draft_response(
            session, get_llm(), user=user, profile=user.profile, opp=opp, document_text=text
        )
    except BudgetExceeded as exc:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc

    previous_done = set()
    if prep is not None:
        previous_done = {
            normalize(i.get("label", "")) for i in [*prep.checklist, *prep.requirements] if i.get("done")
        }
    else:
        prep = Preparation(user_id=user.id, opportunity_id=opp.id)
        session.add(prep)
    prep.requirements = [
        {"id": new_id(), **r.model_dump(), "done": normalize(r.label) in previous_done}
        for r in draft.requirements
    ]
    prep.checklist = [
        {"id": new_id(), "label": c, "done": normalize(c) in previous_done} for c in draft.checklist
    ]
    prep.outline = [s.model_dump() for s in draft.outline]
    prep.letter = draft.letter
    prep.method = method
    prep.validated_at = None
    if doc_name:
        prep.source_document_name = doc_name

    match = await session.scalar(
        select(Match).where(Match.user_id == user.id, Match.opportunity_id == opp.id)
    )
    if match and match.status in (MatchStatus.new, MatchStatus.interested):
        match.status = MatchStatus.preparing
    await session.commit()
    await session.refresh(prep)
    return prep


@router.put("/{opportunity_id}", response_model=PreparationOut)
async def save(
    opportunity_id: uuid.UUID,
    payload: PreparationIn,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> Preparation:
    opp, prep = await _load(session, user, opportunity_id)
    if prep is None:
        prep = Preparation(user_id=user.id, opportunity_id=opp.id, method="manuel")
        session.add(prep)
    data = payload.model_dump(exclude_none=True)
    for key in ("requirements", "checklist"):
        if key in data:
            data[key] = [{**item, "id": item.get("id") or new_id()} for item in data[key]]
    for key, value in data.items():
        setattr(prep, key, value)
    prep.validated_at = None
    await session.commit()
    await session.refresh(prep)
    return prep


@router.post("/{opportunity_id}/validate", response_model=PreparationOut)
async def validate(
    opportunity_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> Preparation:
    _, prep = await _load(session, user, opportunity_id)
    if prep is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Aucune préparation à valider.")
    prep.validated_at = utcnow()
    await session.commit()
    await session.refresh(prep)
    return prep


@router.get("/{opportunity_id}/export", response_class=PlainTextResponse)
async def export(
    opportunity_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> PlainTextResponse:
    opp, prep = await _load(session, user, opportunity_id)
    if prep is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Aucune préparation pour cette offre.")
    content = export_markdown(opp, prep.requirements, prep.checklist, prep.outline, prep.letter, prep.notes)
    slug = re.sub(r"[^a-z0-9]+", "-", normalize(opp.title))[:60].strip("-") or "reponse"
    return PlainTextResponse(
        content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="arah-{slug}.md"'},
    )
