import { execSync } from 'child_process';
const videoPath = "/Users/bytedance/Downloads/Interstellar.2014.1080p.iTunes.WEB-DL.DD5.1.H264-BATWEB.mkv";
const timestamp = 6413.06865;
const start = Math.max(0, timestamp - 0.2);

try {
    const cmd = `ffmpeg -v info -ss ${start} -t 0.4 -i "${videoPath}" -filter:v "select='gt(scene,0.2)*gt(n,0)',showinfo" -f null - 2>&1`;
    console.log("Cmd:", cmd);
    const out = execSync(cmd).toString();
    console.log("Output has Parsed_showinfo_:", out.includes('Parsed_showinfo_'));
    const lines = out.split('\n').filter(l => l.includes('Parsed_showinfo_') || l.includes('scene='));
    console.log("Matches:", lines);
} catch (e) {
    const out = e.stdout.toString() + e.stderr.toString();
    console.log("Error output has Parsed_showinfo_:", out.includes('Parsed_showinfo_'));
    const lines = out.split('\n').filter(l => l.includes('Parsed_showinfo_') || l.includes('scene:'));
    console.log("Matches:", lines);
}
