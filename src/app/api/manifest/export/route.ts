import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface ManifestRow {
  name: string;
  path: string;
  type: string | null;
  size_bytes: number;
  file_count: number;
  backed_up: number;
  last_scanned: string | null;
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const items = db.prepare(
      'SELECT name, path, type, size_bytes, file_count, backed_up, last_scanned FROM manifest ORDER BY name ASC'
    ).all() as ManifestRow[];

    if (format === 'csv') {
      const headers = 'name,path,type,size_bytes,file_count,backed_up,last_scanned';
      const rows = items.map((item) =>
        [
          escapeCsvField(item.name),
          escapeCsvField(item.path),
          escapeCsvField(item.type ?? ''),
          String(item.size_bytes),
          String(item.file_count),
          String(item.backed_up),
          escapeCsvField(item.last_scanned ?? ''),
        ].join(',')
      );
      const csv = [headers, ...rows].join('\n');
      const today = new Date().toISOString().split('T')[0];

      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="manifest-export-${today}.csv"`,
        },
      });
    }

    return NextResponse.json(items);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
