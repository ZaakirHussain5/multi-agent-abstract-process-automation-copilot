"""Runtime configuration. Meta's Model API is the intended provider.

Public docs for Muse may not match a stable URL yet, so the adapter speaks
the OpenAI-compatible chat and images endpoints and reads every address from
the environment.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "mock"
    llm_base_url: str = "https://api.meta.com/v1"
    llm_api_key: str = ""
    muse_spark_model: str = "muse-spark"
    muse_code_model: str = "muse-code"
    muse_image_model: str = "muse-image"
    llm_timeout_seconds: float = 90
    data_dir: str = "./data"
    host: str = "127.0.0.1"
    port: int = 8000

    def model_name(self, hint: str) -> str:
        table = {
            "spark": self.muse_spark_model,
            "code": self.muse_code_model,
            "image": self.muse_image_model,
            "general": self.muse_spark_model,
        }
        return table.get(hint, self.muse_spark_model)

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).resolve()


def load_settings() -> Settings:
    return Settings()
