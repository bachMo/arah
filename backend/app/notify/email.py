from __future__ import annotations

import logging
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, parseaddr
from pathlib import Path
from typing import Any

import aiosmtplib
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import get_settings

log = logging.getLogger("arah.email")

_env = Environment(
    loader=FileSystemLoader(Path(__file__).parent / "templates"),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)


def render(template: str, **context: Any) -> tuple[str, str]:
    settings = get_settings()
    base = {
        "app_name": settings.app_name,
        "public_url": settings.public_url.rstrip("/"),
        "github_url": settings.github_url,
        **context,
    }
    html = _env.get_template(f"{template}.html").render(**base)
    text = _env.get_template(f"{template}.txt").render(**base)
    return html, text


async def send_email(
    to: str,
    subject: str,
    template: str,
    *,
    unsubscribe_url: str | None = None,
    **context: Any,
) -> bool:
    settings = get_settings()
    html, text = render(template, subject=subject, unsubscribe_url=unsubscribe_url, **context)
    message = EmailMessage()
    name, address = parseaddr(settings.email_from)
    message["From"] = formataddr((name, address))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=address.split("@")[-1] or "arah.local")
    if settings.email_reply_to:
        message["Reply-To"] = settings.email_reply_to
    if unsubscribe_url:
        message["List-Unsubscribe"] = f"<{unsubscribe_url}>"
        message["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    if settings.email_backend == "console":
        log.info("E-mail (mode console) → %s · %s\n%s", to, subject, text)
        return True
    try:
        await aiosmtplib.send(
            message,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            start_tls=settings.smtp_security == "starttls",
            use_tls=settings.smtp_security == "ssl",
            timeout=30,
        )
        return True
    except aiosmtplib.SMTPAuthenticationError as exc:
        log.error("Envoi de l'e-mail à %s refusé : identifiants SMTP invalides (%s)", to, exc)
        return False
    except aiosmtplib.SMTPException as exc:
        hint = ""
        if "AUTH" in str(exc) and settings.smtp_security == "none":
            hint = " · ce serveur demande une connexion chiffrée : essaie SMTP_SECURITY=starttls (port 587)"
        log.error("Envoi de l'e-mail à %s impossible : %s%s", to, exc, hint)
        return False
    except OSError as exc:
        log.error(
            "Envoi de l'e-mail à %s impossible (serveur %s:%s injoignable) : %s",
            to,
            settings.smtp_host,
            settings.smtp_port,
            exc,
        )
        return False
