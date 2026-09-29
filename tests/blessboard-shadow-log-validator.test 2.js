"use strict";

/**
 * Shadow log validator unit tests — fixtures only; no network / DB.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  validateShadowLogFile,
  validateShadowLogText,
  formatValidatorReport,
  resolveLocalFilePath,
  FORBIDDEN_PATTERNS,
  EVENT_SHADOW,
} = require("../src/blessboard/tools/shadowLogValidator");

const FIXTURES = path.join(__dirname, "fixtures", "shadow-logs");
const CLI = path.join(__dirname, "..", "scripts", "verify-v5-shadow-log.js");

function fixture(name) {
  return path.join(FIXTURES, name);
}

describe("shadow log validator — fixtures", () => {
  it("valid match passes required evidence fields", () => {
    const result = validateShadowLogFile(fixture("valid-match.log"), {
      mode: "match",
      expectedHostname: "diagnostic.blessboard.org",
      expectedOrganizationKey: "diagnostic-church",
      expectedChurchKey: "diagnostic-church",
      expectedPrimaryBranchKey: "hq",
    });
    assert.equal(result.ok, true);
    assert.equal(result.eventCount, 1);
    assert.equal(result.findings.length, 0);
    const report = formatValidatorReport(result);
    assert.equal(report.ok, true);
    assert.equal(report.file, "valid-match.log");
    assert.doesNotMatch(JSON.stringify(report), /DATABASE_URL|password|raw-session/i);
  });

  it("deployment mismatch fails", () => {
    const result = validateShadowLogFile(fixture("mismatch-deployment.log"), { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "mismatch" && f.field === "deploymentComparisonResult"));
  });

  it("missing identifiers fail", () => {
    const result = validateShadowLogFile(fixture("missing-identifiers.log"), { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "missing_identifier" && f.field === "requestId"));
  });

  it("secret leakage fails without echoing secrets", () => {
    const result = validateShadowLogFile(fixture("secret-leakage.log"), { mode: "match" });
    assert.equal(result.ok, false);
    const codes = result.findings.filter((f) => f.code === "forbidden_pattern").map((f) => f.field);
    assert.ok(codes.includes("database_url_env") || codes.includes("postgres_url"));
    assert.ok(codes.some((c) => /cookie|session|transfer/i.test(String(c))));
    const report = JSON.stringify(formatValidatorReport(result));
    assert.doesNotMatch(report, /postgresql:\/\/user:pass|raw-session-token|RAW_TRANSFER_SECRET/i);
  });

  it("unknown host evidence passes in unknown-host mode", () => {
    const result = validateShadowLogFile(fixture("unknown-host.log"), {
      mode: "unknown-host",
      expectedHostname: "unknown.blessboard.org",
    });
    assert.equal(result.ok, true);
    assert.equal(result.eventCount, 1);
  });

  it("unknown host fails match mode (missing catalogue keys)", () => {
    const result = validateShadowLogFile(fixture("unknown-host.log"), { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "missing_identifier" || f.code === "mismatch"));
  });

  it("malformed log fails", () => {
    const result = validateShadowLogFile(fixture("malformed.log"), { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "malformed_log" || f.code === "missing_evidence"));
  });

  it("empty file fails missing evidence", () => {
    const result = validateShadowLogText("\n\n", { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "missing_evidence"));
  });

  it("refuses remote URLs", () => {
    const resolved = resolveLocalFilePath("https://example.com/logs.txt");
    assert.equal(resolved.ok, false);
    assert.equal(resolved.code, "remote_path_refused");
  });

  it("key expectation mismatch fails", () => {
    const result = validateShadowLogFile(fixture("valid-match.log"), {
      mode: "match",
      expectedOrganizationKey: "other-org",
    });
    assert.equal(result.ok, false);
    assert.ok(
      result.findings.some((f) => f.code === "mismatch" && f.field === "organizationKey")
    );
  });

  it("response behavior fail when proposedRouteOutcome is not foundation", () => {
    const line = `[blessboard-tenant-routing] ${JSON.stringify({
      event: EVENT_SHADOW,
      hostname: "diagnostic.blessboard.org",
      platformResultType: "resolved_tenant",
      catalogueResultType: "resolved",
      proposedRouteOutcome: "render_tenant",
      proposedReason: "shadow_match",
      organizationKey: "diagnostic-church",
      churchKey: "diagnostic-church",
      primaryBranchKey: "hq",
      deploymentComparisonResult: "match",
      path: "/",
      requestId: "req-bad-outcome",
    })}`;
    const result = validateShadowLogText(line, { mode: "match" });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((f) => f.code === "response_behavior"));
  });

  it("exports forbidden pattern ids for documentation", () => {
    assert.ok(FORBIDDEN_PATTERNS.length >= 8);
    assert.ok(FORBIDDEN_PATTERNS.every((p) => p.id && p.re));
  });
});

describe("shadow log validator — CLI", () => {
  it("CLI exits 0 on valid match fixture", () => {
    const proc = spawnSync(process.execPath, [CLI, "--file", fixture("valid-match.log")], {
      encoding: "utf8",
    });
    assert.equal(proc.status, 0, proc.stderr);
    const report = JSON.parse(proc.stdout);
    assert.equal(report.ok, true);
    assert.doesNotMatch(proc.stdout + proc.stderr, /postgresql:\/\/|RAW_TRANSFER/i);
  });

  it("CLI exits 1 on secret leakage without printing secrets", () => {
    const proc = spawnSync(process.execPath, [CLI, "--file", fixture("secret-leakage.log")], {
      encoding: "utf8",
    });
    assert.equal(proc.status, 1);
    assert.match(proc.stderr, /FAIL/);
    assert.doesNotMatch(proc.stdout + proc.stderr, /user:pass@db|raw-session-token|RAW_TRANSFER_SECRET/);
  });

  it("CLI exits 2 when --file missing", () => {
    const proc = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
    assert.equal(proc.status, 2);
  });

  it("CLI unknown-host mode accepts unknown-host fixture", () => {
    const proc = spawnSync(
      process.execPath,
      [CLI, "--file", fixture("unknown-host.log"), "--mode", "unknown-host"],
      { encoding: "utf8" }
    );
    assert.equal(proc.status, 0, proc.stderr);
  });
});
