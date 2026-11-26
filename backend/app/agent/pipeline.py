"""Orchestration de l'agent : le Veilleur collecte, l'Analyste résume et note, le Suivi prévient.

Chaque étape est tracée dans `agent_runs`, affichée publiquement sur la page « Journal de l'agent ».
Le journal ne contient jamais de données personnelles : seulement des compteurs et des offres publiques.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.enrich import apply_rules, enrich_with_llm
from app.agent.matching import (
    FeedbackWeights,
    LlmMatchOut,
    MatchResult,
    OpportunityData,
    ProfileData,
    blend_scores,
    build_feedback_weights,
    days_left,
    score_match,
)
from app.agent.prompts import MATCH_PROMPT, MATCH_SYSTEM
from app.agent.writer import describe_offer, describe_profile
from app.core.config import get_settings
from app.core.db import SessionLocal, engine, utcnow
from app.core.security import create_unsubscribe_token
from app.core.text import fingerprint
from app.llm.service import BudgetExceeded, LLMService, get_llm
from app.models import (
    AgentRun,
    AlertFrequency,
    Feedback,
    Match,
    MatchStatus,
    NotificationLog,
    Opportunity,
    OpportunityKind,
    Profile,
    RunStatus,
    Source,
    User,
    VaultDocument,
)
from app.notify import whatsapp
from app.notify.email import send_email
from app.sources import DEFAULT_SOURCES, DEMO_SOURCE, get_adapter
from app.sources.base import RawOpportunity
from app.taxonomy import DOC_TYPES

log = logging.getLogger("arah.agent")

LOCK_ID = (
    7_406_211  # verrou consultatif PostgreSQL : une seule veille à la fois, même avec plusieurs instances
)
REMINDER_DAYS = (7, 3, 1)
VAULT_REMINDER_DAYS = (30, 7, 0)


class RunLog:
    def __init__(self, run: AgentRun) -> None:
        self.run = run

    def step(self, message: str, *, level: str = "info", agent: str = "Veilleur", **data: Any) -> None:
        entry = {
            "t": utcnow().isoformat(timespec="seconds"),
            "level": level,
            "agent": agent,
            "message": message,
        }
        if data:
            entry["data"] = data
        self.run.steps = [*self.run.steps, entry]
        getattr(log, "warning" if level == "warning" else "error" if level == "error" else "info")(message)

    def stat(self, key: str, value: Any) -> None:
        self.run.stats = {**self.run.stats, key: value}

    def add(self, key: str, value: int) -> None:
        self.run.stats = {**self.run.stats, key: int(self.run.stats.get(key, 0)) + value}


async def ensure_sources(session: AsyncSession) -> None:
    settings = get_settings()
    existing = {s.slug: s for s in (await session.scalars(select(Source))).all()}
    for spec in DEFAULT_SOURCES:
        if spec["slug"] not in existing:
            session.add(Source(**spec, enabled=True))
    demo = existing.get(DEMO_SOURCE["slug"])
    if settings.demo_data and demo is None:
        session.add(Source(**DEMO_SOURCE, enabled=True))
    elif demo is not None:
        demo.enabled = settings.demo_data
    await session.commit()


def _new_opportunity(source: Source, raw: RawOpportunity, content_hash: str) -> Opportunity:
    kind = raw.kind if raw.kind in OpportunityKind._value2member_map_ else "other"
    return Opportunity(
        source_id=source.id,
        external_id=raw.external_id[:200],
        content_hash=content_hash,
        url=raw.url[:1000],
        title=raw.title[:600],
        issuer=raw.issuer[:300],
        country=raw.country,
        kind=OpportunityKind(kind),
        sectors=list(raw.sectors),
        language=raw.language,
        description=raw.description[:60_000],
        budget_amount=raw.budget_amount,
        budget_currency=raw.budget_currency,
        documents_required=list(raw.documents_required),
        published_at=raw.published_at,
        deadline_at=raw.deadline_at,
        is_demo=raw.is_demo,
    )


async def collect(session: AsyncSession, logbook: RunLog) -> list[uuid.UUID]:
    settings = get_settings()
    sources = (
        await session.scalars(select(Source).where(Source.enabled.is_(True)).order_by(Source.name))
    ).all()
    now = utcnow()
    new_ids: list[uuid.UUID] = []
    discarded: Counter[str] = Counter()
    logbook.step(f"Début de la veille : {len(sources)} source{'s' if len(sources) > 1 else ''} à parcourir.")
    async with httpx.AsyncClient(timeout=settings.source_timeout_seconds, follow_redirects=True) as client:
        for source in sources:
            adapter = get_adapter(source.kind)
            if adapter is None:
                logbook.step(f"{source.name} : type de source inconnu ({source.kind}).", level="warning")
                continue
            try:
                items = await adapter.fetch(client, source.url, dict(source.config or {}))
            except Exception as exc:  # une source en panne ne doit jamais arrêter la veille
                source.last_status, source.last_message = "error", str(exc)[:500]
                source.last_run_at = now
                logbook.step(
                    f"{source.name} : source injoignable ({exc.__class__.__name__}).",
                    level="warning",
                    source=source.slug,
                )
                await session.commit()
                continue

            existing_ids = set(
                (
                    await session.scalars(
                        select(Opportunity.external_id).where(Opportunity.source_id == source.id)
                    )
                ).all()
            )
            created = 0
            for raw in items:
                if not raw.title.strip():
                    discarded["sans titre"] += 1
                    continue
                if raw.deadline_at and raw.deadline_at < now:
                    discarded["date limite dépassée"] += 1
                    continue
                if raw.external_id in existing_ids:
                    continue
                content_hash = fingerprint(raw.title, raw.issuer)
                duplicate = await session.scalar(
                    select(Opportunity.id).where(
                        Opportunity.content_hash == content_hash, Opportunity.source_id != source.id
                    )
                )
                if duplicate:
                    discarded["déjà publiée par une autre source"] += 1
                    continue
                opp = _new_opportunity(source, raw, content_hash)
                session.add(opp)
                await session.flush()
                existing_ids.add(raw.external_id)
                new_ids.append(opp.id)
                created += 1
            source.last_run_at, source.last_status = now, "ok"
            source.last_found, source.last_message = len(items), ""
            logbook.step(
                f"{source.name} : {len(items)} offre{'s' if len(items) > 1 else ''} lue{'s' if len(items) > 1 else ''}, "
                f"{created} nouvelle{'s' if created > 1 else ''}.",
                source=source.slug,
                read=len(items),
                new=created,
            )
            await session.commit()

    logbook.stat("sources", len(sources))
    logbook.stat("new_opportunities", len(new_ids))
    if discarded:
        details = ", ".join(f"{n} {reason}" for reason, n in discarded.most_common())
        logbook.step(f"Offres écartées : {details}.", discarded=dict(discarded))
    logbook.stat("discarded", sum(discarded.values()))
    return new_ids


async def analyse(session: AsyncSession, logbook: RunLog, llm: LLMService) -> int:
    settings = get_settings()
    pending = (
        await session.scalars(
            select(Opportunity)
            .where(Opportunity.enriched_at.is_(None))
            .order_by(Opportunity.created_at.desc())
            .limit(2000)
        )
    ).all()
    if not pending:
        logbook.step("Aucune nouvelle offre à analyser.", agent="Analyste")
        return 0
    with_llm = 0
    budget_hit = False
    for index, opp in enumerate(pending):
        if llm.enabled and not budget_hit and index < settings.llm_enrich_per_run:
            try:
                if await enrich_with_llm(session, llm, opp, run_id=logbook.run.id):
                    with_llm += 1
            except BudgetExceeded:
                budget_hit = True
                logbook.step(
                    "Plafond quotidien de dépenses IA atteint : la suite est analysée par règles.",
                    level="warning",
                    agent="Analyste",
                )
        apply_rules(opp)
        if index % 25 == 24:
            await session.commit()
    await session.commit()
    message = (
        f"{len(pending)} offre{'s' if len(pending) > 1 else ''} résumée{'s' if len(pending) > 1 else ''}"
    )
    message += (
        f", dont {with_llm} avec l'IA."
        if with_llm
        else " par règles (IA non configurée)."
        if not llm.enabled
        else "."
    )
    logbook.step(message, agent="Analyste", total=len(pending), llm=with_llm)
    logbook.stat("analysed", len(pending))
    return len(pending)


async def _feedback_weights(session: AsyncSession, user_id: uuid.UUID) -> FeedbackWeights | None:
    rows = (
        await session.execute(
            select(Opportunity, Match.feedback)
            .join(Match, Match.opportunity_id == Opportunity.id)
            .where(Match.user_id == user_id, Match.feedback.is_not(None))
            .order_by(Match.updated_at.desc())
            .limit(200)
        )
    ).all()
    if not rows:
        return None
    return build_feedback_weights(
        [(OpportunityData.from_model(o), fb == Feedback.relevant) for o, fb in rows]
    )


async def _candidate_opportunities(session: AsyncSession, *, limit: int = 1500) -> list[Opportunity]:
    now = utcnow()
    query = (
        select(Opportunity)
        .where(
            Opportunity.enriched_at.is_not(None),
            or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now),
            or_(Opportunity.deadline_at.is_not(None), Opportunity.created_at >= now - timedelta(days=60)),
        )
        .order_by(Opportunity.created_at.desc())
        .limit(limit)
    )
    return list((await session.scalars(query)).all())


async def refine_with_llm(
    session: AsyncSession,
    llm: LLMService,
    user: User,
    profile: Profile,
    match: Match,
    opp: Opportunity,
    *,
    run_id: uuid.UUID | None = None,
) -> bool:
    data = await llm.complete_json(
        session,
        purpose="match",
        system=MATCH_SYSTEM,
        prompt=MATCH_PROMPT.format(profile=describe_profile(user, profile), offer=describe_offer(opp)),
        schema=LlmMatchOut,
        tier="fast",
        max_tokens=700,
        run_id=run_id,
    )
    if data is None:
        return False
    match.score = blend_scores(match.rules_score, data.score)
    match.reasons = [r.strip()[:240] for r in data.reasons if r.strip()][:4] or match.reasons
    match.criteria = data.criteria or match.criteria
    match.risks = [r.strip()[:240] for r in data.risks if r.strip()][:3]
    match.method = f"IA · {llm.model_for('fast')}"
    return True


async def match_user(
    session: AsyncSession,
    user: User,
    llm: LLMService,
    *,
    candidates: list[Opportunity] | None = None,
    recompute: bool = False,
    run_id: uuid.UUID | None = None,
) -> tuple[int, int]:
    """Calcule les correspondances d'un utilisateur. Renvoie (correspondances créées ou mises à jour, affinées par IA)."""
    settings = get_settings()
    profile = user.profile
    if profile is None:
        return 0, 0
    pdata = ProfileData.from_model(profile)
    if pdata.is_empty:
        return 0, 0
    candidates = candidates if candidates is not None else await _candidate_opportunities(session)
    weights = await _feedback_weights(session, user.id)
    existing = {
        m.opportunity_id: m
        for m in (await session.scalars(select(Match).where(Match.user_id == user.id))).all()
    }
    touched: list[tuple[Match, Opportunity]] = []
    stale: list[uuid.UUID] = []
    for opp in candidates:
        current = existing.get(opp.id)
        if current is not None and not recompute:
            continue
        result: MatchResult = score_match(pdata, OpportunityData.from_model(opp), feedback=weights)
        if current is None:
            if result.excluded or result.score < settings.match_min_score:
                continue
            match = Match(
                user_id=user.id,
                opportunity_id=opp.id,
                score=result.score,
                rules_score=result.score,
                reasons=result.reasons,
                criteria=result.criteria,
                risks=result.risks,
                method="règles",
            )
            session.add(match)
            touched.append((match, opp))
            continue
        untouched_by_user = current.status == MatchStatus.new and current.feedback is None
        if (result.excluded or result.score < settings.match_min_score) and untouched_by_user:
            stale.append(current.id)
            continue
        current.rules_score = result.score
        if current.method == "règles" or recompute:
            current.score, current.reasons = result.score, result.reasons
            current.criteria, current.risks, current.method = result.criteria, result.risks, "règles"
            touched.append((current, opp))
    if stale:
        await session.execute(delete(Match).where(Match.id.in_(stale)))
    await session.flush()

    refined = 0
    if llm.enabled and touched:
        best = sorted(touched, key=lambda pair: -pair[0].rules_score)[: settings.llm_rerank_per_user]
        for match, opp in best:
            if match.rules_score < settings.match_min_score + 5:
                break
            try:
                if await refine_with_llm(session, llm, user, profile, match, opp, run_id=run_id):
                    refined += 1
            except BudgetExceeded:
                break
    await session.commit()
    return len(touched), refined


