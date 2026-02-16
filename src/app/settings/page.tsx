'use client';

import { useEffect, useState } from 'react';

interface Settings {
  [key: string]: string;
}

function SettingField({ label, name, value, type, onChange, placeholder }: {
  label: string; name: string; value: string; type?: string;
  onChange: (name: string, value: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        type={type || 'text'}
        value={value}
        onChange={e => onChange(name, e.target.value)}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({});
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

  if (loading) return <div className="text-gray-500">Loading settings...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-gray-500 text-sm">Configure AWS, NAS, and scheduling</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 rounded-lg font-medium text-sm"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {message && (
        <div className={'mb-6 p-3 rounded-lg text-sm ' +
          (message.includes('failed') || message.includes('Failed')
            ? 'bg-red-950 border border-red-800 text-red-300'
            : 'bg-green-950 border border-green-800 text-green-300')}>
          {message}
        </div>
      )}

      <div className="space-y-8">
        {/* AWS Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold">AWS Glacier Configuration</h2>
            <button
              onClick={() => setShowAwsGuide(prev => !prev)}
              className="text-xs text-blue-400 hover:text-blue-300 underline"
            >
              {showAwsGuide ? 'Hide setup guide' : 'How to set this up?'}
            </button>
          </div>

          {showAwsGuide && (
            <div className="mb-6 p-4 bg-gray-950 border border-gray-800 rounded-lg text-sm space-y-4">
              <h3 className="font-semibold text-blue-400">AWS S3 Glacier Deep Archive Setup Guide</h3>

              <div>
                <p className="font-medium text-white mb-1">Step 1: Create an S3 Bucket</p>
                <ol className="list-decimal list-inside text-gray-400 space-y-1 ml-2">
                  <li>Go to <span className="text-blue-400">AWS Console &rarr; S3</span></li>
                  <li>Click <span className="text-white">Create bucket</span></li>
                  <li>Enter a bucket name (e.g. <span className="text-yellow-300">my-nas-glacier-backup</span>)</li>
                  <li>Select your region (e.g. <span className="text-yellow-300">eu-west-2</span> for London)</li>
                  <li>Leave all other settings as default and click <span className="text-white">Create bucket</span></li>
                </ol>
                <p className="text-gray-500 mt-1 text-xs">Note: You do NOT need to set the default storage class. The app uses rclone which specifies Glacier Deep Archive per upload.</p>
              </div>

              <div>
                <p className="font-medium text-white mb-1">Step 2: Create an IAM User</p>
                <ol className="list-decimal list-inside text-gray-400 space-y-1 ml-2">
                  <li>Go to <span className="text-blue-400">AWS Console &rarr; IAM &rarr; Users</span></li>
                  <li>Click <span className="text-white">Create user</span></li>
                  <li>Name it something like <span className="text-yellow-300">glacier-backup-uploader</span></li>
                  <li>Click <span className="text-white">Next</span>, then <span className="text-white">Attach policies directly</span></li>
                  <li>Search for and select <span className="text-yellow-300">AmazonS3FullAccess</span> (or create a custom policy for just your bucket)</li>
                  <li>Click <span className="text-white">Next</span>, then <span className="text-white">Create user</span></li>
                </ol>
              </div>

              <div>
                <p className="font-medium text-white mb-1">Step 3: Create Access Keys</p>
                <ol className="list-decimal list-inside text-gray-400 space-y-1 ml-2">
                  <li>Click on the user you just created</li>
                  <li>Go to <span className="text-blue-400">Security credentials</span> tab</li>
                  <li>Scroll down to <span className="text-white">Access keys</span> and click <span className="text-white">Create access key</span></li>
                  <li>Select <span className="text-yellow-300">Application running outside AWS</span>, click Next</li>
                  <li>Click <span className="text-white">Create access key</span></li>
                  <li>Copy the <span className="text-green-400">Access key ID</span> and <span className="text-green-400">Secret access key</span> - paste them below</li>
                </ol>
                <p className="text-red-400 mt-1 text-xs">Important: Save the secret key now! You cannot view it again after closing this page.</p>
              </div>

              <div>
                <p className="font-medium text-white mb-1">Step 4: Fill in the fields below and click Save</p>
                <p className="text-gray-400">The app will test the connection when you save. If successful, you are ready to start uploading.</p>
              </div>

              <div className="pt-2 border-t border-gray-800">
                <p className="font-medium text-white mb-1">Costs (Glacier Deep Archive)</p>
                <ul className="text-gray-400 space-y-0.5 ml-2">
                  <li>&bull; <span className="text-white">Storage:</span> ~$0.99/TB/month (~$1/TB)</li>
                  <li>&bull; <span className="text-white">Upload (PUT):</span> $0.05 per 1,000 requests (one-time)</li>
                  <li>&bull; <span className="text-white">Retrieval:</span> $0.02/GB + 12-48 hour delay (emergency use only)</li>
                  <li>&bull; <span className="text-white">Example:</span> 9 TB backup = ~$9/month, ~$108/year</li>
                </ul>
              </div>

              <div className="pt-2 border-t border-gray-800">
                <p className="font-medium text-white mb-1">Optional: Restrict permissions to one bucket</p>
                <p className="text-gray-400 mb-2">Instead of AmazonS3FullAccess, create a custom IAM policy:</p>
                <pre className="bg-gray-900 p-3 rounded text-xs text-gray-300 overflow-x-auto">{`{
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
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">NAS Configuration</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="NAS Mount Path" name="nas_mount_path" value={settings.nas_mount_path || '/mnt/nas'} onChange={updateField} />
          </div>
        </section>

        {/* Schedule Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Upload Schedule</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SettingField label="Start Hour (24h)" name="upload_start_hour" value={settings.upload_start_hour || '23'} type="number" onChange={updateField} />
            <SettingField label="End Hour (24h)" name="upload_end_hour" value={settings.upload_end_hour || '7'} type="number" onChange={updateField} />
            <SettingField label="Bandwidth Limit (Mbps)" name="bandwidth_limit_mbps" value={settings.bandwidth_limit_mbps || '3'} type="number" onChange={updateField} />
          </div>
        </section>

        {/* Sonarr/Radarr Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Sonarr / Radarr</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Sonarr URL" name="sonarr_url" value={settings.sonarr_url || ''} onChange={updateField} placeholder="http://192.168.3.98:8989" />
            <SettingField label="Sonarr API Key" name="sonarr_api_key" value={settings.sonarr_api_key || ''} onChange={updateField} />
            <SettingField label="Radarr URL" name="radarr_url" value={settings.radarr_url || ''} onChange={updateField} placeholder="http://192.168.3.119:7878" />
            <SettingField label="Radarr API Key" name="radarr_api_key" value={settings.radarr_api_key || ''} onChange={updateField} />
          </div>
        </section>

        {/* Notifications Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">Notifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Webhook URL (Discord/Slack)" name="notification_webhook_url" value={settings.notification_webhook_url || ''} onChange={updateField} placeholder="https://discord.com/api/webhooks/..." />
            <SettingField label="Email (optional)" name="notification_email" value={settings.notification_email || ''} onChange={updateField} placeholder="you@example.com" />
          </div>
          <div className="flex gap-6 mt-4">
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={settings.notification_on_complete === 'true'}
                onChange={e => updateField('notification_on_complete', e.target.checked ? 'true' : 'false')}
                className="rounded"
              />
              Notify on upload complete
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-400">
              <input
                type="checkbox"
                checked={settings.notification_on_error === 'true'}
                onChange={e => updateField('notification_on_error', e.target.checked ? 'true' : 'false')}
                className="rounded"
              />
              Notify on errors
            </label>
          </div>
        </section>

        {/* AI Assistant Section */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4">AI Assistant</h2>
          <p className="text-sm text-gray-500 mb-4">
            Add your own Claude API key to enable the AI assistant. Get one at{' '}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
              console.anthropic.com
            </a>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SettingField label="Claude API Key" name="claude_api_key" value={settings.claude_api_key || ''} type="password" onChange={updateField} placeholder="sk-ant-..." />
          </div>
        </section>
      </div>
    </div>
  );
}
