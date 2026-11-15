"""Private, bounded transcription for reviewed workspace notes."""
import io
import json
import os
import subprocess
import tempfile
import wave
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

MODEL = {
    "model": "Whisper base.en",
    "weightsSha256": "a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002",
}
MAX_BYTES = 960_044


def inspect_wav(data):
    with wave.open(io.BytesIO(data), "rb") as audio:
        frames = audio.getnframes()
        if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate()) != (1, 2, 16000):
            raise ValueError("unsupported WAV format")
        if not 0 < frames <= 480_000:
            raise ValueError("invalid WAV length")
        samples = audio.readframes(frames)
        if len(samples) != frames * 2:
            raise ValueError("invalid WAV length")
        # A constant PCM signal cannot contain speech, including digital silence with a DC offset.
        return frames * 1000 // 16000, samples.count(samples[:2]) == frames


def transcribe(data, duration):
    with tempfile.TemporaryDirectory() as directory:
        audio = Path(directory) / "input.wav"
        audio.write_bytes(data)
        output = Path(directory) / "transcript"
        subprocess.run(
            ["/opt/whisper/whisper-cli", "-m", "/models/whisper-base.en.bin",
             "-f", str(audio), "-l", "en", "-ng", "-t", "2", "-ml", "105",
             "-sow", "-oj", "-of", str(output)],
            check=True, timeout=24, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        segments = json.loads(output.with_suffix(".json").read_text())["transcription"]

    result = []
    for segment in segments:
        text = " ".join(segment["text"].split())
        if not text:
            continue
        start = segment["offsets"]["from"]
        end = min(segment["offsets"]["to"], duration)
        if (len(result) >= 64 or len(text) > 500 or type(start) is not int or type(end) is not int
                or not 0 <= start < end or (result and start < result[-1]["startMs"])):
            raise ValueError("invalid transcription segment")
        result.append({"startMs": start, "endMs": end, "text": text})
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(4)

    def reply(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "not_found"})
        self.reply(200, MODEL)

    def do_POST(self):
        if self.path != "/transcribe":
            return self.reply(404, {"error": "not_found"})
        if self.headers.get("Content-Type") != "audio/wav":
            return self.reply(415, {"error": "invalid_format"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.reply(400, {"error": "invalid_audio"})
        if size > MAX_BYTES:
            return self.reply(413, {"error": "recording_too_large"})
        if size <= 44:
            return self.reply(400, {"error": "invalid_audio"})

        try:
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError("incomplete audio")
            duration, constant_signal = inspect_wav(data)
        except (ValueError, wave.Error, EOFError, TimeoutError):
            return self.reply(400, {"error": "invalid_audio"})
        if constant_signal:
            return self.reply(422, {"error": "no_speech"})

        try:
            segments = transcribe(data, duration)
        except subprocess.TimeoutExpired:
            return self.reply(504, {"error": "transcription_timeout"})
        except (OSError, subprocess.CalledProcessError, ValueError, KeyError, TypeError):
            return self.reply(502, {"error": "transcription_failed"})
        if not segments:
            return self.reply(422, {"error": "no_speech"})
        self.reply(200, {**MODEL, "segments": segments, "reviewRequired": True})


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
