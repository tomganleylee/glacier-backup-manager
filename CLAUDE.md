# Glacier Backup Manager - Claude Code Guide

## What This Is
A Next.js 14 web app that manages backing up a 33 TB Unraid NAS to AWS S3 Glacier Deep Archive. It handles file selection, upload scheduling, Sonarr/Radarr integration, rarity scoring, and GPU-accelerated transcoding.

## Infrastructure

| Component | Address | Access |
|-----------|---------|--------|
| **App (LXC)** | 192.168.3.202:3000 | SSH as root, systemd service `glacier-backup` |
| **Unraid NAS** | 192.168.3.188 | NFS mount at `/mnt/nas` on LXC, SMB `\\192.168.3.188\noobnoob` from Windows |
| **Sonarr** | 192.168.3.98:8989 | API key in settings DB |
| **Radarr** | 192.168.3.119:7878 | API key in settings DB |
| **Gaming PC** | Windows, 9800x3d + RTX 5080 | Runs transcode worker via PowerShell |

## How to Interact with the App

### Quick status check
```bash
ssh root@192.168.3.202 'curl -s http://localhost:3000/api/status' 2>/dev/null
```
Returns: backup queue stats, transcode stats, shows summary, movies summary, scheduler state, recent activity, and non-sensitive settings.

### Key API endpoints
- `GET /api/status` — Full system summary (use this first)
- `GET /api/files?path=<relative>` — Browse NAS files with backup status
- `GET /api/shows` — List all shows with rarity, codec, size
- `GET /api/movies` — List all movies with rarity, codec, size
- `GET /api/backup` — List backup queue items
- `GET /api/transcode` — List transcode jobs
- `GET /api/settings` — All settings (sensitive keys masked)
- `POST /api/shows/sync` — Sync shows from Sonarr
- `POST /api/movies/sync` — Sync movies from Radarr
- `POST /api/shows/<id>/transcode` — Queue a show for transcoding
- `POST /api/movies/<id>/transcode` — Queue a movie for transcoding
- `POST /api/backup` — Add items to backup queue (JSON array of {path, type, size_bytes, priority})
- `POST /api/scheduler` — Start/stop scheduler (`{action: "start"}` or `{action: "stop"}`)
- `POST /api/manifest/scan` — Scan NAS to populate manifest

### Direct database queries
```bash
ssh root@192.168.3.202 'sqlite3 /opt/glacier-backup-manager/data/backup.db "YOUR SQL HERE"'
```
Tables: `settings`, `backup_items`, `shows`, `movies`, `upload_log`, `transcode_jobs`, `upload_stats`, `manifest`, `transcode_profiles`

### App management
```bash
ssh root@192.168.3.202 'systemctl restart glacier-backup'   # restart app
ssh root@192.168.3.202 'systemctl status glacier-backup'    # check status
ssh root@192.168.3.202 'journalctl -u glacier-backup -n 50' # view logs
```

### Deploy code changes
```bash
scp <local-file> root@192.168.3.202:/opt/glacier-backup-manager/<path>
ssh root@192.168.3.202 'cd /opt/glacier-backup-manager && npm run build 2>&1 | tail -5'
ssh root@192.168.3.202 'systemctl restart glacier-backup'
```

## Tech Stack
- **Framework:** Next.js 14 (App Router), React, Tailwind CSS
- **Database:** SQLite via better-sqlite3 (WAL mode)
- **Uploads:** rclone with S3 Glacier Deep Archive storage class
- **Transcoding:** ffmpeg with NVENC (hevc_nvenc/av1_nvenc) on gaming PC
- **NAS mount:** NFS from LXC to Unraid at `/mnt/nas`

## Important Notes
- SQLite uses single quotes for string literals, double quotes are column identifiers
- Sonarr paths use `/mnt/noobnoob/` prefix, NAS mount is `/mnt/nas/` — the app translates between them
- The gaming PC worker (`scripts/gaming-pc-worker.ps1`) accesses files via SMB, creates `.hevc.mkv` files alongside originals
- Never delete original files — the user wants to compare quality before deciding
- AWS bucket: `toms-backup-aws`, region: `eu-north-1`
- Upload window: 23:00-07:00, bandwidth limit: 100 Mbps (configurable)
- Proxmox host: 192.168.3.137 (SSH key installed for passwordless access from both Windows PC and backup LXC)

## Build & Run
```bash
cd /opt/glacier-backup-manager
npm run build
npm start  # or systemctl restart glacier-backup
```
The app runs on port 3000. No Windows build is needed — build directly on the LXC.
