import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.wmv', '.ts', '.flv', '.mov']);

function detectCodecFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('x265') || lower.includes('h265') || lower.includes('hevc') || lower.includes('h.265')) return 'hevc';
  if (lower.includes('x264') || lower.includes('h264') || lower.includes('avc') || lower.includes('h.264')) return 'h264';
  if (lower.includes('xvid') || lower.includes('divx')) return 'xvid';
  if (lower.includes('av1')) return 'av1';
  if (lower.includes('mpeg4') || lower.includes('mpeg-4')) return 'mpeg4';
  if (lower.endsWith('.avi')) return 'xvid';
  return 'h264'; // default assumption for modern files
}

function detectResolutionFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '2160p';
  if (lower.includes('1080p') || lower.includes('1080i')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p') || lower.includes('sdtv') || lower.includes('dvdrip')) return '480p';
  return 'unknown';
}

function sampleVideoFiles(dir: string, max: number = 5): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= max) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...sampleVideoFiles(fullPath, max - files.length));
      } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(entry.name);
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return files;
}

export async function POST() {
  try {
    const db = getDb();
    const nasMountPath = getSetting('nas_mount_path') || '/mnt/nas';

    const shows = db.prepare("SELECT id, title, path, codec, resolution FROM shows WHERE path IS NOT NULL AND path != ''").all() as {
      id: number; title: string; path: string; codec: string | null; resolution: string | null;
    }[];

    const update = db.prepare('UPDATE shows SET codec = ?, resolution = ? WHERE id = ?');
    let scanned = 0;
    let updated = 0;

    for (const show of shows) {
      let showPath = show.path;
      if (showPath.startsWith('/mnt/noobnoob/')) {
        showPath = showPath.replace('/mnt/noobnoob/', nasMountPath + '/');
      }

      if (!fs.existsSync(showPath)) continue;

      const sampleFiles = sampleVideoFiles(showPath, 5);
      if (sampleFiles.length === 0) continue;

      // Detect codec and resolution from the most common pattern in sample files
      const codecs = sampleFiles.map(f => detectCodecFromFilename(f));
      const resolutions = sampleFiles.map(f => detectResolutionFromFilename(f));

      // Pick the most common codec
      const codecCounts: Record<string, number> = {};
      for (const c of codecs) { codecCounts[c] = (codecCounts[c] || 0) + 1; }
      const detectedCodec = Object.entries(codecCounts).sort((a, b) => b[1] - a[1])[0][0];

      // Pick the most common resolution
      const resCounts: Record<string, number> = {};
      for (const r of resolutions) { resCounts[r] = (resCounts[r] || 0) + 1; }
      const detectedRes = Object.entries(resCounts).sort((a, b) => b[1] - a[1])[0][0];

      update.run(detectedCodec, detectedRes, show.id);
      scanned++;
      if (detectedCodec !== show.codec || detectedRes !== show.resolution) updated++;
    }

    return NextResponse.json({ success: true, scanned, updated, total: shows.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
