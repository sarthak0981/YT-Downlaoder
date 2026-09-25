import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .config import FRONTEND_DIR, APP_NAME, APP_VERSION
from .routes.api import router as api_router
from .services.cleaner import start_cleanup_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start the background cleanup task
    cleanup_task = asyncio.create_task(start_cleanup_loop())
    yield
    # Shutdown: Cancel cleanup
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="Professional YouTube Video & Audio Downloader with resolution selection up to 8K/4K and timestamp clipping",
    lifespan=lifespan
)

# Enable CORS for cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Router
app.include_router(api_router)

# Mount Frontend static files
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

@app.get("/")
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return {"message": f"{APP_NAME} Backend API is running. Access /api/health or check frontend."}
