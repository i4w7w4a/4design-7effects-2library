import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('..', import.meta.url));
const stopWords = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'with', 'в', 'за', 'и', 'к', 'на', 'от', 'по', 'при', 'с', 'со', 'у', 'что']);

function argumentsFrom(argv) {
  let root = defaultRoot;
  let query = '';
  let limit = 3;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--root' && argv[index + 1]) root = resolve(argv[++index]);
    else if (flag === '--query' && argv[index + 1]) query = argv[++index].trim();
    else if (flag === '--limit' && argv[index + 1]) limit = Number(argv[++index]);
    else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  if (!query) throw new Error('Search needs --query "effect name or description"');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('--limit must be an integer from 1 to 10');
  return { root, query, limit };
}

function normalize(value) {
  return value.toLocaleLowerCase().replaceAll('ё', 'е').trim();
}

function tokens(value) {
  return [...new Set(normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [])].filter((part) => !stopWords.has(part));
}

function tokenMatches(queryToken, candidateToken) {
  if (queryToken === candidateToken) return true;
  if (queryToken.length >= 5 && candidateToken.length >= 5) {
    // A small inflection tolerance for Russian cases and English plurals.
    return queryToken.slice(0, 5) === candidateToken.slice(0, 5);
  }
  return false;
}

function score(row, query) {
  const normalized = normalize(query);
  const titles = [row.id.replaceAll('-', ' '), row.title, row.titleRu].map(normalize);
  const aliases = row.aliases.map(normalize);
  if (titles.includes(normalized)) return 1000;
  if (aliases.includes(normalized)) return 800;
  const queryTokens = tokens(query);
  if (!queryTokens.length) return 0;
  const fields = [
    ...titles.map((field) => [field, 12]),
    ...aliases.map((field) => [field, 8]),
    ...row.tags.map((field) => [field, 5]),
    [row.summary, 3],
    [row.summaryRu, 3],
  ];
  let total = 0;
  let matched = 0;
  for (const queryToken of queryTokens) {
    const best = Math.max(0, ...fields.map(([field, weight]) =>
      tokens(field).some((candidate) => tokenMatches(queryToken, candidate)) ? weight : 0));
    if (best) matched += 1;
    total += best;
  }
  if (!matched || matched / queryTokens.length < 0.25) return 0;
  return total + (matched / queryTokens.length) * 10;
}

function main() {
  const { root, query, limit } = argumentsFrom(process.argv.slice(2));
  const path = join(root, 'catalog', 'index.jsonl');
  let rows;
  try {
    rows = readFileSync(path, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(`Missing ${path}. Build the catalog index first.`);
    throw error;
  }
  const matches = rows
    .map((row) => ({ row, score: score(row, query) }))
    .filter(({ score: rank }) => rank > 0)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id, 'en'))
    .slice(0, limit)
    .map(({ row, score: rank }) => ({ ...row, score: Math.round(rank) }));
  process.stdout.write(`${JSON.stringify({ query, matches }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
