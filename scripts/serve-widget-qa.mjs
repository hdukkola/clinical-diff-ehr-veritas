import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const useTrainingProject = process.argv.includes('--training');
const project = useTrainingProject ? 'diffmd-training-veritas-26' : 'demo-diffmd-widget-qa';
const hostname = useTrainingProject ? 'localhost' : '127.0.0.1';
const authHost = '127.0.0.1:9199';
const storeHost = '127.0.0.1:8180';
const editor = 'widget-editor@example.test';

if (!useTrainingProject && (process.env.GCLOUD_PROJECT !== project
  || process.env.FIREBASE_AUTH_EMULATOR_HOST !== authHost
  || process.env.FIRESTORE_EMULATOR_HOST !== storeHost)) {
  throw new Error('Start this runner with npm run qa:widgets to use only the local demo emulators.');
}
if (['.env', '.env.local', '.env.development', '.env.development.local'].some((file) => existsSync(file))) {
  throw new Error('Run widget QA in a checkout without .env files to keep hosted connections out of the test workspace.');
}

let apiKey = 'demo-widget-qa-key';
let appId = '1:123:web:widgetqa';
if (useTrainingProject) {
  const trainingApp = '1:136443509492:web:7e3987be4be1be35ca3ca1';
  const output = execFileSync('firebase', ['apps:sdkconfig', 'WEB', trainingApp,
    '--project', project, '--non-interactive', '--json'], { encoding: 'utf8', timeout: 15_000 });
  const config = JSON.parse(output).result?.sdkConfig;
  if (config?.projectId !== project || config.appId !== trainingApp
    || config.authDomain !== `${project}.firebaseapp.com` || !config.apiKey) {
    throw new Error('Could not load the separate training project configuration.');
  }
  ({ apiKey, appId } = config);
} else {
  const invite = await fetch(
    `http://${storeHost}/v1/projects/${project}/databases/(default)/documents/workspaceAccounts/${editor}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {} }),
      signal: AbortSignal.timeout(5_000),
    },
  );
  if (!invite.ok) throw new Error(`Could not invite the QA editor in the local emulator (HTTP ${invite.status}).`);
  await invite.body?.cancel();
}

const require = createRequire(import.meta.url);
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|HOME|USERPROFILE|SYSTEMROOT|TMP|TEMP|TMPDIR|LANG)$/i.test(name)));
const port = useTrainingProject ? '3187' : '3186';
const app = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', '-H', hostname, '-p', port], {
  stdio: 'inherit',
  env: {
    ...env,
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_DIFFMD_LOCAL_WIDGET_QA: useTrainingProject ? '0' : '1',
    NEXT_PUBLIC_DIFFMD_TRAINING_WORKSPACE: useTrainingProject ? '1' : '0',
    NEXT_PUBLIC_DIFFMD_FIREBASE_API_KEY: apiKey,
    NEXT_PUBLIC_DIFFMD_FIREBASE_APP_ID: appId,
    NEXT_PUBLIC_DIFFMD_FIREBASE_PROJECT: project,
    NEXT_PUBLIC_DIFFMD_FIREBASE_AUTH_DOMAIN: `${project}.firebaseapp.com`,
    NEXT_PUBLIC_CLINICAL_DIFF_DISABLE_SOCKET_STREAM: '1',
    CLINICAL_DIFF_DISABLE_SOCKET_STREAM: '1',
    NEXT_PUBLIC_CLINICAL_DIFF_EXAMPLE_WORKSPACE: '0',
  },
});

const account = useTrainingProject ? 'invited Google account' : `simulated Google account ${editor}`;
console.log(`Training workspace · http://${hostname}:${port} · ${account} · synthetic cases only.`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => app.kill(signal));
}
app.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
app.on('exit', (code) => { process.exitCode = code ?? 0; });
