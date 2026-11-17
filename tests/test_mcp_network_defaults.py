import inspect
import unittest

from mcp_server.server import DEFAULT_HTTP_HOST, run_server


class McpNetworkDefaultTests(unittest.TestCase):
    def test_http_transport_defaults_to_loopback(self):
        self.assertEqual(DEFAULT_HTTP_HOST, "127.0.0.1")
        self.assertEqual(
            inspect.signature(run_server).parameters["host"].default,
            DEFAULT_HTTP_HOST,
        )


if __name__ == "__main__":
    unittest.main()
