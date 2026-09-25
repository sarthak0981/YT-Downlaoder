import time
import asyncio
import logging
from pathlib import Path
from ..config import DOWNLOADS_DIR, FILE_EXPIRY_MINUTES, CLEANUP_INTERVAL_SECONDS
from .downloader import task_storage

logger = logging.getLogger(__name__)

async def start_cleanup_loop():
    """Background task to remove old download files and memory task records."""
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            now = time.time()
            max_age_seconds = FILE_EXPIRY_MINUTES * 60

            # Scan downloads folder
            if DOWNLOADS_DIR.exists():
                for item in DOWNLOADS_DIR.iterdir():
                    if item.is_file():
                        file_age = now - item.stat().st_mtime
                        if file_age > max_age_seconds:
                            try:
                                item.unlink(missing_ok=True)
                                logger.info(f"Cleaned up expired file: {item.name}")
                            except Exception as e:
                                logger.error(f"Failed to delete {item.name}: {e}")

            # Clean memory task records
            stale_tasks = []
            for tid, tinfo in task_storage.items():
                if tinfo.get('status') in ['completed', 'failed']:
                    fpath = tinfo.get('file_path')
                    if fpath and not Path(fpath).exists():
                        stale_tasks.append(tid)
            for tid in stale_tasks:
                task_storage.pop(tid, None)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in cleanup loop: {e}")
