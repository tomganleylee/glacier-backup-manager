import { execSync, spawn, ChildProcess } from 'child_process';
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
    'storage_class = DEEP_ARCHIVE',
  ].join('\n');
}

export function writeRcloneConfig(): string {
  const configPath = '/tmp/rclone-glacier.conf';
  fs.writeFileSync(configPath, getRcloneConfig());
  return configPath;
}

export function testConnection(): { success: boolean; message: string } {
  try {
    const configPath = writeRcloneConfig();
    const bucket = getSetting('aws_bucket') || '';
    if (!bucket) {
      return { success: false, message: 'No bucket configured' };
    }
    const result = execSync(
      `rclone lsd --config ${configPath} glacier:${bucket} 2>&1`,
      { timeout: 30000, encoding: 'utf-8' }
    );
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
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const configPath = writeRcloneConfig();
    const bucket = getSetting('aws_bucket') || '';
    const bwLimit = getSetting('bandwidth_limit_mbps') || '3';

    const args = [
      'copy',
      '--config', configPath,
      '--bwlimit', `${bwLimit}M`,
      '--progress',
      '--stats', '2s',
      '--stats-one-line',
      localPath,
      `glacier:${bucket}/${remotePath}`,
    ];

    const proc: ChildProcess = spawn('rclone', args);
    let lastError = '';

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString();
      lastError += line;

      // Parse rclone progress output
      const speed = line.match(/(\d+\.\d+\s*\w+\/s)/);
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
    const result = execSync(
      `rclone size --config ${configPath} --json glacier:${bucket}/${remotePath} 2>/dev/null`,
      { timeout: 60000, encoding: 'utf-8' }
    );
    const parsed = JSON.parse(result);
    return parsed.bytes || 0;
  } catch {
    return 0;
  }
}
