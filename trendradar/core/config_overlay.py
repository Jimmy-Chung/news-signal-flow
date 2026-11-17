# coding=utf-8
"""将 RSS/热榜 的 overlay 配置合并进 config.yaml 载入后的数据。

overlay 文件（config/custom/rss_platforms.yaml）只允许覆盖以下开关字段，其余字段一律忽略：

  platforms.enabled: bool
  platforms.sources[].enabled: bool   # 按 id 匹配
  rss.enabled: bool
  rss.feeds[].enabled: bool           # 按 id 匹配

未匹配到 id 的条目会被忽略；overlay 缺失时原样返回。
"""


def apply_rss_platforms_overlay(config_data, overlay_data):
    if not overlay_data:
        return config_data

    platforms = overlay_data.get("platforms") or {}
    if isinstance(platforms.get("enabled"), bool):
        config_data.setdefault("platforms", {})["enabled"] = platforms["enabled"]
    for source in platforms.get("sources") or []:
        if not isinstance(source.get("enabled"), bool):
            continue
        match = next(
            (item for item in config_data.get("platforms", {}).get("sources", []) if item.get("id") == source.get("id")),
            None,
        )
        if match is not None:
            match["enabled"] = source["enabled"]

    rss = overlay_data.get("rss") or {}
    if isinstance(rss.get("enabled"), bool):
        config_data.setdefault("rss", {})["enabled"] = rss["enabled"]
    for feed in rss.get("feeds") or []:
        if not isinstance(feed.get("enabled"), bool):
            continue
        match = next(
            (item for item in config_data.get("rss", {}).get("feeds", []) if item.get("id") == feed.get("id")),
            None,
        )
        if match is not None:
            match["enabled"] = feed["enabled"]

    return config_data
