import React, { useRef, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { useVideoStore } from '../../stores/videoStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { formatTime } from '../../utils/timeFormat';
import { SEGMENT_CATEGORIES } from '../../types';
import './SegmentList.css';

/** Auto-expanding textarea: grows with content, min 2 rows */
const AutoTextarea: React.FC<{
    className?: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onClick?: (e: React.MouseEvent) => void;
    minRows?: number;
}> = ({ className, placeholder, value, onChange, onClick, minRows = 2 }) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(() => { resize(); }, [value, resize]);

    return (
        <textarea
            ref={ref}
            className={className}
            placeholder={placeholder}
            value={value}
            onChange={(e) => { onChange(e); resize(); }}
            onClick={onClick}
            rows={minRows}
            style={{ overflow: 'hidden', resize: 'none' }}
        />
    );
};

export const SegmentList: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const updateSegment = useProjectStore(s => s.updateSegment);
    const removeCutPoint = useProjectStore(s => s.removeCutPoint);
    const seekTo = useVideoStore(s => s.seekTo);
    const selectedSegmentId = useTimelineStore(s => s.selectedSegmentId);
    const setSelectedSegmentId = useTimelineStore(s => s.setSelectedSegmentId);

    const listRef = useRef<HTMLDivElement>(null);
    const segments = project?.segments || [];

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
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
