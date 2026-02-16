import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { scoreRarity } from '@/lib/constants';

export const dynamic = 'force-dynamic';

interface SonarrSeries {
  id: number;
  title: string;
  path: string;
  status: string;
  statistics?: { sizeOnDisk?: number; episodeFileCount?: number };
}

export async function POST() {
  try {
    const sonarrUrl = getSetting('sonarr_url');
    const sonarrKey = getSetting('sonarr_api_key');
    
    if (!sonarrUrl || !sonarrKey) {
      return NextResponse.json({ error: 'Sonarr not configured' }, { status: 400 });
    }

    const response = await fetch(sonarrUrl + '/api/v3/series', {
      headers: { 'X-Api-Key': sonarrKey },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Sonarr API error: ' + response.status }, { status: 502 });
    }

    const series: SonarrSeries[] = await response.json();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT INTO shows (title, sonarr_id, path, size_bytes, episode_count, status, rarity, rarity_score, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(sonarr_id) DO UPDATE SET
        title = excluded.title,
        path = excluded.path,
        size_bytes = excluded.size_bytes,
        episode_count = excluded.episode_count,
        status = excluded.status,
        rarity = excluded.rarity,
        rarity_score = excluded.rarity_score,
        synced_at = datetime('now')
    `);

    let synced = 0;
    const transaction = db.transaction(() => {
      for (const s of series) {
        const { score } = scoreRarity(s.title);
        // Boost rarity for deleted/ended shows
        const adjustedScore = s.status === 'deleted' ? Math.min(100, score + 20) : score;
        const adjustedRarity = adjustedScore >= 70 ? 'rare' : adjustedScore <= 30 ? 'easy' : 'moderate';

        upsert.run(
          s.title,
          s.id,
          s.path,
          s.statistics?.sizeOnDisk || 0,
          s.statistics?.episodeFileCount || 0,
          s.status,
          adjustedRarity,
          adjustedScore,
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
