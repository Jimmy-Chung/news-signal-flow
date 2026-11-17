#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${TREND_RADAR_PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
RUNTIME_OUTPUT="${TREND_RADAR_DATA_DIR:-${PROJECT_DIR}/output}"
SNAPSHOT_DIR="${RUNTIME_OUTPUT}/web"
SNAPSHOT_PATH="${SNAPSHOT_DIR}/entities.json"
CACHE_PATH="${SNAPSHOT_DIR}/entity-extractions.json"
ACCOUNT="${USER:-trendradar}"

read_keychain() {
  if [[ "$(uname -s)" == "Darwin" && -x /usr/bin/security ]]; then
    /usr/bin/security find-generic-password -a "${ACCOUNT}" -s "$1" -w 2>/dev/null || true
  fi
}

AI_API_KEY="${AI_API_KEY:-$(read_keychain 'TrendRadar AI API Key')}"
AI_MODEL="${AI_MODEL:-$(read_keychain 'TrendRadar AI Model')}"
AI_API_BASE="${AI_API_BASE:-$(read_keychain 'TrendRadar AI API Base')}"

if [[ -z "${AI_API_KEY}" ]]; then
  echo "缺少 TrendRadar AI API Key，无法更新实体快照" >&2
  exit 1
fi

export AI_API_KEY
export AI_MODEL="${ENTITY_AI_MODEL:-${AI_MODEL:-deepseek/deepseek-v4-flash}}"
export AI_API_BASE
export TREND_RADAR_PROJECT_DIR="${PROJECT_DIR}"
export TREND_RADAR_DATA_DIR="${RUNTIME_OUTPUT}"

mkdir -p "${SNAPSHOT_DIR}"
cd "${PROJECT_DIR}"

if [[ -n "${TREND_RADAR_PYTHON:-}" ]]; then
  python_command=("${TREND_RADAR_PYTHON}")
elif command -v uv >/dev/null 2>&1; then
  python_command=(uv run python)
elif command -v python3 >/dev/null 2>&1; then
  python_command=(python3)
else
  echo "未找到 uv、python3 或 TREND_RADAR_PYTHON" >&2
  exit 1
fi

"${python_command[@]}" web/scripts/export_entity_data.py \
  --runtime-output "${RUNTIME_OUTPUT}" \
  --output "${SNAPSHOT_PATH}" \
  --cache "${CACHE_PATH}" \
  --days "${ENTITY_LOOKBACK_DAYS:-9}" \
  --batch-size "${ENTITY_BATCH_SIZE:-25}"

echo "[实体雷达] 最新快照已写入 ${SNAPSHOT_PATH}"
