'use client';

import { useEffect, useState } from 'react';

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
  children?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function FileBrowser() {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
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

  function navigateTo(path: string) {
    setCurrentPath(path);
    setSelected(new Set());
  }

  function goUp() {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
    setSelected(new Set());
  }

  function toggleSelect(path: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function addToBackup(priority: number) {
    if (selected.size === 0) return;
    setAdding(true);
    setMessage('');
    try {
      const items = entries
        .filter(e => selected.has(e.path))
        .map(e => ({ path: e.path, type: e.type, size_bytes: e.size, priority }));
      
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items),
      });
      const data = await res.json();
      setMessage('Added ' + data.added + ' items to backup queue (priority ' + priority + ')');
      setSelected(new Set());
    } catch {
      setMessage('Failed to add items');
    } finally {
      setAdding(false);
    }
  }

  const breadcrumbs = ['NAS', ...currentPath.split('/').filter(Boolean)];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">File Browser</h1>
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
        </div>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <button onClick={() => addToBackup(0)} disabled={adding} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 rounded text-xs font-medium">Critical (P0)</button>
            <button onClick={() => addToBackup(1)} disabled={adding} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 rounded text-xs font-medium">High (P1)</button>
            <button onClick={() => addToBackup(2)} disabled={adding} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 rounded text-xs font-medium">Medium (P2)</button>
            <button onClick={() => addToBackup(3)} disabled={adding} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs font-medium">Low (P3)</button>
          </div>
        )}
      </div>

      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-green-950 border border-green-800 text-green-300">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-gray-500">Loading...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left w-8">
                  <input type="checkbox" className="rounded" onChange={e => {
                    if (e.target.checked) setSelected(new Set(entries.map(f => f.path)));
                    else setSelected(new Set());
                  }} />
                </th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-right">Items</th>
                <th className="p-3 text-right">Modified</th>
              </tr>
            </thead>
            <tbody>
              {currentPath && (
                <tr className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer" onClick={goUp}>
                  <td className="p-3"></td>
                  <td className="p-3 text-blue-400">..</td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
              {entries.map(entry => (
                <tr
                  key={entry.path}
                  className={'border-b border-gray-800/50 hover:bg-gray-800/50 ' + (selected.has(entry.path) ? 'bg-blue-950/30' : '')}
                >
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(entry.path)}
                      onChange={() => toggleSelect(entry.path)}
                      className="rounded"
                    />
                  </td>
                  <td
                    className={'p-3 cursor-pointer ' + (entry.type === 'directory' ? 'text-blue-400' : 'text-gray-300')}
                    onClick={() => entry.type === 'directory' && navigateTo(entry.path)}
                  >
                    {entry.type === 'directory' ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 '}{entry.name}
                  </td>
                  <td className="p-3 text-right text-gray-400">{entry.size > 0 ? formatBytes(entry.size) : '-'}</td>
                  <td className="p-3 text-right text-gray-500">{entry.children !== undefined ? entry.children : '-'}</td>
                  <td className="p-3 text-right text-gray-500">{new Date(entry.modified).toLocaleDateString()}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">Empty directory</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
