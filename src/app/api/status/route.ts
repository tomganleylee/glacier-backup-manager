import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';

export async function GET() {
  try {
    const db = getDb();

    // Backup queue summary
    const backupStats = {
      total: (db.prepare('SELECT COUNT(*) as c FROM backup_items').get() as { c: number }).c,
      pending: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status IN ('pending','queued')").get() as { c: number }).c,
      uploading: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'uploading'").get() as { c: number }).c,
      uploaded: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'uploaded'").get() as { c: number }).c,
      failed: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'failed'").get() as { c: number }).c,
      totalBytes: (db.prepare('SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items').get() as { s: number }).s,
      uploadedBytes: (db.prepare("SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items WHERE status = 'uploaded'").get() as { s: number }).s,
      pendingBytes: (db.prepare("SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items WHERE status IN ('pending','queued')").get() as { s: number }).s,
    };

    // Transcode summary
    const transcodeStats = {
      queued: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'queued'").get() as { c: number }).c,
      active: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status IN ('assigned','transcoding')").get() as { c: number }).c,
      completed: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'completed'").get() as { c: number }).c,
      failed: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'failed'").get() as { c: number }).c,
      savedBytes: (db.prepare("SELECT COALESCE(SUM(original_size - transcoded_size),0) as s FROM transcode_jobs WHERE status = 'completed' AND original_size IS NOT NULL AND transcoded_size IS NOT NULL").get() as { s: number }).s,
    };

    // Shows summary
    const showStats = {
      total: (db.prepare('SELECT COUNT(*) as c FROM shows').get() as { c: number }).c,
      backupEnabled: (db.prepare('SELECT COUNT(*) as c FROM shows WHERE backup_enabled = 1').get() as { c: number }).c,
      rare: (db.prepare("SELECT COUNT(*) as c FROM shows WHERE rarity = 'rare'").get() as { c: number }).c,
      totalSizeBytes: (db.prepare('SELECT COALESCE(SUM(size_bytes),0) as s FROM shows').get() as { s: number }).s,
    };

    // Recent activity (last 5 completed uploads and transcodes)
    const recentUploads = db.prepare(
      "SELECT file_path, file_size_bytes, completed_at FROM upload_log WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 5"
    ).all();
    const recentTranscodes = db.prepare(
      "SELECT source_path, original_size, transcoded_size, completed_at FROM transcode_jobs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 5"
    ).all();

    // Scheduler
    const scheduler = getSchedulerStatus();

    // Settings (non-sensitive)
    const settings = db.prepare("SELECT key, value FROM settings WHERE key NOT IN ('aws_access_key','aws_secret_key','claude_api_key','sonarr_api_key','radarr_api_key')").all();

    return NextResponse.json({
      backup: backupStats,
      transcode: transcodeStats,
      shows: showStats,
      scheduler,
      recentUploads,
      recentTranscodes,
      settings: Object.fromEntries((settings as { key: string; value: string }[]).map(s => [s.key, s.value])),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
