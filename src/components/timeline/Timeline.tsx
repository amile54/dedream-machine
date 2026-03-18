import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoStore } from '../../stores/videoStore';
import { useProjectStore } from '../../stores/projectStore';
import { useTimelineStore } from '../../stores/timelineStore';
import { formatTimeCompact } from '../../utils/timeFormat';
import './Timeline.css';

function calculateSnap(time: number, snapPoints: number[], pps: number, thresholdPixels = 10): number {
    const thresholdTime = thresholdPixels / pps;
    for (const p of snapPoints) {
        if (Math.abs(p - time) <= thresholdTime) {
            return p; // Magnetically snap to this point
        }
    }
    return time;
}

const RULER_HEIGHT = 24;
const TRACK_HEIGHT = 50;
const TOTAL_HEIGHT = RULER_HEIGHT + TRACK_HEIGHT + 10;

// Zoom constraints — 0.01 pps lets a 3hr movie fit in ~108px, 500 allows frame-level editing
const MIN_PPS = 0.01;
const MAX_PPS = 500;

export const Timeline: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const thumbVideoRef = useRef<HTMLVideoElement>(null);
    const animFrameRef = useRef<number>(0);

    const duration = useVideoStore(s => s.duration);
    const currentTime = useVideoStore(s => s.currentTime);
    const proxyUrl = useVideoStore(s => s.proxyUrl);
    const seekTo = useVideoStore(s => s.seekTo);

    const project = useProjectStore(s => s.project);

    const pixelsPerSecond = useTimelineStore(s => s.pixelsPerSecond);
    const selectedSegmentId = useTimelineStore(s => s.selectedSegmentId);
    const setSelectedSegmentId = useTimelineStore(s => s.setSelectedSegmentId);
    const setPixelsPerSecond = useTimelineStore(s => s.setPixelsPerSecond);

    const moveCutPoint = useProjectStore(s => s.moveCutPoint);
    const removeCutPoint = useProjectStore(s => s.removeCutPoint);

    const [hoverCutPointIndex, setHoverCutPointIndex] = useState<number | null>(null);
    const [selectedCutPointIndex, setSelectedCutPointIndex] = useState<number | null>(null);
    const draggingCutPointIndexRef = useRef<number | null>(null);

    // Thumbnail Preview State
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverX, setHoverX] = useState<number>(0);

    const segments = project?.segments || [];

    const [isDraggingStyle, setIsDraggingStyle] = useState(false);
    const isDraggingRef = useRef(false);

    // Store refs for use in document-level event handlers
    const pixelsPerSecondRef = useRef(pixelsPerSecond);
    pixelsPerSecondRef.current = pixelsPerSecond;
    const durationRef = useRef(duration);
    durationRef.current = duration;
    const segmentsRef = useRef(segments);
    segmentsRef.current = segments;
    const currentTimeRef = useRef(currentTime);
    currentTimeRef.current = currentTime;

    // Colors for segments (cycle through palette)
    const segmentColors = [
        'rgba(80, 120, 200, 0.5)',
        'rgba(120, 80, 200, 0.5)',
        'rgba(80, 180, 160, 0.5)',
        'rgba(200, 120, 80, 0.5)',
        'rgba(180, 80, 160, 0.5)',
        'rgba(100, 180, 80, 0.5)',
        'rgba(200, 180, 80, 0.5)',
        'rgba(80, 140, 200, 0.5)',
    ];

    // --- Draw ---
    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const sl = containerRef.current?.scrollLeft || 0;

        // Clear
        ctx.fillStyle = '#12121e';
        ctx.fillRect(0, 0, width, height);

        if (duration <= 0) return;

        // --- Draw ruler ---
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, RULER_HEIGHT);

        // Calculate tick interval based on zoom
        let tickInterval = 1;
        if (pixelsPerSecond < 0.05) tickInterval = 3600; // 1 hour
        else if (pixelsPerSecond < 0.2) tickInterval = 1800; // 30 mins
        else if (pixelsPerSecond < 0.5) tickInterval = 600; // 10 mins
        else if (pixelsPerSecond < 1) tickInterval = 300; // 5 mins
        else if (pixelsPerSecond < 2) tickInterval = 120; // 2 mins
        else if (pixelsPerSecond < 5) tickInterval = 60; // 1 min
        else if (pixelsPerSecond < 10) tickInterval = 30; // 30s
        else if (pixelsPerSecond < 20) tickInterval = 10;
        else if (pixelsPerSecond < 50) tickInterval = 5;
        else if (pixelsPerSecond < 100) tickInterval = 2;

        const startTime = Math.floor(sl / pixelsPerSecond / tickInterval) * tickInterval;
        const endTime = Math.ceil((sl + width) / pixelsPerSecond);

        ctx.fillStyle = '#666688';
        ctx.font = '10px "SF Mono", "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        for (let t = startTime; t <= endTime; t += tickInterval) {
            const x = t * pixelsPerSecond - sl;
            if (x < -50 || x > width + 50) continue;

            // Major tick
            ctx.strokeStyle = 'rgba(100, 100, 140, 0.4)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, RULER_HEIGHT - 8);
            ctx.lineTo(x, RULER_HEIGHT);
            ctx.stroke();

            // Time label
            ctx.fillText(formatTimeCompact(t), x, RULER_HEIGHT - 10);

            // Minor ticks
            if (tickInterval >= 5) {
                for (let mt = 1; mt < 5; mt++) {
                    const mx = (t + mt * tickInterval / 5) * pixelsPerSecond - sl;
                    if (mx >= 0 && mx <= width) {
                        ctx.strokeStyle = 'rgba(100, 100, 140, 0.2)';
                        ctx.beginPath();
                        ctx.moveTo(mx, RULER_HEIGHT - 4);
                        ctx.lineTo(mx, RULER_HEIGHT);
                        ctx.stroke();
                    }
                }
            }
        }

        // --- Draw segments ---
        const trackY = RULER_HEIGHT + 4;

        segments.forEach((seg, i) => {
            const x1 = seg.startTime * pixelsPerSecond - sl;
            const x2 = seg.endTime * pixelsPerSecond - sl;
            const segWidth = x2 - x1;

            if (x2 < 0 || x1 > width) return; // offscreen

            // Segment block
            const isSelected = seg.id === selectedSegmentId;
            ctx.fillStyle = isSelected
                ? segmentColors[i % segmentColors.length].replace('0.5', '0.7')
                : segmentColors[i % segmentColors.length];
            ctx.fillRect(Math.max(0, x1), trackY, Math.min(segWidth, width), TRACK_HEIGHT);

            // Segment border
            ctx.strokeStyle = isSelected
                ? 'rgba(200, 200, 255, 0.6)'
                : 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.strokeRect(Math.max(0, x1), trackY, Math.min(segWidth, width), TRACK_HEIGHT);

            // Segment label
            if (segWidth > 30) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.font = '11px "Inter", sans-serif';
                ctx.textAlign = 'left';
                const labelX = Math.max(4, x1 + 4);
                ctx.fillText(`#${seg.index}`, labelX, trackY + 15);

                if (segWidth > 80) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.font = '9px "SF Mono", monospace';
                    ctx.fillText(
                        `${formatTimeCompact(seg.startTime)}`,
                        labelX,
                        trackY + 28
                    );
                }
            }
        });

        // --- Draw cut points ---
        segments.forEach((seg, i) => {
            if (i === 0) return; // first boundary is video start, not a cut point
            const cpIndex = i - 1;
            const x = seg.startTime * pixelsPerSecond - sl;
            if (x < 0 || x > width) return;

            const isSelected = cpIndex === selectedCutPointIndex;
            const isHovered = cpIndex === hoverCutPointIndex;

            if (isSelected) {
                ctx.strokeStyle = '#ffaa00'; // Yellow selection
                ctx.fillStyle = '#ffaa00';
            } else if (isHovered) {
                ctx.strokeStyle = '#ff8888'; // Brighter red
                ctx.fillStyle = '#ff8888';
            } else {
                ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
                ctx.fillStyle = '#ff6666';
            }

            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, trackY);
            ctx.lineTo(x, trackY + TRACK_HEIGHT);
            ctx.stroke();

            // Cut point diamond
            ctx.beginPath();
            ctx.moveTo(x, trackY - 2);
            ctx.lineTo(x + 5, trackY + 4);
            ctx.lineTo(x, trackY + 10);
            ctx.lineTo(x - 5, trackY + 4);
            ctx.closePath();
            ctx.fill();
        });

        // --- Draw playhead ---
        const playheadX = currentTime * pixelsPerSecond - sl;
        if (playheadX >= 0 && playheadX <= width) {
            ctx.strokeStyle = '#66aaff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();

            // Playhead triangle
            ctx.fillStyle = '#66aaff';
            ctx.beginPath();
            ctx.moveTo(playheadX - 6, 0);
            ctx.lineTo(playheadX + 6, 0);
            ctx.lineTo(playheadX, 8);
            ctx.closePath();
            ctx.fill();
        }
    }, [duration, currentTime, pixelsPerSecond, segments, selectedSegmentId, hoverCutPointIndex, selectedCutPointIndex]);

    // --- Animation loop (no scroll state dependency) ---
    useEffect(() => {
        const animate = () => {
            draw();

            // Auto-pan if playing and playhead approaches the right edge
            if (!isDraggingRef.current && containerRef.current) {
                const sl = containerRef.current.scrollLeft;
                const headX = useVideoStore.getState().currentTime * pixelsPerSecondRef.current - sl;
                const viewWidth = containerRef.current.clientWidth;
                if (headX > viewWidth * 0.9 && headX < viewWidth * 1.5) {
                    containerRef.current.scrollLeft += 3;
                } else if (headX > viewWidth * 1.5 || headX < 0) {
                    containerRef.current.scrollLeft = (useVideoStore.getState().currentTime * pixelsPerSecondRef.current) - (viewWidth / 2);
                }
            }

            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw]);

    // --- Pointer event handlers using document-level listeners ---
    // NO setPointerCapture — the scrollbar remains fully independent
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!canvasRef.current || duration <= 0) return;
        // Only handle left mouse button
        if (e.button !== 0) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const sl = containerRef.current?.scrollLeft || 0;
        const time = (x + sl) / pixelsPerSecond;

        // 1. Check if we clicked on a Cut Point
        const existingCutPoints = segments.slice(1).map(s => s.startTime);
        const PIXEL_THRESHOLD = 8;
        const timeThreshold = PIXEL_THRESHOLD / pixelsPerSecond;
        const clickedIdx = existingCutPoints.findIndex(cp => Math.abs(cp - time) <= timeThreshold);

        if (clickedIdx !== -1) {
            draggingCutPointIndexRef.current = clickedIdx;
            setSelectedCutPointIndex(clickedIdx);
            setSelectedSegmentId(null);
        } else {
            // 2. Scrub playhead
            isDraggingRef.current = true;
            setIsDraggingStyle(true);
            setSelectedCutPointIndex(null);

            if (time >= 0 && time <= duration) {
                const snappedTime = calculateSnap(time, existingCutPoints, pixelsPerSecond);
                seekTo(Math.max(0, Math.min(duration, snappedTime)));

                const clickedSeg = segments.find(
                    s => time >= s.startTime && time < s.endTime
                );
                if (clickedSeg) {
                    setSelectedSegmentId(clickedSeg.id);
                }
            }
        }

        // Attach document-level listeners for move/up
        const onDocPointerMove = (ev: PointerEvent) => {
            if (!canvasRef.current) return;
            const r = canvasRef.current.getBoundingClientRect();
            let targetX = ev.clientX - r.left;
            const currentSl = containerRef.current?.scrollLeft || 0;
            let t = (targetX + currentSl) / pixelsPerSecondRef.current;
            const pts = segmentsRef.current.slice(1).map(s => s.startTime);

            // A. Dragging a cut point
            if (draggingCutPointIndexRef.current !== null) {
                const otherPoints = [currentTimeRef.current, ...pts.filter((_, i) => i !== draggingCutPointIndexRef.current)];
                const snapped = calculateSnap(t, otherPoints, pixelsPerSecondRef.current);
                moveCutPoint(draggingCutPointIndexRef.current, Math.max(0.1, Math.min(durationRef.current, snapped)));
                return;
            }

            // B. Scrubbing playhead
            if (isDraggingRef.current) {
                // Auto-scroll at edges
                const edgeThreshold = 40;
                const maxScroll = (durationRef.current * pixelsPerSecondRef.current) - (containerRef.current?.clientWidth || 0);

                if (targetX < edgeThreshold && currentSl > 0) {
                    containerRef.current!.scrollLeft = Math.max(0, currentSl - 15);
                } else if (targetX > r.width - edgeThreshold && currentSl < maxScroll) {
                    containerRef.current!.scrollLeft = Math.min(maxScroll, currentSl + 15);
                }

                const snapped = calculateSnap(t, pts, pixelsPerSecondRef.current);
                seekTo(Math.max(0, Math.min(durationRef.current, snapped)));
            }
        };

        const onDocPointerUp = () => {
            isDraggingRef.current = false;
            draggingCutPointIndexRef.current = null;
            setIsDraggingStyle(false);
            document.removeEventListener('pointermove', onDocPointerMove);
            document.removeEventListener('pointerup', onDocPointerUp);
        };

        document.addEventListener('pointermove', onDocPointerMove);
        document.addEventListener('pointerup', onDocPointerUp);
    }, [duration, pixelsPerSecond, segments, seekTo, setSelectedSegmentId, moveCutPoint]);

    // Canvas hover handler (only for hover state — no drag logic)
    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!canvasRef.current || duration <= 0) return;
        // Skip hover updates while dragging (document-level handler takes over)
        if (isDraggingRef.current || draggingCutPointIndexRef.current !== null) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const targetX = e.clientX - rect.left;
        const sl = containerRef.current?.scrollLeft || 0;
        const time = (targetX + sl) / pixelsPerSecond;

        setHoverTime(time);
        setHoverX(e.clientX);

        // Seek the hidden thumbnail video
        if (thumbVideoRef.current && time >= 0 && time <= duration) {
            thumbVideoRef.current.currentTime = time;
        }

        const existingCutPoints = segments.slice(1).map(s => s.startTime);
        const PIXEL_THRESHOLD = 5;
        const hoveredIdx = existingCutPoints.findIndex(cp => Math.abs(cp - time) <= (PIXEL_THRESHOLD / pixelsPerSecond));

        if (hoveredIdx !== -1) {
            setHoverCutPointIndex(hoveredIdx);
            canvasRef.current.style.cursor = 'ew-resize';
        } else {
            setHoverCutPointIndex(null);
            canvasRef.current.style.cursor = 'crosshair';
        }
    }, [duration, pixelsPerSecond, segments]);

    const handlePointerLeave = useCallback(() => {
        setHoverTime(null);
        setHoverCutPointIndex(null);
    }, []);

    // Handle Keyboard Deletions for Cut Points
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Backspace' || e.key === 'Delete') && selectedCutPointIndex !== null) {
                const target = e.target as HTMLElement;
                if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

                removeCutPoint(selectedCutPointIndex);
                setSelectedCutPointIndex(null);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [selectedCutPointIndex, removeCutPoint]);

    // --- Zoom ---
    const performZoom = useCallback((newPps: number, anchorMouseX?: number) => {
        if (!containerRef.current) return;
        const clamped = Math.max(MIN_PPS, Math.min(MAX_PPS, newPps));
        const containerWidth = containerRef.current.clientWidth;
        const sl = containerRef.current.scrollLeft;

        let anchorTime: number;
        let viewOffset: number;

        if (anchorMouseX !== undefined) {
            anchorTime = (sl + anchorMouseX) / pixelsPerSecond;
            viewOffset = anchorMouseX;
        } else {
            anchorTime = currentTime;
            viewOffset = (currentTime * pixelsPerSecond) - sl;

            if (viewOffset < 0 || viewOffset > containerWidth) {
                viewOffset = containerWidth / 2;
            }
        }

        const newScrollLeft = Math.max(0, anchorTime * clamped - viewOffset);

        setPixelsPerSecond(clamped);
        containerRef.current.scrollLeft = newScrollLeft;
    }, [pixelsPerSecond, currentTime, setPixelsPerSecond]);

    // Fit entire timeline in view
    const zoomFitAll = useCallback(() => {
        if (!containerRef.current || duration <= 0) return;
        const fitPps = Math.max(MIN_PPS, containerRef.current.clientWidth / duration * 0.95);
        setPixelsPerSecond(fitPps);
        containerRef.current.scrollLeft = 0;
    }, [duration, setPixelsPerSecond]);

    // Handle wheel for zoom — Ctrl/Cmd + scroll
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            // 25% per wheel tick (industry standard feels)
            const newPps = pixelsPerSecond * (1 + delta * 0.25);

            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                performZoom(newPps, mouseX);
            }
        }
    }, [pixelsPerSecond, performZoom]);

    const totalWidth = duration * pixelsPerSecond;

    return (
        <div className="timeline">
            <div className="timeline-toolbar">
                <span className="timeline-label">时间轴</span>
                <div className="timeline-zoom">
                    <button
                        className="zoom-btn"
                        onClick={() => performZoom(pixelsPerSecond / 2)}
                        title="缩小"
                    >
                        −
                    </button>
                    <button
                        className="zoom-btn"
                        onClick={zoomFitAll}
                        title="适应全部"
                        style={{ fontSize: '10px', padding: '0 4px' }}
                    >
                        ⊞
                    </button>
                    <span className="zoom-level">{pixelsPerSecond < 1 ? pixelsPerSecond.toFixed(2) : Math.round(pixelsPerSecond)}px/s</span>
                    <button
                        className="zoom-btn"
                        onClick={() => performZoom(pixelsPerSecond * 2)}
                        title="放大"
                    >
                        +
                    </button>
                </div>
            </div>
            <div
                ref={containerRef}
                className="timeline-scroll-container"
                onWheel={handleWheel}
            >
                <div
                    className={`timeline-canvas-wrapper ${isDraggingStyle ? 'is-dragging' : ''}`}
                    style={{ width: Math.max(totalWidth, containerRef.current?.clientWidth || 0), position: 'relative' }}
                    onPointerLeave={handlePointerLeave}
                >
                    <canvas
                        ref={canvasRef}
                        className="timeline-canvas"
                        style={{ width: '100%', height: TOTAL_HEIGHT, touchAction: 'pan-x', cursor: 'crosshair' }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                    />

                    {/* Hidden Video for Extracting Thumbnails via GPU */}
                    {proxyUrl && (
                        <video
                            ref={thumbVideoRef}
                            src={proxyUrl}
                            muted
                            playsInline
                            style={{ display: 'none' }}
                        />
                    )}

                    {/* Floating Thumbnail Tooltip */}
                    {hoverTime !== null && proxyUrl && (
                        <div
                            className="timeline-hover-tooltip"
                            style={{
                                position: 'fixed',
                                top: (containerRef.current?.getBoundingClientRect().top || 0) - 100,
                                left: Math.max(10, hoverX - 80),
                                width: '160px',
                                background: '#000',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                zIndex: 1000,
                                overflow: 'hidden',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                                pointerEvents: 'none',
                                display: isDraggingRef.current ? 'none' : 'block'
                            }}
                        >
                            <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%' }}>
                                <canvas
                                    width={160}
                                    height={90}
                                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                                    ref={(c) => {
                                        if (c && thumbVideoRef.current && thumbVideoRef.current.readyState >= 2) {
                                            const ctx = c.getContext('2d');
                                            if (ctx) ctx.drawImage(thumbVideoRef.current, 0, 0, 160, 90);
                                        }
                                    }}
                                />
                            </div>
                            <div style={{ padding: '2px 0', textAlign: 'center', fontSize: '10px', color: '#fff', background: '#222' }}>
                                {formatTimeCompact(hoverTime)}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
