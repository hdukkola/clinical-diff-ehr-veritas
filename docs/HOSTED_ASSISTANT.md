# Hosted assistant status

[DiffMD on Firebase](https://diffmd.web.app/) uses browser rules for medication comparisons and a private Whisper worker for invited users' recordings. The provider health check describes the comparison engine. The Qwen test panel uses a separate authenticated route.

The private Qwen 4B Cloud Run service accepts 32 prepared synthetic medication cases. Open **AI chat** on [DiffMD](https://diffmd.web.app/), sign in with an invited Google account, then choose **Run test**. This panel requires no patient chart or API setup. It sends a case ID, verifies that the expected base, adapter and fixture file are loaded, and displays the scored result. The public comparison and recording workflows operate independently of this panel. [Service identity and validation](../src/app/api/model-evaluation/route.ts) · [Antigravity test instructions](../COMMUNICATION.md).

For a new synthetic case or a large run, use the [local MLX evaluation runner](../tests/model-eval/paired-4b/README.md) on the project's Apple Silicon setup. Enabling user-entered inference still requires the agreed independent evaluation, a bounded extraction protocol, source validation, and quota enforcement.

The Qwen 35B Cloud Run service and its dedicated deployment image were removed. The trained adapter and configuration are archived locally. [Historical 35B deployment record](https://github.com/hdukkola/clinical-diff-ehr-veritas/blob/98effd98ae7fbebfe0263649df1fc0e6c51e8fd8/docs/HOSTED_ASSISTANT.md).
