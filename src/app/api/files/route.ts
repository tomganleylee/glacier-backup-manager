import { NextResponse } from 'next/server';
import { listDirectory } from '@/lib/filesystem';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dirPath = searchParams.get('path') || '';
    
    const entries = listDirectory(dirPath);
    return NextResponse.json(entries);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
