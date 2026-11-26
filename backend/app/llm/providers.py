"""Clients des fournisseurs de modèles.

Chaque fournisseur expose la même méthode `complete`. Changer de fournisseur revient à
modifier LLM_PROVIDER (et la clé correspondante) dans le fichier .env : aucun autre code ne change.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Literal, Protocol

import httpx

from app.core.config import Settings

log = logging.getLogger("arah.llm")

Role = Literal["user", "assistant"]


@dataclass
class Message:
    role: Role
    content: str


@dataclass
class Completion:
    text: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    cost_usd: float | None = None
    raw: dict = field(default_factory=dict, repr=False)


class LLMError(Exception):
    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class Provider(Protocol):
    name: str

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[Message],
        max_tokens: int,
        temperature: float,
        json_mode: bool,
    ) -> Completion: ...


async def _post(
    client: httpx.AsyncClient, url: str, *, headers: dict[str, str], body: dict, attempts: int = 3
) -> dict:
    delay = 1.5
    for attempt in range(1, attempts + 1):
        try:
            response = await client.post(url, headers=headers, json=body)
        except httpx.TimeoutException as exc:
            error = LLMError("Le fournisseur de modèle n'a pas répondu à temps.", retryable=True)
            error.__cause__ = exc
        except httpx.HTTPError as exc:
            error = LLMError(
                f"Connexion au fournisseur impossible : {exc.__class__.__name__}", retryable=True
            )
            error.__cause__ = exc
        else:
            if response.status_code < 400:
                return response.json()
            retryable = response.status_code in (408, 409, 429) or response.status_code >= 500
            detail = response.text[:400]
            error = LLMError(f"Erreur {response.status_code} du fournisseur : {detail}", retryable=retryable)
        if not error.retryable or attempt == attempts:
            raise error
        log.warning("Nouvel essai %s/%s après : %s", attempt + 1, attempts, error)
        await asyncio.sleep(delay)
        delay *= 2
    raise LLMError("Échec inattendu de l'appel au modèle.")


class OpenAICompatibleProvider:
    """OpenRouter et OpenAI partagent le format « chat completions »."""

    def __init__(
        self,
        name: str,
        *,
        api_key: str,
        base_url: str,
        timeout: float,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self._base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_key}", **(extra_headers or {})}
        self._client = httpx.AsyncClient(timeout=timeout)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[Message],
        max_tokens: int,
        temperature: float,
        json_mode: bool,
    ) -> Completion:
        body: dict = {
            "model": model,
            "messages": [{"role": "system", "content": system}]
            + [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}
        if self.name == "openrouter":
            body["usage"] = {"include": True}
        data = await _post(
            self._client, f"{self._base_url}/chat/completions", headers=self._headers, body=body
        )
        choices = data.get("choices") or []
        if not choices:
            raise LLMError(f"Réponse vide du fournisseur : {str(data)[:300]}")
        text = choices[0].get("message", {}).get("content") or ""
        usage = data.get("usage") or {}
        cost = usage.get("cost")
        return Completion(
            text=text,
            model=data.get("model", model),
            tokens_in=int(usage.get("prompt_tokens", 0) or 0),
            tokens_out=int(usage.get("completion_tokens", 0) or 0),
            cost_usd=float(cost) if cost is not None else None,
            raw=data,
        )


class AnthropicProvider:
    name = "anthropic"
    _url = "https://api.anthropic.com/v1/messages"

    def __init__(self, *, api_key: str, timeout: float) -> None:
        self._headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01"}
        self._client = httpx.AsyncClient(timeout=timeout)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[Message],
        max_tokens: int,
        temperature: float,
        json_mode: bool,
    ) -> Completion:
        if json_mode:
            system = f"{system}\n\nRéponds uniquement avec un objet JSON valide, sans texte autour."
        body = {
            "model": model,
            "system": system,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        data = await _post(self._client, self._url, headers=self._headers, body=body)
        text = "".join(
            block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
        )
        usage = data.get("usage") or {}
        return Completion(
            text=text,
            model=data.get("model", model),
            tokens_in=int(usage.get("input_tokens", 0) or 0),
            tokens_out=int(usage.get("output_tokens", 0) or 0),
            raw=data,
        )


class GoogleProvider:
    name = "google"
    _base = "https://generativelanguage.googleapis.com/v1beta/models"

    def __init__(self, *, api_key: str, timeout: float) -> None:
        self._headers = {"x-goog-api-key": api_key}
        self._client = httpx.AsyncClient(timeout=timeout)

    async def complete(
        self,
        *,
        model: str,
        system: str,
        messages: list[Message],
        max_tokens: int,
        temperature: float,
        json_mode: bool,
    ) -> Completion:
        config: dict = {"temperature": temperature, "maxOutputTokens": max_tokens}
        if json_mode:
            config["responseMimeType"] = "application/json"
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [
                {"role": "model" if m.role == "assistant" else "user", "parts": [{"text": m.content}]}
                for m in messages
            ],
            "generationConfig": config,
        }
        data = await _post(
            self._client, f"{self._base}/{model}:generateContent", headers=self._headers, body=body
        )
        candidates = data.get("candidates") or []
        if not candidates:
            raise LLMError(f"Réponse vide du fournisseur : {str(data)[:300]}")
        parts = candidates[0].get("content", {}).get("parts", [])
        usage = data.get("usageMetadata") or {}
        return Completion(
            text="".join(p.get("text", "") for p in parts),
            model=model,
            tokens_in=int(usage.get("promptTokenCount", 0) or 0),
            tokens_out=int(usage.get("candidatesTokenCount", 0) or 0),
            raw=data,
        )


def build_provider(settings: Settings) -> Provider | None:
    key = settings.llm_api_key
    if settings.llm_provider == "none" or not key:
        return None
    timeout = settings.llm_timeout_seconds
    if settings.llm_provider == "openrouter":
        return OpenAICompatibleProvider(
            "openrouter",
            api_key=key,
            base_url="https://openrouter.ai/api/v1",
            timeout=timeout,
            extra_headers={"HTTP-Referer": settings.public_url, "X-Title": settings.app_name},
        )
    if settings.llm_provider == "openai":
        return OpenAICompatibleProvider(
            "openai", api_key=key, base_url=settings.openai_base_url, timeout=timeout
        )
    if settings.llm_provider == "anthropic":
        return AnthropicProvider(api_key=key, timeout=timeout)
    if settings.llm_provider == "google":
        return GoogleProvider(api_key=key, timeout=timeout)
    return None
