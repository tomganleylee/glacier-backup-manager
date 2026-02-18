'use client';

import { useEffect, useState } from 'react';
import {
  Database, Upload, Clock, AlertTriangle, Activity, DollarSign,
  Gauge, ArrowUpRight, Timer
} from 'lucide-react';

interface LiveUpload {
  currentFile: string;
  speed: string;
  percentage: number;
  eta: string;
  startedAt: number;
}

interface SpeedSample {
  time: number;
  bytesPerSec: number;
}

interface Stats {
  totalItems: number;
  uploaded: number;
  pending: number;
  failed: number;
  uploading: number;
  totalBytes: number;
  uploadedBytes: number;
  todayBytes: number;
  todayFiles: number;
  liveUpload: LiveUpload | null;
  speedHistory: SpeedSample[];
}

interface SchedulerStatus {
  enabled: boolean;
  active: boolean;
  withinWindow: boolean;
  startHour: number;
  endHour: number;
  bandwidthLimit: number;
}

interface CostData {
  totalStoredBytes: number;
  pendingBytes: number;
  monthlyCostUsd: number;
  yearlyCostUsd: number;
  estimatedPutCostUsd: number;
  avgBytesPerDay: number;
  etaDays: number | null;
  etaDate: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbps < 0.1) return mbps.toFixed(2) + ' Mbps';
  if (mbps < 10) return mbps.toFixed(1) + ' Mbps';
  return mbps.toFixed(0) + ' Mbps';
}

