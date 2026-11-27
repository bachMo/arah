import httpx
from httpx import AsyncClient

from app.agent.extract import guess_kind
from app.agent.matching import OpportunityData, ProfileData, score_match
from app.core.config import get_settings
from app.core.security import create_action_token
from app.sources.reliefweb import ReliefWebAdapter
from app.taxonomy import detect_contract, detect_experience, detect_remote

CANDIDATE = ProfileData(
    profile_kind="candidate",
    job_title="développeur web",
    skills=["React", "Python"],
    countries=["SN"],
    contract_types=["cdi", "freelance"],
    experience_level="intermediaire",
)


def job(**overrides) -> OpportunityData:
    base = dict(
        title="Développeur web full stack",
        description="React, Python, API.",
        kind="job",
        country="SN",
        contract_type="cdi",
        experience_level="intermediaire",
    )
    return OpportunityData(**{**base, **overrides})


def test_detection_rules():
    assert detect_contract("Offre de stage de fin d'études") == "stage"
    assert detect_contract("Consultancy: evaluation expert") == "freelance"
    assert detect_contract("Contrat à durée déterminée de 12 mois") == "cdd"
    assert detect_experience("5 ans d'expérience minimum") == "intermediaire"
    assert detect_experience("Junior profile welcome") == "debutant"
    assert detect_remote("Poste ouvert au télétravail")
    assert guess_kind("Avis de recrutement : un comptable confirmé") == "job"


def test_candidate_scores_matching_job_high():
    result = score_match(CANDIDATE, job())
    assert not result.excluded and result.score >= 70
    assert any("Contrat recherché" in r for r in result.reasons)


def test_candidate_filters_unrelated_or_wrong_contract():
    assert (
        score_match(CANDIDATE, job(title="Stage marketing", description="", contract_type="stage")).score < 35
    )
    assert score_match(CANDIDATE, job(title="Comptable", description="")).score < 35
    assert score_match(CANDIDATE, job(kind="tender", title="Appel d'offres plateforme web")).excluded


def test_remote_job_counts_as_reachable():
    remote_candidate = ProfileData(**{**CANDIDATE.__dict__, "remote_ok": True})
    result = score_match(remote_candidate, job(country="FR", remote=True))
    assert any("Télétravail" in r for r in result.reasons)


def test_organisations_do_not_get_jobs_unless_asked():
    org = ProfileData(sectors=["numerique"], skills=["développement web"])
    assert score_match(org, job(sectors=["numerique"])).excluded
    wants_jobs = ProfileData(
        sectors=["numerique"], skills=["développement web"], opportunity_kinds=["tender", "job"]
    )
    assert not score_match(wants_jobs, job(sectors=["numerique"])).excluded


async def test_reliefweb_adapter_maps_fields(monkeypatch):
    monkeypatch.setattr(get_settings(), "reliefweb_appname", "arah-test")
    payload = {
        "data": [
            {
                "id": 42,
                "fields": {
                    "title": "Chargé·e de suivi-évaluation",
                    "body": "Le poste est basé à Dakar. Vous assurez le suivi des projets et des données.",
                    "how_to_apply": "Postuler en ligne avant la date limite.",
                    "date": {"created": "2026-11-20T10:00:00+00:00", "closing": "2026-12-10T00:00:00+00:00"},
                    "source": [{"name": "ONG Exemple"}],
                    "country": [{"iso3": "SEN"}],
                    "city": [{"name": "Dakar"}],
                    "type": [{"name": "Consultancy"}],
                    "experience": [{"name": "3-4 years"}],
                    "url_alias": "https://reliefweb.int/job/42/charge-de-suivi-evaluation",
                },
            }
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["appname"] == "arah-test"
        return httpx.Response(200, json=payload)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        items = await ReliefWebAdapter().fetch(client, "https://api.reliefweb.int/v2/jobs", {})
    item = items[0]
    assert item.kind == "job" and item.country == "SN" and item.location == "Dakar"
    assert item.contract_type == "freelance" and item.experience_level == "intermediaire"
    assert item.issuer == "ONG Exemple" and item.deadline_at is not None and item.language == "fr"


async def test_job_submission_is_published_after_review(client: AsyncClient):
    res = await client.post(
        "/api/auth/register",
        json={"email": "rh@example.com", "password": "motdepasse2026", "full_name": "Fatou RH"},
    )
    user = res.json()
    offer = {
        "title": "Assistant·e administratif·ve",
        "company": "Cabinet Exemple",
        "contract_type": "cdd",
        "country": "SN",
        "location": "Dakar",
        "description": "Accueil, gestion administrative, suivi des dossiers et des courriers. " * 3,
        "apply_email": "rh@example.com",
    }
    assert (await client.post("/api/jobs/submissions", json=offer)).status_code == 403
    await client.post("/api/auth/verify", json={"token": create_action_token("verify", user["id"])})
    missing = await client.post("/api/jobs/submissions", json={**offer, "apply_email": None})
    assert missing.status_code == 422
    created = await client.post("/api/jobs/submissions", json=offer)
    assert created.status_code == 201 and created.json()["status"] == "pending"
    assert (await client.get("/api/jobs/submissions/mine")).json()[0]["title"] == offer["title"]
    listed = await client.get("/api/opportunities", params={"kind": "job", "q": "administratif"})
    assert listed.json()["total"] == 0

    await client.post("/api/auth/logout")
    await client.post(
        "/api/auth/register", json={"email": "curieux@example.com", "password": "motdepasse2026"}
    )
    assert (await client.get("/api/admin/submissions")).status_code == 403
    await client.post("/api/auth/logout")
    admin = {"email": "admin@example.com", "password": "motdepasse2026"}
    if (await client.post("/api/auth/register", json=admin)).status_code == 409:
        await client.post("/api/auth/login", json=admin)

    pending = (await client.get("/api/admin/submissions")).json()
    target = next(p for p in pending if p["title"] == offer["title"])
    reviewed = await client.post(f"/api/admin/submissions/{target['id']}", json={"decision": "approve"})
    assert reviewed.status_code == 200 and reviewed.json()["opportunity_id"]
    again = await client.post(f"/api/admin/submissions/{target['id']}", json={"decision": "reject"})
    assert again.status_code == 409

    detail = (await client.get(f"/api/opportunities/{reviewed.json()['opportunity_id']}")).json()
    assert detail["kind"] == "job" and detail["contract_type"] == "cdd" and detail["location"] == "Dakar"
    assert "rh@example.com" in detail["apply_info"]
    listed = await client.get("/api/opportunities", params={"kind": "job", "contract": "cdd"})
    assert any(o["id"] == detail["id"] for o in listed.json()["items"])
