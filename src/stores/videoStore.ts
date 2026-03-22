import { create } from 'zustand';
import { snapToFrame, stepToFrame } from '../utils/frameUtils';

interface VideoState {
    videoRef: HTMLVideoElement | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    fps: number;
    fpsConfirmed: boolean;
    volume: number;
    proxyUrl: string | null;
    originalVideoPath: string | null;
    isTranscoding: boolean;
    transcodingProgress: number;
    playbackRate: number;

    // Actions
    setVideoRef: (ref: HTMLVideoElement | null) => void;
    setPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setFps: (fps: number) => void;
    setVolume: (volume: number) => void;
    setProxyUrl: (url: string | null) => void;
    setOriginalVideoPath: (path: string | null) => void;
    setIsTranscoding: (v: boolean) => void;
    setTranscodingProgress: (p: number) => void;

    // Playback control
    togglePlay: () => void;
    seekTo: (time: number) => void;
    stepFrame: (direction: 1 | -1) => void;
    skipSeconds: (seconds: number) => void;
    cyclePlaybackRate: () => void;
    reset: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
    videoRef: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 24,
    fpsConfirmed: false,
    volume: 1,
    proxyUrl: null,
    originalVideoPath: null,
    isTranscoding: false,
    transcodingProgress: 0,
    playbackRate: 1,

    setVideoRef: (ref) => set({ videoRef: ref }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    setFps: (fps) => set({ fps, fpsConfirmed: true }),
    setVolume: (volume) => {
        const { videoRef } = get();
        if (videoRef) videoRef.volume = volume;
        set({ volume });
    },
    setProxyUrl: (url) => set({ proxyUrl: url }),
    setOriginalVideoPath: (path) => set({ originalVideoPath: path }),
    setIsTranscoding: (v) => set({ isTranscoding: v }),
    setTranscodingProgress: (p) => set({ transcodingProgress: p }),

    togglePlay: () => {
        const { videoRef, isPlaying } = get();
        if (!videoRef) return;
        if (isPlaying) {
            videoRef.pause();
        } else {
            videoRef.play();
        }
        set({ isPlaying: !isPlaying });
    },

    seekTo: (time) => {
        const { videoRef, fps } = get();
        if (!videoRef) return;
        const snapped = snapToFrame(time, fps);
        videoRef.currentTime = snapped;
        set({ currentTime: snapped });
    },

    stepFrame: (direction) => {
        const { videoRef, fps, duration } = get();
        if (!videoRef) return;
        const newTime = Math.min(duration, stepToFrame(videoRef.currentTime, fps, direction));
        videoRef.currentTime = newTime;
        set({ currentTime: newTime });
    },

    skipSeconds: (seconds) => {
        const { videoRef, duration } = get();
        if (!videoRef) return;
        videoRef.currentTime = Math.max(0, Math.min(duration, videoRef.currentTime + seconds));
    },

    cyclePlaybackRate: () => {
        const { videoRef, playbackRate } = get();
        const rates = [1, 1.5, 2, 3];
        const currentIdx = rates.indexOf(playbackRate);
        const nextRate = rates[(currentIdx + 1) % rates.length];
        if (videoRef) videoRef.playbackRate = nextRate;
        set({ playbackRate: nextRate });
    },

    reset: () => {
        const { videoRef } = get();
        if (videoRef) {
            videoRef.pause();
        }
        set({
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            fps: 24,
            fpsConfirmed: false,
            proxyUrl: null,
            originalVideoPath: null,
            isTranscoding: false,
            transcodingProgress: 0,
            playbackRate: 1,
        });
    },
}));
