"""Private CPU endpoint for synthetic or approved public medical dictation tests."""

import io
import json
import os
import subprocess
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MODEL = "handy-computer/medasr-gguf"
REVISION = "f17cb2ed8e1fe7943a3108b2fa43b289893b4427"
TERMS_REVISION = "2024-11-15"
TERMS_URL = "https://developers.google.com/health-ai-developer-foundations/terms"
RATE_HZ = 16000
MAX_SECONDS = 30
MAX_BYTES = RATE_HZ * MAX_SECONDS * 2 + 4096
RUNTIME_REVISION = "adfc50210a3f026a655a3e19937d90ef2bf0728c"
RUNTIME = "/opt/transcribe/transcribe-cli"
WEIGHTS = "/model/weights.gguf"
THREADS = os.environ.get("INFERENCE_THREADS", "2")


def valid_wav(payload):
    try:
        with wave.open(io.BytesIO(payload)) as recording:
            frames = recording.getnframes()
            return (
                recording.getcomptype() == "NONE"
                and recording.getnchannels() == 1
                and recording.getsampwidth() == 2
                and recording.getframerate() == RATE_HZ
                and 0 < frames <= RATE_HZ * MAX_SECONDS
                and len(recording.readframes(frames)) == frames * 2
            )
    except (EOFError, wave.Error):
        return False


def transcribe(payload):
    with tempfile.TemporaryDirectory() as directory:
        audio = Path(directory) / "dictation.wav"
        manifest = Path(directory) / "batch.list"
        audio.write_bytes(payload)
        manifest.write_text(f"{audio}\n")
        result = subprocess.run(
            [RUNTIME, "--backend", "cpu", "--threads", THREADS, "--language", "en",
             "--batch", str(manifest), "--batch-jsonl", "--model", WEIGHTS],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, check=True, timeout=20,
        )
        records = [json.loads(line) for line in result.stdout.splitlines() if line.strip()]
        transcript, = [item["text"] for item in records if isinstance(item.get("text"), str)]
        return transcript.strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # The platform records request metadata. Keep audio and recognized text out of logs.
        pass

    def send_bytes(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Link", f'<{TERMS_URL}>; rel="terms-of-service"')
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, status, body):
        self.send_bytes(status, json.dumps(body).encode(), "application/json")

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"model": MODEL, "revision": REVISION, "runtime": "transcribe.cpp CPU", "runtimeRevision": RUNTIME_REVISION})
        elif self.path == "/terms":
            self.send_bytes(200, Path("/model/LICENSE").read_bytes(), "text/plain; charset=utf-8")
        else:
            self.send_json(404, {"error": "unknown_route"})

    def do_POST(self):
        if self.path != "/transcribe":
            self.send_json(404, {"error": "unknown_route"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = -1
        if not 0 <= size <= MAX_BYTES:
            self.send_json(413, {"error": "invalid_audio_size"})
            return
        payload = self.rfile.read(size)
        if self.headers.get("X-DiffMD-MedASR-Terms") != TERMS_REVISION:
            self.send_json(428, {"error": "accept_terms", "terms": "/terms", "termsRevision": TERMS_REVISION})
            return
        if self.headers.get_content_type() != "audio/wav":
            self.send_json(415, {"error": "expected_audio_wav"})
            return
        if len(payload) != size or not valid_wav(payload):
            self.send_json(400, {"error": "expected_16khz_mono_pcm16_wav_max_30_seconds"})
            return
        try:
            transcript = transcribe(payload)
        except (OSError, subprocess.SubprocessError, ValueError):
            self.send_json(503, {"error": "transcription_unavailable"})
            return
        self.send_json(200, {"transcript": transcript, "model": MODEL, "revision": REVISION, "reviewRequired": True})


if __name__ == "__main__":
    with HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler) as server:
        server.serve_forever()
