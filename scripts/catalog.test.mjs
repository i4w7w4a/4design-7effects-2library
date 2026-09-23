import { afterEach, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_OPTIONS } from '../effects/magnetic-cards/src/magneticCards';
import { isDemoOptions } from '../playground/options';

const scripts = fileURLToPath(new URL('.', import.meta.url));
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root() {
  const path = mkdtempSync(join(tmpdir(), 'effect-catalog-'));
  roots.push(path);
  return path;
}

function effect(rootPath, id, fields = {}) {
  const dir = join(rootPath, 'effects', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'effect.json'), JSON.stringify({
    schemaVersion: 1,
    id,
    title: id === 'magnetic-cards' ? 'Magnetic Cards' : 'Soft Reveal',
    titleRu: id === 'magnetic-cards' ? 'Магнитные карточки' : 'Плавное появление',
    summary: id === 'magnetic-cards' ? 'Cards follow the pointer and tilt in depth.' : 'Content fades in while scrolling.',
    summaryRu: id === 'magnetic-cards' ? 'Карточки тянутся к курсору и наклоняются в глубину.' : 'Содержимое плавно появляется при прокрутке.',
    aliases: id === 'magnetic-cards' ? ['магнитный отклик', 'magnetic hover'] : ['scroll reveal'],
    tags: id === 'magnetic-cards' ? ['hover', 'cursor', '3d', 'cards'] : ['scroll', 'fade'],
    version: '0.1.0',
    status: 'draft',
    demo: `/?effect=${id}`,
    license: 'MIT',
    ...fields,
  }));
}

function run(script, rootPath, ...args) {
  return spawnSync(process.execPath, [join(scripts, script), '--root', rootPath, ...args], { encoding: 'utf8' });
}

test('builds a compact sorted index, then search uses that index after effect files disappear', () => {
  const base = root();
  effect(base, 'soft-reveal');
  effect(base, 'magnetic-cards');

  const built = run('build-index.mjs', base);
  expect(built.status).toBe(0);
  const lines = readFileSync(join(base, 'catalog', 'index.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  expect(lines.map((row) => row.id)).toEqual(['magnetic-cards', 'soft-reveal']);
  expect(lines[0]).toMatchObject({ id: 'magnetic-cards', version: '0.1.0', status: 'draft' });
  expect(lines[0]).not.toHaveProperty('controls');

  rmSync(join(base, 'effects'), { recursive: true });
  const found = run('find-effect.mjs', base, '--query', 'карточки тянутся к курсору');
  expect(found.status).toBe(0);
  expect(JSON.parse(found.stdout).matches.map((match) => match.id)).toEqual(['magnetic-cards']);
});

test('search ranks a direct effect name above incidental tag matches and limits results', () => {
  const base = root();
  effect(base, 'magnetic-cards');
  effect(base, 'soft-reveal', { tags: ['cards', 'magnetic'], aliases: ['карточки в ленте'] });
  expect(run('build-index.mjs', base).status).toBe(0);

  const found = run('find-effect.mjs', base, '--query', 'магнитные карточки', '--limit', '1');
  expect(found.status).toBe(0);
  expect(JSON.parse(found.stdout).matches.map((match) => match.id)).toEqual(['magnetic-cards']);
});

test('check detects a stale index without rewriting it', () => {
  const base = root();
  effect(base, 'magnetic-cards');
  expect(run('build-index.mjs', base).status).toBe(0);
  const indexPath = join(base, 'catalog', 'index.jsonl');
  const before = readFileSync(indexPath, 'utf8');
  effect(base, 'soft-reveal');

  const checked = run('build-index.mjs', base, '--check');
  expect(checked.status).not.toBe(0);
  expect(readFileSync(indexPath, 'utf8')).toBe(before);
});

test('builder rejects mismatched directory ids', () => {
  const base = root();
  effect(base, 'magnetic-cards', { id: 'wrong-id' });
  expect(run('build-index.mjs', base).status).not.toBe(0);
});

test('search reports a missing index instead of scanning effect files', () => {
  const base = root();
  effect(base, 'magnetic-cards');
  const found = run('find-effect.mjs', base, '--query', 'magnetic hover');
  expect(found.status).not.toBe(0);
  expect(found.stderr).toMatch(/index\.jsonl/);
});

test('effect metadata links controls whose defaults match the core and pass preview validation', () => {
  const metadata = JSON.parse(readFileSync(new URL('../effects/magnetic-cards/effect.json', import.meta.url), 'utf8'));
  const libraryRoot = fileURLToPath(new URL('..', import.meta.url));
  const schema = JSON.parse(readFileSync(join(libraryRoot, metadata.controls), 'utf8'));
  const schemaDefaults = Object.fromEntries(Object.entries(schema.properties).map(([key, control]) => [key, control.default]));

  expect(schema.type).toBe('object');
  expect(schema.required.slice().sort()).toEqual(Object.keys(DEFAULT_OPTIONS).sort());
  expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(DEFAULT_OPTIONS).sort());
  expect(schema.additionalProperties).toBe(false);
  expect(schemaDefaults).toEqual(DEFAULT_OPTIONS);
  expect(isDemoOptions(schemaDefaults)).toBe(true);
  for (const [key, value] of Object.entries(schemaDefaults)) {
    const control = schema.properties[key];
    expect(control.type).toBe(typeof value);
    if (typeof value === 'number') {
      expect(value).toBeGreaterThanOrEqual(control.minimum);
      expect(value).toBeLessThanOrEqual(control.maximum);
    }
  }
});
