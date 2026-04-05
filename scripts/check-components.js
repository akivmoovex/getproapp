#!/usr/bin/env node
/**
 * Component usage check — baseline-aware for CI.
 *
 * ALLOWLIST: see previous sections in git history / README; paths in isBtnCheckAllowlisted,
 * isInputWarnAllowlisted below.
 *
 * Modes:
 * - --enforce-legacy-btn: fail (exit 1) if any raw <button>/<a> uses .btn / .btn--* outside
 *   allowlist (views/admin/**, design-system/** not scanned; ui_demo/ui_docs allowlisted).
 *   CI runs this for hard enforcement. System source: views/partials/components/button.ejs (exempt).
 * - Default: report all findings to stderr, exit 0.
 * - --json: stdout only — JSON report (for .ui-baseline.json).
 * - --compare-baseline <file>: diff vs baseline. Keys are file|rule|snippetHash (stable);
 *   v1 baselines (file|line|rule) still match via legacy keys until regenerated.
 * - CI=true + --compare-baseline: exit 1 only if NEW violations (not in baseline).
 *
 * Baseline JSON format / hashing: shared with check-css-boundaries.js (`scripts/checkBaselineShared.js`).
 */

const fs = require("fs");
const path = require("path");

const {
  REPORT_VERSION,
  KEY_SCHEMA,
  norm,
  relFromRoot,
  snippetHashFromSnippet,
  violationKey,
  legacyLineViolationKey,
  dedupeViolations,
  loadBaselineKeys,
} = require("./checkBaselineShared");

const repoRoot = path.join(__dirname, "..");
const viewsDir = path.join(repoRoot, "views");

const BUTTON_SOURCE = path.join(viewsDir, "partials", "components", "button.ejs");

/** Legacy .btn allowlist (admin, demos, docs). design-system/ is under repo root — not in views walk. */
function isBtnCheckAllowlisted(relPath) {
  if (relPath.startsWith("views/admin/")) return true;
  if (relPath === "views/ui_demo.ejs" || relPath === "views/ui_docs.ejs") return true;
  return false;
}

function isInputWarnAllowlisted(relPath) {
  if (relPath.startsWith("views/admin/")) return true;
  if (relPath.startsWith("design-system/")) return true;
  if (relPath === "views/ui_demo.ejs" || relPath === "views/ui_docs.ejs") return true;
  if (relPath === "views/join.ejs") return true;
  if (relPath.startsWith("views/partials/components/")) return true;
  if (relPath.startsWith("views/partials/admin_")) return true;
  if (relPath === "views/partials/crm_task_inner.ejs") return true;
  if (relPath === "views/partials/directory_empty_state.ejs") return true;
  return false;
}

function walkEjs(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const ent of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const p = path.join(rootDir, ent.name);
    if (ent.isDirectory()) out.push(...walkEjs(p));
    else if (ent.name.endsWith(".ejs")) out.push(p);
  }
  return out;
}

/** Strip block comments but keep newline structure so line numbers stay aligned with the source file. */
function stripCommentsPreserveNewlines(s) {
  let out = s.replace(/<%#[\s\S]*?-%>/g, (block) =>
    block.split(/\r?\n/).map((line) => " ".repeat(line.length)).join("\n")
  );
  out = out.replace(/<!--[\s\S]*?-->/g, (block) =>
    block.split(/\r?\n/).map((line) => " ".repeat(line.length)).join("\n")
  );
  return out;
}

function lineAtIndex(s, index) {
  return s.slice(0, index).split(/\r?\n/).length;
}

function classUsesBtnToken(classVal) {
  if (!classVal) return false;
  return classVal.split(/\s+/).some((t) => t === "btn" || t.startsWith("btn--"));
}

function extractClass(tag) {
  const dq = tag.match(/\bclass="([^"]*)"/is);
  if (dq) return dq[1];
  const sq = tag.match(/\bclass='([^']*)'/is);
  return sq ? sq[1] : "";
}

function snippetCompact(tag) {
  return tag.replace(/\s+/g, " ").trim().slice(0, 160);
}

function lintRawBtnOnTags(files) {
  const violations = [];
  const buttonRe = /<button\b[\s\S]*?>/gi;
  const anchorRe = /<a\b[\s\S]*?>/gi;
  const exempt = norm(BUTTON_SOURCE);

  for (const f of files) {
    const abs = norm(f);
    if (abs === exempt) continue;

    const rel = relFromRoot(repoRoot, f);
    if (isBtnCheckAllowlisted(rel)) continue;

    const raw = fs.readFileSync(f, "utf8");
    const scan = stripCommentsPreserveNewlines(raw);

    let m;
    buttonRe.lastIndex = 0;
    while ((m = buttonRe.exec(scan)) !== null) {
      const tag = m[0];
      if (!classUsesBtnToken(extractClass(tag))) continue;
      violations.push({
        rule: "raw-button-with-btn-class",
        severity: "warn",
        file: rel,
        line: lineAtIndex(scan, m.index),
        snippet: snippetCompact(tag),
      });
    }

    anchorRe.lastIndex = 0;
    while ((m = anchorRe.exec(scan)) !== null) {
      const tag = m[0];
      if (!classUsesBtnToken(extractClass(tag))) continue;
      violations.push({
        rule: "raw-anchor-with-btn-class",
        severity: "warn",
        file: rel,
        line: lineAtIndex(scan, m.index),
        snippet: snippetCompact(tag),
      });
    }
  }
  return violations;
}

