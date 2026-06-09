import { describe, expect, it } from 'vitest';
import { collectReferenceImageOptions } from '../utils/segmentReferences';
import type { Asset } from '../types';

describe('segment reference helpers', () => {
  it('collects only screenshot files as reference options', () => {
    const assets: Asset[] = [
      {
        id: 'a1',
        name: '玉夫人',
        category: 'character',
        description: '',
        detail: '',
        createdAt: '',
        files: [
          { path: 'assets/character/玉夫人/look.png', type: 'screenshot', tags: ['青衣'] },
          { path: 'assets/character/玉夫人/audio.mp3', type: 'audio' },
        ],
      },
    ];

    expect(collectReferenceImageOptions(assets)).toEqual([
      {
        assetId: 'a1',
        filePath: 'assets/character/玉夫人/look.png',
        assetName: '玉夫人',
        tags: ['青衣'],
        label: '玉夫人 / look.png · 青衣',
      },
    ]);
  });
});
