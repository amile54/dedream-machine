import { create } from 'zustand';

interface VideoState {
    videoRef: HTMLVideoElement | null;
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    fps: number;
    volume: number;
    proxyUrl: string | null;
    originalVideoPath: string | null;

    // Actions
    setVideoRef: (ref: HTMLVideoElement | null) => void;
    setPlaying: (playing: boolean) => void;
    setCurrentTime: (time: number) => void;
    setDuration: (duration: number) => void;
    setFps: (fps: number) => void;
    setVolume: (volume: number) => void;
    setProxyUrl: (url: string | null) => void;
    setOriginalVideoPath: (path: string | null) => void;

    // Playback control
    togglePlay: () => void;
    seekTo: (time: number) => void;
    stepFrame: (direction: 1 | -1) => void;
    skipSeconds: (seconds: number) => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
    videoRef: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    fps: 24,
    volume: 1,
    proxyUrl: null,
    originalVideoPath: null,

    setVideoRef: (ref) => set({ videoRef: ref }),
    setPlaying: (playing) => set({ isPlaying: playing }),
    setCurrentTime: (time) => set({ currentTime: time }),
    setDuration: (duration) => set({ duration }),
    setFps: (fps) => set({ fps }),
    setVolume: (volume) => {
        const { videoRef } = get();
        if (videoRef) videoRef.volume = volume;
        set({ volume });
    },
    setProxyUrl: (url) => set({ proxyUrl: url }),
    setOriginalVideoPath: (path) => set({ originalVideoPath: path }),

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
        const { videoRef } = get();
        if (!videoRef) return;
        videoRef.currentTime = time;
        set({ currentTime: time });
    },

    stepFrame: (direction) => {
        const { videoRef, fps } = get();
        if (!videoRef) return;
        const frameDuration = 1 / fps;
        videoRef.currentTime = Math.max(0, videoRef.currentTime + direction * frameDuration);
    },

    skipSeconds: (seconds) => {
        const { videoRef, duration } = get();
        if (!videoRef) return;
        videoRef.currentTime = Math.max(0, Math.min(duration, videoRef.currentTime + seconds));
    },
}));
