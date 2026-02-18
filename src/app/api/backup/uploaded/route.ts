import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const sort = searchParams.get('sort') || 'uploaded_at';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const validSorts: Record<string, string> = {
      uploaded_at: 'uploaded_at',
      size_bytes: 'size_bytes',
      path: 'path',
      priority: 'priority',
    };
    const sortCol = validSorts[sort] || 'uploaded_at';

    let query = `SELECT id, path, type, size_bytes, priority, status, glacier_key, uploaded_at, created_at
                 FROM backup_items WHERE status = 'uploaded'`;
    const params: string[] = [];

    if (search) {
      query += ' AND path LIKE ?';
      params.push('%' + search + '%');
    }

    query += ` ORDER BY ${sortCol} ${order}`;

    const items = db.prepare(query).all(...params);

    // Summary stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_files,
        COALESCE(SUM(size_bytes), 0) as total_bytes,
        MIN(uploaded_at) as first_upload,
        MAX(uploaded_at) as last_upload
      FROM backup_items WHERE status = 'uploaded'
    `).get() as { total_files: number; total_bytes: number; first_upload: string; last_upload: string };

    return NextResponse.json({ items, stats });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
