# Hosted assistant status

[DiffMD on Firebase](https://diffmd.web.app/) uses browser rules for public medication comparisons and a private Whisper worker for invited users' recordings. The live provider health check reports no configured Qwen connection.

The separate private Cloud Run service `diffmd-qwen-35b-trained` serves synthetic fixtures. An authenticated health check confirmed base `mlx-community/Qwen3.6-35B-A3B-4bit` at revision `38740b847e4cb78f352aba30aa41c76e08e6eb46`, step-360 adapter SHA-256 `9fb22bc348f0480698ab2b01825bb07c257cfb56e9af65c08afbfa01232eaa76`, and 50 verified live adapter tensors. The adapter was trained for medication-name extraction. `POST /v1/fixture-inference` accepts only preloaded case IDs. [Antigravity test commands](../COMMUNICATION.md).

Enabling user-entered inference still requires the agreed evaluation results, an authenticated server-side connection, a bounded extraction protocol, source validation, and quota enforcement. The public site sends no data to this fixture service.
