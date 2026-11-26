"""Référentiels partagés : secteurs, pays, types de structures et de pièces administratives."""

from __future__ import annotations

from dataclasses import dataclass

from app.core.text import contains_term, normalize


@dataclass(frozen=True)
class Sector:
    slug: str
    label: str
    terms: tuple[str, ...]


SECTORS: tuple[Sector, ...] = (
    Sector(
        "numerique",
        "Numérique & IA",
        (
            "numerique",
            "digital",
            "informatique",
            "logiciel",
            "logiciels",
            "site web",
            "site internet",
            "application mobile",
            "plateforme",
            "intelligence artificielle",
            "machine learning",
            "data",
            "donnees",
            "base de donnees",
            "cloud",
            "cybersecurite",
            "systeme d'information",
            "software",
            "ict",
            "tic",
            "it services",
            "web",
            "chatbot",
            "e-gouvernement",
            "digitalisation",
            "dematerialisation",
            "telecommunications",
            "fibre",
            "hackathon",
            "developpeur",
            "developpement web",
            "api",
        ),
    ),
    Sector(
        "sante",
        "Santé",
        (
            "sante",
            "health",
            "hopital",
            "hospital",
            "medical",
            "medicament",
            "pharmaceutique",
            "clinique",
            "vaccination",
            "nutrition",
            "paludisme",
            "malaria",
            "epidemie",
            "sante publique",
            "laboratoire",
        ),
    ),
    Sector(
        "agriculture",
        "Agriculture & agroalimentaire",
        (
            "agriculture",
            "agricole",
            "agro",
            "agroalimentaire",
            "elevage",
            "peche",
            "irrigation",
            "semences",
            "cereales",
            "horticulture",
            "agri",
            "farming",
            "livestock",
            "fisheries",
            "food security",
            "securite alimentaire",
            "filiere",
            "transformation agricole",
        ),
    ),
    Sector(
        "education",
        "Éducation & formation",
        (
            "education",
            "formation",
            "ecole",
            "enseignement",
            "universite",
            "training",
            "school",
            "apprentissage",
            "curriculum",
            "alphabetisation",
            "bourse",
            "scholarship",
            "renforcement de capacites",
        ),
    ),
    Sector(
        "energie",
        "Énergie",
        (
            "energie",
            "energy",
            "solaire",
            "solar",
            "electricite",
            "electrification",
            "photovoltaique",
            "renouvelable",
            "renewable",
            "mini-reseau",
            "mini-grid",
            "eclairage public",
            "power",
        ),
    ),
    Sector(
        "eau",
        "Eau & assainissement",
        (
            "eau potable",
            "assainissement",
            "water supply",
            "sanitation",
            "forage",
            "hydraulique",
            "wash",
            "adduction",
            "station de pompage",
        ),
    ),
    Sector(
        "btp",
        "BTP & infrastructures",
        (
            "travaux",
            "construction",
            "rehabilitation",
            "batiment",
            "route",
            "routes",
            "genie civil",
            "infrastructure",
            "works",
            "civil works",
            "pont",
            "voirie",
            "amenagement",
        ),
    ),
    Sector(
        "environnement",
        "Environnement & climat",
        (
            "environnement",
            "climat",
            "climate",
            "biodiversite",
            "reboisement",
            "dechets",
            "waste",
            "adaptation",
            "resilience",
            "carbone",
            "economie circulaire",
            "pollution",
        ),
    ),
    Sector(
        "finance",
        "Finance & inclusion",
        (
            "finance",
            "microfinance",
            "inclusion financiere",
            "banque",
            "assurance",
            "fintech",
            "credit",
            "mobile money",
            "audit financier",
            "comptabilite",
            "fiscalite",
        ),
    ),
    Sector(
        "gouvernance",
        "Gouvernance & société civile",
        (
            "gouvernance",
            "decentralisation",
            "societe civile",
            "droits",
            "justice",
            "elections",
            "citoyennete",
            "genre",
            "gender",
            "plaidoyer",
            "governance",
            "collectivites territoriales",
        ),
    ),
    Sector(
        "transport",
        "Transport & logistique",
        (
            "transport",
            "logistique",
            "logistics",
            "vehicules",
            "flotte",
            "mobilite",
            "port",
            "aeroport",
            "ferroviaire",
            "fret",
        ),
    ),
    Sector(
        "commerce",
        "Industrie, commerce & fournitures",
        (
            "fourniture",
            "fournitures",
            "supply",
            "equipements",
            "equipment",
            "materiel",
            "mobilier",
            "industrie",
            "commerce",
            "export",
            "goods",
            "acquisition",
        ),
    ),
    Sector(
        "culture",
        "Culture, médias & communication",
        (
            "culture",
            "culturel",
            "cinema",
            "audiovisuel",
            "media",
            "medias",
            "communication",
            "evenementiel",
            "artistique",
            "photographie",
            "video",
            "campagne de sensibilisation",
            "journalisme",
        ),
    ),
    Sector(
        "tourisme",
        "Tourisme & hôtellerie",
        (
            "tourisme",
            "touristique",
            "hotel",
            "hotellerie",
            "restauration",
            "tourism",
            "hospitality",
        ),
    ),
    Sector(
        "conseil",
        "Conseil, études & audit",
        (
            "consultant",
            "consultance",
            "etude",
            "etudes",
            "assistance technique",
            "evaluation",
            "audit",
            "consulting",
            "expertise",
            "diagnostic",
            "faisabilite",
            "feasibility",
            "manifestation d'interet",
        ),
    ),
    Sector(
        "entrepreneuriat",
        "Entrepreneuriat & jeunesse",
        (
            "entrepreneuriat",
            "entrepreneur",
            "startup",
            "start-up",
            "pme",
            "incubation",
            "acceleration",
            "jeunes",
            "jeunesse",
            "youth",
            "innovation",
            "concours",
            "prix",
            "competition",
            "accelerator",
        ),
    ),
)