async def match_all(session: AsyncSession, logbook: RunLog, llm: LLMService) -> None:
    users = (
        await session.scalars(
            select(User).join(Profile, Profile.user_id == User.id).order_by(User.created_at)
        )
    ).all()
    candidates = await _candidate_opportunities(session)
    total, refined_total = 0, 0
    for user in users:
        count, refined = await match_user(session, user, llm, candidates=candidates, run_id=logbook.run.id)
        total += count
        refined_total += refined
    extra = f", dont {refined_total} affinées par l'IA" if refined_total else ""
    logbook.step(
        f"Score calculé pour {len(users)} profil{'s' if len(users) > 1 else ''} sur {len(candidates)} offres ouvertes : "
        f"{total} correspondance{'s' if total > 1 else ''}{extra}.",
        agent="Analyste",
        profiles=len(users),
        matches=total,
        refined=refined_total,
    )
    logbook.stat("profiles", len(users))
    logbook.stat("matches", total)


def score_color(score: int) -> str:
    return "#1F8A5B" if score >= 75 else "#E07B12" if score >= 55 else "#8C8273"


def deadline_label(deadline: datetime | None) -> tuple[str, bool]:
    remaining = days_left(deadline)
    if remaining is None:
        return "", False
    if remaining <= 0:
        return "dernier jour", True
    if remaining == 1:
        return "demain", True
    return f"J-{remaining} · {deadline:%d/%m}", remaining <= 7


