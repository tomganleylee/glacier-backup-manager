import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';
import { listDirectory } from '@/lib/filesystem';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────

interface ChatMessage {
  role: string;
  content: string | ContentBlock[] | ToolResultBlock[];
}

interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface AnthropicResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: { message: string };
}

interface AssistantRequest {
  message: string;
  history?: { role: string; content: string }[];
}

// ── Pricing ────────────────────────────────────────────────────────────

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-5-20250929'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function getModelDisplayName(model: string): string {
  if (model.includes('opus')) return 'Claude Opus 4.6';
  if (model.includes('sonnet')) return 'Claude Sonnet 4.5';
  if (model.includes('haiku')) return 'Claude Haiku 4.5';
  return model;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

// ── System Context ─────────────────────────────────────────────────────

function gatherSystemContext(): string {
  const db = getDb();

  const totalItems = db.prepare('SELECT COUNT(*) as count FROM backup_items').get() as { count: number };
  const statusCounts = db.prepare('SELECT status, COUNT(*) as count FROM backup_items GROUP BY status').all() as { status: string; count: number }[];
  const statusSummary = statusCounts.map((s) => `${s.status}: ${s.count}`).join(', ');

  const totalShows = db.prepare('SELECT COUNT(*) as count FROM shows').get() as { count: number };
  const rareShows = db.prepare("SELECT COUNT(*) as count FROM shows WHERE rarity = 'rare'").get() as { count: number };
  const backupEnabledShows = db.prepare('SELECT COUNT(*) as count FROM shows WHERE backup_enabled = 1').get() as { count: number };

  const recentUploads = db.prepare(
    "SELECT SUM(bytes_uploaded) as total_bytes, SUM(files_uploaded) as total_files FROM upload_stats WHERE date >= date('now', '-7 days')"
  ).get() as { total_bytes: number | null; total_files: number | null };

  const scheduler = getSchedulerStatus();

  return [
    `\n--- Current System State (snapshot - use tools for detailed/current data) ---`,
    `Backup Items: ${totalItems.count} total (${statusSummary || 'none'})`,
    `Shows: ${totalShows.count} total, ${rareShows.count} rare, ${backupEnabledShows.count} with backup enabled`,
    `Recent Uploads (7 days): ${recentUploads.total_files ?? 0} files, ${formatBytes(recentUploads.total_bytes ?? 0)} uploaded`,
    `Scheduler: ${scheduler.enabled ? 'enabled' : 'disabled'}, ${scheduler.active ? 'actively running' : 'idle'}, upload window ${scheduler.startHour}:00-${scheduler.endHour}:00, ${scheduler.withinWindow ? 'currently within window' : 'outside window'}, bandwidth limit ${scheduler.bandwidthLimit} Mbps`,
  ].join('\n');
}

