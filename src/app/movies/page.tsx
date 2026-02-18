'use client';

import { useEffect, useState } from 'react';
import {
  Film, RefreshCw, Search, Check, AlertCircle, Loader2,
  ScanLine, Zap, Shield
} from 'lucide-react';

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
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    rare: { bg: 'color-mix(in srgb, var(--error) 15%, transparent)', text: 'var(--error)', border: 'color-mix(in srgb, var(--error) 30%, transparent)' },
    moderate: { bg: 'color-mix(in srgb, var(--warning) 15%, transparent)', text: 'var(--warning)', border: 'color-mix(in srgb, var(--warning) 30%, transparent)' },
    easy: { bg: 'color-mix(in srgb, var(--success) 15%, transparent)', text: 'var(--success)', border: 'color-mix(in srgb, var(--success) 30%, transparent)' },
    unknown: { bg: 'var(--bg-elevated)', text: 'var(--text-muted)', border: 'var(--border)' },
  };
  const colors = colorMap[rarity] || colorMap.unknown;
  return (
    <span
      className="badge"
      style={{ background: colors.bg, color: colors.text, border: '1px solid ' + colors.border }}
    >
      {rarity}
    </span>
  );
}

function CodecBadge({ codec, resolution }: { codec: string | null; resolution: string | null }) {
  if (!codec) return <span className="text-xs" style={{ color: 'var(--text-dim)' }}>-</span>;
  const codecColorMap: Record<string, string> = {
    xvid: 'var(--error)',
    mpeg4: 'var(--error)',
    h264: 'var(--warning)',
    hevc: 'var(--success)',
    av1: 'var(--success)',
  };
  const color = codecColorMap[codec.toLowerCase()] || 'var(--text-muted)';
  return (
    <span className="text-xs">
      <span style={{ color }}>{codec.toUpperCase()}</span>
      {resolution && resolution !== 'unknown' && (
        <span className="ml-1" style={{ color: 'var(--text-dim)' }}>{resolution}</span>
      )}
    </span>
  );
}

function MoviesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="skeleton h-7 w-32 mb-2" />
          <div className="skeleton h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-28 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-9 w-36 rounded-[var(--radius-sm)]" />
        </div>
      </div>
      <div className="flex gap-4">
        <div className="skeleton h-9 w-64 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-9 flex-1 rounded-[var(--radius-sm)]" />
      </div>
      <div className="card overflow-hidden">
        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <div key={i} className="skeleton h-12 mx-3 my-2 rounded-[var(--radius-xs)]" />
        ))}
      </div>
    </div>
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

  if (loading) return <MoviesSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <Film size={20} style={{ color: 'var(--accent)' }} />
            <h1 className="text-xl font-bold tracking-tight">Movies</h1>
          </div>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {stats.total} movies, {stats.backupEnabled} selected for backup ({formatBytes(stats.backupSize)})
            {stats.estimatedSaved > 0 && (
              <span style={{ color: 'var(--success)' }}> | Est. savings with transcode: {formatBytes(stats.estimatedSaved)}</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={scanCodecs}
            disabled={scanning}
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm flex items-center gap-2 transition-all duration-150 disabled:opacity-50"
            style={{
              background: 'color-mix(in srgb, var(--info) 15%, transparent)',
              color: 'var(--info)',
              border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
            }}
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
            {scanning ? 'Scanning...' : 'Scan Codecs'}
          </button>
          <button
            onClick={syncFromRadarr}
            disabled={syncing}
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm flex items-center gap-2 transition-all duration-150 disabled:opacity-50"
            style={{
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing...' : 'Sync from Radarr'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div
          className="flex gap-1 p-1 rounded-[var(--radius-sm)]"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          {['all', 'rare', 'moderate', 'easy'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-[var(--radius-xs)] text-sm transition-all duration-150"
              style={{
                background: filter === f ? 'var(--bg-elevated)' : 'transparent',
                color: filter === f ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
          <input
            type="text"
            placeholder="Search movies..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Status message */}
      {transcodeMsg && (
        <div
          className="p-3 rounded-[var(--radius-sm)] text-sm flex items-center gap-2"
          style={{
            background: 'color-mix(in srgb, var(--info) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--info) 25%, transparent)',
            color: 'var(--info)',
          }}
        >
          <AlertCircle size={14} />
          {transcodeMsg}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Backup</th>
              <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Title</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Year</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rarity</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Codec</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Est. After</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Savings</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Keep Best</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Transcode</th>
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
                <tr
                  key={movie.id}
                  className="table-row"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                >
                  <td className="p-3">
                    <button
                      onClick={() => toggleBackup(movie)}
                      className="w-5 h-5 rounded-[var(--radius-xs)] flex items-center justify-center transition-all duration-150"
                      style={{
                        background: movie.backup_enabled ? 'var(--accent)' : 'transparent',
                        border: movie.backup_enabled ? '1px solid var(--accent)' : '1px solid var(--border-hover)',
                      }}
                    >
                      {movie.backup_enabled ? <Check size={12} style={{ color: 'var(--bg)' }} /> : null}
                    </button>
                  </td>
                  <td className="p-3 font-medium">{movie.title}</td>
                  <td className="p-3 text-center" style={{ color: 'var(--text-muted)' }}>{movie.year || '-'}</td>
                  <td className="p-3 text-center"><RarityBadge rarity={movie.rarity} /></td>
                  <td className="p-3 text-center"><CodecBadge codec={movie.codec} resolution={movie.resolution} /></td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(movie.size_bytes)}</td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {alreadyBest ? (
                      <span className="text-xs" style={{ color: 'var(--success)' }}>already optimal</span>
                    ) : movie.size_bytes > 0 ? (
                      formatBytes(estAfter)
                    ) : '-'}
                  </td>
                  <td className="p-3 text-right">
                    {alreadyBest ? (
                      <span style={{ color: 'var(--text-dim)' }}>-</span>
                    ) : savingsBytes > 0 ? (
                      <span style={{ color: 'var(--success)' }}>{savingsPct}% ({formatBytes(savingsBytes)})</span>
                    ) : '-'}
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleKeepBest(movie)}
                      className="w-5 h-5 rounded-[var(--radius-xs)] flex items-center justify-center mx-auto transition-all duration-150"
                      title="Skip transcoding, backup original quality"
                      style={{
                        background: movie.keep_best_quality ? 'var(--warning)' : 'transparent',
                        border: movie.keep_best_quality ? '1px solid var(--warning)' : '1px solid var(--border-hover)',
                      }}
                    >
                      {movie.keep_best_quality ? <Shield size={12} style={{ color: 'var(--bg)' }} /> : null}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => queueTranscode(movie)}
                      disabled={queuingId === movie.id || !!movie.keep_best_quality || alreadyBest}
                      className="px-2.5 py-1 rounded-[var(--radius-xs)] text-xs font-medium flex items-center gap-1.5 mx-auto transition-all duration-150 disabled:opacity-40"
                      title={alreadyBest ? 'Already in optimal codec' : 'Queue movie for transcode'}
                      style={{
                        background: (queuingId === movie.id || movie.keep_best_quality || alreadyBest)
                          ? 'var(--bg-elevated)'
                          : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: (queuingId === movie.id || movie.keep_best_quality || alreadyBest)
                          ? 'var(--text-dim)'
                          : 'var(--accent)',
                        border: (queuingId === movie.id || movie.keep_best_quality || alreadyBest)
                          ? '1px solid var(--border)'
                          : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                      }}
                    >
                      {queuingId === movie.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      {queuingId === movie.id ? '...' : 'Queue'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredMovies.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  {movies.length === 0 ? 'No movies. Click "Sync from Radarr" to import.' : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
