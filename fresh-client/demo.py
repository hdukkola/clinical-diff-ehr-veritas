#!/usr/bin/env python3
"""CLI for the local fictional-note service. Not for clinical use."""
import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'fresh-backend'))
from replay import FIXTURE_PAYLOAD  # noqa: E402

class ClientError(Exception):
    pass

def request_json(url, payload=None, timeout=120):
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    request = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        try:
            reason = json.load(exc).get('error', 'Request failed')
        except (ValueError, AttributeError):
            reason = 'Request failed'
        raise ClientError(f'Service returned {exc.code}: {reason}') from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise ClientError('Local service unavailable or returned invalid JSON.') from exc

def execute(mode, payload, port):
    if not isinstance(payload, dict) or payload.get('synthetic_only') is not True:
        raise ClientError('Input must declare synthetic_only: true and contain fictional records only.')
    base = f'http://127.0.0.1:{port}'
    health = request_json(base + '/health')
    expected = 'deterministic_replay' if mode == 'replay' else 'local_mlx'
    if health.get('mode') != expected:
        raise ClientError(f'Service mode is {health.get("mode", "unknown")}, not requested {expected}.')
    result = request_json(base + '/compare', payload)
    if mode == 'replay' and (result.get('mode') != expected or result.get('simulated') is not True or result.get('live_ai') is not False):
        raise ClientError('Replay response did not identify itself as simulated; refusing to display it.')
    return result

def main(argv=None):
    parser = argparse.ArgumentParser(description='Compare fictional notes using the local experimental service.')
    parser.add_argument('--mode', choices=('live','replay'), required=True)
    parser.add_argument('--input', type=Path, help='JSON payload with two fictional notes; required for live mode')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args(argv)
    try:
        if not 1 <= args.port <= 65535: raise ClientError('Port must be 1–65535.')
        if args.mode == 'live' and args.input is None: raise ClientError('Live mode requires --input.')
        if args.mode == 'replay' and args.input is not None: raise ClientError('Replay uses fixed fixtures; do not supply --input.')
        payload = json.loads(args.input.read_text()) if args.input else FIXTURE_PAYLOAD
        result = execute(args.mode, payload, args.port)
    except (ClientError, OSError, json.JSONDecodeError) as exc:
        print(f'No comparison produced: {exc}', file=sys.stderr)
        return 1
    print('SIMULATED REPLAY — NOT LIVE AI' if args.mode == 'replay' else 'LOCAL AI EXTRACTION — FICTIONAL NOTES ONLY')
    print('Prototype only. A difference is not a confirmed error or a treatment change; review both sources.')
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0

if __name__ == '__main__': sys.exit(main())
