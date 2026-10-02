"use strict";

/**
 * V10 DBCL07 — Registration status canonicalization.
 * Historical application-status aliases must have zero runtime branches.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const SCAN_DIRS = [
  "src/platform/registration",
  "src/blessboard/registration",
  "src/blessboard/services",
  "src/blessboard/repositories",
  "src/activeclinic/registration",
  "src/activeclinic/services",
  "src/platform/services",
  "src/platform/repositories",
];

const SCAN_FILES = [
  "src/activeclinic/http/activeClinicPublicRoutes.js",
];

/** Evidence / presentation tokens that are not application-status branches. */
const ALLOW_SUBSTRINGS = Object.freeze([
  "duplicate_review_evidence",
  "held_for_duplicate_review",
  "approved_for_provision",
  "DBCL07",
  "historical",
  "legacy aliases",
  "PUBLIC_STATE.APPROVED",
  'APPROVED: "approved"',
  "APPROVED: 'approved'",
  'WITHDRAWN: "withdrawn"',
  "WITHDRAWN: 'withdrawn'",
  'DUPLICATE_RECORDED: "duplicate_recorded"',
  // Phase 5 visible filter key (presentation), not stored application_status
  'APPROVED: "approved"',
  'PHASE5_VISIBLE.APPROVED',
  'visible_status: "approved"',
  'key: PHASE5_VISIBLE.APPROVED',
  'WORKFLOW_STATUSES',
  // Frozen BB legacy status column comments / CHECK docs
  "pending/contacted/closed",
  "legacyStatus",
  "legacy_status",
]);

const FORBIDDEN = Object.freeze([
  {
    id: "pending_review_app_status",
    re: /(?:status|application_status|applicationStatus)\s*(?:===|==|!==|!=)\s*['"]pending_review['"]|['"]pending_review['"]\s*(?:===|==)|IN\s*\([^)]*['"]pending_review['"]|status:\s*['"]pending_review['"]|status\s*=\s*['"]pending_review['"]/i,
  },
  {
    id: "duplicate_review_app_status",
    re: /(?:status|application_status|applicationStatus)\s*(?:===|==|!==|!=)\s*['"]duplicate_review['"]|['"]duplicate_review['"]\s*(?:===|==)|IN\s*\([^)]*['"]duplicate_review['"]|application_status\s*=\s*['"]duplicate_review['"]|applicationStatus:\s*['"]duplicate_review['"]/i,
  },
  {
    id: "closed_app_status",
    re: /(?:application_status|applicationStatus)\s*(?:===|==|!==|!=)\s*['"]closed['"]|IN\s*\([^)]*['"]closed['"][^)]*\)|application_status\s+IN\s*\([^)]*closed/i,
  },
  {
    id: "cancelled_app_status",
    re: /(?:application_status|applicationStatus)\s*(?:===|==|!==|!=)\s*['"]cancelled['"]|IN\s*\([^)]*['"]cancelled['"]/i,
  },
  {
    id: "approved_app_status",
    re: /(?:\bstatus|\bapplication_status|\bapplicationStatus)\s*(?:===|==|!==|!=)\s*['"]approved['"]|status\s+IN\s*\([^)]*['"]approved['"]|status\s+IN\s*\([^)]*approved/i,
  },
  {
    id: "withdrawn_app_status",
    re: /(?:\bstatus|\bapplication_status|\bapplicationStatus)\s*(?:===|==|!==|!=)\s*['"]withdrawn['"]|status\s+NOT\s+IN\s*\([^)]*['"]withdrawn['"]|status\s+IN\s*\([^)]*['"]withdrawn['"]/i,
  },
]);

function listJsFiles(relDir) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && ent.name.endsWith(".js")) out.push(full);
    }
  };
  walk(abs);
  return out;
}

function isRegistrationScoped(rel) {
  const base = path.basename(rel);
  if (/websiteChange|websitePublish|websitePublication|websiteOverview|memberRegistration|memberJourney|messageService|pastoralCare|contentAdmin|churchWebsite/i.test(rel)) {
    return false;
  }
  if (/registration|Registration|provision|Provision|lifecycle|orchestrat|onboard|queue|statusCompat|clinicRegistr|ChurchRegistr|platformAdminOps|platformAdminRepository|platformAdminRegistration|approveClinic|submitClinic|activeClinicPublicOnboarding|activeClinicPublicRoutes|tenantHealth|unifiedRegistration/i.test(rel + base)) {
    return true;
  }
  return false;
}

function lineAllowed(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    // Still scan non-comment code; comments alone with forbidden tokens are OK
    if (/^\s*(\/\/|\*|\/\*)/.test(line) && !/[=:(]/.test(line.replace(/['"][^'"]*['"]/g, ""))) {
      return true;
    }
  }
  return ALLOW_SUBSTRINGS.some((token) => line.includes(token));
}

function scanFile(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join("/");
  if (!isRegistrationScoped(rel)) return [];
  // Presentation workflow labels may include "approved"/"closed" as derived UI keys
  if (
    rel.endsWith("registrationQueuePresentation.js") ||
    rel.endsWith("registrationApplicationsAdminService.js") ||
    rel.endsWith("clinicRegistrationApplicantStatusService.js") ||
    rel.endsWith("platformChurchRegistrationRepository.js")
  ) {
    // Still scan, but WORKFLOW_STATUSES / PHASE5 / deriveWorkflow returns are presentation
  }
  const text = fs.readFileSync(absPath, "utf8");
  const lines = text.split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (lineAllowed(line)) continue;
    // Skip WORKFLOW_STATUSES array entries and PHASE5 presentation maps
    if (/^\s*"(approved|closed)",?\s*$/.test(line)) continue;
    if (/return\s+"(approved|closed)"/.test(line) && /workflow|deriveWorkflow|WORKFLOW/i.test(text.slice(Math.max(0, text.indexOf(line) - 200), text.indexOf(line)))) {
      continue;
    }
    if (/PHASE5_VISIBLE|presentPhase5|visible_status|workflowStatus|deriveWorkflow/.test(line)) continue;
    for (const rule of FORBIDDEN) {
      if (rule.re.test(line)) {
        hits.push({ file: rel, line: i + 1, rule: rule.id, text: line.trim().slice(0, 160) });
      }
    }
  }
  return hits;
}

