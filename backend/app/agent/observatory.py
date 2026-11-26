"""Observatoire : tendances du marché et position de l'utilisateur."""

from __future__ import annotations

from collections import Counter
from datetime import timedelta
from typing import Any

from sqlalchemy import func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import utcnow
from app.core.text import normalize
from app.models import Match, Opportunity, Source, User, VaultDocument
from app.taxonomy import OPPORTUNITY_KINDS, country_label, sector_label

DOC_LABEL_TO_VAULT = {
    "NINEA": "ninea",
    "Registre du commerce (RCCM)": "rccm",
    "Attestation fiscale / quitus": "quitus_fiscal",
    "Attestation IPRES": "ipres",
    "Attestation sécurité sociale": "css",
    "États financiers": "etats_financiers",
    "Statuts de la structure": "statuts",
    "Références similaires": "references",
}

GENERIC_TERMS = {
    "offre",
    "offres",
    "projet",
    "projets",
    "services",
    "service",
    "mise",
    "place",
    "appel",
    "dossier",
    "demo",
    "recrutement",
    "fourniture",
    "travaux",
    "selection",
    "avis",
    "programme",
    "national",
    "regional",
    "cadre",
}


def _open_clause():
    now = utcnow()
    return or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now)


async def market_overview(session: AsyncSession, sector: str | None = None) -> dict[str, Any]:
    now = utcnow()
    since_year = now - timedelta(days=365)
    filters = [Opportunity.created_at >= since_year]
    if sector:
        filters.append(Opportunity.sectors.any(sector))

    open_count = (
        await session.scalar(select(func.count(Opportunity.id)).where(_open_clause(), *filters[1:])) or 0
    )
    open_budget = (
        await session.scalar(
            select(func.coalesce(func.sum(Opportunity.budget_xof), 0)).where(_open_clause(), *filters[1:])
        )
        or 0
    )
    week_count = (
        await session.scalar(
            select(func.count(Opportunity.id)).where(
                Opportunity.created_at >= now - timedelta(days=7), *filters[1:]
            )
        )
        or 0
    )
    sources = await session.scalar(select(func.count(Source.id)).where(Source.enabled.is_(True))) or 0
    users = await session.scalar(select(func.count(User.id))) or 0

    sector_col = func.unnest(Opportunity.sectors).label("sector")
    recent_start, previous_start = now - timedelta(days=30), now - timedelta(days=60)
    sector_rows = (
        await session.execute(
            select(
                sector_col,
                func.count().label("total"),
                func.count().filter(Opportunity.created_at >= recent_start).label("recent"),
                func.count()
                .filter(Opportunity.created_at.between(previous_start, recent_start))
                .label("previous"),
                func.avg(Opportunity.budget_xof).label("avg_budget"),
            )
            .where(Opportunity.created_at >= since_year)
            .group_by(literal_column("sector"))
            .order_by(func.count().desc())
        )
    ).all()
    by_sector = [
        {
            "value": row.sector,
            "label": sector_label(row.sector),
            "count": row.total,
            "recent": row.recent,
            "previous": row.previous,
            "trend": (row.recent - row.previous) / row.previous
            if row.previous
            else (1.0 if row.recent else 0.0),
            "avg_budget_xof": int(row.avg_budget) if row.avg_budget else None,
        }
        for row in sector_rows
    ]

    month = func.date_trunc("month", func.coalesce(Opportunity.published_at, Opportunity.created_at)).label(
        "month"
    )
    monthly_rows = (
        await session.execute(select(month, func.count()).where(*filters).group_by(month).order_by(month))
    ).all()
    monthly = [{"month": m.strftime("%Y-%m"), "count": c} for m, c in monthly_rows if m is not None]

    country_rows = (
        await session.execute(
            select(Opportunity.country, func.count())
            .where(*filters, Opportunity.country.is_not(None))
            .group_by(Opportunity.country)
            .order_by(func.count().desc())
            .limit(12)
        )
    ).all()
    by_country = [{"value": c, "label": country_label(c), "count": n} for c, n in country_rows]

    issuer_rows = (
        await session.execute(
            select(Opportunity.issuer, func.count())
            .where(*filters, Opportunity.issuer != "")
            .group_by(Opportunity.issuer)
            .order_by(func.count().desc())
            .limit(8)
        )
    ).all()
    top_issuers = [{"label": i, "count": n} for i, n in issuer_rows]

    kind_rows = (
        await session.execute(
            select(Opportunity.kind, func.count()).where(*filters).group_by(Opportunity.kind)
        )
    ).all()
    by_kind = [
        {"value": k.value, "label": OPPORTUNITY_KINDS.get(k.value, k.value), "count": n}
        for k, n in sorted(kind_rows, key=lambda r: -r[1])
    ]

    keyword_rows = (
        await session.execute(
            select(Opportunity.keywords, Opportunity.created_at).where(
                Opportunity.created_at >= now - timedelta(days=120)
            )
        )
    ).all()
    recent_kw: Counter[str] = Counter()
    older_kw: Counter[str] = Counter()
    display: dict[str, str] = {}
    for keywords, created in keyword_rows:
        bucket = recent_kw if created >= recent_start else older_kw
        for kw in keywords or []:
            key = normalize(kw)
            if len(key) > 3 and key not in GENERIC_TERMS:
                bucket[key] += 1
                display.setdefault(key, kw.lower())
    emerging = sorted(
        (
            {"label": display.get(kw, kw), "count": n, "growth": n / max(1.0, older_kw[kw] / 3)}
            for kw, n in recent_kw.items()
            if n >= 2
        ),
        key=lambda item: (-item["growth"], -item["count"]),
    )[:12]

    return {
        "totals": {
            "open": open_count,
            "open_budget_xof": int(open_budget),
            "this_week": week_count,
            "sources": sources,
            "users": users,
        },
        "by_sector": by_sector,
        "monthly": monthly,
        "by_country": by_country,
        "top_issuers": top_issuers,
        "by_kind": by_kind,
        "emerging_keywords": emerging,
    }


