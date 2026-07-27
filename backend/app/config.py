import os
from pathlib import Path
from dotenv import load_dotenv

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
REPO_ROOT = BACKEND_DIR.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
DATA_DIR = BACKEND_DIR / "data"

load_dotenv(BACKEND_DIR / ".env")


class Config:
    SECRET_KEY = os.environ.get("FLASK_SECRET_KEY", "dev-only-change-me")
    GROQ_API_KEY = os.environ.get("GROQ_API_KEY")
    SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_EMAIL = os.environ.get("SMTP_EMAIL")
    SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
    MAX_PAGES = int(os.environ.get("WEB_MAX_PAGES", "6"))
    SKIP_TESTS = os.environ.get("WEB_SKIP_TESTS", "false").lower() == "true"
