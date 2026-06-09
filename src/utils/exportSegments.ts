import type { Project, Segment } from '../types';
import { exportClip as defaultExportClip } from '../services/ffmpegService';
import type { ExportClipOptions } from '../services/ffmpegService';
import { join } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';

type ExportClipFn = typeof defaultExportClip;

interface ExportProjectSegmentsAsClipsParams {
  project: Project;
  workspace: string;
  sourceVideoPath: string;
  fps: number;
  exportClip?: ExportClipFn;
}

const SEGMENT_CLIP_DIR = ['assets', 'segment_clips'];
const DATASET_CLIP_OPTIONS: ExportClipOptions = {
  maxHeight: 720,
  quality: 'balanced',
};

function clipFilename(segment: Segment): string {
  const paddedIndex = String(segment.index).padStart(3, '0');
  return `segment_${paddedIndex}.mp4`;
}

function isValidSegmentRange(segment: Segment): boolean {
  return Number.isFinite(segment.startTime)
    && Number.isFinite(segment.endTime)
    && segment.endTime > segment.startTime;
}

export async function exportProjectSegmentsAsClips({
  project,
  workspace,
  sourceVideoPath,
  fps,
  exportClip = defaultExportClip,
}: ExportProjectSegmentsAsClipsParams): Promise<Project> {
  const outputDir = await join(workspace, ...SEGMENT_CLIP_DIR);
  await mkdir(outputDir, { recursive: true });

  const updatedSegments: Segment[] = [];

  for (const segment of project.segments || []) {
    if (!isValidSegmentRange(segment)) {
      updatedSegments.push(segment);
      continue;
    }

    const filename = clipFilename(segment);
    const relativePath = [...SEGMENT_CLIP_DIR, filename].join('/');
    const outputPath = await join(workspace, ...SEGMENT_CLIP_DIR, filename);

    await exportClip(
      sourceVideoPath,
      segment.startTime,
      segment.endTime,
      outputPath,
      false,
      fps,
      DATASET_CLIP_OPTIONS,
    );

    updatedSegments.push({
      ...segment,
      clipPath: relativePath,
    });
  }

  return {
    ...project,
    segments: updatedSegments,
    updatedAt: new Date().toISOString(),
  };
}
