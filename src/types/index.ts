// === Data Types for DeDream Machine ===

export interface Segment {
  id: string;
  index: number;
  startTime: number; // seconds
  endTime: number;   // seconds
  description: string;
  category: string;
}

export type TextBlockType =
  | 'subplot'
  | 'mainPlot'
  | 'act'
  | 'synopsis'
  | 'custom';

export interface TextBlock {
  id: string;
  title: string;
  content: string;
  blockType: TextBlockType;
  sortOrder: number;
}

export type AssetCategory =
  | 'character'
  | 'scene'
  | 'prop'
  | 'visual'
  | 'segment_analysis'
  | 'other';

export interface AssetFile {
  path: string;          // relative to workspace
  timestamp?: number;    // video time where this was captured
  type: 'screenshot' | 'clip' | 'audio';
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  description: string;
  createdAt: string;
  files: AssetFile[];
}

export interface Project {
  metadata?: {
    title: string;
    sourceUrl: string;
    videoId: string;
  };
  videoFilePath: string;
  proxyFilePath?: string;
  segments: Segment[];
  textBlocks: TextBlock[];
  assets: Asset[];
  subtitleFilePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubtitleCue {
  index: number;
  startTime: number;
  endTime: number;
  text: string;
}

export const TEXT_BLOCK_TYPE_LABELS: Record<TextBlockType, string> = {
  subplot: '小情节',
  mainPlot: '大情节',
  act: '幕',
  synopsis: '故事梗概',
  custom: '自定义',
};

export const ASSET_CATEGORIES: { value: AssetCategory; label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'scene', label: '场景' },
  { value: 'prop', label: '道具' },
  { value: 'visual', label: '视觉设定' },
  { value: 'segment_analysis', label: '片段分析' },
  { value: 'other', label: '其它资产' }
];

export const SEGMENT_CATEGORIES = [
  '正常',
  '片头',
  '片尾',
  '特殊切镜',
  '其他',
];
