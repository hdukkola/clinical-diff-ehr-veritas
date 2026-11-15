"""Local-only experimental synthetic note comparison; not clinical software."""
from __future__ import annotations
import json
import os
import re
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from replay import (
    FIXTURE_PAYLOAD,
    ReplayExtractor,
    label_replay_response,
    replay_enabled,
    validate_replay_payload,
)

# Two MAX_NOTE (12,000 code-point) notes can reach ~96 KB in raw UTF-8 or ~288 KB with \uXXXX escapes.
MAX_BODY = 300000
MAX_NOTE = 12000
ALLOWED_ORIGINS = {'http://localhost:3000', 'http://127.0.0.1:3000'}
DEFAULT_MODEL_ID = 'mlx-community/Qwen3.5-4B-4bit'
DEFAULT_MODEL_REVISION = '0e7ffd5c629ef7719d4cbc04069232580bfa9d9c'
DEFAULT_HOST = '127.0.0.1'
DEFAULT_PORT = 8765
MODEL_ID = DEFAULT_MODEL_ID
MODEL_REVISION = DEFAULT_MODEL_REVISION
DISCLAIMER = 'Synthetic prototype only; differences are not confirmed errors or medical advice.'
SYSTEM = ('Extract medication names explicitly written in this fictional note. '
          'Return only JSON with a medications array of strings. Do not infer or recommend medications.')
replay_extract = ReplayExtractor()
_UNSET = object()


def get_model_id(environ=None):
    env = os.environ if environ is None else environ
    return env.get('MLX_MODEL_ID', '').strip() or MODEL_ID


def get_model_revision(environ=None):
    env = os.environ if environ is None else environ
    if 'MLX_MODEL_REVISION' in env:
        return env['MLX_MODEL_REVISION'].strip() or None
    if get_model_id(env) == DEFAULT_MODEL_ID:
        return MODEL_REVISION
    return None


def get_adapter_path(environ=None):
    env = os.environ if environ is None else environ
    return env.get('MLX_ADAPTER_PATH', '').strip() or None


def get_bind_host(environ=None):
    env = os.environ if environ is None else environ
    return env.get('CLINICAL_DIFF_HOST', '').strip() or DEFAULT_HOST


def get_bind_port(environ=None):
    env = os.environ if environ is None else environ
    raw = env.get('CLINICAL_DIFF_PORT', '').strip()
    if not raw:
        return DEFAULT_PORT
    port = int(raw)
    if port < 1 or port > 65535:
        raise ValueError(f'Invalid CLINICAL_DIFF_PORT: {raw}')
    return port


def get_allowed_origins(environ=None, base=None):
    env = os.environ if environ is None else environ
    origins = set(ALLOWED_ORIGINS if base is None else base)
    extra = env.get('CLINICAL_DIFF_ALLOWED_ORIGINS', '')
    for item in extra.split(','):
        cleaned = item.strip().rstrip('/')
        if cleaned:
            origins.add(cleaned)
    return origins

_HYPHEN_CHARS = {'-', '_', '\u2010', '\u2011'}
_TRAILING_PUNCT = '.,;:'
_CONCAT_DOSE_RE = re.compile(
    r'\d+(?:\.\d+)?(?:mg|mcg|ug|g|ml|iu|meq|mmol|units?|u)(?![a-zA-Z0-9_-])',
    re.IGNORECASE,
)


def _is_invisible_or_space(ch):
    return ch.isspace() or unicodedata.category(ch) == 'Cf'


def _has_visible_text(text):
    return any(not _is_invisible_or_space(ch) for ch in text)


def _strip_invisible(text):
    start = 0
    end = len(text)
    while start < end and _is_invisible_or_space(text[start]):
        start += 1
    while end > start and _is_invisible_or_space(text[end - 1]):
        end -= 1
    return text[start:end]


def _fold_char(ch):
    # Match Python simple Unicode case-folding for I/i/İ/ı without expanding ß->ss or ﬁ->fi.
    if ch in ('\u0130', '\u0131'):
        return 'i'
    return ch.lower()


def _is_hangul_jamo(ch):
    cp = ord(ch)
    return (0x1100 <= cp <= 0x11FF) or (0xA960 <= cp <= 0xA97F) or (0xD7B0 <= cp <= 0xD7FF)


