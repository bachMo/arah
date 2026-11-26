.PHONY: up down logs api web db test lint run migrate migration admin

up:            ## Lance toute la plateforme avec Docker (développement)
	docker compose up --build

down:          ## Arrête les conteneurs
	docker compose down

logs:          ## Affiche les journaux de l'API
	docker compose logs -f api

db:            ## Lance seulement PostgreSQL et Mailpit (pour un développement sans Docker)
	docker compose up -d db mailpit

api:           ## Lance l'API en local (sans Docker)
	cd backend && alembic upgrade head && uvicorn app.main:app --reload --port 8000

web:           ## Lance le site en local (sans Docker)
	cd web && npm run dev

run:           ## Lance une veille complète maintenant
	docker compose exec api python -m app.cli run

migrate:       ## Applique les migrations
	docker compose exec api alembic upgrade head

migration:     ## Crée une migration : make migration m="message"
	docker compose exec api alembic revision --autogenerate -m "$(m)"

admin:         ## Donne les droits d'administration : make admin email=toi@exemple.com
	docker compose exec api python -m app.cli make-admin $(email)

test:          ## Lance les tests de l'API
	cd backend && pytest -q

lint:          ## Vérifie le code
	cd backend && ruff check . && ruff format --check .
	cd web && npm run lint && npm run typecheck
