import { describe, expect, it } from 'vitest';
import { buildManualImageImportPlan, isSupportedImagePath } from '../utils/assetImport';

describe('manual asset image import helpers', () => {
  it('accepts common image extensions only', () => {
    expect(isSupportedImagePath('/tmp/look.png')).toBe(true);
    expect(isSupportedImagePath('/tmp/look.JPG')).toBe(true);
    expect(isSupportedImagePath('/tmp/look.webp')).toBe(true);
    expect(isSupportedImagePath('/tmp/look.mp4')).toBe(false);
    expect(isSupportedImagePath('/tmp/look')).toBe(false);
  });

  it('builds a workspace-local destination and relative asset file path', () => {
    const plan = buildManualImageImportPlan({
      workspace: '/workspace/movie',
      sourcePath: '/Users/me/Desktop/hero look.png',
      category: 'character',
      assetName: '玉夫人 / 朝服',
      now: 1710000000000,
    });

    expect(plan.targetDir).toBe('/workspace/movie/assets/character/玉夫人 _ 朝服');
    expect(plan.targetPath).toBe('/workspace/movie/assets/character/玉夫人 _ 朝服/1710000000000_hero look.png');
    expect(plan.relativePath).toBe('assets/character/玉夫人 _ 朝服/1710000000000_hero look.png');
  });
});
