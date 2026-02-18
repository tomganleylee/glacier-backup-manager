'use client';

import { useEffect, useState } from 'react';
import { Tv, RefreshCw, Search, Check, AlertCircle, Loader2, ScanLine, Zap } from 'lucide-react';

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
  if (!codec) return 0.40; // conservative default
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
  const colorMap: Record<string, string> = {
    rare: 'var(--error)',
    moderate: 'var(--warning)',
    easy: 'var(--success)',
    unknown: 'var(--text-muted)',
  };
  const color = colorMap[rarity] || colorMap.unknown;
  return (
    <span
      className="badge"
      style={{
        color: color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
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

function ShowsSkeleton() {
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
      <div className="skeleton h-96 rounded-[var(--radius)]" />
    </div>
  );
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [transcodeMsg, setTranscodeMsg] = useState('');
  const [queuingId, setQueuingId] = useState<number | null>(null);

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

  async function scanCodecs() {
    setScanning(true);
    setTranscodeMsg('');
    try {
      const res = await fetch('/api/shows/scan-codecs', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTranscodeMsg('Scanned ' + data.scanned + ' shows, updated ' + data.updated + ' codecs');
        await fetchShows();
      } else {
        setTranscodeMsg('Error: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setTranscodeMsg('Codec scan failed');
    } finally { setScanning(false); }
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

  async function queueTranscode(show: Show) {
    setQueuingId(show.id);
    setTranscodeMsg('');
    try {
      const res = await fetch('/api/shows/' + show.id + '/transcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setTranscodeMsg(show.title + ': ' + data.queued + ' episodes queued for transcode' + (data.skipped ? ' (' + data.skipped + ' skipped)' : ''));
      } else {
        setTranscodeMsg('Error: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setTranscodeMsg('Failed to queue transcode for ' + show.title);
    } finally {
      setQueuingId(null);
    }
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
    estimatedSaved: shows.reduce((sum, s) => sum + (s.size_bytes * estimateSavings(s.codec)), 0),
  };

  if (loading) return <ShowsSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Tv size={20} style={{ color: 'var(--accent)' }} />
            <h1 className="text-xl font-bold tracking-tight">Shows</h1>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {stats.total} shows, {stats.backupEnabled} selected for backup ({formatBytes(stats.backupSize)})
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
            onClick={syncFromSonarr}
            disabled={syncing}
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm flex items-center gap-2 transition-all duration-150 disabled:opacity-50"
            style={{
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {syncing ? 'Syncing...' : 'Sync from Sonarr'}
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
              className="px-3 py-1.5 rounded-[var(--radius-xs)] text-sm font-medium transition-all duration-150"
              style={{
                background: filter === f ? 'var(--bg-elevated)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-dim)' }}
          />
          <input
            type="text"
            placeholder="Search shows..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Transcode message */}
      {transcodeMsg && (
        <div
          className="flex items-center gap-2 p-3 rounded-[var(--radius-sm)] text-sm"
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
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Rarity</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Codec</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Est. After</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Savings</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Episodes</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Keep Best</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Transcode</th>
            </tr>
          </thead>
          <tbody>
            {filteredShows.map(show => {
              const reduction = estimateSavings(show.codec);
              const estAfter = show.size_bytes * (1 - reduction);
              const savingsBytes = show.size_bytes * reduction;
              const savingsPct = Math.round(reduction * 100);
              const alreadyBest = show.codec === 'hevc' || show.codec === 'av1';
              return (
                <tr
                  key={show.id}
                  className="table-row"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!show.backup_enabled}
                      onChange={() => toggleBackup(show)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-medium" style={{ color: 'var(--text)' }}>{show.title}</td>
                  <td className="p-3 text-center"><RarityBadge rarity={show.rarity} /></td>
                  <td className="p-3 text-center"><CodecBadge codec={show.codec} resolution={show.resolution} /></td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(show.size_bytes)}</td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>
                    {alreadyBest ? (
                      <span className="text-xs flex items-center justify-end gap-1" style={{ color: 'var(--success)' }}>
                        <Check size={12} />
                        optimal
                      </span>
                    ) : show.size_bytes > 0 ? (
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
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{show.episode_count}</td>
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={!!show.keep_best_quality}
                      onChange={() => toggleKeepBest(show)}
                      className="rounded"
                      title="Skip transcoding, backup original quality"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => queueTranscode(show)}
                      disabled={queuingId === show.id || !!show.keep_best_quality || alreadyBest}
                      className="px-2 py-1 rounded-[var(--radius-xs)] text-xs font-medium flex items-center gap-1 mx-auto transition-all duration-150 disabled:opacity-40"
                      style={{
                        background: (queuingId === show.id || !!show.keep_best_quality || alreadyBest)
                          ? 'color-mix(in srgb, var(--text-dim) 15%, transparent)'
                          : 'color-mix(in srgb, var(--accent) 15%, transparent)',
                        color: (queuingId === show.id || !!show.keep_best_quality || alreadyBest)
                          ? 'var(--text-dim)'
                          : 'var(--accent)',
                        border: `1px solid ${(queuingId === show.id || !!show.keep_best_quality || alreadyBest)
                          ? 'color-mix(in srgb, var(--text-dim) 20%, transparent)'
                          : 'color-mix(in srgb, var(--accent) 30%, transparent)'}`,
                      }}
                      title={alreadyBest ? 'Already in optimal codec' : 'Queue all episodes for transcode'}
                    >
                      {queuingId === show.id ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      {queuingId === show.id ? '...' : 'Queue'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredShows.length === 0 && (
              <tr>
                <td colSpan={10} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  {shows.length === 0 ? 'No shows. Click "Sync from Sonarr" to import.' : 'No matches.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
