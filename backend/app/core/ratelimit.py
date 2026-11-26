"""Limiteur de débit en mémoire, par adresse IP et par route.

Suffisant pour une instance unique. Derrière plusieurs instances, ajouter une limite
au niveau du proxy (Nginx, Caddy, Cloudflare) en complément.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings


def client_ip(request: Request) -> str:
    if get_settings().trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"


class RateLimit:
    def __init__(self, times: int, seconds: int, scope: str) -> None:
        self.times = times
        self.seconds = seconds
        self.scope = scope
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    async def __call__(self, request: Request) -> None:
        if get_settings().environment == "test":
            return
        key = f"{self.scope}:{client_ip(request)}"
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] > self.seconds:
            window.popleft()
        if len(window) >= self.times:
            retry = int(self.seconds - (now - window[0])) + 1
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Trop de tentatives. Réessaie dans quelques instants.",
                headers={"Retry-After": str(retry)},
            )
        window.append(now)
        if len(self._hits) > 50_000:
            self._hits.clear()


auth_limit = RateLimit(10, 60, "auth")
email_limit = RateLimit(4, 600, "email")
llm_limit = RateLimit(12, 300, "llm")
donation_limit = RateLimit(10, 600, "donation")