describe("V10 DBCL07 registration status cleanup", () => {
  it("statusCompatibility module deleted (DBCL10)", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/registration/statusCompatibility.js")),
      false
    );
    const index = fs.readFileSync(
      path.join(ROOT, "src/platform/registration/index.js"),
      "utf8"
    );
    assert.doesNotMatch(index, /statusCompatibility/);
  });

  it("LIFECYCLE has no approved alias", () => {
    const { LIFECYCLE } = require("../src/platform/registration/constants");
    assert.equal(LIFECYCLE.APPROVED, undefined);
    assert.equal(LIFECYCLE.REVIEW_REQUIRED, "review_required");
    assert.equal(LIFECYCLE.ACTIVE, "active");
  });

  it("LEGACY_STATUS_RUNTIME_BRANCHES is 0", () => {
    const files = new Set();
    for (const dir of SCAN_DIRS) {
      for (const f of listJsFiles(dir)) files.add(f);
    }
    for (const rel of SCAN_FILES) files.add(path.join(ROOT, rel));

    const hits = [];
    for (const f of files) hits.push(...scanFile(f));

    if (hits.length) {
      console.error("LEGACY_STATUS_RUNTIME_BRANCHES hits:\n" + hits.map((h) => `${h.file}:${h.line} [${h.rule}] ${h.text}`).join("\n"));
    }
    assert.equal(hits.length, 0, `LEGACY_STATUS_RUNTIME_BRANCHES: ${hits.length}`);
    console.log("LEGACY_STATUS_RUNTIME_BRANCHES: 0");
    console.log("DBCL07_REGISTRATION_STATUS_CLEANUP_PASS");
  });
});
