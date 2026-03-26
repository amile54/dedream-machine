import { Command } from '@tauri-apps/plugin-shell';
import { mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export interface VideoInfo {
    duration: number;
    fps: number;
    width: number;
    height: number;
    videoCodec: string;
    audioCodec: string;
    container: string;  // 'mp4', 'mkv', 'avi', etc.
    bitrate: number;
}

export interface SubtitleTrackInfo {
    index: number;       // stream index in the container
    codec: string;       // e.g. 'subrip', 'ass', 'mov_text'
    language: string;    // e.g. 'chi', 'eng'
    title: string;       // e.g. '中文（简体）'
}

export interface AudioTrackInfo {
    index: number;        // stream index in the container
    codec: string;        // e.g. 'aac', 'ac3', 'dts'
    language: string;     // e.g. 'chi', 'eng'
    title: string;        // e.g. 'Surround 5.1'
    channels: number;     // e.g. 2, 6
}

/**
 * Detect embedded subtitle tracks in a video file using FFprobe
 */
export async function getSubtitleTracks(videoPath: string): Promise<SubtitleTrackInfo[]> {
    const cmd = Command.sidecar('bin/ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 's',
        videoPath,
    ]);

    const output = await cmd.execute();
    if (output.code !== 0) {
        console.warn('[ffprobe] No subtitle streams or error:', output.stderr);
        return [];
    }

    try {
        const info = JSON.parse(output.stdout);
        const streams = info.streams || [];
        return streams.map((s: any) => ({
            index: s.index,
            codec: s.codec_name || 'unknown',
            language: s.tags?.language || '',
            title: s.tags?.title || `Track ${s.index}`,
        }));
    } catch {
        return [];
    }
}

/**
 * Detect audio tracks in a video file using FFprobe
 */
export async function getAudioTracks(videoPath: string): Promise<AudioTrackInfo[]> {
    const cmd = Command.sidecar('bin/ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 'a',
        videoPath,
    ]);

    const output = await cmd.execute();
    if (output.code !== 0) return [];

    try {
        const info = JSON.parse(output.stdout);
        const streams = info.streams || [];
        return streams.map((s: any, i: number) => ({
            index: s.index,
            codec: s.codec_name || 'unknown',
            language: s.tags?.language || '',
            title: s.tags?.title || `Audio ${i + 1}`,
            channels: s.channels || 2,
        }));
    } catch {
        return [];
    }
}

/**
 * Extract an embedded subtitle track to SRT format using FFmpeg
 */
export async function extractSubtitleTrack(videoPath: string, streamIndex: number): Promise<string> {
    // Write to a temp file
    const tmpPath = `/tmp/dedream_sub_${streamIndex}_${Date.now()}.srt`;

    const cmd = Command.sidecar('bin/ffmpeg', [
        '-v', 'warning',
        '-y',
        '-i', videoPath,
        '-map', `0:${streamIndex}`,
        '-c:s', 'srt',
        tmpPath,
    ]);

    const output = await cmd.execute();
    if (output.code !== 0) {
        throw new Error(`Failed to extract subtitle track ${streamIndex}: ${output.stderr}`);
    }

    // Read the extracted SRT content
    const { readTextFile } = await import('@tauri-apps/plugin-fs');
    return await readTextFile(tmpPath);
}

/**
 * Run FFprobe to get detailed video metadata
 */
export async function getVideoInfo(videoPath: string): Promise<VideoInfo> {
    const cmd = Command.sidecar('bin/ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath,
    ]);

    const output = await cmd.execute();
    if (output.code !== 0) {
        throw new Error(`FFprobe failed: ${output.stderr}`);
    }

    const info = JSON.parse(output.stdout);
    const videoStream = info.streams?.find((s: any) => s.codec_type === 'video');
    const audioStream = info.streams?.find((s: any) => s.codec_type === 'audio');

    let fps = 24;
    if (videoStream?.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
        if (den > 0) fps = num / den;
    }

    // Get container format
    const formatName = (info.format?.format_name || '').toLowerCase();
    let container = 'unknown';
    if (formatName.includes('mp4') || formatName.includes('mov')) container = 'mp4';
    else if (formatName.includes('matroska') || formatName.includes('webm')) container = 'mkv';
    else if (formatName.includes('avi')) container = 'avi';
    else container = formatName.split(',')[0];

    return {
        duration: parseFloat(info.format?.duration || '0'),
        fps: Math.round(fps * 100) / 100,
        width: videoStream?.width || 0,
        height: videoStream?.height || 0,
        videoCodec: (videoStream?.codec_name || '').toLowerCase(),
        audioCodec: (audioStream?.codec_name || '').toLowerCase(),
        container,
        bitrate: parseInt(info.format?.bit_rate || '0', 10),
    };
}

/**
 * Quick probe: Get video metadata only. Returns almost instantly (<0.5s).
 */
export async function quickProbe(inputPath: string): Promise<VideoInfo> {
    return getVideoInfo(inputPath);
}

/**
 * Background transcode: Generates a standard 720p edit proxy.
 * Uses hardware acceleration when available. 
 * Designed to be called fire-and-forget after instant import.
 */
export async function backgroundTranscode(
    inputPath: string,
    workspacePath: string,
    onProgress?: (percent: number, status: string) => void,
    audioStreamIndex?: number,
): Promise<string> {
    const info = await getVideoInfo(inputPath);
    const proxyPath = await join(workspacePath, 'proxy.mp4');
    const encoder = await detectHWEncoder();
    const isHW = encoder !== 'libx264';
    const strategy = `后台优化中 (${isHW ? '硬件加速' : '软件编码'})`;

    onProgress?.(5, strategy);
    console.log('[backgroundTranscode] Starting proxy generation:', encoder, 'audioStream:', audioStreamIndex);

    const buildArgs = (enc: string): string[] => {
        const a: string[] = ['-v', 'warning', '-y', '-i', inputPath];
        // Explicit stream mapping when audio track is specified
        if (audioStreamIndex != null) {
            a.push('-map', '0:v:0', '-map', `0:${audioStreamIndex}`);
        }
        if (enc === 'h264_videotoolbox') {
            a.push('-c:v', 'h264_videotoolbox', '-b:v', '4000k', '-vf', 'scale=-2:720');
        } else if (enc === 'h264_nvenc') {
            a.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', '4000k', '-vf', 'scale=-2:720');
        } else if (enc === 'h264_qsv') {
            a.push('-c:v', 'h264_qsv', '-preset', 'fast', '-b:v', '4000k', '-vf', 'scale=-2:720');
        } else {
            a.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-vf', 'scale=-2:720');
        }
        // Limit thread count to reduce CPU pressure during concurrent playback
        a.push(
            '-threads', '2',
            '-c:a', 'aac', '-ac', '2', '-b:a', '192k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-progress', 'pipe:1', proxyPath
        );
        return a;
    };

    try {
        const cmd = Command.sidecar('bin/ffmpeg', buildArgs(encoder));
        await executeWithProgress(cmd, info.duration, onProgress, strategy);
    } catch (err) {
        if (encoder !== 'libx264') {
            console.warn(`[backgroundTranscode] ${encoder} failed, falling back to libx264:`, err);
            onProgress?.(5, '硬件编码失败，已自动切换为软件编码...');
            const cmd2 = Command.sidecar('bin/ffmpeg', buildArgs('libx264'));
            await executeWithProgress(cmd2, info.duration, onProgress, '软件编码中...');
        } else {
            throw err;
        }
    }

    onProgress?.(100, '优化完成');
    return proxyPath;
}

/**
 * Smart import: Legacy wrapper that combines quickProbe + backgroundTranscode.
 * Still used by sub-project clip exports where waiting is acceptable.
 */
export async function smartImport(
    inputPath: string,
    workspacePath: string,
    onProgress?: (percent: number, status: string) => void,
): Promise<{ playablePath: string; info: VideoInfo; strategy: string }> {
    onProgress?.(0, '正在分析视频...');
    const info = await quickProbe(inputPath);
    const playablePath = await backgroundTranscode(inputPath, workspacePath, onProgress);
    return { playablePath, info, strategy: '标准化代理生成' };
}

/**
 * Detect hardware encoder
 */
async function detectHWEncoder(): Promise<string> {
    try {
        const cmd = Command.sidecar('bin/ffmpeg', ['-hide_banner', '-encoders']);
        const output = await cmd.execute();
        if (output.stdout.includes('h264_videotoolbox')) return 'h264_videotoolbox';
        if (output.stdout.includes('h264_nvenc')) return 'h264_nvenc';
        if (output.stdout.includes('h264_qsv')) return 'h264_qsv';
    } catch { /* ignore */ }
    return 'libx264';
}

/**
 * Execute FFmpeg with progress reporting
 */
