/**
 * Format seconds into HH:MM:SS.ff display
 */
export function formatTime(seconds: number, showFrames = false): string {
    if (!isFinite(seconds) || seconds < 0) return '00:00:00';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [
        h.toString().padStart(2, '0'),
        m.toString().padStart(2, '0'),
        s.toString().padStart(2, '0'),
    ];

    if (showFrames) {
        const frac = Math.floor((seconds % 1) * 100);
        return parts.join(':') + '.' + frac.toString().padStart(2, '0');
    }

    return parts.join(':');
}

/**
 * Format seconds into compact display (M:SS or H:MM:SS)
 */
export function formatTimeCompact(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}
