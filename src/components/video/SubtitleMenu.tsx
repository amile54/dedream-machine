import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { parseSrt } from '../../services/subtitleParser';
import { extractSubtitleTrack } from '../../services/ffmpegService';
import type { SubtitleTrackInfo } from '../../services/ffmpegService';
import type { SubtitleCue } from '../../types';

interface SubtitleMenuProps {
    embeddedTracks: SubtitleTrackInfo[];
    subtitleCues: SubtitleCue[];
    showSubtitles: boolean;
    loadingTrack: boolean;
    videoFilePath: string | undefined;
    onClose: () => void;
    onCuesLoaded: (cues: SubtitleCue[]) => void;
    onToggleSubtitles: () => void;
    onSubtitleFileLoaded: (path: string) => void;
    onLoadingChange: (loading: boolean) => void;
    showToast: (msg: string) => void;
    /** Ref to the CC button for positioning */
    anchorRef: React.RefObject<HTMLButtonElement | null>;
}

export const SubtitleMenu: React.FC<SubtitleMenuProps> = ({
    embeddedTracks,
    subtitleCues,
    showSubtitles,
    loadingTrack,
    videoFilePath,
    onClose,
    onCuesLoaded,
    onToggleSubtitles,
    onSubtitleFileLoaded,
    onLoadingChange,
    showToast,
    anchorRef,
}) => {
    const btnRect = anchorRef.current?.getBoundingClientRect();

    return (
        <>
            {/* Click-outside backdrop */}
            <div
                style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                onClick={onClose}
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
                        onClose();
                        const file = await open({
                            filters: [{ name: '字幕文件', extensions: ['srt'] }],
                            title: '选择字幕文件',
                        });
                        if (file) {
                            try {
                                const { readTextFile } = await import('@tauri-apps/plugin-fs');
                                const content = await readTextFile(file as string);
                                const cues = parseSrt(content);
                                onCuesLoaded(cues);
                                onSubtitleFileLoaded(file as string);
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
                                    if (!videoFilePath) return;
                                    onLoadingChange(true);
                                    onClose();
                                    showToast(`正在提取字幕: ${track.title}...`);
                                    try {
                                        const srtContent = await extractSubtitleTrack(videoFilePath, track.index);
                                        const cues = parseSrt(srtContent);
                                        onCuesLoaded(cues);
                                        showToast(`已加载 ${cues.length} 条字幕 (${track.title})`);
                                    } catch (err) {
                                        showToast(`字幕提取失败: ${err}`);
                                    } finally {
                                        onLoadingChange(false);
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
                                onToggleSubtitles();
                                onClose();
                            }}
                        >
                            {showSubtitles ? '✅ 隐藏字幕' : '显示字幕'}
                        </button>
                    </>
                )}
            </div>
        </>
    );
};
