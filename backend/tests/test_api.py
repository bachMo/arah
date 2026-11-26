from httpx import AsyncClient

from app.agent.pipeline import run_daily
from app.core.security import create_action_token, create_unsubscribe_token

PROFILE = {
    "organization_name": "Studio Teranga",
    "org_type": "freelance",
    "description": "Développement web et mobile, chatbots et tableaux de bord.",
    "sectors": ["numerique"],
    "skills": ["développement web", "application mobile", "chatbot", "tableau de bord"],
    "countries": ["SN"],
    "keywords_include": ["plateforme", "application", "digitalisation"],
    "keywords_exclude": ["construction"],
    "budget_min": 5_000_000,
    "budget_max": 90_000_000,
}


async def register(client: AsyncClient, email: str) -> dict:
    res = await client.post(
        "/api/auth/register", json={"email": email, "password": "motdepasse2026", "full_name": "Awa Ndiaye"}
    )
    assert res.status_code == 201, res.text
    return res.json()


async def test_health_and_config(client: AsyncClient):
    assert (await client.get("/api/health")).json() == {"status": "ok"}
    config = (await client.get("/api/config")).json()
    assert config["llm"]["enabled"] is False and config["whatsapp_enabled"] is False
    taxonomy = (await client.get("/api/taxonomy")).json()
    assert any(s["value"] == "numerique" for s in taxonomy["sectors"])


async def test_auth_lifecycle(client: AsyncClient):
    user = await register(client, "Awa@Example.com")
    assert user["email"] == "awa@example.com" and not user["is_verified"]
    assert (
        await client.post("/api/auth/register", json={"email": "awa@example.com", "password": "autre2026xx"})
    ).status_code == 409
    weak = await client.post("/api/auth/register", json={"email": "b@example.com", "password": "12345678"})
    assert weak.status_code == 422 and "mot de passe" in weak.json()["detail"]

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    token = create_action_token("verify", user["id"])
    assert (await client.post("/api/auth/verify", json={"token": token})).json()["is_verified"] is True

    await client.post("/api/auth/logout")
    assert (await client.get("/api/auth/me")).status_code == 401
    bad = await client.post("/api/auth/login", json={"email": "awa@example.com", "password": "mauvais123"})
    assert bad.status_code == 401
    assert (
        await client.post("/api/auth/login", json={"email": "awa@example.com", "password": "motdepasse2026"})
    ).status_code == 200


async def test_password_reset_is_single_use(client: AsyncClient):
    user = await register(client, "reset@example.com")
    from app.core.db import SessionLocal
    from app.models import User

    async with SessionLocal() as session:
        db_user = await session.get(User, __import__("uuid").UUID(user["id"]))
        token = create_action_token("reset", user["id"], password_hash=db_user.password_hash)
    first = await client.post("/api/auth/reset-password", json={"token": token, "password": "nouveau2026"})
    assert first.status_code == 200
    second = await client.post("/api/auth/reset-password", json={"token": token, "password": "encore2026x"})
    assert second.status_code == 400


async def test_csrf_header_required_for_cookie_writes(client: AsyncClient):
    await register(client, "csrf@example.com")
    res = await client.put("/api/profile", json=PROFILE, headers={"X-Arah-Client": ""})
    assert res.status_code == 403


