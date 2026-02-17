'use client';

import { useEffect, useState } from 'react';

interface Movie {
  id: number;
  title: string;
  radarr_id: number | null;
  path: string;
  size_bytes: number;
  year: number | null;
  status: string;
  rarity: string;
  rarity_score: number;
  backup_enabled: number;
  keep_best_quality: number;
  codec: string | null;
  resolution: string | null;
}

const REDUCTION_ESTIMATES: Record<string, number> = {
  xvid: 0.65,
  mpeg4: 0.60,
  h264: 0.45,
  hevc: 0,
  av1: 0,
};

function estimateSavings(codec: string | null): number {
  if (!codec) return 0.40;
  return REDUCTION_ESTIMATES[codec.toLowerCase()] ?? 0.40;
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

function CodecBadge({ codec, resolution }: { codec: string | null; resolution: string | null }) {
  if (!codec) return <span className="text-gray-600 text-xs">-</span>;
  const codecColors: Record<string, string> = {
    xvid: 'text-red-400',
    mpeg4: 'text-red-400',
    h264: 'text-yellow-400',
    hevc: 'text-green-400',
    av1: 'text-green-400',
  };
  const color = codecColors[codec.toLowerCase()] || 'text-gray-400';
  return (
    <span className="text-xs">
      <span className={color}>{codec.toUpperCase()}</span>
      {resolution && resolution !== 'unknown' && (
        <span className="text-gray-500 ml-1">{resolution}</span>
      )}
    </span>
  );
}

export default function MoviesPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [transcodeMsg, setTranscodeMsg] = useState('');
  const [queuingId, setQueuingId] = useState<number | null>(null);

  async function fetchMovies() {
    setLoading(true);
    try {
      const params = filter !== 'all' ? '?rarity=' + filter : '';
      const res = await fetch('/api/movies' + params);
      const data = await res.json();
      setMovies(Array.isArray(data) ? data : []);
    } catch { setMovies([]); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMovies(); }, [filter]);

  async function syncFromRadarr() {
    setSyncing(true);
    try {
      const res = await fetch('/api/movies/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTranscodeMsg('Synced ' + data.synced + ' movies from Radarr');
      } else {
        setTranscodeMsg('Sync error: ' + (data.error || 'Unknown error'));
      }
      await fetchMovies();
    } finally { setSyncing(false); }
  }

  async function scanCodecs() {
    setScanning(true);
    setTranscodeMsg('');
    try {
      const res = await fetch('/api/movies/scan-codecs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTranscodeMsg('Scanned ' + data.scanned + ' movies, updated ' + data.updated + ' codecs');
        await fetchMovies();
      } else {
        setTranscodeMsg('Error: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setTranscodeMsg('Codec scan failed');
    } finally { setScanning(false); }
  }

  async function toggleBackup(movie: Movie) {
    await fetch('/api/movies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: movie.id, backup_enabled: movie.backup_enabled ? 0 : 1 }),
    });
    setMovies(prev => prev.map(m =>
      m.id === movie.id ? { ...m, backup_enabled: m.backup_enabled ? 0 : 1 } : m
    ));
  }

  async function queueTranscode(movie: Movie) {
    setQueuingId(movie.id);
    setTranscodeMsg('');
    try {
      const res = await fetch('/api/movies/' + movie.id + '/transcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setTranscodeMsg(movie.title + ': ' + data.queued + ' file(s) queued for transcode' + (data.skipped ? ' (' + data.skipped + ' skipped)' : ''));
      } else {
        setTranscodeMsg('Error: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setTranscodeMsg('Failed to queue transcode for ' + movie.title);
    } finally {
      setQueuingId(null);
    }
  }

  async function toggleKeepBest(movie: Movie) {
    await fetch('/api/movies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: movie.id, keep_best_quality: movie.keep_best_quality ? 0 : 1 }),
    });
    setMovies(prev => prev.map(m =>
      m.id === movie.id ? { ...m, keep_best_quality: m.keep_best_quality ? 0 : 1 } : m
    ));
  }

  const filteredMovies = movies.filter(m =>
    !search || m.title.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: movies.length,
    rare: movies.filter(m => m.rarity === 'rare').length,
    backupEnabled: movies.filter(m => m.backup_enabled).length,
    totalSize: movies.reduce((sum, m) => sum + m.size_bytes, 0),
    backupSize: movies.filter(m => m.backup_enabled).reduce((sum, m) => sum + m.size_bytes, 0),
    estimatedSaved: movies.reduce((sum, m) => sum + (m.size_bytes * estimateSavings(m.codec)), 0),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Movies</h1>
          <p className="text-gray-500 text-sm">
            {stats.total} movies, {stats.backupEnabled} selected for backup ({formatBytes(stats.backupSize)})
            {stats.estimatedSaved > 0 && (
              <span className="text-green-400"> | Est. savings with transcode: {formatBytes(stats.estimatedSaved)}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scanCodecs}
            disabled={scanning}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium text-sm"
          >
            {scanning ? 'Scanning...' : 'Scan Codecs'}
          </button>
          <button
            onClick={syncFromRadarr}
            disabled={syncing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium text-sm"
          >
            {syncing ? 'Syncing...' : 'Sync from Radarr'}
          </button>
        </div>
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
          placeholder="Search movies..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {transcodeMsg && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-950 border border-blue-800 text-blue-300">
          {transcodeMsg}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading movies...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left">Backup</th>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-center">Year</th>
                <th className="p-3 text-center">Rarity</th>
                <th className="p-3 text-center">Codec</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-right">Est. After</th>
                <th className="p-3 text-right">Savings</th>
                <th className="p-3 text-center">Keep Best</th>
                <th className="p-3 text-center">Transcode</th>
              </tr>
            </thead>
            <tbody>
              {filteredMovies.map(movie => {
                const reduction = estimateSavings(movie.codec);
                const estAfter = movie.size_bytes * (1 - reduction);
                const savingsBytes = movie.size_bytes * reduction;
                const savingsPct = Math.round(reduction * 100);
                const alreadyBest = movie.codec === 'hevc' || movie.codec === 'av1';
                return (
                  <tr key={movie.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={!!movie.backup_enabled}
                        onChange={() => toggleBackup(movie)}
                        className="rounded"
                      />
                    </td>
                    <td className="p-3 font-medium">{movie.title}</td>
                    <td className="p-3 text-center text-gray-400">{movie.year || '-'}</td>
                    <td className="p-3 text-center"><RarityBadge rarity={movie.rarity} /></td>
                    <td className="p-3 text-center"><CodecBadge codec={movie.codec} resolution={movie.resolution} /></td>
                    <td className="p-3 text-right text-gray-400">{formatBytes(movie.size_bytes)}</td>
                    <td className="p-3 text-right text-gray-400">
                      {alreadyBest ? (
                        <span className="text-green-400 text-xs">already optimal</span>
                      ) : movie.size_bytes > 0 ? (
                        formatBytes(estAfter)
                      ) : '-'}
                    </td>
                    <td className="p-3 text-right">
                      {alreadyBest ? (
                        <span className="text-gray-600">-</span>
                      ) : savingsBytes > 0 ? (
                        <span className="text-green-400">{savingsPct}% ({formatBytes(savingsBytes)})</span>
                      ) : '-'}
                    </td>
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={!!movie.keep_best_quality}
                        onChange={() => toggleKeepBest(movie)}
                        className="rounded"
                        title="Skip transcoding, backup original quality"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => queueTranscode(movie)}
                        disabled={queuingId === movie.id || !!movie.keep_best_quality || alreadyBest}
                        className="px-2 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-xs font-medium"
                        title={alreadyBest ? 'Already in optimal codec' : 'Queue movie for transcode'}
                      >
                        {queuingId === movie.id ? '...' : 'Queue'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredMovies.length === 0 && (
                <tr><td colSpan={10} className="p-8 text-center text-gray-500">
                  {movies.length === 0 ? 'No movies. Click "Sync from Radarr" to import.' : 'No matches.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
