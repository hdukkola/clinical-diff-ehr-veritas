import unittest
import http.client
import json
import os
import socket
import threading
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import editorial
import replay
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


class HardeningTests(unittest.TestCase):
    def _serve(self, handler_cls=service.Handler):
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler_cls)
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        return server, worker

    def _stop(self, server, worker):
        server.shutdown()
        server.server_close()
        worker.join()

    def _raw_request(self, port, raw_bytes):
        with socket.create_connection(('127.0.0.1', port), timeout=3) as sock:
            sock.sendall(raw_bytes)
            sock.shutdown(socket.SHUT_WR)
            chunks = []
            while True:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
        raw = b''.join(chunks)
        head, _, body = raw.partition(b'\r\n\r\n')
        status_line = head.split(b'\r\n', 1)[0].decode('ascii', 'replace')
        status = int(status_line.split(' ')[1])
        return status, head.decode('iso-8859-1', 'replace'), body

    def test_hyphen_underscore_and_combining_mark_boundaries(self):
        for text, name in [
            ('Uses non-Heparin therapy.', 'Heparin'),
            ('Administer Co-trimoxazole today.', 'trimoxazole'),
            ('Uses pseudo_Metformin daily.', 'Metformin'),
            ('Lists Warfarin\u0301 50 mg.', 'Warfarin'),
            ('Mentions Aspirin2 only.', 'Aspirin'),
            ('Vitamin B12 100 mcg.', 'B1'),
        ]:
            acc, unsup = service.validate_model_output(json.dumps([name]), {'source_id': 's', 'text': text})
            self.assertEqual(acc, [], text)
            self.assertEqual(unsup, [name], text)
        # Full hyphenated drug name and em-dash delimited name remain supported.
        acc, unsup = service.validate_model_output(
            json.dumps(['5-FU', 'Aspirin']),
            {'source_id': 's', 'text': 'Rx—Aspirin—PO and 5-FU.'},
        )
        self.assertEqual([m['name'] for m in acc], ['Aspirin', '5-FU'])
        self.assertEqual(unsup, [])

    def test_concatenated_dose_and_trailing_period(self):
        p = {
            'synthetic_only': True,
            'earlier': {'source_id': 'a', 'text': 'Take Aspirin81mg daily; Warfarin.Next visit.'},
            'later': {'source_id': 'b', 'text': 'Take Aspirin 81mg daily; Warfarin.'},
        }
        res = compare(p, lambda t: json.dumps(['Aspirin', 'Warfarin.']) if 'Next' in t else json.dumps(['Aspirin', 'Warfarin']))
        self.assertEqual(res['differences'], [])
        self.assertEqual([m['name'] for m in res['earlier']['mentions']], ['Aspirin', 'Warfarin'])

    def test_multi_mention_offsets_and_span_dedupe(self):
        text = 'Prior: Discontinued Aspirin. Plan: Continue Aspirin 81 mg; PM ASPIRIN 325 mg.'
        acc, unsup = service.validate_model_output(
            json.dumps(['Aspirin', 'ASPIRIN']),
            {'source_id': 'm', 'text': text},
        )
        self.assertEqual(unsup, [])
        self.assertEqual(len(acc), 3)
        for m in acc:
            self.assertEqual(text[m['start']:m['end']], m['name'])

    def test_unicode_nfc_nfd_casefold_symmetry_and_multispace(self):
        p = {
            'synthetic_only': True,
            'earlier': {'source_id': 'u1', 'text': 'Takes Caf\u00e9ine, Vitamin\nD3, Aspirin.'},
            'later': {'source_id': 'u2', 'text': 'Takes Cafe\u0301ine, Vitamin  D3, Aspir\u0130n.'},
        }
        res = compare(p, lambda _: json.dumps(['Caf\u00e9ine', 'Vitamin D3', 'Aspirin']))
        self.assertEqual(res['differences'], [])
        self.assertEqual(res['later']['unsupported_outputs'], [])
        later_names = [m['name'] for m in res['later']['mentions']]
        self.assertEqual(later_names, ['Cafe\u0301ine', 'Vitamin  D3', 'Aspir\u0130n'])
        for m in res['later']['mentions']:
            self.assertEqual(p['later']['text'][m['start']:m['end']], m['name'])
        # ß vs ss and ﬁ vs fi remain distinct in both matching and deduplication.
        acc, _ = service.validate_model_output(
            json.dumps(['Proß', 'Pross', 'Mor\ufb01ne', 'Morfine']),
            {'source_id': 'cf', 'text': 'Proß Pross Mor\ufb01ne Morfine'},
        )
        self.assertEqual([m['name'] for m in acc], ['Proß', 'Pross', 'Mor\ufb01ne', 'Morfine'])

    def test_invisible_chars_punctuation_tokens_dedupe_and_caps(self):
        for invis in ('\u200b', '\ufeff', '\u200c', '\u200d', '\u2060', '\xad'):
            with self.assertRaises(ValueError):
                service.validate_payload({**P, 'earlier': {'source_id': 'a', 'text': invis * 3}})
            with self.assertRaises(ExtractionError):
                service.validate_model_output(json.dumps([invis]), {'source_id': 's', 'text': 'Aspirin.'})
        with self.assertRaises(ValueError):
            service.validate_payload({**P, 'earlier': {'source_id': 'note-0', 'text': 'A'}, 'later': {'source_id': ' note-0 ', 'text': 'B'}})

        acc, unsup = service.validate_model_output(
            json.dumps(['-', '💊', 'NoSuchDrug', 'nosuchdrug', (' ' * 145) + 'Aspirin']),
            {'source_id': 's', 'text': 'Take - 💊 Aspirin.'},
        )
        self.assertEqual([m['name'] for m in acc], ['Aspirin'])
        self.assertEqual(unsup, ['-', '💊', 'NoSuchDrug'])

        meds = [f'MedItem{i:03d}' for i in range(150)]
        acc_many, unsup_many = service.validate_model_output(
            json.dumps(meds),
            {'source_id': 's', 'text': ', '.join(meds) + '.'},
        )
        self.assertEqual(len(acc_many), 150)
        self.assertEqual(unsup_many, [])
        with self.assertRaises(ExtractionError):
            service.validate_model_output(
                json.dumps([f'FakeMed{i}' for i in range(101)]),
                {'source_id': 's', 'text': 'Aspirin.'},
            )
        with self.assertRaises(ExtractionError):
            service.validate_model_output(('[' * 19500) + (']' * 19500), {'source_id': 's', 'text': 'Aspirin.'})

    def test_replay_validate_payload_requires_synthetic_only_true(self):
        for bad in (False, 0, None, 'true', 1):
            with self.assertRaises(ValueError):
                replay.validate_replay_payload({**FIXTURE_PAYLOAD, 'synthetic_only': bad})

    def test_http_framing_recursion_cors_query_and_methods(self):
        server, worker = self._serve()
        port = server.server_port
        try:
            with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
                # Deeply nested JSON returns 400 (not 503) with replay labels.
                nested = (b'[' * 19500) + (b']' * 19500)
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                conn.request('POST', '/compare?debug=1', body=nested, headers={'Content-Type': 'application/json'})
                resp = conn.getresponse()
                data = json.loads(resp.read())
                conn.close()
                self.assertEqual(resp.status, 400)
                self.assertTrue(data['simulated'])

                # Query strings on /health and /compare work.
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                conn.request('GET', '/health?check=1')
                resp = conn.getresponse()
                resp.read()
                conn.close()
                self.assertEqual(resp.status, 200)

                # Unsupported methods return JSON 405 with replay labels (HEAD omits body).
                for method in ('PUT', 'DELETE', 'PATCH', 'TRACE', 'HEAD'):
                    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                    conn.request(method, '/compare')
                    resp = conn.getresponse()
                    raw = resp.read()
                    conn.close()
                    self.assertEqual(resp.status, 405, method)
                    self.assertTrue(resp.getheader('Content-Type', '').startswith('application/json'))
                    self.assertEqual(resp.getheader('Cache-Control'), 'no-store')
                    if method == 'HEAD':
                        self.assertEqual(raw, b'')
                    else:
                        self.assertTrue(json.loads(raw)['simulated'])

                # Duplicate/lax Content-Length, truncated body, and empty Origin.
                fb = json.dumps(FIXTURE_PAYLOAD).encode('utf-8')
                for req in [
                    f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {len(fb)}\r\nContent-Length: {len(fb)}\r\n\r\n'.encode('ascii') + fb,
                    f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: +{len(fb)}\r\n\r\n'.encode('ascii') + fb,
                    f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 0_{len(fb)}\r\n\r\n'.encode('ascii') + fb,
                    f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {len(fb) + 20}\r\n\r\n'.encode('ascii') + fb,
                ]:
                    st, _, _ = self._raw_request(port, req)
                    self.assertEqual(st, 400)
                st, _, _ = self._raw_request(
                    port,
                    f'POST /compare HTTP/1.1\r\nHost: localhost\r\nOrigin: \r\nContent-Type: application/json\r\nContent-Length: {len(fb)}\r\n\r\n'.encode('ascii') + fb,
                )
                self.assertEqual(st, 403)

            # Valid MAX_NOTE UTF-8 4-byte payload (>40KB JSON) succeeds over HTTP.
            clean_env = {k: v for k, v in os.environ.items() if k != 'CLINICAL_DIFF_REPLAY'}
            big_payload = {
                'synthetic_only': True,
                'earlier': {'source_id': 'e', 'text': 'Aspirin ' + ('💊' * 11000)},
                'later': {'source_id': 'l', 'text': 'Ibuprofen ' + ('💊' * 11000)},
            }
            big_bytes = json.dumps(big_payload, ensure_ascii=False).encode('utf-8')
            self.assertGreater(len(big_bytes), 40000)
            with patch.dict(os.environ, clean_env, clear=True):
                with patch.object(service, 'extract', side_effect=['["Aspirin"]', '["Ibuprofen"]']):
                    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                    conn.request('POST', '/compare', body=big_bytes, headers={'Content-Type': 'application/json'})
                    resp = conn.getresponse()
                    body = json.loads(resp.read())
                    conn.close()
            self.assertEqual(resp.status, 200)
            self.assertEqual(len(body['differences']), 2)
        finally:
            self._stop(server, worker)

    def test_editorial_handler_origin_queries_and_replay_host_403(self):
        class StandaloneEditorial(editorial.EditorialHandler):
            pass

        server, worker = self._serve(StandaloneEditorial)
        port = server.server_port
        host = f'127.0.0.1:{port}'
        try:
            with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
                for path in ('/?cache=1', '/index.html?v=2', '/note-extraction.js?v=2', '/health?check=1'):
                    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                    conn.request('GET', path, headers={'Host': host})
                    resp = conn.getresponse()
                    resp.read()
                    conn.close()
                    self.assertEqual(resp.status, 200, path)

                # Same-origin POST works even without editorial.main().
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                conn.request(
                    'POST',
                    '/compare?debug=1',
                    body=json.dumps(FIXTURE_PAYLOAD).encode('utf-8'),
                    headers={'Host': host, 'Origin': f'http://{host}', 'Content-Type': 'application/json'},
                )
                resp = conn.getresponse()
                resp.read()
                conn.close()
                self.assertEqual(resp.status, 200)
                self.assertEqual(resp.getheader('Access-Control-Allow-Origin'), f'http://{host}')

                # Bad Host in replay mode returns JSON 403 with replay labels.
                conn = http.client.HTTPConnection('127.0.0.1', port, timeout=3)
                conn.request('GET', '/health', headers={'Host': f'localhost:{port}'})
                resp = conn.getresponse()
                err = json.loads(resp.read())
                conn.close()
                self.assertEqual(resp.status, 403)
                self.assertTrue(resp.getheader('Content-Type', '').startswith('application/json'))
                self.assertTrue(err['simulated'])
                self.assertFalse(err['live_ai'])
        finally:
            self._stop(server, worker)


if __name__ == '__main__': unittest.main()
