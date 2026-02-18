'use client';

import { useEffect, useState } from 'react';

interface RestoreJob {
  id: number;
  glacier_key: string;
  file_path: string;
  size_bytes: number;
  tier: string;
  status: string;
  requested_at: string;
  ready_at: string | null;
  downloaded_at: string | null;
  expires_at: string | null;
  download_path: string | null;
  error: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function timeUntil(dateStr: string | null): string {
  if (!dateStr) return '-';
  const target = new Date(dateStr.includes('T') ? dateStr : dateStr + 'Z');
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'Ready now';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return hours + 'h ' + mins + 'm';
  return mins + 'm';
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-gray-800 text-gray-400 border-gray-700',
    restoring: 'bg-blue-900 text-blue-300 border-blue-700',
    ready: 'bg-green-900 text-green-300 border-green-700',
    downloading: 'bg-purple-900 text-purple-300 border-purple-700',
    downloaded: 'bg-green-900 text-green-300 border-green-700',
    expired: 'bg-yellow-900 text-yellow-300 border-yellow-700',
    failed: 'bg-red-900 text-red-300 border-red-700',
  };
  return (
    <span className={'px-2 py-0.5 rounded text-xs font-medium border ' + (colors[status] || colors.pending)}>
      {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const isStandard = tier === 'Standard';
  return (
    <span className={'px-2 py-0.5 rounded text-xs font-medium border ' +
      (isStandard ? 'bg-orange-900 text-orange-300 border-orange-700' : 'bg-gray-800 text-gray-400 border-gray-700')}>
      {tier}
    </span>
  );
}

export default function RestorePage() {
  const [jobs, setJobs] = useState<RestoreJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function fetchJobs() {
    setLoading(true);
    try {
      const res = await fetch('/api/restore');
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchJobs(); }, []);

  async function deleteJob(job: RestoreJob) {
    if (!confirm('Remove restore job for ' + job.file_path + '?')) return;
    try {
      await fetch('/api/restore?id=' + job.id, { method: 'DELETE' });
      setJobs(prev => prev.filter(j => j.id !== job.id));
      setMessage('Removed restore job #' + job.id);
    } catch {
      setMessage('Failed to remove job');
    }
  }

  const activeJobs = jobs.filter(j => ['pending', 'restoring', 'ready'].includes(j.status));
  const completedJobs = jobs.filter(j => !['pending', 'restoring', 'ready'].includes(j.status));

  // Cost estimate for restoring jobs
  const restoreCost = jobs
    .filter(j => ['restoring', 'ready'].includes(j.status))
    .reduce((sum, j) => {
      const perGB = j.tier === 'Standard' ? 0.02 : 0.0025;
      return sum + (j.size_bytes / 1073741824) * perGB;
    }, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Restore from Glacier</h1>
        <p className="text-gray-500 text-sm mt-1">
          Restore files from AWS Glacier Deep Archive back to your NAS
        </p>
      </div>

      {/* How it works */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h2 className="text-lg font-semibold mb-3">How Glacier Restore Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-blue-400 font-medium mb-1">1. Request</div>
            <p className="text-gray-400">Initiate a restore from the Backed Up page. Choose Bulk (48h, cheap) or Standard (12h, faster).</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-blue-400 font-medium mb-1">2. Wait</div>
            <p className="text-gray-400">AWS defrosts your data from deep storage. Bulk takes up to 48 hours, Standard up to 12 hours.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-blue-400 font-medium mb-1">3. Download</div>
            <p className="text-gray-400">Once ready, download the file back to your NAS. The restored copy is available for 7 days.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="text-blue-400 font-medium mb-1">4. Costs</div>
            <p className="text-gray-400">Bulk: $0.0025/GB, Standard: $0.02/GB, plus data transfer out at ~$0.09/GB.</p>
          </div>
        </div>
      </div>

      {/* Cost summary for active restores */}
      {restoreCost > 0 && (
        <div className="bg-orange-950 border border-orange-800 rounded-lg p-3 mb-6 text-sm text-orange-300">
          Estimated restore cost for active jobs: ${restoreCost.toFixed(2)} (plus ~${(jobs.filter(j => j.status === 'restoring' || j.status === 'ready').reduce((s, j) => s + j.size_bytes, 0) / 1073741824 * 0.09).toFixed(2)} data transfer)
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 rounded-lg text-sm bg-blue-950 border border-blue-800 text-blue-300">
          {message}
        </div>
      )}

      {/* Active restore jobs */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Active Restores</h2>
        {loading ? (
          <div className="text-gray-500">Loading...</div>
        ) : activeJobs.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center text-gray-500">
            No active restore jobs. Go to the Backed Up page to initiate a restore.
          </div>
        ) : (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="p-3 text-left">File</th>
                  <th className="p-3 text-center">Tier</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Size</th>
                  <th className="p-3 text-right">Requested</th>
                  <th className="p-3 text-right">ETA</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeJobs.map(job => (
                  <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="p-3 font-medium max-w-xs truncate" title={job.file_path}>{job.file_path}</td>
                    <td className="p-3 text-center"><TierBadge tier={job.tier} /></td>
                    <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                    <td className="p-3 text-right text-gray-400">{formatBytes(job.size_bytes)}</td>
                    <td className="p-3 text-right text-gray-400 whitespace-nowrap">{formatDate(job.requested_at)}</td>
                    <td className="p-3 text-right text-blue-400 whitespace-nowrap">{timeUntil(job.ready_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteJob(job)}
                        className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Completed/expired restores */}
      {completedJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">History</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400">
                  <th className="p-3 text-left">File</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Size</th>
                  <th className="p-3 text-right">Requested</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedJobs.map(job => (
                  <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="p-3 text-gray-400 max-w-xs truncate" title={job.file_path}>{job.file_path}</td>
                    <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                    <td className="p-3 text-right text-gray-500">{formatBytes(job.size_bytes)}</td>
                    <td className="p-3 text-right text-gray-500 whitespace-nowrap">{formatDate(job.requested_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteJob(job)}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
