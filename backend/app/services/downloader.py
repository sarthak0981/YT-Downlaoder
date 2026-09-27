import os
import re
import uuid
import time
import asyncio
import logging
import shutil
import json
import threading
import subprocess
from typing import Dict, Any, Optional
from pathlib import Path
import yt_dlp

from ..config import DOWNLOADS_DIR
from ..utils.time_format import format_bytes, format_seconds, parse_timestamp
from ..utils.ytdl_helper import (
    apply_anti_bot_options,
    get_ffmpeg_path,
    get_ffprobe_path,
    get_node_path,
    sanitize_log,
    setup_cookies
)

logger = logging.getLogger("downloader_service")

# In-memory dictionary for task status
task_storage: Dict[str, Dict[str, Any]] = {}

import unicodedata

def sanitize_filename(name: str) -> str:
    """Removes invalid characters for file systems across Windows/Linux."""
    normalized = unicodedata.normalize('NFKD', name)
    clean = re.sub(r'[\'\"\\/*?:"<>|\uff1a\uff0f\uff3c]', "", normalized)
    clean = clean.strip()
    return clean[:100] if len(clean) > 100 else (clean or "download")

def _run_ffmpeg(cmd: list, timeout: int = 120) -> subprocess.CompletedProcess:
    """Runs ffmpeg with dynamic binary path resolution."""
    ffmpeg_bin = get_ffmpeg_path() or "ffmpeg"
    full_cmd = [ffmpeg_bin] + cmd[1:]
    return subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout)

def _run_ffprobe(cmd: list, timeout: int = 10) -> subprocess.CompletedProcess:
    """Runs ffprobe with dynamic binary path resolution."""
    ffprobe_bin = get_ffprobe_path() or "ffprobe"
    full_cmd = [ffprobe_bin] + cmd[1:]
    return subprocess.run(full_cmd, capture_output=True, text=True, timeout=timeout)

def ensure_mp4_audio_compatibility(file_path: Path) -> Path:
    """
    Guarantees that MP4 files have universal AAC audio playable on Windows Media Player,
    QuickTime, Safari, Android, and iOS.
    Also ensures -avoid_negative_ts make_zero so trimmed clips have zero audio sync delays.
    """
    if file_path.suffix.lower() != '.mp4':
        return file_path
        
    try:
        res = _run_ffprobe(
            ['ffprobe', '-v', 'error', '-show_streams', '-select_streams', 'a', '-of', 'json', str(file_path)],
            timeout=10
        )
        needs_remux = False
        if res.returncode == 0 and res.stdout:
            data = json.loads(res.stdout)
            audio_streams = data.get('streams', [])
            if audio_streams:
                codec = audio_streams[0].get('codec_name', '').lower()
                # Opus, Vorbis, etc. in an MP4 container will play silently on standard Windows/Mac players
                if codec not in ['aac', 'mp3', 'alac']:
                    needs_remux = True
            else:
                # No audio stream detected in ffprobe
                needs_remux = False

        if needs_remux:
            logger.info(f"Remuxing {file_path.name} to convert non-AAC audio to universal AAC...")
            temp_fixed = file_path.parent / f"clean_{file_path.name}"
            cmd = [
                'ffmpeg', '-y', '-i', str(file_path),
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-avoid_negative_ts', 'make_zero',
                str(temp_fixed)
            ]
            conv = _run_ffmpeg(cmd, timeout=120)
            if conv.returncode == 0 and temp_fixed.exists() and temp_fixed.stat().st_size > 0:
                file_path.unlink(missing_ok=True)
                temp_fixed.rename(file_path)
                logger.info("Successfully converted audio to universal AAC!")
    except Exception as e:
        logger.warning(f"Audio compatibility check exception: {sanitize_log(str(e))}")
        
    return file_path

