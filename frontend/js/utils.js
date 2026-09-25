/**
 * TubeHarvest Pro - Frontend Utilities
 */

function formatSeconds(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
        return "00:00";
    }
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;

    const pad = (n) => n.toString().padStart(2, '0');

    if (hrs > 0) {
        return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
}

function parseTimeString(timeStr) {
    if (!timeStr) return 0;
    const str = timeStr.toString().trim();
    if (!str) return 0;

    // Check if it's already just seconds
    if (!isNaN(str)) {
        return Math.max(0, parseFloat(str));
    }

    const parts = str.split(':');
    try {
        if (parts.length === 3) {
            const h = parseFloat(parts[0]) || 0;
            const m = parseFloat(parts[1]) || 0;
            const s = parseFloat(parts[2]) || 0;
            return Math.max(0, h * 3600 + m * 60 + s);
        } else if (parts.length === 2) {
            const m = parseFloat(parts[0]) || 0;
            const s = parseFloat(parts[1]) || 0;
            return Math.max(0, m * 60 + s);
        } else if (parts.length === 1) {
            return Math.max(0, parseFloat(parts[0]) || 0);
        }
    } catch (e) {
        return 0;
    }
    return 0;
}

function formatViews(views) {
    if (!views) return "0 views";
    return new Intl.NumberFormat().format(views) + " views";
}
