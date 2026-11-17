#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${TREND_RADAR_PROJECT_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"
RUNTIME_DIR="${TREND_RADAR_RUNTIME_DIR:-${HOME}/Library/Application Support/TrendRadar/runtime}"
export TREND_RADAR_PROJECT_DIR="${PROJECT_DIR}"
export TREND_RADAR_DATA_DIR="${TREND_RADAR_DATA_DIR:-${RUNTIME_DIR}/output}"

exec "${PROJECT_DIR}/scripts/update-web-entity-snapshot.sh"