async def send_digests(session: AsyncSession, logbook: RunLog | None = None, *, force: bool = False) -> int:
    settings = get_settings()
    now = utcnow()
    is_monday = now.astimezone().weekday() == 0
    users = (
        await session.scalars(
            select(User).where(User.is_verified.is_(True), User.alert_frequency != AlertFrequency.off)
        )
    ).all()
    sources_count = await session.scalar(select(func.count(Source.id)).where(Source.enabled.is_(True))) or 0
    sent_email = sent_whatsapp = 0
    for user in users:
        if user.alert_frequency == AlertFrequency.weekly and not (is_monday or force):
            continue
        min_gap = timedelta(hours=20) if user.alert_frequency == AlertFrequency.daily else timedelta(days=6)
        if not force and user.last_digest_at and now - user.last_digest_at < min_gap:
            continue
        rows = (
            await session.execute(
                select(Match, Opportunity)
                .join(Opportunity, Opportunity.id == Match.opportunity_id)
                .where(
                    Match.user_id == user.id,
                    Match.notified_at.is_(None),
                    Match.status == MatchStatus.new,
                    Match.score >= user.alert_min_score,
                    or_(Opportunity.deadline_at.is_(None), Opportunity.deadline_at >= now),
                )
                .order_by(Match.score.desc())
                .limit(10)
            )
        ).all()
        if not rows:
            continue
        base = settings.public_url.rstrip("/")
        items = []
        for match, opp in rows:
            label, urgent = deadline_label(opp.deadline_at)
            items.append(
                {
                    "title": opp.title,
                    "issuer": opp.issuer,
                    "score": match.score,
                    "color": score_color(match.score),
                    "deadline": label,
                    "urgent": urgent,
                    "reason": (match.reasons or [""])[0],
                    "url": f"{base}/offre/{opp.id}",
                }
            )
        token = create_unsubscribe_token(str(user.id))
        unsubscribe_url = f"{settings.api_url.rstrip('/')}/api/alerts/unsubscribe?token={token}"
        period = "résumé du jour" if user.alert_frequency == AlertFrequency.daily else "résumé de la semaine"
        delivered = False
        if user.alert_email:
            delivered = await send_email(
                user.email,
                f"{len(items)} opportunité{'s' if len(items) > 1 else ''} pour toi · {items[0]['title'][:60]}",
                "digest",
                unsubscribe_url=unsubscribe_url,
                items=items,
                name=user.full_name.split(" ")[0] if user.full_name else "",
                period=period,
                sources_count=sources_count,
                radar_url=f"{base}/radar",
            )
            sent_email += int(delivered)
        if user.alert_whatsapp and user.whatsapp_number and settings.whatsapp_ready:
            ok = await whatsapp.send_digest(
                user.whatsapp_number, len(items), items[0]["title"], f"{base}/radar"
            )
            sent_whatsapp += int(ok)
            delivered = delivered or ok
        if delivered:
            for match, _ in rows:
                match.notified_at = now
            user.last_digest_at = now
            await session.commit()
    if logbook:
        extra = (
            f" et {sent_whatsapp} message{'s' if sent_whatsapp > 1 else ''} WhatsApp" if sent_whatsapp else ""
        )
        logbook.step(
            f"Résumés envoyés : {sent_email} e-mail{'s' if sent_email > 1 else ''}{extra}.",
            agent="Suivi",
            emails=sent_email,
            whatsapp=sent_whatsapp,
        )
        logbook.stat("emails", sent_email)
    return sent_email + sent_whatsapp


