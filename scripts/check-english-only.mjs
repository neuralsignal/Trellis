#!/usr/bin/env node
/**
 * Fork guard: nothing that ships, and no fork-facing doc, may contain CJK text.
 *
 * `neuralsignal/Trellis` is English-only. The rule covers what a consuming
 * project actually receives — templates, runtime source, and the migration
 * manifests whose text prints during `trellis update` — plus the docs a reader
 * of this fork lands on.
 *
 * Tests and `.trellis/tasks/archive/**` are excluded on purpose. Neither reaches
 * a consumer, and purging them would conflict on every `git merge upstream/main`.
 * That boundary lives here, in the guard, rather than in prose someone has to find.
 *
 * Usage: node scripts/check-english-only.js
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const INCLUDE = [
  "packages/cli/src/templates/",
  "packages/core/src/",
  "packages/cli/src/migrations/",
  ".github/",
];

/** Root-level docs are included by exact name, not by prefix. */
const ROOT_DOCS = /^[^/]+\.md$/;

const EXCLUDE = [/(^|\/)test\//, /(^|\/)__tests__\//, /\.test\.[cm]?[jt]sx?$/];

const CJK =
  /[㐀-䶿一-鿿豈-﫿぀-ヿｦ-ﾟ]/u;

function tracked() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf-8" })
    .split("\0")
    .filter(Boolean);
}

function inScope(file) {
  if (EXCLUDE.some((re) => re.test(file))) return false;
  return ROOT_DOCS.test(file) || INCLUDE.some((dir) => file.startsWith(dir));
}

const offenders = [];
for (const file of tracked().filter(inScope)) {
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    continue; // unreadable as UTF-8 text: binary, not our concern
  }
  text.split("\n").forEach((line, i) => {
    if (CJK.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
  });
}

if (offenders.length > 0) {
  console.error(`CJK text found in ${offenders.length} place(s):\n`);
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    "\nThis fork is English-only in everything that ships. Translate the text,",
  );
  console.error("or widen the EXCLUDE list here if the path genuinely cannot reach a user.");
  process.exit(1);
}

console.log(`ok english-only: scanned ${tracked().filter(inScope).length} file(s), no CJK.`);
