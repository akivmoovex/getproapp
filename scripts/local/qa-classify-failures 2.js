#!/usr/bin/env node
"use strict";

/**
 * Classify failing leaf assertions from a node:test TAP file.
 *
 * Groups by root cause so a morning QA pack can separate real V1 risk from
 * stale pins, environment gaps and known post-V1 debt.
 *
 * Usage: node scripts/local/qa-classify-failures.js <file.tap>
 */

const fs = require("fs");

const RULES = [
  {
    key: "STALE_CSS_PIN",
    label: "Stale CSS cache-buster pin (test asserts an exact ?v= number)",
    test: (b) => /should load .*CSS v\d+|css\?v=\d+|CSS version|cache-bust/i.test(b),
  },
  {
    key: "DB_UNAVAILABLE",
    label: "Local database not configured (route returns 503 / fixture unavailable)",
    test: (b) => /actual: 503|REQUIRES DATABASE|foundation fixture unavailable|PostgreSQL not configured|ECONNREFUSED|does not exist/i.test(b),
  },
  {
    key: "NEEDS_BROWSER",
    label: "Requires a real browser / screenshot baseline (Playwright)",
    test: (b) => /screenshot|playwright|visual|viewport matrix|browser QA/i.test(b),
  },
  {
    key: "LEGACY_V4_SURFACE",
    label: "Legacy V4 church surface (views/church/**, not the V7 website engine)",
    test: (b) => /views\/church\//i.test(b),
  },
  {
    key: "PLATFORM_ADMIN_STITCH",
    label: "Platform-admin Stitch/deployment literals (documented POST_V1)",
    test: (b) => /platform admin (dashboard|settings|deployments|deployment detail)|PLATFORM_ADMIN_NAV/i.test(b),
  },
];

function parse(file) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  const out = [];
  let pending = null;
  const flush = () => {
    if (pending && pending.type === "test" && pending.status === "not ok") out.push(pending);
    pending = null;
  };
  for (const line of lines) {
    const m = line.match(/^(\s*)(ok|not ok) (\d+) - (.*)$/);
    if (m) {
      flush();
      if (/#\s*SKIP/i.test(m[4])) continue;
      pending = { status: m[2], name: m[4].trim(), type: null, body: [] };
      continue;
    }
    if (pending) {
      const ty = line.match(/^\s*type: '(test|suite)'/);
      if (ty) {
        pending.type = ty[1];
        if (ty[1] === "suite") flush();
        continue;
      }
      pending.body.push(line);
    }
  }
  flush();
  return out;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: qa-classify-failures.js <file.tap>");
    process.exit(2);
  }
  const failures = parse(file);
  const groups = new Map();
  for (const f of failures) {
    const blob = f.name + "\n" + f.body.join("\n");
    const rule = RULES.find((r) => r.test(blob));
    const key = rule ? rule.key : "UNCLASSIFIED";
    if (!groups.has(key)) groups.set(key, []);
    const err = (blob.match(/error: '([^']{0,140})'/) || blob.match(/error: \|-\s*\n\s*(.{0,140})/) || [, ""])[1];
    const loc = (blob.match(/location: '[^']*\/(tests\/[^']+)'/) || [, ""])[1];
    groups.get(key).push({ name: f.name, err: (err || "").trim(), loc });
  }

  console.log(`total failing leaf assertions: ${failures.length}\n`);
  const order = [...RULES.map((r) => r.key), "UNCLASSIFIED"];
  for (const key of order) {
    const list = groups.get(key);
    if (!list || !list.length) continue;
    const rule = RULES.find((r) => r.key === key);
    console.log(`## ${key} — ${list.length}`);
    if (rule) console.log(`   ${rule.label}`);
    for (const f of list) {
      console.log(`   - ${f.name}`);
      if (f.loc) console.log(`       ${f.loc}`);
      if (f.err) console.log(`       error: ${f.err}`);
    }
    console.log();
  }
}

main();
