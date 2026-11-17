# coding=utf-8
"""Runtime path helpers shared by local and server deployments."""

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def get_config_dir() -> Path:
    configured = os.environ.get("TREND_RADAR_CONFIG_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()

    config_path = os.environ.get("CONFIG_PATH", "").strip()
    if config_path:
        return Path(config_path).expanduser().parent

    return PROJECT_ROOT / "config"


def get_config_path() -> Path:
    configured = os.environ.get("CONFIG_PATH", "").strip()
    if configured:
        return Path(configured).expanduser()
    return get_config_dir() / "config.yaml"


def get_data_dir(default: str = "output") -> Path:
    configured = os.environ.get("TREND_RADAR_DATA_DIR", "").strip()
    return Path(configured).expanduser() if configured else Path(default)
