import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';

interface ChatMessage {
  role: string;
  content: string;
}

interface AssistantRequest {
  message: string;
  history?: ChatMessage[];
}

interface AnthropicResponse {
  content: { type: string; text: string }[];
  error?: { message: string };
}

function gatherSystemContext(): string {
  const db = getDb();

  // Backup items summary
  const totalItems = db.prepare(
    'SELECT COUNT(*) as count FROM backup_items'
  ).get() as { count: number };

  const statusCounts = db.prepare(
    'SELECT status, COUNT(*) as count FROM backup_items GROUP BY status'
  ).all() as { status: string; count: number }[];

  const statusSummary = statusCounts
    .map((s) => `${s.status}: ${s.count}`)
    .join(', ');

  // Shows summary
  const totalShows = db.prepare(
    'SELECT COUNT(*) as count FROM shows'
  ).get() as { count: number };

  const rareShows = db.prepare(
    "SELECT COUNT(*) as count FROM shows WHERE rarity = 'rare'"
  ).get() as { count: number };

  const backupEnabledShows = db.prepare(
    'SELECT COUNT(*) as count FROM shows WHERE backup_enabled = 1'
  ).get() as { count: number };

  // Recent upload stats (last 7 days)
  const recentUploads = db.prepare(
    "SELECT SUM(bytes_uploaded) as total_bytes, SUM(files_uploaded) as total_files FROM upload_stats WHERE date >= date('now', '-7 days')"
  ).get() as { total_bytes: number | null; total_files: number | null };

  // Scheduler status
  const scheduler = getSchedulerStatus();

  const contextLines = [
    `\n--- Current System State ---`,
    `Backup Items: ${totalItems.count} total (${statusSummary || 'none'})`,
    `Shows: ${totalShows.count} total, ${rareShows.count} rare, ${backupEnabledShows.count} with backup enabled`,
    `Recent Uploads (7 days): ${recentUploads.total_files ?? 0} files, ${formatBytes(recentUploads.total_bytes ?? 0)} uploaded`,
    `Scheduler: ${scheduler.enabled ? 'enabled' : 'disabled'}, ${scheduler.active ? 'actively running' : 'idle'}, upload window ${scheduler.startHour}:00-${scheduler.endHour}:00, ${scheduler.withinWindow ? 'currently within window' : 'outside window'}, bandwidth limit ${scheduler.bandwidthLimit} Mbps`,
  ];

  return contextLines.join('\n');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(1)} ${units[i]}`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AssistantRequest;
    const { message, history } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required.' },
        { status: 400 }
      );
    }

    // Read API key from settings
    const apiKey = getSetting('claude_api_key');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Claude API key not configured. Add it in Settings.' },
        { status: 400 }
      );
    }

    // Build system prompt with live context
    const systemPrompt = [
      'You are a backup management assistant for Glacier Backup Manager.',
      'You help users understand their NAS backup status, recommend files to back up, and troubleshoot issues.',
      'You have access to the backup system\'s current state.',
      gatherSystemContext(),
    ].join('\n');

    // Build messages array from history + new message
    const messages: ChatMessage[] = [];

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    // Determine model (allow user to configure, fall back to default)
    const configuredModel = getSetting('claude_model');
    const model = configuredModel || 'claude-sonnet-4-5-20250929';

    // Call Anthropic Messages API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error (${response.status}): ${errorText}` },
        { status: 502 }
      );
    }

    const data = (await response.json()) as AnthropicResponse;

    if (data.error) {
      return NextResponse.json(
        { error: `Anthropic API error: ${data.error.message}` },
        { status: 502 }
      );
    }

    // Extract text from the response content blocks
    const assistantText = data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return NextResponse.json({
      role: 'assistant',
      content: assistantText,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