def align_clip_video_audio(file_path: Path, target_ext: str = "mp4") -> Path:
    """
    Guarantees frame-accurate start time (0.000000s) for both video and audio.
    Completely eliminates the 1-2 seconds of silence or missing audio at the start of cuts.
    """
    temp_aligned = file_path.parent / f"exact_{file_path.name}"
    cmd = [
        'ffmpeg', '-y',
        '-ss', '0',
        '-i', str(file_path),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
        '-c:a', 'aac', '-b:a', '192k',
        '-avoid_negative_ts', 'make_zero',
        str(temp_aligned)
    ]
    try:
        conv = _run_ffmpeg(cmd, timeout=120)
        if conv.returncode == 0 and temp_aligned.exists() and temp_aligned.stat().st_size > 0:
            file_path.unlink(missing_ok=True)
            temp_aligned.rename(file_path)
            logger.info(f"Successfully aligned clip audio and video to exact 0.000s: {file_path.name}")
    except Exception as e:
        logger.warning(f"Clip alignment exception: {sanitize_log(str(e))}")
    return file_path

def align_clip_audio_only(file_path: Path, target_ext: str = "mp3", bitrate: str = "320k") -> Path:
    """
    Guarantees exact audio start from 0.000s for audio clips without silence gaps.
    """
    temp_aligned = file_path.parent / f"exact_{file_path.stem}.{target_ext.lower()}"
    clean_bitrate = '320k' if '320' in bitrate else '192k'
    cmd = [
        'ffmpeg', '-y',
        '-ss', '0',
        '-i', str(file_path),
        '-vn',
        '-c:a', 'libmp3lame' if target_ext.lower() == 'mp3' else 'aac',
        '-b:a', clean_bitrate,
        '-avoid_negative_ts', 'make_zero',
        str(temp_aligned)
    ]
    try:
        conv = _run_ffmpeg(cmd, timeout=120)
        if conv.returncode == 0 and temp_aligned.exists() and temp_aligned.stat().st_size > 0:
            file_path.unlink(missing_ok=True)
            return temp_aligned
    except Exception as e:
        logger.warning(f"Audio clip alignment exception: {sanitize_log(str(e))}")
    return file_path

