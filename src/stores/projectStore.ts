import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Segment, TextBlock, TextBlockType, Asset, AssetCategory } from '../types';
import { invoke } from '@tauri-apps/api/core';

interface ProjectState {
    workspace: string | null;
    project: Project | null;
    isDirty: boolean;
    isLoading: boolean;
    undoStack: Segment[][]; // History of segment states for undo

    // Actions
    setWorkspace: (path: string) => void;
    setProject: (project: Project) => void;
    createNewProject: (videoFilePath: string) => void;
    // Project Metadata
    updateMetadata: (metadata: Partial<Project['metadata']>) => void;

    // Segment operations
    addCutPoint: (time: number) => void;
    removeCutPoint: (segmentIndex: number) => void;
    moveCutPoint: (cutPointIndex: number, newTime: number) => void;
    updateSegment: (id: string, updates: Partial<Segment>) => void;
    undoSegments: () => void;

    // TextBlock operations
    addTextBlock: (blockType: TextBlockType, title: string) => void;
    updateTextBlock: (id: string, updates: Partial<TextBlock>) => void;
    removeTextBlock: (id: string) => void;

    // Asset operations
    addAsset: (category: AssetCategory, name: string) => void;
    updateAsset: (id: string, updates: Partial<Asset>) => void;
    removeAsset: (id: string) => void;

    // Project I/O
    saveProject: () => Promise<void>;
    loadProject: (workspace: string) => Promise<boolean>;

    // Proxy
    setProxyFilePath: (path: string) => void;
    setSubtitleFilePath: (path: string | undefined) => void;
}

function recalculateSegments(cutPoints: number[], videoDuration: number): Segment[] {
    const sorted = [...cutPoints].sort((a, b) => a - b);
    const boundaries = [0, ...sorted, videoDuration];
    const segments: Segment[] = [];

    for (let i = 0; i < boundaries.length - 1; i++) {
        segments.push({
            id: uuidv4(),
            index: i + 1,
            startTime: boundaries[i],
            endTime: boundaries[i + 1],
            description: '',
            category: '',
        });
    }
    return segments;
}

function extractCutPoints(segments: Segment[]): number[] {
    if (segments.length <= 1) return [];
    return segments.slice(1).map(s => s.startTime);
}

