import { describe, it, expect } from 'vitest';
import { parseSrt } from '../services/subtitleParser';

describe('parseSrt', () => {
  it('parses standard SRT content', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Hello, world!

2
00:00:05,500 --> 00:00:08,200
Second subtitle line`;

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      index: 1,
      startTime: 1.0,
      endTime: 4.0,
      text: 'Hello, world!',
    });
    expect(cues[1]).toEqual({
      index: 2,
      startTime: 5.5,
      endTime: 8.2,
      text: 'Second subtitle line',
    });
  });

  it('handles multi-line subtitle text', () => {
    const srt = `1
00:01:00,000 --> 00:01:05,000
Line one
Line two
Line three`;

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Line one\nLine two\nLine three');
  });

  it('handles period separator (00:00:01.000)', () => {
    const srt = `1
00:00:01.000 --> 00:00:04.500
Dot separator`;

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].startTime).toBe(1.0);
    expect(cues[0].endTime).toBe(4.5);
  });

  it('handles Windows-style line endings (\\r\\n)', () => {
    const srt = "1\r\n00:00:01,000 --> 00:00:02,000\r\nWindows CRLF\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nSecond";

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe('Windows CRLF');
  });

  it('skips malformed blocks gracefully', () => {
    const srt = `not a number
00:00:01,000 --> 00:00:02,000
Bad index

2
invalid time
Good text

3
00:00:05,000 --> 00:00:06,000
Valid subtitle`;

    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('Valid subtitle');
  });

  it('returns empty array for empty string', () => {
    expect(parseSrt('')).toEqual([]);
  });

  it('handles hour values correctly', () => {
    const srt = `1
01:30:45,123 --> 02:15:30,456
Long movie subtitle`;

    const cues = parseSrt(srt);
    expect(cues[0].startTime).toBeCloseTo(1 * 3600 + 30 * 60 + 45 + 0.123, 3);
    expect(cues[0].endTime).toBeCloseTo(2 * 3600 + 15 * 60 + 30 + 0.456, 3);
  });
});
