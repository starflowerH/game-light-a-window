#!/usr/bin/env bash
#
# deploy/deploy.sh — release 《今晚，亮一盏灯》 to https://hynu.site
#
#   ./deploy/deploy.sh [user@host]             verify -> upload -> swap -> restart -> health
#   ./deploy/deploy.sh --no-build [user@host]  ship the dist/ that is already built
#   ./deploy/deploy.sh --rollback [user@host]  restore the newest frontend + backend backup
#   ./deploy/deploy.sh --dry-run [...]         print the plan and touch nothing
#
# Server layout (docs/v3_plan/05_BACKEND_PERSISTENCE_AND_DEPLOY.md section 4.1)
#   frontend  /var/www/light-a-window/dist
#   backend   /opt/light-a-window            server/ shared/ package.json node_modules/
#   database  /opt/light-a-window/data       never deleted, never overwritten, never chowned
set -euo pipefail

DOMAIN='https://hynu.site'
DEFAULT_HOST='root@hynu.site'
WEB_ROOT='/var/www/light-a-window'
APP_ROOT='/opt/light-a-window'
SERVICE='light-a-window'
HEALTH_BUDGET=15
SSH_OPTS=(-T -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

MODE='deploy'      # deploy | rollback
DO_VERIFY=1
DRY_RUN=0
ASSUME_YES=0
HOST=''
HOST_GIVEN=0
PHASE='preflight'
TS=$(date -u +%Y%m%dT%H%M%SZ)
STAGE="$WEB_ROOT/.staging-$TS"

# ------------------------------------------------------------------- log helpers
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_RESET=$'\033[0m'
  C_BLUE=$'\033[1;34m'
  C_GREEN=$'\033[1;32m'
  C_YELLOW=$'\033[1;33m'
  C_RED=$'\033[1;31m'
  C_DIM=$'\033[2m'
else
  C_RESET=''
  C_BLUE=''
  C_GREEN=''
  C_YELLOW=''
  C_RED=''
  C_DIM=''
fi

info() { printf '%s[deploy]%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%s[deploy]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[deploy]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%s[deploy]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
dim()  { printf '%s    %s%s\n' "$C_DIM" "$*" "$C_RESET"; }
die()  { err "$*"; exit 1; }
step() { printf '\n%s==> [%s]%s %s\n' "$C_BLUE" "$1" "$C_RESET" "$2"; }

usage() {
  cat <<'USAGE'
今晚，亮一盏灯 · deploy helper for https://hynu.site

用法 / usage:
  ./deploy/deploy.sh [user@host]             校验 → 上传 → 切换 → 重启 → 健康检查
  ./deploy/deploy.sh --no-build [user@host]  跳过 npm run verify，直接发布现有 dist/
  ./deploy/deploy.sh --rollback [user@host]  回滚到最近一次前端 + 后端备份
  ./deploy/deploy.sh --dry-run [user@host]   只打印计划，不改动任何文件
  ./deploy/deploy.sh --help

选项 / options:
  --yes, -y       确认使用默认目标 root@hynu.site
  --no-build      跳过本地 npm run verify
  --dry-run, -n   演练模式，不执行任何写操作
  --rollback      回滚模式

默认目标 / default target: root@hynu.site
服务端目录 / server layout:
  前端  /var/www/light-a-window/dist
  后端  /opt/light-a-window
  数据  /opt/light-a-window/data   （部署脚本永不删除、覆盖或改动其属主）
USAGE
}

# --------------------------------------------------------------------- arguments
while [ "$#" -gt 0 ]; do
  case "$1" in
    --help|-h)    usage; exit 0 ;;
    --rollback)   MODE='rollback' ;;
    --no-build)   DO_VERIFY=0 ;;
    --dry-run|-n) DRY_RUN=1 ;;
    --yes|-y)     ASSUME_YES=1 ;;
    --)           shift; break ;;
    -*)
      err "unknown option: $1"
      usage >&2
      exit 2
      ;;
    *)
      if [ "$HOST_GIVEN" -eq 1 ]; then
        err "unexpected extra argument: $1"
        usage >&2
        exit 2
      fi
      HOST="$1"
      HOST_GIVEN=1
      ;;
  esac
  shift
done

