# Contribuer à Arah!

Merci de vouloir améliorer Arah! Toutes les contributions comptent : une source de plus, une correction,
une meilleure formulation, un écran plus clair.

## Mettre en place l'environnement

Suis la section « Démarrage rapide » du [README](README.md). Avec Docker, `docker compose up --build` suffit.

## Avant d'ouvrir une demande de fusion

```bash
make lint      # ruff (API), eslint et TypeScript (site)
make test      # tests de l'API
```

- Une demande de fusion = un sujet.
- Les textes de l'interface sont en français simple, en tutoyant l'utilisateur.
- Toute modification du schéma passe par une migration Alembic :
  `alembic revision --autogenerate -m "description"`, puis relis le fichier généré.
- Ajoute ou adapte les tests quand tu touches à l'agent, au score ou aux routes.

## Ajouter une source

Une source est un module isolé dans `backend/app/sources/`. Avant tout, vérifie que les **conditions
d'utilisation du site autorisent la collecte automatique** ; préfère toujours une API ou un flux RSS.

Pour un simple flux RSS, inutile d'écrire du code : ajoute-le depuis la page Administration
(type « Flux RSS / Atom ») avec une configuration comme :

```json
{ "kind": "grant", "country": "SN", "language": "fr", "issuer": "Nom de l'émetteur" }
```

Pour une source qui demande un traitement particulier, crée un adaptateur :

```python
# backend/app/sources/ma_source.py
from typing import Any, ClassVar

import httpx

from app.sources.base import USER_AGENT, RawOpportunity, register


class MaSourceAdapter:
    kind: ClassVar[str] = "ma_source"
    label: ClassVar[str] = "Ma source"

    async def fetch(self, client: httpx.AsyncClient, url: str, config: dict[str, Any]) -> list[RawOpportunity]:
        response = await client.get(url, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        return [
            RawOpportunity(
                external_id=item["id"],      # identifiant stable dans la source
                title=item["titre"],
                url=item["lien"],
                issuer=item.get("emetteur", ""),
                description=item.get("texte", ""),
                country="SN",
                kind="tender",               # tender, consultancy, grant, competition, program, other
            )
            for item in response.json()["offres"]
        ]


register(MaSourceAdapter())
```

Puis importe le module dans `backend/app/sources/__init__.py`. L'Analyste s'occupe du reste : résumé, secteurs,
montant, date limite et pièces sont extraits automatiquement si la source ne les fournit pas.

## Signaler un problème

Ouvre un ticket avec ce que tu as fait, ce que tu attendais et ce qui s'est passé. Pour une faille de sécurité,
suis plutôt [SECURITY.md](SECURITY.md).
