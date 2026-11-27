from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Computed,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, utcnow


def _enum(cls: type[enum.Enum]) -> Enum:
    return Enum(cls, native_enum=False, length=24, values_callable=lambda e: [m.value for m in e])


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now(), nullable=False)


def _updated() -> Mapped[datetime]:
    return mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, server_default=func.now(), nullable=False
    )


def _str_array() -> Mapped[list[str]]:
    return mapped_column(ARRAY(String(120)), default=list, server_default="{}", nullable=False)


class AlertFrequency(enum.StrEnum):
    daily = "daily"
    weekly = "weekly"
    off = "off"


class OpportunityKind(enum.StrEnum):
    tender = "tender"
    consultancy = "consultancy"
    grant = "grant"
    competition = "competition"
    program = "program"
    job = "job"
    other = "other"


class MatchStatus(enum.StrEnum):
    new = "new"
    interested = "interested"
    preparing = "preparing"
    submitted = "submitted"
    ignored = "ignored"
    won = "won"
    lost = "lost"


class Feedback(enum.StrEnum):
    relevant = "relevant"
    not_relevant = "not_relevant"


class RunStatus(enum.StrEnum):
    running = "running"
    success = "success"
    partial = "partial"
    failed = "failed"


class LedgerKind(enum.StrEnum):
    cost = "cost"
    donation = "donation"


class DonationStatus(enum.StrEnum):
    pending = "pending"
    paid = "paid"
    cancelled = "cancelled"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    session_version: Mapped[int] = mapped_column(Integer, default=1)
    whatsapp_number: Mapped[str | None] = mapped_column(String(32))

    alert_frequency: Mapped[AlertFrequency] = mapped_column(
        _enum(AlertFrequency), default=AlertFrequency.daily
    )
    alert_min_score: Mapped[int] = mapped_column(Integer, default=60)
    alert_email: Mapped[bool] = mapped_column(Boolean, default=True)
    alert_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False)
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = _created()
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_digest_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    profile: Mapped[Profile | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan", lazy="selectin"
    )


class Profile(Base):
    __tablename__ = "profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    organization_name: Mapped[str] = mapped_column(String(200), default="")
    org_type: Mapped[str] = mapped_column(String(40), default="freelance")
    description: Mapped[str] = mapped_column(Text, default="")
    sectors: Mapped[list[str]] = _str_array()
    skills: Mapped[list[str]] = _str_array()
    countries: Mapped[list[str]] = _str_array()
    keywords_include: Mapped[list[str]] = _str_array()
    keywords_exclude: Mapped[list[str]] = _str_array()
    certifications: Mapped[list[str]] = _str_array()
    opportunity_kinds: Mapped[list[str]] = _str_array()
    budget_min: Mapped[int | None] = mapped_column(BigInteger)
    budget_max: Mapped[int | None] = mapped_column(BigInteger)
    team_size: Mapped[int | None] = mapped_column(Integer)
    past_references: Mapped[str] = mapped_column(Text, default="")
    # Profil candidat (emploi, stage, mission)
    profile_kind: Mapped[str] = mapped_column(
        String(20), default="organization", server_default="organization"
    )
    job_title: Mapped[str] = mapped_column(String(160), default="", server_default="")
    contract_types: Mapped[list[str]] = _str_array()
    experience_level: Mapped[str | None] = mapped_column(String(20))
    remote_ok: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    updated_at: Mapped[datetime] = _updated()

    user: Mapped[User] = relationship(back_populates="profile")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[uuid.UUID] = _pk()
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    name: Mapped[str] = mapped_column(String(160))
    kind: Mapped[str] = mapped_column(String(40))
    url: Mapped[str] = mapped_column(String(500), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_status: Mapped[str] = mapped_column(String(40), default="never")
    last_message: Mapped[str] = mapped_column(Text, default="")
    last_found: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = _created()


class Opportunity(Base):
    __tablename__ = "opportunities"
    __table_args__ = (
        UniqueConstraint("source_id", "external_id", name="uq_opportunities_source_external"),
        Index("ix_opportunities_search", "search_vector", postgresql_using="gin"),
        Index("ix_opportunities_sectors", "sectors", postgresql_using="gin"),
        Index(
            "ix_opportunities_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = _pk()
    source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sources.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(200))
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    url: Mapped[str] = mapped_column(String(1000), default="")
    title: Mapped[str] = mapped_column(String(600))
    issuer: Mapped[str] = mapped_column(String(300), default="")
    country: Mapped[str | None] = mapped_column(String(8), index=True)
    kind: Mapped[OpportunityKind] = mapped_column(_enum(OpportunityKind), default=OpportunityKind.other)
    sectors: Mapped[list[str]] = _str_array()
    language: Mapped[str] = mapped_column(String(8), default="fr")
    description: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    budget_amount: Mapped[int | None] = mapped_column(BigInteger)
    budget_currency: Mapped[str | None] = mapped_column(String(8))
    budget_xof: Mapped[int | None] = mapped_column(BigInteger, index=True)
    documents_required: Mapped[list[str]] = mapped_column(
        ARRAY(String(200)), default=list, server_default="{}"
    )
    eligibility: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    keywords: Mapped[list[str]] = _str_array()
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    # Offres d'emploi
    contract_type: Mapped[str | None] = mapped_column(String(20), index=True)
    experience_level: Mapped[str | None] = mapped_column(String(20))
    location: Mapped[str] = mapped_column(String(160), default="", server_default="")
    remote: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    apply_info: Mapped[str] = mapped_column(Text, default="", server_default="")
    enriched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    enrichment_method: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()
    search_vector: Mapped[Any] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('french', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('french', coalesce(issuer, '') || ' ' || coalesce(summary, '')), 'B') || "
            "setweight(to_tsvector('french', coalesce(description, '')), 'C')",
            persisted=True,
        ),
        deferred=True,
    )

    source: Mapped[Source] = relationship(lazy="joined")


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = (
        UniqueConstraint("user_id", "opportunity_id", name="uq_matches_user_opportunity"),
        Index("ix_matches_user_score", "user_id", "score"),
    )

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("opportunities.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[int] = mapped_column(Integer)
    rules_score: Mapped[int] = mapped_column(Integer, default=0)
    reasons: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    criteria: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    risks: Mapped[list[str]] = mapped_column(JSONB, default=list, server_default="[]")
    method: Mapped[str] = mapped_column(String(40), default="rules")
    status: Mapped[MatchStatus] = mapped_column(_enum(MatchStatus), default=MatchStatus.new, index=True)
    feedback: Mapped[Feedback | None] = mapped_column(_enum(Feedback))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()

    opportunity: Mapped[Opportunity] = relationship(lazy="joined")


class Preparation(Base):
    __tablename__ = "preparations"
    __table_args__ = (UniqueConstraint("user_id", "opportunity_id", name="uq_preparations_user_opportunity"),)

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    opportunity_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("opportunities.id", ondelete="CASCADE"))
    requirements: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    checklist: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    outline: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    letter: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    source_document_name: Mapped[str] = mapped_column(String(255), default="")
    method: Mapped[str] = mapped_column(String(80), default="")
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class VaultDocument(Base):
    __tablename__ = "vault_documents"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    doc_type: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(200), default="")
    reference: Mapped[str] = mapped_column(String(120), default="")
    issued_on: Mapped[date | None] = mapped_column(Date)
    expires_on: Mapped[date | None] = mapped_column(Date, index=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = _updated()


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    __table_args__ = (UniqueConstraint("user_id", "kind", "ref", name="uq_notification_logs_key"),)

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(40))
    ref: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = _created()


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[uuid.UUID] = _pk()
    kind: Mapped[str] = mapped_column(String(40), index=True)
    trigger: Mapped[str] = mapped_column(String(40), default="schedule")
    status: Mapped[RunStatus] = mapped_column(_enum(RunStatus), default=RunStatus.running)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stats: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default="[]")
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)


