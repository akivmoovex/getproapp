#!/usr/bin/env node
/**
 * Detect CSS selectors that target system component roots (.c-search-bar, .c-button, .c-input, .c-card)
 * from a non-system ancestor (same semantics as stylelint getpro/no-ancestor-before-system-class).
 *
 * Modes:
 * - Default: print file:line + selector to stderr, exit 0 (warn only).
 * - --json: stdout JSON (for baseline file).
 * - --compare-baseline <file>: report NEW violations vs baseline; exit 1 in CI when new exist.
 *
 * Baseline keys: file|rule|snippetHash (v2), with legacy file|line|rule support.
 */

const fs = require("fs");
const path = require("path");
const postcss = require("postcss");
const selectorParser = require("postcss-selector-parser");

const repoRoot = path.join(__dirname, "..");
const REPORT_VERSION = 2;
const RULE_ID = "css-boundary-system-component";
const KEY_SCHEMA = "file|rule|snippetHash";

const IGNORE_REL = new Set([
  "public/design-system.css",
  "public/ds-framework.css",
]);

function norm(p) {
  return p.split(path.sep).join("/");
}

function relFromRoot(absPath) {
  return norm(path.relative(repoRoot, absPath));
}

function normalizeSnippetForHash(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hashString(s) {
  let h = 2166136261 >>> 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

function snippetHashFromSnippet(snippet) {
  return hashString(normalizeSnippetForHash(snippet));
}

function violationKey(v) {
  const h = snippetHashFromSnippet(v.snippet || "");
  return `${v.file}|${v.rule}|${h}`;
}

function legacyLineViolationKey(v) {
  return `${v.file}|${Number(v.line)}|${v.rule}`;
}

function stripCssCommentsPreserveNewlines(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.split(/\r?\n/).map((line) => " ".repeat(line.length)).join("\n")
  );
}

function lineAtIndex(s, index) {
  return s.slice(0, index).split(/\r?\n/).length;
}

function isSystemClassName(value) {
  return (
    value === "c-search-bar" ||
    value.startsWith("c-search-bar-") ||
    value === "c-button" ||
    value.startsWith("c-button--") ||
    value === "c-input" ||
    value.startsWith("c-input--") ||
    value === "c-card" ||
    value.startsWith("c-card__") ||
    value.startsWith("c-card--")
  );
}

function compoundHasSystemRoot(nodes) {
  return nodes.some((n) => n.type === "class" && isSystemClassName(n.value));
}

function isSystemOnlyCompound(nodes) {
  for (const n of nodes) {
    if (n.type === "class" && isSystemClassName(n.value)) continue;
    if (n.type === "class") return false;
    if (n.type === "comment") continue;
    if (n.type === "combinator") continue;
    if (n.type === "universal") continue;
    if (n.type === "tag" && (n.value === "html" || n.value === "body")) continue;
    if (n.type === "pseudo" && (n.value === ":root" || n.value === "::root")) continue;
    return false;
  }
  return true;
}

function splitSelectorIntoCompounds(selector) {
  const compounds = [];
  let current = [];
  selector.each((node) => {
    if (node.type === "combinator") {
      compounds.push(current);
      current = [];
    } else {
      current.push(node);
    }
  });
  compounds.push(current);
  return compounds;
}

function findViolationsInSelectorString(selectorString) {
  const bad = [];
  let ast;
  try {
    ast = selectorParser().astSync(selectorString);
  } catch {
    return bad;
  }

  ast.each((selector) => {
    const compounds = splitSelectorIntoCompounds(selector);
    compounds.forEach((compound, i) => {
      if (!compoundHasSystemRoot(compound)) return;
      if (i === 0) return;
      if (!isSystemOnlyCompound(compounds[i - 1])) {
        bad.push(selectorString.trim());
      }
    });
  });
  return bad;
}

function walkCssFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkCssFiles(p, out);
    else if (ent.name.endsWith(".css")) out.push(p);
  }
  return out;
}

function collectViolations() {
  const publicCssDir = path.join(repoRoot, "public");
  const files = walkCssFiles(publicCssDir);
  const violations = [];

  for (const abs of files) {
    const rel = relFromRoot(abs);
    if (IGNORE_REL.has(rel)) continue;

    let raw;
    try {
      raw = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }

    const scan = stripCssCommentsPreserveNewlines(raw);
    let root;
    try {
      root = postcss.parse(scan, { from: abs });
    } catch (e) {
      console.warn(`[check-css-boundaries] Skip parse error ${rel}: ${e.message}`);
      continue;
    }

    root.walkRules((rule) => {
      const sel = rule.selector;
      if (!sel || sel.includes("/*")) return;

      const ruleStart = rule.source && rule.source.start;
      const line = ruleStart ? ruleStart.line : lineAtIndex(scan, 0);

      const badSelectors = findViolationsInSelectorString(sel);
      for (const snippet of badSelectors) {
        violations.push({
          rule: RULE_ID,
          severity: "warn",
          file: rel,
          line,
          snippet,
        });
      }
    });
  }

  return dedupeViolations(violations);
}

