"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MATRIX = path.join(
  __dirname,
  "../D29/FULL_84_CASE_TRACEABILITY.csv"
);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((item) => item.length && item.some(Boolean));
  return body.map((values) => {
    const record = {};
    header.forEach((key, index) => {
      record[key] = values[index] || "";
    });
    return record;
  });
}

function loadMatrix(file = MATRIX) {
  return parseCsv(fs.readFileSync(file, "utf8"));
}

function caseRequirements(record) {
  return {
    acceptanceId: record.acceptance_id,
    database: true,
    authenticatedSecurity: record.authenticated_security_evidence !== "NOT_REQUIRED",
    concurrency: record.required_new_tests.includes("Concurrency"),
    implementationMissing: record.implementation_class === "MISSING",
    approvalBlocked: record.implementation_class === "BLOCKED_SECURITY",
  };
}

function validateReport(report, matrix) {
  const failures = [];
  const byId = new Map(matrix.map((record) => [record.acceptance_id, caseRequirements(record)]));
  if (byId.size !== 84) {
    failures.push({ code: "matrix_count", detail: String(byId.size) });
  }
  const cases = report && report.cases ? report.cases : {};
  const releaseReady = report && report.release_ready === true;
  const sha = String((report && report.source_sha) || "");
  const runId = String((report && report.run_id) || "");
  const environment = String((report && report.environment_identity) || "");
  const g2 = String((report && report.g2_execution) || "NOT_RUN");
  const g3 = String((report && report.g3_execution) || "NOT_RUN");
  const g4 = String((report && report.g4_execution) || "ABSENT");

  function reject(code, acceptanceId, detail) {
    failures.push({ code, acceptanceId: acceptanceId || "", detail: detail || "" });
  }

  if (report && report.skipped_as_pass === true) {
    reject("silent_skip", "", "a skipped suite was reported as a pass");
  }

  for (const acceptanceId of Object.keys(cases)) {
    if (!byId.has(acceptanceId)) {
      reject("unknown_case", acceptanceId, "id is not one of the 84");
    }
  }

  let passCount = 0;
  for (const [acceptanceId, required] of byId) {
    const claim = cases[acceptanceId] || {};
    const status = String(claim.status || "NOT_RUN");
    if (status !== "PASS") continue;
    passCount += 1;
    const database = String(claim.database_evidence || "");
    if (database !== "VERIFIED") {
      reject("false_pass", acceptanceId, "database evidence is not VERIFIED");
    }
    if (claim.skipped === true || database === "SKIPPED") {
      reject("silent_skip", acceptanceId, "PASS hides a skip");
    }
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      reject("missing_artifact", acceptanceId, "source SHA is missing");
    }
    if (!/^[a-z0-9_-]{8,64}$/i.test(runId)) {
      reject("missing_artifact", acceptanceId, "run id is missing");
    }
    if (environment !== "testing") {
      reject("missing_artifact", acceptanceId, "environment identity is not testing");
    }
    if (g2 !== "PASS") {
      reject("false_pass", acceptanceId, "G2 did not pass");
    }
    if (required.authenticatedSecurity && claim.authenticated_security_evidence !== "VERIFIED") {
      reject("false_pass", acceptanceId, "authenticated security evidence is missing");
    }
    if (required.concurrency && claim.concurrency_evidence !== "VERIFIED") {
      reject("false_pass", acceptanceId, "concurrency evidence is missing");
    }
    if (required.implementationMissing) {
      reject("false_pass", acceptanceId, "FEATURE_NOT_IMPLEMENTED cannot be PASS");
    }
    if (required.approvalBlocked && claim.live_denial !== "HTTP_403") {
      reject("false_pass", acceptanceId, "blocked security case has no live HTTP 403");
    }
    if (claim.coverage === "MOCK_ONLY" || claim.coverage === "PREPARED_NOT_RUN") {
      reject("false_pass", acceptanceId, "coverage label is not verified evidence");
    }
  }

  if (releaseReady) {
    if (passCount !== 84) reject("release_blocked", "", "release requires all 84 cases to pass");
    if (g2 !== "PASS" || g3 !== "PASS" || g4 !== "PASS") {
      reject("release_blocked", "", "G2, G3, or G4 evidence is absent");
    }
    if (!/^[0-9a-f]{40}$/i.test(sha) || !/^[a-z0-9_-]{8,64}$/i.test(runId) || environment !== "testing") {
      reject("missing_artifact", "", "release record has no SHA, run id, or testing identity");
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    passCount,
    releaseReady,
    releaseBlocked: releaseReady === false || failures.some((item) => item.code === "release_blocked"),
  };
}

function main(argv) {
  const file = argv[2];
  if (!file) {
    process.stderr.write("usage: node validate-acceptance-evidence.cjs <report.json>\n");
    process.exit(2);
  }
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = validateReport(report, loadMatrix());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  loadMatrix,
  caseRequirements,
  validateReport,
};

if (require.main === module) {
  main(process.argv);
}
