import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { resolveWorkspacePath, useProjectStore } from '../../stores/projectStore';
import { useVideoStore } from '../../stores/videoStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { formatTime } from '../../utils/timeFormat';
import { SEGMENT_CATEGORIES } from '../../types';
import type { Asset, SegmentReference } from '../../types';
import { collectReferenceImageOptions } from '../../utils/segmentReferences';
import { takeScreenshot } from '../../services/ffmpegService';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { open } from '@tauri-apps/plugin-dialog';
import './SegmentList.css';

/** Auto-expanding textarea with custom resize handle.
 *  - Auto-expands to fit content on typing
 *  - Custom drag handle at bottom: clear ns-resize cursor
 *  - Manual drag "locks" the height (scrollbar appears)
 *  - Next keystroke unlocks and re-enables auto-expand
 */
const AutoTextarea: React.FC<{
    className?: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onClick?: (e: React.MouseEvent) => void;
    minRows?: number;
}> = ({ className, placeholder, value, onChange, onClick, minRows = 2 }) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    const manuallyResized = useRef(false);

    const autoResize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.overflow = 'hidden';
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => {
        if (!manuallyResized.current) autoResize();
    }, [value, autoResize]);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        manuallyResized.current = false;
        onChange(e);
        autoResize();
    };

    // Custom drag handle: programmatic resize
    const handleDragStart = (e: React.MouseEvent) => {
        e.preventDefault();
        const el = ref.current;
        if (!el) return;
        const startY = e.clientY;
        const startH = el.offsetHeight;

        const onMove = (ev: MouseEvent) => {
            const newH = Math.max(32, startH + (ev.clientY - startY));
            el.style.height = `${newH}px`;
            el.style.overflow = 'auto';
            manuallyResized.current = true;
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    return (
        <div className="auto-textarea-wrapper">
            <textarea
                ref={ref}
                className={className}
                placeholder={placeholder}
                value={value}
                onChange={handleChange}
                onClick={onClick}
                rows={minRows}
                style={{ resize: 'none' }}
            />
            <div className="resize-handle" onMouseDown={handleDragStart}>
                <span className="resize-dots">⋯</span>
            </div>
        </div>
    );
};

export const SegmentList: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const workspace = useProjectStore(s => s.workspace);
    const updateSegment = useProjectStore(s => s.updateSegment);
    const addSegmentReference = useProjectStore(s => s.addSegmentReference);
    const removeSegmentReference = useProjectStore(s => s.removeSegmentReference);
    const addFileToAsset = useProjectStore(s => s.addFileToAsset);
    const removeCutPoint = useProjectStore(s => s.removeCutPoint);
    const seekTo = useVideoStore(s => s.seekTo);
    const currentTime = useVideoStore(s => s.currentTime);
    const selectedSegmentId = useTimelineStore(s => s.selectedSegmentId);
    const setSelectedSegmentId = useTimelineStore(s => s.setSelectedSegmentId);

    const listRef = useRef<HTMLDivElement>(null);
    const segments = project?.segments || [];
    const referenceOptions = useMemo(
        () => collectReferenceImageOptions(project?.assets || []),
        [project?.assets],
    );
    const screenshotTargetAssets = (project?.assets || []).filter(asset => asset.category !== 'segment_analysis');

    // Auto-scroll to selected segment
    useEffect(() => {
        if (selectedSegmentId && listRef.current) {
            const el = listRef.current.querySelector(`[data-segment-id="${selectedSegmentId}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedSegmentId]);

    const handleSegmentClick = (segId: string, startTime: number) => {
        setSelectedSegmentId(segId);
        seekTo(startTime);
    };

    const streamUrlForPath = async (filePath: string): Promise<string> => {
        const absolutePath = resolveWorkspacePath(workspace, filePath);
        return await invoke<string>('get_stream_url', { filePath: absolutePath });
    };

    const ensureOriginalVideoPath = async (): Promise<string | null> => {
        if (!workspace || !project?.videoFilePath) return null;

        const candidate = resolveWorkspacePath(workspace, project.videoFilePath);
        const exists = await invoke<boolean>('check_file_exists', { path: candidate });
        if (exists) return candidate;

        const file = await open({
            multiple: false,
            title: '重新关联原始视频',
            filters: [{
                name: '视频文件',
                extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v'],
            }],
        });
        if (!file) return null;
        const newPath = file as string;
        const store = useProjectStore.getState();
        if (store.project) {
            store.setProject({ ...store.project, videoFilePath: newPath });
            await store.saveProject();
        }
        return newPath;
    };

    const handleCaptureReference = async (segmentId: string, targetAssetId: string) => {
        if (!workspace || !project || !targetAssetId) return;
        const targetAsset = project.assets.find(asset => asset.id === targetAssetId);
        if (!targetAsset) return;

        const originalVideoPath = await ensureOriginalVideoPath();
        if (!originalVideoPath) return;

        const timestamp = currentTime;
        const filename = `${targetAsset.name}_ref_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        const pathParts = ['assets', targetAsset.category, targetAsset.name];
        const outputPath = await join(workspace, ...pathParts, filename);
        await takeScreenshot(originalVideoPath, timestamp, outputPath);

        const relativePath = [...pathParts, filename].join('/');
        addFileToAsset(targetAsset.id, {
            path: relativePath,
            timestamp,
            type: 'screenshot',
            tags: [],
        });
        addSegmentReference(segmentId, {
            assetId: targetAsset.id,
            filePath: relativePath,
        });
    };

    if (segments.length === 0) {
        return (
            <div className="segment-list segment-list--empty">
                <div className="empty-icon">✂️</div>
                <p className="empty-text">暂无片段</p>
                <p className="empty-hint">在时间轴上按 B 键添加切点</p>
            </div>
        );
    }

    return (
        <div className="segment-list" ref={listRef}>
            <div className="segment-list-header">
                <h3 className="segment-list-title">片段列表</h3>
                <span className="segment-count">{segments.length} 个片段</span>
            </div>
            <div className="segment-cards">
                {segments.map((seg, i) => (
                    <div
                        key={seg.id}
                        className={`segment-card ${selectedSegmentId === seg.id ? 'segment-card--selected' : ''}`}
                        data-segment-id={seg.id}
                        onClick={() => handleSegmentClick(seg.id, seg.startTime)}
                    >
                        <div className="segment-card-header">
                            <span className="segment-index">#{seg.index}</span>
                            <span className="segment-time">
                                {formatTime(seg.startTime)} — {formatTime(seg.endTime)}
                            </span>
                            <span className="segment-duration">
                                {formatTime(seg.endTime - seg.startTime)}
                            </span>
                        </div>

                        <div className="segment-card-body">
                            <AutoTextarea
                                className="segment-description"
                                placeholder="添加描述..."
                                value={seg.description}
                                onChange={(e) => updateSegment(seg.id, { description: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <AutoTextarea
                                className="segment-notes"
                                placeholder="备注..."
                                value={seg.notes || ''}
                                onChange={(e) => updateSegment(seg.id, { notes: e.target.value })}
                                onClick={(e) => e.stopPropagation()}
                                minRows={1}
                            />
                            <div className="segment-category-row">
                                <select
                                    className="segment-category"
                                    value={seg.category}
                                    onChange={(e) => updateSegment(seg.id, { category: e.target.value })}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <option value="">选择类别...</option>
                                    {SEGMENT_CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                {i > 0 && (
                                    <button
                                        className="remove-cut-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('确定删除此切点？删除后该片段将合并到上一片段。')) {
                                                removeCutPoint(i - 1);
                                            }
                                        }}
                                        title="删除此切点（合并到上一个片段）"
                                    >
                                        🗑
                                    </button>
                                )}
                            </div>
                            <SegmentReferencePanel
                                segmentId={seg.id}
                                references={seg.references || []}
                                options={referenceOptions}
                                targetAssets={screenshotTargetAssets}
                                onAddReference={(reference) => addSegmentReference(seg.id, reference)}
                                onRemoveReference={(filePath) => removeSegmentReference(seg.id, filePath)}
                                onCaptureReference={(assetId) => handleCaptureReference(seg.id, assetId)}
                                getPreviewUrl={streamUrlForPath}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

interface SegmentReferencePanelProps {
    segmentId: string;
    references: SegmentReference[];
    options: ReturnType<typeof collectReferenceImageOptions>;
    targetAssets: Asset[];
    onAddReference: (reference: SegmentReference) => void;
    onRemoveReference: (filePath: string) => void;
    onCaptureReference: (assetId: string) => void;
    getPreviewUrl: (filePath: string) => Promise<string>;
}

const SegmentReferencePanel: React.FC<SegmentReferencePanelProps> = ({
    segmentId,
    references,
    options,
    targetAssets,
    onAddReference,
    onRemoveReference,
    onCaptureReference,
    getPreviewUrl,
}) => {
    const [selectedOptionPath, setSelectedOptionPath] = useState('');
    const [captureAssetId, setCaptureAssetId] = useState(targetAssets[0]?.id || '');
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!captureAssetId && targetAssets[0]) {
            setCaptureAssetId(targetAssets[0].id);
        }
    }, [captureAssetId, targetAssets]);

    useEffect(() => {
        let cancelled = false;
        const imagePaths = new Set([
            ...references.map(ref => ref.filePath),
            ...options.slice(0, 24).map(option => option.filePath),
        ]);

        imagePaths.forEach(filePath => {
            if (previewUrls[filePath]) return;
            getPreviewUrl(filePath)
                .then(url => {
                    if (!cancelled) {
                        setPreviewUrls(prev => ({ ...prev, [filePath]: url }));
                    }
                })
                .catch(() => {
                    /* Preview failures should not block annotation work. */
                });
        });
        return () => {
            cancelled = true;
        };
    }, [references, options, previewUrls, getPreviewUrl, segmentId]);

    const selectedOption = options.find(option => option.filePath === selectedOptionPath);
    const linkedOptions = references
        .map(ref => options.find(option => option.filePath === ref.filePath) || {
            ...ref,
            assetName: '未知资产',
            tags: [],
            label: ref.filePath.split('/').pop() || ref.filePath,
        });

    return (
        <div className="segment-reference-panel" onClick={(e) => e.stopPropagation()}>
            <div className="segment-reference-header">
                <span>参考素材</span>
                <span>{references.length}</span>
            </div>

            <div className="segment-reference-picker">
                <select
                    value={selectedOptionPath}
                    onChange={(e) => setSelectedOptionPath(e.target.value)}
                    title="选择已有资产图片"
                >
                    <option value="">选择已有图片...</option>
                    {options.map(option => (
                        <option key={option.filePath} value={option.filePath}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!selectedOption}
                    onClick={() => {
                        if (!selectedOption) return;
                        onAddReference({
                            assetId: selectedOption.assetId,
                            filePath: selectedOption.filePath,
                        });
                        setSelectedOptionPath('');
                    }}
                >
                    挂载
                </button>
            </div>

            {selectedOption && (
                <div className="segment-reference-selected-preview">
                    {previewUrls[selectedOption.filePath] ? (
                        <img src={previewUrls[selectedOption.filePath]} alt={selectedOption.label} />
                    ) : (
                        <div className="segment-reference-thumb-placeholder">预览中</div>
                    )}
                    <span>{selectedOption.label}</span>
                </div>
            )}

            <div className="segment-reference-capture">
                <select
                    value={captureAssetId}
                    onChange={(e) => setCaptureAssetId(e.target.value)}
                    title="截图保存到哪个资产"
                >
                    {targetAssets.length === 0 ? (
                        <option value="">先创建资产</option>
                    ) : targetAssets.map(asset => (
                        <option key={asset.id} value={asset.id}>
                            截图到：{asset.name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!captureAssetId}
                    onClick={() => onCaptureReference(captureAssetId)}
                    title="截取当前画面并挂载为参考"
                >
                    +
                </button>
            </div>

            {linkedOptions.length > 0 && (
                <div className="segment-reference-grid">
                    {linkedOptions.map(ref => (
                        <div key={ref.filePath} className="segment-reference-card" title={ref.label}>
                            {previewUrls[ref.filePath] ? (
                                <img src={previewUrls[ref.filePath]} alt={ref.label} />
                            ) : (
                                <div className="segment-reference-thumb-placeholder">预览中</div>
                            )}
                            <div className="segment-reference-caption">{ref.assetName}</div>
                            <button
                                type="button"
                                onClick={() => onRemoveReference(ref.filePath)}
                                title="移除此参考"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
