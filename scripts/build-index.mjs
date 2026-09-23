import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));

function argumentsFrom(argv) {
  let root = defaultRoot;
  let check = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root' && argv[index + 1]) root = resolve(argv[++index]);
    else if (argv[index] === '--check') check = true;
    else throw new Error(`Unknown or incomplete argument: ${argv[index]}`);
  }
  return { root, check };
}

function nonemptyText(value, label, file) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${file}: ${label} must be nonempty text`);
  return value.trim();
}

function textList(value, label, file) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${file}: ${label} must be a list of nonempty strings`);
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function indexRow(file, folder) {
  const effect = JSON.parse(readFileSync(file, 'utf8'));
  if (effect.schemaVersion !== 1) throw new Error(`${file}: unsupported schemaVersion`);
  const id = nonemptyText(effect.id, 'id', file);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id !== folder) throw new Error(`${file}: id must equal its directory name`);
  const version = nonemptyText(effect.version, 'version', file);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${file}: version must use MAJOR.MINOR.PATCH`);
  if (!['draft', 'ready', 'deprecated'].includes(effect.status)) throw new Error(`${file}: invalid status`);
  const demo = nonemptyText(effect.demo, 'demo', file);
  if (demo !== `/?effect=${id}`) throw new Error(`${file}: demo must route to its effect id`);
  return {
    id,
    title: nonemptyText(effect.title, 'title', file),
    titleRu: nonemptyText(effect.titleRu, 'titleRu', file),
    summary: nonemptyText(effect.summary, 'summary', file),
    summaryRu: nonemptyText(effect.summaryRu, 'summaryRu', file),
    aliases: textList(effect.aliases, 'aliases', file),
    tags: textList(effect.tags, 'tags', file),
    version,
    status: effect.status,
    demo,
    metadata: `effects/${id}/effect.json`,
    license: nonemptyText(effect.license, 'license', file),
  };
}

function main() {
  const { root, check } = argumentsFrom(process.argv.slice(2));
  const effectsPath = join(root, 'effects');
  if (!existsSync(effectsPath)) throw new Error(`Missing effects directory: ${effectsPath}`);
  const rows = readdirSync(effectsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => indexRow(join(effectsPath, entry.name, 'effect.json'), entry.name))
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));
  if (rows.length === 0) throw new Error('Catalog has no effects');
  const content = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
  const indexPath = join(root, 'catalog', 'index.jsonl');
  if (check) {
    if (!existsSync(indexPath) || readFileSync(indexPath, 'utf8') !== content) {
      throw new Error(`Stale catalog index: ${indexPath}. Run node scripts/build-index.mjs`);
    }
    process.stdout.write(`Catalog index current (${rows.length} effects)\n`);
    return;
  }
  mkdirSync(join(root, 'catalog'), { recursive: true });
  const temporary = `${indexPath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, content, 'utf8');
    renameSync(temporary, indexPath);
  } finally {
    rmSync(temporary, { force: true });
  }
  process.stdout.write(`Built ${indexPath} (${rows.length} effects)\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
