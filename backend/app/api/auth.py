from __future__ import annotations

import secrets
import uuid
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    SessionDep,
    clear_session_cookie,
    current_user,
    current_user_optional,
    set_session_cookie,
)
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.ratelimit import auth_limit, email_limit
from app.core.security import (
    TokenError,
    check_password_marker,
    create_action_token,
    hash_password,
    password_needs_rehash,
    read_action_token,
    verify_password,
)
from app.models import Match, Preparation, User, VaultDocument
from app.notify.email import send_email
from app.schemas import (
    ChangePasswordIn,
    EmailIn,
    LoginIn,
    ProfileOut,
    RegisterIn,
    ResetIn,
    TokenIn,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
GOOGLE_STATE_COOKIE = "arah_oauth_state"


def user_out(user: User) -> UserOut:
    data = UserOut.model_validate(user)
    data.has_password = bool(user.password_hash)
    data.has_profile = user.profile is not None and bool(user.profile.sectors or user.profile.skills)
    return data


def _normalize_email(email: str) -> str:
    return email.strip().lower()


async def _send_verification(user: User) -> None:
    settings = get_settings()
    token = create_action_token("verify", str(user.id), hours=48)
    await send_email(
        user.email,
        "Confirme ton adresse e-mail",
        "verify",
        name=user.full_name.split(" ")[0] if user.full_name else "",
        action_url=f"{settings.public_url.rstrip('/')}/verifier?token={token}",
    )


@router.post("/register", response_model=UserOut, status_code=201, dependencies=[Depends(auth_limit)])
async def register(
    payload: RegisterIn, response: Response, background: BackgroundTasks, session: AsyncSession = SessionDep
) -> UserOut:
    settings = get_settings()
    email = _normalize_email(payload.email)
    if await session.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Un compte existe déjà avec cette adresse. Connecte-toi."
        )
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        is_admin=email in settings.admin_emails,
        last_login_at=utcnow(),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user, ["profile"])
    background.add_task(_send_verification, user)
    set_session_cookie(response, user)
    return user_out(user)


@router.post("/login", response_model=UserOut, dependencies=[Depends(auth_limit)])
async def login(payload: LoginIn, response: Response, session: AsyncSession = SessionDep) -> UserOut:
    email = _normalize_email(payload.email)
    user = await session.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Adresse e-mail ou mot de passe incorrect.")
    if password_needs_rehash(user.password_hash or ""):
        user.password_hash = hash_password(payload.password)
    if email in get_settings().admin_emails and not user.is_admin:
        user.is_admin = True
    user.last_login_at = utcnow()
    await session.commit()
    set_session_cookie(response, user)
    return user_out(user)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> Response:
    clear_session_cookie(response)
    response.status_code = 204
    return response


@router.get("/session", response_model=UserOut | None)
async def session_state(user: User | None = Depends(current_user_optional)) -> UserOut | None:
    """Comme /me, mais renvoie null au lieu d'une erreur 401 pour les visiteurs."""
    return user_out(user) if user else None


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.post("/verify", response_model=UserOut)
async def verify(payload: TokenIn, response: Response, session: AsyncSession = SessionDep) -> UserOut:
    try:
        data = read_action_token(payload.token, "verify")
        user = await session.get(User, uuid.UUID(data["sub"]))
    except (TokenError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc) or "Lien invalide.") from exc
    if user is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Ce compte n'existe plus.")
    user.is_verified = True
    await session.commit()
    set_session_cookie(response, user)
    return user_out(user)


@router.post("/resend-verification", status_code=202, dependencies=[Depends(email_limit)])
async def resend_verification(
    background: BackgroundTasks, user: User = Depends(current_user)
) -> dict[str, str]:
    if not user.is_verified:
        background.add_task(_send_verification, user)
    return {"detail": "Si ton adresse n'est pas encore confirmée, un nouveau lien vient de partir."}


@router.post("/forgot-password", status_code=202, dependencies=[Depends(email_limit)])
async def forgot_password(
    payload: EmailIn, background: BackgroundTasks, session: AsyncSession = SessionDep
) -> dict[str, str]:
    user = await session.scalar(select(User).where(func.lower(User.email) == _normalize_email(payload.email)))
    if user is not None:
        token = create_action_token("reset", str(user.id), password_hash=user.password_hash, hours=2)
        url = f"{get_settings().public_url.rstrip('/')}/reinitialiser?token={token}"
        background.add_task(
            send_email, user.email, "Choisis un nouveau mot de passe", "reset", action_url=url
        )
    # Même réponse dans tous les cas : on ne révèle pas quelles adresses ont un compte.
    return {
        "detail": "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé."
    }


