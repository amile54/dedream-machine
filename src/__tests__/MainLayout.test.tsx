import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { MainLayout } from '../components/layout/MainLayout';
import { useProjectStore } from '../stores/projectStore';
import { exportProjectSegmentsAsClips } from '../utils/exportSegments';

const exportSegmentsMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/exportSegments', () => ({
  exportProjectSegmentsAsClips: exportSegmentsMock,
}));

vi.mock('react-split', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/video/VideoPlayer', () => ({
  VideoPlayer: () => <div data-testid="video-player" />,
}));

vi.mock('../components/timeline/Timeline', () => ({
  Timeline: () => <div data-testid="timeline" />,
}));

vi.mock('../components/segments/SegmentList', () => ({
  SegmentList: () => <div data-testid="segment-list" />,
}));

vi.mock('../components/analysis/TextBlocks', () => ({
  TextBlocks: () => <div data-testid="text-blocks" />,
}));

vi.mock('../components/assets/AssetSidebar', () => ({
  AssetSidebar: () => <div data-testid="asset-sidebar" />,
}));

const invokeMock = vi.mocked(invoke);
const saveDialogMock = vi.mocked(save);
const exportProjectSegmentsAsClipsMock = vi.mocked(exportProjectSegmentsAsClips);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'alert').mockImplementation(() => {});

  useProjectStore.setState({
    workspace: '/test/workspace',
    project: {
      videoFilePath: '/test/workspace/movie.mp4',
      segments: [
        {
          id: 'segment-1',
          index: 1,
          startTime: 0,
          endTime: 4,
          description: '',
          category: '',
        },
      ],
      textBlocks: [],
      sceneBlocks: [],
      assets: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { title: 'Movie', sourceUrl: '', videoId: '' },
    },
    rootProject: null,
    activeAssetId: null,
    isDirty: true,
    isLoading: false,
    undoStack: [],
  });
});

describe('MainLayout export', () => {
  it('saves the current project before exporting a zip archive', async () => {
    const saveProjectMock = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ saveProject: saveProjectMock });
    saveDialogMock.mockResolvedValue('/tmp/Movie_Data.zip');
    invokeMock.mockResolvedValue(undefined);
    exportProjectSegmentsAsClipsMock.mockImplementation(async ({ project }) => ({
      ...project,
      segments: project.segments.map(segment => ({
        ...segment,
        clipPath: 'assets/segment_clips/segment_001.mp4',
      })),
    }));

    render(<MainLayout />);

    fireEvent.click(screen.getByRole('button', { name: /导出打包/ }));

    await waitFor(() => {
      expect(exportProjectSegmentsAsClipsMock).toHaveBeenCalledWith(expect.objectContaining({
        workspace: '/test/workspace',
        sourceVideoPath: '/test/workspace/movie.mp4',
      }));
    });
    await waitFor(() => {
      expect(saveProjectMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('export_project_zip', {
        workspace: '/test/workspace',
        outputPath: '/tmp/Movie_Data.zip',
      });
    });

    const exportCallOrder = invokeMock.mock.invocationCallOrder.find((_, index) => {
      return invokeMock.mock.calls[index]?.[0] === 'export_project_zip';
    });
    expect(exportProjectSegmentsAsClipsMock.mock.invocationCallOrder[0]).toBeLessThan(saveProjectMock.mock.invocationCallOrder[0]);
    expect(saveProjectMock.mock.invocationCallOrder[0]).toBeLessThan(exportCallOrder!);
    expect(useProjectStore.getState().project?.segments[0].clipPath).toBe('assets/segment_clips/segment_001.mp4');
  });
});
