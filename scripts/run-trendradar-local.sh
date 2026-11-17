#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_DIR="${SCRIPT_DIR:h}"
KEYCHAIN_ACCOUNT="${USER}"

read_keychain() {
  /usr/bin/security find-generic-password \
    -a "${KEYCHAIN_ACCOUNT}" \
    -s "$1" \
    -w 2>/dev/null || true
}

FEISHU_WEBHOOK_URL="${FEISHU_WEBHOOK_URL:-$(read_keychain 'TrendRadar Feishu Webhook')}"
AI_API_KEY="${AI_API_KEY:-$(read_keychain 'TrendRadar AI API Key')}"
AI_MODEL="${AI_MODEL:-$(read_keychain 'TrendRadar AI Model')}"
AI_API_BASE="${AI_API_BASE:-$(read_keychain 'TrendRadar AI API Base')}"

if [[ -n "${FEISHU_WEBHOOK_URL}" ]]; then
  export FEISHU_WEBHOOK_URL
fi
if [[ -n "${AI_API_KEY}" ]]; then
  export AI_API_KEY
fi
if [[ -n "${AI_MODEL}" ]]; then
  export AI_MODEL
fi
if [[ -n "${AI_API_BASE}" ]]; then
  export AI_API_BASE
fi

export TREND_RADAR_PROJECT_DIR="${TREND_RADAR_PROJECT_DIR:-${PROJECT_DIR}}"
export TREND_RADAR_CONFIG_DIR="${TREND_RADAR_CONFIG_DIR:-${PROJECT_DIR}/config}"
export TREND_RADAR_DATA_DIR="${TREND_RADAR_DATA_DIR:-${PROJECT_DIR}/output}"

exec "${PROJECT_DIR}/scripts/run-trendradar.sh" "$@"