while [ "$#" -gt 0 ]; do
  if [ "$HOST_GIVEN" -eq 1 ]; then
    err "unexpected extra argument: $1"
    exit 2
  fi
  HOST="$1"
  HOST_GIVEN=1
  shift
done

[ "$HOST_GIVEN" -eq 1 ] || HOST="$DEFAULT_HOST"

# The host string goes straight into an ssh argument, so keep it to a plain
# [user@]hostname shape. This also blocks option injection such as -oProxyCommand.
printf '%s' "$HOST" | grep -Eq '^[A-Za-z0-9._-]+(@[A-Za-z0-9._-]+)?$' \
  || die "invalid host: $HOST"

if [ "$DRY_RUN" -eq 0 ] && [ "$HOST" = "$DEFAULT_HOST" ] && [ "$ASSUME_YES" -eq 0 ]; then
  err "没有显式指定主机，将使用默认目标 $DEFAULT_HOST"
  err "确认请加 --yes，或直接传入 user@host"
  exit 2
fi

# ------------------------------------------------------------------ command runner
# Every mutation goes through these two helpers so --dry-run is a single switch.
run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    dim "would run: $*"
    return 0
  fi
  "$@"
}

# remote <label> [VAR=value ...] — runs the script arriving on stdin on $HOST.
remote() {
  local label=$1
  local envs=${2:-}
  if [ "$DRY_RUN" -eq 1 ]; then
    dim "would run on $HOST: $label"
    cat > /dev/null
    return 0
  fi
  info "$label"
  # shellcheck disable=SC2086  # the assignments must split into separate words
  ssh "${SSH_OPTS[*]}" "$HOST" "$envs bash -s"
}

# --------------------------------------------------------------------- preflight
preflight() {
  [ -f package.json ] || die 'run this from the repository root (package.json missing)'
  [ -d server ] || die 'server/ is missing'
  [ -d shared ] || die 'shared/ is missing'
  command -v ssh >/dev/null 2>&1 || die 'ssh not found'
  command -v rsync >/dev/null 2>&1 || die 'rsync not found'
  command -v curl >/dev/null 2>&1 || die 'curl not found'
  if [ "$DO_VERIFY" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
    command -v npm >/dev/null 2>&1 || die 'npm not found'
  fi
  if [ "$DRY_RUN" -eq 0 ]; then
    ssh "${SSH_OPTS[*]}" "$HOST" 'echo ok' >/dev/null \
      || die "cannot reach $HOST over ssh"
  fi
}

# ------------------------------------------------------------ dist integrity gate
check_dist() {
  [ -f dist/index.html ] || die 'dist/index.html is missing — run npm run build first'
  local file refs missing=0 count
  refs=$(grep -oE '\./assets/[A-Za-z0-9._-]+' dist/index.html | sort -u || true)
  if [ -z "$refs" ]; then
    die 'dist/index.html references no bundled assets — the build looks broken'
  fi
  while IFS= read -r file; do
    [ -n "$file" ] || continue
    if [ ! -f "dist/${file#./}" ]; then
      err "dist/index.html references $file but the file does not exist"
      missing=1
    fi
  done <<< "$refs"
  [ "$missing" -eq 0 ] || die 'dist/ is inconsistent — rebuild before deploying'
  count=$(find dist/assets -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ' || true)
  [ "$count" -gt 0 ] || die 'dist/assets/ is empty'
  ok "dist integrity OK ($count asset files)"
}

# ---------------------------------------------------------------- health polling
# check_health <path> [...] — true once every path answers HTTP 200 in HEALTH_BUDGET seconds.
check_health() {
  local deadline=$((SECONDS + HEALTH_BUDGET))
  local path code all last_path='' last_code=''
  while [ "$SECONDS" -lt "$deadline" ]; do
    all=1
    for path in "$@"; do
      code=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$DOMAIN$path" || true)
      if [ "$code" != '200' ]; then
        all=0
        last_path=$path
        last_code=$code
      fi
    done
    if [ "$all" -eq 1 ]; then
      return 0
    fi
    sleep 1
  done
  warn "health check failed: ${last_path:-$1} returned ${last_code:-no response}"
  return 1
}

# --------------------------------------------------------------- rollback routine
# Restores the newest /var/www/light-a-window/dist.bak-* and the newest
# /opt/light-a-window/backup/<ts> tree, then restarts the unit. The data
# directory is never part of any backup or restore path.
rollback_all() {
  PHASE='rollback'
  remote 'restoring the newest frontend and backend backups' "WEB=$WEB_ROOT APP=$APP_ROOT" <<'REMOTE'
set -euo pipefail

# Validate every path before it is used in a destructive command.
if [ -z "${WEB:-}" ] || [ -z "${APP:-}" ]; then
  echo 'empty path, refusing to continue' >&2
  exit 1
fi
case "$WEB" in
  /var/www/light-a-window) ;;
  *) echo "unexpected web root: $WEB" >&2; exit 1 ;;
esac
case "$APP" in
  /opt/light-a-window) ;;
  *) echo "unexpected app root: $APP" >&2; exit 1 ;;
