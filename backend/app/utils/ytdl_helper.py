import os
import shutil
import logging
from pathlib import Path
from typing import Dict, Any, Optional, List

from ..config import BASE_DIR

logger = logging.getLogger(__name__)

COOKIES_FILE = BASE_DIR / "cookies.txt"

def setup_cookies() -> Optional[Path]:
    """
    Checks if YOUTUBE_COOKIES or COOKIES_CONTENT env var is set.
    If so, writes it to cookies.txt.
    Also checks if cookies.txt already exists.
    Returns Path to cookies file if valid, else None.
    """
    env_cookies = os.getenv("YOUTUBE_COOKIES") or os.getenv("COOKIES_CONTENT")
    if env_cookies and len(env_cookies.strip()) > 10:
        try:
            cleaned_cookies = env_cookies.strip()
            # If encoded in base64
            if not "\n" in cleaned_cookies and len(cleaned_cookies) > 50:
                try:
                    import base64
                    decoded = base64.b64decode(cleaned_cookies).decode('utf-8', errors='ignore')
                    if "youtube.com" in decoded or "# Netscape" in decoded:
                        cleaned_cookies = decoded
                except Exception:
                    pass
            # Normalize escaped newlines like \n
            if "\\n" in cleaned_cookies and "\n" not in cleaned_cookies:
                cleaned_cookies = cleaned_cookies.replace("\\n", "\n").replace("\\t", "\t")
            
            COOKIES_FILE.write_text(cleaned_cookies, encoding="utf-8")
            logger.info("Successfully loaded YouTube cookies from environment variable.")
        except Exception as e:
            logger.warning(f"Failed to write cookies from env var: {e}")

    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 10:
        return COOKIES_FILE
        
    alt_file = BASE_DIR / "downloads" / "cookies.txt"
    if alt_file.exists() and alt_file.stat().st_size > 10:
        return alt_file

    return None

def get_node_path() -> Optional[str]:
    found = shutil.which('node')
    if found:
        return found
    candidates = [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
        os.path.expandvars(r"%APPDATA%\npm\node.cmd"),
        "/usr/bin/node",
        "/usr/local/bin/node",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return None

def apply_anti_bot_options(ydl_opts: Dict[str, Any], player_clients: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Applies anti-bot spoofing, JS runtimes, and cookie configurations to ydl_opts.
    Bypasses YouTube's 'Sign in to confirm you're not a bot' on datacenter IPs (Render, AWS, etc.).
    """
    if player_clients is not None:
        if 'extractor_args' not in ydl_opts:
            ydl_opts['extractor_args'] = {}
        if 'youtube' not in ydl_opts['extractor_args']:
            ydl_opts['extractor_args']['youtube'] = {}
        ydl_opts['extractor_args']['youtube']['player_client'] = player_clients
        ydl_opts['http_headers'] = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
            'Accept-Language': 'en-US,en;q=0.9',
        }
    else:
        if 'http_headers' not in ydl_opts:
            ydl_opts['http_headers'] = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            }

    ydl_opts['remote_components'] = {'ejs:github'}

    node_path = get_node_path()
    if node_path:
        ydl_opts['js_runtimes'] = {'node': {'path': str(node_path)}}

    # Cookies if provided
    cookie_path = setup_cookies()
    if cookie_path:
        ydl_opts['cookiefile'] = str(cookie_path)
        logger.info(f"Using cookiefile: {cookie_path}")

    return ydl_opts

