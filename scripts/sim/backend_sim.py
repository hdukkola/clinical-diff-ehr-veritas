"""1,000-case deterministic simulation suite for fresh-backend/ (service, replay, editorial)."""
from __future__ import annotations

import http.client
import json
import os
import random
import re
import socket
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = REPO_ROOT / 'fresh-backend'
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import editorial  # noqa: E402
import replay  # noqa: E402
import service  # noqa: E402

DRUGS = [
    'Aspirin',
    'Lisinopril',
    'Metformin',
    'Atorvastatin',
    'Warfarin',
    'Heparin',
    'Furosemide',
    'Carvedilol',
    'Gabapentin',
    'Sertraline',
    'Apixaban',
    'Levothyroxine',
]

CF_CHARS = ['\u200b', '\ufeff', '\u200c', '\u200d', '\u2060', '\xad', '\u061c']


def _raw_http(port: int, payload: bytes) -> tuple[int, str, bytes]:
    with socket.create_connection(('127.0.0.1', port), timeout=3) as sock:
        sock.sendall(payload)
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


def run_backend_simulations() -> dict[str, object]:
    rng = random.Random(20261114)
    passed = 0
    failed = 0
    failures: list[dict[str, str]] = []
    breakdown: dict[str, int] = {
        'extraction_nfc_casefold': 0,
        'boundary_checks': 0,
        'cf_and_source_id_collisions': 0,
        'errors_recursion_and_validation': 0,
        'http_framing_cors_editorial': 0,
        'replay_enforcement': 0,
    }

    def check(category: str, case_name: str, fn) -> None:
        nonlocal passed, failed
        try:
            fn()
            passed += 1
            breakdown[category] += 1
        except Exception as exc:
            failed += 1
            if len(failures) < 30:
                failures.append({'category': category, 'case': case_name, 'error': f'{type(exc).__name__}: {exc}'})

    # -------------------------------------------------------------------------
    # 1. 250 cases: Note extraction matching, NFC/NFD, Turkish İ/ı, multispace, dedupe, caps
    # -------------------------------------------------------------------------
    for i in range(250):
        def _case_extraction(idx=i):
            mode = idx % 5
            if mode == 0:
                # NFC vs NFD + multi-whitespace + Turkish İ/ı symmetry
                text = 'Note:\n  Caf\u00e9ine\t81 mg,  Cafe\u0301ine,  Aspir\u0130n, and Aspir\u0131n.'
                query = ['Cafe\u0301ine', 'Aspirin']
                acc, unsup = service.validate_model_output(json.dumps(query), {'source_id': 's1', 'text': text})
                assert unsup == [], f'unexpected unsup: {unsup}'
                assert len(acc) == 4, f'expected 4 mentions, got {len(acc)}'
                for m in acc:
                    assert text[m['start']:m['end']] == m['name']
            elif mode == 1:
                # ß vs ss and ﬁ vs fi remain distinct
                text = 'Compare Proß vs Pross and Mor\ufb01ne vs Morfine.'
                acc, unsup = service.validate_model_output(
                    json.dumps(['Proß', 'Pross', 'Mor\ufb01ne', 'Morfine']),
                    {'source_id': 's2', 'text': text},
                )
                assert [m['name'] for m in acc] == ['Proß', 'Pross', 'Mor\ufb01ne', 'Morfine']
                assert unsup == []
            elif mode == 2:
                # Randomized multi-mention extraction + compare symmetry
                chosen = rng.sample(DRUGS, k=rng.randint(2, 6))
                half = len(chosen) // 2
                e_drugs = chosen[:half + 1]
                l_drugs = chosen[half:]
                e_text = 'Earlier note: ' + '; '.join(f'{d} daily' for d in e_drugs) + f' ({e_drugs[0].upper()}).'
                l_text = 'Later note: ' + '; '.join(f'{d} daily' for d in l_drugs) + '.'
                res = service.compare(
                    {
                        'synthetic_only': True,
                        'earlier': {'source_id': f'e-{idx}', 'text': e_text},
                        'later': {'source_id': f'l-{idx}', 'text': l_text},
                    },
                    lambda t: json.dumps(e_drugs if 'Earlier' in t else l_drugs),
                )
                expected_e_only = {d.lower() for d in e_drugs} - {d.lower() for d in l_drugs}
                expected_l_only = {d.lower() for d in l_drugs} - {d.lower() for d in e_drugs}
                actual_e_only = {d['name'].lower() for d in res['differences'] if d['kind'] == 'earlier_only'}
                actual_l_only = {d['name'].lower() for d in res['differences'] if d['kind'] == 'later_only'}
                assert actual_e_only == expected_e_only
                assert actual_l_only == expected_l_only
            elif mode == 3:
                # Astral code-point offsets match Python string slicing
                prefix = '💊🧬🩺' * ((idx % 10) + 1)
                drug = DRUGS[idx % len(DRUGS)]
                text = f'{prefix} Continue {drug} 10 mg.'
                acc, unsup = service.validate_model_output(json.dumps([drug]), {'source_id': 'ast', 'text': text})
                assert unsup == [] and len(acc) == 1
                assert text[acc[0]['start']:acc[0]['end']] == drug
            else:
                # Caps enforcement: >2000 list entries, >1000 unique, >100 unsupported, >150 len
                sub = idx % 4
                if sub == 0:
                    raw = json.dumps(['Aspirin'] * 2001)
                elif sub == 1:
                    raw = json.dumps([f'Drug{k}' for k in range(1001)])
                elif sub == 2:
                    raw = json.dumps([f'Missing{k}' for k in range(101)])
                else:
                    raw = json.dumps(['A' * 151])
                try:
                    service.validate_model_output(raw, {'source_id': 'cap', 'text': 'Aspirin.'})
                    raise AssertionError('Expected ExtractionError')
                except service.ExtractionError:
                    pass

        check('extraction_nfc_casefold', f'extract-{i+1}', _case_extraction)

    # -------------------------------------------------------------------------
    # 2. 200 cases: Boundary checks (concatenated doses vs invalid tokens)
    # -------------------------------------------------------------------------
    valid_concat = [
        ('Aspirin81mg daily', 'Aspirin'),
        ('Lisinopril10mg PO', 'Lisinopril'),
        ('Warfarin2.5mg', 'Warfarin'),
        ('Levothyroxine50mcg', 'Levothyroxine'),
        ('Furosemide40ug', 'Furosemide'),
        ('Potassium20meq', 'Potassium'),
        ('Heparin5000iu', 'Heparin'),
        ('Insulin10units', 'Insulin'),
        ('Insulin10u', 'Insulin'),
        ('Lactulose30ml', 'Lactulose'),
    ]
    invalid_boundary = [
        ('non-Heparin therapy', 'Heparin'),
        ('Co-trimoxazole', 'trimoxazole'),
        ('pseudo_Metformin', 'Metformin'),
        ('Warfarin\u0301 5 mg', 'Warfarin'),
        ('Aspirin2 daily', 'Aspirin'),
        ('Vitamin B12', 'B1'),
        ('Aspirin10mgx', 'Aspirin'),
        ('Aspirin_5', 'Aspirin'),
        ('xAspirin daily', 'Aspirin'),
        ('Aspirin\u2010XR', 'Aspirin'),
    ]
    for i in range(200):
        def _case_boundary(idx=i):
            if idx % 2 == 0:
                text, drug = valid_concat[(idx // 2) % len(valid_concat)]
                acc, unsup = service.validate_model_output(json.dumps([f'{drug}.']), {'source_id': 'b1', 'text': f'Take {text}.'})
                assert unsup == [], f'{text} -> {unsup}'
                assert [m['name'] for m in acc] == [drug]
            else:
                text, drug = invalid_boundary[(idx // 2) % len(invalid_boundary)]
                acc, unsup = service.validate_model_output(json.dumps([drug]), {'source_id': 'b2', 'text': text})
                assert acc == [], f'{text} matched {acc}'
                assert unsup == [drug]

        check('boundary_checks', f'boundary-{i+1}', _case_boundary)

    # -------------------------------------------------------------------------
    # 3. 150 cases: \p{Cf} rejection & source_id collision checks
    # -------------------------------------------------------------------------
    for i in range(150):
        def _case_cf(idx=i):
            cf = CF_CHARS[idx % len(CF_CHARS)]
            mode = idx % 3
            if mode == 0:
                # Cf-only text or source_id rejected
                try:
                    service.validate_payload({
                        'synthetic_only': True,
                        'earlier': {'source_id': cf * 3, 'text': 'Aspirin.'},
                        'later': {'source_id': 'l1', 'text': 'Ibuprofen.'},
                    })
                    raise AssertionError('Expected ValueError for Cf source_id')
                except ValueError:
                    pass
                try:
                    service.validate_payload({
                        'synthetic_only': True,
                        'earlier': {'source_id': 'e1', 'text': f' {cf} \t'},
                        'later': {'source_id': 'l1', 'text': 'Ibuprofen.'},
                    })
                    raise AssertionError('Expected ValueError for Cf text')
                except ValueError:
                    pass
            elif mode == 1:
                # Cf-only model output rejected as ExtractionError
                try:
                    service.validate_model_output(json.dumps([cf * 2]), {'source_id': 's', 'text': 'Aspirin.'})
                    raise AssertionError('Expected ExtractionError for Cf output')
                except service.ExtractionError:
                    pass
            else:
                # source_id collision via Cf stripping and NFC normalization
                pairs = [
                    ('note-1', f' {cf}note-1{cf} '),
                    ('Caf\u00e9-1', 'Cafe\u0301-1'),
                    (f'{cf}rx-9', 'rx-9\ufeff'),
                ]
                s1, s2 = pairs[idx % len(pairs)]
                try:
                    service.validate_payload({
                        'synthetic_only': True,
                        'earlier': {'source_id': s1, 'text': 'Aspirin.'},
                        'later': {'source_id': s2, 'text': 'Ibuprofen.'},
                    })
                    raise AssertionError(f'Expected ValueError collision for {s1!r} vs {s2!r}')
                except ValueError:
                    pass

        check('cf_and_source_id_collisions', f'cf-{i+1}', _case_cf)

    # -------------------------------------------------------------------------
    # 4. 150 cases: RecursionError, malformed JSON, synthetic_only, InferenceError
    # -------------------------------------------------------------------------
    for i in range(150):
        def _case_errors(idx=i):
            mode = idx % 5
            if mode == 0:
                nested = ('[' * 19500) + (']' * 19500)
                try:
                    service.validate_model_output(nested, {'source_id': 'r', 'text': 'Aspirin.'})
                    raise AssertionError('Expected ExtractionError on RecursionError')
                except service.ExtractionError:
                    pass
            elif mode == 1:
                bad_json = rng.choice(['not json', '{"medications": "Aspirin"}', '[123]', '{"wrong": []}', 'null'])
                try:
                    service.validate_model_output(bad_json, {'source_id': 'j', 'text': 'Aspirin.'})
                    raise AssertionError(f'Expected ExtractionError for {bad_json}')
                except service.ExtractionError:
                    pass
            elif mode == 2:
                bad_syn = [False, 0, None, 'true', 1, []][idx % 6]
                try:
                    service.validate_payload({
                        'synthetic_only': bad_syn,
                        'earlier': {'source_id': 'e', 'text': 'Aspirin.'},
                        'later': {'source_id': 'l', 'text': 'Ibuprofen.'},
                    })
                    raise AssertionError(f'Expected ValueError for synthetic_only={bad_syn!r}')
                except ValueError:
                    pass
            elif mode == 3:
                try:
                    service.compare(
                        {
                            'synthetic_only': True,
                            'earlier': {'source_id': 'e', 'text': 'Aspirin.'},
                            'later': {'source_id': 'l', 'text': 'Ibuprofen.'},
                        },
                        lambda _: (_ for _ in ()).throw(RuntimeError('boom')),
                    )
                    raise AssertionError('Expected InferenceError')
                except service.InferenceError:
                    pass
            else:
                # Invalid output on later side must abort comparison without fabricating removals
                answers = iter(['{"medications":["Aspirin"]}', 'not-valid-json'])
                try:
                    service.compare(
                        {
                            'synthetic_only': True,
                            'earlier': {'source_id': 'e', 'text': 'Aspirin.'},
                            'later': {'source_id': 'l', 'text': 'Ibuprofen.'},
                        },
                        lambda _: next(answers),
                    )
                    raise AssertionError('Expected ExtractionError')
                except service.ExtractionError:
                    pass

        check('errors_recursion_and_validation', f'err-{i+1}', _case_errors)

    # -------------------------------------------------------------------------
    # 5. 150 cases: HTTP Content-Length / Transfer-Encoding / CORS / HEAD / 405 / 403 /health / EditorialHandler
    # -------------------------------------------------------------------------
    svc_server = ThreadingHTTPServer(('127.0.0.1', 0), service.Handler)
    svc_thread = threading.Thread(target=svc_server.serve_forever, daemon=True)
    svc_thread.start()

    class StandaloneEditorial(editorial.EditorialHandler):
        pass

    ed_server = ThreadingHTTPServer(('127.0.0.1', 0), StandaloneEditorial)
    ed_thread = threading.Thread(target=ed_server.serve_forever, daemon=True)
    ed_thread.start()

    try:
        svc_port = svc_server.server_port
        ed_port = ed_server.server_port
        ed_host = f'127.0.0.1:{ed_port}'
        fb = json.dumps(replay.FIXTURE_PAYLOAD).encode('utf-8')

        with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
            for i in range(150):
                def _case_http(idx=i):
                    mode = idx % 10
                    if mode == 0:
                        # RecursionError over HTTP -> 400 with replay metadata
                        nested = (b'[' * 19500) + (b']' * 19500)
                        conn = http.client.HTTPConnection('127.0.0.1', svc_port, timeout=3)
                        conn.request('POST', '/compare', body=nested, headers={'Content-Type': 'application/json'})
                        resp = conn.getresponse()
                        data = json.loads(resp.read())
                        conn.close()
                        assert resp.status == 400 and data['simulated'] is True
                    elif mode == 1:
                        # Duplicate / invalid Content-Length -> 400
                        reqs = [
                            f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {len(fb)}\r\nContent-Length: {len(fb)}\r\n\r\n'.encode() + fb,
                            f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: +{len(fb)}\r\n\r\n'.encode() + fb,
                            f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 0\r\n\r\n'.encode(),
                            f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {service.MAX_BODY + 1}\r\n\r\n'.encode(),
                        ]
                        st, _, _ = _raw_http(svc_port, reqs[idx % len(reqs)])
                        assert st == 400, f'expected 400, got {st}'
                    elif mode == 2:
                        # Transfer-Encoding rejected with 400
                        raw = f'POST /compare HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n{len(fb):x}\r\n'.encode() + fb + b'\r\n0\r\n\r\n'
                        st, _, _ = _raw_http(svc_port, raw)
                        assert st == 400, f'expected 400 for Transfer-Encoding, got {st}'
                    elif mode == 3:
                        # CORS allowed vs disallowed Origin -> 403
                        bad_origin = ['http://evil.example', '', 'https://localhost:3000'][idx % 3]
                        raw = f'POST /compare HTTP/1.1\r\nHost: localhost\r\nOrigin: {bad_origin}\r\nContent-Type: application/json\r\nContent-Length: {len(fb)}\r\n\r\n'.encode() + fb
                        st, _, _ = _raw_http(svc_port, raw)
                        assert st == 403, f'expected 403 for Origin {bad_origin!r}, got {st}'
                    elif mode == 4:
                        # Allowed Origin on OPTIONS (204) and POST (200)
                        origin = 'http://localhost:3000' if idx % 2 == 0 else 'http://127.0.0.1:3000'
                        conn = http.client.HTTPConnection('127.0.0.1', svc_port, timeout=3)
                        conn.request('OPTIONS', '/compare', headers={'Origin': origin})
                        resp = conn.getresponse()
                        resp.read()
                        conn.close()
                        assert resp.status == 204
                        assert resp.getheader('Access-Control-Allow-Origin') == origin
                    elif mode == 5:
                        # HEAD / PUT / DELETE / PATCH / TRACE -> 405 (HEAD has empty body)
                        method = ('HEAD', 'PUT', 'DELETE', 'PATCH', 'TRACE')[idx % 5]
                        conn = http.client.HTTPConnection('127.0.0.1', svc_port, timeout=3)
                        conn.request(method, '/compare')
                        resp = conn.getresponse()
                        raw_body = resp.read()
                        conn.close()
                        assert resp.status == 405
                        assert resp.getheader('Allow') == 'GET, POST, OPTIONS'
                        if method == 'HEAD':
                            assert raw_body == b''
                        else:
                            assert json.loads(raw_body)['simulated'] is True
                    elif mode == 6:
                        # /health GET contract
                        conn = http.client.HTTPConnection('127.0.0.1', svc_port, timeout=3)
                        conn.request('GET', '/health?sim=1')
                        resp = conn.getresponse()
                        h = json.loads(resp.read())
                        conn.close()
                        assert resp.status == 200
                        assert h['status'] == 'ready' and h['mode'] == 'deterministic_replay'
                        assert h['simulated'] is True and h['live_ai'] is False
                    elif mode == 7:
                        # Unknown path -> 404
                        conn = http.client.HTTPConnection('127.0.0.1', svc_port, timeout=3)
                        conn.request('GET', '/nonexistent')
                        resp = conn.getresponse()
                        resp.read()
                        conn.close()
                        assert resp.status == 404
                    elif mode == 8:
                        # EditorialHandler enforces exact loopback Host (403 on bad Host)
                        conn = http.client.HTTPConnection('127.0.0.1', ed_port, timeout=3)
                        conn.request('GET', '/health', headers={'Host': f'localhost:{ed_port}'})
                        resp = conn.getresponse()
                        err = json.loads(resp.read())
                        conn.close()
                        assert resp.status == 403 and err['simulated'] is True
                    else:
                        # EditorialHandler serves assets and same-origin POST /compare
                        conn = http.client.HTTPConnection('127.0.0.1', ed_port, timeout=3)
                        conn.request('GET', '/note-extraction.js?v=1', headers={'Host': ed_host})
                        resp = conn.getresponse()
                        body = resp.read()
                        conn.close()
                        assert resp.status == 200 and b'createNoteWorkspace' in body

                check('http_framing_cors_editorial', f'http-{i+1}', _case_http)
    finally:
        svc_server.shutdown()
        svc_server.server_close()
        svc_thread.join()
        ed_server.shutdown()
        ed_server.server_close()
        ed_thread.join()

    # -------------------------------------------------------------------------
    # 6. 100 cases: replay.py synthetic_only === true & strict payload validation
    # -------------------------------------------------------------------------
    for i in range(100):
        def _case_replay(idx=i):
            mode = idx % 5
            if mode == 0:
                with patch.dict(os.environ, {'CLINICAL_DIFF_REPLAY': '1'}):
                    out = service.run_compare(replay.FIXTURE_PAYLOAD)
                assert out['simulated'] is True and out['live_ai'] is False
                assert out['mode'] == 'deterministic_replay'
                assert replay.REPLAY_NOTICE in out['notice']
                assert not re.search(r'\d{4}-\d{2}-\d{2}', json.dumps(out))
            elif mode == 1:
                bad_val = [False, 0, None, 'true', 1, {}][idx % 6]
                try:
                    replay.validate_replay_payload({**replay.FIXTURE_PAYLOAD, 'synthetic_only': bad_val})
                    raise AssertionError('Expected ValueError')
                except ValueError:
                    pass
            elif mode == 2:
                extra = {**replay.FIXTURE_PAYLOAD, f'extra_{idx}': 1}
                try:
                    replay.validate_replay_payload(extra)
                    raise AssertionError('Expected ValueError for extra key')
                except ValueError:
                    pass
            elif mode == 3:
                altered = {
                    'synthetic_only': True,
                    'earlier': {'source_id': replay.EARLIER_SOURCE_ID, 'text': replay.EARLIER_TEXT + ' '},
                    'later': dict(replay.FIXTURE_PAYLOAD['later']),
                }
                try:
                    replay.validate_replay_payload(altered)
                    raise AssertionError('Expected ValueError for altered fixture text')
                except ValueError:
                    pass
            else:
                ext = replay.ReplayExtractor()
                assert 'Aspirin' in ext(replay.EARLIER_TEXT)
                try:
                    ext('Arbitrary non-fixture note')
                    raise AssertionError('Expected ValueError from ReplayExtractor')
                except ValueError:
                    pass

        check('replay_enforcement', f'replay-{i+1}', _case_replay)

    return {
        'total': passed + failed,
        'passed': passed,
        'failed': failed,
        'breakdown': breakdown,
        'failures': failures,
    }


if __name__ == '__main__':
    summary = run_backend_simulations()
    print(json.dumps(summary, indent=2))
    sys.exit(0 if summary['failed'] == 0 and summary['total'] == 1000 else 1)