async def _log_once(session: AsyncSession, user_id: uuid.UUID, kind: str, ref: str, channel: str) -> bool:
    exists = await session.scalar(
        select(NotificationLog.id).where(
            NotificationLog.user_id == user_id, NotificationLog.kind == kind, NotificationLog.ref == ref
        )
    )
    if exists:
        return False
    session.add(NotificationLog(user_id=user_id, kind=kind, ref=ref, channel=channel))
    return True


async def send_reminders(session: AsyncSession, logbook: RunLog) -> int:
    settings = get_settings()
    base = settings.public_url.rstrip("/")
    now = utcnow()
    sent = 0
    rows = (
        await session.execute(
            select(Match, Opportunity, User)
            .join(Opportunity, Opportunity.id == Match.opportunity_id)
            .join(User, User.id == Match.user_id)
            .where(
                Match.status.in_([MatchStatus.interested, MatchStatus.preparing]),
                User.reminders_enabled.is_(True),
                User.is_verified.is_(True),
                Opportunity.deadline_at.is_not(None),
                Opportunity.deadline_at >= now,
                Opportunity.deadline_at <= now + timedelta(days=8),
            )
        )
    ).all()
    for match, opp, user in rows:
        remaining = (opp.deadline_at.date() - now.date()).days
        if remaining not in REMINDER_DAYS:
            continue
        if not await _log_once(session, user.id, f"deadline-J{remaining}", str(match.id), "email"):
            continue
        when = "demain" if remaining == 1 else f"dans {remaining} jours"
        await send_email(
            user.email,
            f"J-{remaining} · {opp.title[:70]}",
            "reminder",
            unsubscribe_url=None,
            headline=f"Date limite {when} : {opp.title}",
            lines=[
                line
                for line in (
                    f"Émetteur : {opp.issuer}" if opp.issuer else "",
                    f"Dépôt attendu le {opp.deadline_at:%d/%m/%Y}.",
                    "Ton brouillon de réponse t'attend : vérifie les pièces et la matrice d'exigences avant d'envoyer.",
                )
                if line
            ],
            action_url=f"{base}/preparer/{opp.id}",
            action_label="Reprendre ma préparation",
        )
        if user.alert_whatsapp and user.whatsapp_number and settings.whatsapp_ready:
            await whatsapp.send_reminder(
                user.whatsapp_number, opp.title, remaining, f"{base}/preparer/{opp.id}"
            )
        sent += 1
        await session.commit()

    today = now.date()
    docs = (
        await session.execute(
            select(VaultDocument, User)
            .join(User, User.id == VaultDocument.user_id)
            .where(
                VaultDocument.expires_on.is_not(None),
                VaultDocument.expires_on <= today + timedelta(days=31),
                VaultDocument.expires_on >= today,
                User.reminders_enabled.is_(True),
                User.is_verified.is_(True),
            )
        )
    ).all()
    for doc, user in docs:
        remaining = (doc.expires_on - today).days
        if remaining not in VAULT_REMINDER_DAYS:
            continue
        if not await _log_once(
            session, user.id, f"vault-J{remaining}", f"{doc.id}:{doc.expires_on}", "email"
        ):
            continue
        label = doc.label or DOC_TYPES.get(doc.doc_type, doc.doc_type)
        when = "aujourd'hui" if remaining == 0 else f"dans {remaining} jours"
        await send_email(
            user.email,
            f"{label} expire {when}",
            "reminder",
            headline=f"{label} expire {when}",
            lines=[
                f"Date d'expiration : {doc.expires_on:%d/%m/%Y}.",
                "Pense à la renouveler : une pièce périmée à la date limite peut faire rejeter un dossier.",
            ],
            action_url=f"{base}/coffre",
            action_label="Ouvrir mon coffre",
        )
        sent += 1
        await session.commit()

    logbook.step(f"Rappels envoyés : {sent}.", agent="Suivi", reminders=sent)
    logbook.stat("reminders", sent)
    return sent


