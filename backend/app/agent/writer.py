"""Le Rédacteur : matrice d'exigences, pièces à réunir, plan et brouillon de lettre."""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.matching import format_xof
from app.agent.prompts import WRITER_PROMPT, WRITER_SYSTEM
from app.core.text import clean_list
from app.llm.service import LLMService, wrap_untrusted
from app.models import Opportunity, Profile, User
from app.taxonomy import OPPORTUNITY_KINDS, ORG_TYPES, country_label, sector_label

MAX_PDF_PAGES = 120
MAX_DOCUMENT_CHARS = 40_000


class Requirement(BaseModel):
    label: str
    category: str = "administratif"
    source: str = ""
    done: bool = False

    @field_validator("category")
    @classmethod
    def _category(cls, value: str) -> str:
        return value if value in {"administratif", "technique", "financier"} else "administratif"


class Section(BaseModel):
    title: str
    points: list[str] = Field(default_factory=list)


class WriterOut(BaseModel):
    requirements: list[Requirement] = Field(default_factory=list)
    checklist: list[str] = Field(default_factory=list)
    outline: list[Section] = Field(default_factory=list)
    letter: str = ""


def read_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    chunks: list[str] = []
    total = 0
    for index, page in enumerate(reader.pages[:MAX_PDF_PAGES], start=1):
        text = (page.extract_text() or "").strip()
        if not text:
            continue
        block = f"[page {index}]\n{text}"
        chunks.append(block)
        total += len(block)
        if total > MAX_DOCUMENT_CHARS:
            break
    return "\n\n".join(chunks)[:MAX_DOCUMENT_CHARS]


def describe_profile(user: User, profile: Profile | None) -> str:
    if profile is None:
        return f"Nom : {user.full_name or 'non renseigné'} (profil non rempli)"
    lines = [
        f"Structure : {profile.organization_name or user.full_name or 'non renseignée'}",
        f"Type : {ORG_TYPES.get(profile.org_type, profile.org_type)}",
        f"Secteurs : {', '.join(sector_label(s) for s in profile.sectors) or 'non renseignés'}",
        f"Compétences : {', '.join(profile.skills) or 'non renseignées'}",
        f"Pays : {', '.join(country_label(c) for c in profile.countries) or 'non renseignés'}",
    ]
    if profile.team_size:
        lines.append(f"Taille de l'équipe : {profile.team_size} personnes")
    if profile.certifications:
        lines.append(f"Certifications : {', '.join(profile.certifications)}")
    if profile.description:
        lines.append(f"Présentation : {profile.description[:1500]}")
    if profile.past_references:
        lines.append(f"Références passées : {profile.past_references[:2000]}")
    return "\n".join(lines)


def describe_offer(opp: Opportunity) -> str:
    deadline = f"{opp.deadline_at:%d/%m/%Y}" if opp.deadline_at else "non précisée"
    body = (
        f"Titre : {opp.title}\nÉmetteur : {opp.issuer}\nType : {OPPORTUNITY_KINDS.get(opp.kind.value, '')}\n"
        f"Pays : {country_label(opp.country)}\nDate limite : {deadline}\n"
        f"Montant : {format_xof(opp.budget_xof)}\nPièces repérées : {', '.join(opp.documents_required) or 'aucune'}\n\n"
        f"{opp.summary}\n\n{opp.description}"
    )
    return wrap_untrusted("offre", body, 10000)


_BASE_CHECKLIST = [
    "Relire entièrement le dossier d'appel d'offres",
    "Vérifier les conditions d'éligibilité",
    "Préparer la lettre de soumission signée",
    "Rassembler les références similaires et attestations de bonne exécution",
    "Vérifier la validité des attestations administratives à la date limite",
    "Préparer le mode et l'adresse de dépôt (plateforme, e-mail ou physique)",
]


