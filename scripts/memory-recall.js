#!/usr/bin/env node
/*
 * Dependency-free recall index for Projectia workspace memory.
 *
 * Commands:
 * - node scripts/memory-recall.js build
 * - node scripts/memory-recall.js search "capex attachment" --limit 5 --type daily-memory
 * - node scripts/memory-recall.js context "capex attachment" --limit 5
 * - node scripts/memory-recall.js show "memory/2026-05-26.md#0"
 * - node scripts/memory-recall.js stats
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const INDEX_DIR = path.join(ROOT, '.memory-index');
const INDEX_FILE = path.join(INDEX_DIR, 'index.json');
const INDEX_VERSION = 2;

const SOURCE_PATHS = [
  'AGENTS.md',
  'MEMORY.md',
  'OPS_STATE.md',
  'TOOLS.md',
  'USER.md',
  'docs',
  'knowledge',
  'memory',
  'skills',
];

const STOPWORDS = new Set([
  'a', 'about', 'ada', 'akan', 'and', 'atau', 'be', 'bisa', 'buat', 'by', 'dan', 'deh', 'di',
  'dulu', 'for', 'from', 'gue', 'gw', 'how', 'if', 'in', 'ini', 'is', 'it', 'itu', 'ke', 'kita',
  'lu', 'of', 'on', 'or', 'the', 'to', 'untuk', 'yang',
]);

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function isTextSource(file) {
  return /\.(md|txt)$/i.test(file);
}

function walk(entryPath) {
  const full = path.join(ROOT, entryPath);
  if (!fs.existsSync(full)) return [];
  const stat = fs.statSync(full);
  if (stat.isFile()) return isTextSource(full) ? [full] : [];
  if (!stat.isDirectory()) return [];

  const out = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'backlinks.md') continue;
    const child = path.join(full, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel(child)));
    else if (entry.isFile() && isTextSource(child)) out.push(child);
  }
  return out;
}

function sourceFiles() {
  return SOURCE_PATHS.flatMap(walk).sort();
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}_/-]+/gu, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^[-_/]+|[-_/]+$/g, ''))
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function phrasesFromQuery(query) {
  const quoted = [...String(query).matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean);
  const raw = String(query).replace(/"[^"]+"/g, '').trim();
  return [...quoted, raw].filter((phrase) => phrase.split(/\s+/).length > 1);
}

function titleFrom(text, fallback) {
  const heading = text.match(/^#\s+(.+)$/m);
  if (heading) return heading[1].trim();
  return path.basename(fallback);
}

function sourceType(file) {
  const r = rel(file);
  if (r.startsWith('memory/')) return 'daily-memory';
  if (r.startsWith('knowledge/')) return 'knowledge';
  if (r.startsWith('docs/')) return 'docs';
  if (r.startsWith('skills/')) return 'skill';
  if (r === 'MEMORY.md') return 'long-term-memory';
  if (r === 'TOOLS.md') return 'tool-notes';
  if (r === 'OPS_STATE.md') return 'ops-state';
  return 'workspace';
}

function lineNumberForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= offset) low = mid + 1;
    else high = mid - 1;
  }
  return Math.max(1, high + 1);
}

function splitChunks(file, text) {
  const lines = text.split(/\r?\n/);
  const lineStarts = [];
  let cursor = 0;
  for (const line of lines) {
    lineStarts.push(cursor);
    cursor += line.length + 1;
  }

  const chunks = [];
  let currentTitle = titleFrom(text, rel(file));
  let current = [];
  let currentStartOffset = 0;
  let offset = 0;
  let chunkNo = 0;

  function flush(endOffset) {
    const body = current.join('\n').trim();
    if (!body) return;
    chunks.push({
      id: `${rel(file)}#${chunkNo}`,
      path: rel(file),
      chunkNo,
      title: currentTitle,
      type: sourceType(file),
      startLine: lineNumberForOffset(lineStarts, currentStartOffset),
      endLine: lineNumberForOffset(lineStarts, Math.max(currentStartOffset, endOffset - 1)),
      text: body,
    });
    chunkNo += 1;
    current = [];
    currentStartOffset = endOffset;
  }

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading && current.join('\n').length > 200) {
      flush(offset);
      currentTitle = heading[2].trim();
      currentStartOffset = offset;
    }
    current.push(line);
    offset += line.length + 1;
    if (current.join('\n').length > 1800) flush(offset);
  }
  flush(offset);
  return chunks;
}

function build(options = {}) {
  fs.mkdirSync(INDEX_DIR, { recursive: true });
  const files = sourceFiles();
  const documents = [];
  const fileMeta = {};

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const stat = fs.statSync(file);
    fileMeta[rel(file)] = { mtimeMs: stat.mtimeMs, size: stat.size };
    for (const chunk of splitChunks(file, text)) {
      const terms = tokenize(`${chunk.title}\n${chunk.text}`);
      if (!terms.length) continue;
      const tf = {};
      for (const term of terms) tf[term] = (tf[term] || 0) + 1;
      documents.push({
        ...chunk,
        mtimeMs: stat.mtimeMs,
        termCount: terms.length,
        tf,
      });
    }
  }

  const df = {};
  for (const doc of documents) {
    for (const term of Object.keys(doc.tf)) df[term] = (df[term] || 0) + 1;
  }

  const index = {
    version: INDEX_VERSION,
    generatedAt: new Date().toISOString(),
    root: ROOT,
    sourcePaths: SOURCE_PATHS,
    fileCount: files.length,
    documentCount: documents.length,
    vocabularySize: Object.keys(df).length,
    fileMeta,
    df,
    documents,
  };

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
  if (!options.quiet) {
    console.log(`Built recall index: ${index.fileCount} files, ${index.documentCount} chunks, ${index.vocabularySize} terms.`);
  }
  return index;
}

function indexIsStale(index) {
  if (!index || index.version !== INDEX_VERSION) return true;
  const files = sourceFiles();
  if (files.length !== index.fileCount) return true;
  for (const file of files) {
    const stat = fs.statSync(file);
    const meta = index.fileMeta && index.fileMeta[rel(file)];
    if (!meta || meta.size !== stat.size || Math.abs(meta.mtimeMs - stat.mtimeMs) > 1) return true;
  }
  return false;
}

function loadIndex(options = {}) {
  let index = null;
  if (fs.existsSync(INDEX_FILE)) {
    index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  }
  if (!index || (!options.noAutoBuild && indexIsStale(index))) {
    index = build({ quiet: options.quietBuild });
  }
  return index;
}

function snippet(text, queryTerms) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();
  const positions = queryTerms
    .map((term) => lower.indexOf(term.toLowerCase()))
    .filter((pos) => pos >= 0);
  const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 100);
  return `${start > 0 ? '...' : ''}${clean.slice(start, start + 360)}${start + 360 < clean.length ? '...' : ''}`;
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--limit' || arg === '-n') options.limit = args[++i];
    else if (arg === '--type') options.type = args[++i];
    else if (arg === '--path') options.path = args[++i];
    else if (arg === '--json') options.json = true;
    else if (arg === '--no-auto-build') options.noAutoBuild = true;
    else if (arg === '--full') options.full = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else positional.push(arg);
  }
  if (!options.limit && positional.length > 1 && /^\d+$/.test(positional[positional.length - 1])) {
    options.limit = positional.pop();
  }
  return { query: positional.join(' '), options };
}

function scoreDocuments(index, query, options = {}) {
  const terms = [...new Set(tokenize(query))];
  const phrases = phrasesFromQuery(query);
  if (!terms.length && !phrases.length) return { terms, phrases, results: [] };

  const now = Date.now();
  const scored = [];
  for (const doc of index.documents) {
    if (options.type && doc.type !== options.type) continue;
    if (options.path && !doc.path.includes(options.path)) continue;

    let score = 0;
    const lowerText = doc.text.toLowerCase();
    const lowerTitle = doc.title.toLowerCase();
    const lowerPath = doc.path.toLowerCase();

    for (const term of terms) {
      const tf = doc.tf[term] || 0;
      if (!tf) continue;
      const idf = Math.log(1 + index.documentCount / (1 + (index.df[term] || 0)));
      score += (1 + Math.log(tf)) * idf;
      if (lowerTitle.includes(term)) score += 1.4;
      if (lowerPath.includes(term)) score += 0.9;
    }

    for (const phrase of phrases) {
      const normalizedPhrase = phrase.toLowerCase();
      if (lowerText.includes(normalizedPhrase)) score += 4;
      if (lowerTitle.includes(normalizedPhrase)) score += 2;
    }

    if (!score) continue;
    const ageDays = Math.max(0, (now - doc.mtimeMs) / 86400000);
    const freshness = doc.type === 'daily-memory' ? Math.max(0, 0.5 - ageDays / 365) : 0;
    scored.push({ ...doc, score: score + freshness });
  }

  scored.sort((a, b) => b.score - a.score || b.mtimeMs - a.mtimeMs);
  return { terms, phrases, results: scored };
}

function search(query, options = {}) {
  const index = loadIndex({ noAutoBuild: options.noAutoBuild, quietBuild: options.json });
  const limit = Number(options.limit || 8);
  const { terms, results } = scoreDocuments(index, query, options);
  const limited = results.slice(0, limit);

  if (options.json) {
    console.log(JSON.stringify({
      query,
      generatedAt: index.generatedAt,
      totalMatches: results.length,
      results: limited.map(formatResult),
    }, null, 2));
    return;
  }

  if (!terms.length) {
    console.error('Search query has no indexable terms.');
    process.exitCode = 1;
    return;
  }

  console.log(`Query: ${query}`);
  console.log(`Index: ${index.documentCount} chunks from ${index.fileCount} files, generated ${index.generatedAt}`);
  if (options.type) console.log(`Filter: type=${options.type}`);
  if (options.path) console.log(`Filter: path contains "${options.path}"`);
  console.log('');
  if (!limited.length) {
    console.log('No matches.');
    return;
  }

  limited.forEach((result, idx) => {
    const location = `${result.path}:${result.startLine}`;
    console.log(`${idx + 1}. ${result.title}`);
    console.log(`   ${location}  [${result.type}]  id=${result.id}  score=${result.score.toFixed(2)}`);
    console.log(`   ${snippet(result.text, terms)}`);
    console.log('');
  });
}

function formatResult(result) {
  return {
    id: result.id,
    title: result.title,
    path: result.path,
    startLine: result.startLine,
    endLine: result.endLine,
    type: result.type,
    score: Number(result.score.toFixed(3)),
  };
}

function context(query, options = {}) {
  const index = loadIndex({ noAutoBuild: options.noAutoBuild, quietBuild: true });
  const limit = Number(options.limit || 5);
  const { terms, results } = scoreDocuments(index, query, options);
  const limited = results.slice(0, limit);

  console.log(`# Recall Context`);
  console.log(`Query: ${query}`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');
  if (!limited.length) {
    console.log('No matches.');
    return;
  }
  limited.forEach((result, idx) => {
    console.log(`## ${idx + 1}. ${result.title}`);
    console.log(`Source: ${result.path}:${result.startLine} (${result.type}, score ${result.score.toFixed(2)})`);
    console.log('');
    if (options.full) console.log(result.text.trim());
    else console.log(snippet(result.text, terms));
    console.log('');
  });
}

function show(id) {
  const index = loadIndex({ quietBuild: true });
  const doc = index.documents.find((item) => item.id === id);
  if (!doc) {
    console.error(`No chunk found for id: ${id}`);
    process.exitCode = 1;
    return;
  }
  console.log(`# ${doc.title}`);
  console.log(`Source: ${doc.path}:${doc.startLine}-${doc.endLine} (${doc.type})`);
  console.log('');
  console.log(doc.text.trim());
}

function stats() {
  const index = loadIndex();
  const byType = {};
  for (const doc of index.documents) byType[doc.type] = (byType[doc.type] || 0) + 1;
  console.log(JSON.stringify({
    version: index.version,
    generatedAt: index.generatedAt,
    fileCount: index.fileCount,
    documentCount: index.documentCount,
    vocabularySize: index.vocabularySize,
    byType,
  }, null, 2));
}

function usage() {
  console.log('Usage:');
  console.log('  node scripts/memory-recall.js build');
  console.log('  node scripts/memory-recall.js search "query" [limit] [--type TYPE] [--path TEXT] [--json]');
  console.log('  node scripts/memory-recall.js context "query" [limit] [--full]');
  console.log('  node scripts/memory-recall.js show "path#chunkNo"');
  console.log('  node scripts/memory-recall.js stats');
}

const [command, ...rawArgs] = process.argv.slice(2);
const { query, options } = parseArgs(rawArgs);

if (options.help) usage();
else if (command === 'build') build();
else if (command === 'search') search(query, options);
else if (command === 'context') context(query, options);
else if (command === 'show') show(query);
else if (command === 'stats') stats();
else usage();
