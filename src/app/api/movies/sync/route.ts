import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { scoreRarity } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  path: string;
  status: string;
  hasFile: boolean;
  sizeOnDisk: number;
  movieFile?: {
    size: number;
  };
}

export async function POST() {
  try {
    const radarrUrl = getSetting('radarr_url');
    const radarrKey = getSetting('radarr_api_key');

    if (!radarrUrl || !radarrKey) {
      return NextResponse.json({ error: 'Radarr not configured' }, { status: 400 });
    }

    const response = await fetch(radarrUrl + '/api/v3/movie', {
      headers: { 'X-Api-Key': radarrKey },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Radarr API error: ' + response.status }, { status: 502 });
    }

    const movies: RadarrMovie[] = await response.json();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO movies (title, radarr_id, path, size_bytes, year, status, rarity, rarity_score, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(radarr_id) DO UPDATE SET
        title = excluded.title,
        path = excluded.path,
        size_bytes = excluded.size_bytes,
        year = excluded.year,
        status = excluded.status,
        rarity = excluded.rarity,
        rarity_score = excluded.rarity_score,
        synced_at = datetime('now')
    `);

    let synced = 0;
    const transaction = db.transaction(() => {
      for (const m of movies) {
        // Only include movies that have files on disk
        if (!m.hasFile) continue;

        const { score } = scoreRarity(m.title);
        const adjustedRarity = score >= 70 ? 'rare' : score <= 30 ? 'easy' : 'moderate';

        upsert.run(
          m.title,
          m.id,
          m.path,
          m.sizeOnDisk || m.movieFile?.size || 0,
          m.year,
          m.status,
          adjustedRarity,
          score,
        );
        synced++;
      }
    });
    transaction();

    return NextResponse.json({ success: true, synced });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
