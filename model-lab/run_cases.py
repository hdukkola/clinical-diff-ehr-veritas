#!/usr/bin/env python3
"""Sequential, resumable JSONL case runner. Expected substrings are not clinical safety judgments."""
import argparse
import hashlib
import json
import socket
import urllib.error
import urllib.request
from pathlib import Path

p = argparse.ArgumentParser()
p.add_argument('cases', help='JSONL: unique id, question, expected_contains, optional critical')
p.add_argument('results', help='Append-only JSONL; keep outside source control')
p.add_argument('--port', type=int, default=8766)
p.add_argument('--timeout', type=float, default=300)
a = p.parse_args()
cases = [json.loads(line) for line in Path(a.cases).read_text().splitlines() if line.strip()]
if len(cases) > 10000 or any(not isinstance(c.get('id'), str) or not isinstance(c.get('question'), str) or not isinstance(c.get('expected_contains'), str) or not c['expected_contains'] for c in cases) or len({c['id'] for c in cases}) != len(cases):
    raise SystemExit('Cases require unique string ids, question, nonempty expected_contains; max 10000.')
completed = {}
result_path = Path(a.results)
if result_path.exists():
    for line in result_path.read_text().splitlines():
        if line.strip():
            record = json.loads(line)
            completed[record['id']] = record

def fingerprint(case):
    return hashlib.sha256(json.dumps(case, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
for case in cases:
    old = completed.get(case['id'])
    if old and old.get('case_hash') != fingerprint(case):
        raise SystemExit('Case changed since previous run: ' + case['id'])
for case in cases:
    if case['id'] in completed:
        continue
    result = {'id': case['id'], 'case_hash': fingerprint(case), 'critical': bool(case.get('critical', False))}
    body = json.dumps({'synthetic_only': True, 'question': case['question']}).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{a.port}/ask', data=body, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=a.timeout) as response:
            answer = json.load(response)['answer']
        result.update(status='pass' if case['expected_contains'].casefold() in answer.casefold() else 'fail', answer=answer)
    except (TimeoutError, socket.timeout):
        result['status'] = 'timeout'
    except (urllib.error.URLError, ValueError, KeyError, OSError) as exc:
        result.update(status='error', error=type(exc).__name__)
    with result_path.open('a') as out:
        out.write(json.dumps(result, ensure_ascii=False) + '\n')
        out.flush()
    completed[case['id']] = result
    records = [completed[c['id']] for c in cases if c['id'] in completed]
    counts = {k: sum(r['status'] == k for r in records) for k in ('pass', 'fail', 'timeout', 'error')}
    print(json.dumps({'completed': len(records), 'total': len(cases), **counts, 'critical_not_passed': sum(r['critical'] and r['status'] != 'pass' for r in records)}), flush=True)
