#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${PERSONAL_DEPLOY_PATH:-/var/www/juan-website}"
CADDY_CONFIG="/etc/caddy/Caddyfile"
CADDY_SITES="/etc/caddy/sites"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the VPS." >&2
  exit 1
fi

command -v caddy >/dev/null || { echo "Caddy is not installed." >&2; exit 1; }
command -v rsync >/dev/null || { echo "rsync is not installed." >&2; exit 1; }
[[ -f "${CADDY_CONFIG}" ]] || { echo "Missing ${CADDY_CONFIG}." >&2; exit 1; }

mkdir -p "${DEPLOY_PATH}" "${DEPLOY_PATH}-previous" "${CADDY_SITES}"
chown -R www-data:www-data "${DEPLOY_PATH}" "${DEPLOY_PATH}-previous"

if ! grep -qF 'import /etc/caddy/sites/*.caddy' "${CADDY_CONFIG}"; then
  cp -a "${CADDY_CONFIG}" "${CADDY_CONFIG}.before-site-import"
  printf '\n# Additional independently deployed sites\nimport /etc/caddy/sites/*.caddy\n' >> "${CADDY_CONFIG}"
fi

caddy validate --config "${CADDY_CONFIG}"
systemctl reload caddy
echo "VPS ready. Configure PERSONAL_DOMAIN and PERSONAL_DEPLOY_PATH in GitHub, then push main."
