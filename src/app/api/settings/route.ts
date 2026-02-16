import { NextResponse } from 'next/server';
import { getAllSettings, setSetting } from '@/lib/db';
import { testConnection } from '@/lib/rclone';

export async function GET() {
  try {
    const settings = getAllSettings();
    // Mask sensitive values
    const masked = { ...settings };
    if (masked.aws_secret_key) masked.aws_secret_key = '***' + masked.aws_secret_key.slice(-4);
    if (masked.aws_access_key) masked.aws_access_key = '***' + masked.aws_access_key.slice(-4);
    return NextResponse.json(masked);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === 'string') {
        setSetting(key, value);
      }
    }

    // If AWS settings changed, test connection
    if (body.aws_access_key || body.aws_secret_key || body.aws_bucket || body.aws_region) {
      const connectionTest = testConnection();
      return NextResponse.json({ success: true, connection: connectionTest });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