async def _start_run(session: AsyncSession, kind: str, trigger: str) -> RunLog:
    run = AgentRun(kind=kind, trigger=trigger, status=RunStatus.running, stats={}, steps=[])
    session.add(run)
    await session.commit()
    return RunLog(run)


async def _finish(session: AsyncSession, logbook: RunLog, status: RunStatus) -> None:
    run = logbook.run
    totals = (
        await session.execute(
            text(
                "select coalesce(sum(tokens_in),0), coalesce(sum(tokens_out),0), coalesce(sum(cost_usd),0) "
                "from llm_calls where run_id = :rid"
            ),
            {"rid": run.id},
        )
    ).one()
    run.tokens_in, run.tokens_out, run.cost_usd = int(totals[0]), int(totals[1]), float(totals[2])
    run.status = status
    run.finished_at = utcnow()
    await session.commit()


async def _with_lock(coro_factory) -> AgentRun | None:
    async with engine.connect() as lock_conn:
        acquired = await lock_conn.scalar(text("select pg_try_advisory_lock(:id)"), {"id": LOCK_ID})
        if not acquired:
            log.info("Une exécution de l'agent est déjà en cours : on passe.")
            return None
        try:
            return await coro_factory()
        finally:
            await lock_conn.execute(text("select pg_advisory_unlock(:id)"), {"id": LOCK_ID})
            await lock_conn.commit()


