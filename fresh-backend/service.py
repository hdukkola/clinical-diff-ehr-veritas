"""Local-only experimental synthetic note comparison; not clinical software."""
from __future__ import annotations
import json
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

MAX_BODY = 40000
MAX_NOTE = 12000
ALLOWED_ORIGINS = {'http://localhost:3000', 'http://127.0.0.1:3000'}
MODEL_ID = 'mlx-community/Qwen3.5-4B-4bit'
MODEL_REVISION = '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c'
DISCLAIMER = 'Synthetic prototype only; differences are not confirmed errors or medical advice.'
SYSTEM = ('Extract medication names explicitly written in this fictional note. '
          'Return only JSON with a medications array of strings. Do not infer or recommend medications.')

class ExtractionError(Exception):
    pass

class InferenceError(Exception):
    pass

def validate_payload(payload):
    if not isinstance(payload, dict) or payload.get('synthetic_only') is not True:
        raise ValueError('Set synthetic_only to true; use fictional records only.')
    sources = []
    for side in ('earlier', 'later'):
        source = payload.get(side)
        if not isinstance(source, dict):
            raise ValueError(f'{side} must be an object.')
        source_id, text = source.get('source_id'), source.get('text')
        if not isinstance(source_id, str) or not source_id.strip() or len(source_id) > 100:
            raise ValueError(f'{side}.source_id must be a non-empty string (max 100).')
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_NOTE:
            raise ValueError(f'{side}.text must be a non-empty string (max {MAX_NOTE}).')
        sources.append({'source_id': source_id, 'text': text})
    if sources[0]['source_id'] == sources[1]['source_id']:
        raise ValueError('Source IDs must be distinct.')
    return sources

def validate_model_output(raw, source):
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        raise ExtractionError('Model output was not valid JSON; review the source manually.') from exc
    if isinstance(value, dict):
        names = value.get('medications')
    else:
        names = value
    if not isinstance(names, list):
        raise ExtractionError('Model output did not contain a medications array; review manually.')
    if len(names) > 100 or any(not isinstance(n, str) or not n.strip() or len(n) > 150 for n in names):
        raise ExtractionError('Model returned invalid medication entries; review manually.')
    accepted, unsupported, seen = [], [], set()
    for name in names:
        name = name.strip()
        match = next((m for m in re.finditer(re.escape(name), source['text'], flags=re.IGNORECASE)
                      if not (m.start() and source['text'][m.start()-1].isalnum())
                      and not (m.end() < len(source['text']) and source['text'][m.end()].isalnum())), None)
        if not match:
            unsupported.append(name)
            continue
        evidence = match.group(0)
        key = evidence.casefold()
        if key not in seen:
            seen.add(key)
            accepted.append({'name': evidence, 'source_id': source['source_id'],
                             'start': match.start(), 'end': match.end()})
    return accepted, unsupported

def compare(payload, extractor):
    earlier, later = validate_payload(payload)
    # A parse or inference failure aborts the whole comparison, rather than showing false removals.
    try:
        old_raw = extractor(earlier['text'])
        new_raw = extractor(later['text'])
    except Exception as exc:
        raise InferenceError('Local model unavailable; review source records manually.') from exc
    old, old_unsupported = validate_model_output(old_raw, earlier)
    new, new_unsupported = validate_model_output(new_raw, later)
    old_map = {x['name'].casefold(): x for x in old}
    new_map = {x['name'].casefold(): x for x in new}
    changes = []
    for key in sorted(old_map.keys() | new_map.keys()):
        if key in old_map and key not in new_map:
            changes.append({'kind': 'earlier_only', 'name': old_map[key]['name'], 'evidence': [old_map[key]]})
        elif key in new_map and key not in old_map:
            changes.append({'kind': 'later_only', 'name': new_map[key]['name'], 'evidence': [new_map[key]]})
    return {'disclaimer': DISCLAIMER, 'review_required': True,
            'limitations': ['Name mentions only; no dose, status, clinical intent, or authorization is inferred.',
                            'Absence from an extraction does not establish absence from a source; review both notes.',
                            'Exact-name comparison does not match brand names, synonyms or misspellings.',
                            'Text matches establish only a literal mention, not its meaning, patient, or current status.',
                            'Offsets are Python Unicode code-point indices, end exclusive.'],
            'earlier': {'source_id': earlier['source_id'], 'mentions': old, 'unsupported_outputs': old_unsupported},
            'later': {'source_id': later['source_id'], 'mentions': new, 'unsupported_outputs': new_unsupported},
            'differences': changes}

class LocalModel:
    def __init__(self):
        self.model = self.tokenizer = None
        self.lock = threading.Lock()
    def __call__(self, text):
        from mlx_lm import load, generate
        from mlx_lm.sample_utils import make_sampler
        from huggingface_hub import snapshot_download
        with self.lock:
            if self.model is None:
                path = snapshot_download(MODEL_ID, revision=MODEL_REVISION)
                self.model, self.tokenizer = load(path)
            messages = [{'role':'system', 'content': SYSTEM}, {'role':'user', 'content': text}]
            prompt = self.tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, enable_thinking=False)
            return generate(self.model, self.tokenizer, prompt=prompt, max_tokens=256,
                            sampler=make_sampler(temp=0), verbose=False)

extract = LocalModel()

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # Never log request bodies or note text.
    def send_json(self, status, payload):
        raw = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        origin = self.headers.get('Origin')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(raw)
    def do_OPTIONS(self):
        if self.headers.get('Origin') not in ALLOWED_ORIGINS:
            return self.send_json(403, {'error': 'Origin not allowed.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Vary', 'Origin')
        self.end_headers()
    def do_GET(self):
        if self.path != '/health': return self.send_json(404, {'error':'Not found.'})
        self.send_json(200, {'status':'ready', 'model_loaded':extract.model is not None, 'disclaimer':DISCLAIMER})
    def do_POST(self):
        if self.path != '/compare': return self.send_json(404, {'error':'Not found.'})
        origin = self.headers.get('Origin')
        if origin and origin not in ALLOWED_ORIGINS:
            return self.send_json(403, {'error':'Origin not allowed.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_BODY: raise ValueError('Invalid request size.')
            if self.headers.get_content_type() != 'application/json': raise ValueError('Use application/json.')
            payload = json.loads(self.rfile.read(length))
            self.send_json(200, compare(payload, extract))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            self.send_json(400, {'error':str(exc)})
        except ExtractionError as exc:
            self.send_json(502, {'error':str(exc), 'review_required':True})
        except InferenceError as exc:
            self.send_json(503, {'error':str(exc), 'review_required':True})
        except Exception:
            self.send_json(503, {'error':'Local model unavailable; review the source records manually.', 'review_required':True})

if __name__ == '__main__':
    port = int(os.environ.get('CLINICAL_DIFF_PORT', '8765'))
    print(f'Synthetic-only service listening on 127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
