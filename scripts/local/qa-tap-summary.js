#!/usr/bin/env node
"use strict";

/**
 * Summarize a node:test TAP file into failing leaf tests, skips and totals.
 *
 * Top-level `not ok` entries are suite files (roll-ups of their children); the
 * indented ones are the actual assertions. Reporting only leaves avoids
 * double-counting a failure once as a subtest and again as its parent suite.
 *
 * Usage: node scripts/local/qa-tap-summary.js <file.tap> [--json] [--names]
 */

const fs = require("fs");

function parse(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const failures = [];
  const skips = [];
  const totals = {};

  // A `not ok` entry is only a real failure if its YAML block says
  // `type: 'test'`. Entries with `type: 'suite'` are roll-ups of their children
  // and would double-count. Suite files appear at indent 0 with type 'suite'.
  let pending = null;
  let suitePath = [];

  const flush = () => {
    if (!pending) return;
    if (pending.type === "test" && pending.status === "not ok") {
      failures.push({ suite: pending.parent, name: pending.name });
    }
    pending = null;
  };

  for (const line of lines) {
    const m = line.match(/^(\s*)(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      flush();
      const indent = m[1].length;
      const raw = m[4];
      const name = raw.replace(/\s*#\s*(SKIP|TODO).*$/i, "").trim();
      if (/#\s*SKIP/i.test(raw)) {
        skips.push({
          suite: suitePath[suitePath.length - 1] || null,
          name,
          reason: (raw.match(/#\s*SKIP\s*(.*)$/i) || [, ""])[1],
        });
        continue;
      }
      pending = {
        indent,
        status: m[2],
        name,
        type: null,
        parent: suitePath[suitePath.length - 1] || null,
      };
      continue;
    }

    const ty = line.match(/^\s*type: '(test|suite)'/);
    if (ty && pending) {
      pending.type = ty[1];
      if (ty[1] === "suite") {
        // Track suite names by depth so children report a useful parent.
        const depth = Math.floor(pending.indent / 4);
        suitePath = suitePath.slice(0, depth);
        suitePath.push(pending.name);
      }
      flush();
      continue;
    }

    const t = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$/);
    if (t) {
      flush();
      totals[t[1]] = Number(t[2]);
    }
  }
  flush();
  return { failures, skips, totals };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: qa-tap-summary.js <file.tap> [--json] [--names]");
    process.exit(2);
  }
  const { failures, skips, totals } = parse(file);

  if (process.argv.includes("--names")) {
    // Stable, comparable identity for diffing two runs.
    for (const f of failures.slice().sort((a, b) => (a.name < b.name ? -1 : 1))) {
      console.log(f.name);
    }
    return;
  }

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ totals, failures, skips }, null, 2));
    return;
  }

  console.log(`totals: ${JSON.stringify(totals)}`);
  console.log(`\nfailing leaf assertions (${failures.length}):`);
  const bySuite = new Map();
  for (const f of failures) {
    if (!bySuite.has(f.suite)) bySuite.set(f.suite, []);
    bySuite.get(f.suite).push(f.name);
  }
  for (const [suite, names] of bySuite) {
    console.log(`\n  ${suite}`);
    for (const n of names) console.log(`    - ${n}`);
  }

  const reasons = new Map();
  for (const s of skips) {
    const key = s.reason.replace(/[0-9a-f]{8,}/g, "<id>").slice(0, 90) || "(no reason)";
    reasons.set(key, (reasons.get(key) || 0) + 1);
  }
  console.log(`\nskips (${skips.length}) by reason:`);
  for (const [r, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${r}`);
  }
}

main();