function StatCard({ label, value, subtext, icon: Icon, accent }: {
  label: string; value: string | number; subtext?: string; icon: React.ElementType; accent?: string;
}) {
  const accentColor = accent || 'var(--accent)';
  return (
    <div className="stat-card group">
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${accentColor} 15%, transparent)` }}>
          <Icon size={18} style={{ color: accentColor }} />
        </div>
        {subtext && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtext}</span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function SpeedGraph({ samples }: { samples: SpeedSample[] }) {
  if (samples.length < 2) return null;

  const W = 600, H = 160, PAD_L = 60, PAD_R = 10, PAD_T = 10, PAD_B = 30;
  const gw = W - PAD_L - PAD_R;
  const gh = H - PAD_T - PAD_B;

  const maxSpeed = Math.max(...samples.map(s => s.bytesPerSec), 1);
  const niceMax = (() => {
    const mag = Math.pow(10, Math.floor(Math.log10(maxSpeed)));
    return Math.ceil(maxSpeed / mag) * mag;
  })();

  const minTime = samples[0].time;
  const maxTime = samples[samples.length - 1].time;
  const timeRange = Math.max(maxTime - minTime, 1);

  const points = samples.map(s => ({
    x: PAD_L + ((s.time - minTime) / timeRange) * gw,
    y: PAD_T + gh - (s.bytesPerSec / niceMax) * gh,
  }));

  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  const areaPath = linePath + ` L${points[points.length-1].x},${PAD_T + gh} L${points[0].x},${PAD_T + gh} Z`;

  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: niceMax * f,
    y: PAD_T + gh - f * gh,
  }));

  const elapsed = (maxTime - minTime) / 1000;
  const timeLabel = elapsed < 60 ? `${Math.round(elapsed)}s ago` : `${Math.round(elapsed / 60)}m ago`;
  const currentSpeed = samples[samples.length - 1].bytesPerSec;
  const avgSpeed = samples.reduce((sum, s) => sum + s.bytesPerSec, 0) / samples.length;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity size={18} style={{ color: 'var(--accent-secondary)' }} />
          <h2 className="text-sm font-semibold">Upload Speed</h2>
        </div>
        <div className="flex gap-5 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Current: <span className="font-semibold" style={{ color: 'var(--success)' }}>{formatSpeed(currentSpeed)}</span></span>
          <span style={{ color: 'var(--text-muted)' }}>Avg: <span className="font-semibold" style={{ color: 'var(--info)' }}>{formatSpeed(avgSpeed)}</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '200px' }}>
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={l.y} x2={W - PAD_R} y2={l.y} stroke="var(--border)" strokeWidth={0.5} />
            <text x={PAD_L - 6} y={l.y + 4} textAnchor="end" fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)">
              {formatSpeed(l.value)}
            </text>
          </g>
        ))}
        <defs>
          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#speedGrad)" />
        <path d={linePath} fill="none" stroke="var(--success)" strokeWidth={2} />
        <text x={PAD_L} y={H - 5} fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)">{timeLabel}</text>
        <text x={W - PAD_R} y={H - 5} textAnchor="end" fill="var(--text-dim)" fontSize="10" fontFamily="var(--font-mono)">now</text>
      </svg>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div><div className="skeleton h-7 w-40 mb-2" /><div className="skeleton h-4 w-64" /></div>
        <div className="skeleton h-9 w-36 rounded-[var(--radius-sm)]" />
      </div>
      <div><div className="skeleton h-3 w-full rounded-full" /></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="skeleton h-28 rounded-[var(--radius)]" />)}
      </div>
      <div className="skeleton h-48 rounded-[var(--radius)]" />
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [costs, setCosts] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const [statusRes, costsRes] = await Promise.all([
          fetch('/api/backup/status'),
          fetch('/api/backup/costs'),
        ]);
        const statusData = await statusRes.json();
        const costsData = await costsRes.json();
        setStats(statusData.stats);
        setScheduler(statusData.scheduler);
        setCosts(costsData);
      } catch (err) {
        console.error('Failed to fetch status:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, stats?.liveUpload ? 3000 : 10000);
    return () => clearInterval(interval);
  }, [stats?.liveUpload]);

  async function toggleScheduler() {
    if (!scheduler) return;
    const action = scheduler.enabled ? 'stop' : 'start';
    await fetch('/api/scheduler', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const res = await fetch('/api/backup/status');
    const data = await res.json();
    setStats(data.stats);
    setScheduler(data.scheduler);
  }

  if (loading) return <DashboardSkeleton />;

  const progress = stats && stats.totalBytes > 0
    ? Math.round((stats.uploadedBytes / stats.totalBytes) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Glacier Deep Archive backup status</p>
        </div>
        <button
          onClick={toggleScheduler}
          className="px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all duration-150"
          style={{
            background: scheduler?.enabled ? 'color-mix(in srgb, var(--error) 15%, transparent)' : 'color-mix(in srgb, var(--success) 15%, transparent)',
            color: scheduler?.enabled ? 'var(--error)' : 'var(--success)',
            border: `1px solid ${scheduler?.enabled ? 'color-mix(in srgb, var(--error) 30%, transparent)' : 'color-mix(in srgb, var(--success) 30%, transparent)'}`,
          }}
        >
          {scheduler?.enabled ? 'Stop Scheduler' : 'Start Scheduler'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="card p-5">
        <div className="flex justify-between text-sm mb-3">
          <span style={{ color: 'var(--text-secondary)' }}>Overall Progress</span>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>{progress}%</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
          <div
            className="h-full rounded-full transition-all duration-700 relative"
            style={{ width: progress + '%', background: 'var(--gradient-accent)' }}
          >
            {stats?.liveUpload && <div className="absolute inset-0 progress-shimmer" />}
          </div>
        </div>
        <div className="flex justify-between text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
          <span>{stats ? formatBytes(stats.uploadedBytes) : '0'} uploaded</span>
          <span>{stats ? formatBytes(stats.totalBytes) : '0'} total</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Items" value={stats?.totalItems || 0} icon={Database} />
        <StatCard label="Uploaded" value={stats?.uploaded || 0} subtext={stats ? formatBytes(stats.uploadedBytes) : ''} icon={Upload} accent="var(--success)" />
        <StatCard label="Pending" value={stats?.pending || 0} icon={Clock} accent="var(--info)" />
        <StatCard label="Failed" value={stats?.failed || 0} icon={AlertTriangle} accent="var(--error)" />
      </div>

      {/* Scheduler + Live Upload */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Gauge size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold">Scheduler</h2>
          {scheduler?.active && (
            <span className="ml-auto flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--success)' }}>
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--success)' }} />
              Active
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Status</p>
            <p className="font-medium" style={{ color: scheduler?.enabled ? 'var(--success)' : 'var(--text-dim)' }}>
              {scheduler?.enabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Upload Window</p>
            <p className="font-medium font-mono text-sm">{scheduler?.startHour}:00 - {scheduler?.endHour}:00</p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Window Status</p>
            <p className="font-medium" style={{ color: scheduler?.withinWindow ? 'var(--success)' : 'var(--text-dim)' }}>
              {scheduler?.withinWindow ? 'Open' : 'Closed'}
            </p>
          </div>
          <div>
            <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Bandwidth</p>
            <p className="font-medium font-mono text-sm">{scheduler?.bandwidthLimit} Mbps</p>
          </div>
        </div>

        {/* Live upload */}
        {stats?.liveUpload && (
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight size={14} style={{ color: 'var(--success)' }} />
              <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Uploading now</span>
              {stats.liveUpload.speed && (
                <span className="ml-auto text-sm font-bold font-mono">{stats.liveUpload.speed}</span>
              )}
            </div>
            <p className="text-xs truncate mb-3" style={{ color: 'var(--text-muted)' }} title={stats.liveUpload.currentFile}>
              {stats.liveUpload.currentFile}
            </p>
            {stats.liveUpload.percentage > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: stats.liveUpload.percentage + '%', background: 'var(--success)' }}
                  />
                </div>
                <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--text-muted)' }}>{stats.liveUpload.percentage}%</span>
                {stats.liveUpload.eta && (
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>ETA {stats.liveUpload.eta}</span>
                )}
              </div>
            )}
          </div>
        )}
        {stats && stats.todayBytes > 0 && (
          <div className="mt-4 pt-4 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Today: {formatBytes(stats.todayBytes)} uploaded across {stats.todayFiles} files
          </div>
        )}
      </div>

      {/* Speed graph */}
      {stats?.speedHistory && stats.speedHistory.length >= 2 && (
        <SpeedGraph samples={stats.speedHistory} />
      )}

      {/* Cost & ETA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={18} style={{ color: 'var(--warning)' }} />
            <h2 className="text-sm font-semibold">Glacier Costs</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Monthly storage</span>
              <span className="font-medium font-mono">${costs?.monthlyCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Yearly storage</span>
              <span className="font-medium font-mono">${costs?.yearlyCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Upload requests (one-time)</span>
              <span className="font-medium font-mono">${costs?.estimatedPutCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="pt-3 flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>Data stored</span>
              <span className="font-medium font-mono">{formatBytes(costs?.totalStoredBytes || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Data pending</span>
              <span className="font-medium font-mono">{formatBytes(costs?.pendingBytes || 0)}</span>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Timer size={18} style={{ color: 'var(--info)' }} />
            <h2 className="text-sm font-semibold">Estimated Completion</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Avg upload speed</span>
              <span className="font-medium font-mono">
                {costs?.avgBytesPerDay ? formatBytes(costs.avgBytesPerDay) + '/day' : 'No data yet'}
              </span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>Remaining</span>
              <span className="font-medium font-mono">{formatBytes(costs?.pendingBytes || 0)}</span>
            </div>
            <div className="pt-3 flex justify-between items-baseline" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-muted)' }}>ETA</span>
              <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                {costs?.etaDays ? costs.etaDays + ' days' : 'N/A'}
              </span>
            </div>
            {costs?.etaDate && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-muted)' }}>Estimated date</span>
                <span className="font-medium">{new Date(costs.etaDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
