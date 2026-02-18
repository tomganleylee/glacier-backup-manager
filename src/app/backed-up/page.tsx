'use client';

import { useEffect, useState } from 'react';
import { Folder, FileText, ChevronRight, ArrowUp, Search, Download } from 'lucide-react';

interface BackedUpItem {
  id: number;
  path: string;
  type: string;
  size_bytes: number;
  priority: number;
  status: string;
  glacier_key: string;
  uploaded_at: string;
  created_at: string;
}

interface Stats {
  total_files: number;
  total_bytes: number;
  first_upload: string;
  last_upload: string;
}

interface FolderNode {
  name: string;
  path: string;
  files: BackedUpItem[];
  children: Record<string, FolderNode>;
  totalSize: number;
  totalFiles: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function PriorityBadge({ priority }: { priority: number }) {
  const labels: Record<number, { text: string; color: string }> = {
    0: { text: 'P0', color: 'var(--error)' },
    1: { text: 'P1', color: 'var(--warning)' },
    2: { text: 'P2', color: 'var(--info)' },
    3: { text: 'P3', color: 'var(--text-muted)' },
  };
  const { text, color } = labels[priority] || labels[3];
  return (
    <span
      className="badge"
      style={{
        color: color,
        background: `color-mix(in srgb, ${color} 15%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}

function buildFolderTree(items: BackedUpItem[]): FolderNode {
  const root: FolderNode = { name: 'Glacier', path: '', files: [], children: {}, totalSize: 0, totalFiles: 0 };

  for (const item of items) {
    const parts = item.path.split('/');
    const fileName = parts.pop() || item.path;
    let current = root;

    for (const part of parts) {
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: current.path ? current.path + '/' + part : part,
          files: [],
          children: {},
          totalSize: 0,
          totalFiles: 0,
        };
      }
      current = current.children[part];
    }

    current.files.push({ ...item, path: fileName });
    // Roll up totals
    let node: FolderNode | null = root;
    for (const part of parts) {
      if (node) node = node.children[part];
    }
    // Increment totals up the tree
    let rollup = root;
    rollup.totalSize += item.size_bytes;
    rollup.totalFiles += 1;
    for (const part of parts) {
      rollup = rollup.children[part];
      rollup.totalSize += item.size_bytes;
      rollup.totalFiles += 1;
    }
  }

  return root;
}

function getFolderAtPath(root: FolderNode, path: string): FolderNode | null {
  if (!path) return root;
  const parts = path.split('/').filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!current.children[part]) return null;
    current = current.children[part];
  }
  return current;
}

export default function BackedUpPage() {
  const [items, setItems] = useState<BackedUpItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('');
  const [search, setSearch] = useState('');
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch('/api/backup/uploaded?sort=path&order=asc');
      const data = await res.json();
      setItems(data.items || []);
      setStats(data.stats || null);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchItems(); }, []);

  const tree = buildFolderTree(items);
  const currentFolder = getFolderAtPath(tree, currentPath);

  const breadcrumbs = ['Glacier', ...currentPath.split('/').filter(Boolean)];

  function navigateTo(path: string) {
    setCurrentPath(path);
    setSearch('');
  }

  function goUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  }

  async function initiateRestore(item: BackedUpItem, fullPath: string) {
    setRestoringId(item.id);
    setMessage('');
    try {
      const glacierKey = fullPath;
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ glacier_key: glacierKey, tier: 'Bulk' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('Restore initiated for ' + fullPath + ' — estimated ready in ~48 hours (Bulk tier)');
      } else {
        setMessage('Error: ' + (data.error || 'Unknown error'));
      }
    } catch {
      setMessage('Failed to initiate restore');
    } finally {
      setRestoringId(null);
    }
  }

  // Filter files in current folder by search
  const visibleFiles = currentFolder?.files.filter(f =>
    !search || f.path.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // Sort: folders first, then files
  const subfolders = currentFolder ? Object.values(currentFolder.children).sort((a, b) => b.totalSize - a.totalSize) : [];
  const filteredFolders = subfolders.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Backed Up to Glacier</h1>
          <div className="flex items-center gap-1 text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <ChevronRight size={14} style={{ color: 'var(--text-dim)', margin: '0 2px' }} />}
                <button
                  onClick={() => {
                    if (i === 0) navigateTo('');
                    else navigateTo(currentPath.split('/').filter(Boolean).slice(0, i).join('/'));
                  }}
                  className="hover:underline"
                  style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                >
                  {crumb}
                </button>
              </span>
            ))}
          </div>
          {stats && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
              {stats.total_files} files, {formatBytes(stats.total_bytes)} total in Glacier
              {currentFolder && currentPath && (
                <span style={{ color: 'var(--success)', marginLeft: '0.5rem' }}>
                  This folder: {currentFolder.totalFiles} files, {formatBytes(currentFolder.totalSize)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 relative">
        <Search
          size={16}
          style={{ color: 'var(--text-dim)', position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          placeholder="Search in this folder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-field w-full md:w-96 px-3 py-2 text-sm"
          style={{ paddingLeft: '36px' }}
        />
      </div>

      {message && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{
            background: 'color-mix(in srgb, var(--info) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
            color: 'var(--info)',
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-full" />
          <div className="skeleton h-10 w-3/4" />
        </div>
      ) : !currentFolder ? (
        <div style={{ color: 'var(--text-muted)' }}>Folder not found</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Name</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Files</th>
                <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Priority</th>
                <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Uploaded</th>
                <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Restore</th>
              </tr>
            </thead>
            <tbody>
              {currentPath && (
                <tr
                  className="table-row cursor-pointer"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                  onClick={goUp}
                >
                  <td className="p-3 flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                    <ArrowUp size={16} />
                    <span>..</span>
                  </td>
                  <td></td><td></td><td></td><td></td><td></td>
                </tr>
              )}
              {filteredFolders.map(folder => (
                <tr
                  key={folder.path}
                  className="table-row cursor-pointer"
                  style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                  onClick={() => navigateTo(folder.path)}
                >
                  <td className="p-3 font-medium">
                    <span className="flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                      <Folder size={16} />
                      {folder.name}
                    </span>
                  </td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(folder.totalSize)}</td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-muted)' }}>{folder.totalFiles}</td>
                  <td className="p-3 text-center"></td>
                  <td className="p-3 text-right"></td>
                  <td className="p-3 text-center"></td>
                </tr>
              ))}
              {visibleFiles.map(item => {
                const fullGlacierPath = currentPath ? currentPath + '/' + item.path : item.path;
                return (
                  <tr
                    key={item.id}
                    className="table-row"
                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                  >
                    <td className="p-3" style={{ color: 'var(--text-secondary)' }}>
                      <span className="flex items-center gap-2">
                        <FileText size={16} style={{ color: 'var(--success)' }} />
                        {item.path}
                      </span>
                    </td>
                    <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(item.size_bytes)}</td>
                    <td className="p-3 text-right" style={{ color: 'var(--text-muted)' }}>-</td>
                    <td className="p-3 text-center"><PriorityBadge priority={item.priority} /></td>
                    <td className="p-3 text-right whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatDate(item.uploaded_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => initiateRestore(item, fullGlacierPath)}
                        disabled={restoringId === item.id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors"
                        style={{
                          background: restoringId === item.id
                            ? 'var(--bg-elevated)'
                            : 'color-mix(in srgb, var(--warning) 20%, transparent)',
                          color: restoringId === item.id
                            ? 'var(--text-dim)'
                            : 'var(--warning)',
                          border: `1px solid ${restoringId === item.id
                            ? 'var(--border)'
                            : 'color-mix(in srgb, var(--warning) 30%, transparent)'}`,
                          borderRadius: 'var(--radius-xs)',
                          cursor: restoringId === item.id ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Download size={12} />
                        {restoringId === item.id ? '...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredFolders.length === 0 && visibleFiles.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    {items.length === 0 ? 'No files backed up to Glacier yet.' : 'Empty folder.'}
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
