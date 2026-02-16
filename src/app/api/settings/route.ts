import { NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/lib/db';
import { testConnection } from '@/lib/rclone';

const SENSITIVE_KEYS = ['aws_access_key', 'aws_secret_key', 'sonarr_api_key', 'radarr_api_key', 'claude_api_key'];

export async function GET() {
  try {
    const settings = getAllSettings();
    // Mask all sensitive values
    const masked = { ...settings };
    for (const key of SENSITIVE_KEYS) {
      if (masked[key]) {
        masked[key] = '***' + masked[key].slice(-4);
      }
    }
    return NextResponse.json(masked);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let awsChanged = false;

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        // Skip masked values — don't overwrite real credentials with '***...'
        if (value.startsWith('***') && SENSITIVE_KEYS.includes(key)) {
          continue;
        }
        setSetting(key, value);
        if (key.startsWith('aws_')) {
          awsChanged = true;
        }
      }
    }

    // Only test connection if AWS settings were actually changed (not masked)
    if (awsChanged) {
      const connectionTest = testConnection();
      return NextResponse.json({ success: true, connection: connectionTest });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
