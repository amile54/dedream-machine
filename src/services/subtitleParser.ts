import type { SubtitleCue } from '../types';

/**
 * Parse an SRT subtitle file into an array of SubtitleCue objects.
 */
export function parseSrt(content: string): SubtitleCue[] {
    const cues: SubtitleCue[] = [];
    // Normalize line endings
    const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

    for (const block of blocks) {
        const lines = block.trim().split('\n');
        if (lines.length < 3) continue;

        const index = parseInt(lines[0], 10);
        if (isNaN(index)) continue;

        const timeParts = lines[1].split(' --> ');
        if (timeParts.length !== 2) continue;

        const startTime = parseSrtTime(timeParts[0].trim());
        const endTime = parseSrtTime(timeParts[1].trim());
        if (startTime === null || endTime === null) continue;

        const text = lines.slice(2).join('\n').trim();

        cues.push({ index, startTime, endTime, text });
    }

    return cues;
}

function parseSrtTime(timeStr: string): number | null {
    // Format: HH:MM:SS,mmm or HH:MM:SS.mmm
    const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const milliseconds = parseInt(match[4], 10);

    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}
