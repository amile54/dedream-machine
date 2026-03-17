import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { ASSET_CATEGORIES } from '../../types';
import type { AssetCategory, Asset } from '../../types';
import './AssetSelectModal.css';

interface AssetSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (asset: Asset, options?: { isAudio?: boolean; customFilename?: string }) => void;
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
    const addAsset = useProjectStore(s => s.addAsset);

    const [selectedCategory, setSelectedCategory] = useState<AssetCategory>('character');
    const [selectedAssetId, setSelectedAssetId] = useState<string>('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [newAssetName, setNewAssetName] = useState('');
    const [isAudio, setIsAudio] = useState(false);
    const [customFilename, setCustomFilename] = useState('');

    useEffect(() => {
        if (isOpen) {
            setIsCreatingNew(false);
            setNewAssetName('');
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

    const handleConfirm = () => {
        if (isCreatingNew) {
            if (!newAssetName.trim()) return;
            // Create new asset via action but we need the actual asset object
            // to pass to onConfirm. Zustand doesn't return the created object directly,
            // so we generate an ID here or just use the store after creation.
            // A simpler way: just trigger addAsset, then find it.
            addAsset(selectedCategory, newAssetName.trim());

            // Re-fetch from store to get the new asset
            // ... wait for newly created...
            setTimeout(() => {
                const latestAssets = useProjectStore.getState().project?.assets || [];
                const newlyCreated = latestAssets[latestAssets.length - 1]; // highly likely
                if (newlyCreated && newlyCreated.name === newAssetName.trim()) {
                    onConfirm(newlyCreated, { isAudio, customFilename: customFilename.trim() || undefined });
                }
            }, 50);
        } else {
            const asset = project.assets?.find(a => a.id === selectedAssetId);
            if (asset) {
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
                    <div className="form-group">
                        <label>资产分类：</label>
                        <select
                            value={selectedCategory}
                            onChange={(e) => {
                                setSelectedCategory(e.target.value as AssetCategory);
                                setSelectedAssetId('');
                            }}
                        >
                            {ASSET_CATEGORIES.map(({ value: val, label }) => (
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
                        disabled={isCreatingNew ? !newAssetName.trim() : !selectedAssetId}
                    >
                        确认保存
                    </button>
                </div>
            </div>
        </div>
    );
};
