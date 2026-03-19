import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoStore } from '../../stores/videoStore';
import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { formatTime } from '../../utils/timeFormat';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { quickProbe, backgroundTranscode, takeScreenshot, getSubtitleTracks, extractSubtitleTrack } from '../../services/ffmpegService';
import type { SubtitleTrackInfo } from '../../services/ffmpegService';
import { parseSrt } from '../../services/subtitleParser';
import { AssetSelectModal } from '../assets/AssetSelectModal';
import type { Asset, SubtitleCue } from '../../types';
import './VideoPlayer.css';

export const VideoPlayer: React.FC = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const workspace = useProjectStore(s => s.workspace);
    const project = useProjectStore(s => s.project);
    const createNewProject = useProjectStore(s => s.createNewProject);
    const setProxyFilePath = useProjectStore(s => s.setProxyFilePath);
    const addCutPoint = useProjectStore(s => s.addCutPoint);
    const saveProject = useProjectStore(s => s.saveProject);
    const setSubtitleFilePath = useProjectStore(s => s.setSubtitleFilePath);
    const addFileToAsset = useProjectStore(s => s.addFileToAsset);

    const {
        isPlaying,
        currentTime,
        duration,
        volume,
        proxyUrl,
        isTranscoding,
        transcodingProgress,
        setVideoRef,
        setPlaying,
        setCurrentTime,
        setDuration,
        setFps,
        setVolume,
        setProxyUrl,
        setOriginalVideoPath,
        setIsTranscoding,
        setTranscodingProgress,
        stepFrame,
        skipSeconds,
    } = useVideoStore();

    const [importProgress, setImportProgress] = useState<number | null>(null);
    const [importStatus, setImportStatus] = useState<string>('');
    const [isImporting, setIsImporting] = useState(false);
    const [videoError, setVideoError] = useState<string | null>(null);

    // Media extraction state
    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'screenshot' | 'clip'>('screenshot');
    const [isClippingMode, setIsClippingMode] = useState(false);
    const [clipStartTime, setClipStartTime] = useState(0);
    const [clipEndTime, setClipEndTime] = useState(0);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Subtitle state
    const [subtitleCues, setSubtitleCues] = useState<SubtitleCue[]>([]);
    const [showSubtitles, setShowSubtitles] = useState(false);
    const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
    const [embeddedTracks, setEmbeddedTracks] = useState<SubtitleTrackInfo[]>([]);
    const [loadingTrack, setLoadingTrack] = useState(false);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 3000);
    };

    // Use a callback ref to guarantee the global store receives the `<video>` node  
    // the exact moment React mounts it to the DOM.
    const videoRefCallback = useCallback((node: HTMLVideoElement | null) => {
        videoRef.current = node;
        setVideoRef(node);
    }, [setVideoRef]);

    // Load proxy if project already has one
    useEffect(() => {
        if (project?.proxyFilePath && !proxyUrl) {
            const loadVideo = async () => {
                try {
                    const path = project.proxyFilePath;
                    const url = await invoke<string>('get_stream_url', { filePath: path });
                    console.log('[VideoPlayer] Loading existing video via streaming server:', path, '-> URL:', url);
                    setProxyUrl(url);
                    setOriginalVideoPath(project.videoFilePath);
                } catch (err) {
                    console.error('[VideoPlayer] Failed to get video URL:', err);
                }
            };
            loadVideo();
        }
    }, [project, proxyUrl, setProxyUrl, setOriginalVideoPath]);

    // Probe for embedded subtitle tracks when video loads
    useEffect(() => {
        if (project?.videoFilePath) {
            getSubtitleTracks(project.videoFilePath)
                .then(tracks => {
                    setEmbeddedTracks(tracks);
                    if (tracks.length > 0) {
                        console.log('[VideoPlayer] Found embedded subtitle tracks:', tracks);
                    }
                })
                .catch(err => console.warn('[VideoPlayer] Could not probe subtitles:', err));
        }
    }, [project?.videoFilePath]);

    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        setCurrentTime(current);

        // Loop playback only when actively playing with a segment selected
        const { isPlaying } = useVideoStore.getState();
        if (!isPlaying) return;
        const selectedSegmentId = useTimelineStore.getState().selectedSegmentId;
        if (selectedSegmentId) {
            const project = useProjectStore.getState().project;
            if (project) {
                const seg = project.segments.find(s => s.id === selectedSegmentId);
                if (seg && current >= seg.endTime) {
                    videoRef.current.currentTime = seg.startTime;
                }
            }
        }
    };

    const handleLoadedMetadata = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
            setVideoError(null); // Clear any previous error
            console.log('[VideoPlayer] Video loaded, duration:', videoRef.current.duration);
        }
    }, [setDuration]);

    const handlePlay = useCallback(() => setPlaying(true), [setPlaying]);
    const handlePause = useCallback(() => setPlaying(false), [setPlaying]);

    // Override togglePlay locally to catch promise rejections
    const handleTogglePlay = useCallback(async () => {
        if (!videoRef.current) {
            console.error('[VideoPlayer] togglePlay failed: videoRef is null');
            return;
        }

        try {
            if (isPlaying) {
                videoRef.current.pause();
                setPlaying(false);
            } else {
                console.log('[VideoPlayer] Attempting to play...', proxyUrl);
                await videoRef.current.play();
                setPlaying(true);
            }
        } catch (err: any) {
            console.error('[VideoPlayer] play() rejected:', err);
            setVideoError(`播放失败: ${err.name} - ${err.message} `);
        }
    }, [isPlaying, proxyUrl, setPlaying]);

    const handleImportVideo = async () => {
        if (!workspace) return;

        const file = await open({
            multiple: false,
            title: '导入视频文件',
            filters: [
                {
                    name: '视频文件',
                    extensions: [
                        'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v',
                        'rmvb', 'rm', 'ts', 'm2ts', 'vob', 'mpg', 'mpeg', '3gp', 'asf'
                    ],
                },
            ],
        });

        if (!file) return;

        const videoPath = file as string;
        setIsImporting(true);
        setImportProgress(0);
        setImportStatus('正在分析视频...');
        setVideoError(null);

        try {
            // Phase 1: Quick probe — get metadata instantly (<0.5s)
            const info = await quickProbe(videoPath);
            setFps(info.fps);
            setImportProgress(10);
            setImportStatus('正在准备预览...');

            console.log('[VideoPlayer] Quick probe complete:', {
                codec: info.videoCodec,
                container: info.container,
                duration: info.duration,
                resolution: `${info.width}x${info.height}`,
            });

            // Phase 2: Immediately play original file via streaming server
            createNewProject(videoPath);
            setOriginalVideoPath(videoPath);

            // Try to play the original video directly first
            const rawUrl = await invoke<string>('get_stream_url', { filePath: videoPath });
            console.log('[VideoPlayer] Playing original file instantly:', rawUrl);
            setProxyUrl(rawUrl);
            setProxyFilePath(videoPath); // temporarily point to original

            // Initialize segments with full duration
            const store = useProjectStore.getState();
            if (store.project) {
                store.project.segments = [{
                    id: crypto.randomUUID(),
                    index: 1,
                    startTime: 0,
                    endTime: info.duration,
                    description: '',
                    category: '',
                }];
            }

            await saveProject();

            // Done! User can now interact with the video
            setIsImporting(false);
            setImportProgress(null);
            setImportStatus('');

            // Phase 3: Background transcoding — fire and forget
            setIsTranscoding(true);
            setTranscodingProgress(0);

            backgroundTranscode(
                videoPath,
                workspace,
                (percent, _status) => {
                    setTranscodingProgress(percent);
                },
            ).then(async (proxyPath) => {
                console.log('[VideoPlayer] Background transcode complete:', proxyPath);

                // Hot-swap: remember time, swap URL, restore time
                const rememberedTime = useVideoStore.getState().currentTime;

                const newUrl = await invoke<string>('get_stream_url', { filePath: proxyPath });
                setProxyUrl(newUrl);
                setProxyFilePath(proxyPath);

                // Restore playback position after the new video loads
                const waitForLoad = () => {
                    const vid = useVideoStore.getState().videoRef;
                    if (vid) {
                        const onLoaded = () => {
                            vid.currentTime = rememberedTime;
                            vid.removeEventListener('loadedmetadata', onLoaded);
                        };
                        vid.addEventListener('loadedmetadata', onLoaded);
                    }
                };
                waitForLoad();

                setIsTranscoding(false);
                setTranscodingProgress(0);

                await useProjectStore.getState().saveProject();
                console.log('[VideoPlayer] Hot-swap to optimized proxy complete');
            }).catch((err) => {
                console.error('[VideoPlayer] Background transcode failed:', err);
                setIsTranscoding(false);
                setTranscodingProgress(0);
                // Keep using original file — it still works, just slower seeking
            });

        } catch (err) {
            console.error('Import failed:', err);
            alert(`导入视频失败: ${err}`);
            setIsImporting(false);
            setImportProgress(null);
            setImportStatus('');
        }
    };

    const handleScreenshotClick = () => {
        if (!workspace || !project?.videoFilePath) return;
        setModalMode('screenshot');
        setIsAssetModalOpen(true);
    };

    const handleClipClick = () => {
        if (!workspace || !project?.videoFilePath) return;
        setIsClippingMode(true);
        setClipStartTime(currentTime);
        setClipEndTime(Math.min(currentTime + 5, duration));
    };

    const handleAssetConfirm = async (asset: Asset, options?: { isAudio?: boolean; customFilename?: string }) => {
        setIsAssetModalOpen(false);
        if (!workspace || !project?.videoFilePath) return;

        try {
            const state = useProjectStore.getState();
            const pathParts = ['assets', asset.category, asset.name];
            if (state.rootProject && state.activeAssetId) {
                const parent = state.rootProject.assets.find(a => a.id === state.activeAssetId);
                if (parent) {
                    pathParts.unshift('assets', 'segment_analysis', parent.name);
                }
            }

            if (modalMode === 'screenshot') {
                const timestamp = currentTime;
                const baseName = options?.customFilename || `${asset.name}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
                const filename = baseName.endsWith('.png') ? baseName : `${baseName}.png`;
                const outputPath = await join(workspace, ...pathParts, filename);

                await takeScreenshot(project.videoFilePath, timestamp, outputPath);

                // Record file to asset
                const relativePath = [...pathParts, filename].join('/');
                addFileToAsset(asset.id, { path: relativePath, timestamp, type: 'screenshot' });

                showToast(`提取成功！截图已保存至 ${asset.name} 资产`);
            } else if (modalMode === 'clip') {
                setIsClippingMode(false);
                const isAudio = options?.isAudio;
                const ext = isAudio ? 'mp3' : 'mp4';
                const baseName = options?.customFilename || `${asset.name}_${isAudio ? 'audio' : 'clip'}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
                const filename = baseName.endsWith(`.${ext}`) ? baseName : `${baseName}.${ext}`;
                const outputPath = await join(workspace, ...pathParts, filename);

                const { invoke } = await import('@tauri-apps/api/core');
                await invoke('ensure_workspace_dirs', { workspace }); // optional safety

                const { exportClip } = await import('../../services/ffmpegService');

                showToast(`正在提取片段...请稍候`);
                await exportClip(project.videoFilePath, clipStartTime, clipEndTime, outputPath, isAudio);

                // Record file to asset
                const relativePath = [...pathParts, filename].join('/');
                addFileToAsset(asset.id, { path: relativePath, timestamp: clipStartTime, type: isAudio ? 'audio' : 'clip' });

                if (asset.category === 'segment_analysis' && !isAudio) {
                    const now = new Date().toISOString();
                    const subProject = {
                        videoFilePath: outputPath,
                        proxyFilePath: outputPath, // The exported clip is already a web-compatible mp4
                        segments: [{
                            id: crypto.randomUUID(),
                            index: 1,
                            startTime: 0,
                            endTime: clipEndTime - clipStartTime,
                            description: '',
                            category: '',
                        }],
                        textBlocks: [],
                        assets: [],
                        createdAt: now,
                        updatedAt: now,
                        metadata: { title: `${project?.metadata?.title || '片段'} - ${asset.name}`, sourceUrl: '', videoId: '' }
                    };
                    useProjectStore.getState().updateAsset(asset.id, { subProjectData: subProject });
                }

                showToast(`提取成功！${isAudio ? '音频' : '视频'}已保存至 ${asset.name} 资产`);
            }
        } catch (err) {
            console.error('Media extraction failed:', err);
            setVideoError(`导出失败: ${err}`);
        }
    };

    const handleVideoError = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        const err = video.error;
        const errMsg = err?.message || '未知错误';
        const errCode = err?.code || 0;
        console.error('[VideoPlayer] Video error:', errCode, errMsg, 'src:', proxyUrl);
        setVideoError(`播放错误(${errCode}): ${errMsg}`);
    }, [proxyUrl]);

    // Re-link original video path (for when the project is opened on a different computer)
    const handleRelinkVideo = async () => {
        const file = await open({
            multiple: false,
            title: '重新关联原始视频文件',
            filters: [{
                name: '视频文件',
                extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'rmvb', 'ts', 'm2ts', 'vob', 'mpg', 'mpeg', '3gp'],
            }],
        });
        if (!file) return;

        const newPath = file as string;
        const store = useProjectStore.getState();
        if (store.project) {
            store.project.videoFilePath = newPath;
            store.setProject({ ...store.project });
            setOriginalVideoPath(newPath);
            setVideoError(null);
            await store.saveProject();
            console.log('[VideoPlayer] Re-linked original video to:', newPath);
        }
    };

    // Show import UI if no video loaded
    if (!proxyUrl) {
        return (
            <div className="video-player video-player--empty">
                {isImporting ? (
                    <div className="import-progress">
                        <div className="import-progress-icon">⏳</div>
                        <p className="import-progress-text">{importStatus || '处理中...'}</p>
                        <div className="progress-bar">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${importProgress || 0}% ` }}
                            />
                        </div>
                        <p className="progress-percent">{importProgress || 0}%</p>
                    </div>
                ) : (
                    <button className="import-button" onClick={handleImportVideo}>
                        <span className="import-icon">🎥</span>
                        <span>导入视频文件</span>
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="video-player">
            <div className="video-container">
                {videoError && (
                    <div className="video-error-overlay" onClick={(e) => { e.stopPropagation(); setVideoError(null); }} style={{ cursor: 'pointer', zIndex: 50 }}>
                        <p>⚠️ {videoError}</p>
                        <p className="error-url">路径: {proxyUrl}</p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '10px', justifyContent: 'center' }}>
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRelinkVideo(); }}
                                style={{ padding: '6px 16px', background: 'rgba(100,100,200,0.3)', border: '1px solid rgba(100,100,200,0.5)', color: '#aaccff', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                🔗 重新关联原始视频
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setVideoError(null); }}
                                style={{ padding: '6px 16px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#aaa', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                关闭
                            </button>
                        </div>
                    </div>
                )}
                <video
                    key={proxyUrl}
                    ref={videoRefCallback}
                    src={proxyUrl}
                    preload="auto"
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onClick={handleTogglePlay}
                    onError={handleVideoError}
                    onCanPlay={() => {
                        console.log('[VideoPlayer] Video can play');
                        setVideoError(null);
                    }}
                />

                {/* Subtitle overlay */}
                {showSubtitles && subtitleCues.length > 0 && (() => {
                    const activeCue = subtitleCues.find(c => currentTime >= c.startTime && currentTime <= c.endTime);
                    if (!activeCue) return null;
                    return (
                        <div style={{
                            position: 'absolute',
                            bottom: '60px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            padding: '6px 16px',
                            borderRadius: '4px',
                            fontSize: '1.05rem',
                            lineHeight: '1.5',
                            maxWidth: '80%',
                            textAlign: 'center',
                            pointerEvents: 'none',
                            zIndex: 30,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {activeCue.text}
                        </div>
                    );
                })()}
            </div>

            {toastMessage && (
                <div className="video-toast">
                    {toastMessage}
                </div>
            )}

            {isAssetModalOpen && (
                <AssetSelectModal
                    isOpen={isAssetModalOpen}
                    onClose={() => setIsAssetModalOpen(false)}
                    onConfirm={handleAssetConfirm}
                    title={modalMode === 'screenshot' ? "保存截图至资产" : "保存截取片段至资产"}
                    modalMode={modalMode}
                />
            )}

            {isClippingMode && (
                <div className="clip-mode-bar">
                    <div className="clip-mode-header">
                        <span>🎬 视频截取模式</span>
                        <div className="clip-mode-actions">
                            <button className="btn-cancel" onClick={() => setIsClippingMode(false)}>取消</button>
                            <button
                                className="btn-primary"
                                onClick={() => {
                                    setModalMode('clip');
                                    setIsAssetModalOpen(true);
                                }}
                            >
                                确认截取并选择资产
                            </button>
                        </div>
                    </div>
                    <div className="clip-mode-handles">
                        <div className="clip-handle">
                            <label>起点 (In): {formatTime(clipStartTime, true)}</label>
                            <button onClick={() => setClipStartTime(currentTime)}>
                                设为当前时间
                            </button>
                        </div>
                        <div className="clip-duration">
                            时长: {formatTime(Math.max(0, clipEndTime - clipStartTime), true)}
                        </div>
                        <div className="clip-handle">
                            <label>终点 (Out): {formatTime(clipEndTime, true)}</label>
                            <button onClick={() => setClipEndTime(currentTime)}>
                                设为当前时间
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="playback-controls">
                <div className="controls-left">
                    <button className="ctrl-btn" onClick={() => skipSeconds(-5)} title="后退5秒 (J)">
                        ⏪
                    </button>
                    <button className="ctrl-btn" onClick={() => stepFrame(-1)} title="上一帧 (←)">
                        ◀
                    </button>
                    <button className="ctrl-btn ctrl-btn--play" onClick={handleTogglePlay} title="播放/暂停 (Space)">
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button className="ctrl-btn" onClick={() => stepFrame(1)} title="下一帧 (→)">
                        ▶
                    </button>
                    <button className="ctrl-btn" onClick={() => skipSeconds(5)} title="前进5秒 (L)">
                        ⏩
                    </button>
                </div>

                <div className="controls-center">
                    <span className="time-display">
                        {formatTime(currentTime, true)} / {formatTime(duration)}
                    </span>
                    {isTranscoding && (
                        <span className="transcoding-indicator" title={`后台优化中 ${transcodingProgress}%`}>
                            ⏳ {transcodingProgress}%
                        </span>
                    )}
                </div>

                <div className="controls-right">
                    <button
                        className="ctrl-btn"
                        onClick={() => {
                            if (duration > 0) addCutPoint(currentTime);
                        }}
                        title="添加切点 (B) &#10;注：切分发生在此刻画面之前"
                    >
                        ✂️
                    </button>
                    <button className="ctrl-btn" onClick={handleScreenshotClick} title="截图至资产 (Cmd+Shift+S)">
                        📸
                    </button>
                    <button className="ctrl-btn" onClick={handleClipClick} title="视频片段截取">
                        🎞️
                    </button>
                    <button
                        className="ctrl-btn"
                        ref={(el) => { (window as any).__ccBtnRef = el; }}
                        onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                        title="字幕"
                        style={{ position: 'relative', color: showSubtitles ? '#66aaff' : undefined }}
                    >
                        CC
                    </button>
                    {showSubtitleMenu && (() => {
                        const btnEl = (window as any).__ccBtnRef as HTMLElement | null;
                        const btnRect = btnEl?.getBoundingClientRect();
                        return (
                            <>
                                {/* Click-outside backdrop */}
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                                    onClick={() => setShowSubtitleMenu(false)}
                                />
                                <div style={{
                                    position: 'fixed',
                                    top: '48px',
                                    bottom: btnRect ? (window.innerHeight - btnRect.top + 6) : 60,
                                    right: btnRect ? (window.innerWidth - btnRect.right) : 16,
                                    background: '#1a1a2e',
                                    border: '1px solid rgba(255,255,255,0.15)',
                                    borderRadius: '8px',
                                    padding: '4px',
                                    minWidth: '200px',
                                    maxWidth: '320px',
                                    height: 'fit-content',
                                    maxHeight: `calc(100vh - ${btnRect ? (window.innerHeight - btnRect.top + 6) : 60}px - 48px)`,
                                    overflowY: 'auto',
                                    zIndex: 9999,
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                                }}>
                                    <div style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>外挂字幕</div>
                                    <button
                                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ccc', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                        onClick={async () => {
                                            setShowSubtitleMenu(false);
                                            const file = await open({
                                                filters: [{ name: '字幕文件', extensions: ['srt'] }],
                                                title: '选择字幕文件',
                                            });
                                            if (file) {
                                                try {
                                                    const { readTextFile } = await import('@tauri-apps/plugin-fs');
                                                    const content = await readTextFile(file as string);
                                                    const cues = parseSrt(content);
                                                    setSubtitleCues(cues);
                                                    setShowSubtitles(true);
                                                    setSubtitleFilePath(file as string);
                                                    showToast(`已加载 ${cues.length} 条字幕`);
                                                } catch (err) {
                                                    showToast(`字幕加载失败: ${err}`);
                                                }
                                            }
                                        }}
                                    >
                                        📄 加载 .srt 文件…
                                    </button>

                                    {embeddedTracks.length > 0 && (
                                        <>
                                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
                                            <div style={{ padding: '6px 10px', fontSize: '0.72rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>内嵌字幕轨 ({embeddedTracks.length})</div>
                                            {embeddedTracks.map((track) => (
                                                <button
                                                    key={track.index}
                                                    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ccc', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                    disabled={loadingTrack}
                                                    onClick={async () => {
                                                        if (!project?.videoFilePath) return;
                                                        setLoadingTrack(true);
                                                        setShowSubtitleMenu(false);
                                                        showToast(`正在提取字幕: ${track.title}...`);
                                                        try {
                                                            const srtContent = await extractSubtitleTrack(project.videoFilePath, track.index);
                                                            const cues = parseSrt(srtContent);
                                                            setSubtitleCues(cues);
                                                            setShowSubtitles(true);
                                                            showToast(`已加载 ${cues.length} 条字幕 (${track.title})`);
                                                        } catch (err) {
                                                            showToast(`字幕提取失败: ${err}`);
                                                        } finally {
                                                            setLoadingTrack(false);
                                                        }
                                                    }}
                                                >
                                                    📝 {track.title}{track.language ? ` [${track.language}]` : ''}
                                                </button>
                                            ))}
                                        </>
                                    )}

                                    {subtitleCues.length > 0 && (
                                        <>
                                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0' }} />
                                            <button
                                                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: showSubtitles ? '#66aaff' : '#ccc', padding: '8px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.82rem' }}
                                                onClick={() => {
                                                    setShowSubtitles(!showSubtitles);
                                                    setShowSubtitleMenu(false);
                                                }}
                                            >
                                                {showSubtitles ? '✅ 隐藏字幕' : '显示字幕'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        );
                    })()}
                    <div className="volume-control">
                        <span className="volume-icon">🔊</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            className="volume-slider"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
