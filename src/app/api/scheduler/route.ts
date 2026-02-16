import { NextResponse } from 'next/server';
import { getSchedulerStatus, abortCurrentUpload, startSchedulerLoop, stopSchedulerLoop } from '@/lib/scheduler';
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
      // Start the periodic scheduler loop (checks every 5 min)
      startSchedulerLoop(processQueue);
      // Also immediately start processing if within upload window
      processQueue().catch(console.error);
      return NextResponse.json({ success: true, message: 'Scheduler started' });
    }

    if (body.action === 'stop') {
      setSetting('scheduler_enabled', 'false');
      stopSchedulerLoop();
      abortCurrentUpload();
      return NextResponse.json({ success: true, message: 'Scheduler stopped' });
    }

    if (body.action === 'update') {
      if (body.start_hour !== undefined) {
        const hour = parseInt(String(body.start_hour));
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          setSetting('upload_start_hour', String(hour));
        }
      }
      if (body.end_hour !== undefined) {
        const hour = parseInt(String(body.end_hour));
        if (!isNaN(hour) && hour >= 0 && hour <= 23) {
          setSetting('upload_end_hour', String(hour));
        }
      }
      if (body.bandwidth_limit !== undefined) {
        const bw = parseInt(String(body.bandwidth_limit));
        if (!isNaN(bw) && bw > 0) {
          setSetting('bandwidth_limit_mbps', String(bw));
        }
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
