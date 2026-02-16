#!/usr/bin/env bash
# ============================================================================
# Glacier Backup Manager — LXC Setup Script
# ============================================================================
#
# Bootstraps a fresh Debian/Ubuntu LXC container with everything needed
# to run the Glacier Backup Manager:
#   - Node.js 20 LTS
#   - rclone
#   - NFS client + mount to your NAS
#   - Builds the Next.js app
#   - Creates a systemd service for auto-start
#
# Usage:
#   1. Create an LXC in Proxmox:
#        - Template: Debian 13 / Ubuntu 22.04+
#        - RAM: 1 GB (512 MB minimum)
#        - Disk: 16 GB recommended (10 GB minimum)
#        - Cores: 2 recommended
#        - Network: DHCP or static IP on your LAN
#
#   2. SSH in and run:
#        apt update && apt install -y git curl
#        git clone https://github.com/tomganleylee/glacier-backup-manager.git /opt/glacier-backup-manager
#        cd /opt/glacier-backup-manager
#        bash scripts/setup-lxc.sh
#
#   3. Open http://<lxc-ip>:3000 and configure your settings.
#
# You can also pass NAS details as environment variables:
#   NAS_IP=192.168.1.100 NAS_SHARE=/mnt/user/data bash scripts/setup-lxc.sh
#
# ============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
NAS_IP="${NAS_IP:-}"
NAS_SHARE="${NAS_SHARE:-}"
NAS_MOUNT="${NAS_MOUNT:-/mnt/nas}"
APP_DIR="${APP_DIR:-/opt/glacier-backup-manager}"
APP_PORT="${APP_PORT:-3000}"

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ OK ]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; }

# ---------------------------------------------------------------------------
# Root check
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    fail "This script must be run as root."
    exit 1
fi

echo ""
echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}  Glacier Backup Manager — LXC Setup${NC}"
echo -e "${CYAN}================================================================${NC}"
echo ""

# ---------------------------------------------------------------------------
# Interactive prompts (skip if env vars are set)
# ---------------------------------------------------------------------------
if [[ -z "$NAS_IP" ]]; then
    read -rp "  Enter your NAS IP address (e.g. 192.168.1.100): " NAS_IP
fi

if [[ -z "$NAS_SHARE" ]]; then
    read -rp "  Enter the NFS export path on your NAS (e.g. /mnt/user/data): " NAS_SHARE
fi

echo ""
info "NAS:     $NAS_IP:$NAS_SHARE -> $NAS_MOUNT"
info "App:     $APP_DIR"
info "Port:    $APP_PORT"
echo ""

# ---------------------------------------------------------------------------
# 1. System packages
# ---------------------------------------------------------------------------
info "Installing system packages..."
apt-get update -qq > /dev/null
apt-get install -y -qq curl wget gnupg2 ca-certificates nfs-common sqlite3 git > /dev/null 2>&1
ok "System packages installed"

# ---------------------------------------------------------------------------
# 2. Node.js 20 LTS
# ---------------------------------------------------------------------------
if command -v node &> /dev/null && [[ "$(node --version)" == v20* ]]; then
    ok "Node.js already installed: $(node --version)"
else
    info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
    apt-get install -y -qq nodejs > /dev/null 2>&1
    ok "Node.js installed: $(node --version) / npm $(npm --version)"
fi

# ---------------------------------------------------------------------------
# 3. rclone
# ---------------------------------------------------------------------------
if command -v rclone &> /dev/null; then
    ok "rclone already installed: $(rclone --version | head -1)"
else
    info "Installing rclone..."
    curl -fsSL https://rclone.org/install.sh | bash > /dev/null 2>&1
    ok "rclone installed: $(rclone --version | head -1)"
fi

# ---------------------------------------------------------------------------
# 4. NFS mount
# ---------------------------------------------------------------------------
info "Setting up NFS mount..."
mkdir -p "$NAS_MOUNT"

if [[ -n "$NAS_IP" && -n "$NAS_SHARE" ]]; then
    if ! grep -q "$NAS_IP:$NAS_SHARE" /etc/fstab 2>/dev/null; then
        echo "$NAS_IP:$NAS_SHARE $NAS_MOUNT nfs rw,soft,intr,rsize=8192,wsize=8192 0 0" >> /etc/fstab
        ok "Added NFS mount to /etc/fstab"
    else
        ok "NFS mount already in /etc/fstab"
    fi

    if mountpoint -q "$NAS_MOUNT" 2>/dev/null; then
        ok "NAS already mounted at $NAS_MOUNT"
    else
        if mount "$NAS_MOUNT" 2>/dev/null; then
            ok "NAS mounted at $NAS_MOUNT"
        else
            warn "Could not mount NAS — enable NFS export on your NAS first"
            warn "  Unraid: Settings > NFS > Enable, then edit the share's NFS settings"
            warn "  After enabling, run: mount $NAS_MOUNT"
        fi
    fi
else
    warn "No NAS details provided — skipping NFS mount setup"
    warn "  You can mount manually later and set the path in Settings"
fi

# ---------------------------------------------------------------------------
# 5. Install dependencies & build
# ---------------------------------------------------------------------------
if [[ ! -d "$APP_DIR" ]]; then
    fail "App directory not found at $APP_DIR"
    echo "  Clone the repo first:"
    echo "  git clone https://github.com/tomganleylee/glacier-backup-manager.git $APP_DIR"
    exit 1
fi

cd "$APP_DIR"
mkdir -p "$APP_DIR/data"

info "Installing npm dependencies (this may take a minute)..."
npm install > /dev/null 2>&1
ok "Dependencies installed"

info "Building Next.js app..."
npx next build > /dev/null 2>&1
ok "Build complete"

# ---------------------------------------------------------------------------
# 6. systemd service
# ---------------------------------------------------------------------------
info "Creating systemd service..."

cat > /etc/systemd/system/glacier-backup.service << EOF
[Unit]
Description=Glacier Backup Manager
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/npx next start -p $APP_PORT -H 0.0.0.0
Restart=on-failure
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable glacier-backup.service > /dev/null 2>&1
systemctl start glacier-backup.service
ok "Service created and started"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
LXC_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}================================================================${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}================================================================${NC}"
echo ""
echo "  Node.js:  $(node --version)"
echo "  npm:      $(npm --version)"
echo "  rclone:   $(rclone --version | head -1)"
echo ""
echo -e "  Open ${CYAN}http://${LXC_IP}:${APP_PORT}${NC} in your browser"
echo ""
echo "  Next steps:"
echo "    1. Go to Settings and configure your AWS credentials"
echo "    2. Set your NAS mount path to: $NAS_MOUNT"
echo "    3. Configure your upload schedule"
echo "    4. Browse files and select what to back up"
echo "    5. Click 'Start Scheduler' on the Dashboard"
echo ""
echo "  Commands:"
echo "    systemctl status glacier-backup     # Check status"
echo "    systemctl restart glacier-backup    # Restart"
echo "    journalctl -u glacier-backup -f     # Live logs"
echo ""
