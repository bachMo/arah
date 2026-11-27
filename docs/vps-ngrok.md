# Site sur Vercel, API sur un serveur partagé

Pour un serveur qui héberge déjà d'autres projets : Arah! n'y fait tourner que sa base et son API, sans
toucher aux ports 80 et 443. Un tunnel [ngrok](https://ngrok.com) donne à l'API une adresse HTTPS fixe, et le
site publié sur Vercel relaie `/api/*` vers elle (`web/middleware.ts`).

```
navigateur ──► https://arah.vercel.app ──► /api/* relayé par web/middleware.ts ──► https://xxx.ngrok-free.app ──► conteneur ngrok ──► api:8000
```

Le fichier utilisé est `docker-compose.vps.yml` :

- `db` : PostgreSQL, sans port publié, 512 Mo de mémoire au plus ;
- `api` : un seul processus (`WEB_CONCURRENCY=1`), 1 Go au plus, migrations appliquées au démarrage ;
- `ngrok` : le tunnel, lancé quand l'API répond.

Un seul processus suffit pour le trafic attendu, et la veille et les rappels planifiés tournent ainsi une seule
fois.

## 1. Le domaine ngrok

Le plan gratuit de ngrok donne un domaine fixe par compte. Si ce compte sert déjà à un autre projet, crée un
compte à part pour Arah!.

1. Dans le tableau de bord ngrok, *Domains* : note le domaine gratuit (`xxx.ngrok-free.app`).
2. *Your Authtoken* : copie le jeton.

## 2. Le code et la configuration

```bash
cd /srv/projets
git clone https://github.com/bachMo/arah.git
cd arah
cp .env.example .env
nano .env
```

Dans `.env` (remplace `arah.vercel.app` par l'adresse de ton projet Vercel) :

```env
ENVIRONMENT=production
SECRET_KEY=<python3 -c "import secrets; print(secrets.token_urlsafe(48))">
PUBLIC_URL=https://arah.vercel.app
API_URL=https://arah.vercel.app
CORS_ORIGINS=https://arah.vercel.app
POSTGRES_PASSWORD=<mot de passe solide>
DEMO_DATA=false
ADMIN_EMAILS=<ton adresse>
NGROK_AUTHTOKEN=<jeton du compte ngrok d'Arah!>
NGROK_DOMAIN=xxx.ngrok-free.app
EMAIL_BACKEND=smtp
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURITY=starttls
SMTP_USER=<identifiant SMTP>
SMTP_PASSWORD=<mot de passe SMTP>
EMAIL_FROM=Arah! <alertes@ton-domaine.com>
# + la clé d'IA (OPENROUTER_API_KEY…)
# + RELIEFWEB_APPNAME pour les offres d'emploi des ONG et de l'ONU (voir le README)
```

En production, l'API refuse de démarrer sans `SECRET_KEY` d'au moins 32 caractères ni `EMAIL_BACKEND=smtp`.

`DATABASE_URL`, `TRUST_PROXY` et `WEB_CONCURRENCY` sont fixés par `docker-compose.vps.yml` : inutile de les
modifier dans `.env`.

```bash
chmod 600 .env
```

## 3. Le démarrage

```bash
docker compose -f docker-compose.vps.yml up -d --build
docker compose -f docker-compose.vps.yml ps
```

Les trois services doivent être `running`, l'API `healthy`. Vérifie ensuite depuis n'importe où :
`https://xxx.ngrok-free.app/api/health` doit répondre.

En cas de problème : `docker compose -f docker-compose.vps.yml logs --tail 100 api`.

## 4. Le site sur Vercel

1. *Add New… → Project*, importe le dépôt.
2. *Root Directory* : `web`.
3. *Environment Variables* : `API_ORIGIN` = `https://xxx.ngrok-free.app`.
4. *Deploy*.

Les liens des e-mails, la connexion Google (`{API_URL}/api/auth/google/callback`) et les notifications PayTech
(`{API_URL}/api/donations/ipn`) passent par l'adresse Vercel, qui les relaie vers l'API.

## Mise à jour

```bash
cd /srv/projets/arah
git pull
docker compose -f docker-compose.vps.yml up -d --build
docker image prune -f
```

## Sauvegarde

```bash
docker compose -f docker-compose.vps.yml exec -T db pg_dump -U arah arah | gzip > ~/arah-$(date +%F).sql.gz
```
