from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://phongtro:phongtro@localhost:5432/phongtro"
    jwt_secret: str = "dev-secret"
    cors_origins: str = "http://localhost:3000"
    crawler_enabled: bool = True
    crawler_interval_minutes: int = 60

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
