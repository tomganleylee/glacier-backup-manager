import { getDb, getSetting } from './db';

// Scheduler state (in-memory, resets on restart)
let schedulerActive = false;
let currentUploadAbort: (() => void) | null = null;
let cronInterval: ReturnType<typeof setInterval> | null = null;
let recoveryDone = false;

export function isWithinUploadWindow(): boolean {
  const startHour = parseInt(getSetting('upload_start_hour') || '23');
  const endHour = parseInt(getSetting('upload_end_hour') || '7');
  const now = new Date();
  const currentHour = now.getHours();

  if (startHour > endHour) {
    // Overnight window (e.g., 23:00 - 07:00)
    return currentHour >= startHour || currentHour < endHour;
  } else {
    // Same-day window (e.g., 01:00 - 07:00)
    return currentHour >= startHour && currentHour < endHour;
  }
}

export function getSchedulerStatus(): {
  enabled: boolean;
  active: boolean;
  withinWindow: boolean;
  startHour: number;
  endHour: number;
  bandwidthLimit: number;
} {
  return {
    enabled: getSetting('scheduler_enabled') === 'true',
    active: schedulerActive,
    withinWindow: isWithinUploadWindow(),
    startHour: parseInt(getSetting('upload_start_hour') || '23'),
    endHour: parseInt(getSetting('upload_end_hour') || '7'),
    bandwidthLimit: parseInt(getSetting('bandwidth_limit_mbps') || '3'),
  };
}

export function setSchedulerActive(active: boolean) {
  schedulerActive = active;
}

export function setAbortFunction(fn: (() => void) | null) {
  currentUploadAbort = fn;
}

export function abortCurrentUpload() {
  if (currentUploadAbort) {
    currentUploadAbort();
    currentUploadAbort = null;
  }
}

// Start the periodic scheduler check (every 5 minutes)
// When enabled and within the upload window, it triggers processQueue
export function startSchedulerLoop(processQueueFn: () => Promise<unknown>) {
  if (cronInterval) return; // already running

  cronInterval = setInterval(() => {
    const enabled = getSetting('scheduler_enabled') === 'true';
    if (enabled && isWithinUploadWindow() && !schedulerActive) {
      console.log('[Scheduler] Upload window open, starting queue processing...');
      processQueueFn().catch(err => {
        console.error('[Scheduler] Queue processing error:', err);
      });
    }
  }, 5 * 60 * 1000); // every 5 minutes

  console.log('[Scheduler] Periodic check started (every 5 minutes)');
}

export function stopSchedulerLoop() {
  if (cronInterval) {
    clearInterval(cronInterval);
    cronInterval = null;
    console.log('[Scheduler] Periodic check stopped');
  }
}

// Recover items stuck as "uploading" after a service restart
export function recoverStuckUploads() {
  if (recoveryDone) return;
  recoveryDone = true;
  try {
    const db = getDb();
    const stuck = db.prepare(
      "SELECT COUNT(*) as count FROM backup_items WHERE status = 'uploading'"
    ).get() as { count: number };
    if (stuck.count > 0) {
      db.prepare(
        "UPDATE backup_items SET status = 'pending', updated_at = datetime('now') WHERE status = 'uploading'"
      ).run();
      console.log(`[Scheduler] Recovered ${stuck.count} stuck item(s) from 'uploading' -> 'pending'`);
    }
  } catch (err) {
    console.error('[Scheduler] Recovery error:', err);
  }
}

// Auto-start scheduler if it was previously enabled (called on first API hit)
let autoStartDone = false;
export function autoStartIfEnabled(processQueueFn: () => Promise<unknown>) {
  if (autoStartDone) return;
  autoStartDone = true;
  recoverStuckUploads();
  const enabled = getSetting('scheduler_enabled') === 'true';
  if (enabled) {
    console.log('[Scheduler] Auto-starting (was previously enabled)');
    startSchedulerLoop(processQueueFn);
  }
}
