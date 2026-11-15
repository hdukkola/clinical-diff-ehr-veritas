# Private MedASR dictation test

The `diffmd-medasr` Cloud Run service accepts individual English dictation clips for review. Use only synthetic or approved public recordings. Every transcript requires human review. The encounter recorder uses its own speech model for conversation.

This service runs [Google MedASR](https://developers.google.com/health-ai-developer-foundations/medasr/model-card) using the [handy-computer Q8_0 GGUF conversion](https://huggingface.co/handy-computer/medasr-gguf/tree/f17cb2ed8e1fe7943a3108b2fa43b289893b4427) at `f17cb2ed8e1fe7943a3108b2fa43b289893b4427`. The Dockerfile checks the weights SHA-256 and pins `transcribe.cpp` to `adfc50210a3f026a655a3e19937d90ef2bf0728c`. Cloud Run uses two CPUs, 768 MiB of memory and a maximum of one instance, with scale-to-zero.

## Test inference

Run the proxy using a Google account with Cloud Run Invoker access. Read [Google's Health AI Developer Foundations terms](https://developers.google.com/health-ai-developer-foundations/terms) before sending the acknowledgment header.

```sh
gcloud run services proxy diffmd-medasr --port=3107 \
  --project=clinical-diff-veritas-2026 --region=us-central1
```

In another terminal, use a mono, 16 kHz, 16-bit PCM WAV up to 30 seconds. If needed, convert a test recording with `ffmpeg -i recording.wav -ac 1 -ar 16000 -c:a pcm_s16le dictation.wav`.

```sh
curl --fail-with-body http://127.0.0.1:3107/health
curl --fail-with-body http://127.0.0.1:3107/terms
curl --fail-with-body http://127.0.0.1:3107/transcribe \
  -H 'Content-Type: audio/wav' \
  -H 'X-DiffMD-MedASR-Terms: 2024-11-15' \
  --data-binary @dictation.wav
```

The response includes `transcript`, the model and weights revision, and `reviewRequired: true`. For reproduction, read this synthetic test sentence aloud: “Discharge note lists lisinopril 20 milligrams daily. It does not say whether aspirin was stopped. I will check the original instructions.” Check the medication names, dose, frequency and uncertainty independently. A successful HTTP response only confirms that inference ran. The bundled two-speaker sample at `public/encounter/medication-follow-up.wav` exposed an aspirin transcription error and a change from whether to when.

## Rebuild from source

```sh
medasr_repo=us-central1-docker.pkg.dev/clinical-diff-veritas-2026/cloud-run-source-deploy/diffmd-medasr
medasr_tag="$(git rev-parse --short HEAD)"
gcloud builds submit deploy/medasr --tag="$medasr_repo:$medasr_tag" \
  --project=clinical-diff-veritas-2026 --region=us-central1 --machine-type=e2-highcpu-8
```

Set `medasr_digest` to the `sha256:…` value returned by Cloud Build.

```sh
gcloud run deploy diffmd-medasr --image="$medasr_repo@$medasr_digest" \
  --project=clinical-diff-veritas-2026 --region=us-central1 \
  --no-allow-unauthenticated --min-instances=0 --max-instances=1 \
  --concurrency=1 --cpu=2 --memory=768Mi --timeout=30s \
  --service-account=diffmd-inference@clinical-diff-veritas-2026.iam.gserviceaccount.com
```
