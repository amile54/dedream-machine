import React, { useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { invoke } from '@tauri-apps/api/core';
import { ASSET_CATEGORIES } from '../../types';
import type { AssetCategory } from '../../types';
import { buildManualImageImportPlan, isSupportedImagePath } from '../../utils/assetImport';
import { addTagsFromDraft, removeTagAt } from '../../utils/assetTags';
import './AssetSidebar.css';

interface AssetTagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
}

const AssetTagInput: React.FC<AssetTagInputProps> = ({ tags, onChange }) => {
    const [draft, setDraft] = useState('');

    const commitDraft = () => {
        const next = addTagsFromDraft(tags, draft);
        if (next.length !== tags.length || next.some((tag, i) => tag !== tags[i])) {
            onChange(next);
        }
        setDraft('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === ',' || e.key === '，') {
            e.preventDefault();
            commitDraft();
        } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            e.preventDefault();
            onChange(tags.slice(0, -1));
        }
    };

    return (
        <div className="asset-tag-editor" onClick={(e) => e.stopPropagation()}>
            <div className="asset-tag-chip-row">
                {tags.map((tag, idx) => (
                    <span key={`${tag}-${idx}`} className="asset-tag-chip">
                        {tag}
                        <button
                            type="button"
                            className="asset-tag-remove"
                            onClick={() => onChange(removeTagAt(tags, idx))}
                            title={`删除标签 ${tag}`}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    className="asset-tag-draft-input"
                    value={draft}
                    placeholder={tags.length ? '继续输入标签...' : '输入标签，回车/空格/逗号确认'}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={commitDraft}
                />
            </div>
        </div>
    );
};

export const AssetSidebar: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const rootProject = useProjectStore(s => s.rootProject);
    const addAsset = useProjectStore(s => s.addAsset);
    const updateAsset = useProjectStore(s => s.updateAsset);
    const updateAssetFile = useProjectStore(s => s.updateAssetFile);
    const addFileToAsset = useProjectStore(s => s.addFileToAsset);
    const removeAsset = useProjectStore(s => s.removeAsset);

    const [expandedCategories, setExpandedCategories] = useState<Set<AssetCategory>>(
        new Set(['character', 'scene', 'prop', 'visual', 'other'])
    );
    const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
    const [newAssetNames, setNewAssetNames] = useState<Partial<Record<AssetCategory, string>>>({});
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [lightboxName, setLightboxName] = useState<string>('');
    const [lightboxType, setLightboxType] = useState<'screenshot' | 'clip' | 'audio'>('screenshot');

    if (!project) return null;

    const assetsByCategory = (project.assets || []).reduce((acc, asset) => {
        if (!acc[asset.category]) acc[asset.category] = [];
        acc[asset.category].push(asset);
        return acc;
    }, {} as Record<AssetCategory, typeof project.assets>);

    const toggleCategory = (category: AssetCategory) => {
        setExpandedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) next.delete(category);
            else next.add(category);
            return next;
        });
    };

    const toggleAsset = (id: string) => {
        setExpandedAssets(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleAddAsset = (category: AssetCategory) => {
        const name = newAssetNames[category]?.trim();
        if (name) {
            addAsset(category, name);
            setNewAssetNames(prev => ({ ...prev, [category]: '' }));
            setExpandedCategories(prev => new Set(prev).add(category));
        }
    };

    const handlePreviewFile = async (filePath: string, fileType: 'screenshot' | 'clip' | 'audio') => {
        try {
            const workspace = useProjectStore.getState().workspace;
            if (!workspace) return;
            const { join } = await import('@tauri-apps/api/path');
            const absolutePath = await join(workspace, filePath);
            const url = await invoke<string>('get_stream_url', { filePath: absolutePath });
            setLightboxUrl(url);
            setLightboxName(filePath.split('/').pop() || filePath);
            setLightboxType(fileType);
        } catch (err) {
            console.error('Failed to preview file:', err);
        }
    };

    const handleImportImage = async (assetId: string) => {
        const asset = project.assets.find(a => a.id === assetId);
        const workspace = useProjectStore.getState().workspace;
        if (!asset || !workspace) return;

        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                multiple: true,
                title: `导入图片到 ${asset.name}`,
                filters: [
                    { name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tif', 'tiff'] },
                ],
            });
            if (!selected) return;

            const files = Array.isArray(selected) ? selected : [selected];
            const imageFiles = files.filter(isSupportedImagePath);
            if (imageFiles.length === 0) {
                alert('没有可导入的图片文件。');
                return;
            }

            const { copyFile, mkdir } = await import('@tauri-apps/plugin-fs');
            const importStartedAt = Date.now();
            for (const [index, sourcePath] of imageFiles.entries()) {
                const plan = buildManualImageImportPlan({
                    workspace,
                    sourcePath,
                    category: asset.category,
                    assetName: asset.name,
                    now: importStartedAt + index,
                });
                await mkdir(plan.targetDir, { recursive: true });
                await copyFile(plan.sourcePath, plan.targetPath);
                addFileToAsset(asset.id, {
                    path: plan.relativePath,
                    type: 'screenshot',
                    tags: [],
                });
            }
        } catch (err) {
            console.error('Failed to import asset image:', err);
            alert(`导入图片失败: ${err}`);
        }
    };

    const mainContent = (
        <div className="asset-sidebar">
            <div className="asset-sidebar-header">
                <h3>资产管理</h3>
            </div>
            <div className="asset-sidebar-content">
                {ASSET_CATEGORIES
                    // Hide segment_analysis inside sub-projects
                    .filter(cat => !(cat.value === 'segment_analysis' && !!rootProject))
                    .map(({ value: category, label }) => {
                    const categoryAssets = assetsByCategory[category] || [];
                    const isExpanded = expandedCategories.has(category);

                    return (
                        <div key={category} className="asset-category">
                            <div
                                className="asset-category-header"
                                onClick={() => toggleCategory(category)}
                            >
                                <svg
                                    className={`chevron-icon ${isExpanded ? 'expanded' : ''}`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polyline points="9 18 15 12 9 6"></polyline>
                                </svg>
                                <span className="category-label">{label}</span>
                                <span className="category-count">{categoryAssets.length}</span>
                            </div>

                            {isExpanded && (
                                <div className="asset-category-body">
                                    {/* segment_analysis items are created via clip export, not manually */}
                                    {category !== 'segment_analysis' ? (
                                        <div className="add-asset-row">
                                            <input
                                                type="text"
                                                placeholder={`添加${label}...`}
                                                value={newAssetNames[category] || ''}
                                                onChange={(e) => setNewAssetNames(prev => ({ ...prev, [category]: e.target.value }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleAddAsset(category);
                                                }}
                                            />
                                            <button onClick={() => handleAddAsset(category)}>+</button>
                                        </div>
                                    ) : categoryAssets.length === 0 ? (
                                        <p style={{ fontSize: '0.7rem', color: '#666', padding: '4px 8px', margin: 0 }}>截取视频片段时可存入此分类</p>
                                    ) : null}

                                    {categoryAssets.length > 0 && (
                                        <div className="asset-list">
                                            {categoryAssets.map(asset => {
                                                const isAssetExpanded = expandedAssets.has(asset.id);
                                                return (
                                                    <div key={asset.id} className="asset-item">
                                                        <div
                                                            className="asset-item-header"
                                                            onClick={() => toggleAsset(asset.id)}
                                                        >
                                                            <svg
                                                                className={`chevron-icon small ${isAssetExpanded ? 'expanded' : ''}`}
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                            >
                                                                <polyline points="9 18 15 12 9 6"></polyline>
                                                            </svg>
                                                            <input
                                                                value={asset.name}
                                                                onChange={(e) => updateAsset(asset.id, { name: e.target.value })}
                                                                onClick={(e) => e.stopPropagation()}
                                                            />
                                                            <button
                                                                className="asset-remove-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (confirm(`确定删除资产 "${asset.name}" 吗？这可能也是切分后保存目标文件夹的依据。`)) {
                                                                        removeAsset(asset.id);
                                                                    }
                                                                }}
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                        {isAssetExpanded && (
                                                            <div className="asset-item-body">
                                                                <label className="asset-textarea-label">
                                                                    Summary
                                                                    <textarea
                                                                        placeholder={`${asset.name} 的上下文摘要...`}
                                                                        value={asset.description}
                                                                        onChange={(e) => updateAsset(asset.id, { description: e.target.value })}
                                                                        rows={3}
                                                                    />
                                                                </label>
                                                                <label className="asset-textarea-label">
                                                                    Detail
                                                                    <textarea
                                                                        placeholder={`${asset.name} 的详细分析...`}
                                                                        value={asset.detail || ''}
                                                                        onChange={(e) => updateAsset(asset.id, { detail: e.target.value })}
                                                                        rows={4}
                                                                    />
                                                                </label>
                                                                {asset.category === 'segment_analysis' && asset.subProjectData && (
                                                                    <button 
                                                                        className="enter-analysis-btn"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            useProjectStore.getState().enterSubProject(asset.id);
                                                                        }}
                                                                    >
                                                                        🔍 进入深入拉片环境
                                                                    </button>
                                                                )}
                                                                {asset.category !== 'segment_analysis' && (
                                                                    <button
                                                                        className="import-image-btn"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleImportImage(asset.id);
                                                                        }}
                                                                    >
                                                                        ＋ 导入本地图片
                                                                    </button>
                                                                )}
                                                                {asset.files && asset.files.length > 0 && (
                                                                    <div className="asset-file-list">
                                                                        <h4>包含文件:</h4>
                                                                        <div className="asset-file-list-items">
                                                                            {asset.files.map((file, idx) => (
                                                                                <div key={`${file.path}-${idx}`} className="asset-file-card" title={file.path}>
                                                                                    <div
                                                                                        className="asset-file-item asset-file-item--clickable"
                                                                                        onClick={() => handlePreviewFile(file.path, file.type)}
                                                                                    >
                                                                                        <span className="file-type">
                                                                                            {file.type === 'screenshot' ? '🖼️' : file.type === 'audio' ? '🎵' : '🎬'}
                                                                                        </span>
                                                                                        <span className="file-name">{file.path.split('/').pop()}</span>
                                                                                        <button
                                                                                            className="remove-file-btn"
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (confirm(`确定要永久删除此${file.type === 'screenshot' ? '截图' : '文件'}吗？该操作同时会删除本地磁盘上的文件！`)) {
                                                                                                    useProjectStore.getState().removeAssetFile(asset.id, file.path);
                                                                                                }
                                                                                            }}
                                                                                            title="删除此文件"
                                                                                        >
                                                                                            ✕
                                                                                        </button>
                                                                                    </div>
                                                                                    <AssetTagInput
                                                                                        tags={file.tags || []}
                                                                                        onChange={(tags) => updateAssetFile(asset.id, file.path, { tags })}
                                                                                    />
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );

    return (
        <>
            {mainContent}

            {/* Media Preview Lightbox */}
            {lightboxUrl && (
                <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
                    <button className="lightbox-close" onClick={() => setLightboxUrl(null)}>✕</button>
                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        {lightboxType === 'screenshot' && (
                            <img src={lightboxUrl!} alt={lightboxName} className="lightbox-image" />
                        )}
                        {lightboxType === 'clip' && (
                            <video
                                src={lightboxUrl!}
                                controls
                                autoPlay
                                className="lightbox-video"
                            />
                        )}
                        {lightboxType === 'audio' && (
                            <div className="lightbox-audio-wrapper">
                                <div className="lightbox-audio-icon">🎵</div>
                                <audio
                                    src={lightboxUrl!}
                                    controls
                                    autoPlay
                                    className="lightbox-audio"
                                />
                            </div>
                        )}
                        <div className="lightbox-caption">{lightboxName}</div>
                    </div>
                </div>
            )}
        </>
    );
};
