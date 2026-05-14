#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/opt/party-building-mini-app}"
BRANCH="${BRANCH:-main}"
REMOTE="${REMOTE:-origin}"
LOCK_FILE="${LOCK_FILE:-/tmp/party-building-auto-deploy.lock}"
LOG_PREFIX="${LOG_PREFIX:-[auto-deploy]}"

echo "${LOG_PREFIX} repo: ${ROOT_DIR}"
cd "${ROOT_DIR}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "${LOG_PREFIX} missing command: $1" >&2
    exit 1
  fi
}

require_cmd git
require_cmd flock

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "${LOG_PREFIX} another deploy is already running"
  exit 0
fi

current_branch="$(git branch --show-current)"
if [ "${current_branch}" != "${BRANCH}" ]; then
  echo "${LOG_PREFIX} skip: current branch is ${current_branch}, expected ${BRANCH}"
  exit 0
fi

before="$(git rev-parse "${BRANCH}")"
echo "${LOG_PREFIX} current: ${before}"

git fetch "${REMOTE}" "${BRANCH}"
remote_ref="refs/remotes/${REMOTE}/${BRANCH}"
after="$(git rev-parse "${remote_ref}")"
echo "${LOG_PREFIX} remote:  ${after}"

if [ "${before}" = "${after}" ]; then
  echo "${LOG_PREFIX} no new commit"
  exit 0
fi

if ! git merge-base --is-ancestor "${before}" "${after}"; then
  echo "${LOG_PREFIX} remote ${BRANCH} is not a fast-forward from local ${BRANCH}; manual intervention required" >&2
  exit 1
fi

git checkout -B "${BRANCH}" "${after}"
echo "${LOG_PREFIX} updated ${BRANCH}: ${before} -> ${after}"

bash "${ROOT_DIR}/scripts/start-ubuntu-services.sh"
echo "${LOG_PREFIX} deploy finished: $(git rev-parse --short HEAD)"
