import tempfile
import unittest
from pathlib import Path

from server import CounterStore


class CounterStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.state_file = Path(self.temporary_directory.name) / "state.json"
        self.store = CounterStore(self.state_file, b"test-secret-that-is-at-least-32-bytes", daily_ip_limit=2)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def test_refresh_does_not_increment(self):
        self.assertEqual(self.store.record("visitor-id-0000000001", "203.0.113.1"), (1, True))
        self.assertEqual(self.store.record("visitor-id-0000000001", "203.0.113.1"), (1, False))

    def test_distinct_visitors_behind_nat_are_counted(self):
        self.store.record("visitor-id-0000000001", "203.0.113.1")
        self.assertEqual(self.store.record("visitor-id-0000000002", "203.0.113.1"), (2, True))

    def test_ip_limit_only_blocks_excess_new_ids(self):
        self.store.record("visitor-id-0000000001", "203.0.113.1")
        self.store.record("visitor-id-0000000002", "203.0.113.1")
        self.assertEqual(self.store.record("visitor-id-0000000003", "203.0.113.1"), (2, False))

    def test_count_survives_restart(self):
        self.store.record("visitor-id-0000000001", "203.0.113.1")
        restarted = CounterStore(self.state_file, b"test-secret-that-is-at-least-32-bytes")
        self.assertEqual(restarted.record("visitor-id-0000000001", "203.0.113.1"), (1, False))


if __name__ == "__main__":
    unittest.main()
