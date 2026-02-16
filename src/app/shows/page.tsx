'use client';

import { useEffect, useState } from 'react';

interface Show {
  id: number;
  title: string;
  sonarr_id: number | null;
  path: string;
  size_bytes: number;
  episode_count: number;
  status: string;
  rarity: string;
  rarity_score: number;
  backup_enabled: number;
  keep_best_quality: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function RarityBadge({ rarity }: { rarity: string }) {
  const colors: Record<string, string> = {
    rare: 'bg-red-900 text-red-300 border-red-700',
    moderate: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    easy: 'bg-green-900 text-green-300 border-green-700',
    unknown: 'bg-gray-800 text-gray-400 border-gray-700',
  };
  return (
    <span className={'px-2 py-0.5 rounded text-xs font-medium border ' + (colors[rarity] || colors.unknown)}>
      {rarity}
    </span>
  );
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  async function fetchShows() {
    setLoading(true);
    try {
      const params = filter !== 'all' ? '?rarity=' + filter : '';
      const res = await fetch('/api/shows' + params);
      const data = await res.json();
      setShows(Array.isArray(data) ? data : []);
    } catch { setShows([]); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchShows(); }, [filter]);

  async function syncFromSonarr() {
    setSyncing(true);
    try {
      await fetch('/api/shows/sync', { method: 'POST' });
      await fetchShows();
    } finally { setSyncing(false); }
  }

  async function toggleBackup(show: Show) {
    await fetch('/api/shows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: show.id, backup_enabled: show.backup_enabled ? 0 : 1 }),
    });
    setShows(prev => prev.map(s =>
      s.id === show.id ? { ...s, backup_enabled: s.backup_enabled ? 0 : 1 } : s
    ));
  }

  async function toggleKeepBest(show: Show) {
    await fetch('/api/shows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: show.id, keep_best_quality: show.keep_best_quality ? 0 : 1 }),
    });
    setShows(prev => prev.map(s =>
      s.id === show.id ? { ...s, keep_best_quality: s.keep_best_quality ? 0 : 1 } : s
    ));
  }

  const filteredShows = shows.filter(s =>
    !search || s.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: shows.length,
    rare: shows.filter(s => s.rarity === 'rare').length,
    backupEnabled: shows.filter(s => s.backup_enabled).length,
    totalSize: shows.reduce((sum, s) => sum + s.size_bytes, 0),
    backupSize: shows.filter(s => s.backup_enabled).reduce((sum, s) => sum + s.size_bytes, 0),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Shows</h1>
          <p className="text-gray-500 text-sm">{stats.total} shows, {stats.backupEnabled} selected for backup ({formatBytes(stats.backupSize)})</p>
        </div>
        <button
          onClick={syncFromSonarr}
          disabled={syncing}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium text-sm"
        >
          {syncing ? 'Syncing...' : 'Sync from Sonarr'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
          {['all', 'rare', 'moderate', 'easy'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={'px-3 py-1.5 rounded text-sm ' + (filter === f ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white')}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search shows..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="text-gray-500">Loading shows...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left">Backup</th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-center">Rarity</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-right">Episodes</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Keep Best</th>
              </tr>
            </thead>
            <tbody>
              {filteredShows.map(show => (
                <tr key={show.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!show.backup_enabled}
                      onChange={() => toggleBackup(show)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-medium">{show.title}</td>
                  <td className="p-3 text-center"><RarityBadge rarity={show.rarity} /></td>
                  <td className="p-3 text-right text-gray-400">{formatBytes(show.size_bytes)}</td>
                  <td className="p-3 text-right text-gray-400">{show.episode_count}</td>
                  <td className="p-3 text-center text-gray-500">{show.status || '-'}</td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!show.keep_best_quality}
                      onChange={() => toggleKeepBest(show)}
                      className="rounded"
                    />
                  </td>
                </tr>
              ))}
              {filteredShows.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">
                  {shows.length === 0 ? 'No shows. Click "Sync from Sonarr" to import.' : 'No matches.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
