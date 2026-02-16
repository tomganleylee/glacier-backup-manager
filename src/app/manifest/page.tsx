'use client';

import { useEffect, useState } from 'react';

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Manifest</h1>
          <p className="text-gray-500 text-sm">Complete inventory of NAS content ({items.length} entries)</p>
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
                // Refresh
                const r = await fetch('/api/manifest');
                setItems(await r.json());
              } catch { setScanMessage('Scan failed'); }
              finally { setScanning(false); }
            }}
            disabled={scanning}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 rounded-lg font-medium text-sm"
          >
            {scanning ? 'Scanning...' : 'Scan NAS'}
          </button>
          <a
            href="/api/manifest/export?format=csv"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm inline-block"
          >
            Export CSV
          </a>
          <a
            href="/api/manifest/export?format=json"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm inline-block"
          >
            Export JSON
          </a>
        </div>
      </div>

      {scanMessage && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-green-950 border border-green-800 text-green-300">
          {scanMessage}
        </div>
      )}

      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name or path..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white"
        >
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading manifest...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-center">Type</th>
                <th className="p-3 text-right">Size</th>
                <th className="p-3 text-right">Files</th>
                <th className="p-3 text-center">Backed Up</th>
                <th className="p-3 text-right">Last Scanned</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                  <td className="p-3">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-gray-500 truncate max-w-md">{item.path}</div>
                  </td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">{item.type || '-'}</span>
                  </td>
                  <td className="p-3 text-right text-gray-400">{formatBytes(item.size_bytes)}</td>
                  <td className="p-3 text-right text-gray-400">{item.file_count || '-'}</td>
                  <td className="p-3 text-center">
                    {item.backed_up
                      ? <span className="text-green-400">Yes</span>
                      : <span className="text-gray-600">No</span>}
                  </td>
                  <td className="p-3 text-right text-gray-500">
                    {item.last_scanned ? new Date(item.last_scanned).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="p-8 text-center text-gray-500">
                  No manifest entries. Run a NAS scan to populate.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
