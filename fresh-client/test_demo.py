import io
import json
import sys
import threading
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'fresh-backend'))
import demo
import service

class ClientTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
    def test_replay_round_trip_discloses_simulation(self):
        output = io.StringIO()
        with patch.dict('os.environ', {'CLINICAL_DIFF_REPLAY':'1'}), redirect_stdout(output):
            code = demo.main(['--mode','replay','--port',str(self.server.server_port)])
        self.assertEqual(code, 0)
        self.assertIn('SIMULATED REPLAY', output.getvalue())
        self.assertIn('"simulated": true', output.getvalue())
        self.assertIn('"earlier_only"', output.getvalue())
    def test_mode_mismatch_refuses_to_mislabel(self):
        with patch.dict('os.environ', {'CLINICAL_DIFF_REPLAY':'1'}):
            with self.assertRaises(demo.ClientError):
                demo.execute('live', demo.FIXTURE_PAYLOAD, self.server.server_port)
    def test_live_requires_input(self):
        with redirect_stderr(io.StringIO()):
            self.assertEqual(demo.main(['--mode','live']), 1)
    def test_rejects_non_synthetic_request(self):
        with self.assertRaises(demo.ClientError):
            demo.execute('live', {'synthetic_only':False}, self.server.server_port)
    def test_missing_service_is_failure(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        with self.assertRaises(demo.ClientError):
            demo.execute('replay', demo.FIXTURE_PAYLOAD, self.server.server_port)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()

if __name__ == '__main__': unittest.main()
