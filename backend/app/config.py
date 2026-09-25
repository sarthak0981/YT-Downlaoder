import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
FRONTEND_DIR = BASE_DIR / "frontend"

# Ensure directories exist
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

# App Settings
APP_NAME = "TubeHarvest Pro"
APP_VERSION = "1.0.0"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Cleanup Settings
FILE_EXPIRY_MINUTES = int(os.getenv("FILE_EXPIRY_MINUTES", "30"))
CLEANUP_INTERVAL_SECONDS = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "300"))

# Max concurrent downloads
MAX_CONCURRENT_DOWNLOADS = int(os.getenv("MAX_CONCURRENT_DOWNLOADS", "5"))
