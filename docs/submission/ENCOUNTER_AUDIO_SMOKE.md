# Encounter audio note-taker

In DiffMD, open **Home → Read encounter → Audio note-taker → Process recording**. Whisper produces timestamped text from a bundled fictional recording. Qwen3.5-4B selects excerpts for an editable draft. A reviewer can play the source audio at each timestamp and confirm it before copying. Editing the draft clears that confirmation. The workflow offers no chart writes, open chat, audio uploads, or microphone access.

## Source data and models

- The 14.66-second [recording](../../deploy/encounter-note-taker/medication-follow-up.wav) uses project-authored lines, two synthetic [eSpeak NG](https://github.com/espeak-ng/espeak-ng) voices and [FFmpeg](https://ffmpeg.org/) to combine and resample the audio. The UI includes the original script as an accessible reference. The recording contains no patient data or human voice.
- [Whisper Base.en](https://github.com/openai/whisper) runs through [whisper.cpp](https://github.com/ggml-org/whisper.cpp/tree/4979e04f5dcaccb36057e059bbaed8a2f5288315) using the [pinned GGML conversion](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1). Whisper receives two vocabulary hints, Lisinopril and aspirin. Those hints include no dose, timing, or medication status. The raw recognized words are kept in the transcript.
- [Qwen3.5-4B GGUF Q4_K_M](https://huggingface.co/ggml-org/Qwen3.5-4B-GGUF/tree/8d43d974efc48399cb58957ad49c8b26bf5a109c) runs in [llama.cpp](https://github.com/ggml-org/llama.cpp/tree/a68799c6094020a020cee72895b8df36b3b81098). The pretrained artifact has no project adapter. The service accepts only fixture IDs and fingerprints. Its output is selected timestamped transcript text.

## Checks and limits

The worker validates the exact audio and model artifacts when it starts. The web server checks the private worker’s identity before requesting a draft. The worker withholds a draft if the known sample’s medication, dose, uncertainty about aspirin, or follow-up is missing from the transcription or the model’s selected text. This check depends on the known script and measures coverage for this sample only.

The initial local Whisper Base.en run misheard “lisinopril” as “this in April.” The draft was withheld. A second local run with the two disclosed vocabulary hints preserved the required facts. The Qwen GGUF runtime selected four excerpts containing the question, dose, uncertainty, and planned follow-up. That is one scenario with two settings. It establishes no clinical accuracy or general conversation quality.

## Cloud Run smoke test · November 15, 2026

- The initial two-vCPU revision timed out on the bundled recording after 43.2 seconds. The four-vCPU revision `diffmd-encounter-00002-hhj` loaded the expected model and returned a fresh result in 21.2 seconds. Whisper took 5.2 seconds. Direct health rejected an unauthenticated request with HTTP 403.
- The second attempt transcribed five segments and Qwen selected `a01`–`a04`. The selected speech preserved “Lisinopril, 20 milligrams daily,” that the note did not say whether aspirin was stopped, and “I will check the original instructions.” The transcription and draft checks both returned empty failure lists.
- The hosted comparison release repeated the fresh audio check on `diffmd-encounter-00003-qas`. It returned the same four turn IDs in 26.9 seconds with no transcription or draft coverage flags. The total is one unique scripted recording, two successful fresh results and one timeout across three service revisions. Cached repetitions test the workflow and review controls. The 50,000 comparison cases in the engineering suite are a separate rules-engine workload. [Hosted comparison test](HOSTED_COMPARE_SMOKE.md)
- Qwen artifact SHA-256 `217002fa8008ef4fc6d548353a3aebef055a96e6ff8e0e2c0953ef8254a89c14`. Whisper artifact SHA-256 `a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002`. The worker has a single CPU instance at most, uses request-based billing, and can scale to zero.
