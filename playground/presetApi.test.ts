import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPresetHandler } from './presetApi';

const options = {
  radius: 215,
  travel: 20,
  responseMs: 150,
  tiltDeg: 13,
  depthPx: 36,
  perspectivePx: 680,
  glow: 0.65,
  reducedMotion: false,
};

describe('local preset API', () => {
  let server: Server | undefined;
  let directory: string | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (directory) await rm(directory, { recursive: true, force: true });
    server = undefined;
    directory = undefined;
  });

  async function endpoint() {
    directory = await mkdtemp(path.join(tmpdir(), 'effects-presets-'));
    server = createServer(createPresetHandler(directory));
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No server address');
    return `http://127.0.0.1:${address.port}/api/presets`;
  }

  it('persists only validated effect settings in a generated local session file', async () => {
    const url = await endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effect: 'magnetic-cards', version: '0.1.0', options }),
    });

    expect(response.status).toBe(201);
    const result = await response.json() as { id: string; path: string };
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.path).toBe(`.local/sessions/${result.id}.json`);
    const saved = JSON.parse(await readFile(path.join(directory!, result.path), 'utf8'));
    expect(saved).toEqual({ effect: 'magnetic-cards', version: '0.1.0', options });
  });

  it('rejects a caller supplied path even when options are valid', async () => {
    const url = await endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        effect: 'magnetic-cards', version: '0.1.0',
        id: '../../outside', options,
      }),
    });

    expect(response.status).toBe(400);
    expect((await response.json() as { error: string }).error).toMatch(/invalid/i);
  });

  it('rejects options beyond the documented control range', async () => {
    const url = await endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effect: 'magnetic-cards', version: '0.1.0', options: { ...options, tiltDeg: 999 } }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects a wrong effect or version', async () => {
    const url = await endpoint();
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ effect: 'other-effect', version: '0.1.0', options }),
    });
    expect(response.status).toBe(400);
  });
});
