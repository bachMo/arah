from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.text import clean_list
from app.taxonomy import (
    CONTRACT_TYPES,
    COUNTRY_BY_CODE,
    DOC_TYPES,
    EXPERIENCE_LEVELS,
    OPPORTUNITY_KINDS,
    ORG_TYPES,
    SECTOR_BY_SLUG,
)


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Authentification ---------------------------------------------------------------------------


def check_password_strength(value: str) -> str:
    if value.isdigit() or value.isalpha() or len(set(value)) < 4:
        raise ValueError("Choisis un mot de passe d'au moins 8 caractères mêlant lettres et chiffres.")
    return value


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(default="", max_length=160)

    @field_validator("password")
    @classmethod
    def _strong(cls, value: str) -> str:
        return check_password_strength(value)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailIn(BaseModel):
    email: EmailStr


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=2000)


class ResetIn(TokenIn):
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def _strong(cls, value: str) -> str:
        return check_password_strength(value)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(default="", max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong(cls, value: str) -> str:
        return check_password_strength(value)


class UserOut(ORM):
    id: uuid.UUID
    email: str
    full_name: str
    is_verified: bool
    is_admin: bool
    has_password: bool = False
    has_profile: bool = False
    created_at: datetime


# --- Profil ---------------------------------------------------------------------------------------


def _filtered(values: list[str], allowed: dict[str, Any]) -> list[str]:
    return [v for v in dict.fromkeys(values) if v in allowed]


class ProfileIn(BaseModel):
    organization_name: str = Field(default="", max_length=200)
    org_type: str = "freelance"
    description: str = Field(default="", max_length=6000)
    sectors: list[str] = Field(default_factory=list, max_length=8)
    skills: list[str] = Field(default_factory=list, max_length=30)
    countries: list[str] = Field(default_factory=list, max_length=30)
    keywords_include: list[str] = Field(default_factory=list, max_length=30)
    keywords_exclude: list[str] = Field(default_factory=list, max_length=30)
    certifications: list[str] = Field(default_factory=list, max_length=20)
    opportunity_kinds: list[str] = Field(default_factory=list, max_length=8)
    budget_min: int | None = Field(default=None, ge=0)
    budget_max: int | None = Field(default=None, ge=0)
    team_size: int | None = Field(default=None, ge=1, le=100000)
    past_references: str = Field(default="", max_length=6000)
    profile_kind: Literal["organization", "candidate"] = "organization"
    job_title: str = Field(default="", max_length=160)
    contract_types: list[str] = Field(default_factory=list, max_length=6)
    experience_level: str | None = None
    remote_ok: bool = False

    @field_validator("contract_types")
    @classmethod
    def _contracts(cls, value: list[str]) -> list[str]:
        return _filtered(value, CONTRACT_TYPES)

    @field_validator("experience_level")
    @classmethod
    def _level(cls, value: str | None) -> str | None:
        return value if value in EXPERIENCE_LEVELS else None

    @field_validator("job_title")
    @classmethod
    def _title(cls, value: str) -> str:
        return value.strip()

    @field_validator("org_type")
    @classmethod
    def _org(cls, value: str) -> str:
        return value if value in ORG_TYPES else "autre"

    @field_validator("sectors")
    @classmethod
    def _sectors(cls, value: list[str]) -> list[str]:
        return _filtered(value, SECTOR_BY_SLUG)

    @field_validator("countries")
    @classmethod
    def _countries(cls, value: list[str]) -> list[str]:
        return _filtered(value, COUNTRY_BY_CODE)

    @field_validator("opportunity_kinds")
    @classmethod
    def _kinds(cls, value: list[str]) -> list[str]:
        return _filtered(value, OPPORTUNITY_KINDS)

    @field_validator("skills", "keywords_include", "keywords_exclude", "certifications")
    @classmethod
    def _clean(cls, value: list[str]) -> list[str]:
        return clean_list(value, limit=30, max_len=80)


class ProfileOut(ProfileIn, ORM):
    updated_at: datetime | None = None


class DescribeIn(BaseModel):
    description: str = Field(min_length=20, max_length=6000)
    profile_kind: Literal["organization", "candidate"] = "organization"


# --- Offres ---------------------------------------------------------------------------------------


class SourceBrief(ORM):
    slug: str
    name: str


class MatchOut(ORM):
    score: int
    reasons: list[str]
    criteria: list[dict[str, Any]]
    risks: list[str]
    method: str
    status: str
    feedback: str | None
    created_at: datetime


class OpportunityOut(ORM):
    id: uuid.UUID
    title: str
    issuer: str
    url: str
    country: str | None
    kind: str
    sectors: list[str]
    summary: str
    budget_amount: int | None
    budget_currency: str | None
    budget_xof: int | None
    published_at: datetime | None
    deadline_at: datetime | None
    is_demo: bool
    contract_type: str | None = None
    experience_level: str | None = None
    location: str = ""
    remote: bool = False
    source: SourceBrief
    match: MatchOut | None = None


class OpportunityDetail(OpportunityOut):
    description: str
    documents_required: list[str]
    eligibility: list[str]
    keywords: list[str]
    language: str
    enrichment_method: str
    apply_info: str = ""
    has_preparation: bool = False


class Page(BaseModel):
    items: list[Any]
    total: int
    page: int
    pages: int


class MatchUpdate(BaseModel):
    status: Literal["new", "interested", "preparing", "submitted", "ignored", "won", "lost"] | None = None
    feedback: Literal["relevant", "not_relevant", "none"] | None = None


# --- Préparation ----------------------------------------------------------------------------------


class CheckItem(BaseModel):
    id: str = ""
    label: str = Field(max_length=400)
    done: bool = False
    category: str | None = None
    source: str | None = None


class OutlineSection(BaseModel):
    title: str = Field(max_length=300)
    points: list[str] = Field(default_factory=list, max_length=30)


class PreparationIn(BaseModel):
    requirements: list[CheckItem] | None = Field(default=None, max_length=80)
    checklist: list[CheckItem] | None = Field(default=None, max_length=80)
    outline: list[OutlineSection] | None = Field(default=None, max_length=20)
    letter: str | None = Field(default=None, max_length=30000)
    notes: str | None = Field(default=None, max_length=20000)


class PreparationOut(ORM):
    id: uuid.UUID
    opportunity_id: uuid.UUID
    requirements: list[dict[str, Any]]
    checklist: list[dict[str, Any]]
    outline: list[dict[str, Any]]
    letter: str
    notes: str
    source_document_name: str
    method: str
    validated_at: datetime | None
    updated_at: datetime


# --- Coffre de documents --------------------------------------------------------------------------


class VaultIn(BaseModel):
    doc_type: str
    label: str = Field(default="", max_length=200)
    reference: str = Field(default="", max_length=120)
    issued_on: date | None = None
    expires_on: date | None = None
    notes: str = Field(default="", max_length=2000)

    @field_validator("doc_type")
    @classmethod
    def _type(cls, value: str) -> str:
        return value if value in DOC_TYPES else "autre"


class VaultOut(VaultIn, ORM):
    id: uuid.UUID
    updated_at: datetime


# --- Réglages -------------------------------------------------------------------------------------


class AlertSettings(BaseModel):
    alert_frequency: Literal["daily", "weekly", "off"]
    alert_min_score: int = Field(ge=0, le=100)
    alert_email: bool
    alert_whatsapp: bool = False
    reminders_enabled: bool
    whatsapp_number: str | None = Field(default=None, max_length=32)
    full_name: str | None = Field(default=None, max_length=160)


# --- Dons et administration -----------------------------------------------------------------------


class DonationIn(BaseModel):
    amount_xof: int = Field(ge=500, le=5_000_000)
    donor_name: str = Field(default="", max_length=120)
    message: str = Field(default="", max_length=280)
    is_public: bool = True


class LedgerIn(BaseModel):
    month: date
    kind: Literal["cost", "donation"]
    label: str = Field(min_length=2, max_length=200)
    amount_xof: int = Field(ge=0, le=1_000_000_000)
    public_name: str = Field(default="", max_length=120)


class SourceIn(BaseModel):
    slug: str = Field(min_length=2, max_length=80, pattern=r"^[a-z0-9-]+$")
    name: str = Field(min_length=2, max_length=160)
    kind: str
    url: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=2000)
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class SourcePatch(BaseModel):
    enabled: bool | None = None
    name: str | None = Field(default=None, max_length=160)
    url: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    config: dict[str, Any] | None = None
