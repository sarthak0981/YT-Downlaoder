import os
import json
import asyncio
from typing import Optional, Union
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..services.youtube import YouTubeService
from ..services.downloader import DownloaderService
from ..utils.time_format import parse_timestamp

router = APIRouter(prefix="/api")

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    type: str = Field(default="video", description="'video' or 'audio'")
    height: Optional[int] = Field(default=None, description="Video resolution height (e.g. 2160, 1440, 1080, 720)")
    format: str = Field(default="mp4", description="Output container format (mp4, mkv, webm, mp3, m4a, wav, flac)")
    audio_bitrate: str = Field(default="320k", description="Audio bitrate or quality (320k, 192k, best)")
    start_time: Optional[Union[str, float, int]] = Field(default=None, description="Start timestamp (HH:MM:SS, MM:SS, or seconds)")
    end_time: Optional[Union[str, float, int]] = Field(default=None, description="End timestamp (HH:MM:SS, MM:SS, or seconds)")
    title: Optional[str] = None

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "yt-downloader-pro"}

@router.post("/info")
def get_video_info(req: InfoRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="YouTube URL is required.")
        
    try:
        info = YouTubeService.get_video_info(req.url.strip())
        return info
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.post("/download")
async def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="YouTube URL is required.")
        
    # Parse timestamps if provided
    start_sec = parse_timestamp(req.start_time)
    end_sec = parse_timestamp(req.end_time)

    if start_sec is not None and end_sec is not None:
        if start_sec >= end_sec:
            raise HTTPException(status_code=400, detail="Start time must be strictly before end time.")

    # Create tracking task
    task_id = DownloaderService.create_task()

    # Trigger background download
    background_tasks.add_task(
        DownloaderService.start_download,
        task_id=task_id,
        url=req.url.strip(),
        download_type=req.type.lower(),
        height=req.height,
        format_ext=req.format.lower(),
        audio_bitrate=req.audio_bitrate,
        start_time=start_sec,
        end_time=end_sec,
        title=req.title
    )

    return {
        "task_id": task_id,
        "status": "queued",
        "progress_url": f"/api/progress/{task_id}",
        "file_url": f"/api/file/{task_id}"
    }

@router.get("/task/{task_id}")
def get_task_status(task_id: str):
    task = DownloaderService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task

@router.get("/progress/{task_id}")
async def stream_progress(task_id: str):
    """Server-Sent Events (SSE) endpoint to stream download progress to frontend."""
    async def event_generator():
        last_pct = -1
        while True:
            task = DownloaderService.get_task(task_id)
            if not task:
                yield {
                    "event": "error",
                    "data": json.dumps({"error": "Task not found"})
                }
                break

            status = task.get("status")
            yield {
                "event": "progress",
                "data": json.dumps(task)
            }

            if status in ["completed", "failed"]:
                break

            await asyncio.sleep(0.5)

    return EventSourceResponse(event_generator())

@router.get("/file/{task_id}")
def serve_downloaded_file(task_id: str):
    """Serves the final file for direct browser download to user's computer."""
    task = DownloaderService.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Download task not found or has expired.")
        
    if task.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"File not ready. Current status: {task.get('status')}")

    file_path = task.get("file_path")
    filename = task.get("filename") or "download.mp4"

    if not file_path or not Path(file_path).exists():
        raise HTTPException(status_code=404, detail="The requested file was not found on the server.")

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )
