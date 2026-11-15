FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git cmake build-essential
RUN git init /src && git -C /src fetch --depth 1 https://github.com/ggml-org/whisper.cpp.git 4979e04f5dcaccb36057e059bbaed8a2f5288315 && git -C /src checkout --detach FETCH_HEAD
RUN cd /src && cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=ON && cmake --build build --target whisper-cli -j2
RUN curl -fL --retry 3 -o /tmp/whisper-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.en.bin && echo 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002  /tmp/whisper-base.en.bin' | sha256sum -c -
FROM scratch
COPY --from=build /src/build/bin/whisper-cli /opt/whisper/whisper-cli
COPY --from=build /tmp/whisper-base.en.bin /models/whisper-base.en.bin
