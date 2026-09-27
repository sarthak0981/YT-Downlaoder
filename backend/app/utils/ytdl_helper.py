import os
import re
import sys
import shutil
import logging
import base64
import tempfile
import subprocess
import http.cookiejar
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple
from urllib.parse import urlparse

import yt_dlp
from ..config import BASE_DIR

logger = logging.getLogger("ytdl_helper")

# Primary and fallback cookie file paths
COOKIES_FILE = BASE_DIR / "cookies.txt"

# Modern desktop Chrome User-Agent
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)

def sanitize_log(msg: str) -> str:
    """
    Sanitizes log messages by masking sensitive tokens, cookies, passwords, and API keys.
    """
    if not msg:
        return ""
    s = str(msg)
    # Mask common sensitive cookie values
    s = re.sub(r'(?:SID|HSID|SSID|APISID|SAPISID|__Secure-[0-9A-Za-z_-]+|LOGIN_INFO)=([^\s;]+)', r'\1=[REDACTED]', s)
    # Mask passwords in URLs (e.g. http://user:pass@host:port)
    s = re.sub(r'://([^:]+):([^@]+)@', r'://\1:[REDACTED]@', s)
    # Mask Bearer or authorization headers
    s = re.sub(r'(Bearer\s+)[A-Za-z0-9_\-\.]+', r'\1[REDACTED]', s)
    # Mask po_token values
    s = re.sub(r'(po_token[=:]\s*)[A-Za-z0-9_\-\.+]+', r'\1[REDACTED]', s)
    return s

def get_ffmpeg_path() -> Optional[str]:
    """
    Finds ffmpeg executable across system PATH, local bin, or custom environment variables.
    Prepends the directory to os.environ['PATH'] so subprocess and yt-dlp find it immediately.
    """
    # Check custom env
    custom_path = os.getenv("FFMPEG_PATH") or os.getenv("FFMPEG_LOCATION")
    if custom_path and Path(custom_path).exists():
        p = Path(custom_path)
        exe = p if p.is_file() else (p / ("ffmpeg.exe" if os.name == 'nt' else "ffmpeg"))
        if exe.exists():
            _ensure_in_path(exe.parent)
            return str(exe)

    # Check system PATH
    found = shutil.which("ffmpeg")
    if found:
        return found

    # Check local bin/ folder (e.g. populated by build.sh or local portable)
    candidates = [
        BASE_DIR / "bin" / ("ffmpeg.exe" if os.name == 'nt' else "ffmpeg"),
        Path("/usr/bin/ffmpeg"),
        Path("/usr/local/bin/ffmpeg"),
        Path("/opt/homebrew/bin/ffmpeg"),
    ]
    for c in candidates:
        if c.exists() and os.access(c, os.X_OK if os.name != 'nt' else os.R_OK):
            _ensure_in_path(c.parent)
            return str(c)

    return None

def get_ffprobe_path() -> Optional[str]:
    """Finds ffprobe executable."""
    found = shutil.which("ffprobe")
    if found:
        return found
    candidates = [
        BASE_DIR / "bin" / ("ffprobe.exe" if os.name == 'nt' else "ffprobe"),
        Path("/usr/bin/ffprobe"),
        Path("/usr/local/bin/ffprobe"),
    ]
    for c in candidates:
        if c.exists():
            _ensure_in_path(c.parent)
            return str(c)
    return None

def get_node_path() -> Optional[str]:
    """Finds node executable on system."""
    custom_node = os.getenv("NODE_PATH")
    if custom_node and Path(custom_node).exists():
        p = Path(custom_node)
        exe = p if p.is_file() else (p / ("node.exe" if os.name == 'nt' else "node"))
        if exe.exists():
            _ensure_in_path(exe.parent)
            return str(exe)

    found = shutil.which("node")
    if found:
        return found

    candidates = [
        BASE_DIR / "bin" / ("node.exe" if os.name == 'nt' else "node"),
        Path(r"C:\Program Files\nodejs\node.exe"),
        Path(r"C:\Program Files (x86)\nodejs\node.exe"),
        Path(os.path.expandvars(r"%APPDATA%\npm\node.cmd")),
        Path("/usr/bin/node"),
        Path("/usr/local/bin/node"),
    ]
    for c in candidates:
        if c.exists():
            _ensure_in_path(c.parent)
            return str(c)
    return None

def _ensure_in_path(directory: Path):
    """Adds directory to PATH if not already present."""
    dir_str = str(directory.resolve())
    cur_path = os.environ.get("PATH", "")
    if dir_str not in cur_path:
        os.environ["PATH"] = f"{dir_str}{os.pathsep}{cur_path}"

def get_proxy_url() -> Optional[str]:
    """
    Checks for proxy configuration in environment variables.
    Supports YTDL_PROXY, HTTP_PROXY, or HTTPS_PROXY.
    """
    proxy = (
        os.getenv("YTDL_PROXY")
        or os.getenv("HTTP_PROXY")
        or os.getenv("HTTPS_PROXY")
    )
    if proxy and proxy.strip():
        return proxy.strip()
    return None

