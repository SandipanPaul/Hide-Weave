#!/usr/bin/env bash
#
# One-shot deployment onto a fresh Linux server. Supports Oracle Linux / RHEL
# (dnf, firewalld) and Debian / Ubuntu (apt, ufw).
#
# Run it from the checkout, as a user with sudo:
#
#   bash scripts/deploy.sh hideweave.example.com
#
# Safe to run again: it never overwrites an existing .env, and re-running
# rebuilds and restarts rather than starting over.
#
# It refuses rather than guesses when something is already serving on 80/443 —
# on a shared box, quietly taking those ports would take the other site down.

set -euo pipefail

HOSTNAME_ARG="${1:-}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE=hide-weave
PORT="${PORT:-3000}"

die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
note() { printf '    %s\n' "$*"; }

[ -n "$HOSTNAME_ARG" ] || die "Usage: bash scripts/deploy.sh <hostname>

A hostname is required, not an IP: certificates are issued to names, and this
app refuses to work over plain HTTP because its session cookie is Secure-only.

If you have no domain, sslip.io needs no signup — for 203.0.113.5 use:
  bash scripts/deploy.sh 203-0-113-5.sslip.io"

case "$HOSTNAME_ARG" in
  *[0-9].[0-9]*.[0-9]*.[0-9]*)
    case "$HOSTNAME_ARG" in
      *.*[a-zA-Z]*) : ;;   # 1-2-3-4.sslip.io — a name, fine
      *) die "$HOSTNAME_ARG looks like a bare IP. Certificates are only issued
to names. Point a domain at it, or use <dashed-ip>.sslip.io." ;;
    esac
    ;;
esac

# ------------------------------------------------------------- which distro
if command -v dnf >/dev/null; then
  PKG=dnf
elif command -v apt-get >/dev/null; then
  PKG=apt
else
  die "Need dnf or apt. This script supports Oracle Linux/RHEL and Debian/Ubuntu."
fi
. /etc/os-release 2>/dev/null || true
step "Server"
note "${PRETTY_NAME:-unknown} ($(uname -m)), package manager: $PKG"

# ------------------------------------------- is anything already on 80/443?
step "Checking ports 80 and 443"
LISTENERS="$(sudo ss -lntp 2>/dev/null | awk 'NR>1 && ($4 ~ /:80$/ || $4 ~ /:443$/)' || true)"
if [ -n "$LISTENERS" ]; then
  if printf '%s' "$LISTENERS" | grep -q caddy; then
    note "Caddy is already here — this will add a site to its config, not replace it."
    CADDY_EXISTS=yes
  else
    printf '\n%s\n' "$LISTENERS" >&2
    die "Something else is already serving on 80/443 (above).

Taking those ports would take that site down. Add this app to whatever is
already there instead — a server block for nginx, or a site block for Apache —
pointing at 127.0.0.1:$PORT, and then re-run with SKIP_PROXY=1 to do
everything except the web server."
  fi
else
  note "free"
  CADDY_EXISTS=no
fi
[ "${SKIP_PROXY:-0}" = "1" ] && note "SKIP_PROXY=1 — leaving the web server alone"

# --------------------------------------------------------------------- Node
step "Checking Node"
if ! command -v node >/dev/null; then
  note "installing Node 22"
  if [ "$PKG" = dnf ]; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
    sudo dnf install -y nodejs
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old; this app needs 20.9 or newer."
note "Node $(node -v)"

# -------------------------------------------------------------------- Caddy
if [ "${SKIP_PROXY:-0}" != "1" ] && ! command -v caddy >/dev/null; then
  step "Installing Caddy"
  if [ "$PKG" = dnf ]; then
    # COPR carries Caddy for EL9, aarch64 included.
    sudo dnf install -y 'dnf-command(copr)'
    sudo dnf copr enable -y @caddy/caddy
    sudo dnf install -y caddy
  else
    sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
      | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
      | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    sudo apt-get update && sudo apt-get install -y caddy
  fi