function executeWithProgress(
    cmd: ReturnType<typeof Command.sidecar>,
    duration: number,
    onProgress?: (percent: number, status: string) => void,
    statusMessage = '处理中...',
): Promise<void> {
    return new Promise((resolve, reject) => {
        let lastPercent = 5;
        let stderrLog = '';

        cmd.on('close', (data) => {
            if (data.code === 0) resolve();
            else {
                // Return the last 500 chars of stderr to keep the error concise but informative
                const tail = stderrLog.length > 500 ? '...' + stderrLog.slice(-500) : stderrLog;
                reject(new Error(`FFmpeg exited with code ${data.code}\nLogs: ${tail}`));
            }
        });

        cmd.on('error', (err) => reject(new Error(`FFmpeg invocation error: ${err}`)));

        cmd.stderr.on('data', (line: string) => {
            if (line.trim()) {
                console.warn('[FFmpeg STDERR]', line.trim());
                stderrLog += line + '\n';
            }
        });

        cmd.stdout.on('data', (line: string) => {
            const timeMatch = line.match(/out_time_ms=(\d+)/);
            if (timeMatch && duration > 0) {
                const currentSeconds = parseInt(timeMatch[1]) / 1000000;
                const percent = Math.min(95, Math.max(lastPercent, Math.round((currentSeconds / duration) * 100)));
                if (percent > lastPercent) {
                    lastPercent = percent;
                    onProgress?.(percent, statusMessage);
                }
            }
        });

        cmd.spawn().catch(reject);
    });
}

// --- Utility exports (screenshots, clips, thumbnails) ---

async function ensureDirForFile(filePath: string) {
    // We normalize paths so we can reliably find the directory name
    const normalized = filePath.replace(/\\/g, '/');
    const dir = normalized.substring(0, normalized.lastIndexOf('/'));
    try {
        await mkdir(dir, { recursive: true });
    } catch (e: any) {
        const msg = String(e?.message || e || '');
        if (!msg.includes('exists') && !msg.includes('Already exists')) {
            throw e;
        }
    }
}

export async function takeScreenshot(
    inputPath: string,
    timestamp: number,
    outputPath: string
): Promise<void> {
    await ensureDirForFile(outputPath);
    const cmd = Command.sidecar('bin/ffmpeg', [
        '-ss', timestamp.toString(),
        '-i', inputPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        outputPath,
    ]);
    const output = await cmd.execute();
    if (output.code !== 0) throw new Error(`Screenshot failed: ${output.stderr}`);
}

export async function exportClip(
    inputPath: string,
    startTime: number,
    endTime: number,
    outputPath: string,
    isAudio?: boolean,
    fps: number = 24
): Promise<void> {
    await ensureDirForFile(outputPath);

    // Exact clipping duration in seconds and frames
    const duration = Math.max(0, endTime - startTime);
    const frameCount = Math.round(duration * fps);

    // We must re-encode (transcode) rather than use `-c copy` to guarantee frame-level accuracy.
    // Stream copy (-c copy) operates on GOP keyframes, which causes clips to snap to the nearest keyframe 
    // instead of the user's exact cut point, introducing multiple frames of bleeding.
    // Using ultrafast libx264 with crf 18 ensures visually lossless quality and executes very quickly.
    let ffmpegArgs = [
        '-v', 'warning',
        '-ss', startTime.toString(),
        '-i', inputPath,
        '-frames:v', frameCount.toString(),
        '-map', '0:v:0',    // first video stream
        '-map', '0:a:0?',   // first audio stream (optional)
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '18',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-y',
        outputPath,
    ];

    if (isAudio) {
        ffmpegArgs = [
            '-v', 'warning',
            '-ss', startTime.toString(),
            '-i', inputPath,
            '-t', duration.toString(),
            '-map', '0:a:0',
            '-vn',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-y',
            outputPath,
        ];
    }

    const cmd = Command.sidecar('bin/ffmpeg', ffmpegArgs);
    const output = await cmd.execute();
    if (output.code !== 0) throw new Error(`Clip export failed: ${output.stderr}`);
}

/**
 * Perform a targeted scene-cut detection around a specific timestamp.
 * Decodes only a 0.4s window (roughly ±0.2s from the cut point).
 * Returns true if a significant scene change is found.
 */
export async function detectSceneChange(videoPath: string, timestamp: number): Promise<boolean> {
    const start = Math.max(0, timestamp - 0.2);
    
    // Use select filter to drop frames without a significant scene change (> 20%).
    // We MUST include gt(n,0) because FFmpeg always scores the first frame as a scene change (score 1.0)
    // since it transitions from nothing to a picture.
    const cmd = Command.sidecar('bin/ffmpeg', [
        '-v', 'info',
        '-ss', start.toString(),
        '-t', '0.4',
        '-i', videoPath,
        '-filter:v', "select='gt(scene,0.2)*gt(n,0)',showinfo",
        '-f', 'null',
        '-'
    ]);
    
    try {
        const output = await cmd.execute();
        // showinfo logs frames like "[Parsed_showinfo_1 @ 0x...] n: 0 pts: 1 pts_time:0.12 ..."
        // We look for "pts_time:" to ensure a frame actually passed the select filter.
        const hasSceneChange = output.stderr.includes('pts_time:') || output.stdout.includes('pts_time:');
        return hasSceneChange;
    } catch (err) {
        console.warn(`[detectSceneChange] FFmpeg probing failed:`, err);
        return true; // Assume true on error so we don't annoy the user with false positive warnings
    }
}
