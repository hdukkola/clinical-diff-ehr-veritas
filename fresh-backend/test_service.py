import unittest
import json
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import service
from service import compare, ExtractionError, InferenceError

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

class EndpointTests(unittest.TestCase):
    def test_model_value_error_returns_503_not_400(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}/compare',
            data=json.dumps(P).encode(), headers={'Content-Type':'application/json'})
        try:
            with patch.object(service, 'extract', side_effect=ValueError('model error')):
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(request, timeout=3)
                self.assertEqual(caught.exception.code, 503)
                self.assertTrue(json.load(caught.exception)['review_required'])
        finally:
            server.shutdown()
            server.server_close()
            worker.join()

if __name__ == '__main__': unittest.main()
