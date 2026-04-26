#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_NAME="${SERVER_NAME:-party-building-server}"
GATEWAY_NAME="${GATEWAY_NAME:-party-building-admin-gateway}"
FRPC_SERVICE_NAME="${FRPC_SERVICE_NAME:-frpc-party-building.service}"

echo "[info] repo: ${ROOT_DIR}"
cd "${ROOT_DIR}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[error] missing command: $1" >&2
    exit 1
  fi
}

require_cmd node
require_cmd npm
require_cmd pm2
require_cmd curl

kill_listener() {
  local port="$1"
  local pids
  pids="$(ss -ltnp "( sport = :${port} )" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u)"
  if [ -n "${pids}" ]; then
    echo "[info] freeing tcp:${port} -> ${pids}"
    for pid in ${pids}; do
      kill "$pid" || true
    done
    sleep 1
  fi
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local retries="${3:-10}"
  local delay="${4:-2}"

  for ((i = 1; i <= retries; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[info] ${name} ready: ${url}"
      return 0
    fi
    echo "[info] waiting for ${name} (${i}/${retries})"
    sleep "$delay"
  done

  echo "[error] ${name} not ready: ${url}" >&2
  return 1
}

ensure_active_service() {
  local service_name="$1"

  if systemctl list-unit-files --full --all | awk '{print $1}' | grep -qx "${service_name}"; then
    echo "[info] restarting ${service_name}"
    systemctl restart "${service_name}"
    if ! systemctl is-active --quiet "${service_name}"; then
      echo "[error] ${service_name} failed to start" >&2
      systemctl status "${service_name}" --no-pager || true
      return 1
    fi
    systemctl status "${service_name}" --no-pager || true
  else
    echo "[warn] systemd service not found: ${service_name}"
  fi
}

ensure_deps() {
  local dir="$1"
  if [ ! -d "${dir}/node_modules" ]; then
    echo "[info] installing deps in ${dir}"
    (cd "${dir}" && npm install)
  else
    echo "[info] deps ready in ${dir}"
  fi
}

ensure_deps "${ROOT_DIR}/server"
ensure_deps "${ROOT_DIR}/admin-desktop"
ensure_deps "${ROOT_DIR}/admin-mobile"

echo "[info] building admin-desktop"
(cd "${ROOT_DIR}/admin-desktop" && npm run build)

echo "[info] building admin-mobile"
(cd "${ROOT_DIR}/admin-mobile" && npm run build)

kill_listener 3000
kill_listener 1919

echo "[info] starting or restarting ${SERVER_NAME}"
pm2 startOrRestart "${ROOT_DIR}/server/ecosystem.config.cjs" --only "${SERVER_NAME}"

echo "[info] starting or restarting ${GATEWAY_NAME}"
if pm2 describe "${GATEWAY_NAME}" >/dev/null 2>&1; then
  pm2 restart "${GATEWAY_NAME}"
else
  pm2 start "${ROOT_DIR}/scripts/serve-admin-frontends.mjs" --name "${GATEWAY_NAME}" --cwd "${ROOT_DIR}"
fi

ensure_active_service "${FRPC_SERVICE_NAME}"

pm2 save

echo "[info] pm2 list"
pm2 list

echo "[info] local health checks"
wait_for_url "http://127.0.0.1:3000/api/health" "server api"
curl -fsS "http://127.0.0.1:3000/api/health"
echo
wait_for_url "http://127.0.0.1:1919/web-admin/" "admin gateway"
curl -I -fsS "http://127.0.0.1:1919/web-admin/"
echo

if systemctl list-unit-files --full --all | awk '{print $1}' | grep -qx "${FRPC_SERVICE_NAME}"; then
  echo "[info] verifying ${FRPC_SERVICE_NAME}"
  systemctl is-active --quiet "${FRPC_SERVICE_NAME}"
fi
