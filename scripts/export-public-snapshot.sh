#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法: $0 <空的目标目录>" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_DIR="$1"

if [[ -e "${TARGET_DIR}" && ! -d "${TARGET_DIR}" ]]; then
  echo "目标已存在且不是目录：${TARGET_DIR}" >&2
  exit 1
fi
mkdir -p "${TARGET_DIR}"
if [[ -n "$(find "${TARGET_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "目标目录必须为空：${TARGET_DIR}" >&2
  exit 1
fi

rsync -a \
  --exclude '.git/' \
  --exclude '.venv/' \
  --exclude '.codex/' \
  --exclude '.DS_Store' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude '*.log' \
  --exclude '*.pem' \
  --exclude '*.key' \
  --include '*.example' \
  --exclude '.env*' \
  --exclude 'secrets.env' \
  --exclude '.github/workflows/' \
  --exclude 'AGENTS.md' \
  --exclude 'index.html' \
  --exclude 'output/' \
  --exclude 'local/*.plist' \
  --exclude 'config/custom/ai/user_interests.txt' \
  --exclude 'config/custom/keyword/user_must_notify.txt' \
  --exclude 'web/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'web/.cache/' \
  --exclude 'web/.vinext/' \
  --exclude 'web/.wrangler/' \
  --exclude 'web/coverage/' \
  --exclude 'web/outputs/' \
  --exclude 'web/work/' \
  --exclude 'web/app/data/events.json' \
  --exclude 'web/tsconfig.tsbuildinfo' \
  "${SOURCE_DIR}/" "${TARGET_DIR}/"

for forbidden in \
  "AGENTS.md" \
  "index.html" \
  "output" \
  "config/custom/ai/user_interests.txt" \
  "config/custom/keyword/user_must_notify.txt" \
  "web/app/data/events.json"; do
  if [[ -e "${TARGET_DIR}/${forbidden}" ]]; then
    echo "公开快照仍包含禁止项：${forbidden}" >&2
    exit 1
  fi
done

if rg -n --hidden \
  --glob '!.git/**' \
  --glob '!**/scripts/export-public-snapshot.sh' \
  '(\/Users\/[^/]+\/|\/home\/[^/]+\/)' \
  "${TARGET_DIR}"; then
  echo "公开快照仍包含本机路径、个人预览域名或用户名，请检查上面的匹配项。" >&2
  exit 1
fi

echo "公开快照已生成：${TARGET_DIR}"
