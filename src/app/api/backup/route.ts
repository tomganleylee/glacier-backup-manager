import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const items = db.prepare(
      'SELECT * FROM backup_items ORDER BY priority ASC, created_at DESC'
    ).all();
    return NextResponse.json(items);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    
    if (Array.isArray(body)) {
      // Bulk add
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO backup_items (path, type, size_bytes, priority) VALUES (?, ?, ?, ?)'
      );
      const transaction = db.transaction((items: { path: string; type: string; size_bytes: number; priority: number }[]) => {
        for (const item of items) {
          stmt.run(item.path, item.type || 'file', item.size_bytes || 0, item.priority ?? 3);
        }
      });
      transaction(body);
      return NextResponse.json({ success: true, added: body.length });
    } else {
      // Single add
      const result = db.prepare(
        'INSERT OR IGNORE INTO backup_items (path, type, size_bytes, priority) VALUES (?, ?, ?, ?)'
      ).run(body.path, body.type || 'file', body.size_bytes || 0, body.priority ?? 3);
      return NextResponse.json({ success: true, id: result.lastInsertRowid });
    }
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
    
    if (id) {
      db.prepare('DELETE FROM backup_items WHERE id = ?').run(parseInt(id));
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
