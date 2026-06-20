#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-moneymachine}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PATH="${DEPLOY_PATH:-/var/www/juan-website}"

case "${DEPLOY_PATH}" in
  /var/www/*) ;;
  *) echo "DEPLOY_PATH must be below /var/www" >&2; exit 1 ;;
esac

ssh -o BatchMode=yes "${DEPLOY_USER}@${DEPLOY_HOST}" \
  "DEPLOY_PATH='${DEPLOY_PATH}' bash -s" <<'REMOTE'
set -euo pipefail
PREVIOUS_PATH="${DEPLOY_PATH}-previous"
BROKEN_PATH="${DEPLOY_PATH}-broken"

[[ -d "${PREVIOUS_PATH}" ]] && [[ -n "$(ls -A "${PREVIOUS_PATH}")" ]] || {
  echo "No previous deployment exists at ${PREVIOUS_PATH}" >&2
  exit 1
}

rm -rf "${BROKEN_PATH}"
mv "${DEPLOY_PATH}" "${BROKEN_PATH}"
mv "${PREVIOUS_PATH}" "${DEPLOY_PATH}"
mv "${BROKEN_PATH}" "${PREVIOUS_PATH}"
chown -R www-data:www-data "${DEPLOY_PATH}" "${PREVIOUS_PATH}"
systemctl reload caddy
REMOTE

echo "Rollback complete: ${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