def draft_with_rules(user: User, profile: Profile | None, opp: Opportunity) -> WriterOut:
    org = (
        (profile.organization_name if profile else "")
        or user.full_name
        or "[à compléter : nom de la structure]"
    )
    docs = list(opp.documents_required)
    requirements = [
        Requirement(
            label=d,
            category="financier" if "financ" in d.lower() or "garantie" in d.lower() else "administratif",
        )
        for d in docs
    ]
    requirements += [
        Requirement(label="Respect de la date limite de dépôt", category="administratif"),
        Requirement(label="Compréhension du besoin et méthodologie proposée", category="technique"),
        Requirement(label="Expérience sur des missions similaires", category="technique"),
        Requirement(label="Proposition de prix détaillée", category="financier"),
    ]
    checklist = clean_list(docs + _BASE_CHECKLIST, limit=15, max_len=160)
    skills = (
        ", ".join(profile.skills[:5]) if profile and profile.skills else "[à compléter : compétences clés]"
    )
    outline = [
        Section(
            title="Présentation de la structure",
            points=[f"{org} : activités et chiffres clés", "Équipe et moyens"],
        ),
        Section(
            title="Compréhension du besoin",
            points=["Contexte et objectifs de l'émetteur", "Enjeux et points d'attention"],
        ),
        Section(
            title="Méthodologie et approche",
            points=["Démarche proposée étape par étape", f"Savoir-faire mobilisé : {skills}"],
        ),
        Section(
            title="Planning et livrables",
            points=["Calendrier de réalisation", "Livrables et jalons de validation"],
        ),
        Section(
            title="Références similaires",
            points=["Trois missions comparables avec contacts", "Résultats obtenus"],
        ),
        Section(title="Équipe proposée", points=["Rôles et CV des intervenants clés"]),
        Section(title="Offre financière", points=["Décomposition du prix", "Conditions de paiement"]),
    ]
    today = datetime.now(UTC).strftime("%d/%m/%Y")
    letter = (
        f"{org}\n[à compléter : adresse, téléphone, e-mail]\n\n"
        f"À l'attention de : {opp.issuer or '[à compléter : destinataire]'}\n\n"
        f"Le {today}\n\n"
        f"Objet : soumission — {opp.title}\n\n"
        "Madame, Monsieur,\n\n"
        f"Suite à la publication de votre avis relatif à « {opp.title} », nous avons l'honneur de vous soumettre "
        f"l'offre de {org}.\n\n"
        f"Spécialisée en {skills}, notre structure a réalisé [à compléter : nombre] missions comparables, notamment "
        "[à compléter : référence la plus proche]. Nous avons pris connaissance de l'ensemble du dossier et nous engageons "
        "à respecter les exigences techniques, le calendrier et les conditions administratives fixés.\n\n"
        "Vous trouverez ci-joint notre offre technique, notre offre financière et les pièces administratives demandées.\n\n"
        "Nous restons à votre disposition pour toute précision et vous prions d'agréer, Madame, Monsieur, "
        "l'expression de nos salutations distinguées.\n\n"
        f"[à compléter : nom et fonction du signataire]\n{org}"
    )
    return WriterOut(requirements=requirements, checklist=checklist, outline=outline, letter=letter)


async def draft_response(
    session: AsyncSession,
    llm: LLMService,
    *,
    user: User,
    profile: Profile | None,
    opp: Opportunity,
    document_text: str = "",
) -> tuple[WriterOut, str]:
    if llm.enabled:
        document = (
            wrap_untrusted("dossier_appel_offres", document_text, MAX_DOCUMENT_CHARS)
            if document_text
            else "Aucun dossier complet fourni : appuie-toi sur l'avis."
        )
        prompt = WRITER_PROMPT.format(
            profile=describe_profile(user, profile), offer=describe_offer(opp), document=document
        )
        data = await llm.complete_json(
            session,
            purpose="write",
            system=WRITER_SYSTEM,
            prompt=prompt,
            schema=WriterOut,
            tier="smart",
            max_tokens=4000,
            temperature=0.4,
            user_id=user.id,
        )
        if data is not None and (data.letter or data.outline):
            return data, f"IA · {llm.model_for('smart')}"
    return draft_with_rules(user, profile, opp), "modèle de base"


def export_markdown(
    opp: Opportunity,
    prep_requirements: list[dict],
    checklist: list[dict],
    outline: list[dict],
    letter: str,
    notes: str,
) -> str:
    lines = [f"# {opp.title}", "", f"**Émetteur :** {opp.issuer or '—'}  "]
    if opp.deadline_at:
        lines.append(f"**Date limite :** {opp.deadline_at:%d/%m/%Y}  ")
    if opp.url:
        lines.append(f"**Avis original :** {opp.url}")
    lines += ["", "## Matrice d'exigences", ""]
    for r in prep_requirements:
        lines.append(
            f"- [{'x' if r.get('done') else ' '}] {r.get('label')} — _{r.get('category', '')}_"
            + (f" ({r['source']})" if r.get("source") else "")
        )
    lines += ["", "## Pièces et actions", ""]
    for c in checklist:
        lines.append(f"- [{'x' if c.get('done') else ' '}] {c.get('label')}")
    lines += ["", "## Plan de la réponse", ""]
    for index, section in enumerate(outline, start=1):
        lines.append(f"{index}. **{section.get('title')}**")
        for point in section.get("points", []):
            lines.append(f"   - {point}")
    lines += ["", "## Lettre de soumission", "", letter.strip()]
    if notes.strip():
        lines += ["", "## Notes", "", notes.strip()]
    lines += ["", "---", "Brouillon préparé avec Arah! — à relire et adapter avant tout envoi."]
    return "\n".join(lines) + "\n"


def new_id() -> str:
    return uuid.uuid4().hex[:10]
