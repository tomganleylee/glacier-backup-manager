'use client';

import { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon, Key, HardDrive, Clock, Tv, Bell, Bot, Save, Check,
  AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Shield, DollarSign, Info
} from 'lucide-react';

interface SettingsData {
  [key: string]: string;
}

function SettingField({ label, name, value, type, onChange, placeholder }: {
  label: string; name: string; value: string; type?: string;
  onChange: (name: string, value: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="input-field w-full px-3 py-2 text-sm"
      />
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAwsGuide, setShowAwsGuide] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => { setSettings(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function updateField(name: string, value: string) {
    setSettings(prev => ({ ...prev, [name]: value }));
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.connection) {
        setMessage(data.connection.success
          ? 'Settings saved. AWS connection successful!'
          : 'Settings saved. AWS connection failed: ' + data.connection.message);
      } else {
        setMessage('Settings saved successfully.');
      }
    } catch {
      setMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
      <SettingsIcon size={16} className="animate-spin" />
      Loading settings...
    </div>
  );

  const isError = message.includes('failed') || message.includes('Failed');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 flex items-center justify-center"
            style={{
              background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <SettingsIcon size={20} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Configure AWS, NAS, and scheduling</p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-all"
          style={{
            background: saving ? 'var(--accent-dim)' : 'var(--accent)',
            color: saving ? 'var(--text-muted)' : 'var(--bg)',
            borderRadius: 'var(--radius-sm)',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? (
            <>
              <Save size={15} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save size={15} />
              Save Settings
            </>
          )}
        </button>
      </div>

      {message && (
        <div
          className="mb-6 px-4 py-3 text-sm flex items-center gap-2"
          style={{
            background: isError
              ? 'color-mix(in srgb, var(--error) 10%, transparent)'
              : 'color-mix(in srgb, var(--success) 10%, transparent)',
            border: `1px solid ${isError
              ? 'color-mix(in srgb, var(--error) 30%, transparent)'
              : 'color-mix(in srgb, var(--success) 30%, transparent)'}`,
            color: isError ? 'var(--error)' : 'var(--success)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {isError ? <AlertTriangle size={15} /> : <Check size={15} />}
          {message}
        </div>
      )}

      <div className="space-y-6">
        {/* AWS Section */}
        <section className="card p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key size={16} style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold">AWS Glacier Configuration</h2>
            </div>
            <button
              onClick={() => setShowAwsGuide(prev => !prev)}
              className="flex items-center gap-1 text-xs transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              {showAwsGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAwsGuide ? 'Hide setup guide' : 'How to set this up?'}
            </button>
          </div>

          {showAwsGuide && (
            <div
              className="mb-6 p-4 text-sm space-y-4"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--accent)' }}>
                <Info size={15} />
                AWS S3 Glacier Deep Archive Setup Guide
              </h3>

              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Step 1: Create an S3 Bucket</p>
                <ol className="list-decimal list-inside space-y-1 ml-2" style={{ color: 'var(--text-secondary)' }}>
                  <li>Go to <span style={{ color: 'var(--accent)' }}>AWS Console &rarr; S3</span></li>
                  <li>Click <span style={{ color: 'var(--text)' }}>Create bucket</span></li>
                  <li>Enter a bucket name (e.g. <span style={{ color: 'var(--warning)' }}>my-nas-glacier-backup</span>)</li>
                  <li>Select your region (e.g. <span style={{ color: 'var(--warning)' }}>eu-west-2</span> for London)</li>
                  <li>Leave all other settings as default and click <span style={{ color: 'var(--text)' }}>Create bucket</span></li>
                </ol>
                <p className="mt-1 text-xs" style={{ color: 'var(--text-dim)' }}>Note: You do NOT need to set the default storage class. The app uses rclone which specifies Glacier Deep Archive per upload.</p>
              </div>

              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Step 2: Create an IAM User</p>
                <ol className="list-decimal list-inside space-y-1 ml-2" style={{ color: 'var(--text-secondary)' }}>
                  <li>Go to <span style={{ color: 'var(--accent)' }}>AWS Console &rarr; IAM &rarr; Users</span></li>
                  <li>Click <span style={{ color: 'var(--text)' }}>Create user</span></li>
                  <li>Name it something like <span style={{ color: 'var(--warning)' }}>glacier-backup-uploader</span></li>
                  <li>Click <span style={{ color: 'var(--text)' }}>Next</span>, then <span style={{ color: 'var(--text)' }}>Attach policies directly</span></li>
                  <li>Search for and select <span style={{ color: 'var(--warning)' }}>AmazonS3FullAccess</span> (or create a custom policy for just your bucket)</li>
                  <li>Click <span style={{ color: 'var(--text)' }}>Next</span>, then <span style={{ color: 'var(--text)' }}>Create user</span></li>
                </ol>
              </div>

              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Step 3: Create Access Keys</p>
                <ol className="list-decimal list-inside space-y-1 ml-2" style={{ color: 'var(--text-secondary)' }}>
                  <li>Click on the user you just created</li>
                  <li>Go to <span style={{ color: 'var(--accent)' }}>Security credentials</span> tab</li>
                  <li>Scroll down to <span style={{ color: 'var(--text)' }}>Access keys</span> and click <span style={{ color: 'var(--text)' }}>Create access key</span></li>
                  <li>Select <span style={{ color: 'var(--warning)' }}>Application running outside AWS</span>, click Next</li>
                  <li>Click <span style={{ color: 'var(--text)' }}>Create access key</span></li>
                  <li>Copy the <span style={{ color: 'var(--success)' }}>Access key ID</span> and <span style={{ color: 'var(--success)' }}>Secret access key</span> - paste them below</li>
                </ol>
                <p className="mt-1 text-xs" style={{ color: 'var(--error)' }}>Important: Save the secret key now! You cannot view it again after closing this page.</p>
              </div>

              <div>
                <p className="font-medium mb-1" style={{ color: 'var(--text)' }}>Step 4: Fill in the fields below and click Save</p>
                <p style={{ color: 'var(--text-secondary)' }}>The app will test the connection when you save. If successful, you are ready to start uploading.</p>
              </div>

              <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                  <DollarSign size={14} style={{ color: 'var(--accent)' }} />
                  Costs (Glacier Deep Archive)
                </p>
                <ul className="space-y-0.5 ml-2" style={{ color: 'var(--text-secondary)' }}>
                  <li>&bull; <span style={{ color: 'var(--text)' }}>Storage:</span> ~$0.99/TB/month (~$1/TB)</li>
                  <li>&bull; <span style={{ color: 'var(--text)' }}>Upload (PUT):</span> $0.05 per 1,000 requests (one-time)</li>
                  <li>&bull; <span style={{ color: 'var(--text)' }}>Retrieval:</span> $0.02/GB + 12-48 hour delay (emergency use only)</li>
                  <li>&bull; <span style={{ color: 'var(--text)' }}>Example:</span> 9 TB backup = ~$9/month, ~$108/year</li>
                </ul>
              </div>

              <div className="pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <p className="font-medium mb-1 flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                  <Shield size={14} style={{ color: 'var(--accent)' }} />
                  Optional: Restrict permissions to one bucket
                </p>
                <p className="mb-2" style={{ color: 'var(--text-secondary)' }}>Instead of AmazonS3FullAccess, create a custom IAM policy:</p>
                <pre
                  className="p-3 text-xs overflow-x-auto"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-xs)',
                    fontFamily: 'var(--font-mono)',
                    border: '1px solid var(--border)',
                  }}
                >{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:ListBucket", "s3:DeleteObject"],
    "Resource": [
      "arn:aws:s3:::YOUR-BUCKET-NAME",
      "arn:aws:s3:::YOUR-BUCKET-NAME/*"
    ]
  }]
}`}</pre>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Access Key ID" name="aws_access_key" value={settings.aws_access_key || ''} onChange={updateField} placeholder="AKIA..." />
            <SettingField label="Secret Access Key" name="aws_secret_key" value={settings.aws_secret_key || ''} type="password" onChange={updateField} placeholder="Secret key" />
            <SettingField label="Region" name="aws_region" value={settings.aws_region || 'eu-west-2'} onChange={updateField} />
            <SettingField label="S3 Bucket Name" name="aws_bucket" value={settings.aws_bucket || ''} onChange={updateField} placeholder="my-glacier-backups" />
          </div>
        </section>

        {/* NAS Section */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <HardDrive size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold">NAS Configuration</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="NAS Mount Path" name="nas_mount_path" value={settings.nas_mount_path || '/mnt/nas'} onChange={updateField} />
          </div>
        </section>

        {/* Schedule Section */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold">Upload Schedule</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SettingField label="Start Hour (24h)" name="upload_start_hour" value={settings.upload_start_hour || '23'} type="number" onChange={updateField} />
            <SettingField label="End Hour (24h)" name="upload_end_hour" value={settings.upload_end_hour || '7'} type="number" onChange={updateField} />
            <SettingField label="Bandwidth Limit (Mbps)" name="bandwidth_limit_mbps" value={settings.bandwidth_limit_mbps || '3'} type="number" onChange={updateField} />
          </div>
        </section>

        {/* Sonarr/Radarr Section */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Tv size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold">Sonarr / Radarr</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Sonarr URL" name="sonarr_url" value={settings.sonarr_url || ''} onChange={updateField} placeholder="http://192.168.3.98:8989" />
            <SettingField label="Sonarr API Key" name="sonarr_api_key" value={settings.sonarr_api_key || ''} onChange={updateField} />
            <SettingField label="Radarr URL" name="radarr_url" value={settings.radarr_url || ''} onChange={updateField} placeholder="http://192.168.3.119:7878" />
            <SettingField label="Radarr API Key" name="radarr_api_key" value={settings.radarr_api_key || ''} onChange={updateField} />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold">Notifications</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Webhook URL (Discord/Slack)" name="notification_webhook_url" value={settings.notification_webhook_url || ''} onChange={updateField} placeholder="https://discord.com/api/webhooks/..." />
            <SettingField label="Email (optional)" name="notification_email" value={settings.notification_email || ''} onChange={updateField} placeholder="you@example.com" />
          </div>
          <div className="flex gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={settings.notification_on_complete === 'true'}
                onChange={e => updateField('notification_on_complete', e.target.checked ? 'true' : 'false')}
                className="rounded"
                style={{ accentColor: 'var(--accent)' }}
              />
              Notify on upload complete
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              <input
                type="checkbox"
                checked={settings.notification_on_error === 'true'}
                onChange={e => updateField('notification_on_error', e.target.checked ? 'true' : 'false')}
                className="rounded"
                style={{ accentColor: 'var(--accent)' }}
              />
              Notify on errors
            </label>
          </div>
        </section>

        {/* AI Assistant Section */}
        <section className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Bot size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-sm font-semibold">AI Assistant</h2>
          </div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-dim)' }}>
            Add your own Claude API key to enable the AI assistant. Get one at{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              console.anthropic.com
              <ExternalLink size={12} />
            </a>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Claude API Key" name="claude_api_key" value={settings.claude_api_key || ''} type="password" onChange={updateField} placeholder="sk-ant-..." />
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Model</label>
              <select
                value={settings.claude_model || 'claude-sonnet-4-5-20250929'}
                onChange={e => updateField('claude_model', e.target.value)}
                className="input-field w-full px-3 py-2 text-sm"
              >
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 — $0.80/$4 per MTok (fastest, cheapest)</option>
                <option value="claude-sonnet-4-5-20250929">Claude Sonnet 4.5 — $3/$15 per MTok (recommended)</option>
                <option value="claude-opus-4-6">Claude Opus 4.6 — $15/$75 per MTok (most capable)</option>
              </select>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--text-dim)' }}>Cost tracking is shown on the AI Assistant page. Pricing: input/output per million tokens.</p>
        </section>
      </div>
    </div>
  );
}
