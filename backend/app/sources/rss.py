"""Source générique : n'importe quel flux RSS ou Atom (concours, bourses, programmes, appels à projets, emplois)."""

from __future__ import annotations

import calendar
from datetime import UTC, datetime
from typing import Any, ClassVar

import feedparser
import httpx

from app.core.text import fingerprint, strip_html
from app.sources.base import USER_AGENT, RawOpportunity, register


def _to_datetime(struct: Any) -> datetime | None:
    if not struct:
        return None
    try:
        return datetime.fromtimestamp(calendar.timegm(struct), tz=UTC)
    except (TypeError, ValueError, OverflowError):
        return None


class RssAdapter:
    kind: ClassVar[str] = "rss"
    label: ClassVar[str] = "Flux RSS / Atom"

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]:
        response = await client.get(
            url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, */*"}
        )
        response.raise_for_status()
        feed = feedparser.parse(response.content)
        limit = int(config.get("limit", 60))
        items: list[RawOpportunity] = []
        for entry in feed.entries[:limit]:
            title = strip_html(entry.get("title", ""))
            if not title:
                continue
            link = entry.get("link", "")
            content = ""
            if entry.get("content"):
                content = " ".join(strip_html(c.get("value", "")) for c in entry.content)
            description = content or strip_html(entry.get("summary", ""))
            external_id = entry.get("id") or link or fingerprint(title)
            items.append(
                RawOpportunity(
                    external_id=str(external_id)[:190],
                    title=title[:590],
                    url=link,
                    issuer=config.get("issuer") or strip_html(feed.feed.get("title", ""))[:290],
                    description=description,
                    country=config.get("country"),
                    published_at=_to_datetime(entry.get("published_parsed") or entry.get("updated_parsed")),
                    kind=config.get("kind"),
                    language=config.get("language", "fr"),
                    contract_type=config.get("contract_type"),
                    location=str(config.get("location") or ""),
                    remote=bool(config.get("remote", False)),
                )
            )
        return items


register(RssAdapter())
