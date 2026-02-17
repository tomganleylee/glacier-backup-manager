import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const rarity = searchParams.get('rarity');
    const backupOnly = searchParams.get('backup_enabled');

    let query = 'SELECT * FROM movies';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (rarity) {
      conditions.push('rarity = ?');
      params.push(rarity);
    }
    if (backupOnly === 'true') {
      conditions.push('backup_enabled = 1');
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY rarity_score DESC, title ASC';

    const movies = db.prepare(query).all(...params);
    return NextResponse.json(movies);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing movie id' }, { status: 400 });
    }

    const setClauses: string[] = [];
    const values: (string | number)[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['backup_enabled', 'keep_best_quality', 'rarity', 'rarity_score'].includes(key)) {
        setClauses.push(key + ' = ?');
        values.push(value as string | number);
      }
    }

    if (setClauses.length > 0) {
      values.push(id);
      db.prepare('UPDATE movies SET ' + setClauses.join(', ') + ' WHERE id = ?').run(...values);
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
