@echo off
setlocal enabledelayedexpansion
title TubeHarvest Pro Launcher

echo ====================================================
echo           TubeHarvest Pro - Local Launcher
echo ====================================================
echo.

:: Ensure python or uv is available
where uv >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Detected uv package manager.
    if not exist .venv (
        echo [INFO] Creating virtual environment with uv...
        uv venv .venv
        uv pip install -r requirements.txt
    )
    echo [INFO] Starting TubeHarvest Pro...
    uv run main.py
    goto end
)

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [INFO] Detected Python.
    if not exist .venv (
        echo [INFO] Creating virtual environment...
        python -m venv .venv
        call .venv\Scripts\activate
        pip install -r requirements.txt
    ) else (
        call .venv\Scripts\activate
    )
    echo [INFO] Starting TubeHarvest Pro...
    python main.py
    goto end
)

echo [ERROR] Neither Python nor uv was found on PATH.
echo Please install Python 3.12 or uv, and FFmpeg.
pause

:end
