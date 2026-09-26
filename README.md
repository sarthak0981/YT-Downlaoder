# 🎬 TubeHarvest Pro

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green?logo=fastapi)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![FFmpeg](https://img.shields.io/badge/FFmpeg-9.0+-red?logo=ffmpeg)

**A professional, production-ready web application to fetch, preview, and download YouTube videos in maximum available resolution (up to 8K/4K/1080p), convert to studio audio, and clip custom timestamp segments with a single click.**

[Features](#-key-features) • [Quickstart](#-local-installation--running) • [Docker](#-docker-deployment) • [Push to GitHub](#-how-to-push-to-github) • [Cloud Hosting](#-hosting--deployment-guide) • [API](#-api-endpoints)

</div>

---

## ✨ Key Features

- 🚀 **No Resolution Cap (Max Available Quality)**:
  - Fetches and lists all resolutions available on the video: **8K (4320p)**, **4K UHD (2160p)**, **2K QHD (1440p)**, **1080p 60fps**, **720p HD**, down to 360p.
  - Automatically merges video streams with high-bitrate DASH audio streams using **FFmpeg**.
- 🎵 **Audio Extraction Mode**:
  - Download as **MP3 (320 kbps High Quality)**, **MP3 (192 kbps)**, **M4A / AAC (Lossless transfer from YouTube)**, **WAV (Lossless Studio)**, or **FLAC**.
- ✂️ **Frame-Accurate Timestamp Trimming (Clipping)**:
  - Select any segment of the video (e.g. `00:01:15` to `00:02:45`) using manual `HH:MM:SS` inputs or an interactive dual-range slider.
  - Quick presets: *First 30s*, *First 1 Min*, *First 5 Min*, or *Full Video*.
  - Saves bandwidth and processing time by extracting only the requested segment.
- 💾 **Direct 1-Click Browser Download**:
  - Streams the completed file straight to the user's computer via browser download prompt.
- ⚡ **Real-Time Progress Tracking (SSE)**:
  - Live animated progress bar showing percent completion, download speed (`MB/s`), time remaining (`ETA`), and processing stages.
- 🕒 **Recent Download History**:
  - In-browser local storage history of recent downloads with one-click re-download.
- 🧹 **Automatic Server Cleanup**:
  - Background task automatically purges processed files older than 30 minutes to preserve disk storage.
- 🐳 **Self-Hosting & Docker Ready**:
  - Pre-configured `Dockerfile`, `docker-compose.yml`, and `render.yaml` for instant deployment.

---

## 🛠️ Architecture & Tech Stack

```
tubeharvest-pro/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI server, static file mounting, CORS
│   │   ├── config.py            # Global paths, expiration times & settings
│   │   ├── routes/
│   │   │   └── api.py           # REST & SSE endpoints (/api/info, /api/download, etc.)
│   │   ├── services/
│   │   │   ├── youtube.py       # yt-dlp format extraction (uncapped resolutions)
│   │   │   ├── downloader.py    # Async download, FFmpeg stream merge & trimming
│   │   │   └── cleaner.py       # Background cleanup daemon for old files
│   │   └── utils/
│   │       └── time_format.py   # Timestamp & byte calculation utilities
├── frontend/
│   ├── index.html               # Sleek responsive dark-mode UI
│   ├── css/style.css            # Custom glassmorphism styles, glowing accents
│   └── js/
│       ├── app.js               # Frontend controller, slider & SSE progress
│       └── utils.js             # Client formatters
├── downloads/                   # Temporary directory for generated files
├── Dockerfile                   # Production Docker container (Python 3.12 + FFmpeg)
├── docker-compose.yml           # Multi-platform 1-click Docker Compose config
├── render.yaml                  # 1-click deployment blueprint for Render
├── run.bat / run.sh             # 1-click local launch scripts
├── requirements.txt             # Python dependencies
└── README.md                    # Documentation
```

---

## 🚀 Local Installation & Running

### Prerequisites
- **Python 3.10+** (or **uv**)
- **FFmpeg** installed on your system:
  - **Windows**: `winget install Gyan.FFmpeg.Essentials`
  - **macOS**: `brew install ffmpeg`
  - **Linux (Ubuntu/Debian)**: `sudo apt update && sudo apt install -y ffmpeg`

### Quickstart (Windows)
Double-click `run.bat` or run:
```powershell
uv venv
uv pip install -r requirements.txt
uv run main.py
```
*(Or use standard python: `python -m venv .venv; .venv\Scripts\activate; pip install -r requirements.txt; python main.py`)*

### Quickstart (macOS / Linux)
```bash
chmod +x run.sh
./run.sh
```

Now open **http://localhost:8000** in your browser!

---

## 🐳 Docker Deployment

You can run TubeHarvest Pro with a single command without installing Python or FFmpeg manually:

```bash
docker compose up --build -d
```
Access the application at `http://localhost:8000`.

To stop the container:
```bash
docker compose down
```

---

## 📦 How to Push to GitHub

1. **Initialize Git in the project directory**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: TubeHarvest Pro application"
   git branch -M main
   ```

2. **Create a new repository on GitHub** (e.g. `https://github.com/your-username/tubeharvest-pro`).

3. **Link and push**:
   ```bash
   git remote add origin https://github.com/your-username/tubeharvest-pro.git
   git push -u origin main
   ```

---

## 🌐 Hosting & Deployment Guide

TubeHarvest Pro can be hosted on any cloud provider that supports Docker containers:

### 1. Render.com (Recommended Free/Cheap Option)
1. Go to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Connect your GitHub repository: `sarthak0981/YT-Downlaoder`.
4. Render will automatically detect `render.yaml` and `Dockerfile`.
5. Set the instance type to **Free** or **Starter**.
6. *(Optional but Recommended for Cloud Hosts)* **Bypass YouTube Bot Verification / Datacenter IP restrictions**:
   - YouTube frequently challenges cloud datacenter IPs (Render, AWS) with *"Sign in to confirm you're not a bot"*.
   - The app comes with **built-in automatic mobile client spoofing (`ios`/`android`)** that bypasses this automatically.
   - For maximum compatibility across all videos and 4K resolutions, export cookies using the browser extension [Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) from your YouTube session.
   - In Render Dashboard under **Environment Variables**, add:
     - **Key**: `YOUTUBE_COOKIES`
     - **Value**: *(Paste your exported Netscape cookies text)*
   - The app will automatically load your cookies securely without committing them to Git!
7. Click **Deploy**. Your app is live!

### 2. Railway.app
1. Go to [Railway](https://railway.app) and create a **New Project**.
2. Select **Deploy from GitHub repo** and choose your repository.
3. Railway automatically detects the `Dockerfile` and deploys it.

### 3. Fly.io
```bash
fly launch
fly deploy
```

### 4. Self-Hosted VPS (Ubuntu/Debian)
1. Install Docker and Docker Compose on your server:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose
   ```
2. Clone your repo:
   ```bash
   git clone https://github.com/your-username/tubeharvest-pro.git
   cd tubeharvest-pro
   ```
3. Run with Docker Compose:
   ```bash
   docker compose up -d --build
   ```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `POST` | `/api/info` | Fetches video details, thumbnails, and available resolutions |
| `POST` | `/api/download` | Initiates an asynchronous download/clip task |
| `GET` | `/api/progress/{task_id}` | Real-time Server-Sent Events (SSE) progress stream |
| `GET` | `/api/file/{task_id}` | Streams the completed media file to the browser |

---

## 📄 License

This project is licensed under the MIT License. TubeHarvest Pro is intended for educational, personal, and lawful usage adhering to YouTube's Terms of Service.
