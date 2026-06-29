import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetSidebar } from '../components/assets/AssetSidebar';
import { useProjectStore } from '../stores/projectStore';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockImplementation(() => true);

  useProjectStore.setState({
    workspace: '/test/workspace',
    project: {
      videoFilePath: '/test/workspace/media/movie.mp4',
      segments: [],
      textBlocks: [],
      sceneBlocks: [],
      assets: [
        {
          id: 'asset-1',
          name: '玉夫人',
          category: 'character',
          description: '',
          detail: '',
          createdAt: new Date().toISOString(),
          files: [
            { path: 'assets/character/玉夫人/look.png', type: 'screenshot' },
            { path: 'assets/character/玉夫人/clip.mp4', type: 'clip' },
            { path: 'assets/character/玉夫人/audio.mp3', type: 'audio' },
          ],
        },
      ],
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
});

describe('AssetSidebar', () => {
  it('allows every asset file type to edit tags', () => {
    render(<AssetSidebar />);

    fireEvent.click(screen.getByDisplayValue('玉夫人').closest('.asset-item-header')!);

    expect(screen.getByText('look.png')).toBeInTheDocument();
    expect(screen.getByText('clip.mp4')).toBeInTheDocument();
    expect(screen.getByText('audio.mp3')).toBeInTheDocument();
    const tagInputs = screen.getAllByPlaceholderText('输入标签，回车/空格/逗号确认');
    expect(tagInputs).toHaveLength(3);

    fireEvent.change(tagInputs[2], { target: { value: '环境音' } });
    fireEvent.keyDown(tagInputs[2], { key: 'Enter' });

    expect(useProjectStore.getState().project!.assets[0].files[2].tags).toEqual(['环境音']);
  });
});
