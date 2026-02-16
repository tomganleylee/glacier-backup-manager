import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const jobs = db.prepare(
      'SELECT t.*, s.title as show_title FROM transcode_jobs t LEFT JOIN shows s ON t.show_id = s.id ORDER BY t.created_at DESC'
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
    
    const result = db.prepare(
      'INSERT INTO transcode_jobs (source_path, show_id, codec_from, codec_to) VALUES (?, ?, ?, ?)'
    ).run(body.source_path, body.show_id || null, body.codec_from || 'h264', body.codec_to || 'hevc');
    
    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