def normalize_netscape_cookies(text: str) -> str:
    """
    Converts raw cookie text (even if mangled by copy-paste spaces or base64) into
    strict Netscape HTTP Cookie File format required by yt-dlp and http.cookiejar.
    """
    raw = text.strip()

    # Check if base64 encoded
    if "\n" not in raw and len(raw) > 50:
        try:
            decoded = base64.b64decode(raw).decode("utf-8", errors="ignore")
            if "youtube.com" in decoded or "# Netscape" in decoded:
                raw = decoded
        except Exception:
            pass

    # Normalize literal \n and \t escape sequences from environment variables
    if "\\n" in raw and "\n" not in raw:
        raw = raw.replace("\\n", "\n").replace("\\t", "\t")

    lines = raw.splitlines()
    cleaned_entries = []

    for line in lines:
        s = line.strip()
        if not s:
            continue
        # Skip existing header or comment lines
        if s.startswith("# Netscape") or s.startswith("# HTTP Cookie File") or s.startswith("#"):
            continue

        # Split on tabs first, fallback to whitespace if tabs were converted to spaces
        parts = s.split("\t") if "\t" in s else s.split()
        if len(parts) >= 7:
            domain, flag, path, secure, expiry, name = parts[:6]
            value = " ".join(parts[6:])
            cleaned_entries.append(f"{domain}\t{flag}\t{path}\t{secure}\t{expiry}\t{name}\t{value}")

    header = (
        "# Netscape HTTP Cookie File\n"
        "# Converted and verified by TubeHarvest Pro for yt-dlp authentication.\n"
    )
    return header + "\n".join(cleaned_entries) + "\n"

def validate_cookie_file(path: Path) -> Tuple[bool, int]:
    """
    Validates that a cookie file exists, is non-empty, and can be parsed by MozillaCookieJar.
    Returns (is_valid, cookie_count).
    """
    if not path.exists() or path.stat().st_size < 10:
        return False, 0
    try:
        cj = http.cookiejar.MozillaCookieJar(str(path))
        cj.load(ignore_discard=True, ignore_expires=True)
        count = len(list(cj))
        return count > 0, count
    except Exception as e:
        logger.debug(f"Cookie validation failed for {path}: {sanitize_log(str(e))}")
        return False, 0

def setup_cookies() -> Optional[Path]:
    """
    Comprehensive cookie loader:
    1. Checks explicit path from YOUTUBE_COOKIE_PATH or COOKIE_FILE.
    2. Checks Render Secret Files (/etc/secrets/cookies.txt, /etc/secrets/youtube_cookies.txt).
    3. Checks local project files (BASE_DIR/cookies.txt, BASE_DIR/downloads/cookies.txt).
    4. Checks YOUTUBE_COOKIES or COOKIES_CONTENT env vars, normalizes them, and writes to disk.
    5. Validates with MozillaCookieJar before returning the path.
    """
    # 1. Custom env path
    custom_cookie_path = os.getenv("YOUTUBE_COOKIE_PATH") or os.getenv("COOKIE_FILE")
    if custom_cookie_path:
        p = Path(custom_cookie_path)
        valid, count = validate_cookie_file(p)
        if valid:
            logger.info(f"Using valid cookie file from env path: {p} ({count} cookies loaded)")
            return p

    # 2. Render Secret Files mount points
    secret_file_candidates = [
        Path("/etc/secrets/cookies.txt"),
        Path("/etc/secrets/youtube_cookies.txt"),
    ]
    for sfc in secret_file_candidates:
        valid, count = validate_cookie_file(sfc)
        if valid:
            logger.info(f"Using Render Secret File: {sfc} ({count} cookies loaded)")
            return sfc

    # 3. Environment Variable string (YOUTUBE_COOKIES or COOKIES_CONTENT)
    env_cookies = os.getenv("YOUTUBE_COOKIES") or os.getenv("COOKIES_CONTENT")
    if env_cookies and len(env_cookies.strip()) > 10:
        try:
            normalized = normalize_netscape_cookies(env_cookies)
            # Try writing to project directory, fallback to temp dir if read-only
            target_path = COOKIES_FILE
            try:
                target_path.write_text(normalized, encoding="utf-8")
            except (IOError, PermissionError):
                target_path = Path(tempfile.gettempdir()) / "tubeharvest_cookies.txt"
                target_path.write_text(normalized, encoding="utf-8")

            valid, count = validate_cookie_file(target_path)
            if valid:
                logger.info(f"Successfully loaded and verified {count} YouTube cookies from environment variable.")
                return target_path
            else:
                logger.warning("Cookie content from environment variable could not be parsed into valid Netscape cookies.")
        except Exception as e:
            logger.warning(f"Failed to process cookies from environment variable: {sanitize_log(str(e))}")

    # 4. Existing local files
    for local_file in [COOKIES_FILE, BASE_DIR / "downloads" / "cookies.txt"]:
        valid, count = validate_cookie_file(local_file)
        if valid:
            return local_file

    return None

