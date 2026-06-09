import { describe, expect, it, vi } from 'vitest';
import { exportProjectSegmentsAsClips } from '../utils/exportSegments';
import type { Project } from '../types';

function makeProject(): Project {
  const now = new Date().toISOString();
  return {
    videoFilePath: '/source/movie.mp4',
    segments: [
      {
        id: 'segment-1',
        index: 1,
        startTime: 0,
        endTime: 4,
        description: '',
        category: '',
      },
      {
        id: 'segment-2',
        index: 12,
        startTime: 4,
        endTime: 9,
        description: '',
        category: '',
      },
    ],
    textBlocks: [],
    sceneBlocks: [],
    assets: [],
    createdAt: now,
    updatedAt: now,
    metadata: { title: 'Movie', sourceUrl: '', videoId: '' },
  };
}

describe('exportProjectSegmentsAsClips', () => {
  it('exports every valid segment as a dataset clip and records relative clip paths', async () => {
    const exportClip = vi.fn().mockResolvedValue(undefined);
    const project = makeProject();

    const updated = await exportProjectSegmentsAsClips({
      project,
      workspace: '/workspace',
      sourceVideoPath: '/source/movie.mp4',
      fps: 24,
      exportClip,
    });

    expect(exportClip).toHaveBeenCalledTimes(2);
    expect(exportClip).toHaveBeenNthCalledWith(
      1,
      '/source/movie.mp4',
      0,
      4,
      '/workspace/assets/segment_clips/segment_001.mp4',
      false,
      24,
      { maxHeight: 720, quality: 'balanced' },
    );
    expect(exportClip).toHaveBeenNthCalledWith(
      2,
      '/source/movie.mp4',
      4,
      9,
      '/workspace/assets/segment_clips/segment_012.mp4',
      false,
      24,
      { maxHeight: 720, quality: 'balanced' },
    );
    expect(updated.segments.map(segment => segment.clipPath)).toEqual([
      'assets/segment_clips/segment_001.mp4',
      'assets/segment_clips/segment_012.mp4',
    ]);
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
  });
});
