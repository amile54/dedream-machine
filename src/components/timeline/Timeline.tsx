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
    const scrollLeft = useTimelineStore(s => s.scrollLeft);
    const selectedSegmentId = useTimelineStore(s => s.selectedSegmentId);
    const setScrollLeft = useTimelineStore(s => s.setScrollLeft);
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

        // Clear
        ctx.fillStyle = '#12121e';
        ctx.fillRect(0, 0, width, height);

        if (duration <= 0) return;

        // --- Draw ruler ---
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, width, RULER_HEIGHT);

        // Calculate tick interval based on zoom
        let tickInterval = 1;
        if (pixelsPerSecond < 0.2) tickInterval = 1800; // 30 mins
        else if (pixelsPerSecond < 0.5) tickInterval = 600; // 10 mins
        else if (pixelsPerSecond < 1) tickInterval = 300; // 5 mins
        else if (pixelsPerSecond < 2) tickInterval = 120; // 2 mins
        else if (pixelsPerSecond < 5) tickInterval = 60; // 1 min
        else if (pixelsPerSecond < 10) tickInterval = 30; // 30s
        else if (pixelsPerSecond < 20) tickInterval = 10;
        else if (pixelsPerSecond < 50) tickInterval = 5;
        else if (pixelsPerSecond < 100) tickInterval = 2;

        const startTime = Math.floor(scrollLeft / pixelsPerSecond / tickInterval) * tickInterval;
        const endTime = Math.ceil((scrollLeft + width) / pixelsPerSecond);

        ctx.fillStyle = '#666688';
        ctx.font = '10px "SF Mono", "JetBrains Mono", monospace';
        ctx.textAlign = 'center';

        for (let t = startTime; t <= endTime; t += tickInterval) {
            const x = t * pixelsPerSecond - scrollLeft;
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
                    const mx = (t + mt * tickInterval / 5) * pixelsPerSecond - scrollLeft;
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
            const x1 = seg.startTime * pixelsPerSecond - scrollLeft;
            const x2 = seg.endTime * pixelsPerSecond - scrollLeft;
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
            const x = seg.startTime * pixelsPerSecond - scrollLeft;
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
        const playheadX = currentTime * pixelsPerSecond - scrollLeft;
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
    }, [duration, currentTime, pixelsPerSecond, scrollLeft, segments, selectedSegmentId, hoverCutPointIndex, selectedCutPointIndex]);

    // Animation loop & Auto-panning during playback
    useEffect(() => {
        const animate = () => {
            draw();

            // Auto-pan if playing and playhead approaches the right edge
            if (!isDraggingRef.current && containerRef.current) {
                const headX = useVideoStore.getState().currentTime * pixelsPerSecond - scrollLeft;
                const viewWidth = containerRef.current.clientWidth;
                if (headX > viewWidth * 0.9 && headX < viewWidth * 1.5) {
                    // Start panning to keep it on screen
                    containerRef.current.scrollLeft += 3;
                } else if (headX > viewWidth * 1.5 || headX < 0) {
                    // Jump playhead completely back into view
                    containerRef.current.scrollLeft = (useVideoStore.getState().currentTime * pixelsPerSecond) - (viewWidth / 2);
                }
            }

            animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [draw, pixelsPerSecond, scrollLeft]);

    const [isDraggingStyle, setIsDraggingStyle] = useState(false);
    const isDraggingRef = useRef(false);

    // Handle click and drag to scrub/edit
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        if (!canvasRef.current || duration <= 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const time = (x + scrollLeft) / pixelsPerSecond;

        // 1. Check if we clicked on a Cut Point
        const existingCutPoints = segments.slice(1).map(s => s.startTime);
        const PIXEL_THRESHOLD = 8;
        const timeThreshold = PIXEL_THRESHOLD / pixelsPerSecond;
        const clickedIdx = existingCutPoints.findIndex(cp => Math.abs(cp - time) <= timeThreshold);

        if (clickedIdx !== -1) {
            // Initiate cut point drag
            draggingCutPointIndexRef.current = clickedIdx;
            setSelectedCutPointIndex(clickedIdx);
            setSelectedSegmentId(null);
            canvasRef.current.setPointerCapture(e.pointerId);
            return;
        }

        // 2. Otherwise scrub playhead
        isDraggingRef.current = true;
        setIsDraggingStyle(true);
        setSelectedCutPointIndex(null);

        if (time >= 0 && time <= duration) {
            const snappedTime = calculateSnap(time, existingCutPoints, pixelsPerSecond);
            seekTo(Math.max(0, Math.min(duration, snappedTime)));

            // Check if clicked exactly on a segment to select it
            const clickedSeg = segments.find(
                s => time >= s.startTime && time < s.endTime
            );
            if (clickedSeg) {
                setSelectedSegmentId(clickedSeg.id);
            }
        }
        canvasRef.current.setPointerCapture(e.pointerId);
    }, [duration, scrollLeft, pixelsPerSecond, segments, seekTo, setSelectedSegmentId]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (!canvasRef.current || duration <= 0) return;
        const rect = canvasRef.current.getBoundingClientRect();
        let targetX = e.clientX - rect.left;
        let time = (targetX + scrollLeft) / pixelsPerSecond;
        const existingCutPoints = segments.slice(1).map(s => s.startTime);

        // A. If dragging a cut point
        if (draggingCutPointIndexRef.current !== null) {
            const otherPoints = [currentTime, ...existingCutPoints.filter((_, i) => i !== draggingCutPointIndexRef.current)];
            const snappedTime = calculateSnap(time, otherPoints, pixelsPerSecond);
            moveCutPoint(draggingCutPointIndexRef.current, Math.max(0.1, Math.min(duration, snappedTime)));
            return;
        }

        // B. If scrubbing playhead
        if (isDraggingRef.current) {
            // Auto-scrolling logic
            const edgeThreshold = 40;
            const maxScroll = (duration * pixelsPerSecond) - (containerRef.current?.clientWidth || 0);

            if (targetX < edgeThreshold && scrollLeft > 0) {
                containerRef.current!.scrollLeft = Math.max(0, scrollLeft - 15);
            } else if (targetX > rect.width - edgeThreshold && scrollLeft < maxScroll) {
                containerRef.current!.scrollLeft = Math.min(maxScroll, scrollLeft + 15);
            }

            const snappedTime = calculateSnap(time, existingCutPoints, pixelsPerSecond);
            seekTo(Math.max(0, Math.min(duration, snappedTime)));
            return;
        }

        // C. Just hovering
        setHoverTime(time);
        setHoverX(e.clientX);

        // Seek the hidden thumbnail video
        if (thumbVideoRef.current && time >= 0 && time <= duration) {
            thumbVideoRef.current.currentTime = time;
        }

        const PIXEL_THRESHOLD = 5;
        const hoveredIdx = existingCutPoints.findIndex(cp => Math.abs(cp - time) <= (PIXEL_THRESHOLD / pixelsPerSecond));

        if (hoveredIdx !== -1) {
            setHoverCutPointIndex(hoveredIdx);
            canvasRef.current.style.cursor = 'ew-resize';
        } else {
            setHoverCutPointIndex(null);
            canvasRef.current.style.cursor = 'crosshair';
        }
    }, [duration, scrollLeft, pixelsPerSecond, seekTo, segments, moveCutPoint, currentTime]);

    const handlePointerLeave = useCallback(() => {
        setHoverTime(null);
        setHoverCutPointIndex(null);
    }, []);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        isDraggingRef.current = false;
        draggingCutPointIndexRef.current = null;
        setIsDraggingStyle(false);
        if (canvasRef.current) canvasRef.current.releasePointerCapture(e.pointerId);
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

    // Handle scroll (horizontal panning)
    const handleScroll = useCallback((e: React.UIEvent) => {
        const target = e.target as HTMLDivElement;
        setScrollLeft(target.scrollLeft);
    }, [setScrollLeft]);

    const performZoom = useCallback((newPps: number, anchorMouseX?: number) => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.clientWidth;

        let anchorTime: number;
        let viewOffset: number; // The visual X coordinate we want to keep stationary

        if (anchorMouseX !== undefined) {
            // Anchor strictly to mouse position (for wheel events)
            anchorTime = (scrollLeft + anchorMouseX) / pixelsPerSecond;
            viewOffset = anchorMouseX;
        } else {
            // Anchor to the playhead (for button clicks)
            anchorTime = currentTime;
            viewOffset = (currentTime * pixelsPerSecond) - scrollLeft;

            // If playhead is offscreen, pull it back to center
            if (viewOffset < 0 || viewOffset > containerWidth) {
                viewOffset = containerWidth / 2;
            }
        }

        // New formula: (anchorTime * newPps) - newScrollLeft = viewOffset
        const newScrollLeft = Math.max(0, anchorTime * newPps - viewOffset);

        setPixelsPerSecond(newPps);
        setScrollLeft(newScrollLeft);

        // This is vital to update the DOM immediately so it doesn't jump
        containerRef.current.scrollLeft = newScrollLeft;
    }, [pixelsPerSecond, scrollLeft, currentTime, setPixelsPerSecond, setScrollLeft]);

    // Handle wheel for zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -1 : 1;
            const newPps = Math.max(0.1, Math.min(200, pixelsPerSecond * (1 + delta * 0.1)));

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
                        onClick={() => performZoom(pixelsPerSecond / 1.3)}
                        title="缩小 (Cmd+-)"
                    >
                        −
                    </button>
                    <span className="zoom-level">{Math.round(pixelsPerSecond)}px/s</span>
                    <button
                        className="zoom-btn"
                        onClick={() => performZoom(pixelsPerSecond * 1.3)}
                        title="放大 (Cmd+=)"
                    >
                        +
                    </button>
                </div>
            </div>
            <div
                ref={containerRef}
                className="timeline-scroll-container"
                onScroll={handleScroll}
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
                        style={{ width: '100%', height: TOTAL_HEIGHT, touchAction: 'none', cursor: 'crosshair' }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
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
                                {/* We mirror the hidden video to a canvas or just show the video directly. 
                                    Showing the actual video element is faster. But since we need multiple potentially, 
                                    let's just pull the 1 hidden video and let it render here by doing a neat trick: 
                                    Actually, we can't move the node easily. Let's draw the video frame to a Canvas background. */}
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
