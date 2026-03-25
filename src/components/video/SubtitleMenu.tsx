import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { parseSrt } from '../../services/subtitleParser';
import { extractSubtitleTrack } from '../../services/ffmpegService';
import type { SubtitleTrackInfo, AudioTrackInfo } from '../../services/ffmpegService';
import type { SubtitleCue } from '../../types';

interface SubtitleMenuProps {
    embeddedTracks: SubtitleTrackInfo[];
    audioTracks: AudioTrackInfo[];
    selectedAudioIndex: number | null;
    subtitleCues: SubtitleCue[];
    showSubtitles: boolean;
    loadingTrack: boolean;
    videoFilePath: string | undefined;
    onClose: () => void;
    onCuesLoaded: (cues: SubtitleCue[]) => void;
    onToggleSubtitles: () => void;
    onSubtitleFileLoaded: (path: string) => void;
    onLoadingChange: (loading: boolean) => void;
    onSelectAudioTrack: (streamIndex: number) => void;
    showToast: (msg: string) => void;
    anchorRef: React.RefObject<HTMLButtonElement | null>;
}

const menuItemStyle: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none', color: '#ccc',
    padding: '8px 10px', borderRadius: '4px', cursor: 'pointer',
    fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis',
};

const sectionLabelStyle: React.CSSProperties = {
    padding: '6px 10px', fontSize: '0.72rem', color: '#888',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
};

const dividerStyle: React.CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.08)', margin: '4px 0',
};

export const SubtitleMenu: React.FC<SubtitleMenuProps> = ({
    embeddedTracks,
    audioTracks,
    selectedAudioIndex,
    subtitleCues,
    showSubtitles,
    loadingTrack,
    videoFilePath,
    onClose,
    onCuesLoaded,
    onToggleSubtitles,
    onSubtitleFileLoaded,
    onLoadingChange,
    onSelectAudioTrack,
    showToast,
    anchorRef,
}) => {
    const btnRect = anchorRef.current?.getBoundingClientRect();

    // Position: anchored above the button, right-aligned
    const menuStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: btnRect ? (window.innerHeight - btnRect.top + 8) : 60,
        right: btnRect ? (window.innerWidth - btnRect.right - 20) : 16,
        background: '#1a1a2e',
        border: '1px solid rgba(255,255,255,0.15)',
        borderRadius: '8px',
        padding: '4px',
        minWidth: '220px',
        maxWidth: '340px',
        maxHeight: '60vh',
        overflowY: 'auto',
        zIndex: 9999,
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
    };

    return (
        <>
            {/* Click-outside backdrop */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
            <div style={menuStyle}>
                {/* ── Audio Tracks ── */}
                {audioTracks.length > 1 && (
                    <>
                        <div style={sectionLabelStyle}>🔊 音轨 ({audioTracks.length})</div>
                        {audioTracks.map((track) => {
                            const isActive = selectedAudioIndex === track.index;
                            const chLabel = track.channels > 2 ? ` ${track.channels}ch` : '';
                            return (
                                <button
                                    key={track.index}
                                    style={{
                                        ...menuItemStyle,
                                        color: isActive ? '#66aaff' : '#ccc',
                                        background: isActive ? 'rgba(100,150,255,0.1)' : 'none',
                                    }}
                                    onClick={() => { onSelectAudioTrack(track.index); onClose(); }}
                                >
                                    {isActive ? '✅ ' : '　 '}
                                    {track.title}
                                    {track.language ? ` [${track.language}]` : ''}
                                    {chLabel}
                                    <span style={{ fontSize: '0.68rem', color: '#666', marginLeft: '6px' }}>{track.codec}</span>
                                </button>
                            );
                        })}
                        <div style={dividerStyle} />
                    </>
                )}

                {/* ── External Subtitle ── */}
                <div style={sectionLabelStyle}>外挂字幕</div>
                <button
                    style={menuItemStyle}
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

                {/* ── Embedded Subtitles ── */}
                {embeddedTracks.length > 0 && (
                    <>
                        <div style={dividerStyle} />
                        <div style={sectionLabelStyle}>内嵌字幕轨 ({embeddedTracks.length})</div>
                        {embeddedTracks.map((track) => (
                            <button
                                key={track.index}
                                style={menuItemStyle}
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

                {/* ── Toggle Loaded Subtitles ── */}
                {subtitleCues.length > 0 && (
                    <>
                        <div style={dividerStyle} />
                        <button
                            style={{ ...menuItemStyle, color: showSubtitles ? '#66aaff' : '#ccc' }}
                            onClick={() => { onToggleSubtitles(); onClose(); }}
                        >
                            {showSubtitles ? '✅ 隐藏字幕' : '显示字幕'}
                        </button>
                    </>
                )}
            </div>
        </>
    );
};
