import React, { useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { ASSET_CATEGORIES } from '../../types';
import type { AssetCategory } from '../../types';
import './AssetSidebar.css';

export const AssetSidebar: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const addAsset = useProjectStore(s => s.addAsset);
    const updateAsset = useProjectStore(s => s.updateAsset);
    const removeAsset = useProjectStore(s => s.removeAsset);

    const [expandedCategories, setExpandedCategories] = useState<Set<AssetCategory>>(
        new Set(['character', 'scene', 'prop', 'visual', 'other'])
    );
    const [expandedAssets, setExpandedAssets] = useState<Set<string>>(new Set());
    const [newAssetNames, setNewAssetNames] = useState<Partial<Record<AssetCategory, string>>>({});

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

    return (
        <div className="asset-sidebar">
            <div className="asset-sidebar-header">
                <h3>资产管理</h3>
            </div>
            <div className="asset-sidebar-content">
                {ASSET_CATEGORIES.map(({ value: category, label }) => {
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
                                                                <textarea
                                                                    placeholder={`描述 ${asset.name}...`}
                                                                    value={asset.description}
                                                                    onChange={(e) => updateAsset(asset.id, { description: e.target.value })}
                                                                    rows={4}
                                                                />
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
                                                                {asset.files && asset.files.length > 0 && (
                                                                    <div className="asset-file-list">
                                                                        <h4>包含文件:</h4>
                                                                        <div className="asset-file-list-items">
                                                                            {asset.files.map((file, idx) => (
                                                                                <div key={idx} className="asset-file-item" title={file.path}>
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
};
