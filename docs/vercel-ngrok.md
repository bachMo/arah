# Site sur Vercel, API sur ta machine

Une configuration de test : le site React est publié sur Vercel, l'API et la base tournent sur ta machine et
sont exposées par un tunnel [ngrok](https://ngrok.com). Pour une vraie mise en production, préfère le
déploiement sur serveur décrit dans le [README](../README.md#déploiement).

```
navigateur ──► https://arah.vercel.app ──► /api/* relayé par web/middleware.ts ──► https://xxx.ngrok-free.app ──► API (localhost:8000)
```

Le site et l'API partagent la même origine pour le navigateur : le cookie de session et la protection CSRF
fonctionnent sans réglage CORS particulier.

## 1. L'API en local

Dans `.env` (remplace `arah.vercel.app` par l'adresse de ton projet Vercel) :

```env
PUBLIC_URL=https://arah.vercel.app
API_URL=https://arah.vercel.app
CORS_ORIGINS=https://arah.vercel.app,http://localhost:5173
TRUST_PROXY=true
```

Puis :

```bash
docker compose up -d db mailpit api
```

## 2. Le tunnel

Réserve un domaine statique gratuit dans le tableau de bord ngrok (*Domains*), puis :

```bash
ngrok config add-authtoken <ton-jeton>
ngrok http 8000 --url=xxx.ngrok-free.app
```

Vérifie : `https://xxx.ngrok-free.app/api/health` doit répondre.

## 3. Le site sur Vercel

1. *Add New… → Project*, importe le dépôt.
2. *Root Directory* : `web` (le préréglage Vite est détecté, `web/vercel.json` fait le reste).
3. *Environment Variables* : `API_ORIGIN` = `https://xxx.ngrok-free.app`.
4. *Deploy*.

Si l'adresse ngrok change, mets à jour `API_ORIGIN` puis redéploie (*Deployments → Redeploy*).

## Limites

- Le site n'affiche des données que lorsque ta machine, Docker et le tunnel sont allumés.
- La veille planifiée (`AGENT_CRON`) ne tourne que si l'API est démarrée à l'heure prévue.
- Les liens des e-mails pointent vers `PUBLIC_URL` ; en local, ils arrivent dans Mailpit (http://localhost:8025).
