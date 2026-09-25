import re
from typing import Optional, Union

def parse_timestamp(timestamp_str: Optional[Union[str, int, float]]) -> Optional[float]:
    """
    Parses timestamps like '01:23:45', '05:30', '45', or 125.5 into total seconds.
    Returns float seconds, or None if input is empty/invalid.
    """
    if timestamp_str is None:
        return None
        
    if isinstance(timestamp_str, (int, float)):
        return max(0.0, float(timestamp_str))
        
    s = str(timestamp_str).strip()
    if not s:
        return None
        
    # Check if it's already just a number of seconds
    try:
        val = float(s)
        return max(0.0, val)
    except ValueError:
        pass
        
    # Parse HH:MM:SS or MM:SS or SS.ms
    parts = s.split(':')
    try:
        if len(parts) == 3:
            h, m, sec = float(parts[0]), float(parts[1]), float(parts[2])
            return max(0.0, h * 3600 + m * 60 + sec)
        elif len(parts) == 2:
            m, sec = float(parts[0]), float(parts[1])
            return max(0.0, m * 60 + sec)
        elif len(parts) == 1:
            return max(0.0, float(parts[0]))
    except (ValueError, TypeError):
        return None
        
    return None

def format_seconds(seconds: Optional[float]) -> str:
    """
    Formats seconds into HH:MM:SS or MM:SS format string.
    """
    if seconds is None or seconds < 0:
        return "00:00"
        
    total_seconds = int(seconds)
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    else:
        return f"{minutes:02d}:{secs:02d}"

def format_bytes(num_bytes: Optional[int]) -> str:
    """
    Formats bytes into human readable MB, GB, etc.
    """
    if not num_bytes or num_bytes <= 0:
        return "Unknown size"
        
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if num_bytes < 1024.0:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024.0
    return f"{num_bytes:.1f} PB"
