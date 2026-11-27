"""Fiche résumée de chaque offre : avec l'IA quand elle est disponible, par règles sinon."""

from __future__ import annotations

from datetime import UTC, date, datetime, time

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.extract import guess_budget, guess_deadline, guess_kind, to_xof
from app.agent.prompts import ANALYST_SYSTEM, ENRICH_PROMPT, KIND_LIST, SECTOR_LIST
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.text import clean_list, first_sentences, top_terms
from app.llm.service import LLMService, wrap_untrusted
from app.models import Opportunity, OpportunityKind
from app.taxonomy import (
    CONTRACT_TYPES,
    EXPERIENCE_LEVELS,
    SECTOR_BY_SLUG,
    detect_contract,
    detect_country,
    detect_documents,
    detect_experience,
    detect_remote,
    detect_sectors,
)


class EnrichmentOut(BaseModel):
    summary: str = ""
    kind: str = "other"
    sectors: list[str] = Field(default_factory=list)
    budget_amount: int | None = None
    budget_currency: str | None = None
    deadline: date | None = None
    documents_required: list[str] = Field(default_factory=list)
    eligibility: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    contract_type: str | None = None
    experience_level: str | None = None
    location: str | None = None
    remote: bool | None = None

    @field_validator("budget_amount", mode="before")
    @classmethod
    def _amount(cls, value: object) -> object:
        if isinstance(value, str):
            digits = "".join(ch for ch in value if ch.isdigit())
            return int(digits) if digits else None
        if isinstance(value, float):
            return int(value)
        return value

    @field_validator("deadline", mode="before")
    @classmethod
    def _deadline(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        if isinstance(value, str) and len(value) > 10:
            return value[:10]
        return value


def apply_rules(opp: Opportunity) -> None:
    text = f"{opp.title}. {opp.description}"
    if not opp.deadline_at:
        opp.deadline_at = guess_deadline(text, published_at=opp.published_at)
    if opp.budget_amount is None:
        opp.budget_amount, opp.budget_currency = guess_budget(text)
    if opp.kind == OpportunityKind.other or not opp.kind:
        opp.kind = OpportunityKind(guess_kind(text))
    if not opp.sectors:
        opp.sectors = detect_sectors(text)
    if not opp.country:
        opp.country = detect_country(f"{opp.title} {opp.issuer} {opp.description[:600]}")
    if opp.kind == OpportunityKind.job:
        apply_job_rules(opp, text)
    elif not opp.documents_required:
        opp.documents_required = detect_documents(text)
    if not opp.summary:
        opp.summary = first_sentences(opp.description or opp.title, 2, 360)
    if not opp.keywords:
        opp.keywords = top_terms(text, 10)
    opp.budget_xof = to_xof(opp.budget_amount, opp.budget_currency, get_settings().usd_to_xof)
    opp.enrichment_method = opp.enrichment_method or "règles"
    opp.enriched_at = utcnow()


def apply_job_rules(opp: Opportunity, text: str) -> None:
    if not opp.contract_type:
        opp.contract_type = detect_contract(text)
    if not opp.experience_level:
        opp.experience_level = detect_experience(text)
    if not opp.remote:
        opp.remote = detect_remote(text)


def apply_llm(opp: Opportunity, data: EnrichmentOut, model: str) -> None:
    if data.summary.strip():
        opp.summary = data.summary.strip()[:1200]
    if data.kind in OpportunityKind._value2member_map_:
        opp.kind = OpportunityKind(data.kind)
    sectors = [s for s in data.sectors if s in SECTOR_BY_SLUG][:3]
    if sectors:
        opp.sectors = sectors
    if data.budget_amount and data.budget_currency in {"XOF", "EUR", "USD"} and opp.budget_amount is None:
        opp.budget_amount, opp.budget_currency = int(data.budget_amount), data.budget_currency
    if data.deadline and not opp.deadline_at:
        candidate = datetime.combine(data.deadline, time(23, 59), tzinfo=UTC)
        if not opp.published_at or candidate > opp.published_at:
            opp.deadline_at = candidate
    docs = clean_list(data.documents_required, limit=8, max_len=180)
    if docs:
        opp.documents_required = docs
    opp.eligibility = clean_list(data.eligibility, limit=6, max_len=400)
    keywords = clean_list(data.keywords, limit=8, max_len=60)
    if keywords:
        opp.keywords = keywords
    if opp.kind == OpportunityKind.job:
        if data.contract_type in CONTRACT_TYPES and not opp.contract_type:
            opp.contract_type = data.contract_type
        if data.experience_level in EXPERIENCE_LEVELS and not opp.experience_level:
            opp.experience_level = data.experience_level
        if data.location and not opp.location:
            opp.location = data.location.strip()[:160]
        if data.remote and not opp.remote:
            opp.remote = True
    opp.budget_xof = to_xof(opp.budget_amount, opp.budget_currency, get_settings().usd_to_xof)
    opp.enrichment_method = f"IA · {model}"
    opp.enriched_at = utcnow()


async def enrich_with_llm(session: AsyncSession, llm: LLMService, opp: Opportunity, *, run_id=None) -> bool:
    prompt = ENRICH_PROMPT.format(
        kinds=KIND_LIST,
        contracts=", ".join(CONTRACT_TYPES),
        levels=", ".join(EXPERIENCE_LEVELS),
        sectors=SECTOR_LIST,
        title=opp.title,
        issuer=opp.issuer or "inconnu",
        content=wrap_untrusted("offre", opp.description or opp.title, 9000),
    )
    data = await llm.complete_json(
        session,
        purpose="enrich",
        system=ANALYST_SYSTEM,
        prompt=prompt,
        schema=EnrichmentOut,
        tier="fast",
        max_tokens=900,
        run_id=run_id,
    )
    if data is None:
        return False
    apply_llm(opp, data, llm.model_for("fast"))
    return True
