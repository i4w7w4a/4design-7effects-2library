import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(new URL('./library.mjs', import.meta.url));

async function fixture(t, overrides = {}) {
  const temporaryRoot = path.resolve(tmpdir());
  const directory = path.resolve(await mkdtemp(path.join(temporaryRoot, '4i7-library-')));
  if (path.dirname(directory) !== temporaryRoot || !path.basename(directory).startsWith('4i7-library-')) {
    throw new Error('Unsafe temporary directory');
  }
  const statePath = path.join(directory, 'server.json');
  const env = {
    ...process.env,
    FOURI7_LIBRARY_STATE_PATH: statePath,
    FOURI7_LIBRARY_PORT: '0',
    FOURI7_LIBRARY_IDLE_MS: '20000',
    ...overrides,
  };
  t.after(async () => {
    try { await command('stop', env); } catch { /* A failed start has nothing to stop. */ }
    await rm(directory, { recursive: true, force: true });
  });
  return { directory, env, statePath };
}

async function command(action, env) {
  const result = await execFileAsync(process.execPath, [script, action], {
    cwd: root,
    env,
    timeout: 20000,
    windowsHide: true,
  });
  return result.stdout.trim();
}

async function state(pathname) {
  return JSON.parse(await readFile(pathname, 'utf8'));
}

async function waitUntil(check, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  assert.fail('Timed out waiting for server state');
}

test('start opens the catalog and reuses its own live server; stop closes it', { timeout: 30000 }, async (t) => {
  const { env, statePath } = await fixture(t);
  const first = await command('start', env);
  const url = first.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  assert.ok(url, `start must report its real URL: ${first}`);
  assert.equal((await fetch(url)).status, 200);

  const initial = await state(statePath);
  assert.equal((await state(statePath)).pid, initial.pid);
  assert.match(await command('status', env), /running/i);
  assert.match(await command('start', env), new RegExp(url.replaceAll('.', '\\.')));
  assert.equal((await state(statePath)).pid, initial.pid);

  // This route must still use the existing Vite preset middleware.
  const preset = await fetch(new URL('/api/presets', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      effect: 'magnetic-cards', version: '0.1.0',
      options: { radius: 215, travel: 20, responseMs: 150, tiltDeg: 13,
        depthPx: 36, perspectivePx: 680, glow: 0.65, reducedMotion: false },
    }),
  });
  assert.equal(preset.status, 201);
  const saved = await preset.json();
  t.after(async () => rm(path.join(root, saved.path), { force: true }));

  assert.match(await command('stop', env), /stopped/i);
  assert.match(await command('status', env), /not running/i);
});

test('start reports a different real port when the requested one is occupied', { timeout: 30000 }, async (t) => {
  const blocker = createServer();
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  t.after(async () => new Promise((resolve) => blocker.close(resolve)));
  const occupiedPort = blocker.address().port;
  const { env } = await fixture(t, { FOURI7_LIBRARY_PORT: String(occupiedPort) });
  const output = await command('start', env);
  const actualPort = Number(output.match(/http:\/\/127\.0\.0\.1:(\d+)\//)?.[1]);
  assert.ok(actualPort > 0, output);
  assert.notEqual(actualPort, occupiedPort);
  assert.equal((await fetch(`http://127.0.0.1:${actualPort}/`)).status, 200);
});

test('stop refuses stale state even when its PID belongs to a live process', { timeout: 30000 }, async (t) => {
  const { env, statePath } = await fixture(t);
  const output = await command('start', env);
  const url = output.match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
  const original = await state(statePath);
  await writeFile(statePath, JSON.stringify({ ...original, token: 'wrong-token' }));
  try {
    assert.match(await command('stop', env), /stale|not running/i);
    assert.equal((await fetch(url)).status, 200, 'unverified PID must survive');
  } finally {
    await writeFile(statePath, JSON.stringify(original));
  }
});

test('managed server shuts itself down after idle time', { timeout: 30000 }, async (t) => {
  const { env } = await fixture(t, { FOURI7_LIBRARY_IDLE_MS: '1600' });
  const output = await command('start', env);
  assert.match(output, /http:\/\/127\.0\.0\.1:\d+\//);
  await waitUntil(async () => /not running/i.test(await command('status', env)), 9000);
});
