import { useEffect, useCallback } from 'react';
import { useVideoStore } from '../stores/videoStore';
import { useProjectStore } from '../stores/projectStore';

type ShortcutHandler = (e: KeyboardEvent) => void;

/**
 * Global keyboard shortcut manager
 */
export function useKeyboardShortcuts() {
    const togglePlay = useVideoStore(s => s.togglePlay);
    const stepFrame = useVideoStore(s => s.stepFrame);
    const skipSeconds = useVideoStore(s => s.skipSeconds);
    const addCutPoint = useProjectStore(s => s.addCutPoint);
    const saveProject = useProjectStore(s => s.saveProject);
    const undoSegments = useProjectStore(s => s.undoSegments);

    const handleKeyDown: ShortcutHandler = useCallback((e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in inputs
        const target = e.target as HTMLElement;
        if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        ) {
            // Allow Cmd/Ctrl+S even in inputs
            if (!(e.key === 's' && (e.metaKey || e.ctrlKey))) {
                return;
            }
        }

        const isCmd = e.metaKey || e.ctrlKey;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                stepFrame(-1);
                break;
            case 'ArrowRight':
                e.preventDefault();
                stepFrame(1);
                break;
            case 'j':
            case 'J':
                e.preventDefault();
                skipSeconds(-5);
                break;
            case 'l':
            case 'L':
                e.preventDefault();
                skipSeconds(5);
                break;
            case 'b':
            case 'B':
                if (!isCmd) {
                    e.preventDefault();
                    // Read fresh values inside handler to avoid stale closure
                    const { currentTime, duration, proxyUrl } = useVideoStore.getState();
                    const hasVideo = proxyUrl !== null;
                    if (duration > 0 && hasVideo) {
                        addCutPoint(currentTime);
                    }
                }
                break;
            case 's':
                if (isCmd) {
                    e.preventDefault();
                    saveProject();
                }
                break;
            case 'z':
            case 'Z':
                if (isCmd) {
                    e.preventDefault();
                    undoSegments();
                }
                break;
        }
    }, [togglePlay, stepFrame, skipSeconds, addCutPoint, saveProject, undoSegments]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}
