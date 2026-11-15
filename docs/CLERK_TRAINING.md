# DiffMD Clerk training workspace

This checkout uses the separate **DiffMD Training** Clerk development instance and `diffmd-training-veritas-26` Firebase project. Use invented patient references and notes only. Limit security testing to this training setup and the local endpoints documented below.

1. Open the Clerk workspace invitation with your invited email to access [the training Clerk dashboard](https://dashboard.clerk.com/apps/app_3MA54jzWgQMRaRHqQcCPQlyrlgN/instances/ins_3MA54pOKfZxHbkmXq7hIWt2uWeP). Accept the separate app invitation to create your test sign-in. In the app dashboard, open **Users** and find the Clerk user ID for the signed-up account.
2. In [training Firestore](https://console.firebase.google.com/project/diffmd-training-veritas-26/firestore/databases/-default-/data), create `workspaceClerkAccounts/{Clerk user ID}` with `enabled` set to the boolean `true`. The user ID comes from the Clerk dashboard after the email is verified. Set `enabled` to `false` to revoke case access. An IAM role grants Firebase console access and does not enroll an app user.
3. Check out `work/clerk-widget-acceptance` in a separate folder and run `npm ci`. Install the Google Cloud CLI and use your invited Firebase account with `gcloud auth application-default login`. Get the development keys from the training Clerk dashboard into the ignored `.env.local` via the command below. Keep the keys out of chat and Git.

   ```sh
   umask 077
   npx --yes clerk@latest auth login
   npx --yes clerk@latest env pull --app app_3MA54jzWgQMRaRHqQcCPQlyrlgN --instance dev --file .env.local
   ```

4. Add these settings to `.env.local` and run `npm run dev -- --hostname localhost --port 3189`.

   ```dotenv
   NEXT_PUBLIC_DIFFMD_CLERK_TRAINING=1
   DIFFMD_CLERK_TRAINING_ORIGIN=http://localhost:3189
   DIFFMD_CLERK_TRAINING_PROJECT=diffmd-training-veritas-26
   ```

5. On [your local training site](http://localhost:3189), sign in with the app test account. Use **Add patient**, save invented notes, and compare them. Check that reloading keeps the notes and that a different test account has its own case list. From the patient summary, use **Remove patient** on your own synthetic case and check that the case stays gone after reloading. Refer to [widget QA](WIDGET_EDITOR_QA.md#check-data-and-widgets) for the existing comparison and layout checks. Widget layouts are saved in the current browser.

For automated checks, `POST /api/training/cases` accepts a same-origin JSON body with `action` set to `list`, `create` with `name`, `save` with `id`, `earlier`, `later`, and the current `version`, or `remove` with `id` and the current `version`. It requires a Clerk session and an enabled training account. Exercise rejection of an invalid session, a different origin, an unapproved account, another account’s case ID, and a stale version. Run `npm test` for the route tests. Use a Firestore emulator for load or repeated security checks by setting `FIRESTORE_EMULATOR_HOST` to its loopback address and creating the account approval in that emulator. Clerk’s shared development service has [test-account and delivery limits](https://clerk.com/docs/guides/development/testing/test-emails-and-phones).

## Test live meeting notes

1. Install [whisper.cpp](https://github.com/ggml-org/whisper.cpp) with `whisper-cli` on your path and download its [English base weights](https://huggingface.co/ggerganov/whisper.cpp/blob/main/ggml-base.en.bin) outside the repository. From the repository root, start the loopback worker. It verifies the downloaded weights before listening.

   ```sh
   DIFFMD_WHISPER_LOOPBACK=1 PORT=18892 DIFFMD_WHISPER_BIN="$(command -v whisper-cli)" \
     DIFFMD_WHISPER_WEIGHTS=/absolute/path/to/ggml-base.en.bin \
     python3 deploy/recording-transcription/service.py
   ```

   Run `curl -fsS http://127.0.0.1:18892/health` and check for `Whisper base.en`.

2. Add `NEXT_PUBLIC_DIFFMD_LIVE_RECORDING=1` and `DIFFMD_TRAINING_WHISPER_PORT=18892` to your training `.env.local` and restart the app. Use the same loopback address in the browser and `DIFFMD_CLERK_TRAINING_ORIGIN`.
3. Open a synthetic case you own. In **Meeting notes**, confirm consent, select **Start recording**, and allow browser microphone access. Read a made-up conversation. The transcript draft updates in 12-second sections. Select **Stop recording**, review the draft against what you said, and choose **Add to later note draft**. Use **Save notes** if you want the text to sync. The worker uses temporary audio files and the app saves only the reviewed text you choose to save.
4. For independent QA, read a synthetic two-speaker script with exact medication names, doses, and negation. Check live updates, words that cross a section boundary, a short final section, denied microphone permission, and a dropped worker connection. Repeat with a phone-width viewport, and confirm a separate approved account cannot transcribe against your case ID. Report actual successes, errors and transcription mistakes.
