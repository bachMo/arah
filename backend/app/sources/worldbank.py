"""Avis de passation de marchés de la Banque mondiale (API publique search.worldbank.org)."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, ClassVar

import httpx

from app.core.text import normalize, strip_html
from app.sources.base import USER_AGENT, RawOpportunity, register
from app.taxonomy import detect_country

log = logging.getLogger("arah.sources.worldbank")

API_URL = "https://search.worldbank.org/api/v2/procnotices"
OPEN_NOTICE_TYPES = {
    "invitation for bids",
    "request for expression of interest",
    "general procurement notice",
    "request for proposals",
    "invitation for prequalification",
}
DEFAULT_COUNTRIES = [
    "Senegal",
    "Mali",
    "Cote d'Ivoire",
    "Burkina Faso",
    "Guinea",
    "Mauritania",
    "Niger",
    "Benin",
    "Togo",
    "Gambia, The",
    "Western and Central Africa",
]


def _parse_date(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d", "%d-%b-%Y", "%d-%b-%Y %H:%M", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).replace(tzinfo=UTC)
        except ValueError:
            continue
    return None


class WorldBankAdapter:
    kind: ClassVar[str] = "worldbank"
    label: ClassVar[str] = "Banque mondiale · avis de marchés"

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]:
        countries: list[str] = config.get("countries") or DEFAULT_COUNTRIES
        rows = int(config.get("rows", 50))
        wanted = {normalize(c) for c in countries}
        results: dict[str, RawOpportunity] = {}
        for country in countries:
            params = {
                "format": "json",
                "rows": rows,
                "os": 0,
                "qterm": country,
                "srt": "submission_date",
                "order": "desc",
            }
            response = await client.get(url or API_URL, params=params, headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            payload = response.json()
            notices = payload.get("procnotices") or []
            for notice in notices:
                item = self._convert(notice, wanted)
                if item:
                    results[item.external_id] = item
        return list(results.values())

    def _convert(self, notice: dict[str, Any], wanted: set[str]) -> RawOpportunity | None:
        notice_type = normalize(notice.get("notice_type"))
        if notice_type not in OPEN_NOTICE_TYPES:
            return None
        country_name = notice.get("project_ctry_name") or ""
        if wanted and normalize(country_name) not in wanted:
            return None
        notice_id = str(notice.get("id") or "").strip()
        if not notice_id:
            return None
        title = (notice.get("bid_description") or notice.get("project_name") or "").strip()
        body = strip_html(notice.get("notice_text"))
        deadline = (
            _parse_date(notice.get("submission_deadline_date"))
            or _parse_date(notice.get("deadline_date"))
            or _parse_date(notice.get("submission_date"))
        )
        published = _parse_date(notice.get("noticedate"))
        if deadline and published and deadline <= published:
            deadline = None
        kind = "consultancy" if "expression of interest" in notice_type else "tender"
        description = " ".join(
            part
            for part in (
                f"Projet : {notice.get('project_name')}." if notice.get("project_name") else "",
                f"Méthode : {notice.get('procurement_method_name')}."
                if notice.get("procurement_method_name")
                else "",
                f"Référence : {notice.get('bid_reference_no')}." if notice.get("bid_reference_no") else "",
                body,
            )
            if part
        )
        return RawOpportunity(
            external_id=notice_id,
            title=title[:590] or notice_id,
            url=f"https://projects.worldbank.org/en/projects-operations/procurement-detail/{notice_id}",
            issuer=(
                notice.get("contact_organization") or f"Banque mondiale · {notice.get('project_name', '')}"
            ).strip()[:290],
            description=description,
            country=detect_country(country_name),
            published_at=published,
            deadline_at=deadline,
            kind=kind,
            language="en" if normalize(notice.get("notice_lang_name")) == "english" else "fr",
        )


register(WorldBankAdapter())
