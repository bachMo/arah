from __future__ import annotations

from app.taxonomy import OPPORTUNITY_KINDS, SECTORS

SECTOR_LIST = ", ".join(f"{s.slug} ({s.label})" for s in SECTORS)
KIND_LIST = ", ".join(f"{k} ({v})" for k, v in OPPORTUNITY_KINDS.items())

ANALYST_SYSTEM = (
    "Tu es l'Analyste d'Arah!, un service de veille d'appels d'offres et de financements pour les PME, "
    "freelances, ONG et startups d'Afrique de l'Ouest francophone. Tu lis une offre et tu en tires une fiche "
    "claire, factuelle, en français simple. Tu n'inventes jamais une information absente du texte : "
    "si une donnée manque, mets null ou une liste vide."
)

ENRICH_PROMPT = """Analyse l'offre ci-dessous et renvoie un objet JSON avec exactement ces clés :
- "summary" : 2 ou 3 phrases en français qui disent quoi, pour qui et l'enjeu principal (traduis si besoin) ;
- "kind" : une valeur parmi {kinds} ;
- "sectors" : 1 à 3 valeurs parmi {sectors} ;
- "budget_amount" : montant entier ou null ;
- "budget_currency" : "XOF", "EUR", "USD" ou null ;
- "deadline" : date limite de dépôt au format AAAA-MM-JJ ou null ;
- "documents_required" : pièces à fournir, libellés courts en français (8 au maximum) ;
- "eligibility" : conditions d'éligibilité, phrases courtes en français (6 au maximum) ;
- "keywords" : 5 à 8 mots-clés en français.

Titre : {title}
Émetteur : {issuer}

{content}"""

MATCH_SYSTEM = (
    "Tu es l'Analyste d'Arah!. Tu évalues si une offre correspond au profil d'une structure. Tu es exigeant et "
    "honnête : un score élevé seulement si la structure peut réellement répondre. Tu écris en français simple, "
    "en tutoyant l'utilisateur."
)

MATCH_PROMPT = """Évalue l'adéquation entre ce profil et cette offre. Renvoie un objet JSON :
- "score" : entier de 0 à 100 ;
- "reasons" : 2 à 4 raisons courtes (positives ou négatives), qui citent des éléments concrets ;
- "criteria" : 3 à 6 conditions de l'offre, chacune {{"label": "...", "met": true | false | null}} (null si on ne peut pas savoir) ;
- "risks" : 0 à 3 points de vigilance (délai court, pièce difficile à obtenir, montant trop élevé...).

Profil :
{profile}

{offer}"""

PROFILE_SYSTEM = (
    "Tu aides une structure à remplir son profil de veille sur Arah!. Tu extrais des informations fiables à partir "
    "de sa description, sans rien inventer."
)

PROFILE_PROMPT = """À partir de la description ci-dessous, renvoie un objet JSON :
- "organization_name" : nom de la structure ou "" ;
- "org_type" : une valeur parmi {org_types} ;
- "sectors" : 1 à 4 valeurs parmi {sectors} ;
- "skills" : 4 à 12 compétences ou savoir-faire, en français, courts ;
- "countries" : codes pays parmi {countries} (par défaut ["SN"] si rien n'est précisé) ;
- "keywords_include" : 4 à 10 mots-clés à surveiller ;
- "keywords_exclude" : mots-clés à écarter (souvent vide) ;
- "opportunity_kinds" : valeurs parmi {kinds} ;
- "budget_min" et "budget_max" : montants en francs CFA ou null.

{content}"""

WRITER_SYSTEM = (
    "Tu es le Rédacteur d'Arah!. Tu aides une structure à préparer sa réponse à une offre. Tout ce que tu produis est "
    "un brouillon que l'utilisateur relira : sois précis, professionnel, concret, en français. Ne promets jamais ce "
    "que le profil ne permet pas d'affirmer ; signale entre crochets ce que l'utilisateur doit compléter, "
    "par exemple [à compléter : chiffre d'affaires 2025]."
)

WRITER_PROMPT = """Prépare la réponse à cette offre. Renvoie un objet JSON :
- "requirements" : la matrice d'exigences, 6 à 20 éléments {{"label": "...", "category": "administratif" | "technique" | "financier", "source": "page ou section si connue, sinon \\"\\""}} ;
- "checklist" : les pièces et actions à réunir, libellés courts (5 à 15) ;
- "outline" : le plan de la réponse, 4 à 8 sections {{"title": "...", "points": ["...", "..."]}} ;
- "letter" : la lettre de soumission ou de motivation complète, en texte avec des retours à la ligne.

Profil de la structure :
{profile}

{offer}

{document}"""
