import sys
from pathlib import Path

# Force UTF-8 for console output on Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.app.utils.time_format import parse_timestamp, format_seconds, format_bytes
from backend.app.services.youtube import YouTubeService, clean_youtube_url

def test_time_formatting():
    print("Testing timestamp utilities...")
    assert parse_timestamp("01:20:30") == 4830.0, f"Expected 4830.0, got {parse_timestamp('01:20:30')}"
    assert parse_timestamp("02:15") == 135.0, f"Expected 135.0, got {parse_timestamp('02:15')}"
    assert parse_timestamp("45") == 45.0, f"Expected 45.0, got {parse_timestamp('45')}"
    assert parse_timestamp(90) == 90.0, f"Expected 90.0, got {parse_timestamp(90)}"
    assert parse_timestamp(None) is None
    assert parse_timestamp("invalid") is None
    
    assert format_seconds(4830) == "01:20:30"
    assert format_seconds(135) == "02:15"
    assert format_seconds(45) == "00:45"
    print("✓ Timestamp utilities passed.")

def test_youtube_url_cleaner():
    print("Testing URL cleaner...")
    shorts_url = "https://www.youtube.com/shorts/aqz-KE-bpKQ?feature=share"
    cleaned = clean_youtube_url(shorts_url)
    assert "https://www.youtube.com/watch?v=aqz-KE-bpKQ" == cleaned, f"Got: {cleaned}"
    
    youtu_be = "https://youtu.be/aqz-KE-bpKQ"
    cleaned_short = clean_youtube_url(youtu_be)
    assert "https://www.youtube.com/watch?v=aqz-KE-bpKQ" == cleaned_short
    print("✓ URL cleaner passed.")

def test_youtube_info_extraction():
    print("Testing YouTube metadata and format extraction (checking for uncapped resolutions)...")
    test_url = "https://www.youtube.com/watch?v=jNQXAC9IVRw" # First youtube video, short & fast
    info = YouTubeService.get_video_info(test_url)
    
    assert info['title'], "Title is empty"
    assert info['duration'] > 0, "Duration is 0"
    assert info['thumbnail'], "Thumbnail is missing"
    assert len(info['resolutions']) > 0, "No resolutions found"
    assert len(info['audio_options']) > 0, "No audio options found"
    
    print(f"✓ Video Title: '{info['title']}'")
    print(f"✓ Duration: {info['duration_formatted']}")
    print(f"✓ Extracted {len(info['resolutions'])} resolutions:")
    for r in info['resolutions']:
        print(f"   - {r['label']} (Height: {r['height']}p, Est. Size: {r['size_str']})")
        
    print(f"✓ Extracted {len(info['audio_options'])} audio formats:")
    for a in info['audio_options']:
        print(f"   - {a['label']} ({a['size_str']})")

if __name__ == "__main__":
    try:
        test_time_formatting()
        test_youtube_url_cleaner()
        test_youtube_info_extraction()
        print("\n🎉 ALL TESTS PASSED SUCCESSFULLY!")
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
