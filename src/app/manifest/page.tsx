'use client';

import { useEffect, useState } from 'react';
import {
  ClipboardList, Search, RefreshCw, Download, Loader2, Check, X,
  FileText, Folder
} from 'lucide-react';

interface ManifestItem {
  id: number;
  path: string;
  name: string;
  type: string;
  size_bytes: number;
  file_count: number;
  backed_up: number;
  last_scanned: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function TypeBadge({ type }: { type: string }) {
  const colorMap: Record<string, string> = {
    series: 'var(--info)',
    film: 'var(--warning)',
    photo: 'var(--success)',
    document: 'var(--accent)',
    music: '#a855f7',
  };
  const color = colorMap[type] || 'var(--text-muted)';
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        color: color,
      }}
    >
      {type || '-'}
    </span>
  );
}

function ManifestSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="skeleton h-7 w-32 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-28 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-9 w-28 rounded-[var(--radius-sm)]" />
          <div className="skeleton h-9 w-28 rounded-[var(--radius-sm)]" />
        </div>
      </div>
      <div className="flex gap-4">
        <div className="skeleton h-9 flex-1 rounded-[var(--radius-sm)]" />
        <div className="skeleton h-9 w-36 rounded-[var(--radius-sm)]" />
      </div>
      <div className="skeleton h-96 rounded-[var(--radius)]" />
    </div>
  );
}

export default function ManifestPage() {
  const [items, setItems] = useState<ManifestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (typeFilter) params.set('type', typeFilter);

    const timeout = setTimeout(() => {
      setLoading(true);
      fetch('/api/manifest?' + params.toString())
        .then(r => r.json())
        .then(data => setItems(Array.isArray(data) ? data : []))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(timeout);
  }, [search, typeFilter]);

  const types = Array.from(new Set(items.map(i => i.type).filter(Boolean)));

  const totalSize = items.reduce((sum, i) => sum + i.size_bytes, 0);
  const backedUpCount = items.filter(i => i.backed_up).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList size={20} style={{ color: 'var(--accent)' }} />
            <h1 className="text-xl font-bold tracking-tight">Manifest</h1>
          </div>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Complete inventory of NAS content — {items.length} entries, {formatBytes(totalSize)}
            {backedUpCount > 0 && (
              <span style={{ color: 'var(--success)' }}> — {backedUpCount} backed up</span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              setScanning(true);
              setScanMessage('');
              try {
                const res = await fetch('/api/manifest/scan', { method: 'POST' });
                const data = await res.json();
                setScanMessage(data.success ? `Scanned ${data.scanned} items` : data.error);
                const r = await fetch('/api/manifest');
                setItems(await r.json());
              } catch { setScanMessage('Scan failed'); }
              finally { setScanning(false); }
            }}
            disabled={scanning}
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm flex items-center gap-2 transition-all duration-150 disabled:opacity-50"
            style={{
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              color: 'var(--accent)',
              border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
            }}
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {scanning ? 'Scanning...' : 'Scan NAS'}
          </button>
          <a
            href="/api/manifest/export?format=csv"
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm inline-flex items-center gap-2 transition-all duration-150"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <Download size={14} />
            CSV
          </a>
          <a
            href="/api/manifest/export?format=json"
            className="px-4 py-2 rounded-[var(--radius-sm)] font-medium text-sm inline-flex items-center gap-2 transition-all duration-150"
            style={{
              background: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
            }}
          >
            <Download size={14} />
            JSON
          </a>
        </div>
      </div>

      {/* Scan message */}
      {scanMessage && (
        <div
          className="p-3 rounded-[var(--radius-sm)] text-sm flex items-center gap-2"
          style={{
            background: 'color-mix(in srgb, var(--success) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 25%, transparent)',
            color: 'var(--success)',
          }}
        >
          <Check size={14} />
          {scanMessage}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-dim)' }}
          />
          <input
            type="text"
            placeholder="Search by name or path..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field w-full pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="input-field px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <ManifestSkeleton />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Type</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Files</th>
                <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Backed Up</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr
                  key={item.id}
                  className="table-row"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {item.file_count > 0
                        ? <Folder size={14} style={{ color: 'var(--accent)' }} />
                        : <FileText size={14} style={{ color: 'var(--text-muted)' }} />
                      }
                      <div>
                        <div className="font-medium" style={{ color: 'var(--text)' }}>{item.name}</div>
                        <div className="text-xs truncate max-w-md" style={{ color: 'var(--text-dim)' }}>{item.path}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-center"><TypeBadge type={item.type} /></td>
                  <td className="p-3 text-right font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{formatBytes(item.size_bytes)}</td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-muted)' }}>{item.file_count || '-'}</td>
                  <td className="p-3 text-center">
                    {item.backed_up
                      ? <Check size={14} style={{ color: 'var(--success)', margin: '0 auto' }} />
                      : <X size={14} style={{ color: 'var(--text-dim)', margin: '0 auto' }} />
                    }
                  </td>
                  <td className="p-3 text-right text-xs" style={{ color: 'var(--text-dim)' }}>
                    {item.last_scanned ? new Date(item.last_scanned).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    No manifest entries. Run a NAS scan to populate.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
