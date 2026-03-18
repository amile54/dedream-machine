import { create } from 'zustand';

interface TimelineState {
    pixelsPerSecond: number;
    selectedSegmentId: string | null;
    hoveredTime: number | null;

    // Actions
    setPixelsPerSecond: (pps: number) => void;
    setSelectedSegmentId: (id: string | null) => void;
    setHoveredTime: (time: number | null) => void;
}

const MIN_PPS = 0.01; // Fits 3hr+ movie in viewport
const MAX_PPS = 500;   // Frame-level editing

export const useTimelineStore = create<TimelineState>((set) => ({
    pixelsPerSecond: 20,
    selectedSegmentId: null,
    hoveredTime: null,

    setPixelsPerSecond: (pps) => set({ pixelsPerSecond: Math.max(MIN_PPS, Math.min(MAX_PPS, pps)) }),

    setSelectedSegmentId: (id) => set({ selectedSegmentId: id }),
    setHoveredTime: (time) => set({ hoveredTime: time }),
}));
