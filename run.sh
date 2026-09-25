#!/usr/bin/env bash
set -e

echo "===================================================="
echo "          TubeHarvest Pro - Local Launcher          "
echo "===================================================="

if command -v uv &> /dev/null; then
    echo "[INFO] Detected uv package manager."
    if [ ! -d ".venv" ]; then
        echo "[INFO] Creating virtual environment with uv..."
        uv venv .venv
        uv pip install -r requirements.txt
    fi
    echo "[INFO] Starting TubeHarvest Pro..."
    uv run main.py
    exit 0
fi

if command -v python3 &> /dev/null; then
    echo "[INFO] Detected Python 3."
    if [ ! -d ".venv" ]; then
        echo "[INFO] Creating virtual environment..."
        python3 -m venv .venv
        source .venv/bin/activate
        pip install -r requirements.txt
    else
        source .venv/bin/activate
    fi
    echo "[INFO] Starting TubeHarvest Pro..."
    python3 main.py
    exit 0
fi

echo "[ERROR] Python 3 or uv was not found on PATH."
exit 1