def apply_anti_bot_options(ydl_opts: Dict[str, Any], player_clients: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Applies production anti-bot protections, JS challenge solvers, proxy, and cookie configurations.
    Optimized for cloud environments (Render, AWS) and local execution.
    """
    # 1. FFmpeg integration
    ffmpeg_bin = get_ffmpeg_path()
    if ffmpeg_bin:
        ydl_opts["ffmpeg_location"] = str(Path(ffmpeg_bin).parent)

    # 2. JS Challenge Solver runtime (Node.js)
    node_bin = get_node_path()
    if node_bin:
        ydl_opts["js_runtimes"] = {"node": {"path": str(node_bin)}}
        ydl_opts["remote_components"] = {"ejs:github"}

    # 3. Proxy support
    proxy_url = get_proxy_url()
    if proxy_url:
        ydl_opts["proxy"] = proxy_url
        logger.info(f"Routing yt-dlp traffic through configured proxy: {sanitize_log(proxy_url)}")

    # 4. Standard HTTP Headers
    if "http_headers" not in ydl_opts:
        ydl_opts["http_headers"] = {
            "User-Agent": os.getenv("USER_AGENT", DEFAULT_USER_AGENT),
            "Accept-Language": "en-US,en;q=0.9",
        }

    # 5. Cookies Setup
    cookie_path = setup_cookies()
    if cookie_path:
        ydl_opts["cookiefile"] = str(cookie_path)

    # 6. Strategic InnerTube Player Clients selection:
    # If authenticated with cookies, web + visionos gives the richest format list.
    # If unauthenticated on a cloud/datacenter IP, visionos + android bypasses the bot verification check.
    if player_clients is None:
        if cookie_path:
            player_clients = ["web", "visionos", "android"]
        else:
            player_clients = ["visionos", "android"]

    if "extractor_args" not in ydl_opts:
        ydl_opts["extractor_args"] = {}
    if "youtube" not in ydl_opts["extractor_args"]:
        ydl_opts["extractor_args"]["youtube"] = {}
    ydl_opts["extractor_args"]["youtube"]["player_client"] = player_clients

    return ydl_opts

def get_system_diagnostics() -> Dict[str, Any]:
    """
    Compiles sanitized system telemetry for the /api/diag endpoint without exposing secrets.
    """
    # FFmpeg status
    ffmpeg_bin = get_ffmpeg_path()
    ffprobe_bin = get_ffprobe_path()
    ffmpeg_version = None
    if ffmpeg_bin:
        try:
            res = subprocess.run([ffmpeg_bin, "-version"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                first_line = res.stdout.splitlines()[0] if res.stdout else "Available"
                ffmpeg_version = first_line[:60]
        except Exception:
            ffmpeg_version = "Installed (Version check timed out)"

    # Node status
    node_bin = get_node_path()
    node_version = None
    if node_bin:
        try:
            res = subprocess.run([node_bin, "--version"], capture_output=True, text=True, timeout=5)
            if res.returncode == 0:
                node_version = res.stdout.strip()
        except Exception:
            node_version = "Installed"

    # Cookies status
    cookie_path = setup_cookies()
    cookie_info = {
        "configured": cookie_path is not None,
        "source": None,
        "cookie_count": 0,
        "file_size_bytes": 0,
        "path": str(cookie_path) if cookie_path else None
    }
    if cookie_path and cookie_path.exists():
        is_valid, count = validate_cookie_file(cookie_path)
        cookie_info["cookie_count"] = count
        cookie_info["file_size_bytes"] = cookie_path.stat().st_size
        if "/etc/secrets" in str(cookie_path):
            cookie_info["source"] = "render_secret_file"
        elif os.getenv("YOUTUBE_COOKIES"):
            cookie_info["source"] = "env_youtube_cookies"
        else:
            cookie_info["source"] = "local_cookie_file"

    # Proxy status
    raw_proxy = get_proxy_url()
    proxy_info = {
        "configured": raw_proxy is not None,
        "sanitized_url": sanitize_log(raw_proxy) if raw_proxy else None
    }

    return {
        "platform": sys.platform,
        "python_version": sys.version.split()[0],
        "ytdl_version": yt_dlp.version.__version__,
        "ffmpeg": {
            "installed": ffmpeg_bin is not None,
            "version": ffmpeg_version,
            "path": ffmpeg_bin,
            "ffprobe_installed": ffprobe_bin is not None
        },
        "node": {
            "installed": node_bin is not None,
            "version": node_version,
            "path": node_bin
        },
        "cookies": cookie_info,
        "proxy": proxy_info,
        "environment": {
            "PORT": os.getenv("PORT", "8000"),
            "HOST": os.getenv("HOST", "0.0.0.0"),
            "YOUTUBE_COOKIES_SET": bool(os.getenv("YOUTUBE_COOKIES")),
            "YTDL_PROXY_SET": bool(os.getenv("YTDL_PROXY")),
        }
    }
