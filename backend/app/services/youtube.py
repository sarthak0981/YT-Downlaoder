import re
import shutil
from typing import Dict, Any, List, Optional
import yt_dlp
from ..utils.time_format import format_seconds, format_bytes

def clean_youtube_url(url: str) -> str:
    """Cleans up and normalizes YouTube URLs (including Shorts, youtu.be, mobile links)."""
    url = url.strip()
    shorts_match = re.search(r'(?:youtube\.com/shorts/|youtu\.be/|youtube\.com/watch\?v=)([a-zA-Z0-9_-]{11})', url)
    if shorts_match:
        video_id = shorts_match.group(1)
        return f"https://www.youtube.com/watch?v={video_id}"
    return url

class YouTubeService:
    @staticmethod
    def get_ydl_opts(custom_opts: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Base yt-dlp options configured for maximum format visibility."""
        opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'extract_flat': False,
            'socket_timeout': 20,
        }
        # If node.js is available on system, enable it for deciphering signatures
        if shutil.which('node'):
            opts['js_runtimes'] = {'node': {}}

        if custom_opts:
            opts.update(custom_opts)
        return opts

    @classmethod
    def get_video_info(cls, url: str) -> Dict[str, Any]:
        """
        Fetches full metadata and formats for a YouTube video link.
        Guarantees NO CAP on resolutions (exposes up to 8K / 4K if available).
        """
        clean_url = clean_youtube_url(url)
        opts = cls.get_ydl_opts()
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(clean_url, download=False)
        except Exception as e:
            error_msg = str(e)
            if "Private video" in error_msg:
                raise ValueError("This video is private and cannot be downloaded.")
            elif "Video unavailable" in error_msg:
                raise ValueError("This video is unavailable or has been removed.")
            elif "Sign in to confirm your age" in error_msg:
                raise ValueError("This video is age-restricted.")
            else:
                raise ValueError(f"Failed to fetch video details: {error_msg}")

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

        duration = info.get('duration') or 0
        formats = info.get('formats', [])
        
        # Calculate best audio size
        best_audio_size = 0
        best_audio_bitrate = 0
        for f in formats:
            if f.get('vcodec') == 'none' and f.get('acodec') != 'none':
                abr = f.get('abr') or 0
                if abr > best_audio_bitrate:
                    best_audio_bitrate = abr
                    best_audio_size = f.get('filesize') or f.get('filesize_approx') or (duration * (abr * 1000 / 8) if duration else 0)

        # Parse and group video resolutions (NO CAP - 8K, 4K, 1440p, 1080p, 720p, etc.)
        # Keyed by height so user gets clear options for each resolution
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
            
            # Estimate file size
            v_size = f.get('filesize') or f.get('filesize_approx')
            if not v_size and duration and f.get('tbr'):
                v_size = duration * (f.get('tbr') * 1000 / 8)
                
            total_size_estimate = 0
            if v_size:
                if f.get('acodec') == 'none':
                    total_size_estimate = int(v_size + (best_audio_size or 0))
                else:
                    total_size_estimate = int(v_size)

            # Store the highest fps/quality stream for each height
            existing = resolutions_map.get(height)
            if not existing or (fps > existing['fps']) or (fps == existing['fps'] and total_size_estimate > (existing.get('raw_size') or 0)):
                resolutions_map[height] = {
                    'height': height,
                    'fps': fps,
                    'resolution': res_label,
                    'label': display_title,
                    'quality_tag': quality_tag,
                    'ext': 'mp4',
                    'raw_size': total_size_estimate,
                    'size_str': format_bytes(total_size_estimate) if total_size_estimate else "Best Quality",
                    'format_id': f.get('format_id')
                }

        # Sort resolutions from highest to lowest (e.g. 4320 -> 2160 -> 1440 -> 1080 -> 720 -> 480 -> 360)
        sorted_resolutions = sorted(
            resolutions_map.values(),
            key=lambda x: x['height'],
            reverse=True
        )

        # Standard Audio Options
        audio_options = [
            {
                'id': 'mp3_320',
                'format': 'mp3',
                'label': 'MP3 Audio (High Quality 320 kbps)',
                'bitrate': '320k',
                'size_str': format_bytes(int(duration * (320 * 1000 / 8))) if duration else "High Quality"
            },
            {
                'id': 'mp3_192',
                'format': 'mp3',
                'label': 'MP3 Audio (Standard 192 kbps)',
                'bitrate': '192k',
                'size_str': format_bytes(int(duration * (192 * 1000 / 8))) if duration else "Standard Quality"
            },
            {
                'id': 'm4a',
                'format': 'm4a',
                'label': 'M4A / AAC (Original Audio Stream - Lossless Transfer)',
                'bitrate': 'best',
                'size_str': format_bytes(int(best_audio_size)) if best_audio_size else "Original Quality"
            },
            {
                'id': 'wav',
                'format': 'wav',
                'label': 'WAV Audio (Uncompressed Studio Lossless)',
                'bitrate': 'uncompressed',
                'size_str': format_bytes(int(duration * 176400)) if duration else "Uncompressed"
            },
            {
                'id': 'flac',
                'format': 'flac',
                'label': 'FLAC (Lossless Free Audio Codec)',
                'bitrate': 'lossless',
                'size_str': "Lossless"
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
