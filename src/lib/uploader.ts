import { getDb } from './db';
import { uploadFile } from './rclone';
import { isWithinUploadWindow, setSchedulerActive, setAbortFunction } from './scheduler';

export interface UploadQueueItem {
  id: number;
  path: string;
  size_bytes: number;
  priority: number;
  status: string;
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
  };
}

export async function processQueue(): Promise<{ processed: number; errors: number }> {
  setSchedulerActive(true);
  let processed = 0;
  let errors = 0;
  const db = getDb();

  try {
    const queue = getUploadQueue();

    for (const item of queue) {
      // Check if still within upload window
      if (!isWithinUploadWindow()) {
        console.log('Upload window closed, stopping queue processing');
        break;
      }

      // Mark as uploading
      db.prepare("UPDATE backup_items SET status = 'uploading', updated_at = datetime('now') WHERE id = ?").run(item.id);

      // Create upload log entry
      const logResult = db.prepare(
        "INSERT INTO upload_log (backup_item_id, file_path, file_size_bytes, started_at, status) VALUES (?, ?, ?, datetime('now'), 'uploading')"
      ).run(item.id, item.path, item.size_bytes);

      const logId = logResult.lastInsertRowid;

      // Determine S3 key from path
      const glacierKey = item.path.replace(/\\/g, '/');

      try {
        const result = await uploadFile(item.path, glacierKey);

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
    setSchedulerActive(false);
    setAbortFunction(null);
  }

  return { processed, errors };
}
