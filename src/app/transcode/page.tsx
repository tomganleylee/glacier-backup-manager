'use client';

import { useEffect, useState } from 'react';

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

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '-';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-gray-800 text-gray-300',
    assigned: 'bg-blue-900 text-blue-300',
    transcoding: 'bg-yellow-900 text-yellow-300',
    completed: 'bg-green-900 text-green-300',
    failed: 'bg-red-900 text-red-300',
  };
  return (
    <span className={'px-2 py-0.5 rounded text-xs font-medium ' + (colors[status] || colors.queued)}>
      {status}
    </span>
  );
}

export default function TranscodePage() {
  const [jobs, setJobs] = useState<TranscodeJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJobs() {
      try {
        const res = await fetch('/api/transcode');
        const data = await res.json();
        setJobs(Array.isArray(data) ? data : []);
      } catch { setJobs([]); }
      finally { setLoading(false); }
    }
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Transcode Queue</h1>
        <p className="text-gray-500 text-sm">
          {stats.queued} queued, {stats.active} active, {stats.completed} completed
          {stats.savedBytes > 0 && ' (' + formatBytes(stats.savedBytes) + ' saved)'}
        </p>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading jobs...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400">
                <th className="p-3 text-left">Show</th>
                <th className="p-3 text-center">Codec</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-center">Progress</th>
                <th className="p-3 text-right">Original</th>
                <th className="p-3 text-right">Result</th>
                <th className="p-3 text-right">Savings</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => {
                const savings = job.original_size && job.transcoded_size
                  ? Math.round((1 - job.transcoded_size / job.original_size) * 100)
                  : null;
                return (
                  <tr key={job.id} className="border-b border-gray-800/50 hover:bg-gray-800/50">
                    <td className="p-3">{job.show_title || job.source_path.split('/').pop()}</td>
                    <td className="p-3 text-center text-gray-400">{job.codec_from} &rarr; {job.codec_to}</td>
                    <td className="p-3 text-center"><StatusBadge status={job.status} /></td>
                    <td className="p-3">
                      {job.status === 'transcoding' && (
                        <div className="w-full bg-gray-800 rounded-full h-2">
                          <div className="bg-yellow-500 h-2 rounded-full" style={{ width: job.progress + '%' }} />
                        </div>
                      )}
                      {job.status === 'completed' && <span className="text-green-400">100%</span>}
                    </td>
                    <td className="p-3 text-right text-gray-400">{formatBytes(job.original_size || 0)}</td>
                    <td className="p-3 text-right text-gray-400">{formatBytes(job.transcoded_size || 0)}</td>
                    <td className="p-3 text-right">{savings !== null ? <span className="text-green-400">{savings}%</span> : '-'}</td>
                  </tr>
                );
              })}
              {jobs.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No transcode jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-2">Gaming PC Worker</h2>
        <p className="text-sm text-gray-400">
          Run the worker script on your gaming PC (9800x3d + RTX 5080) to process transcode jobs using NVENC.
          The worker polls this server for queued jobs every 30 seconds.
        </p>
        <code className="block mt-3 p-3 bg-gray-950 rounded text-xs text-gray-300">
          powershell -ExecutionPolicy Bypass -File gaming-pc-worker.ps1 -ServerUrl http://192.168.3.202:3000
        </code>
      </div>
    </div>
  );
}
