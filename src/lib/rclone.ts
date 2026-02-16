import { execFileSync, spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { getSetting } from './db';

export interface RcloneProgress {
  bytes: number;
  totalBytes: number;
  speed: string;
  eta: string;
  percentage: number;
}

export function getRcloneConfig(): string {
  const accessKey = getSetting('aws_access_key') || '';
  const secretKey = getSetting('aws_secret_key') || '';
  const region = getSetting('aws_region') || 'eu-west-2';

  return [
    '[glacier]',
    'type = s3',
    'provider = AWS',
    `access_key_id = ${accessKey}`,
    `secret_access_key = ${secretKey}`,
    `region = ${region}`,
    `location_constraint = ${region}`,
    'storage_class = DEEP_ARCHIVE',
  ].join('\n');
}

export function writeRcloneConfig(): string {
  const configPath = '/tmp/rclone-glacier.conf';
  fs.writeFileSync(configPath, getRcloneConfig(), { mode: 0o600 });
  return configPath;
}

export function testConnection(): { success: boolean; message: string } {
  try {
    const configPath = writeRcloneConfig();
    const bucket = getSetting('aws_bucket') || '';
    if (!bucket) {
      return { success: false, message: 'No bucket configured' };
    }
    const result = execFileSync('rclone', [
      'lsd', '--config', configPath, `glacier:${bucket}`
    ], { timeout: 30000, encoding: 'utf-8' });
    return { success: true, message: `Connected to ${bucket}. ${result.trim()}` };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: msg };
  }
}

export function uploadFile(
  localPath: string,
  remotePath: string,
  onProgress?: (progress: RcloneProgress) => void
): Promise<{ success: boolean; error?: string; abort?: () => void }> {
  return new Promise((resolve) => {
    const configPath = writeRcloneConfig();
    const bucket = getSetting('aws_bucket') || '';
    const bwLimit = getSetting('bandwidth_limit_mbps') || '3';

    // Use 'copyto' for files (preserves exact destination path)
    // Use 'copy' for directories (copies contents into destination)
    const isFile = !fs.statSync(localPath, { throwIfNoEntry: false })?.isDirectory();
    const command = isFile ? 'copyto' : 'copy';

    const args = [
      command,
      '--config', configPath,
      '--bwlimit', `${bwLimit}M`,
      '--stats', '2s',
      '--stats-one-line',
      '--stats-log-level', 'NOTICE',
      '--use-json-log',
      '-v',
      localPath,
      `glacier:${bucket}/${remotePath}`,
    ];

    const proc: ChildProcess = spawn('rclone', args);
    let lastError = '';
    let stderrBuffer = '';

    proc.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      lastError += chunk;
      stderrBuffer += chunk;

      // Process complete lines (JSON log entries end with newline)
      const lines = stderrBuffer.split('\n');
      stderrBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line);
          // rclone JSON stats messages have msg like "Transferred: 10.000 MiB / 176.000 MiB, 6%, 2.500 MiB/s, ETA 1m6s"
          if (entry.msg && onProgress) {
            const msg = entry.msg;
            const speed = msg.match(/([\d.]+\s*\w+\/s)/);
            const eta = msg.match(/ETA\s+(\S+)/);
            const pct = msg.match(/(\d+)%/);
            if (pct) {
              onProgress({
                bytes: 0,
                totalBytes: 0,
                speed: speed?.[1] || '',
                eta: eta?.[1] || '',
                percentage: parseInt(pct[1]),
              });
            }
          }
        } catch {
          // Non-JSON line — try direct regex on raw text
          const speed = line.match(/([\d.]+\s*\w+\/s)/);
          const eta = line.match(/ETA\s+(\S+)/);
          const pct = line.match(/(\d+)%/);
          if (onProgress && pct) {
            onProgress({
              bytes: 0,
              totalBytes: 0,
              speed: speed?.[1] || '',
              eta: eta?.[1] || '',
              percentage: parseInt(pct[1]),
            });
          }
        }
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: lastError.slice(-500) });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

export function getRemoteSize(remotePath: string): number {
  try {
    const configPath = writeRcloneConfig();
    const bucket = getSetting('aws_bucket') || '';
    const result = execFileSync('rclone', [
      'size', '--config', configPath, '--json', `glacier:${bucket}/${remotePath}`
    ], { timeout: 60000, encoding: 'utf-8' });
    const parsed = JSON.parse(result);
    return parsed.bytes || 0;
  } catch {
    return 0;
  }
}
