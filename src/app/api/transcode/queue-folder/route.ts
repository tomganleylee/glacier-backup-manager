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
        // Skip already-transcoded files
        if (!entry.name.includes('.hevc.')) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // skip inaccessible directories
  }
  return files;
}

function detectCodec(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('x265') || lower.includes('h265') || lower.includes('hevc') || lower.includes('h.265')) return 'hevc';
  if (lower.includes('x264') || lower.includes('h264') || lower.includes('avc') || lower.includes('h.264')) return 'h264';
  if (lower.includes('xvid') || lower.includes('divx')) return 'xvid';
  if (lower.includes('av1')) return 'av1';
  if (lower.includes('mpeg4') || lower.includes('mpeg-4')) return 'mpeg4';
  if (lower.endsWith('.avi')) return 'xvid';
  return 'h264';
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { paths, codec_to } = body;

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ error: 'paths array is required' }, { status: 400 });
    }

    const nasMountPath = getSetting('nas_mount_path') || '/mnt/nas';
    const targetCodec = codec_to || 'hevc';

    // Get default transcode profile
    const defaultProfile = db.prepare('SELECT id FROM transcode_profiles WHERE is_default = 1').get() as { id: number } | undefined;
    const profileId = defaultProfile?.id || null;

    const insert = db.prepare(
      'INSERT INTO transcode_jobs (source_path, show_id, profile_id, codec_from, codec_to, original_size) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let totalQueued = 0;
    let totalSkipped = 0;
    let totalFiles = 0;
    const errors: string[] = [];

    for (const relativePath of paths) {
      const fullPath = path.join(nasMountPath, relativePath).replace(/\/+/g, '/');

      if (!fs.existsSync(fullPath)) {
        errors.push(relativePath + ': not found');
        continue;
      }

      const stat = fs.statSync(fullPath);
      let videoFiles: string[];

      if (stat.isDirectory()) {
        videoFiles = findVideoFiles(fullPath);
      } else if (VIDEO_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
        videoFiles = [fullPath];
      } else {
        errors.push(relativePath + ': not a video file or directory');
        continue;
      }

      totalFiles += videoFiles.length;

      // Check existing queued jobs
      const existingJobs = db.prepare(
        "SELECT source_path FROM transcode_jobs WHERE status IN ('queued', 'assigned', 'transcoding')"
      ).all() as { source_path: string }[];
      const existingPaths = new Set(existingJobs.map(j => j.source_path));

      for (const filePath of videoFiles) {
        if (existingPaths.has(filePath)) {
          totalSkipped++;
          continue;
        }

        const codecFrom = detectCodec(filePath);
        if (codecFrom === targetCodec) {
          totalSkipped++;
          continue;
        }

        let fileSize = 0;
        try { fileSize = fs.statSync(filePath).size; } catch { /* ignore */ }

        insert.run(filePath, null, profileId, codecFrom, targetCodec, fileSize);
        totalQueued++;
      }
    }

    return NextResponse.json({
      success: true,
      queued: totalQueued,
      skipped: totalSkipped,
      total_files: totalFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
