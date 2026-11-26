import json

import httpx
import pytest
from pydantic import BaseModel

from app.core.db import SessionLocal
from app.llm.providers import AnthropicProvider, GoogleProvider, Message, OpenAICompatibleProvider
from app.llm.service import BudgetExceeded, LLMService, extract_json


class Out(BaseModel):
    score: int


def mock(provider, handler):
    provider._client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return provider


async def call(provider):
    return await provider.complete(
        model="m", system="s", messages=[Message("user", "u")], max_tokens=10, temperature=0, json_mode=True
    )


async def test_openrouter_format_and_cost():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        assert request.url.path.endswith("/chat/completions")
        assert body["messages"][0]["role"] == "system" and body["response_format"]["type"] == "json_object"
        assert body["usage"] == {"include": True}
        return httpx.Response(
            200,
            json={
                "model": "x/y",
                "choices": [{"message": {"content": '{"score": 7}'}}],
                "usage": {"prompt_tokens": 12, "completion_tokens": 3, "cost": 0.0001},
            },
        )

    p = mock(
        OpenAICompatibleProvider(
            "openrouter", api_key="k", base_url="https://openrouter.ai/api/v1", timeout=5
        ),
        handler,
    )
    result = await call(p)
    assert result.text == '{"score": 7}' and result.tokens_in == 12 and result.cost_usd == 0.0001


async def test_anthropic_format():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-api-key"] == "k"
        body = json.loads(request.content)
        assert "JSON" in body["system"]
        return httpx.Response(
            200,
            json={
                "model": "claude",
                "content": [{"type": "text", "text": "{}"}],
                "usage": {"input_tokens": 5, "output_tokens": 1},
            },
        )

    result = await call(mock(AnthropicProvider(api_key="k", timeout=5), handler))
    assert result.text == "{}" and result.tokens_out == 1


async def test_google_format():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/models/m:generateContent")
        body = json.loads(request.content)
        assert body["generationConfig"]["responseMimeType"] == "application/json"
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": '{"score":1}'}]}}],
                "usageMetadata": {"promptTokenCount": 4, "candidatesTokenCount": 2},
            },
        )

    result = await call(mock(GoogleProvider(api_key="k", timeout=5), handler))
    assert result.text == '{"score":1}' and result.tokens_in == 4


def test_extract_json_tolerates_fences_and_noise():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('Voici : {"a": 2} merci') == {"a": 2}


class FakeProvider:
    name = "fake"

    def __init__(self, text: str) -> None:
        self.text = text

    async def complete(self, **kwargs):
        from app.llm.providers import Completion

        return Completion(text=self.text, model="fake-model", tokens_in=10, tokens_out=5)


async def test_service_validates_and_falls_back_on_bad_output():
    async with SessionLocal() as session:
        ok = await LLMService(FakeProvider('{"score": 42}')).complete_json(
            session, purpose="test", system="s", prompt="p", schema=Out
        )
        bad = await LLMService(FakeProvider("pas du json")).complete_json(
            session, purpose="test", system="s", prompt="p", schema=Out
        )
        await session.rollback()
    assert ok == Out(score=42)
    assert bad is None


async def test_daily_budget_is_enforced():
    service = LLMService(FakeProvider('{"score": 1}'))
    service.settings = service.settings.model_copy(update={"llm_daily_budget_usd": 0.0})
    async with SessionLocal() as session:
        with pytest.raises(BudgetExceeded):
            await service.complete_json(session, purpose="test", system="s", prompt="p", schema=Out)
