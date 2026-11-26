import os

os.environ.update(
    ENVIRONMENT="test",
    DATABASE_URL=os.environ.get(
        "TEST_DATABASE_URL", "postgresql+asyncpg://arah:arah@localhost:5432/arah_test"
    ),
    SCHEDULER_ENABLED="false",
    LLM_PROVIDER="none",
    DEMO_DATA="true",
    EMAIL_BACKEND="console",
    SECRET_KEY="test-secret-key-for-the-suite-0123456789",
    ADMIN_EMAILS="admin@example.com",
)

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.db import Base, engine
from app.main import app


@pytest.fixture(scope="session", autouse=True)
async def database():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport, base_url="http://test", headers={"X-Arah-Client": "web"}
    ) as c:
        yield c
