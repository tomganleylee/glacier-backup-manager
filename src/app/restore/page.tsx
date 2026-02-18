'use client';

import { useEffect, useState } from 'react';
import {
  Download, Clock, Check, AlertCircle, DollarSign, Loader2,
  Trash2, RefreshCw, Hourglass, CloudOff, ArrowDown
} from 'lucide-react';

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
  const config: Record<string, { color: string; icon: React.ElementType }> = {
    pending: { color: 'var(--text-muted)', icon: Clock },
    restoring: { color: 'var(--info)', icon: Loader2 },
    ready: { color: 'var(--success)', icon: Check },
    downloading: { color: 'var(--accent)', icon: ArrowDown },
    downloaded: { color: 'var(--success)', icon: Check },
    expired: { color: 'var(--warning)', icon: CloudOff },
    failed: { color: 'var(--error)', icon: AlertCircle },
  };
  const { color, icon: Icon } = config[status] || config.pending;
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color: color,
      }}
    >
      <Icon size={12} /> {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const isStandard = tier === 'Standard';
  const color = isStandard ? 'var(--warning)' : 'var(--text-muted)';
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color: color,
      }}
    >
      {tier}
    </span>
  );
}

function RestoreSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton h-7 w-52 mb-2" />
        <div className="skeleton h-4 w-80" />
      </div>
      <div className="skeleton h-40 rounded-[var(--radius)]" />
      <div>
        <div className="skeleton h-6 w-36 mb-3" />
        <div className="skeleton h-32 rounded-[var(--radius)]" />
      </div>
    </div>
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

  if (loading) return <RestoreSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">Restore from Glacier</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Restore files from AWS Glacier Deep Archive back to your NAS
        </p>
      </div>

      {/* How it works */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold">How Glacier Restore Works</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--info) 15%, transparent)' }}>
                <RefreshCw size={14} style={{ color: 'var(--info)' }} />
              </div>
              <span className="font-medium" style={{ color: 'var(--accent)' }}>1. Request</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Initiate a restore from the Backed Up page. Choose Bulk (48h, cheap) or Standard (12h, faster).</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--info) 15%, transparent)' }}>
                <Hourglass size={14} style={{ color: 'var(--info)' }} />
              </div>
              <span className="font-medium" style={{ color: 'var(--accent)' }}>2. Wait</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>AWS defrosts your data from deep storage. Bulk takes up to 48 hours, Standard up to 12 hours.</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
                <ArrowDown size={14} style={{ color: 'var(--success)' }} />
              </div>
              <span className="font-medium" style={{ color: 'var(--accent)' }}>3. Download</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Once ready, download the file back to your NAS. The restored copy is available for 7 days.</p>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-[var(--radius-xs)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)' }}>
                <DollarSign size={14} style={{ color: 'var(--warning)' }} />
              </div>
              <span className="font-medium" style={{ color: 'var(--accent)' }}>4. Costs</span>
            </div>
            <p style={{ color: 'var(--text-secondary)' }}>Bulk: <span style={{ color: 'var(--warning)' }}>$0.0025/GB</span>, Standard: <span style={{ color: 'var(--warning)' }}>$0.02/GB</span>, plus data transfer out at ~$0.09/GB.</p>
          </div>
        </div>
      </div>

      {/* Cost summary for active restores */}
      {restoreCost > 0 && (
        <div
          className="card p-4 text-sm flex items-center gap-3"
          style={{ borderColor: 'color-mix(in srgb, var(--warning) 30%, transparent)' }}
        >
          <DollarSign size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            Estimated restore cost for active jobs:{' '}
            <span className="font-semibold font-mono" style={{ color: 'var(--warning)' }}>
              ${restoreCost.toFixed(2)}
            </span>
            {' '}(plus ~
            <span className="font-semibold font-mono" style={{ color: 'var(--warning)' }}>
              ${(jobs.filter(j => j.status === 'restoring' || j.status === 'ready').reduce((s, j) => s + j.size_bytes, 0) / 1073741824 * 0.09).toFixed(2)}
            </span>
            {' '}data transfer)
          </span>
        </div>
      )}

      {message && (
        <div
          className="card p-3 text-sm flex items-center gap-2"
          style={{ borderColor: 'color-mix(in srgb, var(--info) 30%, transparent)' }}
        >
          <AlertCircle size={14} style={{ color: 'var(--info)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>{message}</span>
        </div>
      )}

      {/* Active restore jobs */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Active Restores</h2>
        {activeJobs.length === 0 ? (
          <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            No active restore jobs. Go to the Backed Up page to initiate a restore.
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>File</th>
                  <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Tier</th>
                  <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                  <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
                  <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Requested</th>
                  <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>ETA</th>
                  <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activeJobs.map(job => (
                  <tr
                    key={job.id}
                    className="table-row"
                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                  >
                    <td className="p-3 font-medium max-w-xs truncate" title={job.file_path}>{job.file_path}</td>
                    <td className="p-3 text-center"><TierBadge tier={job.tier} /></td>
                    <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                    <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(job.size_bytes)}</td>
                    <td className="p-3 text-right whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{formatDate(job.requested_at)}</td>
                    <td className="p-3 text-right whitespace-nowrap font-medium" style={{ color: 'var(--accent)' }}>{timeUntil(job.ready_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteJob(job)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-xs)] text-xs font-medium transition-all duration-150"
                        style={{
                          background: 'color-mix(in srgb, var(--error) 15%, transparent)',
                          color: 'var(--error)',
                          border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)',
                        }}
                      >
                        <Trash2 size={12} />
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
          <h2 className="text-sm font-semibold mb-3">History</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>File</th>
                  <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
                  <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Size</th>
                  <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Requested</th>
                  <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {completedJobs.map(job => (
                  <tr
                    key={job.id}
                    className="table-row"
                    style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 50%, transparent)' }}
                  >
                    <td className="p-3 max-w-xs truncate" style={{ color: 'var(--text-secondary)' }} title={job.file_path}>{job.file_path}</td>
                    <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                    <td className="p-3 text-right" style={{ color: 'var(--text-muted)' }}>{formatBytes(job.size_bytes)}</td>
                    <td className="p-3 text-right whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatDate(job.requested_at)}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteJob(job)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-xs)] text-xs font-medium transition-all duration-150"
                        style={{
                          background: 'color-mix(in srgb, var(--text-muted) 10%, transparent)',
                          color: 'var(--text-muted)',
                          border: '1px solid color-mix(in srgb, var(--text-muted) 20%, transparent)',
                        }}
                      >
                        <Trash2 size={12} />
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