esac

# Names are UTC timestamps, so they sort chronologically. Copying with -a
# preserves mtimes, which makes mtime ordering unreliable here.
latest_web=$(ls -1d "$WEB"/dist.bak-* 2>/dev/null | sort -r | head -n 1 || true)
if [ -z "$latest_web" ]; then
  echo 'no frontend backup found under /var/www/light-a-window' >&2
  exit 1
fi
echo "frontend <- $latest_web"
if [ -d "$WEB/dist" ]; then
  find "$WEB/dist" -mindepth 1 -delete
else
  install -d -m 0755 "$WEB/dist"
fi
cp -a "$latest_web/." "$WEB/dist/"
chown -R www-data:www-data "$WEB/dist" 2>/dev/null || echo 'warning: chown www-data failed' >&2

latest_app=$(ls -1d "$APP"/backup/*/ 2>/dev/null | sort -r | head -n 1 || true)
if [ -n "$latest_app" ]; then
  echo "backend  <- $latest_app"
  if [ -d "$latest_app/server" ]; then
    install -d -m 0755 "$APP/server"
    find "$APP/server" -mindepth 1 -delete
    cp -a "$latest_app/server/." "$APP/server/"
  fi
  if [ -d "$latest_app/shared" ]; then
    install -d -m 0755 "$APP/shared"
    find "$APP/shared" -mindepth 1 -delete
    cp -a "$latest_app/shared/." "$APP/shared/"
  fi
  if [ -f "$latest_app/package.json" ]; then
    cp -a "$latest_app/package.json" "$APP/package.json"
  fi
  if [ -f "$latest_app/package-lock.json" ]; then
    cp -a "$latest_app/package-lock.json" "$APP/package-lock.json"
  fi
  if [ -x /opt/node22/bin/npm ]; then
    NPM=/opt/node22/bin/npm
  else
    NPM=$(command -v npm || true)
  fi
  if [ -n "${NPM:-}" ] && [ -f "$APP/package-lock.json" ]; then
    ( cd "$APP" && "$NPM" ci --omit=dev --no-audit --no-fund ) \
      || echo 'warning: dependency reinstall failed, check /opt/light-a-window' >&2
  fi
else
  echo 'no backend backup found, keeping the current backend code' >&2
fi

systemctl restart light-a-window
systemctl is-active --quiet light-a-window || { echo 'service did not come back up' >&2; exit 1; }
REMOTE
}

# ------------------------------------------------------------------- error handler
on_error() {
  local rc=$?
  local line=$1
  trap - ERR
  set +e
  err "failed at line $line (phase: $PHASE, exit $rc)"
  case "$PHASE" in
    preflight|verify|dist|upload|rollback|done) ;;
    *)
      if [ "$DRY_RUN" -eq 0 ]; then
        warn '服务器可能处于半更新状态，自动回滚前端与后端'
        rollback_all || warn '自动回滚失败，请人工检查服务器'
      fi
      ;;
  esac
  exit "$rc"
}
trap 'on_error $LINENO' ERR

# ==============================================================================
# main
# ==============================================================================
printf '\n'
info "target:  $HOST"
info "site:    $DOMAIN"
info "release: $TS"
if [ "$DRY_RUN" -eq 1 ]; then
  warn 'dry run — nothing will be uploaded, replaced or restarted'
fi

preflight

if [ "$MODE" = 'rollback' ]; then
  step '1/3' 'rolling back'
  if [ "$DRY_RUN" -eq 1 ]; then
    dim 'would restore the newest /var/www/light-a-window/dist.bak-* and /opt/light-a-window/backup/*'
    dim 'would restart light-a-window and wait for /api/health'
  else
    rollback_all
    step '2/3' 'waiting for the service'
    if ! check_health /api/health; then
      err 'rollback finished but /api/health is not answering 200'
      exit 1
    fi
  fi
  printf '\n'
  ok 'rollback done'
  exit 0
fi

# ------------------------------------------------------------------------- 1/9
step '1/9' 'local verification (lint + typecheck + test + build)'
PHASE='verify'
if [ "$DO_VERIFY" -eq 0 ]; then
  warn 'skipped because --no-build was given'
elif [ "$DRY_RUN" -eq 1 ]; then
  dim 'would run: npm run verify'
else
  npm run verify
  ok 'verify passed'
fi

# ------------------------------------------------------------------------- 2/9
step '2/9' 'checking dist/ integrity'
PHASE='dist'
check_dist
RELEASE=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -n 1 || true)

# ------------------------------------------------------------------------- 3/9
step '3/9' "uploading dist/ to $HOST:$STAGE"
PHASE='upload'
remote "preparing $STAGE" "WEB=$WEB_ROOT STAGE=$STAGE" <<'REMOTE'
set -euo pipefail
if [ -z "$WEB" ] || [ -z "$STAGE" ]; then
  echo 'empty path, refusing to continue' >&2
  exit 1
fi
case "$STAGE" in
  /var/www/light-a-window/.staging-*) ;;
  *) echo "unexpected staging path: $STAGE" >&2; exit 1 ;;
esac
install -d -m 0755 "$WEB"
install -d -m 0755 "$STAGE"
REMOTE
run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" dist/ "$HOST:$STAGE/"

# ------------------------------------------------------------------------- 4/9
step '4/9' 'backing up the live release and the backend'
PHASE='backup'
remote 'creating dist.bak and the backend backup' "WEB=$WEB_ROOT APP=$APP_ROOT TS=$TS" <<'REMOTE'
set -euo pipefail
if [ -z "$WEB" ] || [ -z "$APP" ] || [ -z "$TS" ]; then
  echo 'empty path, refusing to continue' >&2
  exit 1
fi
case "$WEB" in
  /var/www/light-a-window) ;;
  *) echo "unexpected web root: $WEB" >&2; exit 1 ;;
esac
case "$APP" in
  /opt/light-a-window) ;;
  *) echo "unexpected app root: $APP" >&2; exit 1 ;;
esac

if [ ! -d "$WEB/dist" ]; then
  echo "missing $WEB/dist on the server" >&2
  exit 1
fi
if [ -e "$WEB/dist.bak-$TS" ]; then
  echo "backup $WEB/dist.bak-$TS already exists" >&2
  exit 1
fi
cp -a "$WEB/dist" "$WEB/dist.bak-$TS"
echo "frontend backup: $WEB/dist.bak-$TS"

install -d -m 0755 "$APP/backup/$TS"
for item in server shared package.json package-lock.json; do
  if [ -e "$APP/$item" ]; then
    cp -a "$APP/$item" "$APP/backup/$TS/"
  fi
done
echo "backend backup:  $APP/backup/$TS"
REMOTE

# ------------------------------------------------------------------------- 5/9
step '5/9' 'swapping the frontend into place'
PHASE='publish'
remote 'publishing the frontend' "WEB=$WEB_ROOT STAGE=$STAGE" <<'REMOTE'
set -euo pipefail
if [ -z "$WEB" ] || [ -z "$STAGE" ]; then
  echo 'empty path, refusing to continue' >&2
  exit 1
fi
case "$WEB" in
  /var/www/light-a-window) ;;
  *) echo "unexpected web root: $WEB" >&2; exit 1 ;;
esac
case "$STAGE" in
  /var/www/light-a-window/.staging-*) ;;
  *) echo "unexpected staging path: $STAGE" >&2; exit 1 ;;
esac
if [ ! -d "$STAGE" ]; then
  echo "staging directory $STAGE is missing" >&2
  exit 1
fi
if [ ! -d "$WEB/dist" ]; then
  echo "missing $WEB/dist, refusing to publish" >&2
  exit 1
fi
find "$WEB/dist" -mindepth 1 -delete
cp -a "$STAGE/." "$WEB/dist/"
chown -R www-data:www-data "$WEB/dist" 2>/dev/null || echo 'warning: chown www-data failed' >&2
find "$STAGE" -mindepth 1 -delete
rmdir "$STAGE"
REMOTE

# ------------------------------------------------------------------------- 6/9
step '6/9' 'syncing the backend and installing production dependencies'
PHASE='backend'
remote 'preparing /opt/light-a-window' "APP=$APP_ROOT" <<'REMOTE'
set -euo pipefail
if [ -z "$APP" ]; then
  echo 'empty app root, refusing to continue' >&2
  exit 1
fi
case "$APP" in
  /opt/light-a-window) ;;
  *) echo "unexpected app root: $APP" >&2; exit 1 ;;
esac
install -d -m 0755 "$APP" "$APP/server" "$APP/shared"
# The SQLite directory is created once and then never touched again.
if [ ! -d "$APP/data" ]; then
  install -d -m 0750 -o www-data -g www-data "$APP/data" 2>/dev/null \
    || install -d -m 0750 "$APP/data"
  echo "created $APP/data"
fi
REMOTE

run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" server/ "$HOST:$APP_ROOT/server/"
run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" shared/ "$HOST:$APP_ROOT/shared/"
# server/agents.js imports src/narrative-graph.js as its offline fallback, so the
# backend needs that one file even though the rest of src/ is browser-only.
run rsync -az -e "ssh ${SSH_OPTS[*]}" src/narrative-graph.js "$HOST:$APP_ROOT/src/narrative-graph.js"
run rsync -az -e "ssh ${SSH_OPTS[*]}" package.json "$HOST:$APP_ROOT/package.json"
if [ -f package-lock.json ]; then
  run rsync -az -e "ssh ${SSH_OPTS[*]}" package-lock.json "$HOST:$APP_ROOT/package-lock.json"
fi

remote 'npm ci --omit=dev' "APP=$APP_ROOT" <<'REMOTE'
set -euo pipefail
if [ -z "$APP" ]; then
  echo 'empty app root, refusing to continue' >&2
  exit 1
fi
cd "$APP"
if [ -x /opt/node22/bin/npm ]; then
  NPM=/opt/node22/bin/npm
elif command -v npm >/dev/null 2>&1; then
  NPM=$(command -v npm)
else
  echo 'npm not found on this host (expected /opt/node22/bin/npm)' >&2
  exit 1
fi
if [ -f package-lock.json ]; then
  "$NPM" ci --omit=dev --no-audit --no-fund
else
  "$NPM" install --omit=dev --no-audit --no-fund
fi
REMOTE

# ------------------------------------------------------------------------- 7/9
step '7/9' "restarting $SERVICE"
PHASE='restart'
remote 'systemctl restart light-a-window' '' <<'REMOTE'
set -euo pipefail
if ! systemctl cat light-a-window >/dev/null 2>&1; then
  echo 'unit light-a-window.service is not installed' >&2
  exit 1
fi
systemctl restart light-a-window
systemctl is-active --quiet light-a-window || { echo 'service is not active after restart' >&2; exit 1; }
REMOTE

# ------------------------------------------------------------------------- 8/9
step '8/9' "polling $DOMAIN for up to ${HEALTH_BUDGET}s"
PHASE='health'
if [ "$DRY_RUN" -eq 1 ]; then
  dim "would poll $DOMAIN/api/health and $DOMAIN/api/bootstrap"
  ok 'dry run: health check simulated'
else
  if check_health /api/health /api/bootstrap; then
    ok 'api/health and api/bootstrap both returned 200'
  else
    warn 'health check failed — rolling back both frontend and backend'
    if ! rollback_all; then
      err 'automatic rollback failed — the server needs manual attention'
      exit 1
    fi
    die 'deploy failed, previous release restored'
  fi
fi

# ------------------------------------------------------------------------- 9/9
step '9/9' 'summary'
PHASE='done'
printf '\n'
ok 'deploy complete'
info "  site:      $DOMAIN"
info "  release:   ${RELEASE:-unknown}"
info "  frontend:  $WEB_ROOT/dist"
info "  backend:   $APP_ROOT"
info "  backups:   $WEB_ROOT/dist.bak-$TS  ·  $APP_ROOT/backup/$TS"
info "  rollback:  ./deploy/deploy.sh --rollback $HOST"
printf '\n'
