import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Convert various NAS path formats to a relative path for backup_items
function toRelativePath(absPath: string): string {
  const nasMount = getSetting('nas_mount_path') || '/mnt/nas';
  const prefixes = [
    '/mnt/user/noobnoob/', // Unraid internal path (used by Sonarr/worker)
    '/mnt/noobnoob/',      // Sonarr path variant
    nasMount + '/',         // LXC NAS mount
  ];
  for (const prefix of prefixes) {
    if (absPath.startsWith(prefix)) {
      return absPath.slice(prefix.length);
    }
  }
  // If no prefix matched, return as-is (strip leading slash)
  return absPath.replace(/^\/+/, '');
}

// GET: Worker polls for next available job
export async function GET() {
  try {
    const db = getDb();
    // Atomic claim: UPDATE + SELECT in a transaction to prevent two workers claiming the same job
    const claimJob = db.transaction(() => {
      const job = db.prepare(
        "SELECT * FROM transcode_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
      ).get() as Record<string, unknown> | undefined;

      if (job) {
        db.prepare(
          "UPDATE transcode_jobs SET status = 'assigned', assigned_at = datetime('now') WHERE id = ?"
        ).run(job.id);
        return { ...job, status: 'assigned' };
      }
      return null;
    });

    const job = claimJob();
    return NextResponse.json(job);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Worker reports progress/completion
export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, status, progress, output_path, transcoded_size, error: errorMsg } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing job id' }, { status: 400 });
    }

    if (status === 'transcoding') {
      db.prepare(
        'UPDATE transcode_jobs SET status = ?, progress = ? WHERE id = ?'
      ).run('transcoding', progress || 0, id);
    } else if (status === 'completed') {
      db.prepare(
        "UPDATE transcode_jobs SET status = 'completed', progress = 100, output_path = ?, transcoded_size = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(output_path, transcoded_size || 0, id);

      // Auto-queue the transcoded file for Glacier upload
      if (output_path) {
        const relativePath = toRelativePath(output_path);
        const fileSize = transcoded_size || 0;

        db.prepare(
          'INSERT OR IGNORE INTO backup_items (path, type, size_bytes, priority, status) VALUES (?, ?, ?, ?, ?)'
        ).run(relativePath, 'file', fileSize, 2, 'pending');

        console.log(`[Transcode] Auto-queued for backup: ${relativePath} (${fileSize} bytes)`);
      }
    } else if (status === 'failed') {
      db.prepare(
        "UPDATE transcode_jobs SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
      ).run(errorMsg || 'Unknown error', id);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
