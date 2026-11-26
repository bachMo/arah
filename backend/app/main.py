from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.agent.pipeline import ensure_sources
from app.api import account, admin, auth, opportunities, prepare, profile, public, radar, transparency
from app.core.config import get_settings
from app.core.db import SessionLocal, engine
from app.core.logging import setup_logging
from app.core.security import CSRF_HEADER, SESSION_COOKIE

log = logging.getLogger("arah")
CSRF_EXEMPT = {"/api/donations/ipn", "/api/alerts/unsubscribe"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    setup_logging()
    settings = get_settings()
    async with SessionLocal() as session:
        await ensure_sources(session)
    scheduler = None
    if settings.scheduler_enabled:
        from app.scheduler import build_scheduler

        scheduler = build_scheduler()
        scheduler.start()
    log.info(
        "%s démarré (%s) · IA : %s",
        settings.app_name,
        settings.environment,
        f"{settings.llm_provider} / {settings.model_fast}"
        if settings.llm_enabled
        else "désactivée (mode règles)",
    )
    yield
    if scheduler:
        scheduler.shutdown(wait=False)
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        description="API de la plateforme open source de veille d'appels d'offres et de financements.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "Authorization", CSRF_HEADER],
    )

    @app.middleware("http")
    async def security(request: Request, call_next):
        # Protection CSRF : toute écriture authentifiée par cookie doit venir du site (en-tête personnalisé).
        if (
            request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and request.url.path.startswith("/api/")
            and request.url.path not in CSRF_EXEMPT
            and SESSION_COOKIE in request.cookies
            and not request.headers.get("authorization")
            and request.headers.get(CSRF_HEADER) != "web"
        ):
            return JSONResponse(
                {"detail": "Requête refusée (en-tête de sécurité manquant)."}, status.HTTP_403_FORBIDDEN
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        if settings.is_production:
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = []
        for err in exc.errors():
            field = ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path"))
            message = str(err.get("msg", "Valeur invalide")).removeprefix("Value error, ")
            errors.append({"field": field, "message": message})
        first = errors[0]["message"] if errors else "Données invalides."
        return JSONResponse({"detail": first, "errors": errors}, status.HTTP_422_UNPROCESSABLE_CONTENT)

    for module in (public, auth, profile, opportunities, radar, prepare, account, transparency, admin):
        app.include_router(module.router, prefix="/api")
    return app


app = create_app()
