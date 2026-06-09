import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../stores/projectStore';
import { useVideoStore } from '../stores/videoStore';
import { TEXT_BLOCK_TYPE_LABELS } from '../types';

// Reset stores before each test
beforeEach(() => {
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
});

function createTestProject() {
  useProjectStore.getState().createNewProject('/test/video.mp4');
  const store = useProjectStore.getState();
  // Manually set up a project with initial segment
  useProjectStore.setState({
    project: {
      ...store.project!,
      segments: [
        {
          id: 'seg-1',
          index: 1,
          startTime: 0,
          endTime: 100,
          description: 'First segment',
          category: 'normal',
          notes: 'Initial notes',
        },
      ],
    },
  });
}

describe('projectStore', () => {
  describe('createNewProject', () => {
    it('creates an empty project', () => {
      useProjectStore.getState().createNewProject('/test/video.mp4');
      const project = useProjectStore.getState().project;
      expect(project).not.toBeNull();
      expect(project!.videoFilePath).toBe('/test/video.mp4');
      expect(project!.segments).toEqual([]);
      expect(project!.textBlocks).toEqual([]);
      expect(project!.sceneBlocks).toEqual([]);
      expect(project!.assets).toEqual([]);
    });

    it('marks the project as dirty', () => {
      useProjectStore.getState().createNewProject('/test/video.mp4');
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('clears undo stack', () => {
      useProjectStore.setState({ undoStack: [[], []] });
      useProjectStore.getState().createNewProject('/test/video.mp4');
      expect(useProjectStore.getState().undoStack).toEqual([]);
    });
  });

  describe('addCutPoint', () => {
    beforeEach(createTestProject);

    it('splits a segment at the given time', () => {
      useProjectStore.getState().addCutPoint(50);
      const segments = useProjectStore.getState().project!.segments;
      expect(segments).toHaveLength(2);
      expect(segments[0].endTime).toBeCloseTo(50, 1);
      expect(segments[1].startTime).toBeCloseTo(50, 1);
    });

    it('preserves description and notes from original segment', () => {
      useProjectStore.getState().addCutPoint(50);
      const segments = useProjectStore.getState().project!.segments;
      // The first segment (matching startTime 0) should keep original data
      expect(segments[0].description).toBe('First segment');
      expect(segments[0].notes).toBe('Initial notes');
    });

    it('does not add duplicate cut points', () => {
      useProjectStore.getState().addCutPoint(50);
      useProjectStore.getState().addCutPoint(50.05); // Within 0.1s tolerance
      const segments = useProjectStore.getState().project!.segments;
      expect(segments).toHaveLength(2);
    });

    it('pushes to undo stack', () => {
      useProjectStore.getState().addCutPoint(50);
      expect(useProjectStore.getState().undoStack).toHaveLength(1);
    });

    it('caps undo stack at 50 entries', () => {
      // Fill undo stack
      useProjectStore.setState({ undoStack: new Array(50).fill([]) });
      useProjectStore.getState().addCutPoint(50);
      expect(useProjectStore.getState().undoStack.length).toBeLessThanOrEqual(50);
    });
  });

  describe('removeCutPoint', () => {
    beforeEach(() => {
      createTestProject();
      useProjectStore.getState().addCutPoint(30);
      useProjectStore.getState().addCutPoint(60);
    });

    it('merges segments when cutting point is removed', () => {
      const before = useProjectStore.getState().project!.segments;
      expect(before).toHaveLength(3);

      useProjectStore.getState().removeCutPoint(0); // remove cut at 30
      const after = useProjectStore.getState().project!.segments;
      expect(after).toHaveLength(2);
    });
  });

  describe('moveCutPoint', () => {
    beforeEach(() => {
      createTestProject();
      useProjectStore.getState().addCutPoint(50);
      // Clear undo stack to isolate test
      useProjectStore.setState({ undoStack: [] });
    });

    it('moves a cut point to a new time', () => {
      useProjectStore.getState().moveCutPoint(0, 40);
      const segments = useProjectStore.getState().project!.segments;
      expect(segments[1].startTime).toBeCloseTo(40, 1);
    });

    it('preserves notes during cut point drag (M1 fix)', () => {
      // Add notes to segment
      const segments = useProjectStore.getState().project!.segments;
      useProjectStore.getState().updateSegment(segments[0].id, { notes: 'My notes' });
      useProjectStore.getState().updateSegment(segments[1].id, { notes: 'Other notes' });

      useProjectStore.getState().moveCutPoint(0, 40);
      const after = useProjectStore.getState().project!.segments;
      expect(after[0].notes).toBe('My notes');
      expect(after[1].notes).toBe('Other notes');
    });

    it('preserves segment references during cut point drag', () => {
      const segments = useProjectStore.getState().project!.segments;
      useProjectStore.getState().addSegmentReference(segments[0].id, {
        assetId: 'asset-1',
        filePath: 'assets/character/Hero/look.png',
      });

      useProjectStore.getState().moveCutPoint(0, 40);

      const after = useProjectStore.getState().project!.segments;
      expect(after[0].references).toEqual([
        { assetId: 'asset-1', filePath: 'assets/character/Hero/look.png' },
      ]);
    });

    it('clamps to boundaries', () => {
      useProjectStore.getState().moveCutPoint(0, -10);
      const segments = useProjectStore.getState().project!.segments;
      expect(segments[1].startTime).toBeGreaterThan(0);
    });
  });

  describe('undoSegments', () => {
    beforeEach(createTestProject);

    it('reverts to previous segment state', () => {
      const original = useProjectStore.getState().project!.segments;
      useProjectStore.getState().addCutPoint(50);
      expect(useProjectStore.getState().project!.segments).toHaveLength(2);

      useProjectStore.getState().undoSegments();
      expect(useProjectStore.getState().project!.segments).toHaveLength(1);
      expect(useProjectStore.getState().project!.segments[0].description).toBe(original[0].description);
    });

    it('does nothing when undo stack is empty', () => {
      useProjectStore.setState({ undoStack: [] });
      const before = useProjectStore.getState().project!.segments;
      useProjectStore.getState().undoSegments();
      expect(useProjectStore.getState().project!.segments).toEqual(before);
    });
  });

  describe('textBlocks', () => {
    beforeEach(createTestProject);

    it('adds a text block', () => {
      useProjectStore.getState().addTextBlock('synopsis', 'My Synopsis');
      const blocks = useProjectStore.getState().project!.textBlocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0].title).toBe('My Synopsis');
      expect(blocks[0].blockType).toBe('synopsis');
    });

    it('supports movie meta as a regular analysis text block', () => {
      expect(TEXT_BLOCK_TYPE_LABELS.movieMeta).toBe('影片 Meta');

      useProjectStore.getState().addTextBlock('movieMeta', TEXT_BLOCK_TYPE_LABELS.movieMeta);

      const blocks = useProjectStore.getState().project!.textBlocks;
      expect(blocks).toHaveLength(1);
      expect(blocks[0]).toEqual(expect.objectContaining({
        title: '影片 Meta',
        content: '',
        blockType: 'movieMeta',
        sortOrder: 0,
      }));
    });

    it('supports screenplay and user prompt project text blocks', () => {
      expect(TEXT_BLOCK_TYPE_LABELS.screenplay).toBe('剧本全文');
      expect(TEXT_BLOCK_TYPE_LABELS.userPrompt).toBe('题目 / User Prompt');

      useProjectStore.getState().addTextBlock('screenplay', TEXT_BLOCK_TYPE_LABELS.screenplay);
      useProjectStore.getState().addTextBlock('userPrompt', TEXT_BLOCK_TYPE_LABELS.userPrompt);

      const blocks = useProjectStore.getState().project!.textBlocks;
      expect(blocks).toHaveLength(2);
      expect(blocks[0]).toEqual(expect.objectContaining({
        title: '剧本全文',
        blockType: 'screenplay',
        sortOrder: 0,
      }));
      expect(blocks[1]).toEqual(expect.objectContaining({
        title: '题目 / User Prompt',
        blockType: 'userPrompt',
        sortOrder: 1,
      }));
    });

    it('removes a text block and reorders', () => {
      useProjectStore.getState().addTextBlock('act', 'Act 1');
      useProjectStore.getState().addTextBlock('act', 'Act 2');
      const blocks = useProjectStore.getState().project!.textBlocks;
      useProjectStore.getState().removeTextBlock(blocks[0].id);
      const after = useProjectStore.getState().project!.textBlocks;
      expect(after).toHaveLength(1);
      expect(after[0].sortOrder).toBe(0);
    });
  });

  describe('sceneBlocks', () => {
    beforeEach(createTestProject);

    it('adds a scene block with a segment range and analysis fields', () => {
      useProjectStore.getState().addSceneBlock();

      const scenes = useProjectStore.getState().project!.sceneBlocks || [];
      expect(scenes).toHaveLength(1);
      expect(scenes[0]).toEqual(expect.objectContaining({
        sceneInfo: '第 1 场',
        startSegmentIndex: 1,
        endSegmentIndex: 1,
        summary: '',
        detail: '',
        sortOrder: 0,
      }));
      expect(useProjectStore.getState().isDirty).toBe(true);
    });

    it('updates and removes a scene block', () => {
      useProjectStore.getState().addSceneBlock();
      const scene = useProjectStore.getState().project!.sceneBlocks![0];

      useProjectStore.getState().updateSceneBlock(scene.id, {
        sceneInfo: '第 12 场',
        startSegmentIndex: 2,
        endSegmentIndex: 4,
        summary: '庭院争执',
        detail: '中近景交替。',
      });

      const updated = useProjectStore.getState().project!.sceneBlocks![0];
      expect(updated.sceneInfo).toBe('第 12 场');
      expect(updated.startSegmentIndex).toBe(2);
      expect(updated.endSegmentIndex).toBe(4);
      expect(updated.summary).toBe('庭院争执');
      expect(updated.detail).toBe('中近景交替。');

      useProjectStore.getState().removeSceneBlock(scene.id);
      expect(useProjectStore.getState().project!.sceneBlocks).toEqual([]);
    });
  });

  describe('assets', () => {
    beforeEach(createTestProject);

    it('adds an asset', () => {
      useProjectStore.getState().addAsset('character', 'Hero');
      const assets = useProjectStore.getState().project!.assets;
      expect(assets).toHaveLength(1);
      expect(assets[0].name).toBe('Hero');
      expect(assets[0].category).toBe('character');
      expect(assets[0].description).toBe('');
      expect(assets[0].detail).toBe('');
    });

    it('adds a file to an asset', () => {
      useProjectStore.getState().addAsset('scene', 'Opening');
      const asset = useProjectStore.getState().project!.assets[0];
      useProjectStore.getState().addFileToAsset(asset.id, {
        path: 'assets/scene/Opening/screenshot.png',
        timestamp: 10.5,
        type: 'screenshot',
      });
      const updated = useProjectStore.getState().project!.assets[0];
      expect(updated.files).toHaveLength(1);
      expect(updated.files[0].type).toBe('screenshot');
    });

    it('updates tags on one asset file without changing sibling files', () => {
      useProjectStore.getState().addAsset('character', 'Hero');
      const asset = useProjectStore.getState().project!.assets[0];
      useProjectStore.getState().addFileToAsset(asset.id, {
        path: 'assets/character/Hero/look-a.png',
        timestamp: 10.5,
        type: 'screenshot',
      });
      useProjectStore.getState().addFileToAsset(asset.id, {
        path: 'assets/character/Hero/look-b.png',
        timestamp: 22,
        type: 'screenshot',
        tags: ['旧标签'],
      });

      useProjectStore.getState().updateAssetFile(asset.id, 'assets/character/Hero/look-a.png', {
        tags: ['青衣', '夜景'],
      });

      const updated = useProjectStore.getState().project!.assets[0];
      expect(updated.files[0].tags).toEqual(['青衣', '夜景']);
      expect(updated.files[1].tags).toEqual(['旧标签']);
      expect(useProjectStore.getState().isDirty).toBe(true);
    });
  });

  describe('segment references', () => {
    beforeEach(createTestProject);

    it('adds and removes concrete asset file references on a segment', () => {
      const segment = useProjectStore.getState().project!.segments[0];

      useProjectStore.getState().addSegmentReference(segment.id, {
        assetId: 'asset-1',
        filePath: 'assets/character/Hero/look.png',
      });
      useProjectStore.getState().addSegmentReference(segment.id, {
        assetId: 'asset-1',
        filePath: 'assets/character/Hero/look.png',
      });

      expect(useProjectStore.getState().project!.segments[0].references).toEqual([
        { assetId: 'asset-1', filePath: 'assets/character/Hero/look.png' },
      ]);

      useProjectStore.getState().removeSegmentReference(
        segment.id,
        'assets/character/Hero/look.png',
      );

      expect(useProjectStore.getState().project!.segments[0].references).toEqual([]);
    });
  });
});
