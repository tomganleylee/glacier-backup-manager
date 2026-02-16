import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const type = searchParams.get('type');
    
    let query = 'SELECT * FROM manifest';
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    
    if (search) {
      conditions.push('(name LIKE ? OR path LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%');
    }
    if (type) {
      conditions.push('type = ?');
      params.push(type);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY name ASC';
    
    const items = db.prepare(query).all(...params);
    return NextResponse.json(items);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
