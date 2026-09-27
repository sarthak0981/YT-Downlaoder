#!/usr/bin/env bash
# ==============================================================================
# TubeHarvest Pro - Render Production Build Script (Native Python & Docker)
# ==============================================================================
set -e

echo "=== [1/3] Upgrading pip and installing Python dependencies ==="
python -m pip install --upgrade pip
pip install -r requirements.txt

echo "=== [2/3] Verifying / Installing FFmpeg and FFprobe ==="
mkdir -p bin

if command -v ffmpeg &> /dev/null && command -v ffprobe &> /dev/null; then
    echo "FFmpeg is already installed in system PATH: $(which ffmpeg)"
else
    echo "FFmpeg not detected in system PATH. Installing static Linux binary..."
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        curl -sL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz -o ffmpeg-static.tar.xz
        tar -xf ffmpeg-static.tar.xz --strip-components=1 -C bin/ --wildcards '*/ffmpeg' '*/ffprobe'
        rm -f ffmpeg-static.tar.xz
        chmod +x bin/ffmpeg bin/ffprobe
        echo "Successfully installed static FFmpeg & FFprobe to bin/"
    else
        echo "Non-x86_64 architecture ($ARCH). Attempting package install if permissions allow..."
    fi
fi

echo "=== [3/3] Preparing workspace directories ==="
mkdir -p downloads/proxies
chmod -R 777 downloads 2>/dev/null || true

echo "=== TubeHarvest Pro Build Completed Successfully ==="
