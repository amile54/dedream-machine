import type { AssetCategory } from '../types';

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
    'png',
    'jpg',
    'jpeg',
    'webp',
    'gif',
    'bmp',
    'tif',
    'tiff',
]);

export interface ManualImageImportPlanInput {
    workspace: string;
    sourcePath: string;
    category: AssetCategory;
    assetName: string;
    now?: number;
}

export interface ManualImageImportPlan {
    sourcePath: string;
    targetDir: string;
    targetPath: string;
    relativePath: string;
}

function pathJoin(...parts: string[]): string {
    return parts
        .map((part, index) => {
            const normalized = part.replace(/\\/g, '/');
            if (index === 0) return normalized.replace(/\/+$/g, '');
            return normalized.replace(/^\/+|\/+$/g, '');
        })
        .filter(Boolean)
        .join('/');
}

function basename(path: string): string {
    return path.replace(/\\/g, '/').split('/').pop() || 'image';
}

function sanitizePathSegment(value: string): string {
    const cleaned = value
        .replace(/[\/\\:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || '未命名资产';
}

export function isSupportedImagePath(path: string): boolean {
    const name = basename(path);
    const dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return false;
    return SUPPORTED_IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

export function buildManualImageImportPlan({
    workspace,
    sourcePath,
    category,
    assetName,
    now = Date.now(),
}: ManualImageImportPlanInput): ManualImageImportPlan {
    const safeAssetName = sanitizePathSegment(assetName);
    const sourceName = basename(sourcePath);
    const filename = `${now}_${sourceName}`;
    const relativePath = pathJoin('assets', category, safeAssetName, filename);
    const targetDir = pathJoin(workspace, 'assets', category, safeAssetName);
    return {
        sourcePath,
        targetDir,
        targetPath: pathJoin(workspace, relativePath),
        relativePath,
    };
}
