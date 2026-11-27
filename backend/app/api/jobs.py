"""Offres d'emploi proposées par les recruteurs : dépôt, suivi, et validation par un administrateur."""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, date, datetime, time
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.enrich import apply_rules
from app.agent.pipeline import match_user
from app.api.deps import SessionDep, admin_user, current_user
from app.core.config import get_settings
from app.core.db import SessionLocal, utcnow
from app.core.ratelimit import RateLimit
from app.core.text import fingerprint
from app.llm.service import LLMService
from app.models import (
    JobSubmission,
    Opportunity,
    OpportunityKind,
    Profile,
    Source,
    SubmissionStatus,
    User,
)
from app.notify.email import send_email
from app.sources.direct import SLUG as DIRECT_SLUG
from app.sources.direct import SPEC as DIRECT_SPEC
from app.taxonomy import CONTRACT_TYPES, COUNTRY_BY_CODE, EXPERIENCE_LEVELS, SECTOR_BY_SLUG

log = logging.getLogger("arah.jobs")
router = APIRouter(tags=["emplois"])
submission_limit = RateLimit(5, 3600, "job_submission")


class SubmissionIn(BaseModel):
    title: str = Field(min_length=4, max_length=300)
    company: str = Field(min_length=2, max_length=200)
    contract_type: str
    experience_level: str | None = None
    country: str = "SN"
    location: str = Field(default="", max_length=160)
    remote: bool = False
    sectors: list[str] = Field(default_factory=list, max_length=3)
    description: str = Field(min_length=80, max_length=12000)
    apply_url: str = Field(default="", max_length=1000)
    apply_email: EmailStr | None = None
    deadline: date | None = None

    @field_validator("contract_type")
    @classmethod
    def _contract(cls, value: str) -> str:
        if value not in CONTRACT_TYPES:
            raise ValueError("Type de contrat inconnu.")
        return value

    @field_validator("experience_level")
    @classmethod
    def _level(cls, value: str | None) -> str | None:
        return value if value in EXPERIENCE_LEVELS else None

    @field_validator("country")
    @classmethod
    def _country(cls, value: str) -> str:
        return value if value in COUNTRY_BY_CODE else "SN"

    @field_validator("sectors")
    @classmethod
    def _sectors(cls, value: list[str]) -> list[str]:
        return [s for s in dict.fromkeys(value) if s in SECTOR_BY_SLUG]

    @field_validator("apply_url")
    @classmethod
    def _url(cls, value: str) -> str:
        value = value.strip()
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("Le lien de candidature doit commencer par https://")
        return value

    @field_validator("deadline")
    @classmethod
    def _deadline(cls, value: date | None) -> date | None:
        if value and value < date.today():
            raise ValueError("La date limite est déjà passée.")
        return value

    @model_validator(mode="after")
    def _contact(self) -> SubmissionIn:
        if not self.apply_url and not self.apply_email:
            raise ValueError("Indique un lien ou une adresse e-mail pour postuler.")
        return self


class SubmissionOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    status: str
    title: str
    company: str
    contract_type: str
    experience_level: str | None
    country: str
    location: str
    remote: bool
    sectors: list[str]
    description: str
    apply_url: str
    apply_email: str
    deadline_at: datetime | None
    review_note: str
    reviewed_at: datetime | None
    opportunity_id: uuid.UUID | None
    created_at: datetime


class ReviewIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: str = Field(default="", max_length=1000)


async def _notify(to: str, subject: str, **context: object) -> None:
    try:
        await send_email(to, subject, "submission", **context)
    except Exception:
        log.exception("Notification d'offre d'emploi impossible")


@router.post(
    "/jobs/submissions",
    response_model=SubmissionOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(submission_limit)],
)
async def submit_job(
    payload: SubmissionIn,
    background: BackgroundTasks,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> JobSubmission:
    if not user.is_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Confirme ton adresse e-mail avant de publier une offre."
        )
    pending = await session.scalar(
        select(JobSubmission.id)
        .where(JobSubmission.user_id == user.id, JobSubmission.status == SubmissionStatus.pending)
        .offset(9)
    )
    if pending:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, detail="Tu as déjà 10 offres en attente de validation."
        )
    data = payload.model_dump(exclude={"deadline", "apply_email"})
    submission = JobSubmission(
        **data,
        user_id=user.id,
        apply_email=str(payload.apply_email or ""),
        deadline_at=datetime.combine(payload.deadline, time(23, 59), tzinfo=UTC)
        if payload.deadline
        else None,
    )
    session.add(submission)
    await session.commit()
    await session.refresh(submission)
    settings = get_settings()
    for admin in settings.admin_emails:
        background.add_task(
            _notify,
            admin,
            "Nouvelle offre d'emploi à valider",
            headline="Nouvelle offre à valider",
            intro=f"{user.email} propose une offre d'emploi sur {settings.app_name}.",
            job_title=submission.title,
            company=submission.company,
            note="",
            action_url=f"{settings.public_url.rstrip('/')}/admin",
            action_label="Ouvrir l'administration",
        )
    return submission