export const useProjectStore = create<ProjectState>((set, get) => ({
    workspace: null,
    project: null,
    isDirty: false,
    isLoading: false,
    undoStack: [],

    setWorkspace: (path) => set({ workspace: path }),

    setProject: (project) => set({ project, isDirty: false, undoStack: [] }),

    createNewProject: (videoFilePath) => {
        const now = new Date().toISOString();
        const project: Project = {
            videoFilePath,
            segments: [],
            textBlocks: [],
            assets: [],
            createdAt: now,
            updatedAt: now,
            metadata: { title: '', sourceUrl: '', videoId: '' }
        };
        set({ project, isDirty: true, undoStack: [] });
    },

    markDirty: () => set({ isDirty: true }),

    updateMetadata: (metadataUpdates) => {
        const { project } = get();
        if (!project) return;
        set({
            project: {
                ...project,
                metadata: { ...(project.metadata || { title: '', sourceUrl: '', videoId: '' }), ...metadataUpdates },
                updatedAt: new Date().toISOString()
            },
            isDirty: true
        });
    },

    addCutPoint: (time) => {
        const { project } = get();
        if (!project) return;

        const existingCutPoints = extractCutPoints(project.segments);
        // Don't add duplicate cut points (within 0.1s tolerance)
        if (existingCutPoints.some(cp => Math.abs(cp - time) < 0.1)) return;

        const newCutPoints = [...existingCutPoints, time];
        const videoDuration = project.segments.length > 0
            ? project.segments[project.segments.length - 1].endTime
            : time + 1; // fallback

        const oldSegments = project.segments;
        const newSegments = recalculateSegments(newCutPoints, videoDuration);

        // Preserve descriptions and categories from old segments
        newSegments.forEach(newSeg => {
            const oldSeg = oldSegments.find(old =>
                Math.abs(old.startTime - newSeg.startTime) < 0.1
            );
            if (oldSeg) {
                newSeg.description = oldSeg.description;
                newSeg.category = oldSeg.category;
                newSeg.id = oldSeg.id;
            }
        });

        set({
            project: { ...project, segments: newSegments, updatedAt: new Date().toISOString() },
            isDirty: true,
            undoStack: [...get().undoStack, oldSegments], // save history
        });
    },

    removeCutPoint: (segmentIndex) => {
        const { project } = get();
        if (!project || project.segments.length <= 1) return;

        const cutPoints = extractCutPoints(project.segments);
        if (segmentIndex < 0 || segmentIndex >= cutPoints.length) return;

        const newCutPoints = cutPoints.filter((_, i) => i !== segmentIndex);
        const videoDuration = project.segments[project.segments.length - 1].endTime;
        const oldSegments = project.segments;
        const newSegments = recalculateSegments(newCutPoints, videoDuration);

        // Preserve descriptions
        newSegments.forEach(newSeg => {
            const oldSeg = oldSegments.find(old =>
                Math.abs(old.startTime - newSeg.startTime) < 0.1
            );
            if (oldSeg) {
                newSeg.description = oldSeg.description;
                newSeg.category = oldSeg.category;
                newSeg.id = oldSeg.id;
            }
        });

        set({
            project: { ...project, segments: newSegments, updatedAt: new Date().toISOString() },
            isDirty: true,
            undoStack: [...get().undoStack, oldSegments], // save history
        });
    },

    moveCutPoint: (cutPointIndex, newTime) => {
        const { project } = get();
        if (!project || project.segments.length <= 1) return;

        const existingCutPoints = extractCutPoints(project.segments);
        if (cutPointIndex < 0 || cutPointIndex >= existingCutPoints.length) return;

        // Prevent moving past adjacent cut points
        const minTime = cutPointIndex > 0 ? existingCutPoints[cutPointIndex - 1] + 0.1 : 0.1;
        const maxTime = cutPointIndex < existingCutPoints.length - 1
            ? existingCutPoints[cutPointIndex + 1] - 0.1
            : project.segments[project.segments.length - 1].endTime - 0.1;

        const clampedTime = Math.max(minTime, Math.min(newTime, maxTime));

        const newCutPoints = [...existingCutPoints];
        newCutPoints[cutPointIndex] = clampedTime;

        const videoDuration = project.segments[project.segments.length - 1].endTime;
        const oldSegments = project.segments;
        const newSegments = recalculateSegments(newCutPoints, videoDuration);

        // Preserve descriptions exactly (since we didn't add/remove, just moved, indexes match perfectly)
        newSegments.forEach((newSeg, i) => {
            if (oldSegments[i]) {
                newSeg.description = oldSegments[i].description;
                newSeg.category = oldSegments[i].category;
                newSeg.id = oldSegments[i].id; // Keep same UUID to avoid React re-mounts
            }
        });

        set({
            project: { ...project, segments: newSegments, updatedAt: new Date().toISOString() },
            isDirty: true,
            undoStack: [...get().undoStack, oldSegments], // save history
        });
    },

    updateSegment: (id, updates) => {
        const { project } = get();
        if (!project) return;

        const segments = project.segments.map(s =>
            s.id === id ? { ...s, ...updates } : s
        );

        set({
            project: { ...project, segments, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    undoSegments: () => {
        const { project, undoStack } = get();
        if (!project || undoStack.length === 0) return;

        const previousSegments = undoStack[undoStack.length - 1];
        const newUndoStack = undoStack.slice(0, -1);

        set({
            project: { ...project, segments: previousSegments, updatedAt: new Date().toISOString() },
            isDirty: true,
            undoStack: newUndoStack,
        });
    },

    addTextBlock: (blockType, title) => {
        const { project } = get();
        if (!project) return;

        const newBlock: TextBlock = {
            id: uuidv4(),
            title,
            content: '',
            blockType,
            sortOrder: project.textBlocks.length,
        };

        set({
            project: {
                ...project,
                textBlocks: [...project.textBlocks, newBlock],
                updatedAt: new Date().toISOString(),
            },
            isDirty: true,
        });
    },

    updateTextBlock: (id, updates) => {
        const { project } = get();
        if (!project) return;

        const textBlocks = project.textBlocks.map(tb =>
            tb.id === id ? { ...tb, ...updates } : tb
        );

        set({
            project: { ...project, textBlocks, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    removeTextBlock: (id) => {
        const { project } = get();
        if (!project) return;

        const textBlocks = project.textBlocks
            .filter(tb => tb.id !== id)
            .map((tb, i) => ({ ...tb, sortOrder: i }));

        set({
            project: { ...project, textBlocks, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    addAsset: (category, name) => {
        const { project } = get();
        if (!project) return;

        const newAsset: Asset = {
            id: uuidv4(),
            name,
            category,
            description: '',
            createdAt: new Date().toISOString(),
        };

        set({
            project: {
                ...project,
                assets: [...(project.assets || []), newAsset],
                updatedAt: new Date().toISOString(),
            },
            isDirty: true,
        });
    },

    updateAsset: (id, updates) => {
        const { project } = get();
        if (!project) return;

        const assets = (project.assets || []).map(a =>
            a.id === id ? { ...a, ...updates } : a
        );

        set({
            project: { ...project, assets, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    removeAsset: (id) => {
        const { project } = get();
        if (!project) return;

        const assets = (project.assets || []).filter(a => a.id !== id);

        set({
            project: { ...project, assets, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    saveProject: async () => {
        const { workspace, project } = get();
        if (!workspace || !project) return;

        try {
            await invoke('save_project', { workspace, project });
            set({ isDirty: false });
        } catch (err) {
            console.error('Failed to save project:', err);
            throw err;
        }
    },

    loadProject: async (workspace) => {
        set({ isLoading: true });
        try {
            await invoke('ensure_workspace_dirs', { workspace });
            const project = await invoke<Project | null>('load_project', { workspace });
            if (project) {
                set({ workspace, project, isDirty: false, isLoading: false, undoStack: [] });
                return true;
            }
            set({ workspace, isLoading: false, undoStack: [] });
            return false;
        } catch (err) {
            console.error('Failed to load project:', err);
            set({ isLoading: false });
            return false;
        }
    },

    setProxyFilePath: (path) => {
        const { project } = get();
        if (!project) return;
        set({
            project: { ...project, proxyFilePath: path, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    setSubtitleFilePath: (path) => {
        const { project } = get();
        if (!project) return;
        set({
            project: { ...project, subtitleFilePath: path, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },
}));
