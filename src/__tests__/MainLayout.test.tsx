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
  it('saves metadata-only segment timing before exporting a zip archive', async () => {
    const saveProjectMock = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ saveProject: saveProjectMock });
    saveDialogMock.mockResolvedValue('/tmp/Movie_Data.zip');
    invokeMock.mockResolvedValue(undefined);

    render(<MainLayout />);

    fireEvent.click(screen.getByRole('button', { name: /导出打包/ }));

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
    expect(exportProjectSegmentsAsClipsMock).not.toHaveBeenCalled();
    expect(saveProjectMock.mock.invocationCallOrder[0]).toBeLessThan(exportCallOrder!);
    expect(useProjectStore.getState().project?.segments[0]).toEqual(expect.objectContaining({
      startTime: 0,
      endTime: 4,
    }));
    expect(useProjectStore.getState().project?.segments[0].clipPath).toBeUndefined();
  });

  it('shows export progress and prevents duplicate exports while packaging', async () => {
    const saveProjectMock = vi.fn().mockResolvedValue(undefined);
    useProjectStore.setState({ saveProject: saveProjectMock });
    saveDialogMock.mockResolvedValue('/tmp/Movie_Data.zip');

    let resolveExport: () => void = () => {};
    invokeMock.mockImplementation(() => new Promise<void>((resolve) => {
      resolveExport = resolve;
    }));

    render(<MainLayout />);

    const exportButton = screen.getByRole('button', { name: /导出打包/ });
    fireEvent.click(exportButton);

    expect(await screen.findByText(/正在导出/)).toBeInTheDocument();
    expect(await screen.findByText(/正在写入 zip/)).toBeInTheDocument();

    fireEvent.click(exportButton);
    expect(saveProjectMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolveExport();

    await waitFor(() => {
      expect(screen.queryByText(/正在导出/)).not.toBeInTheDocument();
    });
  });
});
