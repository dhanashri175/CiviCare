from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/final"
    SECRET_KEY: str = "civicare-muni-secret-2025"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    GEMINI_API_KEY: str = ""
    CLOUDINARY_CLOUD: str = "dc3zbx1as"
    CLOUDINARY_PRESET: str = "jalsetu_upload"
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    DATAGOV_API_KEY: str = "YOUR_DATAGOV_API_KEY"  # Get free key from data.gov.in

    class Config:
        env_file = ".env"

settings = Settings()
