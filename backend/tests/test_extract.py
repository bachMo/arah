from datetime import UTC, datetime

from app.agent.extract import guess_budget, guess_deadline, guess_kind, to_xof
from app.core.text import contains_term, normalize
from app.taxonomy import detect_documents, detect_sectors


def test_deadline_french_and_numeric():
    text = "Les offres doivent parvenir au plus tard le 15 janvier 2027 à 12 h."
    assert guess_deadline(text) == datetime(2027, 1, 15, 23, 59, tzinfo=UTC)
    assert guess_deadline("Date limite de dépôt : 03/02/2027.") == datetime(2027, 2, 3, 23, 59, tzinfo=UTC)


def test_deadline_ignores_dates_without_hint():
    assert guess_deadline("Le projet a démarré le 12/03/2024 avec succès.") is None


def test_budget_formats():
    assert guess_budget("Budget indicatif : 45 000 000 XOF.") == (45_000_000, "XOF")
    assert guess_budget("Montant : 1,5 milliard FCFA") == (1_500_000_000, "XOF")
    assert guess_budget("Grant up to USD 250,000 per project") == (250_000, "USD")
    assert guess_budget("Aucun montant ici, seulement 2027.") == (None, None)


def test_currency_conversion():
    assert to_xof(100, "EUR") == 65595
    assert to_xof(10, "USD", usd_rate=600) == 6000
    assert to_xof(None, "XOF") is None


def test_kind_detection():
    assert guess_kind("Avis de manifestation d'intérêt pour un cabinet") == "consultancy"
    assert guess_kind("Hackathon santé numérique") == "competition"
    assert guess_kind("Avis d'appel d'offres ouvert") == "tender"


def test_term_matching_handles_accents_and_plural():
    text = normalize("Développement de plateformes numériques et d'APIs")
    assert contains_term(text, "plateforme")
    assert contains_term(text, "numérique")
    assert not contains_term(text, "form")


def test_sector_and_document_detection():
    text = "Installation de kits solaires photovoltaïques. Pièces : NINEA, RCCM, garantie de soumission."
    assert "energie" in detect_sectors(text)
    docs = detect_documents(text)
    assert "NINEA" in docs and "Garantie de soumission" in docs
    assert "Attestation sécurité sociale" not in detect_documents("Maîtrise de HTML et CSS exigée")
