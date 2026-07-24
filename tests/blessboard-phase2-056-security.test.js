"use strict";

/**
 * Phase2 Prompt 056 — focused security tests for Prompt 1–7 surfaces.
 * Covers token log redaction, spoofed email-verify outcome, CSRF on decision POST,
 * cross-application duplicate decision scoping, and client-controlled fact rejection.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");

const { redactAuthTransferQuery } = require("../src/blessboard/http/tenantLoginHelpers");
const {
  createApexMarketingRouter,
  EMAIL_VERIFY_PATH_PREFIX,
  EMAIL_VERIFY_RESULT_PATH,
  EMAIL_VERIFY_FLASH_COOKIE,
  issueEmailVerifyOutcomeFlash,
  verifyEmailVerifyOutcomeFlash,
} = require("../src/blessboard/http/apexMarketingRoutes");
const { issueCsrfToken, setCsrfCookie } = require("../src/platform/http/v5Csrf");
const {
  createPlatformAdminRouter,
} = require("../src/platform/http/platformAdminRoutes");
const {
  buildRegistrationVerificationFacts,
} = require("../src/blessboard/services/registrationVerificationFacts");
const {
  buildRegistrationReviewRecommendation,
} = require("../src/blessboard/services/registrationReviewRecommendation");
const {
  buildRegistrationApprovalChecklist,
} = require("../src/blessboard/services/registrationApprovalChecklist");
const {
  recordDuplicateMatchReviewDecision,
} = require("../src/blessboard/services/registrationDuplicateReviewDecisionService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ADMIN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SECRET = "test-session-secret-at-least-32-chars!!";
const ENV = { NODE_ENV: "test", SESSION_SECRET: SECRET };

function simpleCookieParser(req, _res, next) {
  if (req.cookies && typeof req.cookies === "object") return next();
  req.cookies = {};
  const header = String((req.headers && req.headers.cookie) || "");
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      req.cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      req.cookies[key] = part.slice(idx + 1).trim();
    }
  }
  return next();
}

describe("Phase2 056 security — token exposure / logging", () => {
  it("redacts email-verification tokens from access-log URLs", () => {
    const token = "super-secret-email-verify-token";
    const out = redactAuthTransferQuery(
      `/register/email-verification/${token}?utm=1`
    );
    assert.match(out, /\/register\/email-verification\/REDACTED/);
    assert.doesNotMatch(out, new RegExp(token));
  });

  it("does not redact the tokenless result path", () => {
    const out = redactAuthTransferQuery(
      "/register/email-verification/result?outcome=invalid"
    );
    assert.match(out, /\/register\/email-verification\/result/);
  });
});

describe("Phase2 056 security — client-controlled verification outcome", () => {
  it("rejects spoofed verified query without flash cookie", async () => {
    const router = createApexMarketingRouter({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      isApexHost: () => true,
      issueCsrfToken,
      setCsrfCookie,
      env: ENV,
      isProduction: false,
      emailVerificationLimiter: (_req, _res, next) => next(),
      consumeVerificationToken: async () => ({ ok: true, code: "verified" }),
    });
    const app = express();
    app.use(simpleCookieParser);
    app.use(router);
    const res = await request(app).get(`${EMAIL_VERIFY_RESULT_PATH}?outcome=verified`);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-email-verify-outcome="invalid"/);
  });

  it("accepts verified only with a signed flash cookie", async () => {
    const flash = issueEmailVerifyOutcomeFlash("verified", ENV);
    assert.equal(verifyEmailVerifyOutcomeFlash(flash, ENV), "verified");
    const router = createApexMarketingRouter({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      isApexHost: () => true,
      issueCsrfToken,
      setCsrfCookie,
      env: ENV,
      isProduction: false,
      emailVerificationLimiter: (_req, _res, next) => next(),
      consumeVerificationToken: async () => ({ ok: true, code: "verified" }),
    });
    const app = express();
    app.use(simpleCookieParser);
    app.use(router);
    const res = await request(app)
      .get(`${EMAIL_VERIFY_RESULT_PATH}?outcome=verified`)
      .set("Cookie", `${EMAIL_VERIFY_FLASH_COOKIE}=${flash}`);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-email-verify-outcome="verified"/);
  });
});

describe("Phase2 056 security — client-controlled PA facts", () => {
  it("ignores client-supplied verification/recommendation/checklist payloads", async () => {
    const forged = {
      facts: [{ key: "applicant_email_verified", status: "passed", supported: true, result: "forged" }],
      summary: { passed: 99 },
      code: "recommended_for_approval",
    };
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-24T12:00:00.000Z",
      application: {
        id: APP_ID,
        churchName: "Grace",
        country: "ZM",
        city: "Lusaka",
        contactName: "Pat",
        roleInChurch: "Pastor",
        contactEmail: "pat@example.com",
        contactPhoneNormalized: "+260971000001",
        selectedPlan: "foundation",
        consentTerms: true,
        applicationStatus: "submitted",
        provisioningStatus: "not_started",
        riskDecision: "allow",
        riskReasonCodes: [],
        riskReviewActionsAvailable: true,
        verification: forged,
        reviewRecommendation: forged,
        approvalChecklist: forged,
      },
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
      duplicateMatches: { available: true, matches: [] },
    });
    const email = verification.facts.find((f) => f.key === "applicant_email_verified");
    assert.notEqual(email.status, "passed");
    assert.notEqual(email.result, "forged");
    const rec = buildRegistrationReviewRecommendation({
      verification,
      now: "2026-07-24T12:00:00.000Z",
      clientRecommendation: forged,
    });
    assert.notEqual(rec.code, "recommended_for_approval");
    const checklist = buildRegistrationApprovalChecklist({
      verification,
      reviewRecommendation: rec,
      now: "2026-07-24T12:00:00.000Z",
      clientChecklist: forged,
    });
    assert.ok(Array.isArray(checklist.items));
    assert.ok(!checklist.items.every((i) => i.status === "complete"));
  });
});

describe("Phase2 056 security — cross-application duplicate decision", () => {
  function fakeDb() {
    return {
      async query(sql) {
        const s = String(sql || "");
        if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [] };
        throw new Error(`unexpected sql: ${s}`);
      },
    };
  }

  it("rejects a match id that does not belong to the route application", async () => {
    const result = await recordDuplicateMatchReviewDecision(
      fakeDb(),
      {
        applicationId: APP_ID,
        matchId: MATCH_ID,
        decision: "different_church",
        reason: "Separate congregations confirmed on site visit",
        actorUserId: ADMIN_ID,
      },
      {
        getRegistrationDuplicateMatchById: async (_db, matchId, opts) => {
          assert.equal(matchId, MATCH_ID);
          assert.equal(opts.applicationId, APP_ID);
          return null;
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, "not_found");
  });

  it("does not write when the match is scoped to another application", async () => {
    let writes = 0;
    const result = await recordDuplicateMatchReviewDecision(
      fakeDb(),
      {
        applicationId: APP_ID,
        matchId: MATCH_ID,
        decision: "confirmed_duplicate",
        reason: "Same registration number and phone",
        actorUserId: ADMIN_ID,
      },
      {
        getRegistrationDuplicateMatchById: async (_db, matchId, opts) => {
          assert.equal(opts.applicationId, APP_ID);
          return null;
        },
        recordRegistrationDuplicateMatchDecision: async () => {
          writes += 1;
          return { id: MATCH_ID };
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(writes, 0);
  });
});

describe("Phase2 056 security — CSRF on duplicate decision POST", () => {
  it("rejects missing CSRF without writing a decision", async () => {
    let decisionCalls = 0;
    const router = createPlatformAdminRouter({
      getPool: () => ({
        query: async () => {
          throw new Error("pool.query must not be used");
        },
      }),
      env: {
        ...ENV,
        BLESSBOARD_APEX_ORIGIN: "https://blessboard.test",
      },
      isApexHost: () => true,
      findUserStatusById: async () => ({ id: ADMIN_ID, status: "active" }),
      listActiveAuthorizationRoles: async () => [{ roleKey: "platform_admin" }],
      recordDuplicateMatchReviewDecision: async () => {
        decisionCalls += 1;
        return { ok: true, status: "ok" };
      },
      log: () => {},
    });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(simpleCookieParser);
    app.use((req, _res, next) => {
      req.v5Session = {
        authenticated: true,
        session: { userId: ADMIN_ID, user: { displayName: "Platform Admin" } },
      };
      next();
    });
    app.use(router);

    const res = await request(app)
      .post(`/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}/decision`)
      .type("form")
      .send({
        decision: "different_church",
        reason: "Separate congregations",
        return_to: "compare",
      });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=csrf/);
    assert.equal(decisionCalls, 0);
  });
});

describe("Phase2 056 security — consume path does not echo token", () => {
  it("redirect Location never includes the plaintext token", async () => {
    const token = "plaintext-verify-token-never-log-or-link";
    const router = createApexMarketingRouter({
      getPool: () => ({ query: async () => ({ rows: [] }) }),
      isApexHost: () => true,
      issueCsrfToken,
      setCsrfCookie,
      env: ENV,
      isProduction: false,
      emailVerificationLimiter: (_req, _res, next) => next(),
      consumeVerificationToken: async () => ({ ok: true, code: "verified" }),
    });
    const app = express();
    app.use(simpleCookieParser);
    app.use(router);
    const res = await request(app).get(
      `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(token)}`
    );
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.location, new RegExp(token));
    assert.match(res.headers.location, new RegExp(`^${EMAIL_VERIFY_RESULT_PATH}`));
  });
});
