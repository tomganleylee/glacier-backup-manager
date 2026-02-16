import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function categorize(dirPath: string): string {
  const lower = dirPath.toLowerCase();
  if (lower.includes('series')) return 'series';
  if (lower.includes('films')) return 'film';
  if (lower.includes('photos') || lower.includes('pictures') || lower.includes('immich')) return 'photo';
  if (lower.includes('documents')) return 'document';
  if (lower.includes('games')) return 'game';
  if (lower.includes('backup')) return 'backup';
  return 'other';
}

function walkDirectory(dirPath: string): { fileCount: number; totalSize: number } {
  let fileCount = 0;
  let totalSize = 0;

  function walk(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile()) {
          try {
            totalSize += fs.statSync(fullPath).size;
            fileCount++;
          } catch { /* skip inaccessible files */ }
        } else if (entry.isDirectory()) {
          walk(fullPath);
        }
      }
    } catch { /* skip inaccessible directories */ }
  }

  walk(dirPath);
  return { fileCount, totalSize };
}

export async function POST() {
  try {
    const nasMount = getSetting('nas_mount_path') || '/mnt/nas';

    if (!fs.existsSync(nasMount)) {
      return NextResponse.json({ error: 'NAS mount path not found: ' + nasMount }, { status: 400 });
    }

    const entries = fs.readdirSync(nasMount, { withFileTypes: true });
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO manifest (path, name, type, size_bytes, file_count, backed_up, last_scanned)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        size_bytes = excluded.size_bytes,
        file_count = excluded.file_count,
        backed_up = excluded.backed_up,
        last_scanned = datetime('now')
    `);

    const checkBackup = db.prepare(
      'SELECT COUNT(*) as count FROM backup_items WHERE path LIKE ?'
    );

    let scanned = 0;

    const transaction = db.transaction(() => {
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === '$RECYCLE.BIN') {
          continue;
        }

        const fullPath = path.join(nasMount, entry.name);

        if (entry.isDirectory()) {
          const { fileCount, totalSize } = walkDirectory(fullPath);
          const type = categorize(entry.name);
          const backupCheck = checkBackup.get(fullPath + '%') as { count: number };
          const backedUp = backupCheck.count > 0 ? 1 : 0;

          upsert.run(fullPath, entry.name, type, totalSize, fileCount, backedUp);
          scanned++;
        } else if (entry.isFile()) {
          try {
            const stats = fs.statSync(fullPath);
            const type = categorize(entry.name);
            const backupCheck = checkBackup.get(fullPath + '%') as { count: number };
            const backedUp = backupCheck.count > 0 ? 1 : 0;

            upsert.run(fullPath, entry.name, type, stats.size, 1, backedUp);
            scanned++;
          } catch { /* skip inaccessible files */ }
        }
      }
    });

    transaction();

    return NextResponse.json({ success: true, scanned });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
