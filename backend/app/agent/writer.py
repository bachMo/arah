"""Le Rédacteur : matrice d'exigences, pièces à réunir, plan et brouillon de lettre."""

from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, Field, field_validator
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.matching import format_xof
from app.agent.prompts import JOB_WRITER_PROMPT, JOB_WRITER_SYSTEM, WRITER_PROMPT, WRITER_SYSTEM
from app.core.text import clean_list
from app.llm.service import LLMService, wrap_untrusted
from app.models import Opportunity, OpportunityKind, Profile, User
from app.taxonomy import (
    CONTRACT_TYPES,
    EXPERIENCE_LEVELS,
    OPPORTUNITY_KINDS,
    ORG_TYPES,
    country_label,
    sector_label,
)

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
    if profile.profile_kind == "candidate":
        return _describe_candidate(user, profile)
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


def _describe_candidate(user: User, profile: Profile) -> str:
    contracts = ", ".join(CONTRACT_TYPES.get(c, c) for c in profile.contract_types)
    lines = [
        f"Candidat : {profile.organization_name or user.full_name or 'non renseigné'}",
        f"Métier recherché : {profile.job_title or 'non renseigné'}",
        f"Niveau : {EXPERIENCE_LEVELS.get(profile.experience_level or '', 'non renseigné')}",
        f"Contrats recherchés : {contracts or 'tous'}",
        f"Compétences : {', '.join(profile.skills) or 'non renseignées'}",
        f"Secteurs : {', '.join(sector_label(s) for s in profile.sectors) or 'non renseignés'}",
        f"Pays : {', '.join(country_label(c) for c in profile.countries) or 'non renseignés'}"
        + (" (télétravail accepté)" if profile.remote_ok else ""),
    ]
    if profile.description:
        lines.append(f"Parcours : {profile.description[:1500]}")
    if profile.past_references:
        lines.append(f"Expériences : {profile.past_references[:2000]}")
    return "\n".join(lines)


def describe_offer(opp: Opportunity) -> str:
    deadline = f"{opp.deadline_at:%d/%m/%Y}" if opp.deadline_at else "non précisée"
    if opp.kind == OpportunityKind.job:
        body = (
            f"Poste : {opp.title}\nEmployeur : {opp.issuer}\n"
            f"Contrat : {CONTRACT_TYPES.get(opp.contract_type or '', 'non précisé')}\n"
            f"Niveau : {EXPERIENCE_LEVELS.get(opp.experience_level or '', 'non précisé')}\n"
            f"Lieu : {opp.location or country_label(opp.country) or 'non précisé'}"
            + (" (télétravail possible)" if opp.remote else "")
            + f"\nDate limite : {deadline}\n\n{opp.summary}\n\n{opp.description}"
        )
        return wrap_untrusted("offre", body, 10000)
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


def draft_job_with_rules(user: User, profile: Profile | None, opp: Opportunity) -> WriterOut:
    name = (profile.organization_name if profile else "") or user.full_name or "[à compléter : ton nom]"
    skills = (
        ", ".join(profile.skills[:5])
        if profile and profile.skills
        else "[à compléter : tes compétences clés]"
    )
    requirements = [
        Requirement(label="Compétences demandées dans l'offre", category="technique"),
        Requirement(label="Expérience requise pour le poste", category="technique"),
        Requirement(label="Diplôme ou formation demandés", category="administratif"),
        Requirement(label="Respect de la date limite de candidature", category="administratif"),
    ]
    checklist = [
        "Mettre à jour ton CV pour ce poste",
        "Adapter la lettre de motivation",
        "Préparer les copies de tes diplômes",
        "Préparer deux ou trois références joignables",
        "Vérifier le mode de candidature (lien, e-mail, plateforme)",
    ]
    outline = [
        Section(
            title="Pourquoi ce poste",
            points=["Ce qui t'attire dans la mission", "Ce que tu sais de l'employeur"],
        ),
        Section(
            title="Tes atouts",
            points=[f"Compétences clés : {skills}", "Une réalisation concrète et chiffrée"],
        ),
        Section(title="Ce que tu apportes", points=["Ta valeur ajoutée dès les premiers mois"]),
    ]
    today = datetime.now(UTC).strftime("%d/%m/%Y")
    letter = (
        f"{name}\n[à compléter : téléphone, e-mail]\n\n"
        f"À l'attention de : {opp.issuer or '[à compléter : recruteur]'}\n\n"
        f"Le {today}\n\n"
        f"Objet : candidature — {opp.title}\n\n"
        "Madame, Monsieur,\n\n"
        f"Votre offre « {opp.title} » a retenu toute mon attention, et je souhaite vous proposer ma candidature.\n\n"
        f"Mes compétences en {skills} m'ont permis de [à compléter : une réalisation concrète]. "
        "Je suis convaincu(e) de pouvoir contribuer rapidement à vos objectifs, notamment sur "
        "[à compléter : une mission clé du poste].\n\n"
        "Je serais heureux(se) d'échanger avec vous pour vous présenter plus en détail mon parcours et ma motivation.\n\n"
        "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.\n\n"
        f"{name}"
    )
    return WriterOut(requirements=requirements, checklist=checklist, outline=outline, letter=letter)


def draft_with_rules(user: User, profile: Profile | None, opp: Opportunity) -> WriterOut:
    if opp.kind == OpportunityKind.job:
        return draft_job_with_rules(user, profile, opp)
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
        is_job = opp.kind == OpportunityKind.job
        prompt = (JOB_WRITER_PROMPT if is_job else WRITER_PROMPT).format(
            profile=describe_profile(user, profile), offer=describe_offer(opp), document=document
        )
        data = await llm.complete_json(
            session,
            purpose="write",
            system=JOB_WRITER_SYSTEM if is_job else WRITER_SYSTEM,
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
    is_job = opp.kind == OpportunityKind.job
    titles = (
        ("Exigences du poste", "Pour postuler", "Tes points forts", "Lettre de motivation")
        if is_job
        else ("Matrice d'exigences", "Pièces et actions", "Plan de la réponse", "Lettre de soumission")
    )
    lines = [f"# {opp.title}", "", f"**{'Employeur' if is_job else 'Émetteur'} :** {opp.issuer or '—'}  "]
    if opp.deadline_at:
        lines.append(f"**Date limite :** {opp.deadline_at:%d/%m/%Y}  ")
    if opp.url:
        lines.append(f"**{'Offre originale' if is_job else 'Avis original'} :** {opp.url}")
    lines += ["", f"## {titles[0]}", ""]
    for r in prep_requirements:
        lines.append(
            f"- [{'x' if r.get('done') else ' '}] {r.get('label')} — _{r.get('category', '')}_"
            + (f" ({r['source']})" if r.get("source") else "")
        )
    lines += ["", f"## {titles[1]}", ""]
    for c in checklist:
        lines.append(f"- [{'x' if c.get('done') else ' '}] {c.get('label')}")
    lines += ["", f"## {titles[2]}", ""]
    for index, section in enumerate(outline, start=1):
        lines.append(f"{index}. **{section.get('title')}**")
        for point in section.get("points", []):
            lines.append(f"   - {point}")
    lines += ["", f"## {titles[3]}", "", letter.strip()]
    if notes.strip():
        lines += ["", "## Notes", "", notes.strip()]
    lines += ["", "---", "Brouillon préparé avec Arah! — à relire et adapter avant tout envoi."]
    return "\n".join(lines) + "\n"


def new_id() -> str:
    return uuid.uuid4().hex[:10]
