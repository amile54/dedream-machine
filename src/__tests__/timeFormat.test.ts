import { describe, it, expect } from 'vitest';
import { formatTime, formatTimeCompact } from '../utils/timeFormat';

describe('formatTime', () => {
  it('formats zero correctly', () => {
    expect(formatTime(0)).toBe('00:00:00');
  });

  it('formats seconds only', () => {
    expect(formatTime(5)).toBe('00:00:05');
    expect(formatTime(59)).toBe('00:00:59');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(65)).toBe('00:01:05');
    expect(formatTime(3599)).toBe('00:59:59');
  });

  it('formats hours', () => {
    expect(formatTime(3600)).toBe('01:00:00');
    expect(formatTime(7261)).toBe('02:01:01');
  });

  it('shows frames when showFrames is true', () => {
    expect(formatTime(1.5, true)).toBe('00:00:01.50');
    expect(formatTime(0.04, true)).toBe('00:00:00.04');
    expect(formatTime(0, true)).toBe('00:00:00.00');
  });

  it('handles negative values gracefully', () => {
    expect(formatTime(-1)).toBe('00:00:00');
  });

  it('handles NaN and Infinity', () => {
    expect(formatTime(NaN)).toBe('00:00:00');
    expect(formatTime(Infinity)).toBe('00:00:00');
    expect(formatTime(-Infinity)).toBe('00:00:00');
  });
});

describe('formatTimeCompact', () => {
  it('formats short durations without hours', () => {
    expect(formatTimeCompact(0)).toBe('0:00');
    expect(formatTimeCompact(5)).toBe('0:05');
    expect(formatTimeCompact(65)).toBe('1:05');
  });

  it('formats durations with hours', () => {
    expect(formatTimeCompact(3600)).toBe('1:00:00');
    expect(formatTimeCompact(3661)).toBe('1:01:01');
  });

  it('handles edge values', () => {
    expect(formatTimeCompact(-1)).toBe('0:00');
    expect(formatTimeCompact(NaN)).toBe('0:00');
  });
});
