#!/bin/bash
# LXC Bootstrap Script for Glacier Backup Manager
# Run as root on the Proxmox LXC (Debian 13)
set -e

echo "========================================="
echo "  Glacier Backup Manager - LXC Setup"
echo "========================================="

# Update system
echo "[1/6] Updating system..."
apt-get update && apt-get upgrade -y

# Install Node.js 20 LTS
echo "[2/6] Installing Node.js 20 LTS..."
apt-get install -y ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
apt-get update
apt-get install -y nodejs

echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"

# Install rclone
echo "[3/6] Installing rclone..."
curl https://rclone.org/install.sh | bash
echo "  rclone: $(rclone --version | head -1)"

# Install NFS client
echo "[4/6] Installing NFS client..."
apt-get install -y nfs-common

# Create NAS mount point
echo "[5/6] Setting up NAS mount..."
mkdir -p /mnt/nas

# Add NFS mount to fstab (Unraid NAS)
if ! grep -q "192.168.3.188" /etc/fstab; then
    echo "192.168.3.188:/mnt/user/noobnoob /mnt/nas nfs rw,soft,intr,rsize=8192,wsize=8192 0 0" >> /etc/fstab
    echo "  Added NFS mount to fstab"
else
    echo "  NFS mount already in fstab"
fi

# Try mounting (will fail if NFS not enabled on Unraid yet)
mount /mnt/nas 2>/dev/null && echo "  NAS mounted successfully!" || echo "  WARNING: NFS mount failed. Enable NFS on Unraid first."

# Install git
echo "[6/6] Installing git..."
apt-get install -y git

# Create app directory
mkdir -p /opt/glacier-backup-manager
mkdir -p /opt/glacier-backup-manager/data

echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  Node.js: $(node --version)"
echo "  npm: $(npm --version)"
echo "  rclone: $(rclone --version | head -1)"
echo "  git: $(git --version)"
echo ""
echo "  NAS mount: /mnt/nas"
echo "  App dir: /opt/glacier-backup-manager"
echo ""
echo "  Next: Enable NFS export on Unraid for /mnt/user"
echo "  Then: mount /mnt/nas"
echo "========================================="
