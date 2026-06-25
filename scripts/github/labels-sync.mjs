#!/usr/bin/env node
// labels-sync.mjs — sync a repo's GitHub labels to the canonical set in
// templates/github/labels.yml. Dependency-free (Node ESM + the `gh` CLI).
//
// apps3k keeps work-item metadata in Issue TYPES + org Issue FIELDS; LABELS only
// carry what those don't (above all `module:*`). This script makes a repo's labels
// match templates/github/labels.yml and can prune everything else.
//
// Usage:
//   node scripts/github/labels-sync.mjs [options]
//
// Options:
//   --repo <owner/repo>   Target repo (default: the current repo via `gh`).
//   --all-repos           Target every non-archived repo in the org.
//   --org <org>           Org for --all-repos (default: owner of the current repo).
//   --file <path>         Label source (default: templates/github/labels.yml).
//   --apply               Perform changes. WITHOUT this flag the run is a dry-run.
//   --prune               Also delete labels NOT in the canonical set.
//   --protect <p1,p2>     Never prune labels with these prefixes
//                         (default: "module:,product:,area:,autorelease:,agent:"). module:/
//                         product:* are managed by the issue-form-options-sync workflow;
//                         autorelease:* is release-please; agent:* is agent triage.
//   --yes                 Confirm deletions (required for --prune to actually delete).
//   -h, --help            Show this help.
//
// Safety: default is a read-only DRY RUN (prints the diff, changes nothing).
// `--apply` upserts the canonical labels. `--prune` deletes non-canonical labels —
// deleting a label removes it from every issue/PR — so it needs `--apply --prune --yes`.
//
// Examples:
//   node scripts/github/labels-sync.mjs                      # dry-run, current repo
//   node scripts/github/labels-sync.mjs --apply              # create/update labels
//   node scripts/github/labels-sync.mjs --all-repos          # org-wide inventory (dry-run)
//   node scripts/github/labels-sync.mjs --all-repos --apply --prune --yes  # org-wide cleanup

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

// Prefixes never pruned by default: module:/product:/area: are managed elsewhere
// (module:/product:* by the issue-form-options-sync workflow — from .github/modules.yaml and
// the PRODUCTS org variable), autorelease:* is owned by release-please, agent:* is the
// agent-triage scheme. Override with --protect.
const DEFAULT_PROTECT = 'module:,product:,area:,autorelease:,agent:';

/** Parse the simple labels.yml format (each value is a double-quoted string). */
function parseLabels(text) {
  const labels = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const name = trimmed.match(/^-\s*name:\s*"(.*)"\s*$/);
    if (name) { cur = { name: name[1], color: '', description: '' }; labels.push(cur); continue; }
    if (!cur) continue;
    const color = trimmed.match(/^color:\s*"(.*)"\s*$/);
    if (color) { cur.color = color[1]; continue; }
    const desc = trimmed.match(/^description:\s*"(.*)"\s*$/);
    if (desc) { cur.description = desc[1]; continue; }
  }
  return labels;
}

/** Run `gh` and return trimmed stdout; throws on non-zero exit. */
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8' }).trim();
}

