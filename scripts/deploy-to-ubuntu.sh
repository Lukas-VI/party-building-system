#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="${HOST_NAME:-192.168.31.135}"
USER_NAME="${USER_NAME:-root}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/codex_vm_ed25519}"
REPO_PATH="${REPO_PATH:-/opt/party-building-mini-app}"
BUNDLE_NAME="${BUNDLE_NAME:-party-building-system.bundle}"
BRANCH="${1:-$(git -C "${ROOT_DIR}" branch --show-current)}"
BUNDLE_PATH="${ROOT_DIR}/.tmp-ubuntu-deploy.bundle"

if [ ! -f "${KEY_PATH}" ]; then
  echo "[error] SSH key not found: ${KEY_PATH}" >&2
  exit 1
fi

rm -f "${BUNDLE_PATH}"

echo "[info] creating bundle from committed refs"
git -C "${ROOT_DIR}" bundle create "${BUNDLE_PATH}" main "${BRANCH}"

echo "[info] uploading bundle to ubuntu"
scp -i "${KEY_PATH}" "${BUNDLE_PATH}" "${USER_NAME}@${HOST_NAME}:/tmp/${BUNDLE_NAME}"

read -r -d '' REMOTE_SCRIPT <<EOF || true
set -euo pipefail
cd '${REPO_PATH}'
git remote set-url origin 'https://github.com/Lukas-VI/party-building-system'
git fetch '/tmp/${BUNDLE_NAME}' main:refs/remotes/bundle/main '${BRANCH}':refs/remotes/bundle/${BRANCH}
if git show-ref --verify --quiet 'refs/heads/${BRANCH}'; then
  git checkout '${BRANCH}'
else
  git checkout -b '${BRANCH}' 'refs/remotes/bundle/${BRANCH}'
fi
git merge --ff-only 'refs/remotes/bundle/${BRANCH}'
if git show-ref --verify --quiet 'refs/heads/main'; then
  git checkout main
  git merge --ff-only 'refs/remotes/bundle/main'
fi
git checkout '${BRANCH}'
rm -f '/tmp/${BUNDLE_NAME}'
bash '${REPO_PATH}/scripts/start-ubuntu-services.sh'
EOF

echo "[info] syncing committed branch '${BRANCH}' to ubuntu and restarting services"
ssh -i "${KEY_PATH}" "${USER_NAME}@${HOST_NAME}" "${REMOTE_SCRIPT}"

rm -f "${BUNDLE_PATH}"
echo "[info] deploy finished"
