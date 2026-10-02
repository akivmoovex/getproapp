"use strict";

/**
 * Lightweight V10 dependency-direction scanner (PC15).
 *
 * DENY (except allowlists):
 *   src/platform → blessboard | church | activeclinic
 *   src/blessboard → activeclinic
 *   src/activeclinic → blessboard | church
 *
 * ALLOW:
 *   product → platform
 *   product bootstrap/adapters registering into platform contracts
 *   BB → church (same product family / legacy church package)
 */

const fs = require("fs");
const path = require("path");
const {
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
  CROSS_PRODUCT_REQUIRE_ALLOWLIST,
} = require("./dependencyDirectionAllowlists");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");

const REQUIRE_RE = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

function walkJsFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.includes(" 2.") || ent.name.includes(" 3.")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJsFiles(full, acc);
    else if (ent.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function relSrc(absPath) {
  return path.relative(SRC_ROOT, absPath).split(path.sep).join("/");
}

function collectRequires(absFile) {
  const text = fs.readFileSync(absFile, "utf8");
  const hits = [];
  REQUIRE_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRE_RE.exec(text))) hits.push(m[1]);
  return hits;
}

function matchesProductImpl(reqPath, productNeedle) {
  const n = String(reqPath || "").replace(/\\/g, "/");
  if (productNeedle === "church") {
    return (
      /(^|\/)church\//.test(n) ||
      n.includes("../church/") ||
      n.includes("/church/")
    );
  }
  return n.includes(productNeedle);
}

/**
 * @returns {{ ok: true } | { ok: false, offenders: Array<{ file: string, hits: string[], rule: string }> }}
 */
function scanPlatformToProduct() {
  const allow = new Set(PLATFORM_PRODUCT_REQUIRE_ALLOWLIST);
  const platformRoot = path.join(SRC_ROOT, "platform");
  const offenders = [];
  for (const file of walkJsFiles(platformRoot)) {
    const rel = path.relative(platformRoot, file).split(path.sep).join("/");
    const hits = collectRequires(file).filter(
      (r) =>
        matchesProductImpl(r, "blessboard") ||
        matchesProductImpl(r, "church") ||
        matchesProductImpl(r, "activeclinic")
    );
    if (!hits.length) continue;
    if (allow.has(rel)) continue;
    offenders.push({
      file: `platform/${rel}`,
      hits: [...new Set(hits)],
      rule: "DENY platform → product implementation (use productRuntimeRegistry / adapters)",
    });
  }
  return offenders.length ? { ok: false, offenders } : { ok: true, offenders: [] };
}

function crossAllowKey(sourceRel, reqPath) {
  const n = String(reqPath || "").replace(/\\/g, "/");
  for (const entry of CROSS_PRODUCT_REQUIRE_ALLOWLIST) {
    const [src, needle] = entry.split("|");
    if (sourceRel === src && n.includes(needle)) return true;
  }
  return false;
}

/**
 * BB must not require AC; AC must not require BB or church (except allowlist).
 */
function scanCrossProduct() {
  const offenders = [];

  for (const file of walkJsFiles(path.join(SRC_ROOT, "blessboard"))) {
    const rel = relSrc(file);
    const hits = collectRequires(file).filter((r) => matchesProductImpl(r, "activeclinic"));
    const bad = hits.filter((r) => !crossAllowKey(rel, r));
    if (bad.length) {
      offenders.push({
        file: rel,
        hits: [...new Set(bad)],
        rule: "DENY BlessBoard → ActiveClinic implementation",
      });
    }
  }

  for (const file of walkJsFiles(path.join(SRC_ROOT, "activeclinic"))) {
    const rel = relSrc(file);
    const hits = collectRequires(file).filter(
      (r) => matchesProductImpl(r, "blessboard") || matchesProductImpl(r, "church")
    );
    const bad = hits.filter((r) => !crossAllowKey(rel, r));
    if (bad.length) {
      offenders.push({
        file: rel,
        hits: [...new Set(bad)],
        rule: "DENY ActiveClinic → BlessBoard/church implementation",
      });
    }
  }

  return offenders.length ? { ok: false, offenders } : { ok: true, offenders: [] };
}

function formatOffenders(offenders) {
  return offenders
    .map((o) => ` - [${o.rule}]\n   ${o.file}\n   requires: ${o.hits.join(", ")}`)
    .join("\n");
}

function assertDependencyDirection() {
  const platform = scanPlatformToProduct();
  const cross = scanCrossProduct();
  const offenders = [...platform.offenders, ...cross.offenders];
  if (!offenders.length) {
    return {
      ok: true,
      platformAllowlistSize: PLATFORM_PRODUCT_REQUIRE_ALLOWLIST.length,
      crossAllowlistSize: CROSS_PRODUCT_REQUIRE_ALLOWLIST.length,
    };
  }
  const err = new Error(
    `Architecture dependency direction violated:\n${formatOffenders(offenders)}\n` +
      `Register a justified exception in scripts/architecture/dependencyDirectionAllowlists.js ` +
      `or route through platform contracts/adapters.`
  );
  err.offenders = offenders;
  throw err;
}

function main() {
  try {
    const result = assertDependencyDirection();
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          platformAllowlistSize: result.platformAllowlistSize,
          crossAllowlistSize: result.crossAllowlistSize,
        },
        null,
        2
      ) + "\n"
    );
    process.exitCode = 0;
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err) + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  scanPlatformToProduct,
  scanCrossProduct,
  assertDependencyDirection,
  formatOffenders,
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
  CROSS_PRODUCT_REQUIRE_ALLOWLIST,
  walkJsFiles,
};

if (require.main === module) {
  main();
}
