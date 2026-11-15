ARG WHISPER_IMAGE
FROM ${WHISPER_IMAGE} AS whisper

FROM debian:bookworm-slim AS qwen-build
ARG BUILD_JOBS=2
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git cmake build-essential curl && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/ggml-org/llama.cpp.git /src && cd /src && git checkout a68799c6094020a020cee72895b8df36b3b81098 && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON -DLLAMA_CURL=OFF && cmake --build build --target llama-server -j"${BUILD_JOBS}"
RUN mkdir -p /models && curl -fL --retry 3 -o /models/model.gguf https://huggingface.co/ggml-org/Qwen3.5-4B-GGUF/resolve/8d43d974efc48399cb58957ad49c8b26bf5a109c/Qwen3.5-4B-Q4_K_M.gguf && echo '217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14  /models/model.gguf' | sha256sum -c -

FROM python:3.12-slim-bookworm
COPY --from=qwen-build /src/build/bin/ /opt/llama/
COPY --from=qwen-build /models/model.gguf /models/model.gguf
ENV LD_LIBRARY_PATH=/opt/llama PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=whisper /opt/whisper/whisper-cli /opt/whisper/whisper-cli
COPY --from=whisper /models/whisper-base.en.bin /models/whisper-base.en.bin
WORKDIR /app
COPY deploy/encounter-note-taker/service.py deploy/encounter-note-taker/fixture.json /app/
COPY public/encounter/medication-follow-up.wav /app/medication-follow-up.wav
USER 65532:65532
CMD ["python", "service.py"]
