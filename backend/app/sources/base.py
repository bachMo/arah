"""Contrat commun des sources. Une source = un module isolé, facile à ajouter ou à remplacer."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, ClassVar, Protocol

import httpx

USER_AGENT = "ArahBot/0.1 (+https://github.com/; open source opportunity watch)"


@dataclass
class RawOpportunity:
    external_id: str
    title: str
    url: str = ""
    issuer: str = ""
    description: str = ""
    country: str | None = None
    published_at: datetime | None = None
    deadline_at: datetime | None = None
    kind: str | None = None
    budget_amount: int | None = None
    budget_currency: str | None = None
    language: str = "fr"
    sectors: list[str] = field(default_factory=list)
    documents_required: list[str] = field(default_factory=list)
    is_demo: bool = False


class SourceAdapter(Protocol):
    kind: ClassVar[str]
    label: ClassVar[str]

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]: ...


_REGISTRY: dict[str, SourceAdapter] = {}


def register(adapter: SourceAdapter) -> SourceAdapter:
    _REGISTRY[adapter.kind] = adapter
    return adapter


def get_adapter(kind: str) -> SourceAdapter | None:
    return _REGISTRY.get(kind)


def adapter_kinds() -> list[dict[str, str]]:
    return [{"value": k, "label": a.label} for k, a in sorted(_REGISTRY.items())]
