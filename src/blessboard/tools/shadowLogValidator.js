"use strict";

/**
 * Local-only BlessBoard V5 shadow-routing log evidence validator.
 * Reads a redacted file from disk. Never connects to databases or remote log hosts.
 */

const fs = require("fs");
const path = require("path");

const EVENT_SHADOW = "blessboard_tenant_route_shadow";
const LOG_PREFIX = "[blessboard-tenant-routing]";

/** Required keys on a resolved-tenant shadow_match evidence line (current logShadow shape). */
const REQUIRED_MATCH_FIELDS = Object.freeze([
  "event",
  "requestId",
  "hostname",
  "deploymentComparisonResult",
  "organizationKey",
  "churchKey",
  "primaryBranchKey",
  "proposedRouteOutcome",
  "proposedReason",
  "platformResultType",
  "catalogueResultType",
]);

/**
 * Forbidden patterns — fail if any appear in a candidate shadow log line.
 * Values must never be echoed back to stdout when reporting.
 */
const FORBIDDEN_PATTERNS = Object.freeze([
  { id: "database_url_env", re: /\bDATABASE_URL\b/i },
  { id: "getpro_database_url", re: /\bGETPRO_DATABASE_URL\b/i },
  { id: "postgres_url", re: /postgres(ql)?:\/\//i },
  { id: "mysql_url", re: /mysql:\/\//i },
  { id: "password_assignment", re: /\bpassword\s*[:=]/i },
  { id: "session_secret", re: /\bSESSION_SECRET\b/i },
  { id: "session_token", re: /\bsession[_-]?token\b/i },
  { id: "cookie_header", re: /\bCookie\s*:/i },
  { id: "cookie_assignment", re: /\bcookie\s*=/i },
  { id: "set_cookie", re: /\bSet-Cookie\b/i },
  { id: "authorization_bearer", re: /\bAuthorization\s*:\s*Bearer\b/i },
  { id: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-]{8,}/i },
  { id: "csrf_secret", re: /\b(csrf[_-]?secret|_csrf)\s*[:=]/i },
  { id: "transfer_query_raw", re: /[?&](tr|code|transfer)=(?!REDACTED\b)[^&\s"']+/i },
  { id: "v5_session_cookie", re: /\bblessboard_[a-z0-9_]*_sid\s*=/i },
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key_block", re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
]);

/**
 * @typedef {{
 *   ok: boolean,
 *   code: string,
 *   message: string,
 *   lineNumber?: number,
 *   field?: string,
 *   expected?: string,
 *   actual?: string,
 * }} Finding
 */

/**
 * @param {string} filePath
 * @returns {{ ok: true, absolutePath: string } | { ok: false, code: string, message: string }}
 */
function resolveLocalFilePath(filePath) {
  const raw = String(filePath || "").trim();
  if (!raw) {
    return { ok: false, code: "missing_file", message: "--file is required (local path only)" };
  }
  if (/^https?:\/\//i.test(raw) || /^[a-z]+:\/\//i.test(raw)) {
    return {
      ok: false,
      code: "remote_path_refused",
      message: "Remote URLs are refused; provide a local redacted log file path",
    };
  }
  const absolutePath = path.resolve(process.cwd(), raw);
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, code: "file_not_found", message: "Log file not found" };
  }
  const st = fs.statSync(absolutePath);
  if (!st.isFile()) {
    return { ok: false, code: "not_a_file", message: "Path is not a regular file" };
  }
  return { ok: true, absolutePath };
}

/**
 * @param {string} line
 * @returns {Finding[]}
 */
function scanForbiddenPatterns(line) {
  /** @type {Finding[]} */
  const findings = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.re.test(line)) {
      findings.push({
        ok: false,
        code: "forbidden_pattern",
        message: `Forbidden pattern detected: ${pattern.id}`,
        field: pattern.id,
      });
    }
  }
  return findings;
}

/**
 * Extract JSON payload from a log line. Current emitter:
 *   [blessboard-tenant-routing] {"event":"blessboard_tenant_route_shadow",...}
 * Also accepts a bare JSON object line with the same event.
 * @param {string} line
 * @returns {{ kind: 'json', payload: object } | { kind: 'none' } | { kind: 'malformed', detail: string }}
 */
function extractShadowPayload(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return { kind: "none" };

  let jsonText = null;
  const prefixIdx = trimmed.indexOf(LOG_PREFIX);
  if (prefixIdx >= 0) {
    const after = trimmed.slice(prefixIdx + LOG_PREFIX.length).trim();
    if (after.startsWith("{")) jsonText = after;
  } else if (trimmed.startsWith("{") && trimmed.includes(EVENT_SHADOW)) {
    jsonText = trimmed;
  } else if (trimmed.includes(EVENT_SHADOW) && trimmed.includes("{")) {
    const brace = trimmed.indexOf("{");
    jsonText = trimmed.slice(brace);
  }

  if (!jsonText) {
    if (trimmed.includes(EVENT_SHADOW) || trimmed.includes(LOG_PREFIX)) {
      return { kind: "malformed", detail: "shadow marker present but JSON object missing" };
    }
    return { kind: "none" };
  }

  try {
    const payload = JSON.parse(jsonText);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { kind: "malformed", detail: "JSON root must be an object" };
    }
    if (String(payload.event || "") !== EVENT_SHADOW) {
      return { kind: "none" };
    }
    return { kind: "json", payload };
  } catch {
    return { kind: "malformed", detail: "JSON parse failed" };
  }
}

