import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { useProjectStore } from '../../stores/projectStore';
import './WelcomeScreen.css';

export const WelcomeScreen: React.FC = () => {
    const loadProject = useProjectStore(s => s.loadProject);
    const setWorkspace = useProjectStore(s => s.setWorkspace);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSelectFolder = async () => {
        try {
            setError(null);
            const folder = await open({
                directory: true,
                multiple: false,
                title: '选择工作文件夹',
            });

            if (folder) {
                setIsLoading(true);
                const hasExisting = await loadProject(folder as string);
                if (!hasExisting) {
                    setWorkspace(folder as string);
                }
                setIsLoading(false);
            }
        } catch (err) {
            setError(`打开文件夹失败: ${err}`);
            setIsLoading(false);
        }
    };

    return (
        <div className="welcome-screen">
            <div className="welcome-content">
                <div className="welcome-icon">🎬</div>
                <h1 className="welcome-title">拆梦机器</h1>
                <p className="welcome-subtitle">DeDream Machine</p>
                <p className="welcome-description">
                    一个面向电影拉片场景的分析工作台
                </p>

                <button
                    className="welcome-button"
                    onClick={handleSelectFolder}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="button-loading">
                            <span className="spinner" />
                            加载中...
                        </span>
                    ) : (
                        <>
                            <span className="button-icon">📁</span>
                            选择工作文件夹
                        </>
                    )}
                </button>

                {error && <p className="welcome-error">{error}</p>}

                <div className="welcome-hints">
                    <p>选择一个本地文件夹作为项目工作目录</p>
                    <p>如果文件夹中已有项目数据，将自动恢复</p>
                </div>
            </div>
        </div>
    );
};
