from datetime import UTC, datetime, timedelta

from app.agent.matching import (
    OpportunityData,
    ProfileData,
    blend_scores,
    build_feedback_weights,
    format_xof,
    score_match,
)

NOW = datetime(2026, 11, 26, 12, tzinfo=UTC)

PROFILE = ProfileData(
    sectors=["numerique"],
    skills=["développement web", "React", "FastAPI"],
    countries=["SN"],
    keywords_include=["plateforme", "application mobile", "chatbot"],
    budget_min=5_000_000,
    budget_max=80_000_000,
)


def offer(**overrides) -> OpportunityData:
    base = dict(
        title="Développement d'une plateforme web et d'une application mobile",
        summary="Conception et déploiement d'une plateforme numérique.",
        sectors=["numerique"],
        country="SN",
        kind="tender",
        budget_xof=40_000_000,
        deadline_at=NOW + timedelta(days=20),
    )
    base.update(overrides)
    return OpportunityData(**base)


def test_strong_match_scores_high_with_reasons():
    result = score_match(PROFILE, offer(), now=NOW)
    assert result.score >= 80
    assert any("Mots-clés" in r for r in result.reasons)
    assert {c["label"] for c in result.criteria} >= {"Secteur d'activité", "Zone géographique"}


def test_out_of_zone_and_sector_scores_low():
    result = score_match(
        PROFILE,
        offer(
            title="Construction d'un pont", summary="Travaux de génie civil", sectors=["btp"], country="GH"
        ),
        now=NOW,
    )
    assert result.score < 35
    assert any("Hors de ta zone" in r for r in result.reasons)


def test_excluded_keyword_and_expired_deadline():
    profile = ProfileData(**{**PROFILE.__dict__, "keywords_exclude": ["mobile"]})
    assert score_match(profile, offer(), now=NOW).excluded
    assert score_match(PROFILE, offer(deadline_at=NOW - timedelta(days=1)), now=NOW).excluded


def test_short_deadline_adds_risk():
    result = score_match(PROFILE, offer(deadline_at=NOW + timedelta(days=2)), now=NOW)
    assert any("3 jours" in r for r in result.risks)


def test_feedback_shifts_score():
    liked = offer(title="Plateforme de suivi agricole", sectors=["numerique"])
    disliked = offer(title="Fourniture de matériel", sectors=["commerce"])
    weights = build_feedback_weights([(liked, True), (disliked, False)])
    base = score_match(PROFILE, offer(sectors=["commerce"]), now=NOW).score
    adjusted = score_match(PROFILE, offer(sectors=["commerce"]), feedback=weights, now=NOW).score
    assert adjusted < base


def test_helpers():
    assert blend_scores(40, 90) == 72
    assert format_xof(45_000_000) == "45 M F CFA"
    assert format_xof(1_500_000) == "1,5 M F CFA"
    assert format_xof(None) == "montant non précisé"
