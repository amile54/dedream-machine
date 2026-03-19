/**
 * Frame-level time utilities for precise video editing.
 * 
 * All time operations in the app should go through these helpers
 * to ensure consistent frame-boundary alignment.
 */

/**
 * Snap a time value to the nearest frame boundary.
 * 
 * At 25fps, frames are at 0.00, 0.04, 0.08, 0.12...
 * snapToFrame(0.05, 25) → 0.04 (frame 1)
 * snapToFrame(0.06, 25) → 0.08 (frame 2)
 */
export function snapToFrame(time: number, fps: number): number {
    if (fps <= 0) return time;
    const frame = Math.round(time * fps);
    // Use division to avoid float accumulation
    return frame / fps;
}

/**
 * Get the frame index for a given time.
 * frameIndex(0.04, 25) → 1
 */
export function frameIndex(time: number, fps: number): number {
    return Math.round(time * fps);
}

/**
 * Step to the next or previous frame from the current snapped position.
 * This avoids floating-point drift by working in frame-index space.
 */
export function stepToFrame(currentTime: number, fps: number, direction: 1 | -1): number {
    const currentFrame = Math.round(currentTime * fps);
    const nextFrame = Math.max(0, currentFrame + direction);
    return nextFrame / fps;
}
