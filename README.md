# Glacier Backup Manager

A web-based NAS backup management tool for AWS S3 Glacier Deep Archive. Built for Unraid NAS users who want full control over what gets backed up, when uploads happen, and how much bandwidth is used.

## Features

- **Dashboard** — Real-time upload progress, queue status, and daily stats
- **File Browser** — Browse NAS contents, select files/folders for backup with priority levels
- **Shows Manager** — Sonarr/Radarr integration with automatic rarity scoring (rare/moderate/easy)
- **Transcode Queue** — Queue x264→x265 transcoding jobs, processed by a gaming PC worker via NVENC
- **Manifest** — Searchable inventory of all NAS content with backup status
- **Night Scheduler** — Uploads only during configurable hours (default 11pm–7am) with bandwidth limiting
- **Settings** — Configure AWS credentials, NAS mount, Sonarr/Radarr, and schedule

## Tech Stack

- **Next.js 14** (App Router) + React + Tailwind CSS
- **SQLite** via better-sqlite3
- **rclone** for S3 Glacier Deep Archive uploads
- **Node.js 20 LTS**

## Quick Start

### Prerequisites

- Debian/Ubuntu LXC or VM with:
  - Node.js 20+
  - rclone
  - NFS mount to your NAS
- AWS account with S3 bucket configured for Glacier Deep Archive

### Installation

```bash
# Clone the repo
git clone https://github.com/tomganleylee/glacier-backup-manager.git
cd glacier-backup-manager

# Install dependencies
npm install

# Build
npx next build

# Start (production)
npx next start -p 3000 -H 0.0.0.0
```

Or use the LXC setup script:

```bash
# On a fresh Debian 13 LXC
bash scripts/setup-lxc.sh
```

### Systemd Service

```bash
# Copy the service file
sudo cp glacier-backup.service /etc/systemd/system/
sudo systemctl enable --now glacier-backup.service
```

Then open `http://<your-lxc-ip>:3000` in your browser.

## Architecture

```
LXC Container (192.168.x.x)
├── Next.js app (port 3000)
├── SQLite database (data/backup.db)
├── rclone (S3 Glacier uploads)
└── NFS mount → Unraid NAS

Gaming PC (optional)
└── PowerShell worker → polls /api/transcode/worker
    └── ffmpeg NVENC (x264→x265)
```

## Gaming PC Transcode Worker

Run on your Windows gaming PC with an NVIDIA GPU:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/gaming-pc-worker.ps1 -ServerUrl http://<lxc-ip>:3000
```

## Cost

- **Glacier Deep Archive**: ~$1/TB/month storage
- **9 TB backup**: ~$9/month ($108/year)
- **PUT requests**: ~$20-50 one-time for initial upload

## License

MIT