SECTOR_BY_SLUG = {s.slug: s for s in SECTORS}


@dataclass(frozen=True)
class Country:
    code: str
    label: str
    aliases: tuple[str, ...]


COUNTRIES: tuple[Country, ...] = (
    Country("SN", "Sénégal", ("senegal", "dakar")),
    Country("ML", "Mali", ("mali", "bamako")),
    Country("CI", "Côte d'Ivoire", ("cote d'ivoire", "ivory coast", "abidjan")),
    Country("BF", "Burkina Faso", ("burkina faso", "burkina", "ouagadougou")),
    Country("GN", "Guinée", ("guinee", "guinea", "conakry")),
    Country("MR", "Mauritanie", ("mauritanie", "mauritania", "nouakchott")),
    Country("GM", "Gambie", ("gambie", "gambia", "banjul")),
    Country("GW", "Guinée-Bissau", ("guinee-bissau", "guinea-bissau", "bissau")),
    Country("NE", "Niger", ("niger", "niamey")),
    Country("TG", "Togo", ("togo", "lome")),
    Country("BJ", "Bénin", ("benin", "cotonou")),
    Country("CV", "Cap-Vert", ("cap-vert", "cabo verde", "cape verde")),
    Country("GH", "Ghana", ("ghana", "accra")),
    Country("NG", "Nigeria", ("nigeria", "lagos", "abuja")),
    Country("LR", "Liberia", ("liberia", "monrovia")),
    Country("SL", "Sierra Leone", ("sierra leone", "freetown")),
    Country("CM", "Cameroun", ("cameroun", "cameroon", "yaounde", "douala")),
    Country("TD", "Tchad", ("tchad", "chad", "ndjamena")),
    Country("GA", "Gabon", ("gabon", "libreville")),
    Country("CG", "Congo", ("republique du congo", "congo brazzaville", "brazzaville")),
    Country(
        "CD",
        "RD Congo",
        ("rd congo", "rdc", "democratic republic of congo", "congo, democratic republic", "kinshasa"),
    ),
    Country("MA", "Maroc", ("maroc", "morocco")),
    Country("TN", "Tunisie", ("tunisie", "tunisia")),
    Country("RW", "Rwanda", ("rwanda", "kigali")),
    Country("KE", "Kenya", ("kenya", "nairobi")),
    Country("MG", "Madagascar", ("madagascar", "antananarivo")),
    Country(
        "AO",
        "Afrique de l'Ouest (régional)",
        ("afrique de l'ouest", "west africa", "western and central africa", "uemoa", "cedeao", "ecowas"),
    ),
    Country("AF", "Afrique (continental)", ("afrique", "africa", "pan-african", "panafricain")),
    Country("INT", "International", ("international", "worldwide", "global", "monde")),
)

COUNTRY_BY_CODE = {c.code: c for c in COUNTRIES}
REGIONAL_CODES = {"AO", "AF", "INT"}
WEST_AFRICA = {"SN", "ML", "CI", "BF", "GN", "MR", "GM", "GW", "NE", "TG", "BJ", "CV", "GH", "NG", "LR", "SL"}

ORG_TYPES: dict[str, str] = {
    "freelance": "Freelance / indépendant",
    "tpe": "TPE",
    "pme": "PME",
    "startup": "Startup",
    "cabinet": "Cabinet de conseil",
    "ong": "ONG / association",
    "cooperative": "Coopérative / GIE",
    "recherche": "Université / recherche",
    "autre": "Autre",
}

