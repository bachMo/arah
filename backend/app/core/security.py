from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

from app.core.config import get_settings

SESSION_COOKIE = "arah_session"
CSRF_HEADER = "X-Arah-Client"
_ALGORITHM = "HS256"
_hasher = PasswordHasher()


class TokenError(Exception):
    pass


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def _encode(payload: dict[str, Any], lifetime: timedelta) -> str:
    now = datetime.now(UTC)
    body = {**payload, "iat": int(now.timestamp()), "exp": int((now + lifetime).timestamp())}
    return jwt.encode(body, get_settings().secret_key, algorithm=_ALGORITHM)


def _decode(token: str, purpose: str) -> dict[str, Any]:
    try:
        data = jwt.decode(token, get_settings().secret_key, algorithms=[_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Ce lien a expiré.") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Ce lien n'est pas valide.") from exc
    if data.get("pur") != purpose:
        raise TokenError("Ce lien n'est pas valide.")
    return data


def create_session_token(user_id: str, session_version: int) -> str:
    days = get_settings().session_days
    return _encode({"sub": user_id, "sv": session_version, "pur": "session"}, timedelta(days=days))


def read_session_token(token: str) -> tuple[str, int]:
    data = _decode(token, "session")
    return str(data["sub"]), int(data.get("sv", 0))


def _password_marker(password_hash: str | None) -> str:
    # Lie un lien de réinitialisation au mot de passe actuel : il devient caduc dès qu'il est utilisé.
    return hashlib.sha256((password_hash or "none").encode()).hexdigest()[:16]


def create_action_token(
    purpose: str, user_id: str, *, password_hash: str | None = None, hours: int = 48
) -> str:
    payload: dict[str, Any] = {"sub": user_id, "pur": purpose}
    if purpose == "reset":
        payload["pm"] = _password_marker(password_hash)
    return _encode(payload, timedelta(hours=hours))


def read_action_token(token: str, purpose: str) -> dict[str, Any]:
    return _decode(token, purpose)


def check_password_marker(data: dict[str, Any], password_hash: str | None) -> bool:
    return hmac.compare_digest(str(data.get("pm", "")), _password_marker(password_hash))


def create_unsubscribe_token(user_id: str) -> str:
    # Lien de désinscription : valable longtemps, comme l'exigent les bonnes pratiques d'envoi.
    return _encode({"sub": user_id, "pur": "unsubscribe"}, timedelta(days=365))


def random_ref(prefix: str = "") -> str:
    return f"{prefix}{secrets.token_hex(8)}"


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())
