import os
import unittest
from unittest.mock import patch

from trendradar.__main__ import NewsAnalyzer


class BrowserOpeningTests(unittest.TestCase):
    def make_analyzer(self, *, github_actions=False, docker=False):
        analyzer = NewsAnalyzer.__new__(NewsAnalyzer)
        analyzer.is_github_actions = github_actions
        analyzer.is_docker_container = docker
        return analyzer

    def test_explicitly_disabled(self):
        with patch.dict(os.environ, {"TREND_RADAR_OPEN_BROWSER": "0"}):
            self.assertFalse(self.make_analyzer()._should_open_browser())

    def test_explicitly_enabled_locally(self):
        with patch.dict(os.environ, {"TREND_RADAR_OPEN_BROWSER": "1"}):
            self.assertTrue(self.make_analyzer()._should_open_browser())

    def test_explicit_enable_does_not_override_noninteractive_environment(self):
        with patch.dict(os.environ, {"TREND_RADAR_OPEN_BROWSER": "1"}):
            self.assertFalse(
                self.make_analyzer(github_actions=True)._should_open_browser()
            )
            self.assertFalse(self.make_analyzer(docker=True)._should_open_browser())

    def test_existing_default_behavior_is_preserved(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TREND_RADAR_OPEN_BROWSER", None)
            self.assertTrue(self.make_analyzer()._should_open_browser())


if __name__ == "__main__":
    unittest.main()
