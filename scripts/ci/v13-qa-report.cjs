#!/usr/bin/env node
"use strict";

/**
 * Consolidate V13 BB QA results into machine-readable + human-readable reports.
 * Never embeds credentials, OTPs, session secrets, PII, or database dumps.
 */

const fs = require("fs");
const path = require("path");
const {
  RESULTS,
  buildResultRow,
  evaluateReleaseReadiness,
} = require("../../tests/v13/helpers/v13QaStatus");

const ROOT = path.join(__dirname, "../..");
const OUT_DIR = process.env.V13_QA_REPORT_DIR
  ? path.resolve(process.env.V13_QA_REPORT_DIR)
  : path.join(ROOT, "test-results", "v13-bb-qa-report");

function safeText(value) {
  return String(value == null ? "" : value)
    .replace(/(password|secret|token|otp|authorization)=([^\s&]+)/gi, "$1=[REDACTED]")
    .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]");
}

function loadMatrix() {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "docs/qa/V213_BB_REGRESSION_MATRIX.json"), "utf8")
  );
}

function loadUnitSummary(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const commitSha = String(process.env.GITHUB_SHA || process.env.COMMIT_SHA || "").trim();
  const environment = String(process.env.DEPLOYMENT_ENV || "ci-prepared").trim();
  const databaseIdentity = String(
    process.env.GETPRO_V13_OWNED_DB_NAME || process.env.DATABASE_IDENTITY || "none"
  ).trim();
  const stageA = String(process.env.V13_STAGE_A_RESULT || RESULTS.NOT_RUN);
  const stageB = String(process.env.V13_STAGE_B_RESULT || RESULTS.NOT_RUN);
  const stageC = String(process.env.V13_STAGE_C_RESULT || RESULTS.NOT_RUN);

  const matrix = loadMatrix();
  const unitSummary = loadUnitSummary(process.env.V13_UNIT_SUMMARY_JSON);

  /** @type {object[]} */
  const rows = [];

  for (const issue of matrix.issues) {
    rows.push(
      buildResultRow({
        BUG_ID: issue.id,
        TEST_NAME: `${issue.id} unit contract`,
        TEST_LEVEL: "UNIT",
        RESULT: stageA === RESULTS.PASS || stageA === "PASS" ? RESULTS.PASS : stageA,
        COMMIT_SHA: commitSha,
        ENVIRONMENT: environment,
        DATABASE_IDENTITY: "none",
        FAILURE_REASON:
          issue.implementationStatus.includes("OPEN") ||
          issue.implementationStatus.includes("PARTIAL") ||
          issue.implementationStatus.includes("UNCOMMITTED")
            ? `product_status=${issue.implementationStatus}`
            : "",
        ARTIFACT_REFERENCE: issue.automatedTests.unit,
      })
    );
    rows.push(
      buildResultRow({
        BUG_ID: issue.id,
        TEST_NAME: `${issue.id} integration`,
        TEST_LEVEL: "INTEGRATION",
        RESULT: stageB,
        COMMIT_SHA: commitSha,
        ENVIRONMENT: environment,
        DATABASE_IDENTITY: databaseIdentity,
        FAILURE_REASON:
          stageB === RESULTS.NOT_RUN
            ? "DB-writing stage not authorized in D04"
            : "",
        ARTIFACT_REFERENCE: issue.automatedTests.integration,
      })
    );
    rows.push(
      buildResultRow({
        BUG_ID: issue.id,
        TEST_NAME: `${issue.id} browser`,
        TEST_LEVEL: "BROWSER",
        RESULT: stageC,
        COMMIT_SHA: commitSha,
        ENVIRONMENT: environment,
        DATABASE_IDENTITY: databaseIdentity,
        FAILURE_REASON:
          stageC === RESULTS.NOT_RUN
            ? "Browser stage not authorized/executed in D04"
            : "",
        ARTIFACT_REFERENCE: issue.automatedTests.browser,
      })
    );
  }

  const readiness = evaluateReleaseReadiness(
    rows.map((r) => ({ ...r, required: r.TEST_LEVEL === "UNIT" ? false : true })),
    matrix.releaseBlockers
  );

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, "v13-bb-qa-report.json");
  const mdPath = path.join(OUT_DIR, "v13-bb-qa-report.md");

  const payload = {
    generatedAt: new Date().toISOString(),
    commitSha,
    environment,
    databaseIdentity,
    stageA,
    stageB,
    stageC,
    unitSummary,
    readiness,
    rows,
    releaseBlockers: matrix.releaseBlockers,
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);

  const lines = [
    "# V13 BlessBoard QA Regression Report",
    "",
    `COMMIT_SHA=${commitSha || "unknown"}`,
    `ENVIRONMENT=${environment}`,
    `DATABASE_IDENTITY=${databaseIdentity}`,
    `STAGE_A=${stageA}`,
    `STAGE_B=${stageB}`,
    `STAGE_C=${stageC}`,
    `RELEASE_CONCLUSION=${readiness.conclusion}`,
    "",
    "| BUG_ID | TEST_NAME | TEST_LEVEL | RESULT | FAILURE_REASON | ARTIFACT_REFERENCE |",
    "|---|---|---|---|---|---|",
  ];
  for (const row of rows) {
    lines.push(
      `| ${row.BUG_ID} | ${row.TEST_NAME} | ${row.TEST_LEVEL} | ${row.RESULT} | ${safeText(
        row.FAILURE_REASON
      )} | ${row.ARTIFACT_REFERENCE} |`
    );
  }
  lines.push("");
  lines.push("## Release blockers");
  for (const b of matrix.releaseBlockers) {
    lines.push(`- ${b.id}: ${b.status} — ${b.summary}`);
  }
  lines.push("");
  fs.writeFileSync(mdPath, `${lines.join("\n")}\n`);

  process.stdout.write(`V13_QA_REPORT_JSON=${jsonPath}\n`);
  process.stdout.write(`V13_QA_REPORT_MD=${mdPath}\n`);
  process.stdout.write(`RELEASE_CONCLUSION=${readiness.conclusion}\n`);
  if (readiness.conclusion !== "RELEASE_READY") {
    // Report job should not fail Stage A; emit non-zero only when explicitly required.
    if (String(process.env.V13_QA_REPORT_FAIL_ON_BLOCKERS || "") === "1") {
      process.exit(2);
    }
  }
}

main();
