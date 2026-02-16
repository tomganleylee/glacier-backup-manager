import { NextResponse } from 'next/server';
import { getSchedulerStatus, abortCurrentUpload } from '@/lib/scheduler';
import { setSetting } from '@/lib/db';
import { processQueue } from '@/lib/uploader';

export async function GET() {
  try {
    const status = getSchedulerStatus();
    return NextResponse.json(status);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    if (body.action === 'start') {
      setSetting('scheduler_enabled', 'true');
      // Start processing queue in the background
      processQueue().catch(console.error);
      return NextResponse.json({ success: true, message: 'Scheduler started' });
    }
    
    if (body.action === 'stop') {
      setSetting('scheduler_enabled', 'false');
      abortCurrentUpload();
      return NextResponse.json({ success: true, message: 'Scheduler stopped' });
    }
    
    if (body.action === 'update') {
      if (body.start_hour !== undefined) setSetting('upload_start_hour', String(body.start_hour));
      if (body.end_hour !== undefined) setSetting('upload_end_hour', String(body.end_hour));
      if (body.bandwidth_limit !== undefined) setSetting('bandwidth_limit_mbps', String(body.bandwidth_limit));
      return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
