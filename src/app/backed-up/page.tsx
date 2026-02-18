'use client';

import { useEffect, useState } from 'react';

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
    0: { text: 'P0', color: 'bg-red-900 text-red-300 border-red-700' },
    1: { text: 'P1', color: 'bg-orange-900 text-orange-300 border-orange-700' },
    2: { text: 'P2', color: 'bg-yellow-900 text-yellow-300 border-yellow-700' },
    3: { text: 'P3', color: 'bg-gray-800 text-gray-400 border-gray-700' },
  };
  const { text, color } = labels[priority] || labels[3];
  return <span className={'px-1.5 py-0.5 rounded text-xs font-medium border ' + color}>{text}</span>;
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
          <h1 className="text-2xl font-bold">Backed Up to Glacier</h1>
          <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            {breadcrumbs.map((crumb, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1">/</span>}
                <button
                  onClick={() => {
                    if (i === 0) navigateTo('');
                    else navigateTo(currentPath.split('/').filter(Boolean).slice(0, i).join('/'));
                  }}
                  className="hover:text-blue-400"
                >
                  {crumb}
                </button>
              </span>
            ))}
          </div>
          {stats && (
            <p className="text-xs text-gray-600 mt-1">
              {stats.total_files} files, {formatBytes(stats.total_bytes)} total in Glacier
              {currentFolder && currentPath && (
                <span className="text-green-500 ml-2">
                  This folder: {currentFolder.totalFiles} files, {formatBytes(currentFolder.totalSize)}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search in this folder..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full md:w-96 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-950 border border-blue-800 text-blue-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading backed up items...</div>
      ) : !currentFolder ? (
        <div className="text-gray-500">Folder not found</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-right">Files</th>
                <th className="p-3 text-center">Priority</th>
                <th className="p-3 text-right">Uploaded</th>
                <th className="p-3 text-center">Restore</th>
              </tr>
            </thead>
            <tbody>
              {currentPath && (
                <tr className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer" onClick={goUp}>
                  <td className="p-3 text-blue-400">{'\uD83D\uDCC1'} ..</td>
                  <td></td><td></td><td></td><td></td><td></td>
                </tr>
              )}
              {filteredFolders.map(folder => (
                <tr
                  key={folder.path}
                  className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer"
                  onClick={() => navigateTo(folder.path)}
                >
                  <td className="p-3 text-blue-400 font-medium">{'\uD83D\uDCC1'} {folder.name}</td>
                  <td className="p-3 text-right text-gray-400">{formatBytes(folder.totalSize)}</td>
                  <td className="p-3 text-right text-gray-500">{folder.totalFiles}</td>
                  <td className="p-3 text-center"></td>
                  <td className="p-3 text-right"></td>
                  <td className="p-3 text-center"></td>
                </tr>
              ))}
              {visibleFiles.map(item => {
                const fullGlacierPath = currentPath ? currentPath + '/' + item.path : item.path;
                return (
                  <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="p-3 text-gray-300">
                      <span className="text-green-400">{'\u2705'}</span> {item.path}
                    </td>
                    <td className="p-3 text-right text-gray-400">{formatBytes(item.size_bytes)}</td>
                    <td className="p-3 text-right text-gray-500">-</td>
                    <td className="p-3 text-center"><PriorityBadge priority={item.priority} /></td>
                    <td className="p-3 text-right text-gray-400 whitespace-nowrap">{formatDate(item.uploaded_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => initiateRestore(item, fullGlacierPath)}
                        disabled={restoringId === item.id}
                        className="px-2 py-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:text-gray-500 rounded text-xs font-medium"
                      >
                        {restoringId === item.id ? '...' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredFolders.length === 0 && visibleFiles.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                  {items.length === 0 ? 'No files backed up to Glacier yet.' : 'Empty folder.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
