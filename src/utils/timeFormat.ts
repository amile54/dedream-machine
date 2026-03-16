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

/**
 * Parse SRT subtitle file content
 */
export function parseSRT(content: string): Array<{
    index: number;
    startTime: number;
    endTime: number;
    text: string;
}> {
    const cues: Array<{ index: number; startTime: number; endTime: number; text: string }> = [];
    const blocks = content.trim().split(/\n\s*\n/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3) continue;

        const index = parseInt(lines[0], 10);
        if (isNaN(index)) continue;

        const timeMatch = lines[1].match(
            /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
        );
        if (!timeMatch) continue;

        const startTime =
            parseInt(timeMatch[1]) * 3600 +
            parseInt(timeMatch[2]) * 60 +
            parseInt(timeMatch[3]) +
            parseInt(timeMatch[4]) / 1000;

        const endTime =
            parseInt(timeMatch[5]) * 3600 +
            parseInt(timeMatch[6]) * 60 +
            parseInt(timeMatch[7]) +
            parseInt(timeMatch[8]) / 1000;

        const text = lines.slice(2).join('\n').replace(/<[^>]*>/g, '');

        cues.push({ index, startTime, endTime, text });
    }

    return cues;
}
