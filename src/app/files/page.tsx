'use client';

import { useEffect, useState } from 'react';
import {
  Folder, FileText, ChevronRight, ArrowUp, Check, AlertCircle, Clock,
  Upload, Loader2, RefreshCw
} from 'lucide-react';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  children?: number;
  backup_status: string | null;
  backup_priority: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function BackupBadge({ status, priority }: { status: string | null; priority: number | null }) {
  if (!status) return null;
  const config: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    uploaded: { icon: Check, color: 'var(--success)', label: 'Backed up' },
    uploading: { icon: Upload, color: 'var(--info)', label: 'Uploading' },
    pending: { icon: Clock, color: 'var(--warning)', label: `Queued P${priority}` },
    queued: { icon: Clock, color: 'var(--warning)', label: `Queued P${priority}` },
    failed: { icon: AlertCircle, color: 'var(--error)', label: 'Failed' },
  };
  const c = config[status] || { icon: Clock, color: 'var(--text-muted)', label: status };
  const Icon = c.icon;
  return (
    <span className="badge" style={{ background: `color-mix(in srgb, ${c.color} 12%, transparent)`, color: c.color }}>
      <Icon size={12} /> {c.label}
    </span>
  );
}

export default function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [transcoding, setTranscoding] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setLoading(true);
    fetch('/api/files?path=' + encodeURIComponent(currentPath))
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setEntries(data);
        else setEntries([]);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [currentPath]);

  function navigateTo(path: string) { setCurrentPath(path); setSelected(new Set()); }
  function goUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
    setSelected(new Set());
  }
  function toggleSelect(path: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  async function queueTranscode() {
    if (selected.size === 0) return;
    setTranscoding(true); setMessage('');
    try {
      const paths = entries.filter(e => selected.has(e.path)).map(e => e.path);
      const res = await fetch('/api/transcode/queue-folder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paths, codec_to: 'hevc' }) });
      const data = await res.json();
      if (data.success) setMessage('Queued ' + data.queued + ' video files for transcode' + (data.skipped ? ' (' + data.skipped + ' skipped)' : ''));
      else setMessage('Error: ' + (data.error || 'Unknown error'));
    } catch { setMessage('Failed to queue transcode'); }
    finally { setTranscoding(false); }
  }

  async function addToBackup(priority: number) {
    if (selected.size === 0) return;
    setAdding(true); setMessage('');
    try {
      const items = entries.filter(e => selected.has(e.path)).map(e => ({ path: e.path, type: e.type, size_bytes: e.size, priority }));
      const res = await fetch('/api/backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(items) });
      const data = await res.json();
      setMessage('Added ' + data.added + ' items to backup queue (priority ' + priority + ')');
      setSelected(new Set());
      const refreshRes = await fetch('/api/files?path=' + encodeURIComponent(currentPath));
      const refreshData = await refreshRes.json();
      if (Array.isArray(refreshData)) setEntries(refreshData);
    } catch { setMessage('Failed to add items'); }
    finally { setAdding(false); }
  }

  const totalSize = entries.reduce((sum, e) => sum + (e.size || 0), 0);
  const backedUpCount = entries.filter(e => e.backup_status === 'uploaded').length;
  const queuedCount = entries.filter(e => e.backup_status && e.backup_status !== 'uploaded').length;
  const breadcrumbs = ['NAS', ...currentPath.split('/').filter(Boolean)];
  const priorityBtns = [
    { p: 0, label: 'P0 Critical', color: 'var(--error)' },
    { p: 1, label: 'P1 High', color: '#f97316' },
    { p: 2, label: 'P2 Medium', color: 'var(--warning)' },
    { p: 3, label: 'P3 Low', color: 'var(--info)' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">File Browser</h1>
          <div className="flex items-center gap-0.5 text-sm mt-1.5">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <ChevronRight size={14} style={{ color: 'var(--text-dim)' }} className="mx-0.5" />}
                <button onClick={() => { if (i === 0) navigateTo(''); else navigateTo(currentPath.split('/').filter(Boolean).slice(0, i).join('/')); }}
                  className="hover:underline" style={{ color: i === breadcrumbs.length - 1 ? 'var(--text)' : 'var(--text-muted)' }}>{crumb}</button>
              </span>
            ))}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
            {entries.length} items, {formatBytes(totalSize)}
            {backedUpCount > 0 && <span style={{ color: 'var(--success)' }} className="ml-2">{backedUpCount} backed up</span>}
            {queuedCount > 0 && <span style={{ color: 'var(--warning)' }} className="ml-2">{queuedCount} in queue</span>}
          </p>
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-xs mr-1" style={{ color: 'var(--text-muted)' }}>{selected.size} selected</span>
            {priorityBtns.map(b => (
              <button key={b.p} onClick={() => addToBackup(b.p)} disabled={adding}
                className="px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-xs)] transition-all"
                style={{ background: `color-mix(in srgb, ${b.color} 15%, transparent)`, color: b.color, border: `1px solid color-mix(in srgb, ${b.color} 25%, transparent)` }}>
                {b.label}
              </button>
            ))}
            <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />
            <button onClick={queueTranscode} disabled={transcoding}
              className="px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-xs)] transition-all flex items-center gap-1.5"
              style={{ background: 'color-mix(in srgb, #a855f7 15%, transparent)', color: '#a855f7', border: '1px solid color-mix(in srgb, #a855f7 25%, transparent)' }}>
              {transcoding ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {transcoding ? 'Queuing...' : 'Transcode'}
            </button>
          </div>
        )}
      </div>

      {message && (
        <div className="p-3 rounded-[var(--radius-sm)] text-sm" style={{ background: 'color-mix(in srgb, var(--success) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)', color: 'var(--success)' }}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="skeleton h-12 rounded-[var(--radius-sm)]" />)}</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="p-3 text-left w-8">
                  <input type="checkbox" className="rounded accent-[var(--accent)]" onChange={e => {
                    if (e.target.checked) setSelected(new Set(entries.map(f => f.path)));
                    else setSelected(new Set());
                  }} />
                </th>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Items</th>
                <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Backup</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Modified</th>
              </tr>
            </thead>
            <tbody>
              {currentPath && (
                <tr className="table-row cursor-pointer" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }} onClick={goUp}>
                  <td className="p-3" /><td className="p-3"><span className="flex items-center gap-2" style={{ color: 'var(--accent)' }}><ArrowUp size={16} /> ..</span></td>
                  <td /><td /><td /><td />
                </tr>
              )}
              {entries.map(entry => (
                <tr key={entry.path} className="table-row"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)', background: selected.has(entry.path) ? 'color-mix(in srgb, var(--accent) 5%, transparent)' : undefined }}>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(entry.path)} onChange={() => toggleSelect(entry.path)} className="rounded accent-[var(--accent)]" />
                  </td>
                  <td className="p-3 cursor-pointer" onClick={() => entry.type === 'directory' && navigateTo(entry.path)}>
                    <span className="flex items-center gap-2" style={{ color: entry.type === 'directory' ? 'var(--accent)' : 'var(--text-secondary)' }}>
                      {entry.type === 'directory' ? <Folder size={16} /> : <FileText size={16} />}
                      <span className={entry.type === 'directory' ? 'font-medium' : ''}>{entry.name}</span>
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{entry.size > 0 ? formatBytes(entry.size) : '-'}</td>
                  <td className="p-3 text-right text-xs" style={{ color: 'var(--text-dim)' }}>{entry.children !== undefined ? entry.children : '-'}</td>
                  <td className="p-3 text-center"><BackupBadge status={entry.backup_status} priority={entry.backup_priority} /></td>
                  <td className="p-3 text-right text-xs" style={{ color: 'var(--text-dim)' }}>{new Date(entry.modified).toLocaleDateString()}</td>
                </tr>
              ))}
              {entries.length === 0 && <tr><td colSpan={6} className="p-12 text-center" style={{ color: 'var(--text-dim)' }}>Empty directory</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
