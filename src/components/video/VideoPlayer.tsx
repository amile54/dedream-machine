import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoStore } from '../../stores/videoStore';
import { useProjectStore, resolveWorkspacePath } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { formatTime } from '../../utils/timeFormat';
import { snapToFrame } from '../../utils/frameUtils';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { quickProbe, backgroundTranscode, takeScreenshot, getSubtitleTracks, getAudioTracks } from '../../services/ffmpegService';
import type { SubtitleTrackInfo, AudioTrackInfo } from '../../services/ffmpegService';
import { AssetSelectModal } from '../assets/AssetSelectModal';
import { SubtitleMenu } from './SubtitleMenu';
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
        playbackRate,
        cyclePlaybackRate,
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
    const ccBtnRef = useRef<HTMLButtonElement>(null);

    // Audio track state
    const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
    const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(null);

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
        if (project?.proxyFilePath && !proxyUrl && workspace) {
            const loadVideo = async () => {
                try {
                    const path = resolveWorkspacePath(workspace, project.proxyFilePath);
                    const url = await invoke<string>('get_stream_url', { filePath: path });
                    console.log('[VideoPlayer] Loading existing video via streaming server:', path, '-> URL:', url);
                    setProxyUrl(url);
                    setOriginalVideoPath(resolveWorkspacePath(workspace, project.videoFilePath));
                } catch (err) {
                    console.error('[VideoPlayer] Failed to get video URL:', err);
                }
            };
            loadVideo();
        }
    }, [project, proxyUrl, setProxyUrl, setOriginalVideoPath, workspace]);

    // Probe for embedded subtitle & audio tracks when video loads
    useEffect(() => {
        if (project?.videoFilePath && workspace) {
            const absVideoPath = resolveWorkspacePath(workspace, project.videoFilePath);
            getSubtitleTracks(absVideoPath)
                .then(tracks => {
                    setEmbeddedTracks(tracks);
                    if (tracks.length > 0) console.log('[VideoPlayer] Found embedded subtitle tracks:', tracks);
                })
                .catch(err => console.warn('[VideoPlayer] Could not probe subtitles:', err));

            getAudioTracks(absVideoPath)
                .then(tracks => {
                    setAudioTracks(tracks);
                    if (tracks.length > 0) {
                        setSelectedAudioIndex(tracks[0].index);
                        console.log('[VideoPlayer] Found audio tracks:', tracks);
                    }
                })
                .catch(err => console.warn('[VideoPlayer] Could not probe audio tracks:', err));
        }
    }, [project?.videoFilePath]);

    // Handle audio track selection — re-transcode with chosen track
    const handleSelectAudioTrack = useCallback(async (streamIndex: number) => {
        if (!project?.videoFilePath || !workspace) return;
        setSelectedAudioIndex(streamIndex);
        const track = audioTracks.find(t => t.index === streamIndex);
        showToast(`切换音轨: ${track?.title || 'Audio ' + streamIndex}，正在重新转码...`);
        setIsTranscoding(true);
        setTranscodingProgress(0);
        try {
            const proxyPath = await backgroundTranscode(
                project.videoFilePath,
                workspace,
                (percent) => setTranscodingProgress(percent),
                streamIndex,
            );
            const rememberedTime = currentTime;
            const newUrl = await invoke<string>('get_stream_url', { filePath: proxyPath });
            setProxyUrl(newUrl);
            setProxyFilePath(proxyPath);
            setVideoError(null);
            const vid = videoRef.current;
            if (vid) {
                const onLoaded = () => { vid.currentTime = rememberedTime; vid.removeEventListener('loadedmetadata', onLoaded); };
                vid.addEventListener('loadedmetadata', onLoaded);
            }
            showToast('音轨切换完成');
        } catch (err) {
            showToast(`音轨切换失败: ${err}`);
        } finally {
            setIsTranscoding(false);
            setTranscodingProgress(0);
        }
    }, [project?.videoFilePath, workspace, audioTracks, currentTime, showToast]);

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
        if (!workspace || isImporting || isTranscoding) return; // Guard against double-click and mid-transcode re-import

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
            setDuration(info.duration); // Always set duration from FFprobe so timeline works immediately
            setImportProgress(10);
            setImportStatus('正在准备预览...');

            console.log('[VideoPlayer] Quick probe complete:', {
                codec: info.videoCodec,
                container: info.container,
                duration: info.duration,
                resolution: `${info.width}x${info.height}`,
            });

            // If a project already exists (e.g. from CSV import), preserve its data
            // and just update the video path. Only create a blank project if none exists.
            const existingProject = useProjectStore.getState().project;
            if (existingProject && existingProject.segments.length > 0) {
                // Preserve existing segments/textBlocks, just update the video path (immutably)
                // Clear proxyFilePath so the old stale path doesn't persist through the spread
                const snappedSegments = existingProject.segments.map(seg => ({
                    ...seg,
                    startTime: snapToFrame(seg.startTime, info.fps),
                    endTime: snapToFrame(seg.endTime, info.fps),
                }));
                useProjectStore.getState().setProject({
                    ...existingProject,
                    videoFilePath: videoPath,
                    proxyFilePath: undefined as any,
                    segments: snappedSegments,
                });
                console.log('[VideoPlayer] Existing project found with', snappedSegments.length, 'segments — preserved & frame-snapped');
            } else {
                // No existing data — create a fresh project with one full-duration segment
                createNewProject(videoPath);
                const currentProject = useProjectStore.getState().project;
                if (currentProject) {
                    useProjectStore.getState().setProject({
                        ...currentProject,
                        segments: [{
                            id: crypto.randomUUID(),
                            index: 1,
                            startTime: 0,
                            endTime: info.duration,
                            description: '',
                            category: '',
                        }],
                    });
                }
            }
            setOriginalVideoPath(videoPath);

            // Check if the format is likely WebKit-compatible for instant preview
            const webkitPlayable = ['mp4', 'mov', 'webm', 'm4v'].includes(info.container.toLowerCase())
                && !['hevc', 'h265', 'vp9'].includes(info.videoCodec.toLowerCase());

            if (webkitPlayable) {
                // Instant preview: play original file directly
                const rawUrl = await invoke<string>('get_stream_url', { filePath: videoPath });
                console.log('[VideoPlayer] WebKit-compatible format, playing instantly:', rawUrl);
                setProxyUrl(rawUrl);
                setProxyFilePath(videoPath);
            } else {
                console.log('[VideoPlayer] Non-WebKit format detected, waiting for transcode:', info.container, info.videoCodec);
                // Don't set proxyUrl yet — we'll wait for the transcode
            }

            await saveProject();

            // Capture the workspace at import time to detect project-switch
            const importWorkspace = workspace;

            // Done with the synchronous part — user sees the UI
            setIsImporting(false);
            setImportProgress(null);
            setImportStatus('');

            // Phase 2: Background transcoding
            setIsTranscoding(true);
            setTranscodingProgress(0);

            backgroundTranscode(
                videoPath,
                workspace,
                (percent, _status) => {
                    setTranscodingProgress(percent);
                },
            ).then(async (proxyPath) => {
                // Guard: if user switched projects during transcoding, discard this result
                const currentWorkspace = useProjectStore.getState().workspace;
                if (currentWorkspace !== importWorkspace) {
                    console.warn('[VideoPlayer] Project switched during transcoding, discarding result');
                    setIsTranscoding(false);
                    setTranscodingProgress(0);
                    return;
                }

                console.log('[VideoPlayer] Background transcode complete:', proxyPath);

                // Hot-swap: remember time, swap URL, restore time
                const rememberedTime = useVideoStore.getState().currentTime;

                const newUrl = await invoke<string>('get_stream_url', { filePath: proxyPath });
                setProxyUrl(newUrl);
                setProxyFilePath(proxyPath);
                setVideoError(null); // Clear any lingering errors

                // Restore playback position after the new video loads
                const vid = useVideoStore.getState().videoRef;
                if (vid) {
                    const onLoaded = () => {
                        vid.currentTime = rememberedTime;
                        vid.removeEventListener('loadedmetadata', onLoaded);
                    };
                    vid.addEventListener('loadedmetadata', onLoaded);
                }

                setIsTranscoding(false);
                setTranscodingProgress(0);

                await useProjectStore.getState().saveProject();
                console.log('[VideoPlayer] Hot-swap to optimized proxy complete');
            }).catch((err) => {
                console.error('[VideoPlayer] Background transcode failed:', err);
                setIsTranscoding(false);
                setTranscodingProgress(0);
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
        if (!workspace || !project?.videoFilePath || !proxyUrl || isTranscoding) return;
        setModalMode('screenshot');
        setIsAssetModalOpen(true);
    };

    const handleClipClick = () => {
        if (!workspace || !project?.videoFilePath || !proxyUrl || isTranscoding) return;
        setIsClippingMode(true);
        setClipStartTime(currentTime);
        setClipEndTime(Math.min(currentTime + 5, duration));
    };

    const handleAssetConfirm = async (asset: Asset, options?: { isAudio?: boolean; customFilename?: string }, parentAssetId?: string) => {
        setIsAssetModalOpen(false);
        if (!workspace || !project?.videoFilePath) return;

        try {
            const state = useProjectStore.getState();
            
            // Base path resolution
            let pathParts = ['assets', asset.category, asset.name];

            if (parentAssetId) {
                // We are saving hierarchically FROM the root INTO a sub-project (segment_analysis)
                const parent = state.project?.assets?.find(a => a.id === parentAssetId);
                if (parent) {
                    pathParts.unshift('assets', 'segment_analysis', parent.name);
                }
            } else if (state.rootProject && state.activeAssetId) {
                // We are CURRENTLY inside a sub-project analysis environment
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

                const absVideoPath = resolveWorkspacePath(workspace, project.videoFilePath);
                await takeScreenshot(absVideoPath, timestamp, outputPath);

                // Record file to asset
                const relativePath = [...pathParts, filename].join('/');
                if (parentAssetId) {
                    state.addFileToSubProjectAsset(parentAssetId, asset.id, { path: relativePath, timestamp, type: 'screenshot' });
                } else {
                    state.addFileToAsset(asset.id, { path: relativePath, timestamp, type: 'screenshot' });
                }

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
                // Validate clip range
                if (clipStartTime >= clipEndTime) {
                    showToast('⚠️ 截取范围无效：起点必须在终点之前');
                    return;
                }
                // Use the proxy video (H.264 MP4) as source — guarantees web-compatible output.
                // The original video might be MKV/HEVC which WebKit can't play after `-c copy`.
                const absVideoPath = resolveWorkspacePath(workspace, project.videoFilePath);
                let clipSource = absVideoPath;
                if (project.proxyFilePath) {
                    // Resolve relative proxy path to absolute, supporting both POSIX and Windows
                    clipSource = resolveWorkspacePath(workspace, project.proxyFilePath);
                }
                const currentFps = useVideoStore.getState().fps || 24;
                await exportClip(clipSource, clipStartTime, clipEndTime, outputPath, isAudio, currentFps);

                // Record file to asset
                const relativePath = [...pathParts, filename].join('/');
                if (parentAssetId) {
                    state.addFileToSubProjectAsset(parentAssetId, asset.id, { path: relativePath, timestamp: clipStartTime, type: isAudio ? 'audio' : 'clip' });
                } else {
                    state.addFileToAsset(asset.id, { path: relativePath, timestamp: clipStartTime, type: isAudio ? 'audio' : 'clip' });
                }

                if (!parentAssetId && asset.category === 'segment_analysis' && !isAudio) {
                    const now = new Date().toISOString();
                    const subProject = {
                        videoFilePath: relativePath,   // relative to workspace — portable across machines
                        proxyFilePath: relativePath,   // the exported clip is already web-compatible mp4
                        segments: [{
                            id: crypto.randomUUID(),
                            index: 1,
                            startTime: 0,
                            // Mirror the one-frame subtraction done in exportClip so the
                            // sub-project's segment range exactly matches the on-disk clip length.
                            endTime: Math.max(0, (clipEndTime - clipStartTime) - (1.0 / currentFps)),
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
        // Don't show error overlay during transcoding — the video isn't expected to play yet
        if (!useVideoStore.getState().isTranscoding) {
            setVideoError(`播放错误(${errCode}): ${errMsg}`);
        }
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

    // Allow re-import: clear stale video state and trigger import flow
    const handleReimportVideo = () => {
        setProxyUrl(null);
        setVideoError(null);
        setIsTranscoding(false);
        setTranscodingProgress(0);
        // Also clear the stale proxyFilePath from project store so re-import
        // can properly overwrite it with the new transcoded proxy path
        setProxyFilePath(undefined as any);
        // After state clears, the component re-renders showing the import UI,
        // but we trigger import directly for better UX
        setTimeout(() => handleImportVideo(), 100);
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
                                style={{ width: `${importProgress || 0}%` }}
                            />
                        </div>
                        <p className="progress-percent">{importProgress || 0}%</p>
                    </div>
                ) : isTranscoding ? (
                    <div className="import-progress">
                        <div className="import-progress-icon">🎬</div>
                        <p className="import-progress-text">视频格式不兼容，正在后台优化中...</p>
                        <div className="progress-bar">
                            <div
                                className="progress-bar-fill"
                                style={{ width: `${transcodingProgress}%` }}
                            />
                        </div>
                        <p className="progress-percent">{transcodingProgress}%</p>
                        <p style={{ fontSize: '0.75rem', color: '#888', marginTop: '0.5rem' }}>优化完成后将自动播放，请稍候</p>
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
                                onClick={(e) => { e.stopPropagation(); handleReimportVideo(); }}
                                style={{ padding: '6px 16px', background: 'rgba(100,200,100,0.3)', border: '1px solid rgba(100,200,100,0.5)', color: '#aaffaa', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                🎥 重新导入视频
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
                    <button
                        className={`ctrl-btn ${playbackRate !== 1 ? 'ctrl-btn--active' : ''}`}
                        onClick={cyclePlaybackRate}
                        title="切换播放速度"
                        style={{ fontSize: '0.7rem', fontWeight: playbackRate !== 1 ? 'bold' : 'normal', minWidth: '36px' }}
                    >
                        {playbackRate === 1 ? '1x' : `${playbackRate}x`}
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
                        ref={ccBtnRef}
                        onClick={() => setShowSubtitleMenu(!showSubtitleMenu)}
                        title="字幕"
                        style={{ position: 'relative', color: showSubtitles ? '#66aaff' : undefined }}
                    >
                        CC
                    </button>
                    {showSubtitleMenu && (
                        <SubtitleMenu
                            embeddedTracks={embeddedTracks}
                            audioTracks={audioTracks}
                            selectedAudioIndex={selectedAudioIndex}
                            subtitleCues={subtitleCues}
                            showSubtitles={showSubtitles}
                            loadingTrack={loadingTrack}
                            videoFilePath={resolveWorkspacePath(workspace, project?.videoFilePath)}
                            onClose={() => setShowSubtitleMenu(false)}
                            onCuesLoaded={(cues) => {
                                setSubtitleCues(cues);
                                setShowSubtitles(true);
                            }}
                            onToggleSubtitles={() => setShowSubtitles(!showSubtitles)}
                            onSubtitleFileLoaded={(path) => setSubtitleFilePath(path)}
                            onLoadingChange={setLoadingTrack}
                            onSelectAudioTrack={handleSelectAudioTrack}
                            showToast={showToast}
                            anchorRef={ccBtnRef}
                        />
                    )}
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