@router.post("/reset-password", response_model=UserOut, dependencies=[Depends(auth_limit)])
async def reset_password(payload: ResetIn, response: Response, session: AsyncSession = SessionDep) -> UserOut:
    try:
        data = read_action_token(payload.token, "reset")
        user = await session.get(User, uuid.UUID(data["sub"]))
    except (TokenError, ValueError, KeyError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc) or "Lien invalide.") from exc
    if user is None or not check_password_marker(data, user.password_hash):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Ce lien a déjà été utilisé. Fais une nouvelle demande."
        )
    user.password_hash = hash_password(payload.password)
    user.session_version += 1
    user.is_verified = True
    await session.commit()
    set_session_cookie(response, user)
    return user_out(user)


@router.post("/change-password", status_code=204, dependencies=[Depends(auth_limit)])
async def change_password(
    payload: ChangePasswordIn,
    response: Response,
    user: User = Depends(current_user),
    session: AsyncSession = SessionDep,
) -> Response:
    if user.password_hash and not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mot de passe actuel incorrect.")
    user.password_hash = hash_password(payload.new_password)
    user.session_version += 1
    await session.commit()
    set_session_cookie(response, user)
    response.status_code = 204
    return response


@router.get("/export")
async def export_data(user: User = Depends(current_user), session: AsyncSession = SessionDep) -> dict:
    matches = (await session.scalars(select(Match).where(Match.user_id == user.id))).all()
    preps = (await session.scalars(select(Preparation).where(Preparation.user_id == user.id))).all()
    docs = (await session.scalars(select(VaultDocument).where(VaultDocument.user_id == user.id))).all()
    return {
        "compte": user_out(user).model_dump(mode="json"),
        "profil": ProfileOut.model_validate(user.profile).model_dump(mode="json") if user.profile else None,
        "offres_suivies": [
            {
                "offre": str(m.opportunity_id),
                "titre": m.opportunity.title,
                "score": m.score,
                "statut": m.status.value,
                "avis": m.feedback.value if m.feedback else None,
            }
            for m in matches
        ],
        "preparations": [
            {"offre": str(p.opportunity_id), "lettre": p.letter, "plan": p.outline, "pieces": p.checklist}
            for p in preps
        ],
        "coffre": [
            {
                "type": d.doc_type,
                "libelle": d.label,
                "reference": d.reference,
                "expire_le": d.expires_on.isoformat() if d.expires_on else None,
            }
            for d in docs
        ],
    }


@router.delete("/me", status_code=204)
async def delete_account(
    response: Response, user: User = Depends(current_user), session: AsyncSession = SessionDep
) -> Response:
    await session.delete(user)
    await session.commit()
    clear_session_cookie(response)
    response.status_code = 204
    return response


# --- Connexion avec Google ----------------------------------------------------------------------------


@router.get("/google/start")
async def google_start() -> RedirectResponse:
    settings = get_settings()
    if not settings.google_enabled:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="La connexion Google n'est pas configurée.")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": f"{settings.api_url.rstrip('/')}/api/auth/google/callback",
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "prompt": "select_account",
    }
    redirect = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")
    redirect.set_cookie(
        GOOGLE_STATE_COOKIE, state, max_age=600, httponly=True, secure=settings.is_production, samesite="lax"
    )
    return redirect


@router.get("/google/callback")
async def google_callback(
    request: Request, code: str = "", state: str = "", session: AsyncSession = SessionDep
) -> RedirectResponse:
    settings = get_settings()
    front = settings.public_url.rstrip("/")
    expected = request.cookies.get(GOOGLE_STATE_COOKIE)
    if not settings.google_enabled or not code or not expected or not secrets.compare_digest(expected, state):
        return RedirectResponse(f"{front}/connexion?erreur=google")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            token_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": f"{settings.api_url.rstrip('/')}/api/auth/google/callback",
                    "grant_type": "authorization_code",
                },
            )
            token_res.raise_for_status()
            access_token = token_res.json()["access_token"]
            info_res = await client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            info_res.raise_for_status()
            info = info_res.json()
    except (httpx.HTTPError, KeyError, ValueError):
        return RedirectResponse(f"{front}/connexion?erreur=google")
    if not info.get("email") or not info.get("email_verified"):
        return RedirectResponse(f"{front}/connexion?erreur=google")

    email = _normalize_email(info["email"])
    user = await session.scalar(select(User).where(User.google_sub == info["sub"]))
    if user is None:
        user = await session.scalar(select(User).where(func.lower(User.email) == email))
    is_new = user is None
    if user is None:
        user = User(
            email=email, full_name=info.get("name", "")[:160], is_admin=email in settings.admin_emails
        )
        session.add(user)
    user.google_sub = info["sub"]
    user.is_verified = True
    user.last_login_at = utcnow()
    await session.commit()
    await session.refresh(user, ["profile"])
    target = f"{front}/bienvenue" if is_new or user.profile is None else f"{front}/radar"
    redirect = RedirectResponse(target)
    set_session_cookie(redirect, user)
    redirect.delete_cookie(GOOGLE_STATE_COOKIE)
    return redirect
