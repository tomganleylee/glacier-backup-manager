import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// GET: Worker polls for next available job
export async function GET() {
  try {
    const db = getDb();
    const job = db.prepare(
      "SELECT * FROM transcode_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1"
    ).get();
    
    if (job) {
      // Mark as assigned
      db.prepare(
        "UPDATE transcode_jobs SET status = 'assigned', assigned_at = datetime('now') WHERE id = ?"
      ).run((job as { id: number }).id);
    }
    
    return NextResponse.json(job || null);
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
