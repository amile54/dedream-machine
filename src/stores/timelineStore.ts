import { create } from 'zustand';

interface TimelineState {
    pixelsPerSecond: number;
    selectedSegmentId: string | null;
    hoveredTime: number | null;

    // Actions
    setPixelsPerSecond: (pps: number) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    setSelectedSegmentId: (id: string | null) => void;
    setHoveredTime: (time: number | null) => void;
}

const MIN_PPS = 0.1; // Allows 2 hour movie to fit on 720px screen
const MAX_PPS = 200;
const ZOOM_FACTOR = 1.3;

export const useTimelineStore = create<TimelineState>((set, get) => ({
    pixelsPerSecond: 20,
    selectedSegmentId: null,
    hoveredTime: null,

    setPixelsPerSecond: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),

    zoomIn: () => {
        const { pixelsPerSecond } = get();
        set({ pixelsPerSecond: Math.min(MAX_PPS, pixelsPerSecond * ZOOM_FACTOR) });
    },

    zoomOut: () => {
        const { pixelsPerSecond } = get();
        set({ pixelsPerSecond: Math.max(MIN_PPS, pixelsPerSecond / ZOOM_FACTOR) });
    },

    setSelectedSegmentId: (id) => set({ selectedSegmentId: id }),
    setHoveredTime: (time) => set({ hoveredTime: time }),
}));
