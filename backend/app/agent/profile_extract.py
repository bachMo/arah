"""Remplissage du profil à partir d'une description libre."""

from __future__ import annotations

import re
import uuid

from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.prompts import (
    CANDIDATE_PROFILE_PROMPT,
    CANDIDATE_PROFILE_SYSTEM,
    KIND_LIST,
    PROFILE_PROMPT,
    PROFILE_SYSTEM,
    SECTOR_LIST,
)
from app.core.text import clean_list, normalize, top_terms
from app.core.text import contains_term as _contains
from app.llm.service import LLMService, wrap_untrusted
from app.taxonomy import (
    _CONTRACT_RULES,
    CANDIDATE_DEFAULT_KINDS,
    CONTRACT_TYPES,
    COUNTRY_BY_CODE,
    EXPERIENCE_LEVELS,
    OPPORTUNITY_KINDS,
    ORG_TYPES,
    SECTOR_BY_SLUG,
    detect_countries,
    detect_experience,
    detect_remote,
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
    profile_kind: str = "organization"
    job_title: str = ""
    contract_types: list[str] = Field(default_factory=list)
    experience_level: str | None = None
    remote_ok: bool = False
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
                "profile_kind": self.profile_kind
                if self.profile_kind in {"organization", "candidate"}
                else "organization",
                "job_title": self.job_title.strip()[:160],
                "contract_types": [c for c in dict.fromkeys(self.contract_types) if c in CONTRACT_TYPES],
                "experience_level": self.experience_level
                if self.experience_level in EXPERIENCE_LEVELS
                else None,
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


_JOB_TITLE = re.compile(
    r"(?:je suis|je travaille comme|je cherche (?:un poste|un emploi|une mission|un stage)(?: de| d'| en| comme)?|"
    r"poste de|métier de)\s+(?:un |une |)([a-zà-ÿ][a-zà-ÿ' \-/]{2,60}?)(?:[,.;]| à | en | avec | depuis | et |$)"
)

# Mots trop généraux pour servir de compétences ou de mots-clés.
_CANDIDATE_NOISE = {
    "suis",
    "cherche",
    "recherche",
    "poste",
    "emploi",
    "stage",
    "mission",
    "missions",
    "freelance",
    "junior",
    "senior",
    "dakar",
    "senegal",
    "travail",
    "teletravail",
    "possible",
    "experience",
    "annees",
    "ans",
    "cdi",
    "cdd",
    "contrat",
    "actuellement",
    "depuis",
    "souhaite",
    "aimerais",
    "passionne",
    "passionnee",
}


def suggest_candidate_with_rules(description: str) -> ProfileSuggestion:
    norm = normalize(description)
    title = _JOB_TITLE.search(description.lower())
    contracts = [slug for slug, terms in _CONTRACT_RULES if any(_contains(norm, t.strip()) for t in terms)]
    job_title = title.group(1).strip() if title else ""
    title_words = set(normalize(job_title).split())
    terms = [t for t in top_terms(description, 20) if t not in _CANDIDATE_NOISE and t not in title_words][:10]
    return ProfileSuggestion(
        profile_kind="candidate",
        job_title=job_title,
        sectors=detect_sectors(description, limit=4),
        skills=terms[:8],
        countries=[c for c in detect_countries(description) if c != "INT"] or ["SN"],
        keywords_include=terms[:5],
        contract_types=contracts,
        experience_level=detect_experience(description),
        remote_ok=detect_remote(description),
        opportunity_kinds=list(CANDIDATE_DEFAULT_KINDS),
        method="règles",
    ).sanitized()


async def suggest_profile(
    session: AsyncSession,
    llm: LLMService,
    description: str,
    *,
    user_id: uuid.UUID | None,
    profile_kind: str = "organization",
) -> ProfileSuggestion:
    if profile_kind == "candidate":
        return await _suggest_candidate(session, llm, description, user_id=user_id)
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


async def _suggest_candidate(
    session: AsyncSession, llm: LLMService, description: str, *, user_id: uuid.UUID | None
) -> ProfileSuggestion:
    if llm.enabled:
        prompt = CANDIDATE_PROFILE_PROMPT.format(
            sectors=SECTOR_LIST,
            countries=", ".join(COUNTRY_BY_CODE),
            contracts=", ".join(CONTRACT_TYPES),
            levels=", ".join(EXPERIENCE_LEVELS),
            content=wrap_untrusted("parcours", description, 6000),
        )
        data = await llm.complete_json(
            session,
            purpose="profile",
            system=CANDIDATE_PROFILE_SYSTEM,
            prompt=prompt,
            schema=ProfileSuggestion,
            tier="fast",
            max_tokens=900,
            user_id=user_id,
        )
        if data is not None:
            return data.model_copy(
                update={
                    "profile_kind": "candidate",
                    "opportunity_kinds": list(CANDIDATE_DEFAULT_KINDS),
                    "method": f"IA · {llm.model_for('fast')}",
                }
            ).sanitized()
    return suggest_candidate_with_rules(description)
