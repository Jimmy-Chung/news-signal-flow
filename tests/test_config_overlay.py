# coding=utf-8
import unittest

from trendradar.core.config_overlay import apply_rss_platforms_overlay


def _base():
    return {
        "platforms": {
            "enabled": True,
            "sources": [
                {"id": "zhihu", "name": "知乎"},
                {"id": "weibo", "name": "微博"},
            ],
        },
        "rss": {
            "enabled": True,
            "feeds": [
                {"id": "hacker-news", "name": "Hacker News"},
                {"id": "ruanyifeng", "name": "阮一峰", "enabled": False},
            ],
        },
    }


class RssPlatformsOverlayTests(unittest.TestCase):
    def test_overlay_disables_platform_and_feed_by_id(self):
        config = _base()
        overlay = {
            "platforms": {"sources": [{"id": "zhihu", "enabled": False}]},
            "rss": {"feeds": [{"id": "ruanyifeng", "enabled": True}]},
        }
        apply_rss_platforms_overlay(config, overlay)
        zhihu = next(s for s in config["platforms"]["sources"] if s["id"] == "zhihu")
        weibo = next(s for s in config["platforms"]["sources"] if s["id"] == "weibo")
        ruanyifeng = next(f for f in config["rss"]["feeds"] if f["id"] == "ruanyifeng")
        self.assertIs(zhihu["enabled"], False)
        self.assertNotIn("enabled", weibo)
        self.assertIs(ruanyifeng["enabled"], True)

    def test_overlay_toggles_top_level_switches(self):
        config = {
            "platforms": {"enabled": True, "sources": []},
            "rss": {"enabled": True, "feeds": []},
        }
        apply_rss_platforms_overlay(config, {"platforms": {"enabled": False}, "rss": {"enabled": False}})
        self.assertIs(config["platforms"]["enabled"], False)
        self.assertIs(config["rss"]["enabled"], False)

    def test_missing_or_unknown_overlay_is_ignored(self):
        config = {
            "platforms": {"enabled": True, "sources": []},
            "rss": {"enabled": True, "feeds": []},
        }
        apply_rss_platforms_overlay(config, None)
        apply_rss_platforms_overlay(config, {"rss": {"feeds": [{"id": "unknown", "enabled": False}]}})
        self.assertIs(config["platforms"]["enabled"], True)
        self.assertIs(config["rss"]["enabled"], True)


if __name__ == "__main__":
    unittest.main()
