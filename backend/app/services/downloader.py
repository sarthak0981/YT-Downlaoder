import os
import re
import uuid
import asyncio
import logging
import shutil
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
    clean = re.sub(r'[\'\"\\/*?:"<>|]', "", name)
    clean = clean.strip()
    return clean[:100] if len(clean) > 100 else (clean or "download")

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
        cls.update_task(task_id, status='processing', stage='Connecting to stream server...', progress=5.0)
        
        output_template = str(DOWNLOADS_DIR / f"{task_id}_%(title).100s.%(ext)s")

        # Track multi-stream DASH progress monotonically
        # For video with separate audio: stream 1 (video) = 5% to 70%, stream 2 (audio) = 70% to 90%
        # For audio-only: stream 1 = 5% to 85%
        is_dash_video = (download_type == "video")
        stream_index = 1

        def progress_hook(d):
            nonlocal stream_index
            if d['status'] == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes') or 0
                
                pct = 0.0
                if total > 0:
                    pct = (downloaded / total) * 100.0
                elif '_percent_str' in d:
                    try:
                        clean_pct = re.sub(r'[^0-9.]', '', d['_percent_str'])
                        pct = float(clean_pct)
                    except ValueError:
                        pct = 50.0

                pct = max(0.0, min(100.0, pct))
                speed = d.get('speed') or 0
                speed_str = f"{format_bytes(int(speed))}/s" if speed else d.get('_speed_str', '--/s')
                eta_str = d.get('_eta_str') or (f"{d.get('eta')}s" if d.get('eta') else '--')

                if is_dash_video:
                    if stream_index == 1:
                        # Video stream portion: 5% -> 70%
                        overall_pct = 5.0 + (pct * 0.65)
                        stage_label = f"Downloading video stream ({pct:.0f}%)..."
                    else:
                        # Audio stream portion: 70% -> 90%
                        overall_pct = 70.0 + (pct * 0.20)
                        stage_label = f"Downloading audio stream ({pct:.0f}%)..."
                else:
                    # Audio-only stream: 5% -> 85%
                    overall_pct = 5.0 + (pct * 0.80)
                    stage_label = f"Downloading audio stream ({pct:.0f}%)..."

                cls.update_task(
                    task_id,
                    status='downloading',
                    progress=round(overall_pct, 1),
                    speed=speed_str,
                    eta=eta_str,
                    stage=stage_label
                )
            elif d['status'] == 'finished':
                if is_dash_video and stream_index == 1:
                    stream_index = 2
                    cls.update_task(
                        task_id,
                        status='downloading',
                        progress=70.0,
                        stage="Video stream downloaded. Downloading audio stream..."
                    )
                else:
                    cls.update_task(
                        task_id,
                        status='processing',
                        progress=90.0,
                        stage="Finalizing stream with FFmpeg..."
                    )

        def postprocessor_hook(d):
            status = d.get('status')
            if status == 'started':
                cls.update_task(
                    task_id,
                    status='processing',
                    progress=94.0,
                    stage="Converting & muxing audio/video with FFmpeg..."
                )
            elif status == 'finished':
                cls.update_task(
                    task_id,
                    status='processing',
                    progress=98.0,
                    stage="Packaging output media file..."
                )

        ydl_opts: Dict[str, Any] = {
            'outtmpl': output_template,
            'progress_hooks': [progress_hook],
            'postprocessor_hooks': [postprocessor_hook],
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 30,
            'concurrent_fragment_downloads': 5,
        }
        
        if shutil.which('node'):
            ydl_opts['js_runtimes'] = {'node': {}}

        # Configure Clipping / Section Download
        is_clipped = (start_time is not None or end_time is not None)
        if is_clipped:
            s_time = start_time if start_time is not None else 0.0
            e_time = end_time if end_time is not None else "inf"
            ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, [(s_time, e_time)])
            ydl_opts['force_keyframes_at_cuts'] = False

        target_ext = "mp4"

        # Video vs Audio Mode
        if download_type == "video":
            target_ext = format_ext if format_ext in ['mp4', 'mkv', 'webm'] else 'mp4'
            
            # Select resolution without arbitrary limits
            if height:
                format_spec = f"bestvideo[height<={height}][ext={target_ext}]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
            else:
                format_spec = f"bestvideo[ext={target_ext}]+bestaudio[ext=m4a]/bestvideo+bestaudio/best"
                
            ydl_opts['format'] = format_spec
            ydl_opts['merge_output_format'] = target_ext
        else:
            # Audio Mode
            target_ext = format_ext if format_ext in ['mp3', 'm4a', 'wav', 'flac', 'opus', 'aac'] else 'mp3'
            ydl_opts['format'] = 'bestaudio/best'
            
            postprocessor: Dict[str, Any] = {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': target_ext,
            }
            if target_ext == 'mp3':
                clean_bitrate = '320' if '320' in audio_bitrate else '192'
                postprocessor['preferredquality'] = clean_bitrate
                
            ydl_opts['postprocessors'] = [postprocessor]

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info_dict = ydl.extract_info(url, download=True)

            cls.update_task(task_id, stage="Locating output file...", progress=99.0)

            # Locate the generated file with matching prefix
            matching_files = list(DOWNLOADS_DIR.glob(f"{task_id}_*"))
            if not matching_files:
                raise FileNotFoundError("Output file was not generated.")

            # Filter out temporary .part or .ytdl files
            valid_files = [f for f in matching_files if not f.name.endswith(('.part', '.ytdl', '.temp'))]
            
            # Prefer file with target_ext
            target_files = [f for f in valid_files if f.suffix.lower() == f".{target_ext.lower()}"]
            if target_files:
                final_file_path = target_files[0]
            elif valid_files:
                final_file_path = valid_files[0]
            else:
                final_file_path = matching_files[0]

            # Clean up intermediate unneeded files for this task
            for f in matching_files:
                if f != final_file_path:
                    try:
                        f.unlink(missing_ok=True)
                    except Exception:
                        pass

            if not final_file_path.exists():
                raise FileNotFoundError(f"Final file {final_file_path.name} was not found.")

            file_size_bytes = final_file_path.stat().st_size
            clean_name = final_file_path.name.replace(f"{task_id}_", "")

            # If user provided a clip, add timestamp info to display filename
            if is_clipped:
                stem = sanitize_filename(Path(clean_name).stem)
                ext = Path(clean_name).suffix
                s_str = format_seconds(start_time).replace(':', '-') if start_time is not None else "00-00"
                e_str = format_seconds(end_time).replace(':', '-') if end_time is not None else "end"
                clip_tag = f"_[clip_{s_str}_to_{e_str}]"
                clean_name = f"{stem}{clip_tag}{ext}"
            else:
                clean_name = sanitize_filename(Path(clean_name).stem) + Path(clean_name).suffix

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
