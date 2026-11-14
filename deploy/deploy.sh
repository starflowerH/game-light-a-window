#!/usr/bin/env bash
#
# Deploy the built frontend to the live site, with an automatic rollback.
#
#   ./deploy/deploy.sh            # build, publish, verify
#   ./deploy/deploy.sh --rollback # restore the previous release
#   ./deploy/deploy.sh --no-build # publish whatever is already in dist/
#
# The script is idempotent: it refuses to leave a broken release in place.
set -euo pipefail

WEB_ROOT="/var/www/light-a-window/dist"
BACKUP_ROOT="/var/www/light-a-window"
HEALTH_URL="https://game.xiaoxin.email/api/health"
HEALTH_PATH="/health"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

rollback() {
  local latest
  latest=$(ls -1dt "$BACKUP_ROOT"/dist.bak-* 2>/dev/null | head -1 || true)
  [ -n "$latest" ] || die "no backup found to roll back to"
  warn "rolling back to $latest"
  sudo rm -rf "$WEB_ROOT"
  sudo cp -a "$latest" "$WEB_ROOT"
  sudo chown -R www-data:www-data "$WEB_ROOT"
  warn "rollback complete"
}

# ---------------------------------------------------------------- rollback mode
if [ "${1:-}" = "--rollback" ]; then
  rollback
  exit 0
fi

# ------------------------------------------------------------------ sanity check
[ -f package.json ] || die "run this from the repository root"
command -v npm >/dev/null || die "npm not found"

# ---------------------------------------------------------------------- build
if [ "${1:-}" != "--no-build" ]; then
  log "building"
  npm run build
fi

[ -f dist/index.html ] || die "dist/index.html missing - build failed"

# The asset filenames are content-hashed, so a stale index.html would keep
# pointing at deleted bundles. Verify the referenced assets really exist.
log "checking dist integrity"
while read -r asset; do
  [ -f "dist/$asset" ] || die "dist/index.html references $asset but it is missing"
done < <(grep -oE '\./assets/[A-Za-z0-9._-]+' dist/index.html | sed 's|^\./||' | sort -u)

# ------------------------------------------------------------------- publish
TS=$(date +%Y%m%d-%H%M%S)
BACKUP="$BACKUP_ROOT/dist.bak-$TS"
log "backing up current release to $BACKUP"
sudo cp -a "$WEB_ROOT" "$BACKUP"

log "publishing"
sudo find "$WEB_ROOT" -mindepth 1 -delete
sudo cp -a dist/. "$WEB_ROOT/"
sudo chown -R www-data:www-data "$WEB_ROOT"

# -------------------------------------------------------------------- verify
log "verifying"
ok=0
for _ in $(seq 1 10); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1 \
     && curl -fsS "https://game.xiaoxin.email$HEALTH_PATH" >/dev/null 2>&1 \
     && curl -fsS https://game.xiaoxin.email/ | grep -q 'assets/'; then
    ok=1
    break
  fi
  sleep 1
done

if [ "$ok" != "1" ]; then
  warn "verification failed - rolling back"
  rollback
  die "deploy failed, previous release restored"
fi

log "deploy OK"
log "  release: $(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$WEB_ROOT/index.html" | head -1)"
log "  backup:  $BACKUP"
