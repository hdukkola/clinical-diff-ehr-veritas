# Hosted assistant status

The assistant panel is a placeholder. `/api/assistant` accepts only an `earlier` or `later` synthetic demo selection and currently returns 503; it does not send input to a model or return model output. There is no configured remote inference host, website deployment, or provider credential. Edited notes are not sent.

The recorded candidate is `mlx-community/Qwen3.6-35B-A3B-4bit`, revision `38740b847e4cb78f352aba30aa41c76e08e6eb46`, with the step-360 adapter recorded as SHA-256 `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`. These identifiers are from the research ledger, not a remote health check. The adapter is trained for synthetic medication-name extraction, not general clinical chat.

A future integration needs a compatible remote HTTPS runtime, verified base and adapter identity, an authenticated server-side connection, a bounded extraction protocol and source validation, quota enforcement, and synthetic-only inputs. The saved MLX adapter and base weights need demonstrated compatibility with any proposed non-Apple runtime; do not silently substitute a different model. Verify the agreed evaluation gate before enabling it. Do not log prompts or commit secrets.

Firebase App Hosting requires the pay-as-you-go Blaze plan. Vercel Hobby functions provide 2 GB of memory. Hugging Face's free ZeroGPU has quota and account eligibility requirements; compatibility and availability for this exact MLX adapter remain unverified. No paid plan or billing was enabled. Check current provider terms before deployment.
