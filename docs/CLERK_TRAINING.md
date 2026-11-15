# DiffMD Clerk training workspace

This checkout uses the separate **DiffMD Training** Clerk development instance and `diffmd-training-veritas-26` Firebase project. Use invented patient references and notes only. Limit security testing to this training setup and the local endpoints documented below.

1. Open the Clerk workspace invitation with your invited email to access [the training Clerk dashboard](https://dashboard.clerk.com/apps/app_3MA54jzWgQMRaRHqQcCPQlyrlgN/instances/ins_3MA54pOKfZxHbkmXq7hIWt2uWeP). Accept the separate app invitation to create your test sign-in. In the app dashboard, open **Users** and find the Clerk user ID for the signed-up account.
2. In [training Firestore](https://console.firebase.google.com/project/diffmd-training-veritas-26/firestore/databases/-default-/data), create `workspaceClerkAccounts/{Clerk user ID}` with `enabled` set to the boolean `true`. The user ID comes from the Clerk dashboard after the email is verified. Set `enabled` to `false` to revoke case access. An IAM role grants Firebase console access and does not enroll an app user.
3. Check out `work/clerk-training` in a separate folder and run `npm ci`. Install the Google Cloud CLI and use your invited Firebase account with `gcloud auth application-default login`. Get the development keys from the training Clerk dashboard into the ignored `.env.local` via the command below. Keep the keys out of chat and Git.

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

5. On [your local training site](http://localhost:3189), sign in with the app test account. Use **Add patient**, save invented notes, and compare them. Check that reloading keeps the notes and that a different test account has its own case list. Refer to [widget QA](WIDGET_EDITOR_QA.md#check-data-and-widgets) for the existing comparison and layout checks. Widget layouts are saved in the current browser.

For automated checks, `POST /api/training/cases` accepts a same-origin JSON body with `action` set to `list`, `create` with `name`, or `save` with `id`, `earlier`, `later`, and the current `version`. It requires a Clerk session and an enabled training account. Exercise rejection of an invalid session, a different origin, an unapproved account, another account’s case ID, and a stale version. Run `npm test` for the route tests. Use a Firestore emulator for load or repeated security checks by setting `FIRESTORE_EMULATOR_HOST` to its loopback address and creating the account approval in that emulator. Clerk’s shared development service has [test-account and delivery limits](https://clerk.com/docs/guides/development/testing/test-emails-and-phones).
