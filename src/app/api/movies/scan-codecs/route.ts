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
  return 'h264';
}

function detectResolutionFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('2160p') || lower.includes('4k') || lower.includes('uhd')) return '2160p';
  if (lower.includes('1080p') || lower.includes('1080i')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p') || lower.includes('sdtv') || lower.includes('dvdrip')) return '480p';
  return 'unknown';
}

function findVideoFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findVideoFiles(fullPath));
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

    const movies = db.prepare("SELECT id, title, path, codec, resolution FROM movies WHERE path IS NOT NULL AND path != ''").all() as {
      id: number; title: string; path: string; codec: string | null; resolution: string | null;
    }[];

    const update = db.prepare('UPDATE movies SET codec = ?, resolution = ? WHERE id = ?');
    let scanned = 0;
    let updated = 0;

    for (const movie of movies) {
      let moviePath = movie.path;
      if (moviePath.startsWith('/mnt/noobnoob/')) {
        moviePath = moviePath.replace('/mnt/noobnoob/', nasMountPath + '/');
      }

      if (!fs.existsSync(moviePath)) continue;

      const videoFiles = findVideoFiles(moviePath);
      if (videoFiles.length === 0) continue;

      // Movies usually have just one video file, but detect from the first one
      const detectedCodec = detectCodecFromFilename(videoFiles[0]);
      const detectedRes = detectResolutionFromFilename(videoFiles[0]);

      update.run(detectedCodec, detectedRes, movie.id);
      scanned++;
      if (detectedCodec !== movie.codec || detectedRes !== movie.resolution) updated++;
    }

    return NextResponse.json({ success: true, scanned, updated, total: movies.length });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
