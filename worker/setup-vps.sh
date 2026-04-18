#!/bin/bash
#
# KeiroAI VPS Setup — One-shot script for OVH VPS
# Run as root: curl -sL https://raw.githubusercontent.com/zirraro/keiro/main/worker/setup-vps.sh | bash
#
# What it does:
#   1. Install Node.js 20, PM2, Nginx
#   2. Clone the repo + build Next.js
#   3. Setup Nginx reverse proxy with SSL (Let's Encrypt)
#   4. Start the app + worker with PM2
#   5. Setup deploy SSH key for GitHub Actions
#
set -e

echo "═══════════════════════════════════════════"
echo "🚀 KeiroAI VPS Setup"
echo "═══════════════════════════════════════════"

# ── 1. System packages ─────────────────────────
echo "📦 Installing system packages..."
apt-get update -qq
apt-get install -y -qq curl git nginx certbot python3-certbot-nginx ufw jq

# ── 2. Node.js 20 ──────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v) != v20* ]]; then
  echo "📦 Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
echo "   Node: $(node -v), npm: $(npm -v)"

# ── 3. PM2 ──────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "📦 Installing PM2..."
  npm install -g pm2
fi
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# ── 4. Firewall ─────────────────────────────────
echo "🔒 Configuring firewall..."
ufw allow ssh
ufw allow 'Nginx Full'
ufw --force enable

# ── 5. App user + directories ───────────────────
echo "📁 Setting up app directory..."
mkdir -p /opt/keiro /var/log/keiro
cd /opt/keiro

# ── 6. Clone or pull repo ──────────────────────
if [ -d ".git" ]; then
  echo "📥 Pulling latest..."
  git pull origin main
else
  echo "📥 Cloning repo..."
  git clone https://github.com/zirraro/keiro.git .
fi

# ── 7. Environment file ────────────────────────
if [ ! -f ".env.local" ]; then
  echo ""
  echo "═══════════════════════════════════════════"
  echo "⚠️  .env.local not found!"
  echo "   Copy your Vercel env vars to /opt/keiro/.env.local"
  echo "   You can get them from: Vercel Dashboard → Settings → Environment Variables"
  echo "   Or run: vercel env pull .env.local"
  echo ""
  echo "   Required vars:"
  echo "   - NEXT_PUBLIC_SUPABASE_URL"
  echo "   - SUPABASE_SERVICE_ROLE_KEY"
  echo "   - NEXT_PUBLIC_SUPABASE_ANON_KEY"
  echo "   - ANTHROPIC_API_KEY"
  echo "   - GEMINI_API_KEY"
  echo "   - CRON_SECRET"
  echo "   - RESEND_API_KEY"
  echo "   - BREVO_API_KEY"
  echo "   - SEEDREAM_API_KEY"
  echo "   - (... all others from Vercel)"
  echo ""
  echo "   Create the file, then re-run this script."
  echo "═══════════════════════════════════════════"
  exit 1
fi

# ── 8. Install + Build ─────────────────────────
echo "📦 Installing dependencies..."
npm ci --production=false 2>&1 | tail -3

echo "🔨 Building Next.js..."
npm run build 2>&1 | tail -10

echo "✅ Build OK"

# ── 9. Nginx config ────────────────────────────
echo "🌐 Configuring Nginx..."
cat > /etc/nginx/sites-available/keiro <<'NGINX'
server {
    listen 80;
    server_name keiroai.com www.keiroai.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Increase timeouts for long agent runs (no more 300s limit!)
    proxy_read_timeout 600s;
    proxy_connect_timeout 30s;
    proxy_send_timeout 600s;

    # Max body size for file uploads
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/keiro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# ── 10. SSL (Let's Encrypt) ────────────────────
echo "🔐 Setting up SSL..."
echo "   Make sure keiroai.com DNS points to this server (51.68.226.25)"
echo "   before running certbot."
echo ""
echo "   Run manually when DNS is ready:"
echo "   certbot --nginx -d keiroai.com -d www.keiroai.com --non-interactive --agree-tos -m contact@keiroai.com"
echo ""

# ── 11. PM2 processes ──────────────────────────
echo "🚀 Starting app + worker..."

# Stop existing if any
pm2 delete keiro-app 2>/dev/null || true
pm2 delete keiro-worker 2>/dev/null || true

# Start Next.js app
pm2 start npm --name keiro-app -- start

# Start worker scheduler
pm2 start worker/ecosystem.config.cjs

# Save PM2 config for auto-restart on reboot
pm2 save

echo ""
echo "═══════════════════════════════════════════"
echo "✅ KeiroAI VPS Setup Complete!"
echo ""
echo "📊 Status:"
pm2 list
echo ""
echo "📝 Next steps:"
echo "   1. Copy .env.local from Vercel (if not done)"
echo "   2. Point DNS keiroai.com → 51.68.226.25"
echo "   3. Run: certbot --nginx -d keiroai.com -d www.keiroai.com"
echo "   4. Disable Vercel crons (empty vercel.json crons array)"
echo ""
echo "📋 Commands:"
echo "   pm2 logs keiro-app      — App logs"
echo "   pm2 logs keiro-worker   — Worker/cron logs"
echo "   pm2 monit               — Live monitoring"
echo "   pm2 restart all         — Restart everything"
echo "   cd /opt/keiro && git pull && npm run build && pm2 restart all  — Manual deploy"
echo "═══════════════════════════════════════════"