@router.get("/jobs/submissions/mine", response_model=list[SubmissionOut])
async def my_submissions(user: User = Depends(current_user), session: AsyncSession = SessionDep) -> list:
    rows = await session.scalars(
        select(JobSubmission)
        .where(JobSubmission.user_id == user.id)
        .order_by(JobSubmission.created_at.desc())
    )
    return list(rows.all())


# --- Validation ------------------------------------------------------------------------------------


@router.get("/admin/submissions", response_model=list[SubmissionOut], dependencies=[Depends(admin_user)])
async def list_submissions(
    state: Literal["pending", "approved", "rejected"] = "pending", session: AsyncSession = SessionDep
) -> list:
    rows = await session.scalars(
        select(JobSubmission)
        .where(JobSubmission.status == SubmissionStatus(state))
        .order_by(JobSubmission.created_at.desc())
        .limit(100)
    )
    return list(rows.all())


async def _direct_source(session: AsyncSession) -> Source:
    source = await session.scalar(select(Source).where(Source.slug == DIRECT_SLUG))
    if source is None:
        source = Source(**DIRECT_SPEC, enabled=True)
        session.add(source)
        await session.flush()
    return source


def _apply_text(submission: JobSubmission) -> str:
    lines = []
    if submission.apply_url:
        lines.append(f"Postuler en ligne : {submission.apply_url}")
    if submission.apply_email:
        lines.append(f"Envoyer sa candidature à : {submission.apply_email}")
    return "\n".join(lines)


async def match_new_opportunity(opportunity_id: uuid.UUID) -> None:
    """Calcule tout de suite les correspondances de l'offre publiée, par règles, pour tous les profils."""
    async with SessionLocal() as session:
        opp = await session.get(Opportunity, opportunity_id)
        if opp is None:
            return
        users = (await session.scalars(select(User).join(Profile, Profile.user_id == User.id))).all()
        rules_only = LLMService()
        rules_only.provider = None  # l'IA affinera ces scores à la prochaine veille
        for user in users:
            try:
                await match_user(session, user, rules_only, candidates=[opp])
            except Exception:
                await session.rollback()
                log.exception("Correspondances impossibles pour une offre publiée")


@router.post(
    "/admin/submissions/{submission_id}",
    response_model=SubmissionOut,
    dependencies=[Depends(admin_user)],
)
async def review_submission(
    submission_id: uuid.UUID,
    payload: ReviewIn,
    background: BackgroundTasks,
    session: AsyncSession = SessionDep,
) -> JobSubmission:
    submission = await session.get(JobSubmission, submission_id)
    if submission is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Offre introuvable.")
    if submission.status != SubmissionStatus.pending:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Cette offre a déjà été traitée.")
    settings = get_settings()
    submission.reviewed_at = utcnow()
    submission.review_note = payload.note.strip()
    if payload.decision == "reject":
        submission.status = SubmissionStatus.rejected
    else:
        source = await _direct_source(session)
        opp = Opportunity(
            source_id=source.id,
            external_id=f"sub-{submission.id}",
            content_hash=fingerprint(submission.title, submission.company),
            url=submission.apply_url,
            title=submission.title,
            issuer=submission.company,
            country=submission.country,
            kind=OpportunityKind.job,
            sectors=list(submission.sectors),
            language="fr",
            description=submission.description,
            published_at=utcnow(),
            deadline_at=submission.deadline_at,
            contract_type=submission.contract_type,
            experience_level=submission.experience_level,
            location=submission.location,
            remote=submission.remote,
            apply_info=_apply_text(submission),
        )
        apply_rules(opp)
        session.add(opp)
        await session.flush()
        submission.status = SubmissionStatus.approved
        submission.opportunity_id = opp.id
        background.add_task(match_new_opportunity, opp.id)
    await session.commit()
    await session.refresh(submission)

    owner = await session.get(User, submission.user_id) if submission.user_id else None
    if owner is not None:
        approved = submission.status == SubmissionStatus.approved
        base = settings.public_url.rstrip("/")
        background.add_task(
            _notify,
            owner.email,
            "Ton offre est en ligne" if approved else "Ton offre n'a pas été publiée",
            headline="Ton offre est en ligne" if approved else "Ton offre n'a pas été publiée",
            intro=(
                f"Ton offre a été validée : elle est visible sur {settings.app_name} et proposée aux profils qui lui correspondent."
                if approved
                else "Après relecture, ton offre n'a pas été publiée."
            ),
            job_title=submission.title,
            company=submission.company,
            note=submission.review_note,
            action_url=f"{base}/offre/{submission.opportunity_id}"
            if approved
            else f"{base}/publier-une-offre",
            action_label="Voir l'offre" if approved else "Proposer une nouvelle offre",
        )
    return submission
