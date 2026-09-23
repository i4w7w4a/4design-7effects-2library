import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { open, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const script = fileURLToPath(import.meta.url);
const statePath = process.env.FOURI7_LIBRARY_STATE_PATH || path.join(root, '.local', 'library-server.json');
const lockPath = `${statePath}.lock`;
const healthPath = '/__4i7_library_health';
const defaultIdleMs = 60 * 60 * 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function numberFromEnv(name, fallback, minimum = 0) {
  const raw = process.env[name];
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`);
  return value;
}

async function readState() {
  try {
    const raw = await readFile(statePath, 'utf8');
    return { raw, value: JSON.parse(raw) };
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function removeStateIfUnchanged(raw) {
  try {
    if (await readFile(statePath, 'utf8') === raw) await rm(statePath, { force: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function probe(entry) {
  const state = entry?.value;
  if (!state || state.root !== root || !Number.isSafeInteger(state.pid)
    || state.pid <= 0 || !Number.isSafeInteger(state.port) || state.port <= 0
    || state.port > 65535 || typeof state.token !== 'string' || !state.token) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}${healthPath}`, {
      headers: { 'x-4i7-library-token': state.token },
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return false;
    const actual = await response.json();
    return actual.pid === state.pid && actual.token === state.token && actual.root === root;
  } catch {
    return false;
  }
}

async function withLock(action) {
  await mkdir(path.dirname(statePath), { recursive: true });
  const deadline = Date.now() + 20000;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, 'wx');
      await lock.writeFile(`${process.pid}\n`);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockPath);
        if (Date.now() - info.mtimeMs > 30000) await rm(lockPath, { force: true });
      } catch (statError) {
        if (statError.code !== 'ENOENT') throw statError;
      }
      if (Date.now() > deadline) throw new Error('Library start/stop is busy');
      await sleep(120);
    }
  }
  try {
    return await action();
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

function urlFor(state) {
  return `http://127.0.0.1:${state.port}/`;
}

async function start() {
  await withLock(async () => {
    const existing = await readState();
    if (await probe(existing)) {
      console.log(`Library already running at ${urlFor(existing.value)}`);
      return;
    }
    if (existing) await removeStateIfUnchanged(existing.raw);

    const token = randomUUID();
    const log = await open(path.join(path.dirname(statePath), 'library-server.log'), 'a');
    let child;
    try {
      child = spawn(process.execPath, [script, 'serve'], {
        cwd: root,
        env: { ...process.env, FOURI7_LIBRARY_TOKEN: token },
        detached: true,
        windowsHide: true,
        stdio: ['ignore', log.fd, log.fd],
      });
      child.unref();
    } finally {
      await log.close();
    }

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const current = await readState();
      if (current?.value?.pid === child.pid && current.value.token === token && await probe(current)) {
        console.log(`Library running at ${urlFor(current.value)}`);
        return;
      }
      if (child.exitCode !== null) break;
      await sleep(120);
    }
    throw new Error('Library server did not start. Check .local/library-server.log.');
  });
}

async function status() {
  const current = await readState();
  if (await probe(current)) {
    console.log(`Library running at ${urlFor(current.value)} (PID ${current.value.pid})`);
  } else {
    if (current) await removeStateIfUnchanged(current.raw);
    console.log('Library not running.');
  }
}

async function stop() {
  await withLock(async () => {
    const current = await readState();
    if (!current) {
      console.log('Library not running.');
      return;
    }
    if (!await probe(current)) {
      await removeStateIfUnchanged(current.raw);
      console.log('Stale library state removed; library not running.');
      return;
    }
    try {
      process.kill(current.value.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && await probe(current)) await sleep(100);
    if (await probe(current)) throw new Error('Library server did not stop');
    await removeStateIfUnchanged(current.raw);
    console.log('Library stopped.');
  });
}

async function serve() {
  const token = process.env.FOURI7_LIBRARY_TOKEN;
  if (!token) throw new Error('Managed server token missing');
  const port = numberFromEnv('FOURI7_LIBRARY_PORT', 5173);
  const idleMs = numberFromEnv('FOURI7_LIBRARY_IDLE_MS', defaultIdleMs, 1);
  const { createServer } = await import('vite');
  let idleTimer;
  let vite;
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    clearTimeout(idleTimer);
    await vite.close();
    const current = await readState();
    if (current?.value?.pid === process.pid && current.value.token === token) {
      await removeStateIfUnchanged(current.raw);
    }
    process.exit(0);
  };
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void shutdown(), idleMs);
    idleTimer.unref();
  };
  vite = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
    server: { host: '127.0.0.1', port, strictPort: false },
    plugins: [{
      name: '4i7-managed-library-health',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url !== healthPath) return next();
          if (request.headers['x-4i7-library-token'] !== token) {
            response.writeHead(404).end();
            return;
          }
          response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          response.end(JSON.stringify({ pid: process.pid, token, root }));
        });
      },
    }],
  });
  vite.httpServer.on('request', (request) => {
    if (request.url !== healthPath) resetIdle();
  });
  await vite.listen();
  const address = vite.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Vite did not report a TCP port');
  await mkdir(path.dirname(statePath), { recursive: true });
  const state = JSON.stringify({ pid: process.pid, port: address.port, token, root, startedAt: new Date().toISOString() });
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, state, { mode: 0o600 });
  await rename(temporaryPath, statePath);
  resetIdle();
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

try {
  switch (process.argv[2]) {
    case 'start': await start(); break;
    case 'status': await status(); break;
    case 'stop': await stop(); break;
    case 'serve': await serve(); break;
    default: throw new Error('Usage: node scripts/library.mjs start|status|stop');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
