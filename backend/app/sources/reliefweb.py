"""Offres d'emploi, de consultance, de stage et de volontariat publiées sur ReliefWeb (API officielle de l'ONU/OCHA).

L'API demande un identifiant d'application (RELIEFWEB_APPNAME), à demander gratuitement sur
https://apidoc.reliefweb.int/. Chaque offre renvoie vers sa page ReliefWeb d'origine.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

import httpx

from app.core.config import get_settings
from app.core.text import normalize, strip_html
from app.sources.base import USER_AGENT, RawOpportunity, register

API_URL = "https://api.reliefweb.int/v2/jobs"

# Pays suivis par défaut (ISO 3) et leur code dans Arah! (ISO 2).
ISO3_TO_ISO2 = {
    "SEN": "SN",
    "MLI": "ML",
    "CIV": "CI",
    "BFA": "BF",
    "GIN": "GN",
    "MRT": "MR",
    "GMB": "GM",
    "GNB": "GW",
    "NER": "NE",
    "TGO": "TG",
    "BEN": "BJ",
    "CPV": "CV",
    "GHA": "GH",
    "NGA": "NG",
    "LBR": "LR",
    "SLE": "SL",
}
DEFAULT_COUNTRIES = ["SEN", "MLI", "CIV", "BFA", "GIN", "MRT", "NER", "BEN", "TGO", "GMB", "GNB", "CPV"]

TYPE_TO_CONTRACT = {
    "consultancy": "freelance",
    "internship": "stage",
    "volunteer opportunity": "volontariat",
}
EXPERIENCE_TO_LEVEL = {
    "0-2 years": "debutant",
    "3-4 years": "intermediaire",
    "5-9 years": "confirme",
    "10+ years": "expert",
}
FIELDS = [
    "title",
    "body",
    "how_to_apply",
    "date.created",
    "date.closing",
    "source.name",
    "country.iso3",
    "city.name",
    "type.name",
    "experience.name",
    "url",
    "url_alias",
]


def _parse_date(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _first(values: Any, key: str) -> str:
    if isinstance(values, list) and values and isinstance(values[0], dict):
        return str(values[0].get(key) or "")
    return ""


def _language(text: str) -> str:
    words = normalize(text[:1500]).split()
    french = sum(w in {"le", "la", "les", "des", "et", "pour", "une", "du"} for w in words)
    english = sum(w in {"the", "and", "for", "with", "of", "to", "will"} for w in words)
    return "en" if english > french else "fr"


class ReliefWebAdapter:
    kind: ClassVar[str] = "reliefweb"
    label: ClassVar[str] = "ReliefWeb · offres d'emploi (ONG, ONU)"

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]:
        appname = get_settings().reliefweb_appname
        if not appname:
            raise RuntimeError(
                "RELIEFWEB_APPNAME manquant : demande un identifiant sur apidoc.reliefweb.int."
            )
        countries = config.get("countries") or DEFAULT_COUNTRIES
        body = {
            "filter": {"field": "country.iso3", "value": countries, "operator": "OR"},
            "fields": {"include": FIELDS},
            "sort": ["date.created:desc"],
            "limit": int(config.get("limit", 60)),
        }
        response = await client.post(
            url or API_URL,
            params={"appname": appname},
            json=body,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        )
        response.raise_for_status()
        items: list[RawOpportunity] = []
        for row in response.json().get("data", []):
            fields = row.get("fields") or {}
            title = strip_html(str(fields.get("title") or ""))
            if not title:
                continue
            description = strip_html(str(fields.get("body") or ""))
            job_type = normalize(_first(fields.get("type"), "name"))
            iso3 = _first(fields.get("country"), "iso3").upper()
            dates = fields.get("date") or {}
            items.append(
                RawOpportunity(
                    external_id=f"rw-{row.get('id')}",
                    title=title[:590],
                    url=str(fields.get("url_alias") or fields.get("url") or ""),
                    issuer=_first(fields.get("source"), "name")[:290],
                    description=description,
                    country=ISO3_TO_ISO2.get(iso3, "AO" if iso3 else None),
                    published_at=_parse_date(dates.get("created")),
                    deadline_at=_parse_date(dates.get("closing")),
                    kind="job",
                    language=_language(description),
                    contract_type=TYPE_TO_CONTRACT.get(job_type),
                    experience_level=EXPERIENCE_TO_LEVEL.get(
                        _first(fields.get("experience"), "name").lower()
                    ),
                    location=_first(fields.get("city"), "name")[:160],
                    apply_info=strip_html(str(fields.get("how_to_apply") or ""))[:8000],
                )
            )
        return items


register(ReliefWebAdapter())