async def test_full_flow(client: AsyncClient):
    user = await register(client, "flow@example.com")
    res = await client.put("/api/profile", json=PROFILE)
    assert res.status_code == 200, res.text

    suggestion = await client.post(
        "/api/profile/suggest",
        json={
            "description": "Je suis freelance à Dakar, je développe des sites web et des applications mobiles pour les ONG."
        },
    )
    assert suggestion.status_code == 200 and "numerique" in suggestion.json()["sectors"]

    run = await run_daily("test")
    assert run is not None and run.status.value in {"success", "partial"}
    assert run.stats["new_opportunities"] >= 30

    radar = (await client.get("/api/radar")).json()
    assert radar["total"] > 3
    top = radar["items"][0]
    assert top["match"]["score"] >= radar["items"][-1]["match"]["score"]
    assert all("construction" not in item["title"].lower() for item in radar["items"])

    summary = (await client.get("/api/radar/summary")).json()
    assert summary["active"] == radar["total"]

    opp_id = top["id"]
    detail = (await client.get(f"/api/opportunities/{opp_id}")).json()
    assert detail["match"] and detail["summary"]

    patched = await client.patch(
        f"/api/radar/{opp_id}", json={"status": "interested", "feedback": "relevant"}
    )
    assert patched.json()["match"]["status"] == "interested"

    prep = await client.post(f"/api/prepare/{opp_id}/generate", data={"document_text": ""})
    assert prep.status_code == 200, prep.text
    body = prep.json()
    assert body["letter"] and body["checklist"] and body["outline"]
    body["checklist"][0]["done"] = True
    saved = await client.put(
        f"/api/prepare/{opp_id}", json={"checklist": body["checklist"], "notes": "Appeler le client"}
    )
    assert saved.json()["checklist"][0]["done"] is True
    assert (await client.post(f"/api/prepare/{opp_id}/validate")).json()["validated_at"]
    export = await client.get(f"/api/prepare/{opp_id}/export")
    assert export.status_code == 200 and "## Lettre de soumission" in export.text

    timeline = (await client.get("/api/radar/timeline")).json()
    assert any(item["id"] == opp_id for item in timeline)

    explorer = (
        await client.get("/api/opportunities", params={"q": "plateforme", "sort": "relevance"})
    ).json()
    assert explorer["total"] >= 1
    assert (await client.get(f"/api/opportunities/{opp_id}/similar")).status_code == 200

    doc = await client.post(
        "/api/vault", json={"doc_type": "ninea", "reference": "0123456", "expires_on": "2027-06-30"}
    )
    assert doc.status_code == 201
    assert len((await client.get("/api/vault")).json()) == 1
    assert (await client.delete(f"/api/vault/{doc.json()['id']}")).status_code == 204

    alerts = (await client.get("/api/settings/alerts")).json()
    alerts.update(alert_frequency="weekly", alert_min_score=70)
    assert (await client.put("/api/settings/alerts", json=alerts)).json()["alert_frequency"] == "weekly"

    obs = (await client.get("/api/observatory")).json()
    assert obs["totals"]["open"] >= 1 and obs["by_sector"]
    me = (await client.get("/api/observatory/me")).json()
    assert me["ready"] is True and me["sector_offers"] >= 1

    constellation = (await client.get("/api/constellation")).json()
    assert constellation["personal"] is True and len(constellation["nodes"]) >= 10

    transparency = (await client.get("/api/transparency")).json()
    assert transparency["runs"] and transparency["runs"][0]["steps"]

    export_all = (await client.get("/api/auth/export")).json()
    assert export_all["profil"]["organization_name"] == "Studio Teranga"

    token = create_unsubscribe_token(user["id"])
    res = await client.get("/api/alerts/unsubscribe", params={"token": token}, follow_redirects=False)
    assert res.status_code == 303 and "ok=1" in res.headers["location"]
    assert (await client.get("/api/settings/alerts")).json()["alert_frequency"] == "off"

    assert (await client.delete("/api/auth/me")).status_code == 204
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_admin_routes_are_protected(client: AsyncClient):
    await register(client, "simple@example.com")
    assert (await client.get("/api/admin/overview")).status_code == 403
    await client.post("/api/auth/logout")
    await register(client, "admin@example.com")
    overview = await client.get("/api/admin/overview")
    assert overview.status_code == 200 and overview.json()["sources"]
    cost = await client.post(
        "/api/admin/ledger", json={"month": "2026-11-01", "kind": "cost", "label": "VPS", "amount_xof": 6500}
    )
    assert cost.status_code == 201