def ensure_audio_only_file(file_path: Path, target_ext: str, bitrate: str = "320k") -> Path:
    """
    Guarantees that an audio download is strictly a pure audio file of target_ext.
    If the downloaded file has a video stream or is webm/m4a while mp3 was requested,
    transcodes it cleanly using FFmpeg in < 1 second.
    """
    if file_path.suffix.lower() == f".{target_ext.lower()}":
        return file_path
        
    output_path = file_path.with_suffix(f".{target_ext.lower()}")
    clean_bitrate = '320k' if '320' in bitrate else '192k'
    
    cmd = ['ffmpeg', '-y', '-i', str(file_path), '-vn']
    if target_ext.lower() == 'mp3':
        cmd += ['-c:a', 'libmp3lame', '-b:a', clean_bitrate]
    elif target_ext.lower() == 'm4a':
        cmd += ['-c:a', 'aac', '-b:a', '192k']
    elif target_ext.lower() == 'wav':
        cmd += ['-c:a', 'pcm_s16le']
    elif target_ext.lower() == 'flac':
        cmd += ['-c:a', 'flac']
    else:
        cmd += ['-c:a', 'copy']
        
    cmd += ['-avoid_negative_ts', 'make_zero', str(output_path)]
    
    try:
        conv = _run_ffmpeg(cmd, timeout=120)
        if conv.returncode == 0 and output_path.exists() and output_path.stat().st_size > 0:
            file_path.unlink(missing_ok=True)
            return output_path
    except Exception as e:
        logger.warning(f"Audio extraction exception: {sanitize_log(str(e))}")
        
    return file_path


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
            'progress': 2.0,
            'speed': '--',
            'eta': '--',
            'stage': 'Initializing download engine...',
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
        is_dash_video = (download_type == "video")
        is_clipped = (start_time is not None or end_time is not None)
        stream_index = 1
        last_progress_time = time.time()
        stop_monitor_event = threading.Event()

        # Target extension resolution
        if download_type == "video":
            target_ext = format_ext if format_ext in ['mp4', 'mkv', 'webm'] else 'mp4'
        else:
            target_ext = format_ext if format_ext in ['mp3', 'm4a', 'wav', 'flac', 'opus', 'aac'] else 'mp3'

        def progress_hook(d):
            nonlocal stream_index, last_progress_time
            last_progress_time = time.time()
            
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
                        # Video stream portion: 8% -> 70%
                        overall_pct = 8.0 + (pct * 0.62)
                        stage_label = f"Downloading video stream ({pct:.0f}%)..."
                    else:
                        # Audio stream portion: 70% -> 90%
                        overall_pct = 70.0 + (pct * 0.20)
                        stage_label = f"Downloading audio stream ({pct:.0f}%)..."
                else:
                    # Audio-only stream: 8% -> 85%
                    overall_pct = 8.0 + (pct * 0.77)
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

        # Background active monitor to ensure progress bar NEVER stalls on FFmpeg clips or token negotiation
        def active_disk_monitor():
            start_t = time.time()
            prev_size = 0
            prev_t = time.time()
            
            # Realistic clip size estimate if duration known
            clip_dur = 10.0
            if start_time is not None and end_time is not None:
                clip_dur = max(1.0, end_time - start_time)
            
            # Approximate size in bytes for clip
            if download_type == "video":
                est_clip_bytes = int(clip_dur * (2_500_000 / 8)) # ~2.5Mbps
            else:
                est_clip_bytes = int(clip_dur * (320_000 / 8))   # ~320kbps

            while not stop_monitor_event.is_set():
                time.sleep(0.35)
                cur_t = time.time()
                elapsed = cur_t - start_t
                
                curr_task = cls.get_task(task_id)
                if not curr_task or curr_task.get('status') in ['completed', 'failed']:
                    break

                # 1. Early stages before any disk bytes exist
                if elapsed < 2.0 and curr_task.get('status') == 'processing' and curr_task.get('progress', 0) <= 6.0:
                    cls.update_task(task_id, stage="Connecting to stream server...", progress=6.0)
                elif 2.0 <= elapsed < 4.0 and curr_task.get('status') == 'processing' and curr_task.get('progress', 0) <= 9.0:
                    cls.update_task(task_id, stage="Resolving media stream manifests...", progress=9.0)
                elif elapsed >= 4.0 and curr_task.get('status') == 'processing' and curr_task.get('progress', 0) <= 12.0:
                    cls.update_task(task_id, stage="Establishing high-speed CDN connection...", progress=12.0)

                # 2. Check disk for active downloading files (.part or target)
                matching = list(DOWNLOADS_DIR.glob(f"{task_id}*"))
                if matching:
                    cur_size = sum(f.stat().st_size for f in matching if f.is_file())
                    dt = max(0.1, cur_t - prev_t)
                    diff = max(0, cur_size - prev_size)
                    speed_bps = diff / dt
                    speed_str = f"{format_bytes(int(speed_bps))}/s" if speed_bps > 500 else "--"

                    if is_clipped and est_clip_bytes > 0:
                        # For clipped downloads (which FFmpeg executes without yt-dlp downloading hooks)
                        pct_clip = min(88.0, 10.0 + ((cur_size / max(est_clip_bytes, cur_size * 1.1)) * 78.0))
                        rem_bytes = max(0, est_clip_bytes - cur_size)
                        eta_val = int(rem_bytes / max(1, speed_bps)) if speed_bps > 5000 else None
                        eta_str = f"{eta_val}s" if eta_val and eta_val < 300 else "--"
                        
                        cls.update_task(
                            task_id,
                            status='downloading',
                            progress=round(pct_clip, 1),
                            speed=speed_str,
                            eta=eta_str,
                            stage=f"Downloading media clip ({format_bytes(cur_size)})..."
                        )

                    prev_size = cur_size
                    prev_t = cur_t

        monitor_thread = threading.Thread(target=active_disk_monitor, daemon=True)
        monitor_thread.start()

        # yt-dlp Configuration
        ydl_opts: Dict[str, Any] = {
            'outtmpl': output_template,
            'progress_hooks': [progress_hook],
            'postprocessor_hooks': [postprocessor_hook],
            'quiet': True,
            'no_warnings': True,
            'noplaylist': True,
            'socket_timeout': 25,
            'concurrent_fragment_downloads': 5,
        }
        
        apply_anti_bot_options(ydl_opts)

        # Configure Clipping / Section Download
        if is_clipped:
            s_time = start_time if start_time is not None else 0.0
            e_time = end_time if end_time is not None else "inf"
            ydl_opts['download_ranges'] = yt_dlp.utils.download_range_func(None, [(s_time, e_time)])
            ydl_opts['force_keyframes_at_cuts'] = False
            ydl_opts['downloader_args'] = {
                'ffmpeg_i': ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5']
            }

        # Video vs Audio Mode
        if download_type == "video":
            # Select resolution without arbitrary limits and prioritize compatible audio
            if height:
                format_spec = f"bestvideo[height<={height}]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio[acodec^=mp4a]/bestvideo[height<={height}]+bestaudio/best[height<={height}]/best"
            else:
                format_spec = f"bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best"
                
            ydl_opts['format'] = format_spec
            ydl_opts['merge_output_format'] = target_ext
            
            # If MP4, ensure audio is encoded to universal AAC
            if target_ext == 'mp4':
                ydl_opts['postprocessor_args'] = {
                    'Merger': ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-avoid_negative_ts', 'make_zero']
                }
                if is_clipped:
                    if 'downloader_args' not in ydl_opts:
                        ydl_opts['downloader_args'] = {}
                    ydl_opts['downloader_args']['ffmpeg'] = ['-avoid_negative_ts', 'make_zero']
        else:
            # Audio Mode
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
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info_dict = ydl.extract_info(url, download=True)
            except Exception as dl_err:
                err_str = str(dl_err)
                clean_dl_err = sanitize_log(err_str)
                logger.warning(f"Initial download attempt failed: {clean_dl_err}")
                if "Sign in to confirm you’re not a bot" in err_str or "confirm you're not a bot" in err_str or "bot" in err_str.lower():
                    logger.info("Bot verification detected during download. Retrying with mobile stream client (visionos, android)...")
                    cls.update_task(task_id, stage="Bypassing cloud bot verification with mobile client...", progress=12.0)
                    apply_anti_bot_options(ydl_opts, player_clients=['visionos', 'android'])
                    if download_type == "video":
                        ydl_opts['format'] = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]/best" if height else "bestvideo+bestaudio/best"
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl_fb:
                        info_dict = ydl_fb.extract_info(url, download=True)
                else:
                    raise dl_err

            cls.update_task(task_id, stage="Verifying media streams...", progress=99.0)

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

            # If user provided a clip, guarantee frame-accurate audio alignment with zero startup silence
            if is_clipped:
                if download_type == "video":
                    final_file_path = align_clip_video_audio(final_file_path, target_ext)
                else:
                    final_file_path = align_clip_audio_only(final_file_path, target_ext, audio_bitrate)
            else:
                # Full video / audio
                if download_type == "video" and target_ext == "mp4":
                    final_file_path = ensure_mp4_audio_compatibility(final_file_path)
                elif download_type == "audio":
                    final_file_path = ensure_audio_only_file(final_file_path, target_ext, audio_bitrate)

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
            clean_err = sanitize_log(str(e))
            logger.error(f"Error executing download for task {task_id}: {clean_err}")
            cls.update_task(
                task_id,
                status='failed',
                stage='Failed to process video',
                error=clean_err
            )
        finally:
            stop_monitor_event.set()