async def run_daily(trigger: str = "schedule", llm: LLMService | None = None) -> AgentRun | None:
    llm = llm or get_llm()

    async def job() -> AgentRun:
        async with SessionLocal() as session:
            await ensure_sources(session)
            logbook = await _start_run(session, "veille", trigger)
            status = RunStatus.success
            for name, step in (
                ("collecte", lambda: collect(session, logbook)),
                ("analyse", lambda: analyse(session, logbook, llm)),
                ("score", lambda: match_all(session, logbook, llm)),
                ("alertes", lambda: send_digests(session, logbook)),
            ):
                try:
                    await step()
                except Exception as exc:
                    await session.rollback()
                    status = RunStatus.partial
                    log.exception("Étape « %s » en échec", name)
                    logbook.step(f"Étape « {name} » interrompue : {exc.__class__.__name__}.", level="error")
                    await session.commit()
            await _finish(session, logbook, status)
            return logbook.run

    return await _with_lock(job)


async def run_reminders(trigger: str = "schedule") -> AgentRun | None:
    async def job() -> AgentRun:
        async with SessionLocal() as session:
            logbook = await _start_run(session, "rappels", trigger)
            status = RunStatus.success
            try:
                await send_reminders(session, logbook)
            except Exception as exc:
                await session.rollback()
                status = RunStatus.failed
                log.exception("Rappels en échec")
                logbook.step(f"Rappels interrompus : {exc.__class__.__name__}.", level="error", agent="Suivi")
            await _finish(session, logbook, status)
            return logbook.run

    return await _with_lock(job)


async def first_match_for_user(user_id: uuid.UUID) -> None:
    """Première veille immédiate après la saisie du profil, pour montrer la valeur dès la première visite."""
    async with SessionLocal() as session:
        user = await session.get(User, user_id)
        if user is None:
            return
        try:
            await match_user(session, user, get_llm(), recompute=True)
        except Exception:
            await session.rollback()
            log.exception("Première veille impossible pour un utilisateur")
