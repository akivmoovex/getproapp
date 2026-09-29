#!/usr/bin/env node
"use strict";

/**
 * Parse canonical Phase A TAP log → root-cause failure map.
 * Usage: node scripts/qa/classify-canonical-failures.js /tmp/v203-canonical-phase-a/full-suite.log
 */

const fs = require("fs");
const path = require("path");

const logPath = process.argv[2] || "/tmp/v203-canonical-phase-a/full-suite.log";
const outPath =
  process.argv[3] || path.join(path.dirname(logPath), "failure-classification.json");

function unwrapPg(err) {
  const m = String(err || "").match(/^Local PostgreSQL unavailable:\s*(.*)$/i);
  return m ? m[1].trim() : String(err || "");
}

function normalizeSig(s) {
  return String(s || "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d+\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function productOf(file) {
  const f = String(file || "").toLowerCase();
  if (!f) return "UNKNOWN";
  if (f.includes("activeclinic") || f.startsWith("tests/v7-activeclinic")) return "AC";
  if (
    f.includes("blessboard") ||
    f.startsWith("tests/church-") ||
    f.includes("v7-bb") ||
    f.includes("v7-blessboard") ||
    f.startsWith("tests/v8-bb")
  )
    return "BB";
  if (
    f.startsWith("tests/platform-") ||
    f.startsWith("tests/v8-") ||
    f.startsWith("tests/v10-") ||
    f.startsWith("tests/db-") ||
    f.startsWith("tests/migration-") ||
    f.startsWith("tests/v203-local-postgres")
  )
    return "PLATFORM";
  if (f.startsWith("tests/v203-") || f.startsWith("tests/v2-") || f.startsWith("tests/v7-") || f.startsWith("tests/shared-"))
    return "CROSS_PRODUCT";
  if (f.startsWith("tests/admin-") || f.startsWith("tests/field-agent")) return "INFRA";
  return "CROSS_PRODUCT";
}

function classify(inner, err, file, name) {
  const e = `${inner} ${err} ${name}`.toLowerCase();
  const raw = inner || err || "";

  if (e.includes("postgres.app rejected") && e.includes("trust")) {
    return {
      rc: "RC_ENV_PG_TRUST_REJECTED",
      cls: "ENVIRONMENT",
      severity: "P2",
      layer: "test_db_auth",
      signature: 'Postgres.app rejected "trust" authentication',
    };
  }
  if (e.includes("branch_name") && (e.includes("not null") || e.includes("null value"))) {
    return {
      rc: "RC01_BRANCH_NAME_NOT_NULL",
      cls: "FIXTURE_DRIFT",
      severity: "P2",
      layer: "fixture",
      signature: "branch_name NOT NULL",
    };
  }
  if (e.includes("user_role_assignments_revoked_consistency")) {
    return {
      rc: "RC02_REVOKED_CONSISTENCY",
      cls: "FIXTURE_DRIFT",
      severity: "P2",
      layer: "fixture",
      signature: "user_role_assignments_revoked_consistency",
    };
  }
  if (e.includes("user_role_assignments_active_scope_uidx")) {
    return {
      rc: "RC03_ACTIVE_SCOPE_UIDX",
      cls: "FIXTURE_DRIFT",
      severity: "P2",
      layer: "fixture",
      signature: "user_role_assignments_active_scope_uidx",
    };
  }
  if (/\?v=\d+/.test(raw) || (e.includes(".css?v=") && e.includes("match"))) {
    return {
      rc: "RC10_CSS_FINGERPRINT",
      cls: "STALE_TEST",
      severity: "TEST_DEBT_ONLY",
      layer: "ui_contract",
      signature: "stale CSS ?v= fingerprint",
    };
  }
  if (e.includes("acceptterms") || (e.includes("registration_consent") && e.includes("include"))) {
    return {
      rc: "RC_AC_CONSENT_FIELD",
      cls: "STALE_TEST",
      severity: "TEST_DEBT_ONLY",
      layer: "form_contract",
      signature: "acceptTerms vs registration_consent",
    };
  }
  if (e.includes("content library") || e.includes("image library")) {
    return {
      rc: "RC06_LIBRARY_LABEL",
      cls: "STALE_TEST",
      severity: "TEST_DEBT_ONLY",
      layer: "ui_copy",
      signature: "Content Library vs Image Library",
    };
  }
  if (e.includes("platform_line_host_mismatch") || e.includes("platformline")) {
    return {
      rc: "RC12_PLATFORM_LINE_HOST",
      cls: "ENVIRONMENT",
      severity: "P2",
      layer: "host_registry",
      signature: "PLATFORM_LINE_HOST_MISMATCH",
    };
  }
  if (e.includes("unexpected_deployments")) {
    return {
      rc: "RC11_FOUNDATION_VERIFY",
      cls: "FIXTURE_DRIFT",
      severity: "P3",
      layer: "foundation_verify",
      signature: "unexpected_deployments",
    };
  }
  if (e.includes("subscription_inactive")) {
    return {
      rc: "RC_APP_SUBSCRIPTION_INACTIVE_GRANT",
      cls: "APPLICATION_DEFECT",
      severity: "P1",
      layer: "rbac_entitlement",
      signature: "subscription_inactive on role grant",
    };
  }
  if (e.includes("user_roles") && (e.includes("freeze") || e.includes("trigger") || e.includes("read-only"))) {
    return {
      rc: "RC04_USER_ROLES_FREEZE",
      cls: "APPLICATION_DEFECT",
      severity: "P1",
      layer: "rbac_migration",
      signature: "legacy user_roles freeze trigger",
    };
  }
  if (
    e.includes("expected 200") ||
    e.includes("expected 301") ||
    e.includes("expected 302") ||
    e.includes("expected 303") ||
    e.includes("expected 400") ||
    e.includes("expected 403") ||
    e.includes("expected 404") ||
    e.includes("status code")
  ) {
    const securityish =
      e.includes("403") ||
      e.includes("401") ||
      e.includes("tenant") ||
      e.includes("forbidden") ||
      e.includes("cross-tenant") ||
      e.includes("unauthorized");
    return {
      rc: securityish ? "RC_HTTP_AUTHZ_STATUS" : "RC_HTTP_STATUS_MISMATCH",
      cls: securityish ? "SECURITY_DEFECT" : "QA_CONTRACT_MISMATCH",
      severity: securityish ? "P1" : "P2",
      layer: "http_contract",
      signature: normalizeSig(raw).slice(0, 120) || "HTTP status mismatch",
    };
  }
  if (e.includes("timed out") || e.includes("timeout")) {
    return {
      rc: "RC_TIMEOUT",
      cls: "TEST_INFRA",
      severity: "P2",
      layer: "timeout",
      signature: "timeout",
    };
  }
  if (e.includes("playwright") || e.includes("chromium") || e.includes("browserType")) {
    return {
      rc: "RC_PLAYWRIGHT_ENV",
      cls: "ENVIRONMENT",
      severity: "P3",
      layer: "browser",
      signature: "playwright/browser unavailable",
    };
  }
  if (e.includes("cannot read properties of undefined")) {
    return {
      rc: "RC_CASCADE_UNDEFINED",
      cls: "TEST_INFRA",
      severity: "P2",
      layer: "setup_cascade",
      signature: normalizeSig(raw),
    };
  }
  if (e.includes("database client or pool required")) {
    return {
      rc: "RC_ENV_DB_POOL_REQUIRED",
      cls: "ENVIRONMENT",
      severity: "P2",
      layer: "db_setup",
      signature: "database client or pool required",
    };
  }
  if (e.includes("test_database_url") || e.includes("postgresql test database not configured")) {
    return {
      rc: "RC_ENV_TEST_DATABASE_URL",
      cls: "ENVIRONMENT",
      severity: "P3",
      layer: "env_config",
      signature: "TEST_DATABASE_URL not configured",
    };
  }
  if (e.includes("strict equal") || e.includes("deep equal") || e.includes("expected values")) {
    // booking linkage bools etc.
    if (file.includes("booking-patient-linkage") || name.toLowerCase().includes("link")) {
      return {
        rc: "RC19_BOOKING_PATIENT_LINKAGE",
        cls: "APPLICATION_DEFECT",
        severity: "P1",
        layer: "booking_patient",
        signature: "booking↔patient linkage assert",
      };
    }
    return {
      rc: "RC_ASSERT_VALUE",
      cls: "UNKNOWN",
      severity: "P3",
      layer: "assert",
      signature: normalizeSig(raw) || "value assertion",
    };
  }
  if (e.includes("regular expression") || e.includes("does not match") || e.includes("must match")) {
    return {
      rc: "RC22_REGEX_HTML_CONTRACT",
      cls: "STALE_TEST",
      severity: "TEST_DEBT_ONLY",
      layer: "html_contract",
      signature: "HTML/JS regex contract drift",
    };
  }
  if (!raw.trim()) {
    return {
      rc: "RC_EMPTY_ERROR",
      cls: "UNKNOWN",
      severity: "P3",
      layer: "unknown",
      signature: "empty error",
    };
  }
  return {
    rc: "RC_OTHER",
    cls: "UNKNOWN",
    severity: "P3",
    layer: "unknown",
    signature: normalizeSig(raw),
  };
}

function parse(text) {
  const entryRe =
    /^( *)(ok|not ok) (\d+) - (.+)\n\1  ---\n([\s\S]*?)\n\1  \.\.\./gm;
  const failures = [];
  const skips = [];
  let m;
  while ((m = entryRe.exec(text))) {
    const indent = m[1];
    const status = m[2];
    let title = m[4].trim();
    const body = m[5];
    if (/type:\s*'suite'/.test(body) || body.includes("subtestsFailed")) continue;
    const skip = /#\s*SKIP/.test(title) || /^\s*skip:/m.test(body);
    title = title.replace(/\s*#\s*SKIP.*$/, "").trim();
    let err = "";
    const em = body.match(/error:\s*'((?:\\'|[^'])*)'/);
    if (em) err = em[1].replace(/\\'/g, "'");
    else {
      const em2 = body.match(/error:\s*\|-?\n((?:\s+.+\n)+?)\s*(?:code:|name:|stack:)/);
      if (em2) err = em2[1].split("\n").map((l) => l.trim()).join(" ").trim();
    }
    let file = "";
    const loc = body.match(/location:\s*'([^']+)'/);
    if (loc) {
      const idx = loc[1].indexOf("tests/");
      file = idx >= 0 ? loc[1].slice(idx).split(":")[0] : loc[1];
    } else {
      const sm = body.match(/\(([^)]*tests\/[^:)\\]+\.test\.js):\d+/);
      if (sm) {
        const idx = sm[1].indexOf("tests/");
        file = idx >= 0 ? sm[1].slice(idx) : sm[1];
      }
    }
    if (status === "ok" && skip) {
      skips.push({ title, file, reason: err || "SKIP" });
      continue;
    }
    if (status === "not ok") {
      const inner = unwrapPg(err);
      const c = classify(inner, err, file, title);
      failures.push({
        title: title.slice(0, 160),
        file,
        product: productOf(file),
        err: err.slice(0, 300),
        inner: inner.slice(0, 300),
        skipHybrid: skip,
        ...c,
      });
    }
  }
  return { failures, skips };
}

function main() {
  const text = fs.readFileSync(logPath, "utf8");
  const pick = (re) => {
    const all = [...text.matchAll(re)].map((x) => Number(x[1]));
    return all.length ? all[all.length - 1] : null;
  };
  const census = {
    tests: pick(/# tests\s+(\d+)/g),
    pass: pick(/# pass\s+(\d+)/g),
    fail: pick(/# fail\s+(\d+)/g),
    skip: pick(/# skip(?:ped)?\s+(\d+)/g),
    cancelled: pick(/# cancelled\s+(\d+)/g),
  };
  const { failures, skips } = parse(text);

  const byRc = new Map();
  for (const f of failures) {
    if (!byRc.has(f.rc)) {
      byRc.set(f.rc, {
        RC_ID: f.rc,
        FAILURE_COUNT: 0,
        FAILED_FILES: new Set(),
        PRODUCT: {},
        SIGNATURE: f.signature,
        LIKELY_LAYER: f.layer,
        CLASS: f.cls,
        SEVERITY: f.severity,
        SAMPLES: [],
      });
    }
    const g = byRc.get(f.rc);
    g.FAILURE_COUNT += 1;
    if (f.file) g.FAILED_FILES.add(f.file);
    g.PRODUCT[f.product] = (g.PRODUCT[f.product] || 0) + 1;
    if (g.SAMPLES.length < 3) g.SAMPLES.push({ file: f.file, title: f.title, err: f.inner || f.err });
  }

  const rootCauses = [...byRc.values()]
    .map((g) => ({
      ...g,
      FAILED_FILES: [...g.FAILED_FILES].sort(),
      FAILED_FILE_COUNT: g.FAILED_FILES.size,
    }))
    .sort((a, b) => b.FAILURE_COUNT - a.FAILURE_COUNT);

  const byClass = {};
  const bySeverity = {};
  const byProduct = {};
  for (const f of failures) {
    byClass[f.cls] = (byClass[f.cls] || 0) + 1;
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byProduct[f.product] = (byProduct[f.product] || 0) + 1;
  }

  const failedFiles = new Set(failures.map((f) => f.file).filter(Boolean));
  const uniqueSigs = new Set(failures.map((f) => f.signature));

  const summary = {
    logPath,
    census,
    parsedFailures: failures.length,
    parsedSkips: skips.length,
    FAILED_TEST_FILES: failedFiles.size,
    UNIQUE_FAILURE_SIGNATURES: uniqueSigs.size,
    UNIQUE_ROOT_CAUSES: rootCauses.length,
    FAILURES_BY_PRODUCT: byProduct,
    FAILURES_BY_CLASS: byClass,
    FAILURES_BY_SEVERITY: bySeverity,
    RC01_REAPPEARED: failures.some((f) => f.rc === "RC01_BRANCH_NAME_NOT_NULL"),
    RC02_REAPPEARED: failures.some((f) => f.rc === "RC02_REVOKED_CONSISTENCY"),
    RC03_REAPPEARED: failures.some((f) => f.rc === "RC03_ACTIVE_SCOPE_UIDX"),
    TOP_20_ROOT_CAUSES: rootCauses.slice(0, 20),
    ALL_ROOT_CAUSES: rootCauses,
  };
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    parsedFailures: summary.parsedFailures,
    FAILED_TEST_FILES: summary.FAILED_TEST_FILES,
    UNIQUE_ROOT_CAUSES: summary.UNIQUE_ROOT_CAUSES,
    census: summary.census,
    TOP5: summary.TOP_20_ROOT_CAUSES.slice(0, 5).map((r) => [r.RC_ID, r.FAILURE_COUNT, r.CLASS]),
    outPath,
  }, null, 2));
}

main();