/** Normalize a hex color for comparison (strip `#`, lower-case). */
const normColor = (c) => (c || '').replace(/^#/, '').toLowerCase();
/** Normalize a description for comparison (null/undefined → ""). */
const normDesc = (d) => (d || '').trim();

/**
 * Parse argv into a flat options object. Exits the process with code 2 on an
 * unknown flag. Booleans default false; --protect defaults to DEFAULT_PROTECT.
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{apply:boolean,prune:boolean,yes:boolean,allRepos:boolean,repo:string,org:string,file:string,protect:string,help?:boolean}}
 */
function parseArgs(argv) {
  const o = { apply: false, prune: false, yes: false, allRepos: false, repo: '', org: '', file: '', protect: DEFAULT_PROTECT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--prune') o.prune = true;
    else if (a === '--yes') o.yes = true;
    else if (a === '--all-repos') o.allRepos = true;
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--org') o.org = argv[++i];
    else if (a === '--file') o.file = argv[++i];
    else if (a === '--protect') o.protect = argv[++i];
    else if (a === '-h' || a === '--help') o.help = true;
    else { console.error(`Unknown argument: ${a}`); process.exit(2); }
  }
  return o;
}

/** Reconcile one repo's labels against the canonical set; returns counts. */
function syncRepo(repo, canonical, { apply, prune, yes, protect }) {
  const existing = JSON.parse(gh(['label', 'list', '--repo', repo, '--limit', '1000', '--json', 'name,color,description']));
  const byName = new Map(existing.map((l) => [l.name, l]));
  const canonicalNames = new Set(canonical.map((l) => l.name));
  const tag = apply ? '' : '[dry-run] ';
  let created = 0, updated = 0, deleted = 0, plannedDelete = 0, unchanged = 0;

  console.log(`\n## ${repo}`);
  for (const want of canonical) {
    const have = byName.get(want.name);
    if (!have) {
      console.log(`  ${tag}+ create  ${want.name}  #${normColor(want.color)}`);
      if (apply) gh(['label', 'create', want.name, '--repo', repo, '--color', want.color, '--description', want.description, '--force']);
      created++;
    } else if (normColor(have.color) !== normColor(want.color) || normDesc(have.description) !== normDesc(want.description)) {
      console.log(`  ${tag}~ update  ${want.name}`);
      if (apply) gh(['label', 'create', want.name, '--repo', repo, '--color', want.color, '--description', want.description, '--force']);
      updated++;
    } else {
      unchanged++;
    }
  }
  if (prune) {
    for (const have of existing) {
      if (canonicalNames.has(have.name)) continue;
      if (protect.some((p) => have.name.startsWith(p))) continue;
      const canDelete = apply && yes;
      console.log(`  ${canDelete ? '' : '[dry-run] '}- delete  ${have.name}`);
      // Count actual deletions in `deleted`; previews (dry-run / missing --yes) in
      // `plannedDelete` so totals never overstate what was really removed.
      if (canDelete) { gh(['label', 'delete', have.name, '--repo', repo, '--yes']); deleted++; }
      else plannedDelete++;
    }
  }
  const delText = plannedDelete ? `delete:${deleted} planned-delete:${plannedDelete}` : `delete:${deleted}`;
  console.log(`  → create:${created} update:${updated} ${delText} unchanged:${unchanged}`);
  return { created, updated, deleted, plannedDelete, unchanged };
}

/**
 * Entry point. Resolves the canonical label set and the target repo(s), then
 * reconciles each. Read-only unless --apply. Sets a non-zero exit code if any
 * repo fails. Requires the `gh` CLI to be authenticated.
 */
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    return;
  }
  if (opts.prune && !(opts.apply && opts.yes)) {
    console.error('Note: --prune lists deletions but only deletes with --apply --prune --yes.');
  }

  const file = opts.file || resolve(HERE, '../../templates/github/labels.yml');
  const canonical = parseLabels(readFileSync(file, 'utf8'));
  if (canonical.length === 0) { console.error(`No labels parsed from ${file}`); process.exit(1); }
  console.log(`Canonical labels (${canonical.length}) from ${file}`);

  let repos;
  if (opts.allRepos) {
    const org = opts.org || gh(['repo', 'view', '--json', 'owner', '--jq', '.owner.login']);
    repos = gh(['repo', 'list', org, '--no-archived', '--limit', '1000', '--json', 'nameWithOwner', '--jq', '.[].nameWithOwner']).split('\n').filter(Boolean);
  } else {
    repos = [opts.repo || gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])];
  }
  const protect = (opts.protect || '').split(',').map((s) => s.trim()).filter(Boolean);
  console.log(`Target repos: ${repos.length}${opts.apply ? '' : '  (DRY RUN — no changes)'}`);
  if (opts.prune && protect.length) console.log(`Protected prefixes (never pruned): ${protect.join(' ')}`);

  const totals = { created: 0, updated: 0, deleted: 0, plannedDelete: 0, unchanged: 0 };
  let failures = 0;
  for (const repo of repos) {
    try {
      const r = syncRepo(repo, canonical, { apply: opts.apply, prune: opts.prune, yes: opts.yes, protect });
      for (const k of Object.keys(totals)) totals[k] += r[k];
    } catch (e) {
      console.error(`  ! ${repo}: ${e.message.split('\n')[0]}`);
      failures++;
    }
  }
  const totalDel = totals.plannedDelete ? `delete:${totals.deleted} planned-delete:${totals.plannedDelete}` : `delete:${totals.deleted}`;
  console.log(`\nTOTAL  create:${totals.created} update:${totals.updated} ${totalDel} unchanged:${totals.unchanged}${opts.apply ? '' : '  (dry-run)'}`);
  // Non-zero exit so CI fails on partial reconciliation instead of reporting success.
  if (failures > 0) { console.error(`${failures} repo(s) failed.`); process.exitCode = 1; }
}

main();