OPPORTUNITY_KINDS: dict[str, str] = {
    "tender": "Appel d'offres",
    "consultancy": "Manifestation d'intérêt",
    "grant": "Financement / subvention",
    "competition": "Concours / prix",
    "program": "Programme / incubation",
    "other": "Autre",
}

DOC_TYPES: dict[str, str] = {
    "ninea": "NINEA",
    "rccm": "Registre du commerce (RCCM)",
    "quitus_fiscal": "Attestation fiscale / quitus",
    "ipres": "Attestation IPRES",
    "css": "Attestation Caisse de sécurité sociale",
    "assurance": "Attestation d'assurance",
    "statuts": "Statuts",
    "etats_financiers": "États financiers",
    "references": "Attestations de bonne exécution",
    "agrement": "Agrément / licence",
    "autre": "Autre document",
}

# Pièces fréquemment exigées : libellé affiché -> expressions recherchées dans le texte d'une offre.
REQUIRED_DOCUMENT_PATTERNS: dict[str, tuple[str, ...]] = {
    "NINEA": ("ninea",),
    "Registre du commerce (RCCM)": (
        "rccm",
        "registre du commerce",
        "registre de commerce",
        "business registration",
    ),
    "Attestation fiscale / quitus": (
        "quitus fiscal",
        "attestation fiscale",
        "regularite fiscale",
        "tax clearance",
    ),
    "Attestation IPRES": ("ipres",),
    "Attestation sécurité sociale": ("caisse de securite sociale", "attestation css", "social security"),
    "Garantie de soumission": (
        "garantie de soumission",
        "caution de soumission",
        "bid security",
        "bid guarantee",
    ),
    "Lettre de soumission": ("lettre de soumission", "letter of bid", "submission letter"),
    "Offre technique": ("offre technique", "technical proposal", "proposition technique"),
    "Offre financière": ("offre financiere", "financial proposal", "proposition financiere"),
    "CV des experts": ("curriculum vitae", "cv des", "cv du", "key experts", "experts cles"),
    "Références similaires": (
        "references similaires",
        "marches similaires",
        "experience similaire",
        "similar assignments",
        "similar contracts",
    ),
    "États financiers": (
        "etats financiers",
        "bilans",
        "financial statements",
        "chiffre d'affaires",
        "turnover",
    ),
    "Statuts de la structure": ("statuts", "articles of association"),
    "Business plan": ("business plan", "plan d'affaires"),
    "Pitch / présentation": ("pitch", "pitch deck"),
    "Budget prévisionnel": ("budget previsionnel", "budget detaille", "detailed budget"),
}


def detect_sectors(text: str, limit: int = 3) -> list[str]:
    norm = normalize(text)
    scored: list[tuple[int, str]] = []
    for sector in SECTORS:
        hits = sum(1 for term in sector.terms if contains_term(norm, term))
        if hits:
            scored.append((hits, sector.slug))
    scored.sort(key=lambda item: (-item[0], item[1]))
    return [slug for _, slug in scored[:limit]]


def detect_country(text: str) -> str | None:
    norm = normalize(text)
    for country in COUNTRIES:
        if any(contains_term(norm, alias) for alias in country.aliases):
            return country.code
    return None


def detect_countries(text: str) -> list[str]:
    norm = normalize(text)
    return [c.code for c in COUNTRIES if any(contains_term(norm, a) for a in c.aliases)]


def detect_documents(text: str) -> list[str]:
    norm = normalize(text)
    return [
        label
        for label, terms in REQUIRED_DOCUMENT_PATTERNS.items()
        if any(contains_term(norm, t) for t in terms)
    ]


def sector_label(slug: str) -> str:
    sector = SECTOR_BY_SLUG.get(slug)
    return sector.label if sector else slug


def country_label(code: str | None) -> str:
    if not code:
        return ""
    country = COUNTRY_BY_CODE.get(code)
    return country.label if country else code


def taxonomy_payload() -> dict[str, object]:
    return {
        "sectors": [{"value": s.slug, "label": s.label} for s in SECTORS],
        "countries": [{"value": c.code, "label": c.label} for c in COUNTRIES],
        "org_types": [{"value": k, "label": v} for k, v in ORG_TYPES.items()],
        "opportunity_kinds": [{"value": k, "label": v} for k, v in OPPORTUNITY_KINDS.items()],
        "doc_types": [{"value": k, "label": v} for k, v in DOC_TYPES.items()],
    }
