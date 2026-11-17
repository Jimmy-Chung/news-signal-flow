#!/usr/bin/env bash
set -euo pipefail

/app/scripts/initialize-user-config.sh

if [[ ! -f "${CONFIG_PATH}" || ! -f "${FREQUENCY_WORDS_PATH}" ]]; then
  echo "配置文件缺失：请挂载 ${TREND_RADAR_CONFIG_DIR}" >&2
  exit 1
fi

if [[ -z "${TREND_RADAR_ADMIN_TOKEN:-}" ]]; then
  echo "服务器部署必须设置 TREND_RADAR_ADMIN_TOKEN" >&2
  exit 1
fi

if [[ "${RUN_MODE:-server}" == "once" ]]; then
  exec /app/scripts/run-trendradar.sh
fi

cron_expr="${CRON_SCHEDULE:-*/30 * * * *}"
if ! grep -qE '^[0-9*/,[:space:]-]+$' <<<"${cron_expr}"; then
  echo "CRON_SCHEDULE 格式非法: ${cron_expr}" >&2
  exit 1
fi
printf '%s /app/scripts/run-trendradar.sh\n' "${cron_expr}" > /tmp/trendradar.crontab
supercronic -test /tmp/trendradar.crontab

children=()
shutdown() {
  for pid in "${children[@]:-}"; do
    kill "${pid}" 2>/dev/null || true
  done
  wait || true
}
trap shutdown EXIT INT TERM

node /app/web/scripts/local_admin_server.mjs &
children+=("$!")

(cd /app/web && npm run start -- --port "${TREND_RADAR_WEB_PORT:-3002}") &
children+=("$!")

supercronic -passthrough-logs /tmp/trendradar.crontab &
children+=("$!")

if [[ "${IMMEDIATE_RUN:-false}" == "true" ]]; then
  /app/scripts/run-trendradar.sh &
fi

wait -n "${children[@]}"