/**
 * @param {unknown} value
 */
function isPresentKey(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return s !== "" && s.toLowerCase() !== "null";
}

/**
 * HQ branch: current logShadow emits primaryBranchKey only (HQ ≡ primary on demo).
 * Accept optional hqBranchKey if operators add it later; otherwise primary covers HQ evidence.
 * @param {object} payload
 */
function hqBranchEvidence(payload) {
  if (isPresentKey(payload.hqBranchKey)) {
    return { field: "hqBranchKey", value: String(payload.hqBranchKey).trim() };
  }
  if (isPresentKey(payload.primaryBranchKey)) {
    return {
      field: "primaryBranchKey",
      value: String(payload.primaryBranchKey).trim(),
      viaPrimary: true,
    };
  }
  return null;
}

/**
 * @param {object} payload
 * @param {{
 *   mode?: 'match' | 'unknown-host',
 *   expectedHostname?: string | null,
 *   expectedOrganizationKey?: string | null,
 *   expectedChurchKey?: string | null,
 *   expectedPrimaryBranchKey?: string | null,
 * }} [expect]
 * @returns {Finding[]}
 */
function validateShadowPayload(payload, expect) {
  const mode = (expect && expect.mode) || "match";
  /** @type {Finding[]} */
  const findings = [];

  function requireField(name) {
    if (!isPresentKey(payload[name])) {
      findings.push({
        ok: false,
        code: "missing_identifier",
        message: `Missing required field: ${name}`,
        field: name,
      });
      return null;
    }
    return String(payload[name]).trim();
  }

  function expectEqual(field, expected) {
    if (expected == null || String(expected).trim() === "") return;
    const actual = payload[field] == null ? "" : String(payload[field]).trim();
    if (actual !== String(expected).trim()) {
      findings.push({
        ok: false,
        code: "mismatch",
        message: `Field mismatch: ${field}`,
        field,
        expected: String(expected).trim(),
        actual: actual || "(empty)",
      });
    }
  }

  if (String(payload.event || "") !== EVENT_SHADOW) {
    findings.push({
      ok: false,
      code: "wrong_event",
      message: `Expected event ${EVENT_SHADOW}`,
      field: "event",
      expected: EVENT_SHADOW,
      actual: String(payload.event || ""),
    });
    return findings;
  }

  requireField("requestId");
  requireField("hostname");

  if (mode === "unknown-host") {
    requireField("proposedRouteOutcome");
    requireField("proposedReason");
    requireField("platformResultType");
    const outcome = String(payload.proposedRouteOutcome || "");
    const platformType = String(payload.platformResultType || "");
    if (outcome !== "foundation") {
      findings.push({
        ok: false,
        code: "response_behavior",
        message: "Unknown-host shadow must keep proposedRouteOutcome=foundation",
        field: "proposedRouteOutcome",
        expected: "foundation",
        actual: outcome || "(empty)",
      });
    }
    if (!/unknown/i.test(platformType) && platformType !== "invalid_hostname") {
      findings.push({
        ok: false,
        code: "mismatch",
        message: "Unknown-host evidence expects platformResultType unknown_domain (or invalid_hostname)",
        field: "platformResultType",
        expected: "unknown_domain",
        actual: platformType || "(empty)",
      });
    }
    expectEqual("hostname", expect && expect.expectedHostname);
    return findings;
  }

  // mode === match (resolved tenant observational evidence)
  for (const field of REQUIRED_MATCH_FIELDS) {
    requireField(field);
  }

  const hq = hqBranchEvidence(payload);
  if (!hq) {
    findings.push({
      ok: false,
      code: "missing_identifier",
      message:
        "Missing HQ/primary branch evidence (primaryBranchKey required; hqBranchKey optional)",
      field: "primaryBranchKey",
    });
  }

  const deployment = String(payload.deploymentComparisonResult || "");
  if (deployment !== "match") {
    findings.push({
      ok: false,
      code: "mismatch",
      message: "Deployment comparison must be match for valid shadow evidence",
      field: "deploymentComparisonResult",
      expected: "match",
      actual: deployment || "(empty)",
    });
  }

  const outcome = String(payload.proposedRouteOutcome || "");
  const reason = String(payload.proposedReason || "");
  if (outcome !== "foundation") {
    findings.push({
      ok: false,
      code: "response_behavior",
      message: "Shadow decision must keep response behavior foundation (unchanged HTML class)",
      field: "proposedRouteOutcome",
      expected: "foundation",
      actual: outcome || "(empty)",
    });
  }
  if (reason !== "shadow_match") {
    findings.push({
      ok: false,
      code: "mismatch",
      message: "Shadow decision reason must be shadow_match for valid match evidence",
      field: "proposedReason",
      expected: "shadow_match",
      actual: reason || "(empty)",
    });
  }

  if (String(payload.platformResultType || "") !== "resolved_tenant") {
    findings.push({
      ok: false,
      code: "mismatch",
      message: "platformResultType must be resolved_tenant for match evidence",
      field: "platformResultType",
      expected: "resolved_tenant",
      actual: String(payload.platformResultType || "") || "(empty)",
    });
  }
  if (String(payload.catalogueResultType || "") !== "resolved") {
    findings.push({
      ok: false,
      code: "mismatch",
      message: "catalogueResultType must be resolved for match evidence",
      field: "catalogueResultType",
      expected: "resolved",
      actual: String(payload.catalogueResultType || "") || "(empty)",
    });
  }

  expectEqual("hostname", expect && expect.expectedHostname);
  expectEqual("organizationKey", expect && expect.expectedOrganizationKey);
  expectEqual("churchKey", expect && expect.expectedChurchKey);
  expectEqual("primaryBranchKey", expect && expect.expectedPrimaryBranchKey);
  if (expect && expect.expectedPrimaryBranchKey && hq && hq.field === "hqBranchKey") {
    expectEqual("hqBranchKey", expect.expectedPrimaryBranchKey);
  }

  return findings;
}

