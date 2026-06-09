import React, { memo, useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { useVideoStore } from '../../stores/videoStore';
import { TEXT_BLOCK_TYPE_LABELS } from '../../types';
import type { SceneBlock, Segment, TextBlockType } from '../../types';
import './TextBlocks.css';

interface SceneBlockRowProps {
    scene: SceneBlock;
    isExpanded: boolean;
    maxSegmentIndex: number;
    rangeSegments: Segment[];
    onToggle: () => void;
    onUpdate: (updates: Partial<SceneBlock>) => void;
    onRemove: () => void;
    onLocate: (segmentIndex: number) => void;
}

const SceneBlockRow = memo(({
    scene,
    isExpanded,
    maxSegmentIndex,
    rangeSegments,
    onToggle,
    onUpdate,
    onRemove,
    onLocate,
}: SceneBlockRowProps) => {
    const [draft, setDraft] = useState({
        sceneInfo: scene.sceneInfo,
        summary: scene.summary,
        detail: scene.detail,
    });

    useEffect(() => {
        setDraft({
            sceneInfo: scene.sceneInfo,
            summary: scene.summary,
            detail: scene.detail,
        });
    }, [scene.id, scene.sceneInfo, scene.summary, scene.detail]);

    const commitText = (field: 'sceneInfo' | 'summary' | 'detail') => {
        if (draft[field] !== scene[field]) onUpdate({ [field]: draft[field] });
    };

    const clampSegmentIndex = (value: number): number => {
        if (!Number.isFinite(value)) return 1;
        return Math.max(1, Math.min(maxSegmentIndex, Math.round(value)));
    };

    const firstSegment = rangeSegments[0];
    const lastSegment = rangeSegments[rangeSegments.length - 1];

    return (
        <div className={`scene-block ${isExpanded ? 'scene-block--expanded' : ''}`}>
            <div className="scene-block-header">
                <button
                    className="scene-toggle-btn"
                    onClick={onToggle}
                    title={isExpanded ? '收起' : '展开'}
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
                    <span>{isExpanded ? '收起' : '展开'}</span>
                </button>
                <span className="text-block-type-badge">分场</span>
                <input
                    className="scene-info-input"
                    value={draft.sceneInfo}
                    onChange={(e) => setDraft(prev => ({ ...prev, sceneInfo: e.target.value }))}
                    onBlur={() => commitText('sceneInfo')}
                    placeholder="场次基本信息，例如：第 1 场"
                />
                <span className="scene-range-pill">
                    #{scene.startSegmentIndex} - #{scene.endSegmentIndex}
                </span>
                <button
                    className="text-block-remove"
                    onClick={(e) => {
                        e.stopPropagation();
                        onRemove();
                    }}
                >
                    ✕
                </button>
            </div>

            {isExpanded && (
                <div className="scene-block-body">
                    <div className="scene-range-editor">
                        <label>
                            起始片段
                            <input
                                type="number"
                                min={1}
                                max={maxSegmentIndex}
                                value={scene.startSegmentIndex}
                                onChange={(e) => {
                                    const next = clampSegmentIndex(Number(e.target.value));
                                    onUpdate({
                                        startSegmentIndex: next,
                                        endSegmentIndex: Math.max(next, scene.endSegmentIndex),
                                    });
                                }}
                            />
                        </label>
                        <label>
                            结束片段
                            <input
                                type="number"
                                min={1}
                                max={maxSegmentIndex}
                                value={scene.endSegmentIndex}
                                onChange={(e) => {
                                    const next = clampSegmentIndex(Number(e.target.value));
                                    onUpdate({
                                        startSegmentIndex: Math.min(scene.startSegmentIndex, next),
                                        endSegmentIndex: next,
                                    });
                                }}
                            />
                        </label>
                        <button type="button" onClick={() => onLocate(scene.startSegmentIndex)}>
                            定位首片段
                        </button>
                        <button type="button" onClick={() => onLocate(scene.endSegmentIndex)}>
                            定位尾片段
                        </button>
                    </div>

                    <div className="scene-range-preview">
                        {rangeSegments.length > 0 ? (
                            <>
                                <div>覆盖 {rangeSegments.length} 个片段</div>
                                <p>
                                    #{firstSegment.index} {firstSegment.description || '无描述'}
                                    {lastSegment && lastSegment.id !== firstSegment.id
                                        ? ` / #${lastSegment.index} ${lastSegment.description || '无描述'}`
                                        : ''}
                                </p>
                            </>
                        ) : (
                            <p>当前片段范围没有匹配到片段。</p>
                        )}
                    </div>

                    <label className="scene-textarea-label">
                        Summary
                        <textarea
                            className="text-block-content scene-textarea scene-textarea--summary"
                            value={draft.summary}
                            onChange={(e) => setDraft(prev => ({ ...prev, summary: e.target.value }))}
                            onBlur={() => commitText('summary')}
                            placeholder="这一场的场景描述 / Studio Context..."
                            rows={3}
                        />
                    </label>
                    <label className="scene-textarea-label">
                        Detail
                        <textarea
                            className="text-block-content scene-textarea scene-textarea--detail"
                            value={draft.detail}
                            onChange={(e) => setDraft(prev => ({ ...prev, detail: e.target.value }))}
                            onBlur={() => commitText('detail')}
                            placeholder="详细分析，例如分镜设计、镜头关系、动作调度..."
                            rows={4}
                        />
                    </label>
                </div>
            )}
        </div>
    );
});

SceneBlockRow.displayName = 'SceneBlockRow';

export const TextBlocks: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const addTextBlock = useProjectStore(s => s.addTextBlock);
    const updateTextBlock = useProjectStore(s => s.updateTextBlock);
    const removeTextBlock = useProjectStore(s => s.removeTextBlock);
    const addSceneBlock = useProjectStore(s => s.addSceneBlock);
    const updateSceneBlock = useProjectStore(s => s.updateSceneBlock);
    const removeSceneBlock = useProjectStore(s => s.removeSceneBlock);
    const setSelectedSegmentId = useTimelineStore(s => s.setSelectedSegmentId);
    const seekTo = useVideoStore(s => s.seekTo);

    const [showAddMenu, setShowAddMenu] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedSceneId, setExpandedSceneId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const addBtnRef = useRef<HTMLButtonElement>(null);

    const textBlocks = project?.textBlocks || [];
    const sceneBlocks = project?.sceneBlocks || [];
    const segments = project?.segments || [];
    const maxSegmentIndex = Math.max(1, ...segments.map(seg => seg.index));

    // Position the menu relative to the button using fixed coordinates
    useEffect(() => {
        if (showAddMenu && addBtnRef.current) {
            const rect = addBtnRef.current.getBoundingClientRect();
            setMenuPos({
                top: rect.top - 4, // Above the button
                left: rect.right,  // Right-aligned
            });
        }
    }, [showAddMenu]);

    // Close menu when clicking outside
    useEffect(() => {
        if (!showAddMenu) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.add-block-menu-fixed') && !target.closest('.add-block-btn')) {
                setShowAddMenu(false);
            }
        };
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, [showAddMenu]);

    const handleAdd = (blockType: TextBlockType) => {
        const title = TEXT_BLOCK_TYPE_LABELS[blockType];
        addTextBlock(blockType, title);
        setShowAddMenu(false);
    };

    const locateSegment = (segmentIndex: number) => {
        const seg = segments.find(item => item.index === segmentIndex);
        if (!seg) return;
        setSelectedSegmentId(seg.id);
        seekTo(seg.startTime);
    };

    const segmentRangePreview = (startIndex: number, endIndex: number) => {
        const start = Math.min(startIndex, endIndex);
        const end = Math.max(startIndex, endIndex);
        return segments.filter(seg => seg.index >= start && seg.index <= end);
    };

    return (
        <div className="text-blocks">
            <div className="text-blocks-header">
                <h3 className="text-blocks-title">分析文本</h3>
                <button
                    ref={addBtnRef}
                    className="add-block-btn"
                    onClick={() => setShowAddMenu(!showAddMenu)}
                >
                    + 新建
                </button>
            </div>

            {/* Fixed-position dropdown menu rendered outside normal flow */}
            {showAddMenu && (
                <div
                    className="add-block-menu-fixed"
                    style={{
                        position: 'fixed',
                        top: menuPos.top,
                        left: menuPos.left,
                        transform: 'translate(-100%, -100%)',
                    }}
                >
                    {(Object.entries(TEXT_BLOCK_TYPE_LABELS) as [TextBlockType, string][]).map(
                        ([type, label]) => (
                            <button
                                key={type}
                                className="add-block-menu-item"
                                onClick={() => handleAdd(type)}
                            >
                                {label}
                            </button>
                        )
                    )}
                </div>
            )}

            <div className="text-blocks-content">
                <div className="scene-blocks-panel">
                    <div className="scene-blocks-panel-header">
                        <div>
                            <h4>分场</h4>
                            <p>记录每一场对应的片段范围、Summary 与 Detail</p>
                        </div>
                        <button
                            className="add-scene-btn"
                            onClick={() => {
                                addSceneBlock();
                                setExpandedSceneId(null);
                            }}
                        >
                            + 新建分场
                        </button>
                    </div>

                    {sceneBlocks.length === 0 ? (
                        <div className="scene-blocks-empty">暂无分场，点击“新建分场”开始关联片段。</div>
                    ) : (
                        <div className="scene-blocks-list">
                            {sceneBlocks.map(scene => {
                                const isExpanded = expandedSceneId === scene.id;
                                const rangeSegments = segmentRangePreview(scene.startSegmentIndex, scene.endSegmentIndex);
                                return (
                                    <SceneBlockRow
                                        key={scene.id}
                                        scene={scene}
                                        isExpanded={isExpanded}
                                        maxSegmentIndex={maxSegmentIndex}
                                        rangeSegments={rangeSegments}
                                        onToggle={() => setExpandedSceneId(isExpanded ? null : scene.id)}
                                        onUpdate={(updates) => updateSceneBlock(scene.id, updates)}
                                        onRemove={() => {
                                            if (confirm('确定删除此分场？')) {
                                                removeSceneBlock(scene.id);
                                            }
                                        }}
                                        onLocate={locateSegment}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>

                {textBlocks.length === 0 ? (
                    <div className="text-blocks-empty">
                        <p>点击"+ 新建"添加分析文本框</p>
                        <p className="empty-subtitle">支持故事梗概、情节、幕、人物、场景等多种类型</p>
                    </div>
                ) : (
                    <div className="text-blocks-list">
                        {textBlocks.map(block => (
                            <div
                                key={block.id}
                                className={`text-block ${expandedId === block.id ? 'text-block--expanded' : ''}`}
                            >
                                <div className="text-block-header">
                                    <button
                                        className="text-block-expand-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedId(expandedId === block.id ? null : block.id);
                                        }}
                                        title={expandedId === block.id ? "收起" : "展开"}
                                    >
                                        <svg
                                            className={`chevron-icon ${expandedId === block.id ? 'expanded' : ''}`}
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </button>
                                    <span className="text-block-type-badge">
                                        {TEXT_BLOCK_TYPE_LABELS[block.blockType as TextBlockType] || block.blockType}
                                    </span>
                                    <input
                                        className="text-block-title-input"
                                        value={block.title}
                                        onChange={(e) => updateTextBlock(block.id, { title: e.target.value })}
                                        onClick={(e) => e.stopPropagation()}
                                        placeholder="标题"
                                    />
                                    <button
                                        className="text-block-remove"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm('确定删除此文本框？')) {
                                                removeTextBlock(block.id);
                                            }
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                                {expandedId === block.id && (
                                    <div className="text-block-body">
                                        <textarea
                                            className="text-block-content"
                                            value={block.content}
                                            onChange={(e) => updateTextBlock(block.id, { content: e.target.value })}
                                            placeholder="在此输入分析内容..."
                                            rows={6}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
