import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { VideoPlayer } from '../components/video/VideoPlayer';
import { useProjectStore } from '../stores/projectStore';
import { useVideoStore } from '../stores/videoStore';

const ffmpegMocks = vi.hoisted(() => ({
  backgroundTranscode: vi.fn(),
  getAudioTracks: vi.fn(),
  getSubtitleTracks: vi.fn(),
  quickProbe: vi.fn(),
  takeScreenshot: vi.fn(),
  getVideoInfo: vi.fn(),
  detectSceneChange: vi.fn(),
}));

vi.mock('../services/ffmpegService', () => ({
  backgroundTranscode: ffmpegMocks.backgroundTranscode,
  getAudioTracks: ffmpegMocks.getAudioTracks,
  getSubtitleTracks: ffmpegMocks.getSubtitleTracks,
  quickProbe: ffmpegMocks.quickProbe,
  takeScreenshot: ffmpegMocks.takeScreenshot,
  getVideoInfo: ffmpegMocks.getVideoInfo,
  detectSceneChange: ffmpegMocks.detectSceneChange,
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  ffmpegMocks.getAudioTracks.mockResolvedValue([
    { index: 0, codec: 'aac', language: 'chi', title: '国语', channels: 2 },
    { index: 1, codec: 'aac', language: 'eng', title: '英语', channels: 2 },
  ]);
  ffmpegMocks.getSubtitleTracks.mockResolvedValue([]);

  useProjectStore.setState({
    workspace: '/test/workspace',
    project: {
      videoFilePath: '/test/workspace/media/movie.mp4',
      proxyFilePath: '/test/workspace/proxy.mp4',
      subtitleFilePath: undefined,
      segments: [],
      textBlocks: [],
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { title: 'Movie', sourceUrl: '', videoId: '' },
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
    currentTime: 12,
    duration: 100,
    fps: 24,
    fpsConfirmed: true,
    volume: 1,
    proxyUrl: 'stream://initial',
    originalVideoPath: '/test/workspace/media/movie.mp4',
    isTranscoding: false,
    transcodingProgress: 0,
    playbackRate: 1,
  });
});

describe('VideoPlayer', () => {
  it('discards finished audio transcodes once the playback context changes', async () => {
    let resolveTranscode!: (path: string) => void;
    ffmpegMocks.backgroundTranscode.mockImplementation(
      () => new Promise<string>((resolve) => { resolveTranscode = resolve; })
    );

    render(<VideoPlayer />);

    fireEvent.click(screen.getByTitle('字幕'));
    await screen.findByText('🔊 音轨 (2)');
    fireEvent.click(screen.getByText(/英语/));

    expect(ffmpegMocks.backgroundTranscode).toHaveBeenCalled();

    act(() => {
      useProjectStore.setState({
        workspace: '/other/workspace',
        project: {
          ...useProjectStore.getState().project!,
          videoFilePath: '/other/workspace/media/other.mp4',
        },
      });
      useVideoStore.setState({
        proxyUrl: 'stream://other-project',
        isTranscoding: false,
        transcodingProgress: 0,
      });
    });

    await act(async () => {
      resolveTranscode('/test/workspace/proxy.mp4');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useVideoStore.getState().proxyUrl).toBe('stream://other-project');
    });
    expect(invokeMock).not.toHaveBeenCalledWith('get_stream_url', expect.anything());
  });
});
