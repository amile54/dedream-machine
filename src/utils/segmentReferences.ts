import type { Asset, SegmentReference } from '../types';

export interface ReferenceImageOption extends SegmentReference {
    assetName: string;
    label: string;
    tags: string[];
}

function basename(path: string): string {
    return path.replace(/\\/g, '/').split('/').pop() || path;
}

export function collectReferenceImageOptions(assets: Asset[]): ReferenceImageOption[] {
    const options: ReferenceImageOption[] = [];
    for (const asset of assets || []) {
        for (const file of asset.files || []) {
            if (file.type !== 'screenshot') continue;
            const tags = file.tags || [];
            const tagLabel = tags.length ? ` · ${tags.join(' / ')}` : '';
            options.push({
                assetId: asset.id,
                filePath: file.path,
                assetName: asset.name,
                tags,
                label: `${asset.name} / ${basename(file.path)}${tagLabel}`,
            });
        }
    }
    return options;
}
