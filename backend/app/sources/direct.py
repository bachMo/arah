"""Offres d'emploi publiées directement sur Arah! par des recruteurs, après validation par un administrateur.

Cette source ne va rien chercher sur internet : les offres y sont ajoutées au moment de leur validation.
"""

from __future__ import annotations

from typing import Any, ClassVar

import httpx

from app.sources.base import RawOpportunity, register

SLUG = "publication-directe"
SPEC = {
    "slug": SLUG,
    "name": "Publiées sur Arah!",
    "kind": "direct",
    "url": "",
    "description": "Offres d'emploi proposées par les recruteurs sur Arah!, publiées après validation.",
    "config": {},
}


class DirectAdapter:
    kind: ClassVar[str] = "direct"
    label: ClassVar[str] = "Publication directe sur Arah!"

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]:
        return []


register(DirectAdapter())
