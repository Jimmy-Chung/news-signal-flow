from types import SimpleNamespace
import unittest
from unittest.mock import patch

from trendradar.ai.client import AIClient


def _response(content="ok"):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


class AIClientExtraParamsTests(unittest.TestCase):
    def make_client(self):
        return AIClient({
            "MODEL": "deepseek/deepseek-v4-flash",
            "API_KEY": "test-key",
            "EXTRA_PARAMS": {
                "extra_body": {"thinking": {"type": "disabled"}},
            },
        })

    def test_chat_forwards_configured_extra_params(self):
        client = self.make_client()

        with patch("trendradar.ai.client.completion", return_value=_response()) as mocked:
            self.assertEqual(
                client.chat([{"role": "user", "content": "hello"}]),
                "ok",
            )

        self.assertEqual(
            mocked.call_args.kwargs["extra_body"],
            {"thinking": {"type": "disabled"}},
        )

    def test_chat_call_extra_params_override_config_defaults(self):
        client = self.make_client()
        override = {"thinking": {"type": "enabled"}}

        with patch("trendradar.ai.client.completion", return_value=_response()) as mocked:
            client.chat([{"role": "user", "content": "hello"}], extra_body=override)

        self.assertEqual(mocked.call_args.kwargs["extra_body"], override)


if __name__ == "__main__":
    unittest.main()
