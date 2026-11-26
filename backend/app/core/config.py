from __future__ import annotations

from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

LLMProviderName = Literal["openrouter", "openai", "anthropic", "google", "none"]

DEFAULT_MODELS: dict[str, tuple[str, str]] = {
    # provider: (modèle rapide pour trier, modèle avancé pour analyser et rédiger)
    "openrouter": ("anthropic/claude-haiku-4.5", "anthropic/claude-sonnet-4.5"),
    "anthropic": ("claude-haiku-4-5", "claude-sonnet-4-5"),
    "openai": ("gpt-4.1-mini", "gpt-4.1"),
    "google": ("gemini-2.5-flash", "gemini-2.5-pro"),
    "none": ("", ""),
}

INSECURE_SECRET = "change-me-in-production"


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    app_name: str = "Arah!"
    environment: Literal["development", "production", "test"] = "development"
    secret_key: str = INSECURE_SECRET
    public_url: str = "http://localhost:5173"
    api_url: str = "http://localhost:8000"
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]
    trust_proxy: bool = False
    log_level: str = "INFO"
    log_json: bool = False
    timezone: str = "Africa/Dakar"
    session_days: int = 14
    admin_emails: Annotated[list[str], NoDecode] = []

    # Base de données
    database_url: str = "postgresql+asyncpg://arah:arah@localhost:5432/arah"
    database_pool_size: int = 10

    # Agent
    scheduler_enabled: bool = True
    agent_cron: str = "0 6 * * *"
    reminders_cron: str = "0 8 * * *"
    demo_data: bool = False
    match_min_score: int = 35
    llm_rerank_per_user: int = 5
    llm_enrich_per_run: int = 60
    source_timeout_seconds: float = 25.0

    # Modèles d'IA
    llm_provider: LLMProviderName = "openrouter"
    llm_model_fast: str | None = None
    llm_model_smart: str | None = None
    openrouter_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    openai_base_url: str = "https://api.openai.com/v1"
    llm_timeout_seconds: float = 90.0
    llm_daily_budget_usd: float = 2.0
    llm_user_daily_calls: int = 20
    llm_price_fast_in: float = 1.0
    llm_price_fast_out: float = 5.0
    llm_price_smart_in: float = 3.0
    llm_price_smart_out: float = 15.0
    usd_to_xof: float = 600.0

    # E-mail
    email_backend: Literal["smtp", "console"] = "console"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_security: Literal["starttls", "ssl", "none"] = "none"
    email_from: str = "Arah! <alertes@arah.local>"
    email_reply_to: str | None = None

    # WhatsApp (désactivé tant que les dons ne couvrent pas les frais Meta)
    whatsapp_enabled: bool = False
    whatsapp_token: str | None = None
    whatsapp_phone_number_id: str | None = None
    whatsapp_template_digest: str = "arah_digest"
    whatsapp_template_reminder: str = "arah_rappel"
    whatsapp_template_lang: str = "fr"
    whatsapp_api_version: str = "v21.0"

    # Connexion Google
    google_client_id: str | None = None
    google_client_secret: str | None = None

    # Dons
    paytech_api_key: str | None = None
    paytech_api_secret: str | None = None
    paytech_env: Literal["test", "prod"] = "test"
    donation_wave_number: str | None = None
    donation_orange_money_number: str | None = None
    donation_monthly_goal_xof: int = 30000
    github_url: str = "https://github.com/"
    contact_email: str = "contact@example.com"

    @field_validator("cors_origins", "admin_emails", mode="before")
    @classmethod
    def _csv(cls, value: object) -> object:
        return _split_csv(value)

    @field_validator("smtp_host", mode="before")
    @classmethod
    def _default_host(cls, value: object) -> object:
        return value or "localhost"

    @field_validator("admin_emails")
    @classmethod
    def _lower(cls, value: list[str]) -> list[str]:
        return [v.lower() for v in value]

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        if self.environment == "production":
            if self.secret_key == INSECURE_SECRET or len(self.secret_key) < 32:
                raise ValueError("SECRET_KEY doit être défini (32 caractères minimum) en production.")
            if self.email_backend == "console":
                raise ValueError("EMAIL_BACKEND=smtp est obligatoire en production.")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def model_fast(self) -> str:
        return self.llm_model_fast or DEFAULT_MODELS[self.llm_provider][0]

    @property
    def model_smart(self) -> str:
        return self.llm_model_smart or DEFAULT_MODELS[self.llm_provider][1]

    @property
    def llm_api_key(self) -> str | None:
        return {
            "openrouter": self.openrouter_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "google": self.google_api_key,
            "none": None,
        }[self.llm_provider]

    @property
    def llm_enabled(self) -> bool:
        return self.llm_provider != "none" and bool(self.llm_api_key)

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def paytech_enabled(self) -> bool:
        return bool(self.paytech_api_key and self.paytech_api_secret)

    @property
    def whatsapp_ready(self) -> bool:
        return self.whatsapp_enabled and bool(self.whatsapp_token and self.whatsapp_phone_number_id)


@lru_cache
def get_settings() -> Settings:
    return Settings()
