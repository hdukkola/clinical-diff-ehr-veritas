#!/usr/bin/env python3
"""Local-only experimental inference. Synthetic input only; not clinical advice."""
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.environ.get('MODEL_LAB_BASE', '')
ADAPTER = os.environ.get('MODEL_LAB_ADAPTER', '')
PORT = int(os.environ.get('MODEL_LAB_PORT', '8766'))
lock = threading.Lock()
model = tokenizer = None

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def respond(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != '/health':
            return self.respond(404, {'error': 'Not found'})
        self.respond(200, {'service': 'experimental-local-model', 'model_configured': bool(BASE and ADAPTER), 'model_loaded': model is not None, 'busy': lock.locked(), 'synthetic_only': True})

    def do_POST(self):
        global model, tokenizer
        if self.path != '/ask':
            return self.respond(404, {'error': 'Not found'})
        if self.headers.get('Origin') is not None:
            return self.respond(403, {'error': 'Browser origins are not accepted; use a local client.'})
        if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
            self.close_connection = True
            return self.respond(400, {'error': 'Expected JSON with Content-Length.'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32768:
                raise ValueError()
            data = json.loads(self.rfile.read(length))
            question = data.get('question')
            if data.get('synthetic_only') is not True or not isinstance(question, str) or not question.strip() or len(question) > 12000:
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            return self.respond(400, {'error': 'Provide synthetic_only=true and a nonempty question of at most 12000 characters.'})
        if not lock.acquire(blocking=False):
            return self.respond(429, {'error': 'Model busy; retry later.'})
        try:
            if not os.path.isdir(BASE) or not os.path.isdir(ADAPTER):
                return self.respond(503, {'error': 'Configure existing local MODEL_LAB_BASE and MODEL_LAB_ADAPTER directories.'})
            from mlx_lm import load, generate
            from mlx_lm.sample_utils import make_sampler
            if model is None:
                model, tokenizer = load(BASE, adapter_path=ADAPTER)
            prompt = tokenizer.apply_chat_template([{'role': 'system', 'content': 'You are an experimental research model. This is a fictional synthetic test, not clinical advice.'}, {'role': 'user', 'content': question}], tokenize=False, add_generation_prompt=True, enable_thinking=False)
            answer = generate(model, tokenizer, prompt=prompt, max_tokens=256, sampler=make_sampler(temp=0), verbose=False)
            self.respond(200, {'answer': answer, 'synthetic_only': True, 'experimental': True})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:
            try:
                self.respond(503, {'error': 'Local inference failed', 'detail': type(exc).__name__})
            except (BrokenPipeError, ConnectionResetError):
                pass
        finally:
            lock.release()

if __name__ == '__main__':
    print(f'Model lab listening on 127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
