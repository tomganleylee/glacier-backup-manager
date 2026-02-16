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
          <h2 className="text-lg font-semibold mb-4">AWS Glacier Configuration</h2>
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
      </div>
    </div>
  );
}
