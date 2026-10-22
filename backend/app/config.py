from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://phongtro:phongtro@localhost:5432/phongtro"
    jwt_secret: str = "dev-secret"
    cors_origins: str = "http://localhost:3000"
    crawler_interval_minutes: int = 120
    crawler_backfill_interval_hours: int = 6
    crawler_refresh_interval_hours: int = 24
    frontend_url: str = "http://localhost:3000"
    brevo_api_key: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Phòng Trọ Map"
    smtp_use_tls: bool = True

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
