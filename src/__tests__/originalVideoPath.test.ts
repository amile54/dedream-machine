import { describe, expect, it, vi } from 'vitest';
import { ensureOriginalVideoAvailable, getOriginalVideoCandidate } from '../utils/originalVideoPath';

describe('originalVideoPath', () => {
  it('resolves the original video path against the workspace', () => {
    expect(getOriginalVideoCandidate('/workspace', 'media/movie.mp4')).toBe('/workspace/media/movie.mp4');
    expect(getOriginalVideoCandidate('/workspace', '/external/movie.mp4')).toBe('/external/movie.mp4');
  });

  it('returns the original path directly when the file exists', async () => {
    const checkExists = vi.fn().mockResolvedValue(true);
    const onMissing = vi.fn();

    const path = await ensureOriginalVideoAvailable(
      '/workspace',
      '/external/movie.mp4',
      checkExists,
      onMissing,
    );

    expect(path).toBe('/external/movie.mp4');
    expect(checkExists).toHaveBeenCalledWith('/external/movie.mp4');
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('asks the caller to relink when the original video is missing', async () => {
    const checkExists = vi.fn().mockResolvedValue(false);
    const onMissing = vi.fn().mockResolvedValue('/new/location/movie.mp4');

    const path = await ensureOriginalVideoAvailable(
      '/workspace',
      '/external/movie.mp4',
      checkExists,
      onMissing,
    );

    expect(path).toBe('/new/location/movie.mp4');
    expect(onMissing).toHaveBeenCalledWith('/external/movie.mp4');
  });
});
