/**
 * Static build: copy only approved public assets to dist, and generate Firebase
 * browser config there. Never commit or upload dist/ to the repository.
 * Maintainer: OpenAI | 2026-11-23 | GitHub Actions deployment
 */
import { mkdir, readFile, rm, copyFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DEST = join(ROOT, 'dist');
const entries = [
  'index.html', 'login.html', 'logout.html', 'styles.css', 'app.js',
  'firebase-sync.js', 'service-worker.js', 'manifest.webmanifest',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png', '.nojekyll'
];

function fail(message) {
  // Errors intentionally never print secret or config values.
  throw new Error(`Deployment configuration error: ${message}`);
}

function validate() {
  const raw = process.env.FIREBASE_WEB_CONFIG_JSON;
  if (!raw) fail('Missing repository secret FIREBASE_WEB_CONFIG_JSON.');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { fail('FIREBASE_WEB_CONFIG_JSON is not valid JSON.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Firebase config must be an object.');
  const names = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];
  const config = {};
  for (const name of names) {
    const value = parsed[name];
    if (typeof value !== 'string' || !value.trim() || /你的|YOUR_|REPLACE_|TODO/i.test(value)) {
      fail(`${name} must be a real string copied from Firebase > Project settings > Web app.`);
    }
    config[name] = value.trim();
  }
  if (!/^AIza[\w-]{20,}$/.test(config.apiKey)) fail('apiKey format invalid; recopy from Firebase.');
  if (!/^[a-z0-9-]+\.firebaseapp\.com$/i.test(config.authDomain)) fail('authDomain must be your project firebaseapp.com hostname.');
  if (!/^[a-z0-9-]+$/.test(config.projectId)) fail('projectId contains unexpected characters.');
  const match = config.appId.match(/^1:(\d+):web:[a-f\d]+$/i);
  if (!match) fail('appId format invalid.');
  if (!/^\d+$/.test(config.messagingSenderId) || match[1] !== config.messagingSenderId) {
    fail('appId project number and messagingSenderId disagree. Copy BOTH from the SAME Web app config.');
  }
  if (!config.authDomain.startsWith(`${config.projectId}.`)) {
    fail('authDomain and projectId disagree. Copy from the same Firebase project.');
  }
  const siteKey = process.env.FIREBASE_APPCHECK_SITE_KEY;
  if (typeof siteKey !== 'string' || !siteKey.trim() || /你的|YOUR_|REPLACE_|TODO/i.test(siteKey)) {
    fail('Missing or invalid repository secret FIREBASE_APPCHECK_SITE_KEY (reCAPTCHA Enterprise site key).');
  }
  if (siteKey.length > 500 || /\s/.test(siteKey)) fail('App Check site key has invalid whitespace/length.');
  return { config, siteKey: siteKey.trim() };
}

const { config, siteKey } = validate();
await rm(DEST, { recursive: true, force: true });
for (const name of entries) {
  const source = join(ROOT, name);
  if (!(await stat(source).catch(() => null))?.isFile()) fail(`Required static file missing: ${name}`);
  const target = join(DEST, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}
// Browser config and reCAPTCHA site key are PUBLIC at the deployed URL.
// They are intentionally absent from the Git repository and Git history.
await writeFile(join(DEST, 'firebase-config.js'),
  `/* Generated during GitHub Actions deployment; public browser-side configuration. */\n` +
  `window.BANK_FIREBASE_CONFIG = Object.freeze(${JSON.stringify(config)});\n` +
  `window.BANK_APP_CHECK_SITE_KEY = ${JSON.stringify(siteKey)};\n`,
  { encoding: 'utf8', mode: 0o644 });
console.log('Static Pages build completed. No configuration values printed.');
