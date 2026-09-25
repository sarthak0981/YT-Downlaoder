import sys
from pathlib import Path
import yt_dlp

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.app.services.downloader import DownloaderService

# Test 1: MP3 Audio Download
print("--- TEST 1: MP3 Audio Download ---")
tid_audio = DownloaderService.create_task()
try:
    DownloaderService._execute_download_sync(
        task_id=tid_audio,
        url="https://www.youtube.com/watch?v=jNQXAC9IVRw",
        download_type="audio",
        height=None,
        format_ext="mp3",
        audio_bitrate="320k",
        start_time=None,
        end_time=None,
        title="Me at the zoo"
    )
    t = DownloaderService.get_task(tid_audio)
    print("Audio Task Result:", t['status'], t.get('filename'), t.get('error'))
except Exception as e:
    print("Audio Exception:", e)

# Test 2: Clip with Big Buck Bunny (4K or 1080p, 5 seconds)
print("\n--- TEST 2: Video Clip Download (0 to 5s of Big Buck Bunny) ---")
tid_clip = DownloaderService.create_task()
try:
    DownloaderService._execute_download_sync(
        task_id=tid_clip,
        url="https://www.youtube.com/watch?v=aqz-KE-bpKQ",
        download_type="video",
        height=720,
        format_ext="mp4",
        audio_bitrate="320k",
        start_time=5.0,
        end_time=10.0,
        title="Big Buck Bunny"
    )
    t = DownloaderService.get_task(tid_clip)
    print("Clip Task Result:", t['status'], t.get('filename'), t.get('error'))
except Exception as e:
    print("Clip Exception:", e)
