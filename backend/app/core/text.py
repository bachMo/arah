from __future__ import annotations

import hashlib
import re
import unicodedata
from collections import Counter

from bs4 import BeautifulSoup

_WS = re.compile(r"\s+")
_TOKEN = re.compile(r"[a-z0-9][a-z0-9+#]*(?:[-.][a-z0-9+#]+)*")

STOPWORDS = frozenset(
    [
        "a",
        "au",
        "aux",
        "avec",
        "ce",
        "ces",
        "cet",
        "cette",
        "dans",
        "de",
        "des",
        "du",
        "elle",
        "en",
        "et",
        "eux",
        "il",
        "ils",
        "je",
        "la",
        "le",
        "les",
        "leur",
        "leurs",
        "lui",
        "ma",
        "mais",
        "me",
        "meme",
        "mes",
        "moi",
        "mon",
        "ne",
        "nos",
        "notre",
        "nous",
        "on",
        "ou",
        "par",
        "pas",
        "pour",
        "qu",
        "que",
        "qui",
        "sa",
        "se",
        "ses",
        "son",
        "sur",
        "ta",
        "te",
        "tes",
        "toi",
        "ton",
        "tu",
        "un",
        "une",
        "vos",
        "votre",
        "vous",
        "est",
        "sont",
        "etre",
        "avoir",
        "ont",
        "fait",
        "faire",
        "plus",
        "moins",
        "tres",
        "tout",
        "tous",
        "toute",
        "toutes",
        "autre",
        "autres",
        "afin",
        "ainsi",
        "apres",
        "avant",
        "cela",
        "celle",
        "celui",
        "chez",
        "comme",
        "dont",
        "donc",
        "entre",
        "lors",
        "non",
        "oui",
        "peut",
        "peuvent",
        "sans",
        "selon",
        "sous",
        "the",
        "and",
        "for",
        "with",
        "from",
        "that",
        "this",
        "these",
        "those",
        "are",
        "was",
        "were",
        "been",
        "being",
        "have",
        "has",
        "had",
        "will",
        "shall",
        "would",
        "should",
        "can",
        "could",
        "may",
        "might",
        "must",
        "not",
        "into",
        "onto",
        "over",
        "under",
        "about",
        "above",
        "below",
        "than",
        "then",
        "them",
        "they",
        "their",
        "there",
        "here",
        "which",
        "while",
        "who",
        "whom",
        "whose",
        "what",
        "when",
        "where",
        "why",
        "how",
        "all",
        "any",
        "both",
        "each",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "only",
        "own",
        "same",
        "very",
        "just",
        "also",
        "its",
        "it's",
        "our",
        "your",
        "his",
        "her",
        "him",
        "she",
        "he",
        "we",
        "you",
        "of",
        "to",
        "in",
        "on",
        "at",
        "by",
        "an",
        "or",
        "as",
        "be",
        "is",
        "if",
        "no",
        "so",
        "up",
        "out",
        "off",
        "per",
        "via",
    ]
)


def normalize(value: str | None) -> str:
    if not value:
        return ""
    decomposed = unicodedata.normalize("NFKD", value)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return _WS.sub(" ", stripped.lower()).strip()


def tokens(value: str | None, *, min_len: int = 3) -> list[str]:
    return [t for t in _TOKEN.findall(normalize(value)) if len(t) >= min_len and t not in STOPWORDS]


def top_terms(value: str, limit: int = 12) -> list[str]:
    return [term for term, _ in Counter(tokens(value, min_len=4)).most_common(limit)]


def contains_term(normalized_text: str, term: str) -> bool:
    needle = normalize(term)
    if not needle:
        return False
    # Tolère le pluriel simple (« plateformes », « travaux ») sans faire de correspondances partielles.
    return re.search(rf"(?<![a-z0-9]){re.escape(needle)}(?:s|x)?(?![a-z0-9])", normalized_text) is not None


def strip_html(value: str | None) -> str:
    if not value:
        return ""
    if "<" not in value:
        return _WS.sub(" ", value).strip()
    soup = BeautifulSoup(value, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return _WS.sub(" ", soup.get_text(" ")).strip()


def truncate(value: str, limit: int) -> str:
    value = value.strip()
    if len(value) <= limit:
        return value
    cut = value[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(" ,;:.") + "…"


def first_sentences(value: str, count: int = 2, limit: int = 360) -> str:
    parts = re.split(r"(?<=[.!?])\s+", value.strip())
    return truncate(" ".join(parts[:count]), limit)


def fingerprint(*parts: str | None) -> str:
    joined = "|".join(normalize(p) for p in parts if p)
    return hashlib.sha256(joined.encode()).hexdigest()


def clean_list(values: list[str] | None, *, limit: int = 30, max_len: int = 120) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in values or []:
        item = _WS.sub(" ", str(raw)).strip()[:max_len]
        key = normalize(item)
        if item and key not in seen:
            seen.add(key)
            out.append(item)
        if len(out) >= limit:
            break
    return out