fi

# ------------------------------------------------------------ configuration
step "Configuration"
if [ -f "$APP_DIR/.env" ]; then
  note ".env already exists — leaving it alone"
else
  read -rsp "    Choose the app password (the one your partners will type): " APP_PASSWORD
  echo
  [ ${#APP_PASSWORD} -ge 12 ] || die "Use at least 12 characters: this is the only thing between the internet and your client list."
  umask 077
  cat > "$APP_DIR/.env" <<ENV
DATABASE_URL="file:./prisma/prod.db"
APP_PASSWORD="$APP_PASSWORD"
SESSION_SECRET="$(openssl rand -base64 32)"
ENV
  note "wrote .env (SESSION_SECRET generated)"
fi

step "Installing dependencies"
npm ci

step "Creating the database"
# migrate deploy applies existing migrations only. It never seeds, and the
# seed script itself refuses to run against a non-development database.
npx prisma migrate deploy

step "Building"
npm run build

# ------------------------------------------------------------------ service
step "Installing the service"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=Hide & Weave
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
ExecStart=$(command -v npm) start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable --now $SERVICE
sudo systemctl restart $SERVICE
note "started on 127.0.0.1:$PORT"

# -------------------------------------------------------------------- HTTPS
if [ "${SKIP_PROXY:-0}" != "1" ]; then
  step "Configuring HTTPS for $HOSTNAME_ARG"
  SITE="$HOSTNAME_ARG {
    reverse_proxy 127.0.0.1:$PORT
}"
  if [ "$CADDY_EXISTS" = yes ] && [ -d /etc/caddy/conf.d ]; then
    # A Caddy that is already serving something else: add a file, do not
    # rewrite the config it is using.
    printf '%s\n' "$SITE" | sudo tee /etc/caddy/conf.d/$SERVICE.caddyfile >/dev/null
    note "added /etc/caddy/conf.d/$SERVICE.caddyfile"
  elif [ "$CADDY_EXISTS" = yes ]; then
    die "Caddy is already running with its own Caddyfile, and there is no
conf.d to drop a site into. Add this by hand to /etc/caddy/Caddyfile:

$SITE

then: sudo systemctl reload caddy"
  else
    printf '%s\n' "$SITE" | sudo tee /etc/caddy/Caddyfile >/dev/null
  fi
  sudo systemctl enable caddy >/dev/null 2>&1 || true
  sudo systemctl reload caddy 2>/dev/null || sudo systemctl restart caddy

  # SELinux (Oracle Linux, RHEL) blocks a web server from making outbound
  # connections by default, which is exactly what a reverse proxy is.
  if command -v getenforce >/dev/null && [ "$(getenforce)" != "Disabled" ]; then
    sudo setsebool -P httpd_can_network_connect 1 2>/dev/null || true
    note "SELinux: allowed proxying to a local port"
  fi
fi

# ----------------------------------------------------------------- firewall
step "Opening ports 80 and 443"
if command -v firewall-cmd >/dev/null && sudo firewall-cmd --state >/dev/null 2>&1; then
  sudo firewall-cmd --permanent --add-service=http --add-service=https >/dev/null
  sudo firewall-cmd --reload >/dev/null
  note "firewalld updated"
elif command -v ufw >/dev/null; then
  sudo ufw allow 80/tcp >/dev/null && sudo ufw allow 443/tcp >/dev/null
  note "ufw updated"
else
  sudo iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
  sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save || true
  note "iptables updated"
fi

step "Done"
cat <<DONE

  https://$HOSTNAME_ARG

The database is empty — add clients through Import CSV on the Clients tab.

Check the cloud firewall too: the instance's security list (Oracle) or security
group must allow 80 and 443, not just the server's own firewall.

  sudo systemctl status $SERVICE     what the app is doing
  sudo journalctl -u $SERVICE -f     its logs
  npm run db:backup                  snapshot the database

DONE
