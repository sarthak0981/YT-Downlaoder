import os
import re
import uuid
import asyncio
import logging
from typing import Dict, Any, Optional
from pathlib import Path
import yt_dlp

from ..config import DOWNLOADS_DIR
from ..utils.time_format import format_bytes, format_seconds, parse_timestamp

logger = logging.getLogger(__name__)

# In-memory dictionary for task status
task_storage: Dict[str, Dict[str, Any]] = {}

def sanitize_filename(name: str) -> str:
    """Removes invalid characters for file systems across Windows/Linux."""
    clean = re.sub(r'[\\/*?:"<>|]', "", name)
    clean = clean.strip()
    return clean[:100] if len(clean) > 100 else clean

class DownloaderService:
    @staticmethod
    def get_task(task_id: str) -> Optional[Dict[str, Any]]:
        return task_storage.get(task_id)

    @classmethod
    def create_task(cls) -> str:
        task_id = str(uuid.uuid4())
        task_storage[task_id] = {
            'id': task_id,
            'status': 'queued',
            'progress': 0.0,
            'speed': '0 KB/s',
            'eta': '--',
            'stage': 'Initializing download...',
            'filename': None,
            'file_path': None,
            'file_size': None,
            'error': None
        }
        return task_id

    @classmethod
    def update_task(cls, task_id: str, **kwargs):
        if task_id in task_storage:
            task_storage[task_id].update(kwargs)

    @classmethod
    async def start_download(
        cls,
        task_id: str,
        url: str,
        download_type: str = "video",
        height: Optional[int] = None,
        format_ext: str = "mp4",
        audio_bitrate: str = "320k",
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        title: Optional[str] = None
    ):
        """Runs the download asynchronously in a worker thread."""
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            cls._execute_download_sync,
            task_id,
            url,
            download_type,
            height,
            format_ext,
            audio_bitrate,
            start_time,
            end_time,
            title
        )

    @classmethod
    def _execute_download_sync(
        cls,
        task_id: str,
        url: str,
        download_type: str,
        height: Optional[int],
        format_ext: str,
        audio_bitrate: str,
        start_time: Optional[float],
        end_time: Optional[float],
        title: Optional[str]
    ):
        cls.update_task(task_id, status='processing', stage='Connecting to stream server...')
        
        # Prepare file output path
        output_template = str(DOWNLOADS_DIR / f"{task_id}_%(title).100s.%(ext)s")

        def progress_hook(d):
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                
                pct = 0.0
                if total > 0:
                    pct = round((downloaded / total) * 100, 1)
                elif '_percent_str' in d:
                    try:
                        clean_pct = re.sub(r'[^0-9.]', '', d['_percent_str'])
                        pct = float(clean_pct)
                    except ValueError:
                        pct = 50.0

                speed = d.get('speed') or 0
                speed_str = f"{format_bytes(int(speed))}/s" if speed else d.get('_speed_str', '--/s')
                eta_str = d.get('_eta_str') or f"{d.get('eta')}s" if d.get('eta') else '--'

                cls.update_task(
                    task_id,
                    status='downloading',
                    progress=pct,
                    speed=speed_str,
                    eta=eta_str,
                    stage=f"Downloading stream ({pct}%)..."
                )
            elif d['status'] == 'finished':
                cls.update_task(
                    task_id,
                    status='processing',
                    progress=98.0,
                    stage="Merging and finalizing media file with FFmpeg..."
                )

        ydl_opts: Dict[str, Any] = {
            'outtmpl': output_template,
            'progress_hooks': [progress_hook],
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 30,
        }
        import shutil
        if shutil.which('node'):
            ydl_opts['js_runtimes'] = {'node': {}}

        # Handling Sections / Clipping
        if start_time is not None or end_time is not None:
            # yt-dlp download sections
            s_time = start_time if start_time is not None else 0
            e_time = end_time if end_time is not None else "inf"
            ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, [(s_time, e_time)])
            ydl_opts['force_keyframes_at_cuts'] = True

        # Video vs Audio formatting
        if download_type == "video":
            # Target resolution selector
            if height:
                # Up to maximum requested resolution without any cap!
                format_spec = f"bestvideo[height<={height}]+bestaudio/bestvideo[height<={height}]+best/best[height<={height}]/best"
            else:
                # Maximum absolute quality available
                format_spec = "bestvideo+bestaudio/best"
                
            ydl_opts['format'] = format_spec
            ydl_opts['merge_output_format'] = format_ext if format_ext in ['mp4', 'mkv', 'webm'] else 'mp4'
            
            # Postprocessor to ensure container compatibility
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegVideoConvertor',
                'preferedformat': ydl_opts['merge_output_format']
            }]
        else:
            # Audio mode
            audio_codec = format_ext if format_ext in ['mp3', 'm4a', 'wav', 'flac', 'opus', 'aac'] else 'mp3'
            ydl_opts['format'] = 'bestaudio/best'
            
            postprocessor: Dict[str, Any] = {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': audio_codec,
            }
            if audio_codec == 'mp3':
                clean_bitrate = '320' if '320' in audio_bitrate else '192'
                postprocessor['preferredquality'] = clean_bitrate
                
            ydl_opts['postprocessors'] = [postprocessor]

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(url, download=True)
                
            # Locate the generated file
            final_file_path = None
            if info_dict:
                # Find the downloaded file in DOWNLOADS_DIR matching task_id prefix
                matching_files = list(DOWNLOADS_DIR.glob(f"{task_id}_*"))
                if matching_files:
                    # Pick newest or largest
                    final_file_path = max(matching_files, key=lambda f: f.stat().st_size)

            if not final_file_path or not final_file_path.exists():
                raise FileNotFoundError("Output file was not generated properly.")

            file_size_bytes = final_file_path.stat().st_size
            clean_name = final_file_path.name.replace(f"{task_id}_", "")

            # If user provided a clip, add timestamp info to display filename
            if start_time is not None or end_time is not None:
                stem = Path(clean_name).stem
                ext = Path(clean_name).suffix
                clip_tag = f"_[clip_{format_seconds(start_time).replace(':', '-')}_to_{format_seconds(end_time).replace(':', '-')}]"
                clean_name = f"{stem}{clip_tag}{ext}"

            cls.update_task(
                task_id,
                status='completed',
                progress=100.0,
                stage="Completed! Ready for download.",
                file_path=str(final_file_path),
                filename=clean_name,
                file_size=format_bytes(file_size_bytes)
            )

        except Exception as e:
            logger.exception("Error executing download:")
            cls.update_task(
                task_id,
                status='failed',
                stage='Failed to process video',
                error=str(e)
            )
