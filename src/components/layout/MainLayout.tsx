import React, { useState } from 'react';
import { VideoPlayer } from '../video/VideoPlayer';
import { Timeline } from '../timeline/Timeline';
import { SegmentList } from '../segments/SegmentList';
import { TextBlocks } from '../analysis/TextBlocks';
import { AssetSidebar } from '../assets/AssetSidebar';
import { useProjectStore } from '../../stores/projectStore';
import { useKeyboardShortcuts } from '../../utils/shortcuts';
import Split from 'react-split';
import './MainLayout.css';

export const MainLayout: React.FC = () => {
    const workspace = useProjectStore(s => s.workspace);
    const project = useProjectStore(s => s.project);
    const updateMetadata = useProjectStore(s => s.updateMetadata);
    const isDirty = useProjectStore(s => s.isDirty);
    const saveProject = useProjectStore(s => s.saveProject);
    const switchProject = useProjectStore(s => s.switchProject);
    const activeAssetId = useProjectStore(s => s.activeAssetId);
    const exitSubProject = useProjectStore(s => s.exitSubProject);

    const [isAssetSidebarOpen, setIsAssetSidebarOpen] = useState(true);

    useKeyboardShortcuts();

    return (
        <div className="main-layout">
            <div className="layout-header">
                <div className="header-left">
                    <span className="app-logo">🎬</span>
                    <span className="app-name">拆梦机器</span>
                    <button
                        className="save-btn"
                        onClick={() => switchProject()}
                        title="打开另一个工作文件夹 (自动保存当前项目)"
                        style={{ marginLeft: '0.5rem' }}
                    >
                        📂 打开文件夹
                    </button>
                    <span className="workspace-path" title={workspace || ''}>
                        {workspace ? workspace.split('/').pop() || workspace : ''}
                    </span>
                </div>
                <div className="header-right">
                    {project && (
                        <div className="project-metadata">
                            <input
                                className="meta-input meta-title"
                                placeholder="添加影片名..."
                                value={project.metadata?.title || ''}
                                onChange={(e) => updateMetadata({ title: e.target.value })}
                            />
                            <div className="meta-divider" />
                            <input
                                className="meta-input meta-url"
                                placeholder="输入来源链接..."
                                value={project.metadata?.sourceUrl || ''}
                                onChange={(e) => updateMetadata({ sourceUrl: e.target.value })}
                            />
                            <div className="meta-divider" />
                            <input
                                className="meta-input meta-id"
                                placeholder="ID 例如 IMDB..."
                                value={project.metadata?.videoId || ''}
                                onChange={(e) => updateMetadata({ videoId: e.target.value })}
                            />
                        </div>
                    )}
                    {isDirty && <span className="unsaved-badge">●</span>}
                    <button
                        className="save-btn"
                        onClick={async () => {
                            if (!workspace) return;
                            try {
                                const { save } = await import('@tauri-apps/plugin-dialog');
                                const { invoke } = await import('@tauri-apps/api/core');

                                const defaultFilename = project?.metadata?.title
                                    ? `${project.metadata.title}_Data.zip`
                                    : 'DeDream_Project_Data.zip';

                                const destPath = await save({
                                    filters: [{ name: 'DeDream Project Archive', extensions: ['zip'] }],
                                    defaultPath: defaultFilename,
                                    title: '保存项目数据包'
                                });

                                if (!destPath) return;

                                await invoke('export_project_zip', {
                                    workspace: workspace,
                                    outputPath: destPath
                                });

                                alert(`导出成功！\n已将项目数据与资产打包保存至:\n${destPath}`);
                            } catch (err) {
                                console.error('Export failed:', err);
                                alert(`导出失败: ${err}`);
                            }
                        }}
                        title="导出项目打包文件 (只包含数据与截图，不含原视频)"
                    >
                        📦 导出打包
                    </button>
                    <button className="save-btn" onClick={saveProject} title="保存 (Cmd+S)">
                        💾 保存
                    </button>
                    {activeAssetId && (
                        <button
                            className="save-btn"
                            style={{ backgroundColor: '#e53935', color: '#fff', marginLeft: '1rem', fontWeight: 'bold' }}
                            onClick={() => exitSubProject()}
                            title="退出拉片环境，返回全片主界面的完整项目"
                        >
                            🔙 返回主界面全片环境
                        </button>
                    )}
                </div>
            </div>

            <div className="layout-content">
                <div
                    className={`sidebar-toggle-btn ${isAssetSidebarOpen ? 'open' : 'closed'}`}
                    onClick={() => setIsAssetSidebarOpen(!isAssetSidebarOpen)}
                    title={isAssetSidebarOpen ? "收起资产 (Collapse Assets)" : "展开资产 (Expand Assets)"}
                >
                    {isAssetSidebarOpen ? '◀' : '▶'}
                </div>
                <Split
                    className="split-horizontal"
                    direction="horizontal"
                    sizes={isAssetSidebarOpen ? [20, 60, 20] : [0, 80, 20]}
                    minSize={isAssetSidebarOpen ? [200, 400, 260] : [0, 400, 260]}
                    gutterSize={4}
                    snapOffset={0}
                >
                    <div className="layout-assets" style={{ display: isAssetSidebarOpen ? 'block' : 'none' }}>
                        <AssetSidebar />
                    </div>
                    <Split
                        className="split-vertical"
                        direction="vertical"
                        sizes={[60, 20, 20]}
                        minSize={[200, 100, 100]}
                        gutterSize={4}
                        snapOffset={0}
                        style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
                    >
                        <div className="layout-video">
                            <VideoPlayer />
                        </div>
                        <div className="layout-timeline">
                            <Timeline />
                        </div>
                        <div className="layout-analysis">
                            <TextBlocks />
                        </div>
                    </Split>
                    <div className="layout-sidebar">
                        <SegmentList />
                    </div>
                </Split>
            </div>

            <div className="layout-statusbar">
                <span className="status-info">
                    按空格播放/暂停 · ← → 逐帧 · B 添加切点 · J/L 快退/快进 · ⌘+/⌘- 缩放时间轴 · ⌘S 保存
                </span>
            </div>
        </div>
    );
};
