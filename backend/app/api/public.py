from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import SessionDep
from app.core.config import get_settings
from app.taxonomy import taxonomy_payload

router = APIRouter(tags=["public"])


@router.get("/health")
async def health(session: AsyncSession = SessionDep) -> dict[str, str]:
    await session.execute(text("select 1"))
    return {"status": "ok"}


@router.get("/config")
async def public_config() -> dict:
    s = get_settings()
    return {
        "app_name": s.app_name,
        "environment": s.environment,
        "llm": {"enabled": s.llm_enabled, "provider": s.llm_provider if s.llm_enabled else None},
        "google_enabled": s.google_enabled,
        "whatsapp_enabled": s.whatsapp_ready,
        "demo_data": s.demo_data,
        "github_url": s.github_url,
        "contact_email": s.contact_email,
        "donations": {
            "paytech": s.paytech_enabled,
            "wave": s.donation_wave_number,
            "orange_money": s.donation_orange_money_number,
            "monthly_goal_xof": s.donation_monthly_goal_xof,
        },
    }


@router.get("/taxonomy")
async def taxonomy() -> dict:
    return taxonomy_payload()
