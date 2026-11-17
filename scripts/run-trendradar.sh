#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${TREND_RADAR_PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
CONFIG_DIR="${TREND_RADAR_CONFIG_DIR:-${PROJECT_DIR}/config}"
DATA_DIR="${TREND_RADAR_DATA_DIR:-${PROJECT_DIR}/output}"

export TREND_RADAR_PROJECT_DIR="${PROJECT_DIR}"
export TREND_RADAR_CONFIG_DIR="${CONFIG_DIR}"
export TREND_RADAR_DATA_DIR="${DATA_DIR}"
export CONFIG_PATH="${CONFIG_PATH:-${CONFIG_DIR}/config.yaml}"
export FREQUENCY_WORDS_PATH="${FREQUENCY_WORDS_PATH:-${CONFIG_DIR}/frequency_words.txt}"
export TREND_RADAR_OPEN_BROWSER="${TREND_RADAR_OPEN_BROWSER:-0}"

cd "${PROJECT_DIR}"
"${PROJECT_DIR}/scripts/initialize-user-config.sh"

normal_collection=true
if (( $# > 0 )); then
  normal_collection=false
fi

lock_dir="${DATA_DIR}/meta/collector.lock"
if [[ "${normal_collection}" == "true" ]]; then
  mkdir -p "${DATA_DIR}/meta"
  if ! mkdir "${lock_dir}" 2>/dev/null; then
    existing_pid="$(cat "${lock_dir}/pid" 2>/dev/null || true)"
    if [[ -n "${existing_pid}" ]] && kill -0 "${existing_pid}" 2>/dev/null; then
      echo "[采集锁] 已有任务正在运行 (PID ${existing_pid})，本轮不重复启动"
      exit 75
    fi
    echo "[采集锁] 发现失效锁，正在恢复"
    rm -f "${lock_dir}/pid"
    rmdir "${lock_dir}" || { echo "[采集锁] 无法安全清理失效锁: ${lock_dir}" >&2; exit 1; }
    mkdir "${lock_dir}"
  fi
  echo "$$" > "${lock_dir}/pid"
  cleanup_lock() { rm -f "${lock_dir}/pid"; rmdir "${lock_dir}" 2>/dev/null || true; }
  trap cleanup_lock EXIT HUP INT TERM
fi

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

PYTHONUNBUFFERED=1 "${python_command[@]}" -m trendradar "$@"

if [[ "${normal_collection}" == "true" && "${TREND_RADAR_SKIP_WEB_EXPORT:-0}" != "1" ]]; then
  if [[ -x "${PROJECT_DIR}/scripts/update-web-entity-snapshot.sh" ]]; then
    echo "[观测台] 采集完成，开始增量更新 Web 观测快照"
    if ! "${PROJECT_DIR}/scripts/update-web-entity-snapshot.sh"; then
      echo "[观测台] 快照更新失败；本轮采集和推送已成功，不影响下一次任务" >&2
    fi
  else
    echo "[观测台] 未找到快照更新脚本，跳过 Web 更新" >&2
  fi
fi
