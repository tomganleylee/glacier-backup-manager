'use client';

import { useEffect, useState } from 'react';

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

function StatCard({ label, value, subtext, color }: { label: string; value: string | number; subtext?: string; color: string }) {
  return (
    <div className={'rounded-xl border p-5 ' + color}>
      <p className="text-sm text-gray-400 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
    </div>
  );
}

function formatSpeed(bytesPerSec: number): string {
  const mbps = (bytesPerSec * 8) / 1_000_000;
  if (mbps < 0.1) return mbps.toFixed(2) + ' Mbps';
  if (mbps < 10) return mbps.toFixed(1) + ' Mbps';
  return mbps.toFixed(0) + ' Mbps';
}

function SpeedGraph({ samples }: { samples: SpeedSample[] }) {
  if (samples.length < 2) return null;

  const W = 600, H = 160, PAD_L = 60, PAD_R = 10, PAD_T = 10, PAD_B = 30;
  const gw = W - PAD_L - PAD_R;
  const gh = H - PAD_T - PAD_B;

  const maxSpeed = Math.max(...samples.map(s => s.bytesPerSec), 1);
  // Round up max to a nice number for Y-axis
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

  // Build SVG path for the line
  const linePath = points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  // Build area fill
  const areaPath = linePath + ` L${points[points.length-1].x},${PAD_T + gh} L${points[0].x},${PAD_T + gh} Z`;

  // Y-axis labels (0, 25%, 50%, 75%, 100% of niceMax)
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: niceMax * f,
    y: PAD_T + gh - f * gh,
  }));

  // Time labels
  const elapsed = (maxTime - minTime) / 1000;
  const timeLabel = elapsed < 60 ? `${Math.round(elapsed)}s ago` : `${Math.round(elapsed / 60)}m ago`;

  // Current speed
  const currentSpeed = samples[samples.length - 1].bytesPerSec;
  const avgSpeed = samples.reduce((sum, s) => sum + s.bytesPerSec, 0) / samples.length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Upload Speed</h2>
        <div className="flex gap-4 text-sm">
          <span className="text-gray-400">Current: <span className="text-green-400 font-medium">{formatSpeed(currentSpeed)}</span></span>
          <span className="text-gray-400">Avg: <span className="text-blue-400 font-medium">{formatSpeed(avgSpeed)}</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '200px' }}>
        {/* Grid lines */}
        {yLabels.map((l, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={l.y} x2={W - PAD_R} y2={l.y} stroke="#374151" strokeWidth={0.5} />
            <text x={PAD_L - 6} y={l.y + 4} textAnchor="end" fill="#6b7280" fontSize="10">
              {formatSpeed(l.value)}
            </text>
          </g>
        ))}
        {/* Area fill with gradient */}
        <defs>
          <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#speedGrad)" />
        {/* Line */}
        <path d={linePath} fill="none" stroke="#22c55e" strokeWidth={2} />
        {/* X-axis labels */}
        <text x={PAD_L} y={H - 5} fill="#6b7280" fontSize="10">{timeLabel}</text>
        <text x={W - PAD_R} y={H - 5} textAnchor="end" fill="#6b7280" fontSize="10">now</text>
      </svg>
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
    // Poll faster when uploading (3s) vs idle (10s)
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
    // Refresh
    const res = await fetch('/api/backup/status');
    const data = await res.json();
    setStats(data.stats);
    setScheduler(data.scheduler);
  }

  if (loading) {
    return <div className="text-gray-500">Loading dashboard...</div>;
  }

  const progress = stats && stats.totalBytes > 0
    ? Math.round((stats.uploadedBytes / stats.totalBytes) * 100)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-gray-500 text-sm">Glacier Deep Archive backup status</p>
        </div>
        <button
          onClick={toggleScheduler}
          className={'px-4 py-2 rounded-lg font-medium text-sm transition-colors ' +
            (scheduler?.enabled
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white')}
        >
          {scheduler?.enabled ? 'Stop Scheduler' : 'Start Scheduler'}
        </button>
      </div>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-400">Overall Progress</span>
          <span className="text-white font-medium">{progress}%</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: progress + '%' }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{stats ? formatBytes(stats.uploadedBytes) : '0'} uploaded</span>
          <span>{stats ? formatBytes(stats.totalBytes) : '0'} total</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Items" value={stats?.totalItems || 0} color="border-gray-800 bg-gray-900" />
        <StatCard label="Uploaded" value={stats?.uploaded || 0} subtext={stats ? formatBytes(stats.uploadedBytes) : ''} color="border-green-800 bg-green-950" />
        <StatCard label="Pending" value={stats?.pending || 0} color="border-blue-800 bg-blue-950" />
        <StatCard label="Failed" value={stats?.failed || 0} color="border-red-800 bg-red-950" />
      </div>

      {/* Scheduler status */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Scheduler</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Status</p>
            <p className={'font-medium ' + (scheduler?.enabled ? 'text-green-400' : 'text-gray-500')}>
              {scheduler?.enabled ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <p className="text-gray-400">Upload Window</p>
            <p className="font-medium">
              {scheduler?.startHour}:00 - {scheduler?.endHour}:00
            </p>
          </div>
          <div>
            <p className="text-gray-400">Currently Active</p>
            <p className={'font-medium ' + (scheduler?.active ? 'text-green-400' : 'text-gray-500')}>
              {scheduler?.active ? 'Uploading' : 'Idle'}
            </p>
          </div>
          <div>
            <p className="text-gray-400">Bandwidth Limit</p>
            <p className="font-medium">{scheduler?.bandwidthLimit} Mbps</p>
          </div>
        </div>
        {/* Live upload speed */}
        {stats?.liveUpload && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-green-400">Uploading now</span>
              {stats.liveUpload.speed && (
                <span className="text-sm font-bold text-white ml-auto">{stats.liveUpload.speed}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 truncate mb-2" title={stats.liveUpload.currentFile}>
              {stats.liveUpload.currentFile}
            </p>
            {stats.liveUpload.percentage > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all duration-1000"
                    style={{ width: stats.liveUpload.percentage + '%' }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{stats.liveUpload.percentage}%</span>
                {stats.liveUpload.eta && (
                  <span className="text-xs text-gray-500">ETA {stats.liveUpload.eta}</span>
                )}
              </div>
            )}
          </div>
        )}
        {stats && stats.todayBytes > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800 text-sm">
            <p className="text-gray-400">
              Today: {formatBytes(stats.todayBytes)} uploaded across {stats.todayFiles} files
            </p>
          </div>
        )}
      </div>

      {/* Speed graph (visible when uploading or recent history exists) */}
      {stats?.speedHistory && stats.speedHistory.length >= 2 && (
        <SpeedGraph samples={stats.speedHistory} />
      )}

      {/* Cost & ETA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Glacier Costs</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Monthly storage</span>
              <span className="font-medium">${costs?.monthlyCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Yearly storage</span>
              <span className="font-medium">${costs?.yearlyCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Upload requests (one-time)</span>
              <span className="font-medium">${costs?.estimatedPutCostUsd?.toFixed(2) || '0.00'}</span>
            </div>
            <div className="pt-3 border-t border-gray-800 flex justify-between">
              <span className="text-gray-400">Data stored</span>
              <span className="font-medium">{formatBytes(costs?.totalStoredBytes || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Data pending</span>
              <span className="font-medium">{formatBytes(costs?.pendingBytes || 0)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">Estimated Completion</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Avg upload speed</span>
              <span className="font-medium">
                {costs?.avgBytesPerDay ? formatBytes(costs.avgBytesPerDay) + '/day' : 'No data yet'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Remaining</span>
              <span className="font-medium">{formatBytes(costs?.pendingBytes || 0)}</span>
            </div>
            <div className="pt-3 border-t border-gray-800 flex justify-between">
              <span className="text-gray-400">ETA</span>
              <span className="font-medium text-lg">
                {costs?.etaDays ? costs.etaDays + ' days' : 'N/A'}
              </span>
            </div>
            {costs?.etaDate && (
              <div className="flex justify-between">
                <span className="text-gray-400">Estimated date</span>
                <span className="font-medium">{new Date(costs.etaDate).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
