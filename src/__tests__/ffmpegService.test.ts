import { describe, expect, it } from 'vitest';
import { buildExportClipArgs } from '../services/ffmpegService';

describe('ffmpegService export clip args', () => {
  it('keeps existing high-quality defaults when no export options are provided', () => {
    const args = buildExportClipArgs({
      inputPath: '/movie/source.mp4',
      startTime: 1,
      endTime: 5,
      outputPath: '/out/clip.mp4',
      fps: 24,
    });

    expect(args).toContain('-crf');
    expect(args[args.indexOf('-crf') + 1]).toBe('18');
    expect(args).not.toContain('-vf');
  });

  it('supports 720p dataset clips with configurable quality', () => {
    const args = buildExportClipArgs({
      inputPath: '/movie/source.mp4',
      startTime: 1,
      endTime: 5,
      outputPath: '/out/clip.mp4',
      fps: 24,
      options: {
        maxHeight: 720,
        quality: 'balanced',
      },
    });

    expect(args).toContain('-vf');
    expect(args[args.indexOf('-vf') + 1]).toBe('scale=-2:min(720\\,ih)');
    expect(args).toContain('-crf');
    expect(args[args.indexOf('-crf') + 1]).toBe('26');
  });

  it('exports audio-only clips as MP3-compatible streams', () => {
    const args = buildExportClipArgs({
      inputPath: '/movie/source.mp4',
      startTime: 10,
      endTime: 20,
      outputPath: '/out/audio.mp3',
      isAudio: true,
    });

    expect(args).toContain('-vn');
    expect(args).toContain('-map');
    expect(args[args.indexOf('-map') + 1]).toBe('0:a:0');
    expect(args).toContain('-c:a');
    expect(args[args.indexOf('-c:a') + 1]).toBe('libmp3lame');
    expect(args).not.toContain('aac');
    expect(args).not.toContain('-c:v');
  });
});
