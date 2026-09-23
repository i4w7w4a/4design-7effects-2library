import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDemoOptions } from './options.ts';

const MAX_BODY_BYTES = 16 * 1024;

function send(response: ServerResponse, status: number, payload: object) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function isPreset(value: unknown): value is { effect: 'magnetic-cards'; version: '0.1.0'; options: Parameters<typeof isDemoOptions>[0] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  return Object.keys(input).length === 3
    && input.effect === 'magnetic-cards'
    && input.version === '0.1.0'
    && isDemoOptions(input.options);
}

export function createPresetHandler(rootDirectory: string) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== '/api/presets') return send(response, 404, { error: 'Not found' });
    if (request.method !== 'POST') return send(response, 405, { error: 'Method not allowed' });
    if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) {
      return send(response, 415, { error: 'Expected JSON' });
    }
    try {
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) return send(response, 413, { error: 'Preset is too large' });
        chunks.push(chunk);
      }
      let input: unknown;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(response, 400, { error: 'Invalid JSON' });
      }
      if (!isPreset(input)) return send(response, 400, { error: 'Invalid preset' });
      const id = randomUUID();
      const relativePath = `.local/sessions/${id}.json`;
      const directory = path.join(rootDirectory, '.local', 'sessions');
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${id}.json`), `${JSON.stringify(input, null, 2)}\n`, { flag: 'wx' });
      return send(response, 201, { id, path: relativePath });
    } catch {
      return send(response, 500, { error: 'Could not save preset' });
    }
  };
}
