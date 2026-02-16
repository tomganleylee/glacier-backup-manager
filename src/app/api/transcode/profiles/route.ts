import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface TranscodeProfile {
  id: number;
  name: string;
  description: string;
  codec: string;
  preset: string;
  cq: number;
  extra_args: string;
  is_default: number;
}

export async function GET() {
  try {
    const db = getDb();
    const profiles = db.prepare(
      'SELECT * FROM transcode_profiles ORDER BY is_default DESC, name ASC'
    ).all() as TranscodeProfile[];
    return NextResponse.json(profiles);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const body = await request.json();

    const { name, description, codec, preset, cq, extra_args } = body as {
      name: string;
      description: string;
      codec: string;
      preset: string;
      cq: number;
      extra_args: string;
    };

    if (!name || !codec || !preset || cq == null) {
      return NextResponse.json(
        { error: 'Missing required fields: name, codec, preset, cq' },
        { status: 400 }
      );
    }

    const result = db.prepare(
      'INSERT INTO transcode_profiles (name, description, codec, preset, cq, extra_args, is_default) VALUES (?, ?, ?, ?, ?, ?, 0)'
    ).run(name, description || '', codec, preset, cq, extra_args || '');

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
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

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const profile = db.prepare(
      'SELECT is_default FROM transcode_profiles WHERE id = ?'
    ).get(Number(id)) as TranscodeProfile | undefined;

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (profile.is_default) {
      return NextResponse.json(
        { error: 'Cannot delete the default profile' },
        { status: 400 }
      );
    }

    db.prepare('DELETE FROM transcode_profiles WHERE id = ?').run(Number(id));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
