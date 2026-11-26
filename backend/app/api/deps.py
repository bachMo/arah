from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_session
from app.core.security import SESSION_COOKIE, TokenError, create_session_token, read_session_token
from app.models import User

SessionDep = Depends(get_session)


def _token_from(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(SESSION_COOKIE)


async def current_user_optional(request: Request, session: AsyncSession = SessionDep) -> User | None:
    token = _token_from(request)
    if not token:
        return None
    try:
        user_id, version = read_session_token(token)
        user = await session.get(User, uuid.UUID(user_id))
    except (TokenError, ValueError):
        return None
    if user is None or user.session_version != version:
        return None
    return user


async def current_user(user: User | None = Depends(current_user_optional)) -> User:
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Connecte-toi pour continuer.")
    return user


async def admin_user(user: User = Depends(current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Réservé aux administrateurs.")
    return user


def set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        SESSION_COOKIE,
        create_session_token(str(user.id), user.session_version),
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/", samesite="lax")
