import re
import shutil
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
import yt_dlp
from ..utils.time_format import format_seconds, format_bytes
from ..utils.ytdl_helper import apply_anti_bot_options, sanitize_log, setup_cookies

logger = logging.getLogger("youtube_service")

def clean_youtube_url(url: str) -> str:
    """Cleans up and normalizes YouTube URLs (including Shorts, youtu.be, mobile links)."""
    url = url.strip()
    shorts_match = re.search(r'(?:youtube\.com/shorts/|youtu\.be/|youtube\.com/watch\?v=)([a-zA-Z0-9_-]{11})', url)
    if shorts_match:
        video_id = shorts_match.group(1)
        return f"https://www.youtube.com/watch?v={video_id}"
    return url

# Typical realistic average bitrates (bits per second) for video + audio
REALISTIC_BITRATES = {
    4320: 38_000_000,  # 8K
    2160: 16_000_000,  # 4K
    1440: 8_000_000,   # 2K
    1080: 3_500_000,   # Full HD
    720: 1_800_000,    # HD
    480: 800_000,      # SD
    360: 450_000,      # 360p
    240: 250_000,      # 240p
    144: 150_000       # 144p
}

class YouTubeService:
    @staticmethod
    def get_ydl_opts(custom_opts: Optional[Dict[str, Any]] = None, player_clients: Optional[List[str]] = None) -> Dict[str, Any]:
        """Base yt-dlp options configured for safe, fast metadata extraction with anti-bot protection."""
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'socket_timeout': 20,
        }
        
        apply_anti_bot_options(opts, player_clients=player_clients)

        if custom_opts:
            opts.update(custom_opts)
        return opts

    @classmethod
    def test_extraction(cls, url: str, client: Optional[str] = None) -> Dict[str, Any]:
        """Diagnostic probe for /api/diag/test-extract to test extraction health across different InnerTube clients."""
        clean_url = clean_youtube_url(url)
        cookie_path = setup_cookies()
        
        clients_to_test = [c.strip() for c in client.split(",") if c.strip()] if client else None
        opts = cls.get_ydl_opts(player_clients=clients_to_test)
        active_clients = opts.get('extractor_args', {}).get('youtube', {}).get('player_client', [])
        
        captured_logs = []
        class DiagLogger:
            def debug(self, msg):
                if any(k in msg.lower() for k in ["player", "innertube", "challenge", "format", "warning", "error"]):
                    captured_logs.append(sanitize_log(msg))
            def warning(self, msg):
                captured_logs.append(f"WARNING: {sanitize_log(msg)}")
            def error(self, msg):
                captured_logs.append(f"ERROR: {sanitize_log(msg)}")
                
        opts['logger'] = DiagLogger()
        opts['quiet'] = False
        opts['no_warnings'] = False
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)
                formats = info.get('formats', [])
                return {
                    "status": "success",
                    "url": clean_url,
                    "video_id": info.get('id'),
                    "title": info.get('title'),
                    "duration": info.get('duration'),
                    "formats_count": len(formats),
                    "video_streams": len([f for f in formats if f.get('vcodec') != 'none' and f.get('url')]),
                    "audio_streams": len([f for f in formats if f.get('acodec') != 'none' and f.get('url')]),
                    "active_clients": active_clients,
                    "cookies_attached": cookie_path is not None,
                    "telemetry_logs": captured_logs[-10:] if captured_logs else []
                }
        except Exception as e:
            clean_err = sanitize_log(str(e))
            logger.warning(f"Diagnostic test extraction failed: {clean_err}")
            return {
                "status": "failed",
                "url": clean_url,
                "active_clients": active_clients,
                "cookies_attached": cookie_path is not None,
                "error": clean_err,
                "telemetry_logs": captured_logs[-10:] if captured_logs else [],
                "diagnostic_hint": (
                    "If the error mentions bot verification or login required, YouTube blocked Render's cloud IP. "
                    "Provide cookies via 'YOUTUBE_COOKIES' or a proxy via 'YTDL_PROXY'."
                )
            }

    @classmethod
    def get_video_info(cls, url: str) -> Dict[str, Any]:
        clean_url = clean_youtube_url(url)
        cookie_path = setup_cookies()
        logger.info(f"Fetching video info for {clean_url} (Cookies: {'Present' if cookie_path else 'None'})")
        
        opts = cls.get_ydl_opts()
        info = None
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)
        except Exception as e:
            raw_err = str(e)
            clean_err = sanitize_log(raw_err)
            logger.warning(f"Primary extraction attempt failed: {clean_err}")
            
            # If YouTube blocks cloud/datacenter IP with bot detection, retry with mobile client
            if any(term in raw_err.lower() for term in ["bot", "confirm you're not a bot", "sign in", "requested format is not available"]):
                logger.info("Retrying with mobile clients (visionos, android)...")
                try:
                    fallback_opts = cls.get_ydl_opts(player_clients=['visionos', 'android'])
                    with yt_dlp.YoutubeDL(fallback_opts) as ydl_fb:
                        info = ydl_fb.extract_info(clean_url, download=False)
                except Exception as fb_err:
                    clean_fb = sanitize_log(str(fb_err))
                    logger.error(f"Mobile client fallback failed: {clean_fb}")
                    raise ValueError(
                        f"YouTube extraction failed on Render: {clean_fb}. "
                        "To resolve cloud IP restrictions, configure 'YOUTUBE_COOKIES' or a residential proxy via 'YTDL_PROXY'. Visit /api/diag for diagnostics."
                    )
            elif "Private video" in raw_err:
                raise ValueError("This video is private and cannot be downloaded.")
            elif "Video unavailable" in raw_err:
                raise ValueError("This video is unavailable or has been removed.")
            elif "Sign in to confirm your age" in raw_err:
                raise ValueError("This video is age-restricted and requires YouTube cookies to view.")
            else:
                raise ValueError(f"Failed to fetch video details: {clean_err}")

        if not info:
            raise ValueError("No video information could be retrieved.")

        if 'entries' in info:
            entries = list(info.get('entries', []))
            if entries:
                info = entries[0]
            else:
                raise ValueError("No video found in the provided URL.")

        thumbnails = info.get('thumbnails', [])
        best_thumbnail = info.get('thumbnail')
        if thumbnails:
            sorted_thumbs = sorted(thumbnails, key=lambda t: (t.get('width') or 0, t.get('height') or 0), reverse=True)
            if sorted_thumbs:
                best_thumbnail = sorted_thumbs[0].get('url') or best_thumbnail

        duration = int(info.get('duration') or 0)
        formats = info.get('formats', [])
        
        # Audio estimation: ~160kbps average AAC/Opus
        audio_bps = (160 * 1000) / 8
        best_audio_size = int(duration * audio_bps) if duration else 0

        # Parse and group video resolutions (NO CAP - 8K, 4K, 1440p, 1080p, 720p, etc.)
        resolutions_map = {}
        
        for f in formats:
            height = f.get('height')
            vcodec = f.get('vcodec')
            
            # Must have valid video stream
            if not height or vcodec == 'none':
                continue

            fps = f.get('fps') or 30
            
            # Common display tags
            res_label = f"{height}p"
            quality_tag = ""
            if height >= 4320:
                quality_tag = "8K Ultra HD"
            elif height >= 2160:
                quality_tag = "4K Ultra HD"
            elif height >= 1440:
                quality_tag = "2K QHD"
            elif height >= 1080:
                quality_tag = "Full HD"
            elif height >= 720:
                quality_tag = "HD"
            elif height >= 480:
                quality_tag = "SD"
            else:
                quality_tag = f"{height}p"

            fps_str = f" {int(fps)}fps" if fps and fps > 30 else ""
            display_title = f"{res_label}{fps_str} • {quality_tag}"
            
            # Calculate grounded realistic size
            # Match closest height in realistic bitrates table
            closest_h = min(REALISTIC_BITRATES.keys(), key=lambda h: abs(h - height))
            expected_bps = (REALISTIC_BITRATES[closest_h] / 8)
            
            # Check if yt-dlp reported reasonable actual filesize
            raw_v_size = f.get('filesize')
            if raw_v_size and duration > 0:
                actual_bps = raw_v_size / duration
                # Only use if within 0.3x to 3x of realistic
                if 0.3 * expected_bps < actual_bps < 3.0 * expected_bps:
                    expected_bps = actual_bps + (audio_bps if f.get('acodec') == 'none' else 0)

            total_size_estimate = int(duration * expected_bps) if duration else 0

            # Store the highest fps stream for each height
            existing = resolutions_map.get(height)
            if not existing or (fps > existing['fps']):
                resolutions_map[height] = {
                    'height': height,
                    'fps': fps,
                    'resolution': res_label,
                    'label': display_title,
                    'quality_tag': quality_tag,
                    'ext': 'mp4',
                    'bytes_per_sec': int(expected_bps),
                    'raw_size': total_size_estimate,
                    'size_str': format_bytes(total_size_estimate) if total_size_estimate else "Standard",
                    'format_id': f.get('format_id')
                }

        # Sort resolutions descending (e.g. 4320 -> 2160 -> 1440 -> 1080 -> 720 -> 480 -> 360)
        sorted_resolutions = sorted(
            resolutions_map.values(),
            key=lambda x: x['height'],
            reverse=True
        )

        # Standard Audio Options with grounded sizes
        audio_options = [
            {
                'id': 'mp3_320',
                'format': 'mp3',
                'label': 'MP3 Audio (High Quality 320 kbps)',
                'bitrate': '320k',
                'bytes_per_sec': int(320 * 1000 / 8),
                'size_str': format_bytes(int(duration * (320 * 1000 / 8))) if duration else "~2.4 MB/min"
            },
            {
                'id': 'mp3_192',
                'format': 'mp3',
                'label': 'MP3 Audio (Standard 192 kbps)',
                'bitrate': '192k',
                'bytes_per_sec': int(192 * 1000 / 8),
                'size_str': format_bytes(int(duration * (192 * 1000 / 8))) if duration else "~1.4 MB/min"
            },
            {
                'id': 'm4a',
                'format': 'm4a',
                'label': 'M4A / AAC (Original YouTube Audio Stream)',
                'bitrate': 'best',
                'bytes_per_sec': int(128 * 1000 / 8),
                'size_str': format_bytes(int(duration * (128 * 1000 / 8))) if duration else "~1.0 MB/min"
            },
            {
                'id': 'wav',
                'format': 'wav',
                'label': 'WAV Audio (Uncompressed Studio Lossless)',
                'bitrate': 'uncompressed',
                'bytes_per_sec': 176400,
                'size_str': format_bytes(int(duration * 176400)) if duration else "Lossless"
            },
            {
                'id': 'flac',
                'format': 'flac',
                'label': 'FLAC (Lossless Free Audio Codec)',
                'bitrate': 'lossless',
                'bytes_per_sec': 90000,
                'size_str': format_bytes(int(duration * 90000)) if duration else "Lossless"
            }
        ]

        return {
            'id': info.get('id'),
            'url': clean_url,
            'title': info.get('title') or "YouTube Video",
            'uploader': info.get('uploader') or info.get('channel') or "Unknown Channel",
            'uploader_url': info.get('uploader_url') or info.get('channel_url'),
            'thumbnail': best_thumbnail,
            'duration': duration,
            'duration_formatted': format_seconds(duration),
            'view_count': info.get('view_count'),
            'upload_date': info.get('upload_date'),
            'resolutions': sorted_resolutions,
            'audio_options': audio_options,
            'is_live': info.get('is_live', False)
        }