// ── Tool Definitions ───────────────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'browse_files',
    description: 'Browse files and directories on the NAS. Returns entries with name, path, type (file/directory), size, modified date, and backup status. Use this to explore what\'s on the NAS when the user asks about specific folders or files. The path is relative to the NAS mount root. Use an empty string to list the root.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Relative path within the NAS mount to browse. Use \'\' for root.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'get_system_status',
    description: 'Get a full system overview including backup queue counts, transcode job stats, show/movie counts, scheduler state, recent uploads, and recent transcodes. Use this when the user asks general questions about system health or status.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_manifest',
    description: 'Search the NAS manifest database by name or path. Returns items with name, path, type, size, file count, and backup status. Use this to find specific files or folders across the entire NAS without browsing directory by directory.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search term to match against file/folder names and paths',
        },
        type: {
          type: 'string',
          description: 'Filter by content type',
          enum: ['series', 'film', 'photo', 'document', 'game', 'backup', 'other'],
        },
      },
      required: ['search'],
    },
  },
  {
    name: 'list_shows',
    description: 'List TV shows from the database with rarity scoring, codec info, size, episode count, and backup status. Can filter by rarity level or backup-enabled status. Rarity: "rare" = hard to find online (priority backup), "easy" = widely available, "moderate" = in between.',
    input_schema: {
      type: 'object',
      properties: {
        rarity: {
          type: 'string',
          description: 'Filter by rarity level',
          enum: ['rare', 'moderate', 'easy', 'unknown'],
        },
        backup_enabled: {
          type: 'boolean',
          description: 'If true, only return shows with backup enabled',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_movies',
    description: 'List movies from the database with rarity scoring, codec info, size, year, and backup status. Can filter by rarity level or backup-enabled status.',
    input_schema: {
      type: 'object',
      properties: {
        rarity: {
          type: 'string',
          description: 'Filter by rarity level',
          enum: ['rare', 'moderate', 'easy', 'unknown'],
        },
        backup_enabled: {
          type: 'boolean',
          description: 'If true, only return movies with backup enabled',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_backup_queue',
    description: 'List items in the backup queue with their status (pending, queued, uploading, uploaded, failed), priority, size, and timestamps. Use this to see what\'s queued, uploaded, or failed.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by backup status',
          enum: ['pending', 'queued', 'uploading', 'uploaded', 'failed'],
        },
      },
      required: [],
    },
  },
  {
    name: 'get_backup_costs',
    description: 'Get AWS Glacier storage cost calculations including current monthly/yearly costs, pending upload costs, average upload speed, ETA to completion, and upload history for the last 30 days.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_transcode_jobs',
    description: 'List transcode jobs with status, codec info (from/to), original/transcoded sizes, progress, and associated show title. Shows space savings from completed transcodes.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by job status',
          enum: ['queued', 'assigned', 'transcoding', 'completed', 'failed'],
        },
      },
      required: [],
    },
  },
  {
    name: 'add_to_backup',
    description: 'Add a file or folder to the backup queue. IMPORTANT: Only use this when the user has explicitly asked to back something up. Always confirm with the user before calling this tool.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'NAS-relative path of the file or folder to back up',
        },
        type: {
          type: 'string',
          description: 'Whether this is a file or directory',
          enum: ['file', 'directory'],
        },
        size_bytes: {
          type: 'number',
          description: 'Size in bytes (if known)',
        },
        priority: {
          type: 'number',
          description: 'Priority level: 0=critical, 1=high, 2=medium, 3=low (default), 4=optional',
        },
      },
      required: ['path', 'type'],
    },
  },
  {
    name: 'enable_show_backup',
    description: 'Enable or disable backup for a TV show by its database ID. IMPORTANT: Only use this when the user has explicitly asked to enable/disable backup for a specific show.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The show\'s database ID',
        },
        backup_enabled: {
          type: 'boolean',
          description: 'Whether to enable (true) or disable (false) backup',
        },
      },
      required: ['id', 'backup_enabled'],
    },
  },
  {
    name: 'enable_movie_backup',
    description: 'Enable or disable backup for a movie by its database ID. IMPORTANT: Only use this when the user has explicitly asked to enable/disable backup for a specific movie.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The movie\'s database ID',
        },
        backup_enabled: {
          type: 'boolean',
          description: 'Whether to enable (true) or disable (false) backup',
        },
      },
      required: ['id', 'backup_enabled'],
    },
  },
];

// ── Tool Executor ──────────────────────────────────────────────────────

const GLACIER_DEEP_ARCHIVE_PER_GB_MONTH = 0.00099;
const PUT_REQUEST_COST_PER_1000 = 0.05;
const BYTES_PER_GB = 1_073_741_824;

