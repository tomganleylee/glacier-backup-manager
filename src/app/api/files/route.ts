import { NextResponse } from 'next/server';
import { listDirectory } from '@/lib/filesystem';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get('path') || '';

    const entries = listDirectory(dirPath);

    // Look up backup status for all entries in this directory
    const db = getDb();
    const backupItems = db.prepare(
      'SELECT path, status, priority FROM backup_items WHERE path LIKE ?'
    ).all(dirPath ? dirPath + '%' : '%') as { path: string; status: string; priority: number }[];

    const backupMap = new Map(backupItems.map(b => [b.path, { status: b.status, priority: b.priority }]));

    const enriched = entries.map(entry => ({
      ...entry,
      backup_status: backupMap.get(entry.path)?.status || null,
      backup_priority: backupMap.get(entry.path)?.priority ?? null,
    }));

    return NextResponse.json(enriched);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
