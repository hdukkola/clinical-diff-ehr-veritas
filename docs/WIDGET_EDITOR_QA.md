# DiffMD training workspace

Use synthetic case references and invented notes only. The **Training workspace** banner identifies this version. Use it to practice the case and widget workflow. The live site and its data are separate. Comparisons use browser rules.

## Start with an invited Google account

Use a fresh checkout of `work/graphite-workspace-redesign` with Node and the Firebase CLI installed. Run `npm ci`, `firebase login` with your invited Google account, and `npm run qa:widgets:training`. Leave the terminal open and visit [the training app](http://localhost:3187). Select **Sign in with Google** using that same account. The app runs on your computer and saves synthetic cases in the separate [DiffMD Training Firebase project](https://console.firebase.google.com/project/diffmd-training-veritas-26/overview). It starts with an empty case list for each new account. Billing is disabled.

Firebase project administrators can manage the training project's configuration and data in the console. In the app, invited users can create and update their own cases. Widget layouts are saved in each browser.

## Start with simulated sign-in

With Java 21 installed, run `npm run qa:widgets` instead and visit [the emulator workspace](http://127.0.0.1:3186). This mode uses simulated sign-in and Firestore on your computer. It needs no Firebase project access. Both launchers require a checkout without local `.env` files.

On Home, select **Sign in with Google**. In the emulator popup, select **Add new account** and enter `widget-editor@example.test`. Choose **Sign in with Google.com** in that popup. For a repeated test, choose the existing simulated account. The launcher invites this account to the local workspace. Firebase project IAM and in-app account access are separate.

## Check data and widgets

1. In Home, select **Add patient**, enter a synthetic reference, and choose **Create patient**. Open **Edit patient notes**. Enter two invented notes and choose **Save notes**.
2. Run **Compare notes**. Review the exact excerpts. Flag a difference and check the updated counts in **Patient**, **Snapshot review**, and **Review suggestions**. Before a comparison, a dash means the quantity has yet to be calculated. A zero means a comparison found none.
3. On Patient, open **Add widgets** and add **Changes awaiting review** or **Clarifications**. Move it with its drag handle or keyboard controls. Switch to a second case and check that the cards show that case's values. Edit the first case's note and run the comparison again. Check that the original values clear during the edit and the cards show the new results after the comparison.
4. Reload and open the case to confirm saved notes and the widget layout survive. Re-run the comparison. The synced workspace stores notes; comparison results and decisions stay in the current tab. Layouts are saved per page in the browser.

Stop the launcher with Ctrl+C. The emulator keeps test cases for the current run. Training-project cases persist between runs.
