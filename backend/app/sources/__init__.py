from app.sources import (  # noqa: F401  (enregistrement des adaptateurs)
    demo,
    direct,
    reliefweb,
    rss,
    worldbank,
)
from app.sources.base import RawOpportunity, adapter_kinds, get_adapter

__all__ = ["RawOpportunity", "adapter_kinds", "get_adapter"]

DEFAULT_SOURCES = [
    {
        "slug": "banque-mondiale",
        "name": "Banque mondiale",
        "kind": "worldbank",
        "url": "https://search.worldbank.org/api/v2/procnotices",
        "description": "Avis d'appels d'offres et de manifestations d'intérêt des projets financés par la Banque mondiale "
        "en Afrique de l'Ouest (API publique).",
        "config": {"rows": 50},
    },
    {
        "slug": "opportunity-desk",
        "name": "Opportunity Desk",
        "kind": "rss",
        "url": "https://www.opportunitydesk.org/feed/",
        "description": "Concours, bourses, programmes et appels à projets internationaux (flux RSS public).",
        "config": {"kind": "program", "country": "INT", "language": "en", "issuer": "Opportunity Desk"},
    },
    {
        "slug": "reliefweb-emplois",
        "name": "ReliefWeb · emplois",
        "kind": "reliefweb",
        "url": "https://api.reliefweb.int/v2/jobs",
        "description": "Offres d'emploi, de consultance, de stage et de volontariat des ONG et agences de l'ONU "
        "en Afrique de l'Ouest (API officielle de l'ONU/OCHA).",
        "config": {"limit": 60},
        "requires_setting": "reliefweb_appname",
    },
]

DEMO_SOURCE = {
    "slug": "demo",
    "name": "Démonstration",
    "kind": "demo",
    "url": "",
    "description": "Offres fictives pour tester la plateforme en local. Désactivée en production.",
    "config": {},
}
