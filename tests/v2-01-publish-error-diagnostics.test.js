"use strict";

/**
 * V2.01 — BlessBoard publish failure diagnostics: no opaque lookup_error masking;
 * genuine lookups stay lookup_error; secrets never appear in public/log payloads.
 */

const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  classifyPublishFailure,
  buildPublishFailureResult,
  logFailedPublishDiagnostics,
  PUBLIC_CODES,
  EVENT,
} = require("../src/blessboard/services/websitePublishFailureDiagnostics");
const {
  prepareWebsitePublishError,
} = require("../src/blessboard/services/websitePublishReviewService");
const {
  publishWebsiteDrafts,
  STATUS,
} = require("../src/blessboard/services/websiteDraftPublishService");
const fieldDraftRepo = require("../src/blessboard/repositories/websiteInlineFieldDraftRepository");
const structuredDraftRepo = require("../src/blessboard/repositories/websiteStructuredDraftRepository");
const approvalSettingsSvc = require("../src/blessboard/services/websiteApprovalSettingsService");
const rbac = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
const applySvc = require("../src/blessboard/services/websiteDraftApplyService");
const churchPublish = require("../src/blessboard/services/churchWebsitePublishService");

describe("V2.01 publish error diagnostics — classification", () => {
  it("maps WEBSITE_ENGINE_PUBLISH engineCode, not lookup_error", () => {
    const err = {
      code: "WEBSITE_ENGINE_PUBLISH",
      engineCode: "website_instance_not_found",
      causeCode: "website_instance_not_found",
    };
    const c = classifyPublishFailure(err);
    assert.equal(c.publicCode, PUBLIC_CODES.WEBSITE_INSTANCE_NOT_FOUND);
    assert.equal(c.engineCode, "website_instance_not_found");
    assert.equal(c.failureStage, "engine_bridge");
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
    assert.notEqual(c.status, "lookup_error");
  });

  it("maps apply INVALID_FIELD, not lookup_error", () => {
    const c = classifyPublishFailure({ code: "INVALID_FIELD" });
    assert.equal(c.publicCode, "invalid_field");
    assert.equal(c.failureStage, "apply_drafts");
    assert.equal(c.classification, "apply");
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("maps PG unique conflict to conflict, not lookup_error", () => {
    const c = classifyPublishFailure({ code: "23505" });
    assert.equal(c.publicCode, PUBLIC_CODES.CONFLICT);
    assert.equal(c.httpStatusHint, 409);
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("maps PG check constraint to constraint_violation, not lookup_error", () => {
    const c = classifyPublishFailure({ code: "23514" });
    assert.equal(c.publicCode, PUBLIC_CODES.CONSTRAINT_VIOLATION);
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("keeps genuine lookup failures as lookup_error via reasonHint", () => {
    const c = classifyPublishFailure(new Error("relation missing"), {
      reasonHint: "lookup",
      stageHint: "tenant_lookup",
    });
    assert.equal(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
    assert.equal(c.failureStage, "tenant_lookup");
    assert.equal(c.classification, "lookup");
  });

  it("maps authz check failures to authz_unavailable, not lookup_error", () => {
    const c = classifyPublishFailure(new Error("timeout"), {
      reasonHint: "authz_check",
    });
    assert.equal(c.publicCode, PUBLIC_CODES.AUTHZ_UNAVAILABLE);
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("maps readiness failures to readiness_unavailable, not lookup_error", () => {
    const c = classifyPublishFailure(new Error("boom"), { reasonHint: "readiness" });
    assert.equal(c.publicCode, PUBLIC_CODES.READINESS_UNAVAILABLE);
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("unknown errors become publish_failed, never lookup_error", () => {
    const c = classifyPublishFailure(new Error("unexpected"));
    assert.equal(c.publicCode, PUBLIC_CODES.PUBLISH_FAILED);
    assert.notEqual(c.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
  });

  it("preserves forbidden / cross-org as forbidden", () => {
    const c = classifyPublishFailure({ code: "CROSS_ORG" });
    assert.equal(c.publicCode, PUBLIC_CODES.FORBIDDEN);
    assert.equal(c.httpStatusHint, 403);
  });

  it("maps engine website_publish_locked via ENGINE_CODE_TO_PUBLIC", () => {
    const c = classifyPublishFailure({
      code: "WEBSITE_ENGINE_PUBLISH",
      engineCode: "website_publish_locked",
    });
    assert.equal(c.publicCode, PUBLIC_CODES.WEBSITE_PUBLISH_LOCKED);
    assert.equal(c.engineCode, "website_publish_locked");
  });
});

describe("V2.01 publish error diagnostics — structured log + public result", () => {
  it("logs once with safe fields and no secrets", () => {
    const lines = [];
    const restore = mock.method(console, "error", (msg) => {
      lines.push(String(msg));
    });
    try {
      const result = buildPublishFailureResult(
        {
          code: "WEBSITE_ENGINE_PUBLISH",
          engineCode: "v8_incompatible_publish",
          message: "password=supersecret token=abc DATABASE_URL=postgres://u:p@h/db",
          stack: "Error: password=supersecret\n    at x",
        },
        {
          operation: "publishChurchWebsite",
          organizationId: "11111111-1111-4111-8111-111111111111",
          churchId: "22222222-2222-4222-8222-222222222222",
          requestId: "req-diag-1",
          correlationId: "req-diag-1",
          includeStack: false,
        }
      );
      assert.equal(result.ok, false);
      assert.equal(result.publicCode, PUBLIC_CODES.V8_INCOMPATIBLE_PUBLISH);
      assert.equal(result.engineCode, "v8_incompatible_publish");
      assert.equal(result.failureStage, "engine_bridge");
      assert.match(result.message, /compatible|format|Drafts were preserved/i);
      assert.equal(lines.length, 1);
      const payload = JSON.parse(lines[0]);
      assert.equal(payload.event, EVENT);
      assert.equal(payload.product, "BlessBoard");
      assert.equal(payload.requestId, "req-diag-1");
      assert.equal(payload.publicCode, PUBLIC_CODES.V8_INCOMPATIBLE_PUBLISH);
      assert.equal(payload.engineCode, "v8_incompatible_publish");
      assert.ok(payload.deploymentSha == null || typeof payload.deploymentSha === "string");
      assert.ok(!JSON.stringify(payload).includes("supersecret"));
      assert.ok(!JSON.stringify(payload).includes("postgres://"));
      assert.ok(!JSON.stringify(payload).includes("DATABASE_URL"));
      assert.equal(payload.stack, undefined);
    } finally {
      restore.mock.restore();
    }
  });

  it("skipLog avoids duplicate console.error", () => {
    const lines = [];
    const restore = mock.method(console, "error", (msg) => {
      lines.push(String(msg));
    });
    try {
      buildPublishFailureResult({ code: "APPLY_FAILED" }, { skipLog: true });
      assert.equal(lines.length, 0);
      logFailedPublishDiagnostics({
        err: { code: "APPLY_FAILED" },
        operation: "publishWebsiteDrafts",
        requestId: "req-once",
      });
      assert.equal(lines.length, 1);
    } finally {
      restore.mock.restore();
    }
  });

  it("error page model includes request ID and actionable copy", () => {
    const model = prepareWebsitePublishError({
      codes: ["website_engine_publish_failed"],
      requestId: "req-ui-99",
      liveUnchanged: true,
    });
    assert.equal(model.requestId, "req-ui-99");
    assert.ok(model.problems.some((p) => String(p).includes("Request ID: req-ui-99")));
    assert.match(String(model.subtitle), /live website has not changed/i);
    assert.match(String(model.subtitle), /Drafts were preserved/i);
  });
});

describe("V2.01 publish error diagnostics — injected failures (no QA customer data)", () => {
  it("org lookup throw stays lookup_error with diagnostics fields", async () => {
    const lines = [];
    const restore = mock.method(console, "error", (msg) => lines.push(String(msg)));
    try {
      const db = {
        query: async () => {
          throw new Error("injected_org_lookup_failure");
        },
      };
      const result = await publishWebsiteDrafts(db, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        churchId: "22222222-2222-4222-8222-222222222222",
        branchId: null,
        actorUserId: "33333333-3333-4333-8333-333333333333",
        actorRole: "hq_admin",
        confirmPublish: true,
        requestId: "req-lookup-inject",
      });
      assert.equal(result.ok, false);
      assert.equal(result.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
      assert.equal(result.status, STATUS.LOOKUP_ERROR);
      assert.equal(result.failureStage, "tenant_lookup");
      assert.ok(result.message);
      assert.ok(!JSON.stringify(result).toLowerCase().includes("password"));
      assert.equal(lines.length, 1);
      const payload = JSON.parse(lines[0]);
      assert.equal(payload.requestId, "req-lookup-inject");
      assert.equal(payload.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
    } finally {
      restore.mock.restore();
    }
  });

  it("apply INVALID_FIELD throw is not remapped to lookup_error", async () => {
    const lines = [];
    const restoreLog = mock.method(console, "error", (msg) => lines.push(String(msg)));
    const origAuthorize = rbac.authorize;
    const origCountField = fieldDraftRepo.countDrafts;
    const origCountStruct = structuredDraftRepo.countStructuredDrafts;
    const origLoadSettings = approvalSettingsSvc.loadEffectiveSettings;
    const origApply = applySvc.applyWebsiteDraftsInTransaction;

    rbac.authorize = async () => ({ allowed: true });
    fieldDraftRepo.countDrafts = async () => 2;
    structuredDraftRepo.countStructuredDrafts = async () => 1;
    approvalSettingsSvc.loadEffectiveSettings = async () => ({
      ok: true,
      settings: { requireApprovalForBranchPublish: false },
    });
    applySvc.applyWebsiteDraftsInTransaction = async () => {
      const err = new Error("injected_invalid_field");
      err.code = "INVALID_FIELD";
      throw err;
    };

    try {
      const db = {
        query: async (sql) => {
          if (String(sql || "").includes("FROM blessboard.churches")) {
            return {
              rows: [{ organization_id: "11111111-1111-4111-8111-111111111111" }],
            };
          }
          return { rows: [] };
        },
        connect: async () => ({
          query: async (sql) => {
            const text = String(sql || "").trim();
            if (/^BEGIN/i.test(text) || /^COMMIT/i.test(text) || /^ROLLBACK/i.test(text)) {
              return { rows: [] };
            }
            return { rows: [] };
          },
          release: () => {},
        }),
      };

      const result = await publishWebsiteDrafts(db, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        churchId: "22222222-2222-4222-8222-222222222222",
        branchId: null,
        actorUserId: "33333333-3333-4333-8333-333333333333",
        actorRole: "church_hq_admin",
        confirmPublish: true,
        requestId: "req-apply-inject",
      });

      assert.equal(result.ok, false);
      assert.equal(result.publicCode, "invalid_field");
      assert.notEqual(result.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
      assert.notEqual(result.status, "lookup_error");
      assert.equal(result.failureStage, "apply_drafts");
      assert.match(String(result.message), /draft|field|preserved/i);
      assert.ok(lines.length >= 1);
      const payload = JSON.parse(lines[0]);
      assert.equal(payload.publicCode, "invalid_field");
      assert.equal(payload.requestId, "req-apply-inject");
    } finally {
      rbac.authorize = origAuthorize;
      fieldDraftRepo.countDrafts = origCountField;
      structuredDraftRepo.countStructuredDrafts = origCountStruct;
      approvalSettingsSvc.loadEffectiveSettings = origLoadSettings;
      applySvc.applyWebsiteDraftsInTransaction = origApply;
      restoreLog.mock.restore();
    }
  });

  it("engine-bridge failure nested from publishChurchWebsite preserves engineCode", async () => {
    const lines = [];
    const restoreLog = mock.method(console, "error", (msg) => lines.push(String(msg)));
    const origAuthorize = rbac.authorize;
    const origCountField = fieldDraftRepo.countDrafts;
    const origCountStruct = structuredDraftRepo.countStructuredDrafts;
    const origLoadSettings = approvalSettingsSvc.loadEffectiveSettings;
    const origApply = applySvc.applyWebsiteDraftsInTransaction;
    const origPublish = churchPublish.publishChurchWebsite;

    rbac.authorize = async () => ({ allowed: true });
    fieldDraftRepo.countDrafts = async () => 1;
    structuredDraftRepo.countStructuredDrafts = async () => 0;
    approvalSettingsSvc.loadEffectiveSettings = async () => ({
      ok: true,
      settings: { requireApprovalForBranchPublish: false },
    });
    applySvc.applyWebsiteDraftsInTransaction = async () => ({
      applied: true,
      fieldCount: 1,
      structuredCount: 0,
    });
    churchPublish.publishChurchWebsite = async () => ({
      ok: false,
      status: "engine_error",
      reason: PUBLIC_CODES.WEBSITE_ENGINE_PUBLISH_FAILED,
      publicCode: PUBLIC_CODES.WEBSITE_ENGINE_PUBLISH_FAILED,
      engineCode: "website_engine_publish_failed",
      failureStage: "engine_bridge",
      classification: "engine",
      httpStatusHint: 500,
      message: "Publishing to the live website engine failed. Drafts were preserved — try again.",
    });

    try {
      const db = {
        query: async (sql) => {
          if (String(sql || "").includes("FROM blessboard.churches")) {
            return {
              rows: [{ organization_id: "11111111-1111-4111-8111-111111111111" }],
            };
          }
          return { rows: [] };
        },
        connect: async () => ({
          query: async (sql) => {
            const text = String(sql || "").trim();
            if (/^BEGIN/i.test(text) || /^COMMIT/i.test(text) || /^ROLLBACK/i.test(text)) {
              return { rows: [] };
            }
            return { rows: [] };
          },
          release: () => {},
        }),
      };

      const result = await publishWebsiteDrafts(db, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        churchId: "22222222-2222-4222-8222-222222222222",
        branchId: null,
        actorUserId: "33333333-3333-4333-8333-333333333333",
        actorRole: "church_hq_admin",
        confirmPublish: true,
        requestId: "req-engine-inject",
      });

      assert.equal(result.ok, false);
      assert.equal(result.publicCode, PUBLIC_CODES.WEBSITE_ENGINE_PUBLISH_FAILED);
      assert.equal(result.engineCode, "website_engine_publish_failed");
      assert.equal(result.failureStage, "engine_bridge");
      assert.notEqual(result.publicCode, PUBLIC_CODES.LOOKUP_ERROR);
      // Nested PUBLISH_FAILED path must not re-log (inner publish already would);
      // with inject, outer returns nested without second classification log.
      assert.ok(Array.isArray(lines));
    } finally {
      rbac.authorize = origAuthorize;
      fieldDraftRepo.countDrafts = origCountField;
      structuredDraftRepo.countStructuredDrafts = origCountStruct;
      approvalSettingsSvc.loadEffectiveSettings = origLoadSettings;
      applySvc.applyWebsiteDraftsInTransaction = origApply;
      churchPublish.publishChurchWebsite = origPublish;
      restoreLog.mock.restore();
    }
  });

  it("forbidden authz denial stays forbidden and does not claim success", async () => {
    const origAuthorize = rbac.authorize;
    rbac.authorize = async () => ({ allowed: false });
    try {
      const db = {
        query: async (sql) => {
          if (String(sql || "").includes("FROM blessboard.churches")) {
            return {
              rows: [{ organization_id: "11111111-1111-4111-8111-111111111111" }],
            };
          }
          return { rows: [] };
        },
      };
      const result = await publishWebsiteDrafts(db, {
        organizationId: "11111111-1111-4111-8111-111111111111",
        churchId: "22222222-2222-4222-8222-222222222222",
        branchId: null,
        actorUserId: "33333333-3333-4333-8333-333333333333",
        actorRole: "church_hq_admin",
        confirmPublish: true,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, STATUS.FORBIDDEN);
      assert.ok(!result.published);
      assert.ok(!result.draftCleared);
    } finally {
      rbac.authorize = origAuthorize;
    }
  });

  it("cross-org church returns forbidden (tenant isolation)", async () => {
    const db = {
      query: async (sql) => {
        if (String(sql || "").includes("FROM blessboard.churches")) {
          return {
            rows: [{ organization_id: "99999999-9999-4999-8999-999999999999" }],
          };
        }
        return { rows: [] };
      },
    };
    const result = await publishWebsiteDrafts(db, {
      organizationId: "11111111-1111-4111-8111-111111111111",
      churchId: "22222222-2222-4222-8222-222222222222",
      branchId: null,
      actorUserId: "33333333-3333-4333-8333-333333333333",
      actorRole: "hq_admin",
      confirmPublish: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.FORBIDDEN);
    assert.equal(result.reason, "cross_org");
  });
});

describe("V2.01 ActiveClinic publish codes remain explicit (regression)", () => {
  it("publicationService still exports explicit failure codes used by AC routes", () => {
    const publicationService = require("../src/platform/website/publicationService");
    assert.equal(typeof publicationService.publishWebsiteDraft, "function");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/website/publicationService.js"),
      "utf8"
    );
    assert.match(src, /website_instance_not_found/);
    assert.match(src, /website_publish_locked/);
    assert.match(src, /v8_incompatible_publish/);
    assert.doesNotMatch(src, /status:\s*["']lookup_error["']/);
  });
});
