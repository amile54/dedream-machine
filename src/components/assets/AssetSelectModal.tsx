import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { ASSET_CATEGORIES } from '../../types';
import type { AssetCategory, Asset } from '../../types';
import './AssetSelectModal.css';

interface AssetSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (asset: Asset, options?: { isAudio?: boolean; customFilename?: string }, parentAssetId?: string) => void;
    title?: string;
    modalMode?: 'screenshot' | 'clip';
}

export const AssetSelectModal: React.FC<AssetSelectModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title = "保存资产",
    modalMode
}) => {
    const project = useProjectStore(s => s.project);
    const rootProject = useProjectStore(s => s.rootProject);
    const addAsset = useProjectStore(s => s.addAsset);
    const addSubProjectAsset = useProjectStore(s => s.addSubProjectAsset);

    // Level 1: Main Project Asset Selection
    const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('character');
    const [selectedAssetId, setSelectedAssetId] = useState<string>('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [newAssetName, setNewAssetName] = useState('');

    // Level 2: Nested Sub-Project Asset Selection (only active when resolving a "Full" segment_analysis)
    const [selectedSubCategory, setSelectedSubCategory] = useState<AssetCategory>('character');
    const [selectedSubAssetId, setSelectedSubAssetId] = useState<string>('');
    const [isCreatingNewSub, setIsCreatingNewSub] = useState(false);
    const [newSubAssetName, setNewSubAssetName] = useState('');

    const [isAudio, setIsAudio] = useState(false);
    const [customFilename, setCustomFilename] = useState('');

    const isInSubProject = !!rootProject;

    // Filter main categories: segment_analysis is hidden if currently inside a sub-project
    const filteredCategories = ASSET_CATEGORIES.filter(cat => {
        if (cat.value === 'segment_analysis') {
            if (isInSubProject) return false;
        }
        return true;
    });

    // Sub-categories: allow all except segment_analysis and other
    const subCategories = ASSET_CATEGORIES.filter(cat => cat.value !== 'segment_analysis' && cat.value !== 'other');

    useEffect(() => {
        if (isOpen) {
            setIsCreatingNew(false);
            setNewAssetName('');
            setIsCreatingNewSub(false);
            setNewSubAssetName('');
            
            // Generate default filename
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const defaultName = modalMode === 'clip'
                ? `clip_${dateStr}`
                : `screenshot_${dateStr}`;
            setCustomFilename(defaultName);
        }
    }, [isOpen, modalMode]);

    if (!isOpen || !project) return null;

    const currentCategoryAssets = (project.assets || []).filter(a => a.category === selectedCategory);
    
    // Core Logic for nested state:
    const isSegmentAnalysis = selectedCategory === 'segment_analysis';
    const targetAsset = project.assets?.find(a => a.id === selectedAssetId);
    
    // An analysis is "Full" if it has at least one file (its main video).
    // An analysis is "Empty" if it exists but has no files.
    // Note: If creating a new analysis, it is implicitly Empty.
    const isFullAnalysis = isSegmentAnalysis && !isCreatingNew && !!targetAsset && (targetAsset.files?.length ?? 0) > 0;
    const isEmptyAnalysis = isSegmentAnalysis && ((!isCreatingNew && !!targetAsset && (targetAsset.files?.length ?? 0) === 0) || isCreatingNew);

    const subProjectAssets = targetAsset?.subProjectData?.assets || [];
    const currentSubCategoryAssets = subProjectAssets.filter(a => a.category === selectedSubCategory);

    // Determine validation logic & messages dynamically
    let isDisabled = false;
    let warningMessage = '';

    // 1. Validate Level 1 Selection
    if (isCreatingNew) {
        isDisabled = !newAssetName.trim();
    } else {
        if (!selectedAssetId) isDisabled = true;
    }

    // 2. Apply rules for Segment Analysis
    if (isSegmentAnalysis) {
        if (isEmptyAnalysis) {
            // State A: Empty Analysis (Needs Main Video)
            if (modalMode === 'screenshot') {
                isDisabled = true; // Can't screenshot as main video
                warningMessage = "⚠️ 必须先截取一段视频作为拉片的主视频，然后才能添加图片资产";
            } else {
                warningMessage = "🎬 此次截取将作为该拉片的主视频";
            }
        } else if (isFullAnalysis) {
            // State B: Full Analysis (Has Main Video -> Show Nested Selection)
            if (isCreatingNewSub) {
                if (!newSubAssetName.trim()) isDisabled = true;
            } else {
                if (!selectedSubAssetId) isDisabled = true;
            }
            warningMessage = "📄 此文件将作为子资产，保存在该拉片目录下";
        }
    }

    const handleConfirm = () => {
        if (isCreatingNew) {
            if (!newAssetName.trim()) return;
            addAsset(selectedCategory, newAssetName.trim());

            // Zustand's set() is synchronous
            const latestAssets = useProjectStore.getState().project?.assets || [];
            const newlyCreated = latestAssets.find(
                a => a.name === newAssetName.trim() && a.category === selectedCategory
            );
            if (newlyCreated) {
                // A newly created segment_analysis acts as empty, receiving its main video
                onConfirm(newlyCreated, { isAudio, customFilename: customFilename.trim() || undefined });
            }
        } else {
            const asset = project.assets?.find(a => a.id === selectedAssetId);
            if (!asset) return;

            if (isFullAnalysis) {
                // Must handle nested sub-project asset
                const parentAssetId = asset.id;
                
                if (isCreatingNewSub) {
                    if (!newSubAssetName.trim()) return;
                    addSubProjectAsset(parentAssetId, selectedSubCategory, newSubAssetName.trim());
                    
                    const updatedParent = useProjectStore.getState().project?.assets?.find(a => a.id === parentAssetId);
                    const newlyCreatedSub = updatedParent?.subProjectData?.assets?.find(
                        a => a.name === newSubAssetName.trim() && a.category === selectedSubCategory
                    );
                    if (newlyCreatedSub) {
                        onConfirm(newlyCreatedSub, { isAudio, customFilename: customFilename.trim() || undefined }, parentAssetId);
                    }
                } else {
                    const subAsset = asset.subProjectData?.assets?.find(a => a.id === selectedSubAssetId);
                    if (subAsset) {
                        onConfirm(subAsset, { isAudio, customFilename: customFilename.trim() || undefined }, parentAssetId);
                    }
                }
            } else {
                // Root asset or empty segment_analysis
                onConfirm(asset, { isAudio, customFilename: customFilename.trim() || undefined });
            }
        }
    };

    return (
        <div className="asset-modal-overlay">
            <div className="asset-modal-content">
                <div className="asset-modal-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                <div className="asset-modal-body">
                    {/* --- LEVEL 1: Main Asset --- */}
                    <div className="form-group">
                        <label>资产分类：</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => {
                                setSelectedCategory(e.target.value as AssetCategory);
                                setSelectedAssetId('');
                            }}
                        >
                            {filteredCategories.map(({ value: val, label }) => (
                                <option key={val} value={val}>{label}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group type-toggle">
                        <label>保存目标：</label>
                        <div className="radio-group">
                            <label>
                                <input
                                    type="radio"
                                    checked={!isCreatingNew}
                                    onChange={() => setIsCreatingNew(false)}
                                />
                                选择已有资产
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    checked={isCreatingNew}
                                    onChange={() => setIsCreatingNew(true)}
                                />
                                创建新资产
                            </label>
                        </div>
                    </div>

                    {isCreatingNew ? (
                        <div className="form-group">
                            <label>新资产名称：</label>
                            <input
                                type="text"
                                placeholder="输入名称..."
                                value={newAssetName}
                                onChange={(e) => setNewAssetName(e.target.value)}
                                autoFocus
                            />
                        </div>
                    ) : (
                        <div className="form-group">
                            <label>选择资产：</label>
                            {currentCategoryAssets.length > 0 ? (
                                <select
                                    value={selectedAssetId}
                                    onChange={(e) => setSelectedAssetId(e.target.value)}
                                >
                                    <option value="" disabled>-- 请选择 --</option>
                                    {currentCategoryAssets.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            ) : (
                                <p className="empty-hint">此分类下暂无资产，请选择“创建新资产”。</p>
                            )}
                        </div>
                    )}

                    {/* --- LEVEL 2: Nested Sub-Asset --- */}
                    {isFullAnalysis && (
                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="form-group">
                                <label style={{ color: '#bbf' }}>子资产分类：</label>
                                <select
                                    value={selectedSubCategory}
                                    onChange={(e) => {
                                        setSelectedSubCategory(e.target.value as AssetCategory);
                                        setSelectedSubAssetId('');
                                    }}
                                >
                                    {subCategories.map(({ value: val, label }) => (
                                        <option key={val} value={val}>{label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="form-group type-toggle">
                                <label style={{ color: '#bbf' }}>保存为子目标：</label>
                                <div className="radio-group">
                                    <label>
                                        <input
                                            type="radio"
                                            checked={!isCreatingNewSub}
                                            onChange={() => setIsCreatingNewSub(false)}
                                        />
                                        已有资产
                                    </label>
                                    <label>
                                        <input
                                            type="radio"
                                            checked={isCreatingNewSub}
                                            onChange={() => setIsCreatingNewSub(true)}
                                        />
                                        新建资产
                                    </label>
                                </div>
                            </div>

                            {isCreatingNewSub ? (
                                <div className="form-group">
                                    <label style={{ color: '#bbf' }}>新子资产名称：</label>
                                    <input
                                        type="text"
                                        placeholder="输入子资产名称..."
                                        value={newSubAssetName}
                                        onChange={(e) => setNewSubAssetName(e.target.value)}
                                        autoFocus
                                    />
                                </div>
                            ) : (
                                <div className="form-group">
                                    <label style={{ color: '#bbf' }}>选定子资产：</label>
                                    {currentSubCategoryAssets.length > 0 ? (
                                        <select
                                            value={selectedSubAssetId}
                                            onChange={(e) => setSelectedSubAssetId(e.target.value)}
                                        >
                                            <option value="" disabled>-- 请选择 --</option>
                                            {currentSubCategoryAssets.map(a => (
                                                <option key={a.id} value={a.id}>{a.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <p className="empty-hint">此分类下暂无资产，请选“新建资产”。</p>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- AUDIO OPTION --- */}
                    {modalMode === 'clip' && (
                        <div className="form-group">
                            <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '10px' }}>
                                <input
                                    type="checkbox"
                                    checked={isAudio}
                                    onChange={(e) => setIsAudio(e.target.checked)}
                                />
                                仅存为音频 (Audio Only)
                            </label>
                            {isAudio && <span style={{ fontSize: '12px', color: '#888', marginLeft: '24px' }}>将提取保存为高质量音频(.mp3)</span>}
                        </div>
                    )}

                    <div className="form-group">
                        <label>文件名：</label>
                        <input
                            type="text"
                            placeholder="输入文件名..."
                            value={customFilename}
                            onChange={(e) => setCustomFilename(e.target.value)}
                        />
                    </div>
                </div>

                <div className="asset-modal-footer">
                    <button className="btn-cancel" onClick={onClose}>取消</button>
                    <button
                        className="btn-primary"
                        onClick={handleConfirm}
                        disabled={isDisabled}
                    >
                        确认保存
                    </button>
                    {warningMessage && (
                        <p style={{ color: '#ff8888', fontSize: '0.75rem', marginTop: '4px' }}>{warningMessage}</p>
                    )}
                </div>
            </div>
        </div>
    );
};
