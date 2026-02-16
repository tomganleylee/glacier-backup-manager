import { getSetting } from './db';

type NotificationType = 'complete' | 'error';

interface WebhookPayload {
  content?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Sends a JSON POST request to a webhook URL.
 * Formats the payload for both Discord ("content" field) and Slack ("text" field) compatibility.
 */
export async function sendWebhook(url: string, payload: object): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `[notifications] Webhook request failed: ${response.status} ${response.statusText}`
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error('[notifications] Webhook request error:', err);
    return false;
  }
}

/**
 * Sends an email notification.
 * This is a stub -- logs a warning if no email service is configured.
 * Most users should use Discord/Slack webhooks instead.
 */
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  console.warn(
    `[notifications] Email sending is not configured. ` +
      `Would have sent to="${to}" subject="${subject}". ` +
      `Use a webhook (Discord/Slack) for notifications instead.`
  );
  // Suppress unused variable warnings -- parameters are kept for interface consistency
  void body;
  return false;
}

/**
 * Builds a Discord/Slack-compatible webhook payload from a notification.
 */
function buildWebhookPayload(
  type: NotificationType,
  message: string,
  details?: string
): WebhookPayload {
  const icon = type === 'complete' ? '[COMPLETE]' : '[ERROR]';
  const text = details ? `${icon} ${message}\n${details}` : `${icon} ${message}`;

  return {
    // Discord format
    content: text,
    // Slack format
    text: text,
  };
}

/**
 * Main notification dispatcher.
 * Reads settings from the database to determine which channels are enabled,
 * then sends the notification to each configured channel.
 */
export async function sendNotification(
  type: NotificationType,
  message: string,
  details?: string
): Promise<void> {
  const notifyOnComplete = getSetting('notification_on_complete') === 'true';
  const notifyOnError = getSetting('notification_on_error') === 'true';

  // Check if notifications are enabled for this type
  if (type === 'complete' && !notifyOnComplete) {
    return;
  }
  if (type === 'error' && !notifyOnError) {
    return;
  }

  const webhookUrl = getSetting('notification_webhook_url');
  const email = getSetting('notification_email');

  const results: Promise<boolean>[] = [];

  // Dispatch to webhook if configured
  if (webhookUrl) {
    const payload = buildWebhookPayload(type, message, details);
    results.push(sendWebhook(webhookUrl, payload));
  }

  // Dispatch to email if configured
  if (email) {
    const subject = type === 'complete'
      ? 'Backup Complete'
      : 'Backup Error';
    const body = details ? `${message}\n\n${details}` : message;
    results.push(sendEmail(email, subject, body));
  }

  if (results.length === 0) {
    console.warn('[notifications] No notification channels configured.');
    return;
  }

  await Promise.allSettled(results);
}
