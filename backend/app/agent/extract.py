"""Extraction sans IA : dates limites, montants, type d'offre. Sert de base et de solution de repli."""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.core.text import normalize

MONTHS = {
    "janvier": 1,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "decembre": 12,
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
    "jan": 1,
    "feb": 2,
    "fev": 2,
    "mar": 3,
    "apr": 4,
    "avr": 4,
    "jun": 6,
    "jul": 7,
    "juil": 7,
    "aug": 8,
    "sep": 9,
    "sept": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}
_MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))

_NUMERIC = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b")
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_DAY_MONTH = re.compile(rf"\b(\d{{1,2}})(?:er)?\s+({_MONTH_RE})\.?\s+(\d{{4}})\b")
_MONTH_DAY = re.compile(rf"\b({_MONTH_RE})\.?\s+(\d{{1,2}}),?\s+(\d{{4}})\b")
_DEADLINE_HINT = re.compile(
    r"date limite|au plus tard|avant le|deadline|closing date|submission|soumission|depot|cloture|expire|due"
)

CURRENCY_TO_XOF = {"XOF": 1.0, "EUR": 655.957}


def _safe_date(year: int, month: int, day: int) -> datetime | None:
    try:
        return datetime(year, month, day, 23, 59, tzinfo=UTC)
    except ValueError:
        return None


def find_dates(text: str) -> list[tuple[int, datetime]]:
    norm = normalize(text)
    found: list[tuple[int, datetime]] = []
    for m in _NUMERIC.finditer(norm):
        d = _safe_date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        if d:
            found.append((m.start(), d))
    for m in _ISO.finditer(norm):
        d = _safe_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d:
            found.append((m.start(), d))
    for m in _DAY_MONTH.finditer(norm):
        d = _safe_date(int(m.group(3)), MONTHS[m.group(2)], int(m.group(1)))
        if d:
            found.append((m.start(), d))
    for m in _MONTH_DAY.finditer(norm):
        d = _safe_date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
        if d:
            found.append((m.start(), d))
    return found


def guess_deadline(text: str, *, published_at: datetime | None = None) -> datetime | None:
    norm = normalize(text)
    dates = find_dates(text)
    if not dates:
        return None
    floor = published_at or datetime(2000, 1, 1, tzinfo=UTC)
    hinted = [d for pos, d in dates if d > floor and _DEADLINE_HINT.search(norm[max(0, pos - 90) : pos])]
    if hinted:
        return max(hinted)
    return None


_AMOUNT = re.compile(
    r"(?P<pre>usd|us\$|\$|eur|€|xof|fcfa|f cfa)?\s*"
    r"(?P<num>\d{1,3}(?:[\s.,  ]\d{3})+|\d+(?:[.,]\d+)?)\s*"
    r"(?P<mult>milliards?|millions?|million|mds?|m|k)?\s*"
    r"(?P<post>usd|dollars?|eur|euros?|€|xof|fcfa|f cfa|francs? cfa)?",
)


def _currency(token: str | None) -> str | None:
    if not token:
        return None
    token = token.strip()
    if token in {"usd", "us$", "$", "dollar", "dollars"}:
        return "USD"
    if token in {"eur", "euro", "euros", "€"}:
        return "EUR"
    if token in {"xof", "fcfa", "f cfa", "franc cfa", "francs cfa"}:
        return "XOF"
    return None


def guess_budget(text: str) -> tuple[int | None, str | None]:
    norm = normalize(text).replace("€", " € ")
    best: tuple[int, str] | None = None
    for m in _AMOUNT.finditer(norm):
        currency = _currency(m.group("pre")) or _currency(m.group("post"))
        if not currency:
            continue
        raw = m.group("num")
        digits = re.sub(r"[\s.,  ](?=\d{3}\b)", "", raw).replace(",", ".")
        try:
            value = float(digits)
        except ValueError:
            continue
        mult = (m.group("mult") or "").strip()
        if mult.startswith("milliard") or mult.startswith("md"):
            value *= 1_000_000_000
        elif mult.startswith("million") or mult == "m":
            value *= 1_000_000
        elif mult == "k":
            value *= 1_000
        amount = int(value)
        if amount < 1000:
            continue
        if best is None or to_xof(amount, currency) > to_xof(*best):
            best = (amount, currency)
    return best if best else (None, None)


def to_xof(amount: int | None, currency: str | None, usd_rate: float = 600.0) -> int | None:
    if amount is None or not currency:
        return None
    if currency == "USD":
        return int(amount * usd_rate)
    rate = CURRENCY_TO_XOF.get(currency)
    return int(amount * rate) if rate else None


_KIND_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        "consultancy",
        (
            "manifestation d'interet",
            "manifestations d'interet",
            "expression of interest",
            "expressions of interest",
            "consultant individuel",
            "termes de reference",
            "recrutement d'un consultant",
            "recrutement d'un cabinet",
        ),
    ),
    ("competition", ("concours", "hackathon", "prix ", "award", "challenge", "competition")),
    (
        "program",
        (
            "incubation",
            "incubateur",
            "acceleration",
            "accelerateur",
            "fellowship",
            "bootcamp",
            "programme d'accompagnement",
            "accelerator",
            "mentorat",
        ),
    ),
    (
        "grant",
        (
            "subvention",
            "appel a projets",
            "grant",
            "financement",
            "bourse",
            "funding",
            "call for proposals",
            "fonds",
        ),
    ),
    (
        "tender",
        (
            "appel d'offres",
            "appel d'offre",
            "avis d'appel",
            "invitation for bids",
            "request for bids",
            "request for quotations",
            "demande de cotation",
            "dao",
            "fourniture",
            "travaux",
        ),
    ),
]


def guess_kind(text: str) -> str:
    norm = normalize(text)
    for kind, terms in _KIND_RULES:
        if any(term in norm for term in terms):
            return kind
    return "other"
