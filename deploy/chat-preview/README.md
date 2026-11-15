# Private patient chat preview

The preview serves synthetic charts on Cloud Run in the DiffMD project. Google IAM controls access. Qwen classifies ambiguous questions so the app can ask a follow-up. Chart answers and review decisions stay in the app.

The model container is pinned by digest in [service.yaml](service.yaml). It contains `ggml-org/Qwen3.5-4B-GGUF` at revision `8d43d974efc48399cb58957ad49c8b26bf5a109c` with the Q4_K_M GGUF SHA-256 `217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14`. This preview loads the model directly through llama.cpp on CPU. The service uses request-based billing with a maximum of one instance and scales to zero.

From a clean checkout, stage the committed files and build the web image.

```sh
preview_dir="$(mktemp -d)"
preview_repo=us-central1-docker.pkg.dev/clinical-diff-veritas-2026/cloud-run-source-deploy/diffmd-chat-preview
preview_tag="$(git rev-parse --short HEAD)"
git archive HEAD | tar -xf - -C "$preview_dir"
cp "$preview_dir/deploy/chat-preview/Dockerfile" "$preview_dir/Dockerfile"
gcloud builds submit "$preview_dir" --tag="$preview_repo:$preview_tag" \
  --project=clinical-diff-veritas-2026 --region=us-central1
```

Use the resulting image repository and digest in place of `WEB_IMAGE` and apply the private service configuration.

```sh
sed "s|WEB_IMAGE|$preview_repo@$preview_digest|" deploy/chat-preview/service.yaml > "$preview_dir/service.yaml"
gcloud run services replace "$preview_dir/service.yaml" \
  --project=clinical-diff-veritas-2026 --region=us-central1
gcloud run services proxy diffmd-chat-preview --port=3105 \
  --project=clinical-diff-veritas-2026 --region=us-central1
```

Set `preview_digest` to the `sha256:…` value from Cloud Build before running the second block. Open [the local preview](http://127.0.0.1:3105), choose **AI chat**, and ask “Did something happen on which visit?” A successful call displays “Cloud Qwen assisted with this follow-up.” Public Firebase Hosting uses its own Cloud Run service and release.
