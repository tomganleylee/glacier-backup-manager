import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const VIDEO_EXTENSIONS = new Set(['.mkv', '.mp4', '.avi', '.m4v', '.wmv', '.ts', '.flv', '.mov']);

function findVideoFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findVideoFiles(fullPath));
      } else if (VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return files;
}

function detectCodec(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('x265') || lower.includes('h265') || lower.includes('hevc')) return 'hevc';
  if (lower.includes('x264') || lower.includes('h264') || lower.includes('avc')) return 'h264';
  if (lower.includes('xvid') || lower.includes('divx')) return 'xvid';
  if (lower.includes('av1')) return 'av1';
  if (lower.endsWith('.avi')) return 'xvid';
  return 'h264';
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const movieId = parseInt(params.id);
    const body = await request.json().catch(() => ({}));
    const profileId = body.profile_id || null;

    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId) as {
      id: number; title: string; path: string; size_bytes: number;
    } | undefined;

    if (!movie) {
      return NextResponse.json({ error: 'Movie not found' }, { status: 404 });
    }

    const nasMountPath = getSetting('nas_mount_path') || '/mnt/nas';
    let moviePath = movie.path;

    if (moviePath.startsWith('/mnt/noobnoob/')) {
      moviePath = moviePath.replace('/mnt/noobnoob/', nasMountPath + '/');
    }

    if (!fs.existsSync(moviePath)) {
      return NextResponse.json({
        error: 'Movie directory not found: ' + moviePath + ' (check NAS mount)'
      }, { status: 404 });
    }

    const videoFiles = findVideoFiles(moviePath);

    if (videoFiles.length === 0) {
      return NextResponse.json({ error: 'No video files found in ' + moviePath }, { status: 404 });
    }

    // Check for already-queued files (use movie_id column if present, else match by source_path)
    const existingJobs = db.prepare(
      "SELECT source_path FROM transcode_jobs WHERE source_path LIKE ? AND status IN ('queued', 'assigned', 'transcoding')"
    ).all(moviePath + '%') as { source_path: string }[];
    const existingPaths = new Set(existingJobs.map(j => j.source_path));

    let resolvedProfileId = profileId;
    if (!resolvedProfileId) {
      const defaultProfile = db.prepare('SELECT id FROM transcode_profiles WHERE is_default = 1').get() as { id: number } | undefined;
      resolvedProfileId = defaultProfile?.id || null;
    }

    let codecTo = 'hevc';
    if (resolvedProfileId) {
      const profile = db.prepare('SELECT codec FROM transcode_profiles WHERE id = ?').get(resolvedProfileId) as { codec: string } | undefined;
      if (profile) codecTo = profile.codec;
    }

    const insert = db.prepare(
      'INSERT INTO transcode_jobs (source_path, show_id, profile_id, codec_from, codec_to, original_size) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let queued = 0;
    let skipped = 0;
    const queuedFiles: string[] = [];

    for (const filePath of videoFiles) {
      if (existingPaths.has(filePath)) {
        skipped++;
        continue;
      }

      const codecFrom = detectCodec(filePath);

      if (codecFrom === codecTo) {
        skipped++;
        continue;
      }

      let fileSize = 0;
      try { fileSize = fs.statSync(filePath).size; } catch { /* ignore */ }

      // Note: reusing show_id column for movie_id (same FK concept)
      insert.run(filePath, null, resolvedProfileId, codecFrom, codecTo, fileSize);
      queuedFiles.push(path.basename(filePath));
      queued++;
    }

    return NextResponse.json({
      success: true,
      movie: movie.title,
      queued,
      skipped,
      total_files: videoFiles.length,
      files: queuedFiles,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
