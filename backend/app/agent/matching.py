"""Score d'adéquation profil / offre.

Le score par règles est rapide et gratuit : il s'applique à toutes les offres. L'IA affine ensuite
uniquement les meilleures, pour garder des coûts faibles même avec beaucoup d'utilisateurs.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.core.text import contains_term, normalize, tokens
from app.taxonomy import (
    CANDIDATE_DEFAULT_KINDS,
    CONTRACT_TYPES,
    EXPERIENCE_LEVELS,
    REGIONAL_CODES,
    WEST_AFRICA,
    country_label,
    experience_gap,
    sector_label,
)


@dataclass
class ProfileData:
    sectors: list[str] = field(default_factory=list)
    skills: list[str] = field(default_factory=list)
    countries: list[str] = field(default_factory=list)
    keywords_include: list[str] = field(default_factory=list)
    keywords_exclude: list[str] = field(default_factory=list)
    opportunity_kinds: list[str] = field(default_factory=list)
    budget_min: int | None = None
    budget_max: int | None = None
    profile_kind: str = "organization"
    job_title: str = ""
    contract_types: list[str] = field(default_factory=list)
    experience_level: str | None = None
    remote_ok: bool = False

    @property
    def is_candidate(self) -> bool:
        return self.profile_kind == "candidate"

    @property
    def wanted_kinds(self) -> list[str]:
        if self.opportunity_kinds:
            return self.opportunity_kinds
        return CANDIDATE_DEFAULT_KINDS if self.is_candidate else []

    @classmethod
    def from_model(cls, profile: Any) -> ProfileData:
        return cls(
            sectors=list(profile.sectors or []),
            skills=list(profile.skills or []),
            countries=list(profile.countries or []),
            keywords_include=list(profile.keywords_include or []),
            keywords_exclude=list(profile.keywords_exclude or []),
            opportunity_kinds=list(profile.opportunity_kinds or []),
            budget_min=profile.budget_min,
            budget_max=profile.budget_max,
            profile_kind=getattr(profile, "profile_kind", None) or "organization",
            job_title=getattr(profile, "job_title", None) or "",
            contract_types=list(getattr(profile, "contract_types", None) or []),
            experience_level=getattr(profile, "experience_level", None),
            remote_ok=bool(getattr(profile, "remote_ok", False)),
        )

    @property
    def is_empty(self) -> bool:
        return not (self.sectors or self.skills or self.keywords_include or self.job_title)


@dataclass
class OpportunityData:
    title: str
    summary: str = ""
    description: str = ""
    keywords: list[str] = field(default_factory=list)
    sectors: list[str] = field(default_factory=list)
    country: str | None = None
    kind: str = "other"
    budget_xof: int | None = None
    deadline_at: datetime | None = None
    documents_required: list[str] = field(default_factory=list)
    contract_type: str | None = None
    experience_level: str | None = None
    remote: bool = False

    @classmethod
    def from_model(cls, opp: Any) -> OpportunityData:
        kind = opp.kind.value if hasattr(opp.kind, "value") else str(opp.kind or "other")
        return cls(
            title=opp.title or "",
            summary=opp.summary or "",
            description=opp.description or "",
            keywords=list(opp.keywords or []),
            sectors=list(opp.sectors or []),
            country=opp.country,
            kind=kind,
            budget_xof=opp.budget_xof,
            deadline_at=opp.deadline_at,
            documents_required=list(opp.documents_required or []),
            contract_type=getattr(opp, "contract_type", None),
            experience_level=getattr(opp, "experience_level", None),
            remote=bool(getattr(opp, "remote", False)),
        )


@dataclass
class FeedbackWeights:
    sectors: dict[str, float] = field(default_factory=dict)
    terms: dict[str, float] = field(default_factory=dict)

    def adjustment(self, opp: OpportunityData) -> float:
        value = sum(self.sectors.get(s, 0.0) for s in opp.sectors) * 3.0
        title_terms = set(tokens(opp.title, min_len=4))
        value += sum(self.terms.get(t, 0.0) for t in title_terms) * 1.5
        return max(-12.0, min(12.0, value))


def build_feedback_weights(items: list[tuple[OpportunityData, bool]]) -> FeedbackWeights:
    sectors: dict[str, float] = defaultdict(float)
    terms: dict[str, float] = defaultdict(float)
    for opp, relevant in items:
        delta = 1.0 if relevant else -1.0
        for s in opp.sectors:
            sectors[s] += delta
        for t in set(tokens(opp.title, min_len=4)):
            terms[t] += delta * 0.5
    clamp = lambda d: {k: max(-2.0, min(2.0, v)) for k, v in d.items() if v}  # noqa: E731
    return FeedbackWeights(sectors=clamp(sectors), terms=clamp(terms))


@dataclass
class MatchResult:
    score: int
    reasons: list[str]
    criteria: list[dict[str, Any]]
    risks: list[str]
    excluded: bool = False
    exclusion_reason: str = ""


def format_xof(amount: int | None) -> str:
    if not amount:
        return "montant non précisé"
    if amount >= 1_000_000_000:
        return f"{amount / 1_000_000_000:.1f} Md F CFA".replace(".0 ", " ").replace(".", ",")
    if amount >= 1_000_000:
        return f"{amount / 1_000_000:.1f} M F CFA".replace(".0 ", " ").replace(".", ",")
    return f"{amount:,} F CFA".replace(",", " ")


def days_left(deadline: datetime | None, now: datetime | None = None) -> int | None:
    if deadline is None:
        return None
    now = now or datetime.now(UTC)
    return (deadline - now).days


def _job_points(
    profile: ProfileData,
    opp: OpportunityData,
    reasons: list[tuple[int, str]],
    risks: list[str],
    criteria: list[dict[str, Any]],
) -> float:
    """Contrat et niveau d'expérience : remplacent le critère de montant pour une offre d'emploi."""
    points = 0.0
    contract = CONTRACT_TYPES.get(opp.contract_type or "", "")
    if not profile.contract_types or not opp.contract_type:
        points += 3.0
        contract_met = None
    elif opp.contract_type in profile.contract_types:
        points += 6.0
        contract_met = True
        reasons.append((16, f"Contrat recherché : {contract}"))
    else:
        contract_met = False
        reasons.append((20, f"Contrat proposé : {contract}, différent de ce que tu cherches"))
    criteria.append({"label": "Type de contrat", "met": contract_met})

    gap = experience_gap(opp.experience_level, profile.experience_level)
    if not opp.experience_level or not profile.experience_level:
        points += 1.0
        level_met = None
    elif gap <= 0:
        points += 2.0
        level_met = True
    else:
        level_met = False
        risks.append(f"Expérience demandée : {EXPERIENCE_LEVELS[opp.experience_level].lower()}")
    criteria.append({"label": "Niveau d'expérience", "met": level_met})
    return points


def score_match(
    profile: ProfileData,
    opp: OpportunityData,
    *,
    feedback: FeedbackWeights | None = None,
    now: datetime | None = None,
) -> MatchResult:
    title_norm = normalize(opp.title)
    body_norm = normalize(f"{opp.title} {opp.summary} {opp.description} {' '.join(opp.keywords)}")

    for term in profile.keywords_exclude:
        if contains_term(body_norm, term):
            return MatchResult(
                0,
                [f"Contient un mot-clé que tu as exclu : « {term} »"],
                [],
                [],
                True,
                f"mot-clé exclu « {term} »",
            )

    remaining = days_left(opp.deadline_at, now)
    if remaining is not None and remaining < 0:
        return MatchResult(0, ["Date limite dépassée"], [], [], True, "date limite dépassée")

    # Les offres d'emploi ne vont qu'aux profils qui les demandent ; un candidat ne reçoit que les types choisis.
    wanted = profile.wanted_kinds
    if (opp.kind == "job" and "job" not in wanted and not profile.is_candidate) or (
        profile.is_candidate and opp.kind not in wanted
    ):
        return MatchResult(0, ["Type d'offre non suivi"], [], [], True, "type d'offre non suivi")
    is_job = opp.kind == "job"

    reasons: list[tuple[int, str]] = []
    risks: list[str] = []
    criteria: list[dict[str, Any]] = []

    # Mots-clés et compétences
    seen: set[str] = set()
    found: list[str] = []
    weighted = 0.0
    if profile.job_title and is_job:
        seen.add(normalize(profile.job_title))
        if contains_term(title_norm, profile.job_title):
            found.append(profile.job_title)
            weighted += 3.0
        elif contains_term(body_norm, profile.job_title):
            found.append(profile.job_title)
            weighted += 1.5
    for term in [*profile.keywords_include, *profile.skills]:
        key = normalize(term)
        if not key or key in seen:
            continue
        seen.add(key)
        if contains_term(body_norm, term):
            found.append(term)
            weighted += 2.0 if contains_term(title_norm, term) else 1.0
    kw_points = 40.0 * min(1.0, weighted / 4.0)
    if found:
        reasons.append((int(kw_points) + 10, "Mots-clés trouvés : " + ", ".join(found[:4])))

    # Secteur
    overlap = [s for s in opp.sectors if s in profile.sectors]
    if not profile.sectors:
        sector_points = 11.0
    elif overlap:
        sector_points = 22.0
        reasons.append((30, f"Dans ton secteur : {sector_label(overlap[0])}"))
    else:
        sector_points = 0.0
    criteria.append(
        {"label": "Secteur d'activité", "met": bool(overlap) if profile.sectors and opp.sectors else None}
    )

    # Zone géographique
    countries = set(profile.countries)
    if is_job and opp.remote and profile.remote_ok:
        country_points, country_met = 14.0, True
        reasons.append((20, "Télétravail possible"))
    elif not countries or opp.country is None:
        country_points, country_met = 7.0, None
    elif opp.country in countries:
        country_points, country_met = 14.0, True
        reasons.append((18, f"Pays couvert : {country_label(opp.country)}"))
    elif opp.country in REGIONAL_CODES and (countries & WEST_AFRICA or countries & REGIONAL_CODES):
        country_points, country_met = 10.0, True
        reasons.append((12, f"Offre ouverte à ta région ({country_label(opp.country)})"))
    else:
        country_points, country_met = 0.0, False
        reasons.append((25, f"Hors de ta zone : {country_label(opp.country)}"))
    criteria.append({"label": "Zone géographique", "met": country_met})

    # Type d'offre
    if not wanted:
        kind_points = 5.0
    elif opp.kind in wanted:
        kind_points = 8.0
    else:
        kind_points = 0.0

    # Montant, ou contrat et expérience pour une offre d'emploi
    budget = opp.budget_xof
    if is_job:
        budget_points = _job_points(profile, opp, reasons, risks, criteria)
    elif budget is None or (profile.budget_min is None and profile.budget_max is None):
        budget_points, budget_met = 4.0, None
    elif profile.budget_max is not None and budget > profile.budget_max:
        budget_points, budget_met = (3.0 if budget <= profile.budget_max * 3 else 0.0), False
        risks.append(f"Montant élevé pour ta structure ({format_xof(budget)})")
    elif profile.budget_min is not None and budget < profile.budget_min:
        budget_points, budget_met = 2.0, False
        reasons.append((8, f"Montant sous ta fourchette ({format_xof(budget)})"))
    else:
        budget_points, budget_met = 8.0, True
        reasons.append((14, f"Montant dans ta fourchette ({format_xof(budget)})"))
    if not is_job:
        criteria.append({"label": "Montant adapté", "met": budget_met})

    # Délai
    if remaining is None:
        deadline_points, deadline_met = 4.0, None
    elif remaining >= 14:
        deadline_points, deadline_met = 8.0, True
    elif remaining >= 7:
        deadline_points, deadline_met = 6.0, True
    elif remaining >= 3:
        deadline_points, deadline_met = 3.0, False
        risks.append(f"Délai court : {remaining} jours pour préparer le dossier")
    else:
        deadline_points, deadline_met = 1.0, False
        risks.append("Moins de 3 jours avant la date limite")
    criteria.append({"label": "Délai suffisant (7 jours ou plus)", "met": deadline_met})

    if any("garantie" in normalize(d) for d in opp.documents_required):
        risks.append("Garantie de soumission à prévoir auprès d'une banque")

    total = kw_points + sector_points + country_points + kind_points + budget_points + deadline_points
    if is_job:
        # Un poste sans aucun lien avec le métier ou les compétences n'a pas sa place dans le radar.
        if not found:
            total *= 0.6
        if profile.contract_types and opp.contract_type and opp.contract_type not in profile.contract_types:
            total -= 10
    if feedback:
        adjust = feedback.adjustment(opp)
        total += adjust
        if adjust >= 4:
            reasons.append((9, "Ressemble aux offres que tu as jugées pertinentes"))
        elif adjust <= -4:
            reasons.append((9, "Ressemble aux offres que tu as écartées"))

    score = round(max(0.0, min(100.0, total)))
    ordered = [text for _, text in sorted(reasons, key=lambda r: -r[0])][:4]
    if not ordered:
        ordered = ["Peu d'éléments en commun avec ton profil"]
    return MatchResult(score, ordered, criteria, risks[:3])


class LlmMatchOut(BaseModel):
    score: int = Field(ge=0, le=100)
    reasons: list[str] = Field(default_factory=list)
    criteria: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)

    @field_validator("score", mode="before")
    @classmethod
    def _score(cls, value: object) -> object:
        if isinstance(value, (float, str)):
            try:
                return max(0, min(100, int(float(value))))
            except ValueError:
                return 0
        return value

    @field_validator("criteria")
    @classmethod
    def _criteria(cls, value: list[dict[str, Any]]) -> list[dict[str, Any]]:
        out = []
        for item in value[:6]:
            label = str(item.get("label", "")).strip()[:160]
            met = item.get("met")
            if label:
                out.append({"label": label, "met": met if isinstance(met, bool) else None})
        return out


def blend_scores(rules_score: int, llm_score: int) -> int:
    return round(0.35 * rules_score + 0.65 * llm_score)
