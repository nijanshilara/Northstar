"""Application configuration — reads from environment variables / .env file."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./travel_guide.db"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    DEBUG: bool = True

    # JWT token lifetimes
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    # AI / LLM
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-3.8-flash"
    OPENAI_MODEL: str = "gpt-4o-mini"

    # Weather (Open-Meteo is free and needs no key)
    OPEN_METEO_BASE_URL: str = "https://api.open-meteo.com/v1"
    WEATHER_API_KEY: str = ""

    # Flights (Amadeus)
    AMADEUS_CLIENT_ID: str = ""
    AMADEUS_CLIENT_SECRET: str = ""
    AMADEUS_BASE_URL: str = "https://test.api.amadeus.com"

    # Maps
    GOOGLE_MAPS_API_KEY: str = ""
    OPENROUTESERVICE_API_KEY: str = ""

    # Places
    FOURSQUARE_API_KEY: str = ""

    # Currency
    EXCHANGE_RATE_API_KEY: str = ""

    # Email / SMTP (optional — if blank, dev mode is used for auth emails)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""

    # ---------------------------------------------------------------------------
    # Derived helpers
    # ---------------------------------------------------------------------------

    @property
    def is_ai_live(self) -> bool:
        """True when a real LLM provider key (Gemini or OpenAI) is configured."""
        return bool(self.GEMINI_API_KEY or self.OPENAI_API_KEY)

    @property
    def is_weather_live(self) -> bool:
        """Open-Meteo is a free public API requiring no API key."""
        return True

    @property
    def is_amadeus_live(self) -> bool:
        """True when Amadeus API credentials are configured."""
        return bool(self.AMADEUS_CLIENT_ID and self.AMADEUS_CLIENT_SECRET)

    @property
    def demo_mode(self) -> bool:
        """True when no AI or travel API keys are configured."""
        return not any([
            self.OPENAI_API_KEY,
            self.GEMINI_API_KEY,
            self.AMADEUS_CLIENT_ID,
            self.GOOGLE_MAPS_API_KEY,
        ])

    model_config = {
        "env_file": (".env", "backend/.env", "../.env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