function dedupeViolations(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const k = violationKey(v);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function loadBaselineKeys(baselinePath) {
  if (!fs.existsSync(baselinePath)) {
    return { ok: false, keys: new Set(), error: `Baseline file not found: ${baselinePath}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  } catch (e) {
    return { ok: false, keys: new Set(), error: `Invalid baseline JSON: ${e.message}` };
  }
  const rows = parsed.violations || [];
  const keys = new Set();
  const version = Number(parsed.version) || 1;

  for (const v of rows) {
    if (v.file == null || v.rule == null) continue;

    const storedHash =
      typeof v.snippetHash === "string" && /^[0-9a-f]{8}$/i.test(v.snippetHash)
        ? v.snippetHash.toLowerCase()
        : null;
    if (storedHash) {
      keys.add(`${v.file}|${v.rule}|${storedHash}`);
    } else if (v.snippet != null && String(v.snippet).trim() !== "") {
      keys.add(`${v.file}|${v.rule}|${snippetHashFromSnippet(v.snippet)}`);
    }

    if (version < 2 && v.line != null) {
      keys.add(legacyLineViolationKey(v));
    }
  }
  return { ok: true, keys, error: null };
}

function parseArgs(argv) {
  const json = argv.includes("--json");
  let compareBaseline = null;
  const i = argv.indexOf("--compare-baseline");
  if (i !== -1 && argv[i + 1]) compareBaseline = path.resolve(repoRoot, argv[i + 1]);
  return { json, compareBaseline };
}

function main() {
  const { json, compareBaseline } = parseArgs(process.argv.slice(2));
  const isCi = process.env.CI === "true" || process.env.CI === "1";

  const violations = collectViolations();

  if (json) {
    const payload = {
      version: REPORT_VERSION,
      keySchema: KEY_SCHEMA,
      generatedAt: new Date().toISOString(),
      violations: violations.map((v) => {
        const snippetHash = snippetHashFromSnippet(v.snippet || "");
        return {
          file: v.file,
          rule: v.rule,
          line: v.line,
          snippet: v.snippet,
          snippetHash,
        };
      }),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(0);
  }

  if (compareBaseline) {
    const baseline = loadBaselineKeys(compareBaseline);
    if (!baseline.ok) {
      console.error(`[check-css-boundaries] ${baseline.error}`);
      process.exit(isCi ? 1 : 0);
    }

    const baselineKeys = baseline.keys;
    function isBaselined(v) {
      if (baselineKeys.has(violationKey(v))) return true;
      if (baselineKeys.has(legacyLineViolationKey(v))) return true;
      return false;
    }
    const newViolations = violations.filter((v) => !isBaselined(v));

    if (newViolations.length) {
      console.error(`\n[check-css-boundaries] ${newViolations.length} NEW violation(s) (not in baseline):\n`);
      for (const v of newViolations) {
        console.error(`  ✖ ${v.file}:${v.line}\n    selector: ${v.snippet}\n`);
      }
      console.error(
        "Move styles under .c-search-bar / .c-button / .c-input / .c-card (or system-only ancestors). Update baseline only if intentional: npm run lint:css-boundaries:baseline\n"
      );
    } else {
      console.log(
        `[check-css-boundaries] Baseline OK — no new violations (${violations.length} current, ${baselineKeys.size} baseline keys).`
      );
    }

    if (isCi && newViolations.length) {
      process.exit(1);
    }
    process.exit(0);
  }

  if (violations.length) {
    console.warn(`\n[check-css-boundaries] ${violations.length} finding(s) (warnings only, exit 0):\n`);
    for (const v of violations) {
      console.warn(`  ⚠ ${v.file}:${v.line}\n    selector: ${v.snippet}\n`);
    }
    console.warn(
      "CI: npm run lint:css-boundaries:ci (requires .css-boundaries-baseline.json). Stylelint: npm run lint:css\n"
    );
  } else {
    console.log("[check-css-boundaries] OK — no external ancestor selectors on system component roots.");
  }

  process.exit(0);
}

main();
