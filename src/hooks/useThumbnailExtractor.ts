import { useRef, useEffect, MutableRefObject } from 'react';

const MAX_THUMB_CACHE = 500;

interface UseThumbnailExtractorOptions {
    proxyUrl: string | null;
    isTranscoding: boolean;
    thumbWidth: number;
    trackHeight: number;
    drawRef: MutableRefObject<(() => void) | null>;
}

/**
 * Manages background thumbnail extraction with LRU-capped cache.
 * Extracts from a hidden <video> element, producing ImageBitmaps for canvas rendering.
 * 
 * Returns:
 * - thumbnailCache: Map<number, ImageBitmap> ref for reading cached bitmaps
 * - extractionQueueRef: push timestamps to request extraction
 * - extractVideoRef: attach to a hidden <video> element
 * - getThumbnailInterval: calculates optimal interval based on zoom level
 */
export function useThumbnailExtractor({
    proxyUrl,
    isTranscoding,
    thumbWidth,
    trackHeight,
    drawRef,
}: UseThumbnailExtractorOptions) {
    const extractVideoRef = useRef<HTMLVideoElement>(null);
    const thumbnailCache = useRef<Map<number, ImageBitmap>>(new Map());
    const extractionQueueRef = useRef<number[]>([]);
    const isExtractingRef = useRef(false);

    function getThumbnailInterval(pps: number) {
        const raw = thumbWidth / pps;
        if (raw < 1) return 1;
        if (raw < 2) return 2;
        if (raw < 5) return 5;
        if (raw < 10) return 10;
        if (raw < 30) return 30;
        if (raw < 60) return 60;
        return Math.ceil(raw / 60) * 60;
    }

    // Clear thumbnail cache when transcoding completes (proxy video changed)
    useEffect(() => {
        if (!isTranscoding && thumbnailCache.current.size > 0) {
            thumbnailCache.current.forEach(bmp => bmp.close());
            thumbnailCache.current.clear();
            if (drawRef.current) drawRef.current();
        }
    }, [isTranscoding, drawRef]);

    // Background extraction loop
    useEffect(() => {
        if (!proxyUrl || !extractVideoRef.current || isTranscoding) return;

        let active = true;

        const processQueue = async () => {
            if (!active || isExtractingRef.current || extractionQueueRef.current.length === 0) return;
            
            isExtractingRef.current = true;
            
            try {
                const targetTime = extractionQueueRef.current.pop(); // LIFO prioritizes most recently rendered (visible)
                if (targetTime === undefined) {
                    isExtractingRef.current = false;
                    return;
                }

                if (thumbnailCache.current.has(targetTime)) {
                    isExtractingRef.current = false;
                    if (active && extractionQueueRef.current.length > 0) requestAnimationFrame(processQueue);
                    return;
                }

                const video = extractVideoRef.current;
                if (!video) {
                    isExtractingRef.current = false;
                    return;
                }
                
                await new Promise<void>((resolve) => {
                    const onSeeked = () => { cleanup(); resolve(); };
                    const onError = () => { cleanup(); resolve(); }; // Resolve anyway to unblock
                    const cleanup = () => {
                        video.removeEventListener('seeked', onSeeked);
                        video.removeEventListener('error', onError);
                    };
                    video.addEventListener('seeked', onSeeked);
                    video.addEventListener('error', onError);
                    video.currentTime = targetTime;
                });

                if (!active) return;
                const bmp = await createImageBitmap(video, { resizeWidth: thumbWidth, resizeHeight: trackHeight });
                thumbnailCache.current.set(targetTime, bmp);

                // LRU eviction: when cache exceeds limit, evict oldest entries
                if (thumbnailCache.current.size > MAX_THUMB_CACHE) {
                    const entries = thumbnailCache.current.entries();
                    const evictCount = thumbnailCache.current.size - MAX_THUMB_CACHE + 100;
                    for (let i = 0; i < evictCount; i++) {
                        const entry = entries.next();
                        if (entry.done) break;
                        entry.value[1].close(); // Release ImageBitmap GPU memory
                        thumbnailCache.current.delete(entry.value[0]);
                    }
                }
                
                // Triggers an event-driven redraw to place the new thumbnail immediately
                if (drawRef.current) drawRef.current();

                // Throttle the loop slightly (10ms) to ensure React/UI thread isn't starved
                await new Promise(r => setTimeout(r, 10));

            } catch (err) {
                console.error("Failed to extract thumbnail", err);
            }

            isExtractingRef.current = false;
            
            if (active && extractionQueueRef.current.length > 0) {
                setTimeout(processQueue, 0);
            }
        };

        const intervalId = setInterval(() => {
            if (extractionQueueRef.current.length > 0 && !isExtractingRef.current) {
                processQueue();
            }
        }, 80);

        return () => {
            active = false;
            clearInterval(intervalId);
        };
    }, [proxyUrl, thumbWidth, trackHeight, isTranscoding, drawRef]);

    return {
        thumbnailCache,
        extractionQueueRef,
        extractVideoRef,
        getThumbnailInterval,
    };
}
