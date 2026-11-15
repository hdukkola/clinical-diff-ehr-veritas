FROM python:3.12-slim-trixie AS build
ARG TRANSCRIBE_COMMIT=adfc50210a3f026a655a3e19937d90ef2bf0728c
ARG MEDASR_URL=https://huggingface.co/handy-computer/medasr-gguf/resolve/f17cb2ed8e1fe7943a3108b2fa43b289893b4427
RUN apt-get update && apt-get install -y --no-install-recommends build-essential ca-certificates cmake curl git \
  && git init /src \
  && git -C /src fetch --depth=1 https://github.com/handy-computer/transcribe.cpp.git "$TRANSCRIBE_COMMIT" \
  && git -C /src checkout --detach FETCH_HEAD \
  && cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release -DTRANSCRIBE_BUILD_TESTS=OFF \
      -DTRANSCRIBE_USE_SYSTEM_BLAS=OFF -DGGML_NATIVE=OFF \
  && cmake --build /src/build --target transcribe-cli --parallel 4
RUN mkdir /model \
  && curl -fLsS --retry 3 "$MEDASR_URL/medasr-Q8_0.gguf" -o /model/weights.gguf \
  && echo "5a391a2154416b96241b829ac2c7eed8b64d197f00372512c9bbf63f4849c978  /model/weights.gguf" | sha256sum -c - \
  && curl -fLsS --retry 3 "$MEDASR_URL/LICENSE" -o /model/LICENSE \
  && curl -fLsS --retry 3 "$MEDASR_URL/NOTICE" -o /model/NOTICE

FROM python:3.12-slim-trixie
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/transcribe-cli /opt/transcribe/transcribe-cli
COPY --from=build /src/LICENSE /opt/transcribe/LICENSE
COPY --from=build /model /model
COPY service.py /app/service.py
USER 65532:65532
CMD ["python", "/app/service.py"]
