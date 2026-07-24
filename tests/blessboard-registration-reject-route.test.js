"use strict";

/**
 * Phase2 Prompt 069 — POST reject route upgrade (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  createPlatformAdminRouter,
  parseRejectForm,
  mapRejectRouteError,
} = require("../src/platform/http/platformAdminRoutes");
const {
  REJECTION_CATEGORIES,
  STATUS: REG_APP_STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
};

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

function baseBody(overrides = {}) {
  return {
    rejection_category: "duplicate_registration",
    internal_decision_note: "Internal: confirmed duplicate church",
    applicant_explanation: "We found another registration for this church.",
    reapplication_allowed: "0",
    notify_applicant: "0",
    ...overrides,
  };
}

function buildApp(overrides = {}) {
  const state = {
    rejectCalls: [],
  };

  const rejectFn =
    overrides.rejectRegistrationApplication ||
    (async (db, input, options) => {
      state.rejectCalls.push({ input, options });
      if (overrides.rejectImpl) return overrides.rejectImpl(db, input, options);
      return {
        ok: true,
        status: REG_APP_STATUS.OK,
        alreadyRejected: false,
        rejectionCategory: input.rejectionCategory,
        reapplicationAllowed:
          input.reapplicationAllowed === undefined ? null : input.reapplicationAllowed,
        rejectionNotificationStatus: input.notifyApplicant
          ? "sending_unavailable"
          : input.applicantExplanation
            ? "recorded"
            : null,
        rejectionNotice: input.applicantExplanation
          ? {
              communicationType: "rejection_notice",
              applicantMessage: input.applicantExplanation,
              internalNote: input.internalDecisionNote,
            }
          : null,
        delivery: input.notifyApplicant
          ? {
              attempted: true,
              status: "sending_unavailable",
              providerAvailable: false,
              safeErrorCode: "email_sending_unavailable",
            }
          : null,
      };
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed reject route tests");
      },
    }),
    isApexHost: () => (overrides.nonApex ? false : true),
    env: ENV,
    findUserStatusById:
      overrides.findUserStatusById ||
      (async () => ({ id: ADMIN_ID, status: "active" })),
    listActiveAuthorizationRoles:
      overrides.listActiveAuthorizationRoles ||
      (async () => [{ roleKey: "platform_admin" }]),
    rejectRegistrationApplication: rejectFn,
    rejectRegistrationOptions: overrides.rejectRegistrationOptions,
    log: () => {},
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(simpleCookieParser);
  app.use((req, _res, next) => {
    if (overrides.unauthenticated) {
      req.v5Session = { authenticated: false, session: null };
    } else if (overrides.nonAdmin) {
      req.v5Session = {
        authenticated: true,
        session: { userId: ADMIN_ID, user: { displayName: "Member" } },
      };
    } else {
      req.v5Session = {
        authenticated: true,
        session: { userId: ADMIN_ID, user: { displayName: "Platform Admin" } },
      };
    }
    next();
  });
  app.use(router);
  return { app, state };
}

async function postReject(app, body, { csrf = true } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${APP_ID}/reject`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...body, [CSRF_FIELD]: token });
  }
  return req.send(body);
}

describe("parseRejectForm (Prompt 069)", () => {
  it("accepts all allowlisted categories and requires internal decision note", () => {
    for (const category of REJECTION_CATEGORIES) {
      const parsed = parseRejectForm(
        {
          rejection_category: category,
          internal_decision_note: "Internal decision note text",
        },
        APP_ID
      );
      assert.equal(parsed.ok, true, category);
      assert.equal(parsed.input.rejectionCategory, category);
      assert.equal(parsed.input.internalDecisionNote, "Internal decision note text");
    }
  });

  it("maps legacy rejection_reason and requires explanation when notify is selected", () => {
    const legacy = parseRejectForm({ rejection_reason: "Legacy reason text" }, APP_ID);
    assert.equal(legacy.ok, true);
    assert.equal(legacy.input.internalDecisionNote, "Legacy reason text");
    assert.equal(legacy.input.notifyApplicant, false);

    const missingExplain = parseRejectForm(
      {
        internal_decision_note: "Internal note",
        notify_applicant: "1",
      },
      APP_ID
    );
    assert.equal(missingExplain.ok, false);
    assert.equal(missingExplain.code, "applicant_explanation_required");

    const badCategory = parseRejectForm(
      {
        rejection_category: "not_real",
        internal_decision_note: "Internal note",
      },
      APP_ID
    );
    assert.equal(badCategory.ok, false);
    assert.equal(badCategory.code, "invalid_rejection_category");
  });

  it("never accepts status or notification result fields from the form", () => {
    const parsed = parseRejectForm(
      {
        internal_decision_note: "Internal note here",
        application_status: "approved",
        rejection_notification_status: "sent",
        delivery_status: "sent",
        platform_admin_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        application_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      APP_ID
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.input.applicationId, APP_ID);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.input, "applicationStatus"), false);
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed.input, "rejectionNotificationStatus"),
      false
    );
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.input, "deliveryStatus"), false);
  });
});

describe("mapRejectRouteError (Prompt 069)", () => {
  it("maps validation and not-found safely", () => {
    assert.equal(
      mapRejectRouteError({ status: REG_APP_STATUS.INVALID_INPUT, message: "invalid_rejection_category" }),
      "invalid"
    );
    assert.equal(
      mapRejectRouteError({ status: REG_APP_STATUS.NOT_FOUND, message: "not_found" }),
      "not_found"
    );
    assert.equal(
      mapRejectRouteError({ status: REG_APP_STATUS.NOT_ELIGIBLE, message: "already_provisioned" }),
      "not_eligible"
    );
    assert.equal(
      mapRejectRouteError({ status: REG_APP_STATUS.LOOKUP_ERROR, message: "smtp password=secret" }),
      "reject_failed"
    );
  });
});

describe("POST reject route (Prompt 069)", () => {
  it("requires platform admin authorization", async () => {
    const { app } = buildApp({
      unauthenticated: true,
      listActiveAuthorizationRoles: async () => [],
    });
    const res = await postReject(app, baseBody());
    assert.ok([303, 401, 403].includes(res.status));
    if (res.status === 303) {
      assert.match(String(res.headers.location || ""), /\/login/);
    }
  });

  it("rejects non-admin roles", async () => {
    const { app } = buildApp({
      nonAdmin: true,
      listActiveAuthorizationRoles: async () => [{ roleKey: "member" }],
    });
    const res = await postReject(app, baseBody());
    assert.ok([303, 401, 403].includes(res.status));
  });

  it("requires CSRF", async () => {
    const { app, state } = buildApp();
    const res = await postReject(app, baseBody(), { csrf: false });
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /error=csrf#reg-rejection/);
    assert.equal(state.rejectCalls.length, 0);
  });

  it("calls upgraded service once with separated messages and redirects on success", async () => {
    const { app, state } = buildApp();
    const res = await postReject(
      app,
      baseBody({
        rejection_category: "contact_not_verified",
        internal_decision_note: "INTERNAL_ONLY",
        applicant_explanation: "APPLICANT_FACING",
        reapplication_allowed: "1",
        notify_applicant: "1",
      })
    );
    assert.equal(res.status, 303);
    assert.match(
      String(res.headers.location || ""),
      new RegExp(
        `/admin/registration-applications/${APP_ID}\\?notice=application_rejected#reg-rejection`
      )
    );
    assert.equal(state.rejectCalls.length, 1);
    const call = state.rejectCalls[0].input;
    assert.equal(call.applicationId, APP_ID);
    assert.equal(call.platformAdminUserId, ADMIN_ID);
    assert.equal(call.rejectionCategory, "contact_not_verified");
    assert.equal(call.internalDecisionNote, "INTERNAL_ONLY");
    assert.equal(call.applicantExplanation, "APPLICANT_FACING");
    assert.equal(call.reapplicationAllowed, true);
    assert.equal(call.notifyApplicant, true);
    assert.notEqual(call.internalDecisionNote, call.applicantExplanation);
    assert.equal(Object.prototype.hasOwnProperty.call(call, "applicationStatus"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(call, "rejectionNotificationStatus"), false);
  });

  it("preserves legacy rejection_reason compatibility for existing forms", async () => {
    const { app, state } = buildApp();
    const res = await postReject(app, {
      rejection_reason: "Operator rejection after review",
    });
    assert.equal(res.status, 303);
    assert.match(
      String(res.headers.location || ""),
      /notice=application_rejected#reg-rejection/
    );
    assert.equal(state.rejectCalls[0].input.internalDecisionNote, "Operator rejection after review");
    assert.equal(state.rejectCalls[0].input.notifyApplicant, false);
  });

  it("validates categories and notify explanation before calling the service", async () => {
    const { app, state } = buildApp();
    const badCategory = await postReject(
      app,
      baseBody({ rejection_category: "made_up_category" })
    );
    assert.match(String(badCategory.headers.location || ""), /error=invalid#reg-rejection/);

    const missingNote = await postReject(app, {
      rejection_category: "other",
      applicant_explanation: "Hello",
    });
    assert.match(String(missingNote.headers.location || ""), /error=invalid#reg-rejection/);

    const notifyMissing = await postReject(
      app,
      baseBody({
        notify_applicant: "1",
        applicant_explanation: "",
      })
    );
    assert.match(String(notifyMissing.headers.location || ""), /error=invalid#reg-rejection/);
    assert.equal(state.rejectCalls.length, 0);
  });

  it("records honest notification-unavailable delivery without trusting client status", async () => {
    const { app, state } = buildApp({
      rejectImpl: async (_db, input) => {
        assert.equal(input.notifyApplicant, true);
        return {
          ok: true,
          status: REG_APP_STATUS.OK,
          alreadyRejected: false,
          rejectionNotificationStatus: "sending_unavailable",
          delivery: {
            attempted: true,
            status: "sending_unavailable",
            providerAvailable: false,
            safeErrorCode: "email_sending_unavailable",
          },
          rejectionNotice: {
            applicantMessage: input.applicantExplanation,
            internalNote: input.internalDecisionNote,
          },
        };
      },
    });
    const res = await postReject(
      app,
      baseBody({
        notify_applicant: "1",
        applicant_explanation: "Applicant text",
        rejection_notification_status: "sent",
        delivery_status: "sent",
      })
    );
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /notice=application_rejected#reg-rejection/);
    assert.doesNotMatch(String(res.headers.location || ""), /notice=sent|delivery=sent/);
    assert.equal(state.rejectCalls.length, 1);
    assert.equal(
      Object.prototype.hasOwnProperty.call(state.rejectCalls[0].input, "rejectionNotificationStatus"),
      false
    );
  });

  it("maps service failures safely without leaking provider text", async () => {
    const { app } = buildApp({
      rejectImpl: async () => ({
        ok: false,
        status: REG_APP_STATUS.LOOKUP_ERROR,
        message: "SMTP password=hunter2 connection refused",
      }),
    });
    const res = await postReject(app, baseBody());
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /error=reject_failed#reg-rejection/);
    assert.doesNotMatch(String(res.headers.location || ""), /hunter2|SMTP|connection refused/);
  });

  it("maps not_found and not_eligible safely", async () => {
    const notFoundApp = buildApp({
      rejectImpl: async () => ({
        ok: false,
        status: REG_APP_STATUS.NOT_FOUND,
        message: "not_found",
      }),
    });
    const notFound = await postReject(notFoundApp.app, baseBody());
    assert.match(String(notFound.headers.location || ""), /error=not_found#reg-rejection/);

    const ineligibleApp = buildApp({
      rejectImpl: async () => ({
        ok: false,
        status: REG_APP_STATUS.NOT_ELIGIBLE,
        message: "already_provisioned",
      }),
    });
    const ineligible = await postReject(ineligibleApp.app, baseBody());
    assert.match(String(ineligible.headers.location || ""), /error=not_eligible#reg-rejection/);
  });

  it("registers the upgraded reject route and exports helpers", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(src, /\/admin\/registration-applications\/:id\/reject/);
    assert.match(src, /parseRejectForm/);
    assert.match(src, /notice=application_rejected/);
    assert.match(src, /#reg-rejection/);
    assert.match(src, /internal_decision_note/);
    assert.match(src, /applicant_explanation/);
    assert.match(src, /notify_applicant/);
  });
});
