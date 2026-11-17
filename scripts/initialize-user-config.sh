#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${TREND_RADAR_PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
CONFIG_DIR="${TREND_RADAR_CONFIG_DIR:-${PROJECT_DIR}/config}"

initialize_file() {
  local example_path="$1"
  local target_path="$2"

  if [[ -f "${target_path}" ]]; then
    return
  fi
  if [[ ! -f "${example_path}" ]]; then
    echo "缺少配置示例：${example_path}" >&2
    exit 1
  fi

  mkdir -p "$(dirname "${target_path}")"
  cp "${example_path}" "${target_path}"
  echo "已从示例创建本地配置：${target_path}"
}

initialize_file \
  "${CONFIG_DIR}/custom/ai/user_interests.example.txt" \
  "${CONFIG_DIR}/custom/ai/user_interests.txt"
initialize_file \
  "${CONFIG_DIR}/custom/keyword/user_must_notify.example.txt" \
  "${CONFIG_DIR}/custom/keyword/user_must_notify.txt"