def _build_folded_index(text):
    """Normalize text to NFC, collapse whitespace runs, and map each folded char back to source offsets."""
    folded_chars = []
    start_map = []
    end_map = []
    i = 0
    n = len(text)
    while i < n:
        if text[i].isspace():
            j = i + 1
            while j < n and text[j].isspace():
                j += 1
            folded_chars.append(' ')
            start_map.append(i)
            end_map.append(j)
            i = j
        else:
            j = i + 1
            while j < n and (unicodedata.combining(text[j]) != 0 or _is_hangul_jamo(text[j])):
                j += 1
            seg = unicodedata.normalize('NFC', text[i:j])
            for ch in seg:
                folded_chars.append(_fold_char(ch))
                start_map.append(i)
                end_map.append(j)
            i = j
    return ''.join(folded_chars), start_map, end_map


def _fold_key(text):
    nfc = unicodedata.normalize('NFC', _strip_invisible(text))
    collapsed = re.sub(r'\s+', ' ', nfc)
    return ''.join(_fold_char(ch) for ch in collapsed)


def _normalize_source_id(source_id):
    return unicodedata.normalize('NFC', _strip_invisible(source_id))


def _is_valid_boundary(folded_text, ms, me):
    if ms > 0:
        prev_ch = folded_text[ms - 1]
        if prev_ch.isalnum() or prev_ch in _HYPHEN_CHARS or unicodedata.category(prev_ch).startswith('M'):
            return False
    if me < len(folded_text):
        next_ch = folded_text[me]
        if next_ch in _HYPHEN_CHARS or unicodedata.category(next_ch).startswith('M'):
            return False
        if next_ch.isalnum():
            if not (folded_text[me - 1].isalpha() and _CONCAT_DOSE_RE.match(folded_text, me)):
                return False
    return True


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
        if not isinstance(source_id, str) or not _has_visible_text(source_id) or len(source_id) > 100:
            raise ValueError(f'{side}.source_id must be a non-empty string (max 100).')
        if not isinstance(text, str) or not _has_visible_text(text) or len(text) > MAX_NOTE:
            raise ValueError(f'{side}.text must be a non-empty string (max {MAX_NOTE}).')
        sources.append({'source_id': source_id, 'text': text})
    if _normalize_source_id(sources[0]['source_id']) == _normalize_source_id(sources[1]['source_id']):
        raise ValueError('Source IDs must be distinct.')
    return sources

def validate_model_output(raw, source):
    try:
        value = json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError, RecursionError) as exc:
        raise ExtractionError('Model output was not valid JSON; review the source manually.') from exc
    if isinstance(value, dict):
        names = value.get('medications')
    else:
        names = value
    if not isinstance(names, list) or len(names) > 2000:
        raise ExtractionError('Model output did not contain a medications array; review manually.')
    unique_queries = []
    seen_queries = set()
    for raw_name in names:
        if not isinstance(raw_name, str):
            raise ExtractionError('Model returned invalid medication entries; review manually.')
        trimmed = _strip_invisible(raw_name)
        if not trimmed or len(trimmed) > 150:
            raise ExtractionError('Model returned invalid medication entries; review manually.')
        cleaned = trimmed.rstrip(_TRAILING_PUNCT)
        if not cleaned or not any(ch.isalnum() for ch in cleaned):
            key = _fold_key(trimmed)
            if key not in seen_queries:
                seen_queries.add(key)
                unique_queries.append((trimmed, None))
            continue
        key = _fold_key(cleaned)
        if key not in seen_queries:
            seen_queries.add(key)
            unique_queries.append((trimmed, key))
    if len(unique_queries) > 1000:
        raise ExtractionError('Model returned invalid medication entries; review manually.')
    folded_text, start_map, end_map = _build_folded_index(source['text'])
    accepted, unsupported, seen_spans = [], [], set()
    for display_name, query_key in unique_queries:
        if query_key is None:
            unsupported.append(display_name)
            continue
        matched_any = False
        for m in re.finditer(re.escape(query_key), folded_text):
            ms, me = m.start(), m.end()
            if not _is_valid_boundary(folded_text, ms, me):
                continue
            orig_start = start_map[ms]
            orig_end = end_map[me - 1]
            matched_any = True
            if (orig_start, orig_end) not in seen_spans:
                seen_spans.add((orig_start, orig_end))
                accepted.append({
                    'name': source['text'][orig_start:orig_end],
                    'source_id': source['source_id'],
                    'start': orig_start,
                    'end': orig_end,
                })
        if not matched_any:
            unsupported.append(display_name)
    if len(unsupported) > 100:
        raise ExtractionError('Model returned invalid medication entries; review manually.')
    accepted.sort(key=lambda item: (item['start'], item['end']))
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
    old_map = {}
    for item in old:
        old_map.setdefault(_fold_key(item['name']), item)
    new_map = {}
    for item in new:
        new_map.setdefault(_fold_key(item['name']), item)
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
                            'Offsets are Python Unicode code-point indices, end exclusive.',
                            'A difference is not a confirmed error, omission, or treatment change; review both sources.'],
            'earlier': {'source_id': earlier['source_id'], 'mentions': old, 'unsupported_outputs': old_unsupported},
            'later': {'source_id': later['source_id'], 'mentions': new, 'unsupported_outputs': new_unsupported},
            'differences': changes}