function executeTool(name: string, input: Record<string, unknown>): { content: string; is_error: boolean } {
  try {
    const db = getDb();

    switch (name) {
      case 'browse_files': {
        const dirPath = (input.path as string) || '';
        const entries = listDirectory(dirPath);

        // Enrich with backup status
        const backupItems = db.prepare(
          'SELECT path, status, priority FROM backup_items WHERE path LIKE ?'
        ).all(dirPath ? dirPath + '%' : '%') as { path: string; status: string; priority: number }[];
        const backupMap = new Map(backupItems.map(b => [b.path, { status: b.status, priority: b.priority }]));

        const enriched = entries.map(entry => ({
          name: entry.name,
          path: entry.path,
          type: entry.type,
          size: formatBytes(entry.size),
          size_bytes: entry.size,
          modified: entry.modified,
          children: entry.children,
          backup_status: backupMap.get(entry.path)?.status || null,
          backup_priority: backupMap.get(entry.path)?.priority ?? null,
        }));

        const truncated = enriched.length > 100;
        const result = truncated ? enriched.slice(0, 100) : enriched;
        return {
          content: JSON.stringify(truncated
            ? { entries: result, truncated: true, total_entries: enriched.length, showing: 100 }
            : { entries: result }),
          is_error: false,
        };
      }

      case 'get_system_status': {
        const backupStats = {
          total: (db.prepare('SELECT COUNT(*) as c FROM backup_items').get() as { c: number }).c,
          pending: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status IN ('pending','queued')").get() as { c: number }).c,
          uploading: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'uploading'").get() as { c: number }).c,
          uploaded: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'uploaded'").get() as { c: number }).c,
          failed: (db.prepare("SELECT COUNT(*) as c FROM backup_items WHERE status = 'failed'").get() as { c: number }).c,
          totalBytes: (db.prepare('SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items').get() as { s: number }).s,
          uploadedBytes: (db.prepare("SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items WHERE status = 'uploaded'").get() as { s: number }).s,
          pendingBytes: (db.prepare("SELECT COALESCE(SUM(size_bytes),0) as s FROM backup_items WHERE status IN ('pending','queued')").get() as { s: number }).s,
        };
        const transcodeStats = {
          queued: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'queued'").get() as { c: number }).c,
          active: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status IN ('assigned','transcoding')").get() as { c: number }).c,
          completed: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'completed'").get() as { c: number }).c,
          failed: (db.prepare("SELECT COUNT(*) as c FROM transcode_jobs WHERE status = 'failed'").get() as { c: number }).c,
          savedBytes: (db.prepare("SELECT COALESCE(SUM(original_size - transcoded_size),0) as s FROM transcode_jobs WHERE status = 'completed' AND original_size IS NOT NULL AND transcoded_size IS NOT NULL").get() as { s: number }).s,
        };
        const showStats = {
          total: (db.prepare('SELECT COUNT(*) as c FROM shows').get() as { c: number }).c,
          backupEnabled: (db.prepare('SELECT COUNT(*) as c FROM shows WHERE backup_enabled = 1').get() as { c: number }).c,
          rare: (db.prepare("SELECT COUNT(*) as c FROM shows WHERE rarity = 'rare'").get() as { c: number }).c,
          totalSizeBytes: (db.prepare('SELECT COALESCE(SUM(size_bytes),0) as s FROM shows').get() as { s: number }).s,
        };
        const movieStats = {
          total: (db.prepare('SELECT COUNT(*) as c FROM movies').get() as { c: number }).c,
          backupEnabled: (db.prepare('SELECT COUNT(*) as c FROM movies WHERE backup_enabled = 1').get() as { c: number }).c,
          rare: (db.prepare("SELECT COUNT(*) as c FROM movies WHERE rarity = 'rare'").get() as { c: number }).c,
          totalSizeBytes: (db.prepare('SELECT COALESCE(SUM(size_bytes),0) as s FROM movies').get() as { s: number }).s,
        };
        const recentUploads = db.prepare(
          "SELECT file_path, file_size_bytes, completed_at FROM upload_log WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 5"
        ).all();
        const recentTranscodes = db.prepare(
          "SELECT source_path, original_size, transcoded_size, completed_at FROM transcode_jobs WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 5"
        ).all();
        const scheduler = getSchedulerStatus();

        return {
          content: JSON.stringify({
            backup: backupStats,
            transcode: transcodeStats,
            shows: showStats,
            movies: movieStats,
            scheduler,
            recentUploads,
            recentTranscodes,
          }),
          is_error: false,
        };
      }

      case 'search_manifest': {
        const search = input.search as string;
        const type = input.type as string | undefined;
        let query = 'SELECT * FROM manifest';
        const conditions: string[] = [];
        const params: (string | number)[] = [];
        if (search) {
          conditions.push('(name LIKE ? OR path LIKE ?)');
          params.push('%' + search + '%', '%' + search + '%');
        }
        if (type) {
          conditions.push('type = ?');
          params.push(type);
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY name ASC LIMIT 50';
        const items = db.prepare(query).all(...params);
        return { content: JSON.stringify(items), is_error: false };
      }

      case 'list_shows': {
        const rarity = input.rarity as string | undefined;
        const backupOnly = input.backup_enabled as boolean | undefined;
        let query = 'SELECT * FROM shows';
        const conditions: string[] = [];
        const params: (string | number)[] = [];
        if (rarity) {
          conditions.push('rarity = ?');
          params.push(rarity);
        }
        if (backupOnly) {
          conditions.push('backup_enabled = 1');
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY rarity_score DESC, title ASC LIMIT 100';
        const shows = db.prepare(query).all(...params);
        return { content: JSON.stringify(shows), is_error: false };
      }

      case 'list_movies': {
        const rarity = input.rarity as string | undefined;
        const backupOnly = input.backup_enabled as boolean | undefined;
        let query = 'SELECT * FROM movies';
        const conditions: string[] = [];
        const params: (string | number)[] = [];
        if (rarity) {
          conditions.push('rarity = ?');
          params.push(rarity);
        }
        if (backupOnly) {
          conditions.push('backup_enabled = 1');
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY rarity_score DESC, title ASC LIMIT 100';
        const movies = db.prepare(query).all(...params);
        return { content: JSON.stringify(movies), is_error: false };
      }

      case 'list_backup_queue': {
        const status = input.status as string | undefined;
        let query = 'SELECT * FROM backup_items';
        if (status) query += ' WHERE status = ?';
        query += ' ORDER BY priority ASC, created_at DESC LIMIT 100';
        const items = status
          ? db.prepare(query).all(status)
          : db.prepare(query).all();
        return { content: JSON.stringify(items), is_error: false };
      }

      case 'get_backup_costs': {
        const storedRow = db.prepare(
          "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM backup_items WHERE status = 'uploaded'"
        ).get() as { total: number };
        const totalStoredBytes = storedRow.total;

        const pendingRow = db.prepare(
          "SELECT COALESCE(SUM(size_bytes), 0) AS total, COUNT(*) AS count FROM backup_items WHERE status IN ('pending', 'queued')"
        ).get() as { total: number; count: number };
        const pendingBytes = pendingRow.total;
        const pendingCount = pendingRow.count;

        const monthlyCostUsd = (totalStoredBytes / BYTES_PER_GB) * GLACIER_DEEP_ARCHIVE_PER_GB_MONTH;
        const yearlyCostUsd = monthlyCostUsd * 12;
        const estimatedPutCostUsd = (pendingCount / 1000) * PUT_REQUEST_COST_PER_1000;

        const avgRow = db.prepare(
          "SELECT AVG(bytes_uploaded) AS avg_bytes FROM upload_stats WHERE date >= date('now', '-30 days')"
        ).get() as { avg_bytes: number | null };
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
        ).all();

        return {
          content: JSON.stringify({
            totalStoredBytes,
            totalStoredFormatted: formatBytes(totalStoredBytes),
            pendingBytes,
            pendingFormatted: formatBytes(pendingBytes),
            monthlyCostUsd: Math.round(monthlyCostUsd * 100) / 100,
            yearlyCostUsd: Math.round(yearlyCostUsd * 100) / 100,
            estimatedPutCostUsd: Math.round(estimatedPutCostUsd * 100) / 100,
            avgBytesPerDay: Math.round(avgBytesPerDay),
            avgPerDayFormatted: formatBytes(Math.round(avgBytesPerDay)),
            etaDays,
            etaDate,
            uploadHistory,
          }),
          is_error: false,
        };
      }

      case 'get_transcode_jobs': {
        const status = input.status as string | undefined;
        let query = 'SELECT t.*, s.title as show_title FROM transcode_jobs t LEFT JOIN shows s ON t.show_id = s.id';
        if (status) query += ' WHERE t.status = ?';
        query += ' ORDER BY t.created_at DESC LIMIT 50';
        const jobs = status
          ? db.prepare(query).all(status)
          : db.prepare(query).all();
        return { content: JSON.stringify(jobs), is_error: false };
      }

      // ── Write Tools ──

      case 'add_to_backup': {
        const result = db.prepare(
          'INSERT OR IGNORE INTO backup_items (path, type, size_bytes, priority) VALUES (?, ?, ?, ?)'
        ).run(
          input.path as string,
          (input.type as string) || 'file',
          (input.size_bytes as number) || 0,
          (input.priority as number) ?? 3,
        );
        return {
          content: JSON.stringify({
            success: true,
            id: Number(result.lastInsertRowid),
            message: `Added "${input.path}" to backup queue with priority ${(input.priority as number) ?? 3}`,
          }),
          is_error: false,
        };
      }

      case 'enable_show_backup': {
        db.prepare('UPDATE shows SET backup_enabled = ? WHERE id = ?')
          .run(input.backup_enabled ? 1 : 0, input.id as number);
        const show = db.prepare('SELECT title FROM shows WHERE id = ?').get(input.id as number) as { title: string } | undefined;
        return {
          content: JSON.stringify({
            success: true,
            message: `${input.backup_enabled ? 'Enabled' : 'Disabled'} backup for show "${show?.title || `ID ${input.id}`}"`,
          }),
          is_error: false,
        };
      }

      case 'enable_movie_backup': {
        db.prepare('UPDATE movies SET backup_enabled = ? WHERE id = ?')
          .run(input.backup_enabled ? 1 : 0, input.id as number);
        const movie = db.prepare('SELECT title FROM movies WHERE id = ?').get(input.id as number) as { title: string } | undefined;
        return {
          content: JSON.stringify({
            success: true,
            message: `${input.backup_enabled ? 'Enabled' : 'Disabled'} backup for movie "${movie?.title || `ID ${input.id}`}"`,
          }),
          is_error: false,
        };
      }

      default:
        return { content: `Unknown tool: ${name}`, is_error: true };
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { content: `Tool error: ${msg}`, is_error: true };
  }
}

// ── POST Handler (Agentic Loop) ────────────────────────────────────────

const MAX_ITERATIONS = 10;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AssistantRequest;
    const { message, history } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    const apiKey = getSetting('claude_api_key');
    if (!apiKey) {
      return NextResponse.json({ error: 'Claude API key not configured. Add it in Settings.' }, { status: 400 });
    }

    // Build system prompt with tool usage guidelines
    const systemPrompt = [
      'You are a backup management assistant for Glacier Backup Manager.',
      'You help users understand their NAS backup status, recommend files to back up, and troubleshoot issues.',
      '',
      'You have tools to browse the NAS filesystem, query the database, check costs, and manage backups.',
      '',
      'Guidelines:',
      '- Use tools to get real, up-to-date data rather than guessing. If the user asks about specific files or folders, use browse_files to actually look.',
      '- For general status questions, get_system_status provides a comprehensive overview.',
      '- When the user asks about costs, use get_backup_costs for accurate numbers.',
      '- You can call multiple tools if needed to answer a question thoroughly.',
      '- For write operations (add_to_backup, enable_show_backup, enable_movie_backup): ALWAYS describe what you plan to do and ask the user for confirmation BEFORE calling the tool. Only call the write tool after the user explicitly confirms.',
      '- Format your responses with markdown: use headers, bullet points, bold text, and tables where appropriate.',
      '- When showing file sizes, use human-readable formats (GB, MB, etc.).',
      '- Rarity levels: "rare" = hard to find online (priority backup), "easy" = widely available, "moderate" = in between.',
      '- Priority levels for backup: 0=critical, 1=high, 2=medium, 3=low (default), 4=optional.',
      '',
      'Here is a quick snapshot of the current system state (use tools for detailed/current data):',
      gatherSystemContext(),
    ].join('\n');

    // Build messages from history + new user message
    const messages: ChatMessage[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: 'user', content: message });

    const configuredModel = getSetting('claude_model');
    const model = configuredModel || 'claude-sonnet-4-5-20250929';

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let usedModel = model;
    let iterations = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: TOOL_DEFINITIONS,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return NextResponse.json(
          { error: `Anthropic API error (${response.status}): ${errorText}` },
          { status: 502 },
        );
      }

      const data = (await response.json()) as AnthropicResponse;

      if (data.error) {
        return NextResponse.json(
          { error: `Anthropic API error: ${data.error.message}` },
          { status: 502 },
        );
      }

      // Accumulate tokens
      totalInputTokens += data.usage?.input_tokens ?? 0;
      totalOutputTokens += data.usage?.output_tokens ?? 0;
      usedModel = data.model || model;

      // If end_turn or max_tokens, extract text and return
      if (data.stop_reason === 'end_turn' || data.stop_reason === 'max_tokens') {
        const assistantText = data.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text || '')
          .join('');

        const cost = calculateCost(usedModel, totalInputTokens, totalOutputTokens);

        if (totalInputTokens > 0 || totalOutputTokens > 0) {
          const db = getDb();
          db.prepare(
            'INSERT INTO chat_usage (model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?)',
          ).run(usedModel, totalInputTokens, totalOutputTokens, cost);
        }

        return NextResponse.json({
          role: 'assistant',
          content: assistantText,
          usage: {
            model: usedModel,
            model_display: getModelDisplayName(usedModel),
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            cost_usd: cost,
          },
        });
      }

      // If tool_use, execute tools and loop
      if (data.stop_reason === 'tool_use') {
        // Append assistant's response (with tool_use blocks) to messages
        messages.push({ role: 'assistant', content: data.content });

        // Execute each tool
        const toolResults: ToolResultBlock[] = [];
        for (const block of data.content) {
          if (block.type === 'tool_use' && block.id && block.name) {
            const result = executeTool(block.name, block.input || {});
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result.content,
              is_error: result.is_error,
            });
          }
        }

        // Append tool results as user message
        messages.push({ role: 'user', content: toolResults });
        // Continue loop...
      }
    }

    // Hit max iterations - return what we have
    const cost = calculateCost(usedModel, totalInputTokens, totalOutputTokens);
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      const db = getDb();
      db.prepare(
        'INSERT INTO chat_usage (model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?)',
      ).run(usedModel, totalInputTokens, totalOutputTokens, cost);
    }

    return NextResponse.json({
      role: 'assistant',
      content: 'I reached the maximum number of reasoning steps for this question. Could you try asking something more specific?',
      usage: {
        model: usedModel,
        model_display: getModelDisplayName(usedModel),
        input_tokens: totalInputTokens,
        output_tokens: totalOutputTokens,
        cost_usd: cost,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── GET Handler (Usage Stats) ──────────────────────────────────────────

export async function GET() {
  try {
    const db = getDb();

    const allTime = db.prepare(
      'SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage',
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    const today = db.prepare(
      "SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage WHERE created_at >= date('now')",
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    const week = db.prepare(
      "SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage WHERE created_at >= date('now', '-7 days')",
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    const byModel = db.prepare(
      'SELECT model, COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage GROUP BY model',
    ).all() as { model: string; messages: number; input_tokens: number; output_tokens: number; total_cost: number }[];

    const configuredModel = getSetting('claude_model') || 'claude-sonnet-4-5-20250929';

    return NextResponse.json({
      configured_model: configuredModel,
      configured_model_display: getModelDisplayName(configuredModel),
      pricing: MODEL_PRICING,
      all_time: {
        messages: allTime.messages,
        input_tokens: allTime.input_tokens ?? 0,
        output_tokens: allTime.output_tokens ?? 0,
        total_cost: allTime.total_cost ?? 0,
      },
      today: {
        messages: today.messages,
        input_tokens: today.input_tokens ?? 0,
        output_tokens: today.output_tokens ?? 0,
        total_cost: today.total_cost ?? 0,
      },
      week: {
        messages: week.messages,
        input_tokens: week.input_tokens ?? 0,
        output_tokens: week.output_tokens ?? 0,
        total_cost: week.total_cost ?? 0,
      },
      by_model: byModel.map((m) => ({
        ...m,
        model_display: getModelDisplayName(m.model),
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
