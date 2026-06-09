import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { repairLoadedProjectPaths, serializeProjectPaths, useProjectStore } from '../stores/projectStore';
import { useVideoStore } from '../stores/videoStore';
import type { Project } from '../types';

const invokeMock = vi.mocked(invoke);
const openMock = vi.mocked(open);

function makeProject(): Project {
  return {
    videoFilePath: '/test/workspace/media/movie.mp4',
    proxyFilePath: '/test/workspace/proxy.mp4',
    subtitleFilePath: '/test/workspace/assets/subtitles/main.srt',
    segments: [
      {
        id: 'segment-1',
        index: 1,
        startTime: 0,
        endTime: 12,
        description: 'Opening shot',
        category: '正常',
        references: [
          {
            assetId: 'asset-1',
            filePath: '/test/workspace/assets/character/Hero/look.png',
          },
        ],
        clipPath: '/test/workspace/assets/segment_clips/segment_001.mp4',
      },
    ],
    textBlocks: [],
    sceneBlocks: [
      {
        id: 'scene-1',
        sceneInfo: '第 1 场',
        startSegmentIndex: 1,
        endSegmentIndex: 1,
        summary: 'Scene context',
        detail: 'Reference answer for scene analysis',
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    assets: [
      {
        id: 'asset-1',
        name: 'Scene 01',
        category: 'segment_analysis',
        description: '',
        detail: 'Reference answer for asset analysis',
        createdAt: new Date().toISOString(),
        files: [
          {
            path: '/test/workspace/assets/segment_analysis/Scene 01/clip.mp4',
            type: 'clip',
            timestamp: 12,
            tags: ['night', 'wide shot'],
          },
        ],
        subProjectData: {
          videoFilePath: '/test/workspace/assets/segment_analysis/Scene 01/clip.mp4',
          proxyFilePath: '/test/workspace/assets/segment_analysis/Scene 01/clip.mp4',
          subtitleFilePath: '/test/workspace/assets/subtitles/scene-01.srt',
          segments: [],
          textBlocks: [],
          sceneBlocks: [],
          assets: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: { title: 'Scene 01', sourceUrl: '', videoId: '' },
        },
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: { title: 'Movie', sourceUrl: '', videoId: '' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.setState({
    workspace: '/test/workspace',
    project: null,
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
    duration: 100,
    fps: 24,
    fpsConfirmed: true,
    volume: 1,
    proxyUrl: null,
    originalVideoPath: null,
    isTranscoding: false,
    transcodingProgress: 0,
    playbackRate: 1,
  });
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

describe('project persistence', () => {
  it('serializes workspace-owned paths recursively before saving', () => {
    const serialized = serializeProjectPaths(makeProject(), '/test/workspace');

    expect(serialized.videoFilePath).toBe('media/movie.mp4');
    expect(serialized.proxyFilePath).toBe('proxy.mp4');
    expect(serialized.subtitleFilePath).toBe('assets/subtitles/main.srt');
    expect(serialized.segments[0].references?.[0].filePath).toBe('assets/character/Hero/look.png');
    expect(serialized.segments[0].clipPath).toBe('assets/segment_clips/segment_001.mp4');
    expect(serialized.assets[0].files[0].path).toBe('assets/segment_analysis/Scene 01/clip.mp4');
    expect(serialized.assets[0].subProjectData?.videoFilePath).toBe('assets/segment_analysis/Scene 01/clip.mp4');
    expect(serialized.assets[0].subProjectData?.subtitleFilePath).toBe('assets/subtitles/scene-01.srt');
  });

  it('preserves Studio conversion metadata fields while serializing', () => {
    const serialized = serializeProjectPaths(makeProject(), '/test/workspace');

    expect(serialized.sceneBlocks[0]).toMatchObject({
      sceneInfo: '第 1 场',
      summary: 'Scene context',
      detail: 'Reference answer for scene analysis',
    });
    expect(serialized.assets[0]).toMatchObject({
      description: '',
      detail: 'Reference answer for asset analysis',
    });
    expect(serialized.assets[0].files[0].tags).toEqual(['night', 'wide shot']);
    expect(serialized.segments[0].references).toEqual([
      {
        assetId: 'asset-1',
        filePath: 'assets/character/Hero/look.png',
      },
    ]);
    expect(serialized.segments[0].clipPath).toBe('assets/segment_clips/segment_001.mp4');
  });

  it('repairs legacy segment-analysis subprojects to use their local clip path', () => {
    const legacyProject = makeProject();
    legacyProject.assets[0].files = [
      {
        path: 'assets/segment_analysis/Scene 01/clip.mp4',
        type: 'clip',
        timestamp: 12,
      },
    ];
    legacyProject.assets[0].subProjectData = {
      ...legacyProject.assets[0].subProjectData!,
      videoFilePath: '/old/workspace/assets/segment_analysis/Scene 01/clip.mp4',
      proxyFilePath: '/old/workspace/assets/segment_analysis/Scene 01/clip.mp4',
    };

    const repaired = repairLoadedProjectPaths(legacyProject, '/test/workspace');

    expect(repaired.assets[0].subProjectData?.videoFilePath).toBe('assets/segment_analysis/Scene 01/clip.mp4');
    expect(repaired.assets[0].subProjectData?.proxyFilePath).toBe('assets/segment_analysis/Scene 01/clip.mp4');
  });

  it('passes the portable project payload to save_project', async () => {
    invokeMock.mockResolvedValue(undefined);
    useProjectStore.setState({
      workspace: '/test/workspace',
      project: makeProject(),
      isDirty: true,
    });

    await useProjectStore.getState().saveProject();

    expect(invokeMock).toHaveBeenCalledWith('save_project', {
      workspace: '/test/workspace',
      project: expect.objectContaining({
        videoFilePath: 'media/movie.mp4',
        proxyFilePath: 'proxy.mp4',
        subtitleFilePath: 'assets/subtitles/main.srt',
      }),
    });
  });

  it('keeps the current project open when auto-save fails during switch', async () => {
    const project = makeProject();
    const failingSave = vi.fn().mockRejectedValue(new Error('disk full'));

    useProjectStore.setState({
      workspace: '/test/workspace',
      project,
      isDirty: true,
      saveProject: failingSave,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);

    openMock.mockResolvedValue('/another/workspace');

    await useProjectStore.getState().switchProject();

    expect(failingSave).toHaveBeenCalled();
    expect(openMock).not.toHaveBeenCalled();
    expect(useProjectStore.getState().workspace).toBe('/test/workspace');
    expect(useProjectStore.getState().project).toEqual(project);
    expect(window.alert).toHaveBeenCalled();
  });

  it('loads proxy paths without mutating them to absolute form', async () => {
    const project = {
      ...makeProject(),
      videoFilePath: 'media/movie.mp4',
      proxyFilePath: 'proxy.mp4',
      subtitleFilePath: 'assets/subtitles/main.srt',
    };

    invokeMock.mockImplementation(async (cmd, args) => {
      if (cmd === 'ensure_workspace_dirs') return undefined;
      if (cmd === 'load_project') return project;
      if (cmd === 'check_file_exists') {
        expect(args).toEqual({ path: '/test/workspace/proxy.mp4' });
        return true;
      }
      return undefined;
    });

    const hasProject = await useProjectStore.getState().loadProject('/test/workspace');

    expect(hasProject).toBe(true);
    expect(useProjectStore.getState().project?.proxyFilePath).toBe('proxy.mp4');
  });

  it('repairs legacy absolute subproject clip paths during load', async () => {
    const project = {
      ...makeProject(),
      assets: [
        {
          ...makeProject().assets[0],
          files: [
            {
              path: 'assets/segment_analysis/Scene 01/clip.mp4',
              type: 'clip' as const,
              timestamp: 12,
            },
          ],
          subProjectData: {
            ...makeProject().assets[0].subProjectData!,
            videoFilePath: '/old/workspace/assets/segment_analysis/Scene 01/clip.mp4',
            proxyFilePath: '/old/workspace/assets/segment_analysis/Scene 01/clip.mp4',
          },
        },
      ],
    };

    invokeMock.mockImplementation(async (cmd) => {
      if (cmd === 'ensure_workspace_dirs') return undefined;
      if (cmd === 'load_project') return project;
      if (cmd === 'check_file_exists') return true;
      return undefined;
    });

    await useProjectStore.getState().loadProject('/test/workspace');

    const loadedSubProject = useProjectStore.getState().project?.assets[0].subProjectData;
    expect(loadedSubProject?.videoFilePath).toBe('assets/segment_analysis/Scene 01/clip.mp4');
    expect(loadedSubProject?.proxyFilePath).toBe('assets/segment_analysis/Scene 01/clip.mp4');
  });
});