def run_compare(payload):
    """Default path is local MLX; replay only when CLINICAL_DIFF_REPLAY is explicitly enabled."""
    if replay_enabled():
        validate_replay_payload(payload)
        return label_replay_response(compare(payload, replay_extract))
    return {**compare(payload, extract), 'mode': 'local_mlx',
            'simulated': False, 'live_ai': True}

class LocalModel:
    def __init__(self, model_id=_UNSET, model_revision=_UNSET, adapter_path=_UNSET):
        self.model = self.tokenizer = None
        self.lock = threading.Lock()
        self._model_id = model_id
        self._model_revision = model_revision
        self._adapter_path = adapter_path
        self.loaded_model_id = None
        self.loaded_adapter_path = None

    def resolve_config(self, environ=None):
        model_id = (
            get_model_id(environ)
            if self._model_id is _UNSET
            else ((self._model_id or '').strip() or DEFAULT_MODEL_ID)
        )
        if self._model_revision is _UNSET:
            if self._model_id is not _UNSET and model_id != DEFAULT_MODEL_ID:
                env = os.environ if environ is None else environ
                revision = env.get('MLX_MODEL_REVISION', '').strip() or None
            else:
                revision = get_model_revision(environ)
        else:
            revision = (self._model_revision or '').strip() or None
        if self._adapter_path is _UNSET:
            adapter_path = get_adapter_path(environ)
        else:
            adapter_path = (self._adapter_path or '').strip() or None
        return model_id, revision, adapter_path

    def __call__(self, text):
        from mlx_lm import load, generate
        from mlx_lm.sample_utils import make_sampler
        from huggingface_hub import snapshot_download
        with self.lock:
            model_id, revision, adapter_path = self.resolve_config()
            needs_load = (
                self.model is None
                or (self.loaded_model_id is not None and self.loaded_model_id != model_id)
                or (self.loaded_model_id is not None and self.loaded_adapter_path != adapter_path)
            )
            if needs_load:
                if os.path.isdir(model_id):
                    path = model_id
                elif revision:
                    path = snapshot_download(model_id, revision=revision)
                else:
                    path = snapshot_download(model_id)
                if adapter_path:
                    self.model, self.tokenizer = load(path, adapter_path=adapter_path)
                else:
                    self.model, self.tokenizer = load(path)
                self.loaded_model_id = model_id
                self.loaded_adapter_path = adapter_path
            messages = [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': text}]
            prompt = self.tokenizer.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True, enable_thinking=False
            )
            return generate(
                self.model, self.tokenizer, prompt=prompt, max_tokens=2048,
                sampler=make_sampler(temp=0), verbose=False,
            )

extract = LocalModel()

