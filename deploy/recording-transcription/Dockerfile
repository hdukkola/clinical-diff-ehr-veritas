FROM us-central1-docker.pkg.dev/clinical-diff-veritas-2026/cloud-run-source-deploy/diffmd-whisper@sha256:a7870e3eed9372d9604197c78bf2035c0b39b5ac95a8b64538f864b6e9c9be4e AS whisper
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /opt/whisper/whisper-cli /opt/whisper/whisper-cli
COPY --from=whisper /models/whisper-base.en.bin /models/whisper-base.en.bin
WORKDIR /app
COPY service.py .
USER 65532:65532
CMD ["python", "service.py"]