function lintRawInputsPublic(files) {
  const violations = [];
  const inputRe = /<input\b[\s\S]*?>/gi;

  for (const f of files) {
    const rel = relFromRoot(repoRoot, f);
    if (isInputWarnAllowlisted(rel)) continue;

    const raw = fs.readFileSync(f, "utf8");
    const scan = stripCommentsPreserveNewlines(raw);
    let m;
    inputRe.lastIndex = 0;
    while ((m = inputRe.exec(scan)) !== null) {
      const tag = m[0];
      if (/\btype\s*=\s*["']hidden["']/i.test(tag)) continue;
      violations.push({
        rule: "raw-input-public-view",
        severity: "warn",
        file: rel,
        line: lineAtIndex(scan, m.index),
        snippet: snippetCompact(tag),
      });
    }
  }
  return violations;
}

function collectViolations() {
  const viewFiles = walkEjs(viewsDir);
  return dedupeViolations([...lintRawBtnOnTags(viewFiles), ...lintRawInputsPublic(viewFiles)]);
}

function parseArgs(argv) {
  const json = argv.includes("--json");
  const enforceLegacyBtn = argv.includes("--enforce-legacy-btn");
  let compareBaseline = null;
  const i = argv.indexOf("--compare-baseline");
  if (i !== -1 && argv[i + 1]) compareBaseline = path.resolve(repoRoot, argv[i + 1]);
  return { json, compareBaseline, enforceLegacyBtn };
}

function main() {
  const { json, compareBaseline, enforceLegacyBtn } = parseArgs(process.argv.slice(2));
  const isCi = process.env.CI === "true" || process.env.CI === "1";

  if (enforceLegacyBtn) {
    const viewFiles = walkEjs(viewsDir);
    const btnViolations = dedupeViolations(lintRawBtnOnTags(viewFiles));
    if (btnViolations.length) {
      console.error(`\n[check-components] ${btnViolations.length} legacy .btn <button>/<a> violation(s):\n`);
      for (const v of btnViolations) {
        console.error(`  ✖ ${v.rule}\n    ${v.file}:${v.line}\n    ${v.snippet}\n`);
      }
      console.error(
        "Use: <%- include('…/components/button', { variant, href?, label, … }) %>. Paths: partials → components/button; views root → partials/components/button; admin → ../partials/components/button.\n"
      );
      process.exit(1);
    }
    console.log("[check-components] Legacy .btn enforcement OK — 0 violations.");
    process.exit(0);
  }

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
      console.error(`[check-components] ${baseline.error}`);
      process.exit(isCi ? 1 : 0);
    }

    const baselineKeys = baseline.keys;
    function isViolationBaselined(v) {
      if (baselineKeys.has(violationKey(v))) return true;
      if (baselineKeys.has(legacyLineViolationKey(v))) return true;
      return false;
    }
    const newViolations = violations.filter((v) => !isViolationBaselined(v));

    if (newViolations.length) {
      console.error(`\n[check-components] ${newViolations.length} NEW violation(s) (not in baseline):\n`);
      for (const v of newViolations) {
        const label = v.rule === "raw-input-public-view" ? "input (public)" : v.rule;
        console.error(`  ✖ ${label}\n    ${v.file}:${v.line}\n    ${v.snippet}\n`);
      }
      console.error(
        "Fix or update baseline intentionally: npm run lint:components:baseline\nCTAs: use <%- include('…/components/button', { … }) %>.\n"
      );
    } else {
      console.log(
        `[check-components] Baseline OK — no new violations (${violations.length} current, ${baselineKeys.size} baseline keys).`
      );
    }

    if (isCi && newViolations.length) {
      process.exit(1);
    }
    process.exit(0);
  }

  /* Default: human-readable warnings, always exit 0 */
  if (violations.length) {
    console.warn(`\n[check-components] ${violations.length} finding(s) (warnings only, exit 0):\n`);
    for (const v of violations) {
      const label = v.rule === "raw-input-public-view" ? "input (public)" : v.rule;
      console.warn(`  ⚠ ${label}\n    ${v.file}:${v.line}\n    ${v.snippet}\n`);
    }
    console.warn(
      "CTAs: use <%- include('…/components/button', { … }) %>. CI: use lint:components:ci with .ui-baseline.json.\n"
    );
  } else {
    console.log("[check-components] OK — no findings.");
  }

  process.exit(0);
}

main();
