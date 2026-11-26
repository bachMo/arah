<div align="center">

# arah!

**Les opportunités passent. Arah! les guette pour toi.**

Plateforme gratuite et open source de veille d'appels d'offres, de financements, de concours et de programmes,
pensée pour les PME, freelances, ONG et startups d'Afrique de l'Ouest francophone.

[Fonctionnalités](#fonctionnalités) · [Démarrage rapide](#démarrage-rapide) · [Configuration](#configuration) · [Déploiement](#déploiement) · [Contribuer](CONTRIBUTING.md)

</div>

![Accueil d'Arah!](docs/screenshots/accueil.jpg)

« Arah ! », c'est le cri du guetteur qui prévient : *attention, regarde !* Chaque matin, un agent parcourt les
sources, lit les offres, les compare au profil de chaque utilisateur, explique pourquoi elles lui correspondent,
prévient par e-mail et aide à préparer la réponse. Il ne fait jamais rien d'irréversible sans l'utilisateur.

## Fonctionnalités

| | |
|---|---|
| **Profil d'activité** | Saisi en quelques clics, ou pré-rempli par l'agent à partir d'une description libre. |
| **Veille quotidienne** | Le Veilleur parcourt les sources chaque matin (Banque mondiale, flux RSS, sources communautaires), écarte doublons et offres closes. |
| **Fiche et score** | L'Analyste résume chaque offre (objet, émetteur, montant, date limite, pièces) et calcule un score sur 100 avec ses raisons, les conditions remplies et les risques. |
| **Mon radar** | Offres triées par score ou date limite, statuts (à voir, intéressé, en préparation, envoyé, gagné, perdu), météo des dates limites. |
| **Avis** | « Pertinent » ou « Pas pour moi » : le tri s'ajuste aux préférences de chacun. |
| **Alertes et rappels** | Résumé quotidien ou hebdomadaire par e-mail, rappels J-7, J-3 et J-1. Module WhatsApp complet, activable d'un réglage. |
| **Aide à la réponse** | Le Rédacteur lit l'avis (et le dossier PDF s'il est fourni) : matrice d'exigences, pièces à réunir, plan, lettre de soumission. Brouillon modifiable, enregistré automatiquement, exportable. |
| **Coffre de documents** | NINEA, RCCM, attestations… avec rappels avant expiration. |
| **Constellation 3D** | Chaque offre est une étoile : proximité = ressemblance, taille = montant, couleur = urgence, profil au centre. Vue 2D sur mobile. |
| **Observatoire** | Tendances par secteur, émetteurs actifs, montants moyens, mots-clés émergents, et *ce qui te manque* pour répondre à plus d'offres. |
| **Transparence** | Journal public de l'agent, compteur des coûts et des dons du mois, sources visibles. |
| **Dons** | PayTech (Wave, Orange Money, carte), numéros Wave et Orange Money, mur des donateurs. |
| **Compte** | Inscription par e-mail ou Google, confirmation d'adresse, mot de passe oublié, export et suppression des données. |

<table>
<tr>
<td><img src="docs/screenshots/radar.jpg" alt="Mon radar"></td>
<td><img src="docs/screenshots/offre.jpg" alt="Fiche d'une offre"></td>
</tr>
<tr>
<td><img src="docs/screenshots/constellation.jpg" alt="Constellation 3D"></td>
<td><img src="docs/screenshots/preparation.jpg" alt="Préparation de la réponse"></td>
</tr>
</table>

## Stack

- **API et agent** : Python 3.11+, FastAPI, SQLAlchemy 2 (asynchrone), Alembic, APScheduler
- **Base de données** : PostgreSQL 16 (recherche plein texte en français, `pg_trgm`)
- **Site** : React 18, TypeScript, Vite, TanStack Query, Three.js
- **IA** : OpenRouter, Anthropic, OpenAI ou Google, interchangeables par configuration
- **Déploiement** : Docker Compose, Nginx, Caddy (HTTPS automatique)

## Démarrage rapide

### Avec Docker (recommandé)

Prérequis : [Docker Desktop](https://www.docker.com/products/docker-desktop/) ou Docker Engine avec Compose.

```bash
cp .env.example .env
docker compose up --build
```

C'est tout. Au premier lancement, la base est créée, les migrations appliquées et les sources enregistrées.

| Service | Adresse |
|---|---|
| Site | http://localhost:5173 |
| Documentation de l'API | http://localhost:8000/api/docs |
| Boîte de réception de test (Mailpit) | http://localhost:8025 |

Ensuite :

1. **Remplis la base** avec une première veille (avec `DEMO_DATA=true`, 30 offres fictives sont ajoutées) :
   ```bash
   docker compose exec api python -m app.cli run
   ```
2. **Crée ton compte** sur http://localhost:5173/inscription. L'e-mail de confirmation arrive dans Mailpit.
3. **Décris ton activité** : ton radar se remplit immédiatement.
4. **Deviens administrateur** (pour lancer la veille depuis le site, gérer les sources et le compteur) :
   ```bash
   docker compose exec api python -m app.cli make-admin ton@email.com
   ```
   Tu peux aussi mettre ton adresse dans `ADMIN_EMAILS` avant de t'inscrire.

### Sans Docker

Prérequis : Python 3.11+, Node.js 20+, PostgreSQL 16 (ou `docker compose up -d db mailpit`).

```bash
cp .env.example .env            # DATABASE_URL pointe vers localhost:5432

# API
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows : .venv\Scripts\activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Site (dans un second terminal)
cd web
npm install
npm run dev
```

> Si tu utilises ta propre installation de PostgreSQL, crée l'utilisateur et la base :
> `createuser -P arah` puis `createdb -O arah arah`.

## Configuration

Toute la configuration passe par le fichier `.env` (voir [`.env.example`](.env.example), entièrement commenté).

### Modèles d'IA

Sans clé, Arah! fonctionne en **mode règles** : extraction des dates et montants, score d'adéquation, brouillon
de réponse à partir d'un modèle. Avec une clé, l'IA résume les offres, affine les meilleurs scores, pré-remplit
les profils et rédige des brouillons sur mesure.

Changer de fournisseur revient à modifier deux lignes :

```env
LLM_PROVIDER=openrouter        # openrouter | anthropic | openai | google | none
OPENROUTER_API_KEY=sk-or-...
```

| Fournisseur | Clé | Modèle rapide par défaut | Modèle avancé par défaut |
|---|---|---|---|
| `openrouter` | `OPENROUTER_API_KEY` | `anthropic/claude-haiku-4.5` | `anthropic/claude-sonnet-4.5` |
| `anthropic` | `ANTHROPIC_API_KEY` | `claude-haiku-4-5` | `claude-sonnet-4-5` |
| `openai` | `OPENAI_API_KEY` | `gpt-4.1-mini` | `gpt-4.1` |
| `google` | `GOOGLE_API_KEY` | `gemini-2.5-flash` | `gemini-2.5-pro` |

Les noms de modèles évoluent vite : remplace-les avec `LLM_MODEL_FAST` et `LLM_MODEL_SMART` par ceux proposés
par ton fournisseur (catalogue OpenRouter : https://openrouter.ai/models). Vérifie la connexion avec :

```bash
docker compose exec api python -m app.cli llm-check
```

Le modèle **rapide** sert au tri (fiches, scores, profils) et coûte presque rien ; le modèle **avancé** ne sert
qu'aux brouillons de réponse demandés par l'utilisateur. Deux garde-fous limitent les dépenses :
`LLM_DAILY_BUDGET_USD` (plafond global sur 24 h) et `LLM_USER_DAILY_CALLS` (utilisations par personne et par jour).
Chaque appel est tracé et son coût apparaît dans le journal public.

`OPENAI_BASE_URL` permet aussi d'utiliser tout service compatible avec l'API OpenAI (Mistral, Groq, un modèle local…).

### E-mails

En local, les e-mails sont capturés par Mailpit. En production, renseigne un serveur SMTP
(Brevo, Mailjet, Amazon SES, Resend…) :

```env
EMAIL_BACKEND=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM=Arah! <alertes@ton-domaine.com>
```

Pense à configurer SPF, DKIM et DMARC sur ton domaine pour que les alertes n'arrivent pas en indésirables.
Chaque résumé contient un lien de désinscription en un clic (en-têtes `List-Unsubscribe`).

### WhatsApp

Le module est prêt mais désactivé (`WHATSAPP_ENABLED=false`). Pour l'activer : crée une application Meta avec
l'API WhatsApp Cloud, fais approuver deux modèles de message (`arah_digest` avec 3 variables : nombre d'offres,
titre de la meilleure, lien ; `arah_rappel` avec 3 variables : titre, jours restants, lien), puis renseigne
`WHATSAPP_TOKEN` et `WHATSAPP_PHONE_NUMBER_ID`. Les utilisateurs pourront alors ajouter leur numéro dans leurs réglages.

### Connexion avec Google

Crée un identifiant OAuth « Application Web » dans Google Cloud Console, déclare l'URI de redirection
`{API_URL}/api/auth/google/callback`, puis renseigne `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`.
Le bouton apparaît automatiquement.

### Dons

- **PayTech** : renseigne `PAYTECH_API_KEY` et `PAYTECH_API_SECRET`, et déclare l'URL de notification
  `{API_URL}/api/donations/ipn`. Les dons confirmés s'ajoutent automatiquement au compteur.
- **Wave / Orange Money** : renseigne `DONATION_WAVE_NUMBER` et `DONATION_ORANGE_MONEY_NUMBER`. Ajoute ces dons
  au compteur depuis la page Administration.
- Les **coûts** du serveur s'ajoutent depuis l'administration ou avec
  `python -m app.cli add-cost "Serveur VPS" 6500`. Les coûts d'IA sont comptés automatiquement.

## Commandes utiles

```bash
python -m app.cli run                  # veille complète maintenant
python -m app.cli reminders            # rappels du jour
python -m app.cli digest               # envoie les résumés en attente
python -m app.cli llm-check            # teste le fournisseur d'IA
python -m app.cli make-admin EMAIL     # droits d'administration
python -m app.cli add-cost LIBELLÉ MONTANT [AAAA-MM]
```

Avec Docker, préfixe par `docker compose exec api`. Le `Makefile` regroupe les commandes courantes (`make up`, `make run`, `make test`…).

## Tests

```bash
cd backend && pytest -q                     # nécessite une base PostgreSQL « arah_test »
cd web && npm run lint && npm run build
```

La base de test se configure avec `TEST_DATABASE_URL` (par défaut `postgresql+asyncpg://arah:arah@localhost:5432/arah_test`).
L'intégration continue (GitHub Actions) lance le lint, les tests, les migrations et la compilation du site.

## Déploiement

Sur un serveur Linux (un VPS à 2 Go de RAM suffit pour commencer) avec Docker installé :

```bash
git clone https://github.com/bachMo/arah.git && cd arah
cp .env.example .env
```

Dans `.env`, au minimum :

```env
ENVIRONMENT=production
SECRET_KEY=<python -c "import secrets; print(secrets.token_urlsafe(48))">
DOMAIN=arah.ton-domaine.com
PUBLIC_URL=https://arah.ton-domaine.com
API_URL=https://arah.ton-domaine.com
CORS_ORIGINS=https://arah.ton-domaine.com
POSTGRES_PASSWORD=<mot de passe solide>
DEMO_DATA=false
EMAIL_BACKEND=smtp
# + SMTP_*, clé d'IA, ADMIN_EMAILS…
```

Fais pointer le domaine vers l'adresse IP du serveur, puis :

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy obtient le certificat HTTPS automatiquement. La veille tourne chaque matin à 6 h (`AGENT_CRON`) ; un
verrou PostgreSQL garantit une seule exécution, même avec plusieurs processus.

Sauvegarde quotidienne conseillée :

```bash
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U arah arah | gzip > sauvegarde-$(date +%F).sql.gz
```

Mise à jour : `git pull && docker compose -f docker-compose.prod.yml up -d --build` (les migrations s'appliquent au démarrage).

### Pour tester : site sur Vercel, API sur ta machine

Le site peut être publié sur Vercel pendant que l'API tourne sur ta machine, exposée par ngrok. La marche à suivre
est dans [docs/vercel-ngrok.md](docs/vercel-ngrok.md).

## Architecture

```
backend/
  app/
    agent/        Veilleur, Analyste, Suivi et Rédacteur : collecte, fiches, score, alertes, brouillons
    sources/      une source = un module (Banque mondiale, RSS, démonstration)
    llm/          fournisseurs d'IA interchangeables, budget, sortie JSON validée
    notify/       e-mails (modèles HTML + texte) et WhatsApp
    api/          routes HTTP
    models.py     schéma de la base
  migrations/     Alembic
  tests/
web/
  src/
    pages/        écrans du site
    components/   interface, radar, constellation 3D, graphiques
    lib/          client API, authentification, formats
deploy/           Caddy
```

**Le score** combine d'abord des règles rapides et gratuites (mots-clés et compétences, secteur, zone, type d'offre,
montant, délai, avis passés de l'utilisateur), appliquées à toutes les offres. L'IA n'affine que les meilleures
correspondances de chaque utilisateur, ce qui garde des coûts faibles même avec beaucoup d'utilisateurs.

**La sécurité des appels à l'IA** : le texte des offres et des dossiers est toujours placé entre balises et traité
comme une donnée, jamais comme une instruction ; les réponses sont validées par schéma avant d'être utilisées.

## Feuille de route

- Sources : portails nationaux des marchés publics, Banque africaine de développement, agences des Nations unies
- Discussion avec l'agent (« trouve-moi des financements agricoles au-dessus de 10 millions »)
- Serveur MCP pour utiliser Arah! depuis d'autres agents
- Contrôle avant dépôt, dépôt assisté par e-mail
- Comptes équipe, groupements entre structures, bilan après résultat

## Contribuer

Les contributions sont bienvenues : nouvelle source, correction, traduction, design. Lis [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE). Les offres affichées restent la propriété de leurs émetteurs.
