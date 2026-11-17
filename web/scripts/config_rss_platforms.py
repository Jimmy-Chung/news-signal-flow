# coding=utf-8
"""RSS/热榜 配置读写脚本：供本地管理服务读写 config.yaml + overlay 的合并结果。

用法：
  read    读取合并后的 platforms/rss 配置，输出 JSON
  write   从 stdin 读取期望配置（JSON），写入 config/custom/rss_platforms.yaml
"""
import json
import sys

import yaml

from trendradar.core.config_overlay import apply_rss_platforms_overlay
from trendradar.core.paths import get_config_dir


def _config_path():
    return get_config_dir() / "config.yaml"


def _overlay_path():
    return get_config_dir() / "custom" / "rss_platforms.yaml"


def _read_yaml(path):
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


def _effective_enabled(item):
    return item.get("enabled") if isinstance(item.get("enabled"), bool) else True


def merged_config():
    base = _read_yaml(_config_path())
    overlay = _read_yaml(_overlay_path())
    merged = apply_rss_platforms_overlay(base, overlay)
    platforms = merged.get("platforms") or {}
    rss = merged.get("rss") or {}
    return {
        "platforms": {
            "enabled": platforms.get("enabled") is not False,
            "sources": [
                {"id": s.get("id"), "name": s.get("name"), "enabled": _effective_enabled(s)}
                for s in platforms.get("sources") or []
            ],
        },
        "rss": {
            "enabled": rss.get("enabled") is not False,
            "feeds": [
                {"id": f.get("id"), "name": f.get("name"), "url": f.get("url"), "enabled": _effective_enabled(f)}
                for f in rss.get("feeds") or []
            ],
        },
    }


def write_overlay(desired):
    _overlay_path().parent.mkdir(parents=True, exist_ok=True)
    overlay = {
        "platforms": {
            "enabled": bool(desired.get("platforms", {}).get("enabled", True)),
            "sources": [
                {"id": s["id"], "enabled": bool(s.get("enabled", True))}
                for s in desired.get("platforms", {}).get("sources", [])
            ],
        },
        "rss": {
            "enabled": bool(desired.get("rss", {}).get("enabled", True)),
            "feeds": [
                {"id": f["id"], "enabled": bool(f.get("enabled", True))}
                for f in desired.get("rss", {}).get("feeds", [])
            ],
        },
    }
    tmp = _overlay_path().with_suffix(".yaml.tmp")
    tmp.write_text(yaml.safe_dump(overlay, allow_unicode=True, sort_keys=False), encoding="utf-8")
    tmp.replace(_overlay_path())


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else "read"
    if command == "read":
        json.dump(merged_config(), sys.stdout, ensure_ascii=False)
    elif command == "write":
        write_overlay(json.load(sys.stdin))
        print(json.dumps({"saved": True}))
    else:
        raise SystemExit(f"未知命令：{command}")


if __name__ == "__main__":
    main()
