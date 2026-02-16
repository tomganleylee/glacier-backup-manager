'use client';

import { useEffect, useState } from 'react';

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
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

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
        {stats && stats.todayBytes > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800 text-sm">
            <p className="text-gray-400">
              Today: {formatBytes(stats.todayBytes)} uploaded across {stats.todayFiles} files
            </p>
          </div>
        )}
      </div>

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