class LlmCall(Base):
    __tablename__ = "llm_calls"

    id: Mapped[uuid.UUID] = _pk()
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    purpose: Mapped[str] = mapped_column(String(40))
    provider: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(120))
    tokens_in: Mapped[int] = mapped_column(Integer, default=0)
    tokens_out: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = _pk()
    month: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[LedgerKind] = mapped_column(_enum(LedgerKind))
    label: Mapped[str] = mapped_column(String(200))
    amount_xof: Mapped[int] = mapped_column(BigInteger)
    public_name: Mapped[str] = mapped_column(String(120), default="")
    message: Mapped[str] = mapped_column(String(280), default="")
    created_at: Mapped[datetime] = _created()


class Donation(Base):
    __tablename__ = "donations"

    id: Mapped[uuid.UUID] = _pk()
    ref: Mapped[str] = mapped_column(String(64), unique=True)
    amount_xof: Mapped[int] = mapped_column(BigInteger)
    donor_name: Mapped[str] = mapped_column(String(120), default="")
    message: Mapped[str] = mapped_column(String(280), default="")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[DonationStatus] = mapped_column(_enum(DonationStatus), default=DonationStatus.pending)
    payment_method: Mapped[str] = mapped_column(String(60), default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()


class SubmissionStatus(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class JobSubmission(Base):
    """Offre d'emploi proposée par un recruteur, publiée seulement après validation."""

    __tablename__ = "job_submissions"

    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    status: Mapped[SubmissionStatus] = mapped_column(
        _enum(SubmissionStatus), default=SubmissionStatus.pending, index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    company: Mapped[str] = mapped_column(String(200))
    contract_type: Mapped[str] = mapped_column(String(20))
    experience_level: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(8), default="SN")
    location: Mapped[str] = mapped_column(String(160), default="")
    remote: Mapped[bool] = mapped_column(Boolean, default=False)
    sectors: Mapped[list[str]] = _str_array()
    description: Mapped[str] = mapped_column(Text)
    apply_url: Mapped[str] = mapped_column(String(1000), default="")
    apply_email: Mapped[str] = mapped_column(String(255), default="")
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    opportunity_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("opportunities.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = _created()
