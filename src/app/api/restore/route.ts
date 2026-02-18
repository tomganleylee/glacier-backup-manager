import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { execFileSync } from 'child_process';
import { writeRcloneConfig } from '@/lib/rclone';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const jobs = db.prepare(
      'SELECT * FROM restore_jobs ORDER BY requested_at DESC'
    ).all();
    return NextResponse.json(jobs);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { glacier_key, tier } = body;

    if (!glacier_key) {
      return NextResponse.json({ error: 'glacier_key is required' }, { status: 400 });
    }

    const restoreTier = tier || 'Bulk';
    if (!['Bulk', 'Standard'].includes(restoreTier)) {
      return NextResponse.json({ error: 'tier must be Bulk or Standard' }, { status: 400 });
    }

    // Check if there's already an active restore for this key
    const existing = db.prepare(
      "SELECT id, status FROM restore_jobs WHERE glacier_key = ? AND status IN ('pending', 'restoring', 'ready')"
    ).get(glacier_key) as { id: number; status: string } | undefined;

    if (existing) {
      return NextResponse.json({
        error: `Restore already ${existing.status} (job #${existing.id})`,
      }, { status: 409 });
    }

    // Look up the backup item for size info
    const backupItem = db.prepare(
      'SELECT path, size_bytes FROM backup_items WHERE glacier_key = ?'
    ).get(glacier_key) as { path: string; size_bytes: number } | undefined;

    const bucket = getSetting('aws_bucket') || '';
    const configPath = writeRcloneConfig();

    // Initiate restore via rclone backend command
    // For Deep Archive: Bulk = within 48 hours, Standard = within 12 hours
    const lifetimeDays = 7;
    try {
      execFileSync('rclone', [
        'backend', 'restore',
        '--config', configPath,
        '-o', `priority=${restoreTier}`,
        '-o', `lifetime=${lifetimeDays}`,
        `glacier:${bucket}/${glacier_key}`,
      ], { timeout: 30000, encoding: 'utf-8' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If it says "already being restored" that's fine
      if (!msg.includes('RestoreAlreadyInProgress')) {
        return NextResponse.json({ error: 'Failed to initiate restore: ' + msg.slice(0, 500) }, { status: 500 });
      }
    }

    // Calculate estimated ready time
    const now = new Date();
    const hoursToReady = restoreTier === 'Standard' ? 12 : 48;
    const readyEstimate = new Date(now.getTime() + hoursToReady * 60 * 60 * 1000);
    const expiresEstimate = new Date(readyEstimate.getTime() + lifetimeDays * 24 * 60 * 60 * 1000);

    const result = db.prepare(
      `INSERT INTO restore_jobs (glacier_key, file_path, size_bytes, tier, status, ready_at, expires_at)
       VALUES (?, ?, ?, ?, 'restoring', ?, ?)`
    ).run(
      glacier_key,
      backupItem?.path || glacier_key,
      backupItem?.size_bytes || 0,
      restoreTier,
      readyEstimate.toISOString(),
      expiresEstimate.toISOString()
    );

    return NextResponse.json({
      success: true,
      job_id: result.lastInsertRowid,
      tier: restoreTier,
      estimated_ready: readyEstimate.toISOString(),
      expires: expiresEstimate.toISOString(),
      cost_note: restoreTier === 'Bulk'
        ? '$0.0025/GB - cheapest option, up to 48 hours'
        : '$0.02/GB - faster, within 12 hours',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    db.prepare('DELETE FROM restore_jobs WHERE id = ?').run(parseInt(id));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
