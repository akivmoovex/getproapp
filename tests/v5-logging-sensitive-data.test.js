"use strict";

/**
 * BlessBoard V5 logging — sensitive-data exclusion tests.
 * Does not print real secrets; uses placeholders only.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const {
  assignV5RequestId,
  buildSafeErrorLog,
  createV5ErrorHandler,
  formatSafePoolErrorMessage,
  GENERIC_SERVER_ERROR,
} = require("../src/platform/http/v5SafeLogging");
const { redactAuthTransferQuery } = require("../src/blessboard/http/tenantLoginHelpers");
const {
  sanitizeAuditMetadata,
  recordAuditEvent,
} = require("../src/platform/services/auditEventService");
const { logShadow } = require("../src/blessboard/http/loadBlessBoardTenantRouting");
const {
  logBlessBoardCatalogueContextDiagnostic,
} = require("../src/blessboard/http/loadBlessBoardCatalogueContext");
const { createCompareLegacyHostContext } = require("../src/platform/http/compareLegacyHostContext");
const { MODE_DIAGNOSTIC } = require("../src/platform/config/platformHostContextMode");

const ROOT = path.resolve(__dirname, "..");
const UUID = "11111111-1111-4111-8111-111111111111";

describe("V5 access URL redaction", () => {
  it("redacts transfer query params", () => {
    const url = "/auth/callback?tr=RAW_TRANSFER_TOKEN&code=RAW_CODE&x=1";
    const out = redactAuthTransferQuery(url);
    assert.match(out, /tr=REDACTED/);
    assert.match(out, /code=REDACTED/);
    assert.doesNotMatch(out, /RAW_TRANSFER_TOKEN|RAW_CODE/);
  });

  it("redacts public email-verification path tokens", () => {
    const token = "plaintext-verify-token-never-log";
    const out = redactAuthTransferQuery(`/register/email-verification/${token}?x=1`);
    assert.match(out, /\/register\/email-verification\/REDACTED/);
    assert.doesNotMatch(out, new RegExp(token));
    const result = redactAuthTransferQuery("/register/email-verification/result?outcome=verified");
    assert.match(result, /\/register\/email-verification\/result\?outcome=verified/);
  });
});

describe("V5 request id + error handler", () => {
  it("assigns X-Request-Id and never logs cookies/authorization/body", async () => {
    const logs = [];
    const app = express();
    app.use(assignV5RequestId);
    app.get("/boom", (_req, _res, next) => {
      const err = new Error("password=hunter2 SESSION_SECRET=abc cookie=sid");
      err.code = "TEST_BOOM";
      next(err);
    });
    app.use(
      createV5ErrorHandler({
        env: { NODE_ENV: "production" },
        log: (line) => logs.push(String(line)),
      })
    );

    const res = await request(app)
      .get("/boom")
      .set("Cookie", "blessboard_org_v5_sid=raw-session-token")
      .set("Authorization", "Bearer raw-bearer-token")
      .set("X-Request-Id", "req-audit-1");

    assert.equal(res.status, 500);
    assert.equal(res.headers["x-request-id"], "req-audit-1");
    assert.equal(res.text, GENERIC_SERVER_ERROR);
    assert.equal(logs.length, 1);
    const joined = logs.join("\n");
    assert.match(joined, /"requestId":"req-audit-1"/);
    assert.match(joined, /"code":"TEST_BOOM"/);
    assert.doesNotMatch(
      joined,
      /hunter2|SESSION_SECRET=abc|raw-session-token|raw-bearer-token|Cookie|Authorization/i
    );
    assert.doesNotMatch(joined, /"message"/);
  });

  it("buildSafeErrorLog omits headers and truncates optional message", () => {
    const payload = buildSafeErrorLog(
      Object.assign(new Error("x".repeat(500)), { code: "E" }),
      {
        requestId: "r1",
        method: "POST",
        path: "/login",
        headers: { cookie: "a", authorization: "b" },
        body: { password: "nope", email: "a@b.c" },
      },
      { includeMessage: true }
    );
    assert.equal(payload.requestId, "r1");
    assert.equal(payload.message.length, 160);
    assert.equal(payload.cookie, undefined);
    assert.equal(payload.authorization, undefined);
    assert.equal(payload.body, undefined);
  });

  it("formatSafePoolErrorMessage prefers code and never echoes URLs", () => {
    assert.equal(
      formatSafePoolErrorMessage({
        code: "57P01",
        message: "connection to postgres://u:p@h/db failed",
      }),
      "code=57P01"
    );
    assert.equal(formatSafePoolErrorMessage({ message: "whatever" }), "pool_error");
  });
});

describe("V5 audit metadata + db failure reasons", () => {
  it("strips secrets and PII from metadata", () => {
    const r = sanitizeAuditMetadata({
      status: "approved",
      password: "x",
      session_token: "tok",
      email: "a@b.c",
      answers: { q1: "private" },
      iban: "DE00",
      field_keys: ["full_name", "phone"],
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.metadata.status, "approved");
    assert.deepEqual(r.metadata.field_keys, ["full_name", "phone"]);
    assert.equal(r.metadata.password, undefined);
    assert.equal(r.metadata.email, undefined);
    assert.equal(r.metadata.answers, undefined);
  });

  it("recordAuditEvent maps DB failures to db_error without SQL text", async () => {
    const db = {
      connect: async () => ({
        query: async () => {
          throw new Error('relation "x" detail password=secret postgres://u:p@h/db');
        },
        release: () => {},
      }),
    };
    const result = await recordAuditEvent(db, {
      deploymentCode: "blessboard-org-v5",
      organizationId: UUID,
      actionKey: "member.approve",
      entityType: "member",
      outcome: "success",
      metadata: { status: "ok" },
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "db_error");
    assert.doesNotMatch(JSON.stringify(result), /password=secret|postgres:\/\//i);
  });
});

describe("V5 diagnostic logs use keys not UUIDs / secrets", () => {
  it("shadow routing log omits tokens and cookies", () => {
    const lines = [];
    const req = {
      requestId: "rid-1",
      path: "/member?tr=RAW",
      url: "/member?tr=RAW",
      headers: { cookie: "sid=raw", authorization: "Bearer x" },
      platformHostContext: {
        hostname: "demo.blessboard.org",
        resultType: "resolved_tenant",
        deploymentComparisonAvailable: true,
        resolution: { organization: { key: "demo-church", id: UUID } },
      },
      blessBoardCatalogueContext: {
        resultType: "resolved",
        church: { churchKey: "demo-church", id: UUID },
        primaryBranch: { branchKey: "hq", id: UUID },
      },
    };
    logShadow(
      req,
      {
        outcome: "serve_tenant",
        reason: "ok",
        tenant: {
          organization: { key: "demo-church" },
          church: { key: "demo-church" },
          primaryBranch: { key: "hq" },
        },
      },
      (line) => lines.push(line)
    );
    const joined = lines.join("\n");
    assert.match(joined, /blessboard_tenant_route_shadow/);
    assert.match(joined, /"organizationKey":"demo-church"/);
    assert.match(joined, /"requestId":"rid-1"/);
    assert.doesNotMatch(joined, new RegExp(UUID, "i"));
    assert.doesNotMatch(joined, /RAW|sid=raw|Bearer|password|SESSION_SECRET|DATABASE_URL/i);
    assert.doesNotMatch(joined, /\?tr=/);
  });

  it("catalogue diagnostic log omits UUIDs and error payloads", () => {
    const lines = [];
    logBlessBoardCatalogueContextDiagnostic(
      {
        requestId: "rid-2",
        path: "/login",
        platformHostContext: {
          hostname: "demo.blessboard.org",
          resolution: { organization: { key: "demo-church", id: UUID } },
        },
      },
      {
        resultType: "catalogue_lookup_error",
        organizationId: UUID,
        church: { id: UUID, churchKey: "demo-church", dataEnvironment: "testing" },
        hqBranch: { id: UUID, branchKey: "hq" },
        primaryBranch: { id: UUID, branchKey: "hq" },
      },
      (line) => lines.push(line)
    );
    const joined = lines.join("\n");
    assert.match(joined, /organizationKey/);
    assert.doesNotMatch(joined, /organizationId|churchId|hqBranchId|primaryBranchId/);
    assert.doesNotMatch(joined, new RegExp(UUID, "i"));
    assert.doesNotMatch(joined, /STACK|secret|password/i);
  });

  it("host comparison log omits UUIDs and cookie values", async () => {
    const lines = [];
    const mw = createCompareLegacyHostContext({
      getMode: () => MODE_DIAGNOSTIC,
      log: (line) => lines.push(line),
    });
    const req = {
      path: "/",
      url: "/",
      requestId: "rid-3",
      cookies: { sid: "secret-cookie" },
      headers: { authorization: "Bearer tok", cookie: "sid=secret-cookie" },
      platformHostContext: {
        enabled: true,
        hostname: "acme.blessboard.org",
        resultType: "resolved_tenant",
        resolution: {
          type: "resolved_tenant",
          organization: { key: "acme", id: UUID, dataEnvironment: "testing" },
          product: { key: "blessboard" },
          deployment: { code: "blessboard-org-v5" },
        },
      },
      blessBoardCatalogueContext: {
        resultType: "resolved",
        church: { id: UUID, churchKey: "acme" },
        hqBranch: { id: UUID, branchKey: "hq" },
        primaryBranch: { id: UUID, branchKey: "hq" },
      },
      isChurchHost: true,
      churchContext: { kind: "branch", orgSlug: "acme" },
    };
    await new Promise((resolve, reject) => {
      mw(req, {}, (err) => (err ? reject(err) : resolve()));
    });
    const joined = lines.join("\n");
    assert.match(joined, /platform_host_comparison/);
    assert.doesNotMatch(joined, /platformOrganizationId|platformChurchId|"churchId"/);
    assert.doesNotMatch(joined, new RegExp(UUID, "i"));
    assert.doesNotMatch(joined, /secret-cookie|Bearer tok/);
  });
});

describe("V5 source safety — supabase + foundation wiring", () => {
  it("supabase storage errors do not embed response bodies", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/blessboard/media/storage/supabaseStorage.js"),
      "utf8"
    );
    assert.match(src, /supabase_upload_failed:\$\{res\.status\}/);
    assert.match(src, /supabase_delete_failed:\$\{res\.status\}/);
    assert.doesNotMatch(src, /text\.slice\(0,\s*200\)/);
  });

  it("foundation app wires request id and error handler", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.match(src, /assignV5RequestId/);
    assert.match(src, /createV5ErrorHandler/);
    assert.match(src, /req_id=:req-id/);
  });

  it("login limiter uses hashed key material (source)", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.match(src, /sha256Hex\(`\$\{email\}\|\$\{ip\}`\)/);
    assert.doesNotMatch(src, /console\.(log|info|warn|error)\([^)]*email/i);
  });

  it("audit doc exists and does not embed secrets", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/security/V5_LOGGING_DATA_EXPOSURE_AUDIT.md"),
      "utf8"
    );
    assert.match(doc, /Request IDs/);
    assert.doesNotMatch(doc, /postgres:\/\/[^`]+:[^`]+@/i);
  });
});