async def user_position(session: AsyncSession, user: User) -> dict[str, Any]:
    profile = user.profile
    if profile is None or not profile.sectors:
        return {"ready": False}
    now = utcnow()
    window = now - timedelta(days=120)
    sector_filter = Opportunity.sectors.overlap(profile.sectors)
    sector_opps = (
        await session.execute(
            select(Opportunity.id, Opportunity.documents_required, Opportunity.keywords).where(
                Opportunity.created_at >= window, sector_filter
            )
        )
    ).all()
    total = len(sector_opps)
    match_rows = (
        await session.execute(
            select(Match.opportunity_id, Match.score)
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .where(Match.user_id == user.id, Opportunity.created_at >= window)
        )
    ).all()
    scores = {opp_id: score for opp_id, score in match_rows}
    eligible = sum(1 for opp_id, _, _ in sector_opps if scores.get(opp_id, 0) >= 60)
    avg_score = round(sum(scores.values()) / len(scores)) if scores else 0

    owned = {
        doc.doc_type
        for doc in (
            await session.scalars(select(VaultDocument).where(VaultDocument.user_id == user.id))
        ).all()
        if doc.expires_on is None or doc.expires_on >= now.date()
    }
    doc_counter: Counter[str] = Counter()
    kw_counter: Counter[str] = Counter()
    kw_display: dict[str, str] = {}
    for _, docs, keywords in sector_opps:
        for label in set(docs or []):
            doc_counter[label] += 1
        for kw in set(keywords or []):
            key = normalize(kw)
            if len(key) > 3 and key not in GENERIC_TERMS:
                kw_counter[key] += 1
                kw_display.setdefault(key, kw.lower())

    profile_terms = {
        normalize(t) for t in [*profile.skills, *profile.keywords_include, *profile.certifications]
    }
    gaps: list[dict[str, Any]] = []
    for label, count in doc_counter.most_common():
        vault_type = DOC_LABEL_TO_VAULT.get(label)
        if vault_type and vault_type in owned:
            continue
        gaps.append(
            {
                "label": label,
                "kind": "document",
                "offers": count,
                "hint": f"Ajoute-le à ton coffre (ou vérifie sa validité) : {count} offre{'s' if count > 1 else ''} le demande{'nt' if count > 1 else ''}.",
            }
        )
    for term, count in kw_counter.most_common(40):
        if any(term in p or p in term for p in profile_terms if p):
            continue
        if count < 2:
            break
        gaps.append(
            {
                "label": kw_display.get(term, term),
                "kind": "competence",
                "offers": count,
                "hint": f"Compétence demandée dans {count} offres de ton secteur, absente de ton profil.",
            }
        )
        if sum(1 for g in gaps if g["kind"] == "competence") >= 6:
            break
    gaps.sort(key=lambda g: -g["offers"])

    radar = []
    for term, count in kw_counter.most_common(8):
        has = any(term in p or p in term for p in profile_terms if p)
        radar.append(
            {"label": kw_display.get(term, term), "demand": round(count / max(1, total), 3), "has": has}
        )

    return {
        "ready": True,
        "sector_offers": total,
        "eligible_offers": eligible,
        "share": round(eligible / total, 3) if total else 0.0,
        "avg_score": avg_score,
        "gaps": gaps[:10],
        "radar": radar,
    }
