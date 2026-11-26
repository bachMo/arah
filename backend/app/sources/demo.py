"""Jeu d'offres fictives pour tester la plateforme en local (DEMO_DATA=true).

Les émetteurs et montants sont inventés. Les dates sont recalculées à chaque collecte
pour que la démonstration reste toujours réaliste.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, ClassVar

import httpx

from app.sources.base import RawOpportunity, register

# (titre, émetteur, pays, type, montant, devise, jours avant la date limite, jours depuis la publication, détails)
_DEMO: list[tuple[str, str, str, str, int | None, str | None, int | None, int, str]] = [
    (
        "Développement d'une plateforme web de suivi des projets agricoles",
        "Agence régionale de développement agricole (démo)",
        "SN",
        "tender",
        45_000_000,
        "XOF",
        19,
        3,
        "Conception, développement et déploiement d'une application web et mobile de suivi-évaluation, tableau de bord, "
        "API et formation des utilisateurs. Pièces : NINEA, RCCM, attestation fiscale, attestation IPRES, références "
        "similaires sur des plateformes numériques, CV des experts, offre technique et offre financière.",
    ),
    (
        "Recrutement d'un cabinet pour la digitalisation des services aux usagers",
        "Ministère de l'Économie numérique (démo)",
        "SN",
        "consultancy",
        60_000_000,
        "XOF",
        12,
        5,
        "Manifestation d'intérêt pour accompagner la dématérialisation de 15 procédures administratives : diagnostic, "
        "système d'information, intégration des paiements mobiles (Wave, Orange Money). Références similaires et CV des experts exigés.",
    ),
    (
        "Concours national d'innovation numérique pour les jeunes",
        "Fondation pour l'entrepreneuriat jeune (démo)",
        "SN",
        "competition",
        10_000_000,
        "XOF",
        26,
        2,
        "Prix pour les startups de moins de 3 ans qui utilisent l'intelligence artificielle ou la data au service de "
        "l'agriculture, de la santé ou de l'éducation. Dossier : pitch deck, business plan, statuts de la structure.",
    ),
    (
        "Programme d'accélération pour startups de la tech à impact",
        "Hub d'innovation de Dakar (démo)",
        "SN",
        "program",
        None,
        None,
        33,
        6,
        "Six mois d'accompagnement, mentorat, accès à des investisseurs et une subvention d'amorçage. Ouvert aux "
        "startups numériques du Sénégal, du Mali et de Côte d'Ivoire. Candidature en ligne avec pitch.",
    ),
    (
        "Fourniture et installation de kits solaires pour 40 postes de santé",
        "Programme d'électrification rurale (démo)",
        "SN",
        "tender",
        180_000_000,
        "XOF",
        9,
        8,
        "Fourniture, installation et maintenance de systèmes photovoltaïques. Garantie de soumission obligatoire, "
        "états financiers des trois dernières années, attestation fiscale, RCCM.",
    ),
    (
        "Étude de faisabilité d'un système d'information sanitaire",
        "Projet d'appui à la santé communautaire (démo)",
        "ML",
        "consultancy",
        85_000,
        "USD",
        15,
        4,
        "Consultance pour une étude de faisabilité et un cahier des charges d'un système d'information de santé "
        "publique, avec volet données et interopérabilité. CV des experts et références similaires.",
    ),
    (
        "Appel à projets : solutions numériques pour la résilience climatique",
        "Fonds régional pour le climat (démo)",
        "AO",
        "grant",
        50_000,
        "EUR",
        41,
        7,
        "Subvention pour des projets utilisant la donnée, les capteurs ou l'IA pour l'adaptation au climat en "
        "Afrique de l'Ouest. Budget prévisionnel, note conceptuelle et statuts de l'organisation.",
    ),
    (
        "Formation de 300 jeunes aux métiers du développement web",
        "Agence pour l'emploi des jeunes (démo)",
        "SN",
        "tender",
        75_000_000,
        "XOF",
        22,
        1,
        "Conception et animation d'un parcours de formation en développement web et mobile, insertion "
        "professionnelle. Offre technique, offre financière, références similaires, NINEA et RCCM.",
    ),
    (
        "Réhabilitation de forages et d'adductions d'eau potable",
        "Office des forages ruraux (démo)",
        "SN",
        "tender",
        320_000_000,
        "XOF",
        17,
        10,
        "Travaux de réhabilitation de 12 forages, génie civil et équipements de pompage. Garantie de soumission, "
        "agrément technique, attestation IPRES, états financiers.",
    ),
    (
        "Campagne de communication et de sensibilisation sur la nutrition",
        "Programme national de nutrition (démo)",
        "SN",
        "tender",
        30_000_000,
        "XOF",
        6,
        12,
        "Conception de supports audiovisuels, campagne radio et réseaux sociaux en français et langues nationales. "
        "Références similaires, CV de l'équipe créative, offre financière.",
    ),
    (
        "Développement d'un chatbot d'information citoyenne",
        "Ville de Thiès (démo)",
        "SN",
        "tender",
        18_000_000,
        "XOF",
        28,
        2,
        "Assistant conversationnel sur WhatsApp et site web pour informer les citoyens sur les services municipaux, "
        "intégration d'un modèle de langage, tableau de bord. NINEA, RCCM, attestation fiscale, lettre de soumission.",
    ),
    (
        "Audit des systèmes d'information et cybersécurité",
        "Banque régionale de solidarité (démo)",
        "CI",
        "consultancy",
        40_000_000,
        "XOF",
        14,
        3,
        "Audit de sécurité, tests d'intrusion et plan de remédiation. Certification exigée, références similaires "
        "dans le secteur bancaire, CV des experts.",
    ),
    (
        "Bourse de recherche en intelligence artificielle appliquée",
        "Réseau africain des sciences des données (démo)",
        "AF",
        "grant",
        15_000,
        "USD",
        48,
        9,
        "Financement de projets de recherche en apprentissage automatique pour les langues africaines et la santé. "
        "Ouvert aux chercheurs et jeunes diplômés. Proposition de recherche et budget détaillé.",
    ),
    (
        "Acquisition de matériel informatique pour 25 lycées",
        "Direction de l'équipement scolaire (démo)",
        "SN",
        "tender",
        210_000_000,
        "XOF",
        11,
        5,
        "Fourniture d'ordinateurs, serveurs et équipements réseau, installation et garantie. Garantie de soumission, "
        "RCCM, attestation fiscale, états financiers.",
    ),
    (
        "Prix de l'entrepreneuriat féminin dans l'agroalimentaire",
        "Chambre de commerce régionale (démo)",
        "SN",
        "competition",
        5_000_000,
        "XOF",
        20,
        4,
        "Récompense des entreprises dirigées par des femmes dans la transformation agricole. Dossier : présentation "
        "de l'entreprise, états financiers simplifiés, business plan.",
    ),
    (
        "Mise en place d'un système de gestion des déchets plastiques",
        "Agence de l'environnement (démo)",
        "SN",
        "tender",
        95_000_000,
        "XOF",
        30,
        6,
        "Collecte, tri et valorisation des déchets plastiques dans trois communes, sensibilisation et suivi. "
        "Références similaires, offre technique, garantie de soumission.",
    ),
    (
        "Recrutement d'un consultant en suivi-évaluation et data",
        "ONG Avenir rural (démo)",
        "BF",
        "consultancy",
        12_000,
        "USD",
        8,
        2,
        "Mise en place d'outils de collecte de données mobiles, tableaux de bord Power BI et formation de l'équipe. "
        "CV, références similaires, offre financière.",
    ),
    (
        "Appel à candidatures : incubateur agritech",
        "Programme agritech Afrique de l'Ouest (démo)",
        "AO",
        "program",
        None,
        None,
        37,
        3,
        "Incubation de six mois pour startups agritech : mentorat, accès au marché, subvention jusqu'à 20 000 dollars. "
        "Pitch, business plan, statuts.",
    ),
    (
        "Construction d'un centre de formation professionnelle",
        "Fonds de développement local (démo)",
        "SN",
        "tender",
        650_000_000,
        "XOF",
        25,
        14,
        "Travaux de construction, génie civil et aménagements. Agrément BTP, garantie de soumission, états financiers, "
        "références similaires.",
    ),
    (
        "Production d'une série documentaire sur le patrimoine culturel",
        "Fonds de promotion de la culture (démo)",
        "SN",
        "grant",
        25_000_000,
        "XOF",
        35,
        5,
        "Soutien à la production audiovisuelle : cinéma documentaire, diffusion en ligne. Note d'intention, budget "
        "prévisionnel, CV de l'équipe.",
    ),
    (
        "Développement d'une application mobile de paiement des taxes",
        "Direction des collectivités territoriales (démo)",
        "SN",
        "tender",
        55_000_000,
        "XOF",
        4,
        18,
        "Application mobile et back-office pour la collecte des taxes locales, intégration Wave et Orange Money, "
        "formation des agents. NINEA, RCCM, attestation fiscale, références similaires.",
    ),
    (
        "Évaluation finale d'un programme d'inclusion financière",
        "Projet de finance inclusive (démo)",
        "SN",
        "consultancy",
        35_000_000,
        "XOF",
        13,
        7,
        "Évaluation finale, enquêtes de terrain, analyse statistique et rapport. CV des experts, références "
        "similaires en évaluation de programmes.",
    ),
    (
        "Hackathon santé numérique",
        "Initiative santé connectée (démo)",
        "SN",
        "competition",
        3_000_000,
        "XOF",
        10,
        1,
        "48 heures pour prototyper des solutions numériques en santé maternelle. Équipes de 3 à 5 personnes, "
        "inscription en ligne, prix pour les trois meilleures équipes.",
    ),
    (
        "Maintenance du parc informatique et du réseau",
        "Société nationale de transport (démo)",
        "SN",
        "tender",
        28_000_000,
        "XOF",
        16,
        9,
        "Maintenance préventive et corrective, assistance aux utilisateurs, supervision réseau. RCCM, attestation "
        "fiscale, attestation IPRES, références similaires.",
    ),
    (
        "Appel à projets : tourisme durable et communautaire",
        "Agence de promotion touristique (démo)",
        "SN",
        "grant",
        20_000_000,
        "XOF",
        44,
        11,
        "Financement de projets d'écotourisme portés par des associations et des PME, avec volet numérique "
        "(réservation en ligne). Budget prévisionnel, statuts.",
    ),
    (
        "Conception d'un tableau de bord de pilotage des marchés publics",
        "Autorité de régulation (démo)",
        "SN",
        "tender",
        70_000_000,
        "XOF",
        2,
        21,
        "Développement d'un entrepôt de données, tableaux de bord et API ouverte. NINEA, RCCM, garantie de "
        "soumission, références similaires en data.",
    ),
    (
        "Programme de renforcement des capacités des coopératives",
        "Union des coopératives agricoles (démo)",
        "ML",
        "tender",
        40_000_000,
        "XOF",
        23,
        6,
        "Formation en gestion, comptabilité et accès au marché pour 60 coopératives. Offre technique, CV des formateurs.",
    ),
    (
        "Subvention pour médias communautaires",
        "Fonds d'appui aux médias (démo)",
        "AO",
        "grant",
        12_000,
        "EUR",
        29,
        8,
        "Soutien aux radios et médias en ligne communautaires : équipement, formation, production de contenus.",
    ),
    (
        "Mise en œuvre d'une plateforme d'e-learning",
        "Université virtuelle régionale (démo)",
        "SN",
        "tender",
        48_000_000,
        "XOF",
        31,
        4,
        "Déploiement d'une plateforme d'apprentissage en ligne, création de contenus et formation des enseignants. "
        "Références similaires, offre technique et financière.",
    ),
    (
        "Fourniture de semences certifiées et d'engrais",
        "Programme de sécurité alimentaire (démo)",
        "NE",
        "tender",
        400_000_000,
        "XOF",
        18,
        10,
        "Fourniture et livraison de semences et d'intrants agricoles. Garantie de soumission, agrément, états financiers.",
    ),
]


class DemoAdapter:
    kind: ClassVar[str] = "demo"
    label: ClassVar[str] = "Données de démonstration"

    async def fetch(
        self, client: httpx.AsyncClient, url: str, config: dict[str, Any]
    ) -> list[RawOpportunity]:
        now = datetime.now(UTC).replace(hour=17, minute=0, second=0, microsecond=0)
        items: list[RawOpportunity] = []
        for index, (title, issuer, country, kind, amount, currency, due, published, details) in enumerate(
            _DEMO
        ):
            deadline = now + timedelta(days=due) if due is not None else None
            deadline_text = f" Date limite de dépôt : {deadline:%d/%m/%Y} à 17 h." if deadline else ""
            budget_text = f" Budget indicatif : {amount:,} {currency}.".replace(",", " ") if amount else ""
            items.append(
                RawOpportunity(
                    external_id=f"demo-{index:03d}",
                    title=title,
                    issuer=issuer,
                    url="",
                    description=f"{details}{budget_text}{deadline_text}",
                    country=country,
                    published_at=now - timedelta(days=published),
                    deadline_at=deadline,
                    kind=kind,
                    budget_amount=amount,
                    budget_currency=currency,
                    is_demo=True,
                )
            )
        return items


register(DemoAdapter())
