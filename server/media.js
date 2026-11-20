import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export async function probeDurationSeconds(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 10000 },
    );
    const val = Number.parseFloat(String(stdout || '').trim());
    if (Number.isFinite(val) && val > 0.5 && val < 3600) {
      return Number(val.toFixed(3));
    }
  } catch {
    // ffprobe unavailable or failed; fall back to nominal openpilot 60s segment duration
  }
  return 60.0;
}

export async function generateSpriteAsync(tsPath, spritePath) {
  const tmpPath = `${spritePath}.tmp.${process.pid}.${Date.now()}.jpg`;
  try {
    await execFileAsync(
      'ffmpeg',
      ['-y', '-i', tsPath, '-vf', 'fps=1/5,scale=128:80,tile=12x1', '-frames:v', '1', '-q:v', '5', tmpPath],
      { timeout: 30000 },
    );
    if (fs.existsSync(tmpPath)) {
      fs.renameSync(tmpPath, spritePath);
      return true;
    }
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup failure
    }
  }
  return false;
}

export function buildQcameraM3u8(route, origin, exp, sig) {
  const cleanOrigin = String(origin || '').replace(/\/$/, '');
  const segEntries = Object.entries(route?.segments || {})
    .map(([k, v]) => [Number(k), v])
    .filter(([n, seg]) => Number.isFinite(n) && seg?.files?.['qcamera.ts'])
    .sort((a, b) => a[0] - b[0]);

  const durations = segEntries.map(([, seg]) => (
    typeof seg.duration_s === 'number' && seg.duration_s > 0 ? seg.duration_s : 60.0
  ));
  const targetDuration = Math.max(1, Math.ceil(durations.length ? Math.max(...durations) : 60));

  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ];

  let prevSegNum = null;
  for (let i = 0; i < segEntries.length; i += 1) {
    const [segNum] = segEntries[i];
    const dur = durations[i];
    if (prevSegNum !== null && segNum !== prevSegNum + 1) {
      lines.push('#EXT-X-DISCONTINUITY');
    }
    lines.push(`#EXTINF:${dur.toFixed(3)},`);
    const segUrl = `${cleanOrigin}/v1/storage/r/${exp}/${sig}/${route.dongle_id}/${route.log_id}/${segNum}/qcamera.ts`;
    lines.push(segUrl);
    prevSegNum = segNum;
  }

  lines.push('#EXT-X-ENDLIST');
  return `${lines.join('\n')}\n`;
}
