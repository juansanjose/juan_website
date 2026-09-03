#!/usr/bin/env bash
set -euo pipefail

ANUBIS_VERSION="1.27.0"
ANUBIS_INSTANCE="juan-website"
ANUBIS_PACKAGE="anubis_${ANUBIS_VERSION}_arm64.deb"
ANUBIS_SHA256="d185d84d1bebee21d55e9d56f76533858dbb4a2102a17c85265d94bdc46b69a3"
ANUBIS_URL="https://github.com/TecharoHQ/anubis/releases/download/v${ANUBIS_VERSION}/${ANUBIS_PACKAGE}"
ANUBIS_TARGET_HOST="${PERSONAL_DOMAIN:-jsanjosep.com}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root on the VPS." >&2
  exit 1
fi

command -v curl >/dev/null || { echo "curl is required." >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required." >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required." >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemd is required." >&2; exit 1; }

case "$(dpkg --print-architecture)" in
  arm64) ;;
  *) echo "This pinned installer supports the VPS arm64 architecture only." >&2; exit 1 ;;
esac

installed_version="$(dpkg-query -W -f='${Version}' anubis 2>/dev/null || true)"
if [[ "${installed_version}" != "${ANUBIS_VERSION}" ]]; then
  package_path="$(mktemp --tmpdir anubis.XXXXXX.deb)"
  trap 'rm -f "${package_path:-}"' EXIT
  curl --fail --location --silent --show-error "${ANUBIS_URL}" -o "${package_path}"
  printf '%s  %s\n' "${ANUBIS_SHA256}" "${package_path}" | sha256sum --check
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${package_path}"
fi

install -d -m 0755 /etc/anubis
install -m 0644 /usr/share/doc/anubis/botPolicies.yaml \
  "/etc/anubis/${ANUBIS_INSTANCE}.botPolicies.yaml"

key_file="/etc/anubis/${ANUBIS_INSTANCE}.key"
if [[ ! -f "${key_file}" ]]; then
  umask 077
  openssl rand -hex 32 > "${key_file}"
fi

env_file="/etc/anubis/${ANUBIS_INSTANCE}.env"
ed25519_private_key_hex="$(tr -d '\n' < "${key_file}")"
cat > "${env_file}" <<EOF
BIND=127.0.0.1:8923
BIND_NETWORK=tcp
DIFFICULTY=4
ED25519_PRIVATE_KEY_HEX=${ed25519_private_key_hex}
METRICS_BIND=127.0.0.1:9090
METRICS_BIND_NETWORK=tcp
POLICY_FNAME=/etc/anubis/${ANUBIS_INSTANCE}.botPolicies.yaml
SERVE_ROBOTS_TXT=true
TARGET=http://127.0.0.1:8924
TARGET_HOST=${ANUBIS_TARGET_HOST}
EOF
chmod 0600 "${env_file}" "${key_file}"

systemctl daemon-reload
systemctl enable --now "anubis@${ANUBIS_INSTANCE}.service"
systemctl restart "anubis@${ANUBIS_INSTANCE}.service"
curl --fail --silent --show-error --retry 10 --retry-delay 1 --retry-all-errors \
  http://127.0.0.1:9090/metrics > /dev/null

echo "Anubis ${ANUBIS_VERSION} is running on 127.0.0.1:8923."
