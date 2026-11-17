#!/bin/zsh
set -euo pipefail

SOURCE_DIR="${0:A:h:h}"
RUNTIME_DIR="${HOME}/Library/Application Support/TrendRadar/runtime"

"${SOURCE_DIR}/scripts/initialize-user-config.sh"

/bin/mkdir -p "${RUNTIME_DIR}"

/usr/bin/rsync -a \
  --exclude '.git/' \
  --exclude '.venv/' \
  --exclude '.DS_Store' \
  --exclude '__pycache__/' \
  --exclude '*.pyc' \
  --exclude 'output/' \
  --exclude 'web/node_modules/' \
  --exclude 'web/dist/' \
  --exclude 'web/.wrangler/' \
  --exclude 'web/.cache/' \
  "${SOURCE_DIR}/" "${RUNTIME_DIR}/"

/bin/chmod 755 \
  "${RUNTIME_DIR}/scripts/run-trendradar.sh" \
  "${RUNTIME_DIR}/scripts/run-trendradar-local.sh" \
  "${RUNTIME_DIR}/scripts/initialize-user-config.sh" \
  "${RUNTIME_DIR}/scripts/deploy-local-runtime.sh" \
  "${RUNTIME_DIR}/scripts/update-web-entity-snapshot.sh"

/bin/mkdir -p "${RUNTIME_DIR}/output/web"
if [[ ! -f "${RUNTIME_DIR}/output/web/entity-extractions.json" && -f "${SOURCE_DIR}/web/.cache/entity-extractions.json" ]]; then
  /bin/cp "${SOURCE_DIR}/web/.cache/entity-extractions.json" "${RUNTIME_DIR}/output/web/entity-extractions.json"
fi

cd "${RUNTIME_DIR}"
/opt/homebrew/bin/uv sync --locked

echo "TrendRadar 运行副本已更新：${RUNTIME_DIR}"
