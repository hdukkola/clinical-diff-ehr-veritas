import unittest
import json
import os
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import service
from service import compare, run_compare, ExtractionError, InferenceError
from replay import FIXTURE_PAYLOAD, REPLAY_NOTICE, replay_enabled

P = {'synthetic_only': True, 'earlier': {'source_id':'old', 'text':'Earlier list: Aspirin.'},
     'later': {'source_id':'new', 'text':'Later list: Ibuprofen.'}}
class CompareTests(unittest.TestCase):
    def test_comparison_preserves_source_evidence(self):
        answers = iter(['{"medications":["Aspirin"]}', '{"medications":["Ibuprofen"]}'])
        result = compare(P, lambda _: next(answers))
        self.assertEqual([x['kind'] for x in result['differences']], ['earlier_only', 'later_only'])
        evidence = result['differences'][0]['evidence'][0]
        self.assertEqual(P['earlier']['text'][evidence['start']:evidence['end']], 'Aspirin')
        self.assertTrue(result['review_required'])
        self.assertIn('not a confirmed error', ' '.join(result['limitations']).lower())
    def test_unsupported_hallucination_is_not_a_mention(self):
        answers = iter(['{"medications":["warfarin"]}', '{"medications":[]}'])
        result = compare(P, lambda _: next(answers))
        self.assertEqual(result['earlier']['unsupported_outputs'], ['warfarin'])
        self.assertEqual(result['differences'], [])
    def test_bare_json_array_is_checked_against_source(self):
        answers = iter(['["Aspirin"]', '["Ibuprofen"]'])
        self.assertEqual(len(compare(P, lambda _:next(answers))['differences']), 2)
    def test_invalid_output_does_not_fabricate_removal(self):
        answers = iter(['{"medications":["Aspirin"]}', 'not json'])
        with self.assertRaises(ExtractionError): compare(P, lambda _: next(answers))
    def test_synthetic_and_source_validation(self):
        with self.assertRaises(ValueError): compare({**P, 'synthetic_only':False}, lambda _: '{}')
        with self.assertRaises(ValueError): compare({**P, 'later':P['earlier']}, lambda _: '{}')
    def test_finds_valid_occurrence_after_invalid_substring(self):
        p = {**P, 'earlier': {'source_id':'old', 'text':'Aspirinase; later Aspirin.'}}
        answers = iter(['["Aspirin"]', '[]'])
        self.assertEqual(compare(p, lambda _:next(answers))['earlier']['mentions'][0]['start'], 18)
    def test_model_value_error_is_an_inference_failure(self):
        def broken(_): raise ValueError('model failed')
        with self.assertRaises(InferenceError): compare(P, broken)
    def test_substring_is_not_accepted_inside_a_word(self):
        answers = iter(['{"medications":["spirin"]}', '{"medications":[]}'])
        self.assertEqual(compare(P, lambda _:next(answers))['earlier']['mentions'], [])

class ReplayTests(unittest.TestCase):
    def test_replay_disabled_by_default(self):
        env = {k: v for k, v in os.environ.items() if k != 'CLINICAL_DIFF_REPLAY'}
        self.assertFalse(replay_enabled(env))

    def test_replay_rejects_non_fixture_inputs(self):
        with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
            with self.assertRaises(ValueError) as caught:
                run_compare(P)
            self.assertIn('fixed fictional fixture', str(caught.exception))

    def test_replay_is_deterministic_and_labeled(self):
        with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
            first = run_compare(FIXTURE_PAYLOAD)
            second = run_compare(FIXTURE_PAYLOAD)
        self.assertEqual(first, second)
        self.assertTrue(first['simulated'])
        self.assertFalse(first['live_ai'])
        self.assertEqual(first['mode'], 'deterministic_replay')
        self.assertIn(REPLAY_NOTICE, first['notice'])
        self.assertIn(REPLAY_NOTICE, first['disclaimer'])
        self.assertTrue(first['review_required'])
        self.assertEqual([d['kind'] for d in first['differences']], ['earlier_only', 'later_only'])
        self.assertEqual([d['name'] for d in first['differences']], ['Aspirin', 'Atorvastatin'])
        blob = json.dumps(first)
        self.assertNotRegex(blob, r'\d{4}-\d{2}-\d{2}')
        self.assertNotIn('recorded_at', blob.lower())
        self.assertNotIn('recordedAt', blob)
        self.assertIn('not clinically validated', first['notice'].lower())
        self.assertIn('not errors', ' '.join(first['limitations']).lower())
        self.assertNotIn('clinically validated software', blob.lower())
        self.assertNotIn('clinical decision support', first['notice'].lower())

    def test_replay_rejects_extra_fields(self):
        with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
            for extra in (
                {**FIXTURE_PAYLOAD, 'unexpected': 'data'},
                {**FIXTURE_PAYLOAD, 'earlier': {**FIXTURE_PAYLOAD['earlier'], 'extra': 'data'}},
                {**FIXTURE_PAYLOAD, 'later': {**FIXTURE_PAYLOAD['later'], 'extra': 'data'}},
            ):
                with self.assertRaises(ValueError): run_compare(extra)

    def test_replay_does_not_invoke_local_model(self):
        with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
            with patch.object(service, 'extract', side_effect=AssertionError('MLX must stay unused')):
                run_compare(FIXTURE_PAYLOAD)

class EndpointTests(unittest.TestCase):
    def _serve(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        return server, worker

    def _stop(self, server, worker):
        server.shutdown()
        server.server_close()
        worker.join()

    def test_model_value_error_returns_503_not_400(self):
        server, worker = self._serve()
        request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/compare',
            data=json.dumps(P).encode(), headers={'Content-Type':'application/json'})
        try:
            with patch.object(service, 'extract', side_effect=ValueError('model error')):
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(request, timeout=3)
                self.assertEqual(caught.exception.code, 503)
                self.assertTrue(json.load(caught.exception)['review_required'])
        finally:
            self._stop(server, worker)

    def test_replay_health_and_compare_contract(self):
        server, worker = self._serve()
        try:
            with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
                with urllib.request.urlopen(
                        f'http://127.0.0.1:{server.server_port}/health', timeout=3) as resp:
                    health = json.load(resp)
                self.assertEqual(health['mode'], 'deterministic_replay')
                self.assertTrue(health['simulated'])
                self.assertFalse(health['live_ai'])
                self.assertIn(REPLAY_NOTICE, health['notice'])
                ok = urllib.request.Request(
                    f'http://127.0.0.1:{server.server_port}/compare',
                    data=json.dumps(FIXTURE_PAYLOAD).encode(),
                    headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(ok, timeout=3) as resp:
                    body = json.load(resp)
                self.assertTrue(body['simulated'])
                self.assertFalse(body['live_ai'])
                bad = urllib.request.Request(
                    f'http://127.0.0.1:{server.server_port}/compare',
                    data=json.dumps(P).encode(),
                    headers={'Content-Type': 'application/json'})
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(bad, timeout=3)
                self.assertEqual(caught.exception.code, 400)
                err = json.load(caught.exception)
                self.assertTrue(err['simulated'])
                self.assertFalse(err['live_ai'])
                self.assertIn('fixed fictional fixture', err['error'])
        finally:
            self._stop(server, worker)

if __name__ == '__main__': unittest.main()
