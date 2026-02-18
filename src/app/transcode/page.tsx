'use client';

import { useEffect, useState } from 'react';
import {
  RefreshCw, Play, Check, AlertCircle, Clock, Loader2, Settings,
  ArrowRight, Cpu, HardDrive, ListChecks, MonitorCog, Terminal
} from 'lucide-react';

interface TranscodeJob {
  id: number;
  source_path: string;
  output_path: string | null;
  show_title: string | null;
  status: string;
  codec_from: string;
  codec_to: string;
  original_size: number | null;
  transcoded_size: number | null;
  progress: number;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

interface TranscodeProfile {
  id: number;
  name: string;
  description: string;
  codec: string;
  preset: string;
  cq: number;
  extra_args: string;
  is_default: number;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const statusConfig: Record<string, { color: string; icon: React.ElementType }> = {
  queued: { color: 'var(--text-muted)', icon: Clock },
  assigned: { color: 'var(--info)', icon: Play },
  transcoding: { color: 'var(--warning)', icon: Loader2 },
  completed: { color: 'var(--success)', icon: Check },
  failed: { color: 'var(--error)', icon: AlertCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || statusConfig.queued;
  const Icon = config.icon;
  return (
    <span
      className="badge"
      style={{
        color: config.color,
        background: `color-mix(in srgb, ${config.color} 15%, transparent)`,
      }}
    >
      <Icon size={12} className={status === 'transcoding' ? 'animate-spin' : ''} />
      {status}
    </span>
  );
}

function TranscodeSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <div className="skeleton h-7 w-48 mb-2" />
        <div className="skeleton h-4 w-72" />
      </div>
      <div className="skeleton h-64 rounded-[var(--radius)]" />
      <div className="skeleton h-48 rounded-[var(--radius)]" />
      <div className="skeleton h-32 rounded-[var(--radius)]" />
    </div>
  );
}

export default function TranscodePage() {
  const [jobs, setJobs] = useState<TranscodeJob[]>([]);
  const [profiles, setProfiles] = useState<TranscodeProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [jobsRes, profilesRes] = await Promise.all([
          fetch('/api/transcode'),
          fetch('/api/transcode/profiles'),
        ]);
        const jobsData = await jobsRes.json();
        const profilesData = await profilesRes.json();
        setJobs(Array.isArray(jobsData) ? jobsData : []);
        setProfiles(Array.isArray(profilesData) ? profilesData : []);
      } catch { setJobs([]); }
      finally { setLoading(false); }
    }
    fetchData();
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/transcode');
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : []);
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const stats = {
    queued: jobs.filter(j => j.status === 'queued').length,
    active: jobs.filter(j => ['assigned', 'transcoding'].includes(j.status)).length,
    completed: jobs.filter(j => j.status === 'completed').length,
    savedBytes: jobs
      .filter(j => j.status === 'completed' && j.original_size && j.transcoded_size)
      .reduce((sum, j) => sum + ((j.original_size || 0) - (j.transcoded_size || 0)), 0),
  };

  if (loading) return <TranscodeSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw size={20} style={{ color: 'var(--accent)' }} />
          <h1 className="text-xl font-bold tracking-tight">Transcode Queue</h1>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {stats.queued} queued, {stats.active} active, {stats.completed} completed
          {stats.savedBytes > 0 && ' (' + formatBytes(stats.savedBytes) + ' saved)'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--text-muted) 15%, transparent)' }}>
              <ListChecks size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight">{stats.queued}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Queued</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--warning) 15%, transparent)' }}>
              <Loader2 size={18} style={{ color: 'var(--warning)' }} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight">{stats.active}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Active</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--success) 15%, transparent)' }}>
              <Check size={18} style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight">{stats.completed}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Completed</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--accent) 15%, transparent)' }}>
              <HardDrive size={18} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight">{stats.savedBytes > 0 ? formatBytes(stats.savedBytes) : '-'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Space Saved</p>
        </div>
      </div>

      {/* Jobs table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="p-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Show</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Codec</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Status</th>
              <th className="p-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Progress</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Original</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Result</th>
              <th className="p-3 text-right text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Savings</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => {
              const savings = job.original_size && job.transcoded_size
                ? Math.round((1 - job.transcoded_size / job.original_size) * 100)
                : null;
              return (
                <tr key={job.id} className="table-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td className="p-3" style={{ color: 'var(--text)' }}>{job.show_title || job.source_path.split('/').pop()}</td>
                  <td className="p-3 text-center" style={{ color: 'var(--text-secondary)' }}>
                    <span className="inline-flex items-center gap-1.5">
                      {job.codec_from}
                      <ArrowRight size={12} style={{ color: 'var(--text-dim)' }} />
                      {job.codec_to}
                    </span>
                  </td>
                  <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                  <td className="p-3">
                    {job.status === 'transcoding' && (
                      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: job.progress + '%', background: 'var(--warning)' }}
                        />
                      </div>
                    )}
                    {job.status === 'completed' && (
                      <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>100%</span>
                    )}
                  </td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(job.original_size || 0)}</td>
                  <td className="p-3 text-right" style={{ color: 'var(--text-secondary)' }}>{formatBytes(job.transcoded_size || 0)}</td>
                  <td className="p-3 text-right">
                    {savings !== null ? (
                      <span className="text-xs font-medium" style={{ color: 'var(--success)' }}>{savings}%</span>
                    ) : (
                      <span style={{ color: 'var(--text-dim)' }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                  No transcode jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Profiles */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings size={18} style={{ color: 'var(--accent)' }} />
          <h2 className="text-sm font-semibold">Transcode Profiles</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className="stat-card"
              style={profile.is_default ? {
                borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
                background: 'color-mix(in srgb, var(--accent) 5%, var(--bg-card))',
              } : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Cpu size={14} style={{ color: profile.is_default ? 'var(--accent)' : 'var(--text-muted)' }} />
                  <h3 className="font-medium text-sm" style={{ color: 'var(--text)' }}>{profile.name}</h3>
                </div>
                {profile.is_default ? (
                  <span
                    className="badge"
                    style={{
                      color: 'var(--accent)',
                      background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                    }}
                  >
                    Default
                  </span>
                ) : null}
              </div>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{profile.description}</p>
              <div className="flex gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>Codec: {profile.codec}</span>
                <span>Preset: {profile.preset}</span>
                <span>CQ: {profile.cq}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Worker */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-2">
          <MonitorCog size={18} style={{ color: 'var(--info)' }} />
          <h2 className="text-sm font-semibold">Gaming PC Worker</h2>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Run the worker script on your gaming PC (9800x3d + RTX 5080) to process transcode jobs using NVENC.
          The worker polls this server for queued jobs every 30 seconds.
        </p>
        <div
          className="mt-3 p-3 rounded-[var(--radius-sm)] flex items-start gap-2"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Terminal size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--text-dim)' }} />
          <code className="text-xs break-all" style={{ color: 'var(--text-secondary)' }}>
            powershell -ExecutionPolicy Bypass -File gaming-pc-worker.ps1 -ServerUrl http://192.168.3.202:3000
          </code>
        </div>
      </div>
    </div>
  );
}
