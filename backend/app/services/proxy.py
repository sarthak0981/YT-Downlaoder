import os
import shutil
import asyncio
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import yt_dlp

from ..config import BASE_DIR
from ..utils.ytdl_helper import apply_anti_bot_options, sanitize_log

logger = logging.getLogger("proxy_service")

PROXIES_DIR = BASE_DIR / "downloads" / "proxies"
PROXIES_DIR.mkdir(parents=True, exist_ok=True)

# Tracks status of proxy generation: {video_id: {"status": "generating"|"ready"|"failed", "file": Path}}
proxy_status_map: Dict[str, Dict[str, Any]] = {}

class ProxyService:
    @classmethod
    def cleanup_old_proxies(cls, current_video_id: Optional[str] = None):
        """
        Deletes all previous proxy files when a new video is fetched.
        """
        try:
            for item in PROXIES_DIR.glob("*"):
                if item.is_file():
                    # If current_video_id is provided, don't delete current one
                    if current_video_id and current_video_id in item.name:
                        continue
                    try:
                        item.unlink(missing_ok=True)
                        logger.info(f"Cleaned up old proxy file: {item.name}")
                    except Exception as e:
                        logger.warning(f"Could not delete old proxy {item.name}: {e}")
        except Exception as e:
            logger.warning(f"Error during proxy cleanup: {e}")

    @classmethod
    def get_proxy_file(cls, video_id: str) -> Optional[Path]:
        proxy_file = PROXIES_DIR / f"{video_id}.mp4"
        if proxy_file.exists() and proxy_file.stat().st_size > 1000:
            return proxy_file
        return None

    @classmethod
    def get_proxy_status(cls, video_id: str) -> Dict[str, Any]:
        proxy_file = cls.get_proxy_file(video_id)
        if proxy_file:
            return {"ready": True, "video_id": video_id, "url": f"/api/proxy/video/{video_id}"}
        status_info = proxy_status_map.get(video_id, {})
        return {
            "ready": False,
            "status": status_info.get("status", "idle"),
            "video_id": video_id,
            "url": None
        }

    @classmethod
    async def create_proxy_background(cls, video_id: str, url: str):
        """Spawns background proxy generator."""
        proxy_file = cls.get_proxy_file(video_id)
        if proxy_file:
            proxy_status_map[video_id] = {"status": "ready", "file": proxy_file}
            return

        proxy_status_map[video_id] = {"status": "generating", "file": None}
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, cls._generate_proxy_sync, video_id, url)

    @classmethod
    def _generate_proxy_sync(cls, video_id: str, url: str):
        target_file = PROXIES_DIR / f"{video_id}.mp4"
        temp_target = PROXIES_DIR / f"temp_{video_id}.%(ext)s"
        
        ydl_opts: Dict[str, Any] = {
            'outtmpl': str(temp_target),
            'format': 'bestvideo[height<=360]+bestaudio/best[height<=360]/worstvideo+worstaudio/worst',
            'merge_output_format': 'mp4',
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 15,
            'concurrent_fragment_downloads': 5,
        }
        apply_anti_bot_options(ydl_opts)

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])

            # Find generated file
            candidates = list(PROXIES_DIR.glob(f"temp_{video_id}.*"))
            if candidates:
                gen_file = candidates[0]
                if target_file.exists():
                    target_file.unlink(missing_ok=True)
                gen_file.rename(target_file)
                proxy_status_map[video_id] = {"status": "ready", "file": target_file}
                logger.info(f"Successfully generated proxy video for {video_id} ({target_file.stat().st_size} bytes)")
            else:
                proxy_status_map[video_id] = {"status": "failed", "error": "Proxy output missing"}
        except Exception as e:
            clean_err = sanitize_log(str(e))
            logger.warning(f"Failed to generate proxy video for {video_id}: {clean_err}")
            proxy_status_map[video_id] = {"status": "failed", "error": clean_err}
