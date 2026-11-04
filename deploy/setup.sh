#!/usr/bin/env bash
# Run once on a fresh Ubuntu server: sudo bash deploy/setup.sh
# Installs what the app needs. It holds no secrets and changes nothing in the app itself.
set -euo pipefail

NODE_MAJOR=22
APP_DIR=/var/www/replypilot
APP_USER="${SUDO_USER:-ubuntu}"

echo "==> Updating system"
apt-get update -y
apt-get upgrade -y

echo "==> Installing Node.js ${NODE_MAJOR}"
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt-get install -y nodejs

echo "==> Installing pnpm and PM2"
npm install -g pnpm@10.33.0 pm2

echo "==> Installing Postgres client, used for taking backups by hand"
apt-get install -y postgresql-client

echo "==> Installing Nginx and Certbot"
apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Creating the app folder"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Starting PM2 on boot, with log rotation"
sudo -u "$APP_USER" pm2 install pm2-logrotate
sudo -u "$APP_USER" pm2 set pm2-logrotate:max_size 50M
sudo -u "$APP_USER" pm2 set pm2-logrotate:retain 14
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$APP_USER" --hp "$(eval echo "~$APP_USER")"

echo "==> Firewall: only SSH and web traffic"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "Done. Next, follow docs/deploy.md."
