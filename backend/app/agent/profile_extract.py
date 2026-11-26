"""Remplissage du profil à partir d'une description libre."""

from __future__ import annotations

import re
import uuid

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.prompts import KIND_LIST, PROFILE_PROMPT, PROFILE_SYSTEM, SECTOR_LIST
from app.core.text import clean_list, normalize, top_terms
from app.llm.service import LLMService, wrap_untrusted
from app.taxonomy import (
    COUNTRY_BY_CODE,
    OPPORTUNITY_KINDS,
    ORG_TYPES,
    SECTOR_BY_SLUG,
    detect_countries,
    detect_sectors,
)


class ProfileSuggestion(BaseModel):
    organization_name: str = ""
    org_type: str = "freelance"
    sectors: list[str] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    countries: list[str] = Field(default_factory=list)
    keywords_include: list[str] = Field(default_factory=list)
    keywords_exclude: list[str] = Field(default_factory=list)
    opportunity_kinds: list[str] = Field(default_factory=list)
    budget_min: int | None = None
    budget_max: int | None = None
    method: str = "règles"

    @field_validator("budget_min", "budget_max", mode="before")
    @classmethod
    def _amount(cls, value: object) -> object:
        if isinstance(value, str):
            digits = "".join(ch for ch in value if ch.isdigit())
            return int(digits) if digits else None
        if isinstance(value, float):
            return int(value)
        return value

    def sanitized(self) -> ProfileSuggestion:
        return self.model_copy(
            update={
                "organization_name": self.organization_name.strip()[:200],
                "org_type": self.org_type if self.org_type in ORG_TYPES else "autre",
                "sectors": [s for s in self.sectors if s in SECTOR_BY_SLUG][:4],
                "skills": clean_list(self.skills, limit=15, max_len=80),
                "countries": [c for c in self.countries if c in COUNTRY_BY_CODE][:10] or ["SN"],
                "keywords_include": clean_list(self.keywords_include, limit=15, max_len=60),
                "keywords_exclude": clean_list(self.keywords_exclude, limit=10, max_len=60),
                "opportunity_kinds": [k for k in self.opportunity_kinds if k in OPPORTUNITY_KINDS],
            }
        )


_ORG_HINTS = [
    ("ong", ("ong", "association", "fondation", "ngo")),
    ("startup", ("startup", "start-up")),
    ("cabinet", ("cabinet", "bureau d'etudes", "consulting")),
    ("cooperative", ("cooperative", "gie", "groupement")),
    ("pme", ("pme", "sarl", "sa ", "entreprise", "societe")),
    ("freelance", ("freelance", "independant", "consultant", "je suis", "je m'appelle")),
]


def suggest_with_rules(description: str) -> ProfileSuggestion:
    norm = normalize(description)
    org_type = next((slug for slug, hints in _ORG_HINTS if any(h in norm for h in hints)), "autre")
    sectors = detect_sectors(description, limit=4)
    countries = [c for c in detect_countries(description) if c != "INT"] or ["SN"]
    terms = top_terms(description, 10)
    name_match = re.search(
        r"(?:je m'appelle|nous sommes|notre (?:structure|entreprise|ong)(?: s'appelle)?)\s+([A-ZÀ-Ý][\w'’\- ]{2,40})",
        description,
    )
    return ProfileSuggestion(
        organization_name=name_match.group(1).strip() if name_match else "",
        org_type=org_type,
        sectors=sectors,
        skills=terms[:8],
        countries=countries,
        keywords_include=terms[:8],
        opportunity_kinds=[],
        budget_min=None,
        budget_max=None,
        method="règles",
    ).sanitized()


async def suggest_profile(
    session: AsyncSession, llm: LLMService, description: str, *, user_id: uuid.UUID | None
) -> ProfileSuggestion:
    if llm.enabled:
        prompt = PROFILE_PROMPT.format(
            org_types=", ".join(ORG_TYPES),
            sectors=SECTOR_LIST,
            countries=", ".join(COUNTRY_BY_CODE),
            kinds=KIND_LIST,
            content=wrap_untrusted("description", description, 6000),
        )
        data = await llm.complete_json(
            session,
            purpose="profile",
            system=PROFILE_SYSTEM,
            prompt=prompt,
            schema=ProfileSuggestion,
            tier="fast",
            max_tokens=900,
            user_id=user_id,
        )
        if data is not None:
            return data.model_copy(update={"method": f"IA · {llm.model_for('fast')}"}).sanitized()
    return suggest_with_rules(description)
