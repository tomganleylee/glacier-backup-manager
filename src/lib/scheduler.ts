import { getSetting } from './db';

// Scheduler state (in-memory, resets on restart)
let schedulerActive = false;
let currentUploadAbort: (() => void) | null = null;

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
