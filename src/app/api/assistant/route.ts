import { NextResponse } from 'next/server';
import { getDb, getSetting } from '@/lib/db';
import { getSchedulerStatus } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

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
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
  error?: { message: string };
}

// Pricing per million tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
  'claude-opus-4-6': { input: 15, output: 75 },
  // Older models
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

    // Calculate and store usage
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    const usedModel = data.model || model;
    const cost = calculateCost(usedModel, inputTokens, outputTokens);

    if (inputTokens > 0 || outputTokens > 0) {
      const db = getDb();
      db.prepare(
        "INSERT INTO chat_usage (model, input_tokens, output_tokens, cost_usd) VALUES (?, ?, ?, ?)"
      ).run(usedModel, inputTokens, outputTokens, cost);
    }

    return NextResponse.json({
      role: 'assistant',
      content: assistantText,
      usage: {
        model: usedModel,
        model_display: getModelDisplayName(usedModel),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: cost,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// GET endpoint to retrieve usage stats
export async function GET() {
  try {
    const db = getDb();

    // All-time totals
    const allTime = db.prepare(
      'SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage'
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    // Today's totals
    const today = db.prepare(
      "SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage WHERE created_at >= date('now')"
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    // Last 7 days
    const week = db.prepare(
      "SELECT COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage WHERE created_at >= date('now', '-7 days')"
    ).get() as { messages: number; input_tokens: number | null; output_tokens: number | null; total_cost: number | null };

    // Per-model breakdown
    const byModel = db.prepare(
      'SELECT model, COUNT(*) as messages, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(cost_usd) as total_cost FROM chat_usage GROUP BY model'
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
      by_model: byModel.map(m => ({
        ...m,
        model_display: getModelDisplayName(m.model),
      })),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
