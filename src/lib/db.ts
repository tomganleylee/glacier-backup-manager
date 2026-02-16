import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'backup.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS backup_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL DEFAULT 'file',
      size_bytes INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 3,
      status TEXT DEFAULT 'pending',
      glacier_key TEXT,
      uploaded_at TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sonarr_id INTEGER,
      path TEXT,
      size_bytes INTEGER DEFAULT 0,
      episode_count INTEGER DEFAULT 0,
      status TEXT,
      rarity TEXT DEFAULT 'unknown',
      rarity_score INTEGER DEFAULT 50,
      backup_enabled INTEGER DEFAULT 0,
      keep_best_quality INTEGER DEFAULT 0,
      codec TEXT,
      resolution TEXT,
      synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upload_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_item_id INTEGER REFERENCES backup_items(id),
      file_path TEXT NOT NULL,
      file_size_bytes INTEGER,
      glacier_key TEXT,
      started_at TEXT,
      completed_at TEXT,
      bytes_transferred INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS transcode_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      output_path TEXT,
      show_id INTEGER REFERENCES shows(id),
      status TEXT DEFAULT 'queued',
      codec_from TEXT,
      codec_to TEXT DEFAULT 'hevc',
      original_size INTEGER,
      transcoded_size INTEGER,
      progress REAL DEFAULT 0,
      assigned_at TEXT,
      completed_at TEXT,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS upload_stats (
      date TEXT PRIMARY KEY,
      bytes_uploaded INTEGER DEFAULT 0,
      files_uploaded INTEGER DEFAULT 0,
      upload_duration_seconds INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS manifest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT,
      size_bytes INTEGER DEFAULT 0,
      file_count INTEGER DEFAULT 0,
      backed_up INTEGER DEFAULT 0,
      last_scanned TEXT,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_backup_items_status ON backup_items(status);
    CREATE INDEX IF NOT EXISTS idx_backup_items_priority ON backup_items(priority);
    CREATE INDEX IF NOT EXISTS idx_shows_rarity ON shows(rarity);
    CREATE INDEX IF NOT EXISTS idx_shows_backup ON shows(backup_enabled);
    CREATE INDEX IF NOT EXISTS idx_upload_log_status ON upload_log(status);
    CREATE INDEX IF NOT EXISTS idx_transcode_jobs_status ON transcode_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_manifest_type ON manifest(type);
    CREATE INDEX IF NOT EXISTS idx_manifest_backed_up ON manifest(backed_up);
  `);

  // Seed default settings
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const defaults: Record<string, string> = {
    nas_mount_path: '/mnt/nas',
    upload_start_hour: '23',
    upload_end_hour: '7',
    bandwidth_limit_mbps: '3',
    aws_region: 'eu-west-2',
    aws_bucket: '',
    aws_access_key: '',
    aws_secret_key: '',
    sonarr_url: 'http://192.168.3.98:8989',
    sonarr_api_key: 'ba3a27d75ab245dd8354f98f400c2010',
    radarr_url: 'http://192.168.3.119:7878',
    radarr_api_key: 'a794dc89fe4a4036b41fe6a403d03773',
    scheduler_enabled: 'false',
  };
  for (const [key, value] of Object.entries(defaults)) {
    insertSetting.run(key, value);
  }
}

// Helper to get a setting value
export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

// Helper to set a setting value
export function setSetting(key: string, value: string): void {
  getDb().prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now")) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime("now")'
  ).run(key, value, value);
}

// Helper to get all settings
export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
