#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST_NAME="${HOST_NAME:-192.168.31.135}"
USER_NAME="${USER_NAME:-root}"
KEY_PATH="${KEY_PATH:-$HOME/.ssh/codex_vm_ed25519}"
REPO_PATH="${REPO_PATH:-/opt/party-building-mini-app}"
BUNDLE_NAME="${BUNDLE_NAME:-party-building-sync.bundle}"
BRANCH="${BRANCH:-$(git -C "${ROOT_DIR}" branch --show-current)}"

if [[ -z "${BRANCH}" ]]; then
  echo "[error] unable to detect current git branch" >&2
  exit 1
fi

if [[ ! -f "${KEY_PATH}" ]]; then
  echo "[error] ssh key not found: ${KEY_PATH}" >&2
  exit 1
fi

TMP_DIR="${TMPDIR:-/tmp}/party-building-deploy"
mkdir -p "${TMP_DIR}"
BUNDLE_PATH="${TMP_DIR}/${BUNDLE_NAME}"
REMOTE_BUNDLE_PATH="/tmp/${BUNDLE_NAME}"

echo "[info] repo: ${ROOT_DIR}"
echo "[info] branch: ${BRANCH}"
echo "[info] bundle: ${BUNDLE_PATH}"

git -C "${ROOT_DIR}" rev-parse --verify HEAD >/dev/null
if [[ "${BRANCH}" == "main" ]]; then
  git -C "${ROOT_DIR}" bundle create "${BUNDLE_PATH}" main
else
  git -C "${ROOT_DIR}" bundle create "${BUNDLE_PATH}" main "${BRANCH}"
fi

scp -i "${KEY_PATH}" "${BUNDLE_PATH}" "${USER_NAME}@${HOST_NAME}:${REMOTE_BUNDLE_PATH}" >/dev/null

REMOTE_SCRIPT=$(cat <<EOF
set -euo pipefail
cd '${REPO_PATH}'
git remote set-url origin 'https://github.com/Lukas-VI/party-building-system'
git fetch '${REMOTE_BUNDLE_PATH}' '+refs/heads/*:refs/remotes/local-bundle/*'
if git show-ref --verify --quiet refs/remotes/local-bundle/main; then git checkout -B main refs/remotes/local-bundle/main; fi
if [ '${BRANCH}' != 'main' ] && git show-ref --verify --quiet refs/remotes/local-bundle/${BRANCH}; then git checkout -B '${BRANCH}' refs/remotes/local-bundle/${BRANCH}; fi
rm -f '${REMOTE_BUNDLE_PATH}'
bash '${REPO_PATH}/scripts/start-ubuntu-services.sh'
EOF
)

ssh -i "${KEY_PATH}" "${USER_NAME}@${HOST_NAME}" "$(printf '%s' "${REMOTE_SCRIPT}" | base64 -w0 | sed "s/.*/echo '&' | base64 -d | bash/")"

rm -f "${BUNDLE_PATH}"
echo "[info] deploy finished"
