import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from trendradar.ai.prompt_loader import load_prompt_template
from trendradar.core.loader import _load_storage_config
from trendradar.core.paths import get_config_dir, get_config_path, get_data_dir


class RuntimePathTests(unittest.TestCase):
    def test_runtime_directories_can_be_overridden(self):
        with patch.dict(
            os.environ,
            {
                "TREND_RADAR_CONFIG_DIR": "/srv/trendradar/config",
                "TREND_RADAR_DATA_DIR": "/data/trendradar",
            },
            clear=False,
        ):
            os.environ.pop("CONFIG_PATH", None)
            self.assertEqual(get_config_dir(), Path("/srv/trendradar/config"))
            self.assertEqual(get_config_path(), Path("/srv/trendradar/config/config.yaml"))
            self.assertEqual(get_data_dir(), Path("/data/trendradar"))

    def test_storage_environment_wins_over_yaml(self):
        with patch.dict(os.environ, {"TREND_RADAR_DATA_DIR": "/data"}, clear=False):
            config = _load_storage_config({"storage": {"local": {"data_dir": "output"}}})
            self.assertEqual(config["LOCAL"]["DATA_DIR"], "/data")

    def test_prompt_loader_reads_configured_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            prompt_dir = Path(directory) / "ai_filter"
            prompt_dir.mkdir(parents=True)
            (prompt_dir / "sample.txt").write_text(
                "[system]\nserver system\n[user]\nserver user",
                encoding="utf-8",
            )
            with patch.dict(os.environ, {"TREND_RADAR_CONFIG_DIR": directory}, clear=False):
                system, user = load_prompt_template("sample.txt", "ai_filter", "test")
            self.assertEqual(system, "server system")
            self.assertEqual(user, "server user")


if __name__ == "__main__":
    unittest.main()
