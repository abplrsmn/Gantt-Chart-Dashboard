#!/usr/bin/env node
/*
 * Supervised skill evolution pipeline for Projectia.
 *
 * Commands:
 * - node scripts/skill-evolution.js propose capex-project-input --query "capex project input rules" --description "Normalize CAPEX/project input from Telegram."
 * - node scripts/skill-evolution.js validate skill-proposals/<proposal>
 * - node scripts/skill-evolution.js list
 * - node scripts/skill-evolution.js approve skill-proposals/<proposal>
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const PROPOSALS_DIR = path.join(ROOT, 'skill-proposals');
const ACTIVE_SKILLS_DIR = path.join(ROOT, 'skills');
const RECALL_SCRIPT = path.join(ROOT, 'scripts', 'memory-recall.js');

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function parseArgs(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--query') options.query = args[++i];
    else if (arg === '--description') options.description = args[++i];
    else if (arg === '--limit') options.limit = args[++i];
    else if (arg === '--force') options.force = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else positional.push(arg);
  }
  return { positional, options };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}

function runRecall(query, limit = 8) {
  if (!fs.existsSync(RECALL_SCRIPT)) return 'Recall script not found.';
  const result = spawnSync(process.execPath, [RECALL_SCRIPT, 'context', query, '--limit', String(limit)], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return `Recall failed:\n${result.stderr || result.stdout}`;
  }
  return result.stdout.trim();
}

function skillTemplate({ name, description, query, contextPath }) {
  return `---\nname: ${name}\ndescription: "${description}"\n---\n\n# ${name}\n\nUse this skill when the request matches the description above.\n\n## Source Context\n\nReview \`${contextPath}\` before expanding this workflow. It contains the recall snippets used to draft this proposal.\n\n## Workflow\n\n1. Identify the user's intent and the target system or record.\n2. Retrieve relevant local context with \`npm run recall:context -- "${query}" --limit 5\` when the current session context is thin.\n3. Apply the project rules and safety constraints from the source context.\n4. Ask at most one concise clarification when a critical field is ambiguous.\n5. Execute the smallest safe action, then verify the observable result.\n6. Write meaningful durable notes to \`memory/YYYY-MM-DD.md\` when the workflow changes or produces reusable context.\n\n## Safety\n\n- Do not perform external writes, deploys, destructive actions, or authority-sensitive updates unless the user explicitly requested that action and the required fields are clear.\n- For critical operational workflows, treat this proposal as supervised until Abe approves it.\n- If source context conflicts with live files or current user instructions, prefer the newest explicit user instruction and document the conflict.\n\n## Smoke Test Ideas\n\n- Run recall for the trigger phrase and confirm the expected rule/source appears.\n- Test one clear input and one ambiguous input.\n- Confirm the ambiguous input asks only one short clarification.\n`;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function propose(args, options) {
  const rawName = args[0];
  if (!rawName) throw new Error('Missing skill name. Example: propose capex-project-input --query "capex rules"');
  const name = slugify(rawName);
  const query = options.query || rawName.replace(/-/g, ' ');
  const description = options.description || `${name.replace(/-/g, ' ')} workflow.`;
  const proposalDir = path.join(PROPOSALS_DIR, `${timestamp()}-${name}`);
  const referencesDir = path.join(proposalDir, 'references');
  ensureDir(referencesDir);

  const context = runRecall(query, options.limit || 8);
  const contextPath = 'references/recall-context.md';
  fs.writeFileSync(path.join(referencesDir, 'recall-context.md'), `${context}\n`);
  fs.writeFileSync(path.join(proposalDir, 'SKILL.md'), skillTemplate({ name, description, query, contextPath }));
  fs.writeFileSync(path.join(proposalDir, 'proposal.json'), JSON.stringify({
    name,
    status: 'proposed',
    createdAt: new Date().toISOString(),
    query,
    description,
    proposalDir: rel(proposalDir),
    approval: {
      required: true,
      reason: 'Skill evolution is supervised; proposals are not active until approved into skills/.',
    },
  }, null, 2) + '\n');

  console.log(`Created skill proposal: ${rel(proposalDir)}`);
  console.log(`Validate: node scripts/skill-evolution.js validate ${rel(proposalDir)}`);
}

function readSkill(skillDirOrFile) {
  const full = path.resolve(ROOT, skillDirOrFile || '');
  const skillFile = full.endsWith('SKILL.md') ? full : path.join(full, 'SKILL.md');
  if (!fs.existsSync(skillFile)) throw new Error(`Missing SKILL.md at ${skillFile}`);
  return { skillFile, text: fs.readFileSync(skillFile, 'utf8') };
}

function validateSkill(skillDirOrFile) {
  const { skillFile, text } = readSkill(skillDirOrFile);
  const errors = [];
  const warnings = [];

  if (!text.startsWith('---\n')) {
    errors.push('SKILL.md must start with YAML frontmatter.');
  }
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    errors.push('Missing closing frontmatter delimiter.');
  }

  const frontmatter = match ? match[1] : '';
  const name = (frontmatter.match(/^name:\s*([^\n]+)$/m) || [])[1];
  const descriptionLine = (frontmatter.match(/^description:\s*([^\n]+)$/m) || [])[1];
  if (!name) errors.push('Frontmatter needs name.');
  else if (name !== slugify(name)) errors.push(`Skill name should be slug-like lowercase: ${name}`);
  if (!descriptionLine) errors.push('Frontmatter needs description.');
  else if (!/^".*"$/.test(descriptionLine.trim())) warnings.push('Description should be quoted.');

  if (text.length > 6000) warnings.push('SKILL.md is getting long; move examples/docs to references/.');
  if (!/## Workflow/.test(text)) warnings.push('Consider adding a concise Workflow section.');
  if (!/## Safety/.test(text)) warnings.push('Consider adding Safety notes for operational skills.');

  return {
    path: rel(skillFile),
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validate(args, options) {
  const target = args[0];
  if (!target) throw new Error('Missing target. Example: validate skill-proposals/<proposal>');
  const result = validateSkill(target);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? 'OK' : 'FAIL'} ${result.path}`);
    for (const error of result.errors) console.log(`ERROR ${error}`);
    for (const warning of result.warnings) console.log(`WARN ${warning}`);
  }
  if (!result.ok) process.exitCode = 1;
}

function list() {
  ensureDir(PROPOSALS_DIR);
  const proposals = fs.readdirSync(PROPOSALS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(PROPOSALS_DIR, entry.name);
      const metaPath = path.join(dir, 'proposal.json');
      let meta = { name: entry.name, status: 'unknown' };
      if (fs.existsSync(metaPath)) meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return { ...meta, proposalDir: rel(dir) };
    });
  if (!proposals.length) {
    console.log('No skill proposals.');
    return;
  }
  for (const proposal of proposals) {
    console.log(`${proposal.status || 'unknown'}  ${proposal.name}  ${proposal.proposalDir}`);
  }
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'proposal.json') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function approve(args, options) {
  const proposal = args[0];
  if (!proposal) throw new Error('Missing proposal path. Example: approve skill-proposals/<proposal>');
  const proposalDir = path.resolve(ROOT, proposal);
  const metaPath = path.join(proposalDir, 'proposal.json');
  if (!fs.existsSync(metaPath)) throw new Error(`Missing proposal.json in ${proposalDir}`);
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const validation = validateSkill(proposalDir);
  if (!validation.ok) {
    console.log(JSON.stringify(validation, null, 2));
    throw new Error('Proposal is invalid; fix it before approval.');
  }
  const dest = path.join(ACTIVE_SKILLS_DIR, meta.name);
  if (fs.existsSync(dest) && !options.force) {
    throw new Error(`Active skill exists: ${rel(dest)}. Use --force to overwrite.`);
  }
  copyDir(proposalDir, dest);
  meta.status = 'approved';
  meta.approvedAt = new Date().toISOString();
  meta.activeSkillDir = rel(dest);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`Approved skill: ${rel(dest)}`);
}

function usage() {
  console.log('Usage:');
  console.log('  node scripts/skill-evolution.js propose <name> --query "recall query" --description "Quoted trigger description."');
  console.log('  node scripts/skill-evolution.js validate <proposal-or-skill-dir> [--json]');
  console.log('  node scripts/skill-evolution.js list');
  console.log('  node scripts/skill-evolution.js approve <proposal-dir> [--force]');
}

function main() {
  const [command, ...rawArgs] = process.argv.slice(2);
  const { positional, options } = parseArgs(rawArgs);
  if (options.help) return usage();
  if (command === 'propose') return propose(positional, options);
  if (command === 'validate') return validate(positional, options);
  if (command === 'list') return list();
  if (command === 'approve') return approve(positional, options);
  return usage();
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
