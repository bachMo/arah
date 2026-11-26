"""Alertes WhatsApp via l'API WhatsApp Cloud de Meta.

Le module est complet mais désactivé par défaut (WHATSAPP_ENABLED=false) : il sera activé dès que
les dons couvriront les frais de messages de Meta. Les messages hors fenêtre de 24 h doivent utiliser
des modèles approuvés dans le gestionnaire WhatsApp (arah_digest et arah_rappel par défaut).
"""

from __future__ import annotations

import logging
import re

import httpx

from app.core.config import get_settings

log = logging.getLogger("arah.whatsapp")

_PHONE = re.compile(r"^\+?[1-9]\d{7,14}$")


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    digits = re.sub(r"[\s().-]", "", value)
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if not digits.startswith("+") and len(digits) == 9 and digits[0] == "7":
        digits = "+221" + digits
    return digits if _PHONE.match(digits) else None


async def send_template(to: str, template: str, parameters: list[str]) -> bool:
    settings = get_settings()
    if not settings.whatsapp_ready:
        return False
    phone = normalize_phone(to)
    if not phone:
        return False
    url = f"https://graph.facebook.com/{settings.whatsapp_api_version}/{settings.whatsapp_phone_number_id}/messages"
    body = {
        "messaging_product": "whatsapp",
        "to": phone.lstrip("+"),
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": settings.whatsapp_template_lang},
            "components": [
                {"type": "body", "parameters": [{"type": "text", "text": p[:1000]} for p in parameters]}
            ],
        },
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url, json=body, headers={"Authorization": f"Bearer {settings.whatsapp_token}"}
            )
        if response.status_code >= 400:
            log.error("WhatsApp a refusé le message (%s) : %s", response.status_code, response.text[:300])
            return False
        return True
    except httpx.HTTPError as exc:
        log.error("Envoi WhatsApp impossible : %s", exc)
        return False


async def send_digest(to: str, count: int, top_title: str, link: str) -> bool:
    return await send_template(to, get_settings().whatsapp_template_digest, [str(count), top_title, link])


async def send_reminder(to: str, title: str, days: int, link: str) -> bool:
    return await send_template(to, get_settings().whatsapp_template_reminder, [title, str(days), link])
