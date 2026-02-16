import { getDb, getSetting } from './db';
import { uploadFile } from './rclone';
import { isWithinUploadWindow, setSchedulerActive, setAbortFunction } from './scheduler';

export interface UploadQueueItem {
  id: number;
  path: string;
  size_bytes: number;
  priority: number;
  status: string;
}

// Live upload progress — stored on globalThis so it's shared across all
// Next.js route compilations (each route gets its own module scope).
interface LiveProgress {
  currentFile: string;
  speed: string;
  percentage: number;
  eta: string;
  startedAt: number;
}

interface SpeedSample {
  time: number;      // Unix ms timestamp
  bytesPerSec: number;
}

const MAX_SPEED_SAMPLES = 120; // ~4 minutes of 2s samples

const g = globalThis as typeof globalThis & {
  _liveProgress?: LiveProgress | null;
  _speedHistory?: SpeedSample[];
};
if (!g._liveProgress) g._liveProgress = null;
if (!g._speedHistory) g._speedHistory = [];

function getLiveProgressRef(): LiveProgress | null {
  return g._liveProgress ?? null;
}

function setLiveProgress(val: LiveProgress | null) {
  g._liveProgress = val;
}

function addSpeedSample(speed: string) {
  // Parse speed string like "1.207 MiB/s" or "512 KiB/s"
  const match = speed.match(/([\d.]+)\s*(\w+)\/s/);
  if (!match) return;
  const num = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  let bytesPerSec = num;
  if (unit === 'kib' || unit === 'kb') bytesPerSec = num * 1024;
  else if (unit === 'mib' || unit === 'mb') bytesPerSec = num * 1024 * 1024;
  else if (unit === 'gib' || unit === 'gb') bytesPerSec = num * 1024 * 1024 * 1024;

  g._speedHistory!.push({ time: Date.now(), bytesPerSec });
  if (g._speedHistory!.length > MAX_SPEED_SAMPLES) {
    g._speedHistory!.shift();
  }
}

function clearSpeedHistory() {
  g._speedHistory = [];
}

export function getSpeedHistory(): SpeedSample[] {
  return g._speedHistory || [];
}

export function getLiveProgress() {
  return getLiveProgressRef();
}

export function getUploadQueue(): UploadQueueItem[] {
  return getDb()
    .prepare(
      'SELECT id, path, size_bytes, priority, status FROM backup_items WHERE status IN (?, ?) ORDER BY priority ASC, size_bytes ASC'
    )
    .all('pending', 'queued') as UploadQueueItem[];
}

export function getUploadStats() {
  const db = getDb();

  const totalItems = db.prepare('SELECT COUNT(*) as count FROM backup_items').get() as { count: number };
  const uploaded = db.prepare("SELECT COUNT(*) as count FROM backup_items WHERE status = 'uploaded'").get() as { count: number };
  const pending = db.prepare("SELECT COUNT(*) as count FROM backup_items WHERE status IN ('pending', 'queued')").get() as { count: number };
  const failed = db.prepare("SELECT COUNT(*) as count FROM backup_items WHERE status = 'failed'").get() as { count: number };
  const uploading = db.prepare("SELECT COUNT(*) as count FROM backup_items WHERE status = 'uploading'").get() as { count: number };

  const totalBytes = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM backup_items').get() as { total: number };
  const uploadedBytes = db.prepare("SELECT COALESCE(SUM(size_bytes), 0) as total FROM backup_items WHERE status = 'uploaded'").get() as { total: number };

  const todayStats = db.prepare("SELECT * FROM upload_stats WHERE date = date('now')").get() as { bytes_uploaded: number; files_uploaded: number } | undefined;

  return {
    totalItems: totalItems.count,
    uploaded: uploaded.count,
    pending: pending.count,
    failed: failed.count,
    uploading: uploading.count,
    totalBytes: totalBytes.total,
    uploadedBytes: uploadedBytes.total,
    todayBytes: todayStats?.bytes_uploaded || 0,
    todayFiles: todayStats?.files_uploaded || 0,
    liveUpload: getLiveProgressRef(),
    speedHistory: getSpeedHistory(),
  };
}

export async function processQueue(options?: { force?: boolean }): Promise<{ processed: number; errors: number }> {
  const force = options?.force ?? false;
  setSchedulerActive(true);
  let processed = 0;
  let errors = 0;
  const db = getDb();
  const nasMount = getSetting('nas_mount_path') || '/mnt/nas';

  try {
    const queue = getUploadQueue();

    for (const item of queue) {
      // Check if still within upload window (skip check if force mode)
      if (!force && !isWithinUploadWindow()) {
        console.log('Upload window closed, stopping queue processing');
        break;
      }

      // Build full local path: NAS mount + relative path
      const localPath = `${nasMount}/${item.path}`.replace(/\/+/g, '/');

      // Mark as uploading
      db.prepare("UPDATE backup_items SET status = 'uploading', updated_at = datetime('now') WHERE id = ?").run(item.id);

      // Set live progress (shared via globalThis) and reset speed history
      clearSpeedHistory();
      setLiveProgress({
        currentFile: item.path,
        speed: '',
        percentage: 0,
        eta: '',
        startedAt: Date.now(),
      });

      // Create upload log entry
      const logResult = db.prepare(
        "INSERT INTO upload_log (backup_item_id, file_path, file_size_bytes, started_at, status) VALUES (?, ?, ?, datetime('now'), 'uploading')"
      ).run(item.id, item.path, item.size_bytes);

      const logId = logResult.lastInsertRowid;

      // Determine S3 key from relative path
      const glacierKey = item.path.replace(/\\/g, '/');

      try {
        console.log(`[Upload] Uploading ${localPath} -> glacier:${glacierKey}`);
        const result = await uploadFile(localPath, glacierKey, (progress) => {
          // Update live progress from rclone (shared via globalThis)
          const lp = getLiveProgressRef();
          if (lp) {
            lp.speed = progress.speed;
            lp.percentage = progress.percentage;
            lp.eta = progress.eta;
          }
          // Record speed sample for graph
          if (progress.speed) {
            addSpeedSample(progress.speed);
          }
        });

        if (result.success) {
          db.prepare(
            "UPDATE backup_items SET status = 'uploaded', glacier_key = ?, uploaded_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
          ).run(glacierKey, item.id);

          db.prepare(
            "UPDATE upload_log SET status = 'completed', glacier_key = ?, completed_at = datetime('now'), bytes_transferred = ? WHERE id = ?"
          ).run(glacierKey, item.size_bytes, logId);

          // Update daily stats
          db.prepare(
            "INSERT INTO upload_stats (date, bytes_uploaded, files_uploaded) VALUES (date('now'), ?, 1) ON CONFLICT(date) DO UPDATE SET bytes_uploaded = bytes_uploaded + ?, files_uploaded = files_uploaded + 1"
          ).run(item.size_bytes, item.size_bytes);

          processed++;
        } else {
          throw new Error(result.error || 'Upload failed');
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        db.prepare(
          "UPDATE backup_items SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?"
        ).run(errorMsg.slice(0, 1000), item.id);

        db.prepare(
          "UPDATE upload_log SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?"
        ).run(errorMsg.slice(0, 1000), logId);

        errors++;
      }
    }
  } finally {
    setLiveProgress(null);
    setSchedulerActive(false);
    setAbortFunction(null);
  }

  return { processed, errors };
}
