import React, { useState, useRef, useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore';
import { TEXT_BLOCK_TYPE_LABELS } from '../../types';
import type { TextBlockType } from '../../types';
import './TextBlocks.css';

export const TextBlocks: React.FC = () => {
    const project = useProjectStore(s => s.project);
    const addTextBlock = useProjectStore(s => s.addTextBlock);
    const updateTextBlock = useProjectStore(s => s.updateTextBlock);
    const removeTextBlock = useProjectStore(s => s.removeTextBlock);

    const [showAddMenu, setShowAddMenu] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const addBtnRef = useRef<HTMLButtonElement>(null);

    const textBlocks = project?.textBlocks || [];

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
    );
};
