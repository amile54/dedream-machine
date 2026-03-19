import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { Project, Segment, TextBlock, TextBlockType, Asset, AssetCategory, AssetFile } from '../types';
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
    addFileToAsset: (assetId: string, file: AssetFile) => void;
    removeAssetFile: (assetId: string, filePath: string) => void;

    // Project I/O
    saveProject: () => Promise<void>;
    loadProject: (workspace: string) => Promise<boolean>;
    switchProject: () => Promise<void>;

    // Proxy
    setProxyFilePath: (path: string) => void;
    setSubtitleFilePath: (path: string | undefined) => void;

    // Sub-project Context Switching
    rootProject: Project | null;
    activeAssetId: string | null;
    enterSubProject: (assetId: string) => void;
    exitSubProject: () => void;
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
    rootProject: null,
    activeAssetId: null,
    isDirty: false,
    isLoading: false,
    undoStack: [],

    setWorkspace: (path) => set({ workspace: path }),

    setProject: (project) => set({ project, rootProject: null, activeAssetId: null, isDirty: false, undoStack: [] }),

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
        set({ project, rootProject: null, activeAssetId: null, isDirty: true, undoStack: [] });
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
            undoStack: [...get().undoStack, oldSegments].slice(-50), // cap at 50 entries
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
            undoStack: [...get().undoStack, oldSegments].slice(-50),
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
            files: [],
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
        const { workspace, project, rootProject, activeAssetId } = get();
        if (!workspace || !project) return;

        const assetToDelete = (project.assets || []).find(a => a.id === id);
        const assets = (project.assets || []).filter(a => a.id !== id);

        set({
            project: { ...project, assets, updatedAt: new Date().toISOString() },
            isDirty: true,
        });

        // Trigger physical deletion in the background
        if (assetToDelete) {
            import('@tauri-apps/api/core').then(({ invoke }) => {
                const pathParts = ['assets', assetToDelete.category, assetToDelete.name];
                if (rootProject && activeAssetId) {
                    const parent = rootProject.assets?.find(a => a.id === activeAssetId);
                    if (parent) {
                        pathParts.unshift('assets', 'segment_analysis', parent.name);
                    }
                }
                import('@tauri-apps/api/path').then(({ join }) => {
                    join(workspace, ...pathParts).then(targetFolderPath => {
                        invoke('delete_asset_folder', { path: targetFolderPath }).catch(err => {
                            console.warn('[removeAsset] Failed to delete asset folder on disk:', err);
                        });
                    });
                });
            });
        }
    },

    addFileToAsset: (assetId, file) => {
        const { project } = get();
        if (!project) return;

        const assets = (project.assets || []).map(a =>
            a.id === assetId ? { ...a, files: [...(a.files || []), file] } : a
        );

        set({
            project: { ...project, assets, updatedAt: new Date().toISOString() },
            isDirty: true,
        });
    },

    removeAssetFile: (assetId, filePath) => {
        const { workspace, project } = get();
        if (!workspace || !project) return;

        const assets = (project.assets || []).map(a => {
            if (a.id === assetId) {
                return { ...a, files: a.files?.filter(f => f.path !== filePath) || [] };
            }
            return a;
        });

        set({
            project: { ...project, assets, updatedAt: new Date().toISOString() },
            isDirty: true,
        });

        // Trigger physical deletion in the background
        import('@tauri-apps/api/core').then(({ invoke }) => {
            import('@tauri-apps/api/path').then(({ join }) => {
                join(workspace, filePath).then(absolutePath => {
                    invoke('delete_asset_file', { path: absolutePath }).catch(err => {
                        console.warn('[removeAssetFile] Failed to delete file on disk:', err);
                    });
                });
            });
        });
    },

    saveProject: async () => {
        const { workspace, project, rootProject, activeAssetId } = get();
        if (!workspace || !project) return;

        try {
            // If we are currently inside a nested sub-project, we must sync our local project state 
            // back into the root project's asset tree before saving to disk.
            let projectToSave = project;
            if (rootProject && activeAssetId) {
                const updatedRoot = { ...rootProject };
                updatedRoot.assets = updatedRoot.assets.map(a => 
                    a.id === activeAssetId ? { ...a, subProjectData: { ...project } } : a
                );
                projectToSave = updatedRoot;
            } else {
                projectToSave = { ...project };
            }

            // Convert proxyFilePath to relative for portability
            if (projectToSave.proxyFilePath && projectToSave.proxyFilePath.startsWith(workspace)) {
                // Extract the relative part (e.g. "/Users/me/project/proxy.mp4" -> "proxy.mp4")
                let relative = projectToSave.proxyFilePath.slice(workspace.length);
                // Remove leading slash or backslash
                relative = relative.replace(/^[/\\]/, '');
                projectToSave.proxyFilePath = relative;
            }

            await invoke('save_project', { workspace, project: projectToSave });
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
                // Convert relative proxyFilePath back to absolute
                if (project.proxyFilePath && !project.proxyFilePath.startsWith('/') && !project.proxyFilePath.match(/^[A-Za-z]:\\/)) {
                    // It's a relative path — resolve against workspace
                    const sep = workspace.includes('\\') ? '\\' : '/';
                    project.proxyFilePath = workspace + sep + project.proxyFilePath;
                }

                // Verify proxy file actually exists on disk (user may have deleted it)
                if (project.proxyFilePath) {
                    const exists = await invoke<boolean>('check_file_exists', { path: project.proxyFilePath });
                    if (!exists) {
                        console.warn('[loadProject] Proxy file not found, clearing:', project.proxyFilePath);
                        project.proxyFilePath = undefined as any;
                    }
                }

                set({ workspace, project, rootProject: null, activeAssetId: null, isDirty: false, isLoading: false, undoStack: [] });
                return true;
            }
            set({ workspace, rootProject: null, activeAssetId: null, isLoading: false, undoStack: [] });
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

    switchProject: async () => {
        const { saveProject, isDirty, loadProject } = get();

        // Auto-save current project if dirty
        if (isDirty) {
            try { await saveProject(); } catch { /* ignore */ }
        }

        // Open folder picker
        const { open } = await import('@tauri-apps/plugin-dialog');
        const folder = await open({
            directory: true,
            multiple: false,
            title: '选择工作文件夹',
        });

        if (!folder) return;

        // Reset state and load new project
        set({ workspace: null, project: null, rootProject: null, activeAssetId: null, isDirty: false, undoStack: [] });

        // Also reset the video playback state (separate store)
        const { useVideoStore } = await import('./videoStore');
        useVideoStore.getState().reset();

        const hasExisting = await loadProject(folder as string);
        if (!hasExisting) {
            set({ workspace: folder as string });
        }
    },

    enterSubProject: (assetId: string) => {
        const { project, rootProject } = get();
        if (!project || rootProject) return; // Prevent double nesting for now

        const targetAsset = project.assets.find(a => a.id === assetId);
        if (!targetAsset || targetAsset.category !== 'segment_analysis') return;

        if (targetAsset.subProjectData) {
            // Already has nested data, just swap the pointers
            set({
                rootProject: project,
                project: targetAsset.subProjectData,
                activeAssetId: assetId,
                undoStack: [],
                isDirty: false // isDirty reflects whether the current view has unsaved changes
            });
        }
    },

    exitSubProject: () => {
        const { project, rootProject, activeAssetId, isDirty } = get();
        if (!rootProject || !activeAssetId || !project) return;

        // Sync the modified sub-project back into the root project
        const updatedRoot = { ...rootProject };
        updatedRoot.assets = updatedRoot.assets.map(a => 
            a.id === activeAssetId ? { ...a, subProjectData: project } : a
        );

        set({
            rootProject: null,
            project: updatedRoot,
            activeAssetId: null,
            undoStack: [],
            // If the sub-project was dirty, we inherit that dirtiness so the user knows to save
            isDirty: isDirty || get().isDirty 
        });
    }
}));