class Handler(BaseHTTPRequestHandler):
    allowed_origins = ALLOWED_ORIGINS
    def log_message(self, *args):
        pass  # Never log request bodies or note text.
    def _request_path(self):
        return urlparse(self.path).path
    def _allowed_origins(self):
        return get_allowed_origins(base=self.allowed_origins)
    def _drain_body(self):
        headers = getattr(self, 'headers', None)
        if not headers:
            return
        cl_values = headers.get_all('Content-Length')
        if not cl_values or len(cl_values) != 1:
            return
        cl_raw = cl_values[0].strip()
        if not cl_raw.isascii() or not cl_raw.isdigit():
            return
        length = int(cl_raw)
        if 0 < length <= MAX_BODY:
            prev_timeout = None
            try:
                prev_timeout = self.connection.gettimeout()
                self.connection.settimeout(0.2)
                self.rfile.read(length)
            except (OSError, TimeoutError):
                pass
            finally:
                try:
                    self.connection.settimeout(prev_timeout)
                except OSError:
                    pass
    def send_error(self, code, message=None, explain=None):
        if code >= 400:
            self.close_connection = True
        self.send_json(code, {'error': message or 'Request error.'})
    def send_json(self, status, payload, extra_headers=None, send_body=True):
        if replay_enabled() and isinstance(payload, dict):
            payload = label_replay_response(payload)
        raw = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        if extra_headers:
            for key, value in extra_headers.items():
                self.send_header(key, value)
        headers = getattr(self, 'headers', None)
        origin = headers.get('Origin') if headers else None
        if origin in self._allowed_origins():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        if send_body and getattr(self, 'command', None) != 'HEAD':
            self.wfile.write(raw)
    def _method_not_allowed(self):
        self._drain_body()
        self.send_json(
            405,
            {'error': 'Method not allowed.'},
            extra_headers={'Allow': 'GET, POST, OPTIONS'},
            send_body=self.command != 'HEAD',
        )
    def do_PUT(self):
        self._method_not_allowed()
    def do_DELETE(self):
        self._method_not_allowed()
    def do_PATCH(self):
        self._method_not_allowed()
    def do_HEAD(self):
        self._method_not_allowed()
    def do_TRACE(self):
        self._method_not_allowed()
    def do_CONNECT(self):
        self._method_not_allowed()
    def do_OPTIONS(self):
        origin = self.headers.get('Origin')
        if origin not in self._allowed_origins():
            return self.send_json(403, {'error': 'Origin not allowed.'})
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Vary', 'Origin')
        self.end_headers()
    def _health_payload(self):
        model_id = get_model_id()
        adapter_path = get_adapter_path()
        if replay_enabled():
            payload = {
                'status': 'ready',
                'socket_open': True,
                'model': model_id,
                'model_loaded': False,
                'mode': 'deterministic_replay',
                'simulated': True,
                'live_ai': False,
                'fixture': FIXTURE_PAYLOAD,
                'disclaimer': DISCLAIMER,
            }
            if adapter_path:
                payload['adapter_path'] = adapter_path
            return payload
        payload = {
            'status': 'ready',
            'socket_open': True,
            'model': model_id,
            'model_loaded': extract.model is not None,
            'mode': 'local_mlx',
            'simulated': False,
            'live_ai': True,
            'disclaimer': DISCLAIMER,
        }
        if adapter_path:
            payload['adapter_path'] = adapter_path
        return payload
    def do_GET(self):
        if self._request_path() not in ('/health', '/ready'):
            return self.send_json(404, {'error':'Not found.'})
        self.send_json(200, self._health_payload())
    def do_POST(self):
        if self._request_path() != '/compare':
            self._drain_body()
            return self.send_json(404, {'error':'Not found.'})
        origin = self.headers.get('Origin')
        if origin is not None and origin not in self._allowed_origins():
            self._drain_body()
            return self.send_json(403, {'error':'Origin not allowed.'})
        try:
            if self.headers.get_all('Transfer-Encoding'):
                self.close_connection = True
                raise ValueError('Transfer-Encoding is not supported.')
            cl_values = self.headers.get_all('Content-Length')
            if not cl_values or len(cl_values) != 1:
                self.close_connection = True
                raise ValueError('Invalid Content-Length header.')
            cl_raw = cl_values[0].strip()
            if not cl_raw.isascii() or not cl_raw.isdigit():
                self.close_connection = True
                raise ValueError('Invalid Content-Length header.')
            length = int(cl_raw)
            if length <= 0 or length > MAX_BODY:
                self.close_connection = True
                raise ValueError('Invalid request size.')
            if self.headers.get_content_type() != 'application/json':
                self._drain_body()
                raise ValueError('Use application/json.')
            raw = self.rfile.read(length)
            if len(raw) != length:
                self.close_connection = True
                raise ValueError('Incomplete request body.')
            payload = json.loads(raw)
            self.send_json(200, run_compare(payload))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
            self.send_json(400, {'error':str(exc)})
        except ExtractionError as exc:
            self.send_json(502, {'error':str(exc), 'review_required':True})
        except InferenceError as exc:
            self.send_json(503, {'error':str(exc), 'review_required':True})
        except Exception:
            self.send_json(503, {'error':'Local model unavailable; review the source records manually.', 'review_required':True})

if __name__ == '__main__':
    host = get_bind_host()
    port = get_bind_port()
    mode = 'deterministic_replay' if replay_enabled() else 'local_mlx'
    model_id = get_model_id()
    print(f'Synthetic-only service listening on {host}:{port} mode={mode} model={model_id}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
