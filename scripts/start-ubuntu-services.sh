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
ensure_deps "${ROOT_DIR}/admin-web"
ensure_deps "${ROOT_DIR}/admin-mobile"

echo "[info] building admin-web"
(cd "${ROOT_DIR}/admin-web" && npm run build)

echo "[info] building admin-mobile"
(cd "${ROOT_DIR}/admin-mobile" && npm run build)

echo "[info] starting or restarting ${SERVER_NAME}"
pm2 startOrRestart "${ROOT_DIR}/server/ecosystem.config.cjs" --only "${SERVER_NAME}"

echo "[info] starting or restarting ${GATEWAY_NAME}"
if pm2 describe "${GATEWAY_NAME}" >/dev/null 2>&1; then
  pm2 restart "${GATEWAY_NAME}"
else
  pm2 start "${ROOT_DIR}/scripts/serve-admin-frontends.mjs" --name "${GATEWAY_NAME}" --cwd "${ROOT_DIR}"
fi

if systemctl list-unit-files | grep -q "^${FRPC_SERVICE_NAME}"; then
  echo "[info] restarting ${FRPC_SERVICE_NAME}"
  systemctl restart "${FRPC_SERVICE_NAME}"
else
  echo "[warn] systemd service not found: ${FRPC_SERVICE_NAME}"
fi

pm2 save

echo "[info] pm2 list"
pm2 list

echo "[info] local health checks"
curl -fsS "http://127.0.0.1:3000/api/health" || true
echo
curl -I -fsS "http://127.0.0.1:1919/web-admin/" || true
echo
