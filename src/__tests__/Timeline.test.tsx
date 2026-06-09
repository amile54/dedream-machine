import React from 'react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timeline } from '../components/timeline/Timeline';
import { useProjectStore } from '../stores/projectStore';
import { useVideoStore } from '../stores/videoStore';
import { useTimelineStore } from '../stores/timelineStore';

vi.mock('../services/ffmpegService', () => ({
  detectSceneChange: vi.fn(),
}));

vi.mock('../hooks/useThumbnailExtractor', async () => {
  const ReactActual = await vi.importActual<typeof React>('react');
  return {
    useThumbnailExtractor: () => ({
      thumbnailCache: ReactActual.useRef(new Map()),
      extractionQueueRef: ReactActual.useRef([]),
      extractVideoRef: ReactActual.useRef<HTMLVideoElement | null>(null),
      getThumbnailInterval: () => 1,
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)) as unknown as HTMLCanvasElement['getContext'];

  useProjectStore.setState({
    workspace: '/test/workspace',
    project: {
      videoFilePath: '/test/workspace/movie.mp4',
      proxyFilePath: 'proxy.mp4',
      segments: [
        {
          id: 'segment-1',
          index: 1,
          startTime: 0,
          endTime: 10,
          description: '',
          category: '',
        },
      ],
      textBlocks: [],
      sceneBlocks: [],
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { title: '', sourceUrl: '', videoId: '' },
    },
    rootProject: null,
    activeAssetId: null,
    isDirty: false,
    isLoading: false,
    undoStack: [],
  });

  useVideoStore.setState({
    videoRef: null,
    isPlaying: false,
    currentTime: 0,
    duration: 10,
    fps: 24,
    fpsConfirmed: true,
    volume: 1,
    proxyUrl: 'http://127.0.0.1:58137/stream?path=%2Ftest%2Fworkspace%2Fproxy.mp4',
    originalVideoPath: '/test/workspace/movie.mp4',
    isTranscoding: false,
    transcodingProgress: 0,
    playbackRate: 1,
  });

  useTimelineStore.setState({
    pixelsPerSecond: 20,
    selectedSegmentId: null,
  });
});

describe('Timeline thumbnails', () => {
  it('uses CORS-clean hidden videos for canvas thumbnail extraction', () => {
    const { container } = render(<Timeline />);

    const videos = Array.from(container.querySelectorAll('video'));

    expect(videos).toHaveLength(2);
    expect(videos.every(video => video.crossOrigin === 'anonymous')).toBe(true);
  });
});
