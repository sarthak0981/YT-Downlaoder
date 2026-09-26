# TubeHarvest Pro - Production Docker Image
FROM python:3.12-slim

# Prevent Python from writing .pyc and buffer output
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies: FFmpeg is required for DASH stream merging and clipping, nodejs for yt-dlp JS challenges
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    nodejs \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Create downloads folder
RUN mkdir -p downloads downloads/proxies && chmod -R 777 downloads

# Environment defaults
ENV HOST=0.0.0.0
ENV PORT=8000

EXPOSE 8000

# Start FastAPI application with dynamic PORT support for Render
CMD sh -c "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}"