/**
 * @param {string} fileContents
 * @param {{
 *   mode?: 'match' | 'unknown-host',
 *   expectedHostname?: string | null,
 *   expectedOrganizationKey?: string | null,
 *   expectedChurchKey?: string | null,
 *   expectedPrimaryBranchKey?: string | null,
 * }} [options]
 */
function validateShadowLogText(fileContents, options) {
  const opts = options && typeof options === "object" ? options : {};
  const mode = opts.mode === "unknown-host" ? "unknown-host" : "match";
  const lines = String(fileContents || "").split(/\r?\n/);

  /** @type {Finding[]} */
  const findings = [];
  /** @type {{ lineNumber: number, payload: object }[]} */
  const events = [];
  let malformedCount = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const lineNumber = i + 1;
    if (!String(line || "").trim()) continue;

    const extracted = extractShadowPayload(line);
    if (extracted.kind === "none") continue;

    if (extracted.kind === "malformed") {
      malformedCount += 1;
      findings.push({
        ok: false,
        code: "malformed_log",
        message: extracted.detail || "Malformed shadow log line",
        lineNumber,
      });
      // Still scan for secrets without printing the line
      for (const f of scanForbiddenPatterns(line)) {
        findings.push({ ...f, lineNumber });
      }
      continue;
    }

    for (const f of scanForbiddenPatterns(line)) {
      findings.push({ ...f, lineNumber });
    }

    events.push({ lineNumber, payload: extracted.payload });
    for (const f of validateShadowPayload(extracted.payload, { ...opts, mode })) {
      findings.push({ ...f, lineNumber });
    }
  }

  if (events.length === 0 && malformedCount === 0) {
    findings.push({
      ok: false,
      code: "missing_evidence",
      message: `No ${EVENT_SHADOW} events found in file`,
    });
  }

  const failures = findings.filter((f) => !f.ok);
  const ok = failures.length === 0 && events.length > 0;

  return {
    ok,
    mode,
    eventCount: events.length,
    findings: failures,
    summary: {
      events: events.length,
      failures: failures.length,
      malformed: malformedCount,
    },
  };
}

/**
 * @param {string} filePath
 * @param {object} [options]
 */
function validateShadowLogFile(filePath, options) {
  const resolved = resolveLocalFilePath(filePath);
  if (!resolved.ok) {
    return {
      ok: false,
      mode: (options && options.mode) || "match",
      eventCount: 0,
      findings: [
        {
          ok: false,
          code: resolved.code,
          message: resolved.message,
        },
      ],
      summary: { events: 0, failures: 1, malformed: 0 },
      absolutePath: null,
    };
  }

  const text = fs.readFileSync(resolved.absolutePath, "utf8");
  const result = validateShadowLogText(text, options);
  return { ...result, absolutePath: resolved.absolutePath };
}

/**
 * Safe machine-readable report — never includes raw log lines.
 * @param {ReturnType<typeof validateShadowLogFile>} result
 */
function formatValidatorReport(result) {
  return {
    ok: Boolean(result.ok),
    mode: result.mode,
    eventCount: result.eventCount,
    summary: result.summary,
    // Path basename only — avoid leaking home directories into CI chat
    file: result.absolutePath ? path.basename(result.absolutePath) : null,
    findings: (result.findings || []).map((f) => ({
      code: f.code,
      message: f.message,
      lineNumber: f.lineNumber || null,
      field: f.field || null,
      expected: f.expected || null,
      actual: f.actual || null,
    })),
  };
}

module.exports = {
  EVENT_SHADOW,
  LOG_PREFIX,
  REQUIRED_MATCH_FIELDS,
  FORBIDDEN_PATTERNS,
  resolveLocalFilePath,
  scanForbiddenPatterns,
  extractShadowPayload,
  validateShadowPayload,
  validateShadowLogText,
  validateShadowLogFile,
  formatValidatorReport,
  hqBranchEvidence,
};
