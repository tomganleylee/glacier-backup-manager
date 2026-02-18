import { NextResponse } from 'next/server';
import { getUploadStats, processQueue } from '@/lib/uploader';
import { getSchedulerStatus, autoStartIfEnabled } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Auto-start scheduler on first hit after service restart
    autoStartIfEnabled(processQueue);
    const stats = getUploadStats();
    const scheduler = getSchedulerStatus();
    return NextResponse.json({ stats, scheduler });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
