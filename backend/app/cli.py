"""Commandes d'exploitation.

python -m app.cli run            lance la veille complète maintenant
python -m app.cli reminders      envoie les rappels du jour
python -m app.cli digest         envoie les résumés en attente (ignore la fréquence)
python -m app.cli llm-check      vérifie la connexion au fournisseur de modèles
python -m app.cli make-admin EMAIL
python -m app.cli add-cost "VPS" 6500 [AAAA-MM]
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import date

from sqlalchemy import func, select

from app.core.db import SessionLocal, engine
from app.core.logging import setup_logging


async def _run() -> None:
    from app.agent.pipeline import run_daily

    run = await run_daily("cli")
    if run is None:
        print("Une veille est déjà en cours.")
        return
    print(f"Veille terminée ({run.status.value}).")
    for step in run.steps:
        print(f"  [{step['agent']}] {step['message']}")


async def _reminders() -> None:
    from app.agent.pipeline import run_reminders

    run = await run_reminders("cli")
    print("Rappels envoyés." if run else "Une exécution est déjà en cours.")


async def _digest() -> None:
    from app.agent.pipeline import send_digests

    async with SessionLocal() as session:
        sent = await send_digests(session, force=True)
    print(f"{sent} résumé(s) envoyé(s).")


async def _llm_check() -> None:
    from app.llm.service import get_llm

    try:
        print(await get_llm().ping())
    except Exception as exc:
        print(f"Échec : {exc}")


async def _make_admin(email: str) -> None:
    from app.models import User

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(func.lower(User.email) == email.lower()))
        if user is None:
            print("Aucun compte avec cette adresse. Inscris-toi d'abord sur le site.")
            return
        user.is_admin = True
        user.is_verified = True
        await session.commit()
    print(f"{email} est maintenant administrateur.")


async def _add_cost(label: str, amount: int, month: str | None) -> None:
    from app.models import LedgerEntry, LedgerKind

    day = date.fromisoformat(f"{month}-01") if month else date.today().replace(day=1)
    async with SessionLocal() as session:
        session.add(LedgerEntry(month=day, kind=LedgerKind.cost, label=label, amount_xof=amount))
        await session.commit()
    print(f"Coût ajouté : {label} · {amount} F CFA ({day:%m/%Y}).")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Commandes d'Arah!")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("run")
    sub.add_parser("reminders")
    sub.add_parser("digest")
    sub.add_parser("llm-check")
    admin = sub.add_parser("make-admin")
    admin.add_argument("email")
    cost = sub.add_parser("add-cost")
    cost.add_argument("label")
    cost.add_argument("amount", type=int)
    cost.add_argument("month", nargs="?")
    args = parser.parse_args()
    setup_logging()

    async def dispatch() -> None:
        try:
            if args.command == "run":
                await _run()
            elif args.command == "reminders":
                await _reminders()
            elif args.command == "digest":
                await _digest()
            elif args.command == "llm-check":
                await _llm_check()
            elif args.command == "make-admin":
                await _make_admin(args.email)
            elif args.command == "add-cost":
                await _add_cost(args.label, args.amount, args.month)
        finally:
            await engine.dispose()

    asyncio.run(dispatch())


if __name__ == "__main__":
    main()
