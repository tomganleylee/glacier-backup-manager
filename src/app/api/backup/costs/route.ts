import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const GLACIER_DEEP_ARCHIVE_PER_GB_MONTH = 0.00099;
const PUT_REQUEST_COST_PER_1000 = 0.05;
const BYTES_PER_GB = 1_073_741_824;

interface StorageSums {
  total: number;
}

interface PendingSums {
  total: number;
  count: number;
}

interface AvgStat {
  avg_bytes: number | null;
}

interface UploadStatRow {
  date: string;
  bytes_uploaded: number;
  files_uploaded: number;
}

export async function GET() {
  try {
    const db = getDb();

    const storedRow = db.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM backup_items WHERE status = 'uploaded'"
    ).get() as StorageSums;
    const totalStoredBytes = storedRow.total;

    const pendingRow = db.prepare(
      "SELECT COALESCE(SUM(size_bytes), 0) AS total, COUNT(*) AS count FROM backup_items WHERE status IN ('pending', 'queued')"
    ).get() as PendingSums;
    const pendingBytes = pendingRow.total;
    const pendingCount = pendingRow.count;

    const monthlyCostUsd = (totalStoredBytes / BYTES_PER_GB) * GLACIER_DEEP_ARCHIVE_PER_GB_MONTH;
    const yearlyCostUsd = monthlyCostUsd * 12;
    const estimatedPutCostUsd = (pendingCount / 1000) * PUT_REQUEST_COST_PER_1000;

    const avgRow = db.prepare(
      "SELECT AVG(bytes_uploaded) AS avg_bytes FROM upload_stats WHERE date >= date('now', '-30 days')"
    ).get() as AvgStat;
    const avgBytesPerDay = avgRow.avg_bytes ?? 0;

    let etaDays: number | null = null;
    let etaDate: string | null = null;

    if (avgBytesPerDay > 0) {
      etaDays = Math.ceil(pendingBytes / avgBytesPerDay);
      const eta = new Date();
      eta.setDate(eta.getDate() + etaDays);
      etaDate = eta.toISOString().split('T')[0];
    }

    const uploadHistory = db.prepare(
      "SELECT date, bytes_uploaded, files_uploaded FROM upload_stats WHERE date >= date('now', '-30 days') ORDER BY date ASC"
    ).all() as UploadStatRow[];

    return NextResponse.json({
      totalStoredBytes,
      pendingBytes,
      monthlyCostUsd: Math.round(monthlyCostUsd * 100) / 100,
      yearlyCostUsd: Math.round(yearlyCostUsd * 100) / 100,
      estimatedPutCostUsd: Math.round(estimatedPutCostUsd * 100) / 100,
      avgBytesPerDay: Math.round(avgBytesPerDay),
      etaDays,
      etaDate,
      uploadHistory,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
