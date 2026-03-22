import { describe, it, expect } from 'vitest';
import { snapToFrame, frameIndex, stepToFrame } from '../utils/frameUtils';

describe('snapToFrame', () => {
  it('snaps to nearest frame boundary at 25fps', () => {
    // Frames at 25fps: 0.00, 0.04, 0.08, 0.12...
    expect(snapToFrame(0.05, 25)).toBeCloseTo(0.04, 10);
    expect(snapToFrame(0.06, 25)).toBeCloseTo(0.08, 10);
    expect(snapToFrame(0.00, 25)).toBeCloseTo(0.00, 10);
  });

  it('snaps correctly at 24fps', () => {
    // Frame duration = 1/24 ≈ 0.04167
    // Math.round(0.02 * 24) = Math.round(0.48) = 0 → frame 0
    expect(snapToFrame(0.02, 24)).toBeCloseTo(0, 10);
    expect(snapToFrame(0.03, 24)).toBeCloseTo(1 / 24, 10); // Math.round(0.72) = 1
    expect(snapToFrame(0.0, 24)).toBeCloseTo(0, 10);
    expect(snapToFrame(1.0, 24)).toBeCloseTo(1.0, 5); // 24 frames = 1.0s
  });

  it('snaps correctly at 30fps', () => {
    // Frame duration = 1/30 ≈ 0.03333
    // Math.round(0.015 * 30) = Math.round(0.45) = 0 → frame 0
    expect(snapToFrame(0.015, 30)).toBeCloseTo(0, 10);
    // Math.round(0.02 * 30) = Math.round(0.6) = 1 → frame 1
    expect(snapToFrame(0.02, 30)).toBeCloseTo(1 / 30, 10);
    expect(snapToFrame(0.05, 30)).toBeCloseTo(2 / 30, 10);
  });

  it('handles 0 fps gracefully (returns time as-is)', () => {
    expect(snapToFrame(1.234, 0)).toBe(1.234);
    expect(snapToFrame(0, 0)).toBe(0);
  });

  it('handles negative fps gracefully', () => {
    expect(snapToFrame(1.234, -1)).toBe(1.234);
  });

  it('avoids floating point accumulation', () => {
    // Classic drift case: repeatedly stepping should not accumulate error
    let time = 0;
    const fps = 30;
    for (let i = 0; i < 1000; i++) {
      time = snapToFrame(time + 1 / fps, fps);
    }
    // After 1000 frames at 30fps, we should be at exactly 1000/30
    expect(time).toBeCloseTo(1000 / 30, 8);
  });
});

describe('frameIndex', () => {
  it('returns correct frame number', () => {
    expect(frameIndex(0, 25)).toBe(0);
    expect(frameIndex(0.04, 25)).toBe(1);
    expect(frameIndex(1.0, 25)).toBe(25);
    expect(frameIndex(1.0, 24)).toBe(24);
  });

  it('handles edge cases', () => {
    expect(frameIndex(0, 30)).toBe(0);
    expect(frameIndex(60, 24)).toBe(1440); // 1 minute
  });
});

describe('stepToFrame', () => {
  it('steps forward by one frame', () => {
    expect(stepToFrame(0, 25, 1)).toBeCloseTo(1 / 25, 10);
    expect(stepToFrame(0.04, 25, 1)).toBeCloseTo(2 / 25, 10);
  });

  it('steps backward by one frame', () => {
    expect(stepToFrame(0.08, 25, -1)).toBeCloseTo(1 / 25, 10);
    expect(stepToFrame(0.04, 25, -1)).toBeCloseTo(0, 10);
  });

  it('does not go below zero', () => {
    expect(stepToFrame(0, 25, -1)).toBe(0);
    expect(stepToFrame(0.01, 25, -1)).toBe(0);
  });

  it('maintains precision over many steps', () => {
    let time = 0;
    const fps = 24;
    for (let i = 0; i < 100; i++) {
      time = stepToFrame(time, fps, 1);
    }
    expect(time).toBeCloseTo(100 / 24, 8);
  });
});
