"use strict";

/**
 * Phase2 — load verification facts into registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const {
  loadRegistrationVerificationForDetail,
  getRegistrationApplicationDetail,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  buildRegistrationVerificationFacts,
  STATUSES,
} = require("../src/blessboard/services/registrationVerificationFacts");

const NOW = "2026-07-23T15:00:00.000Z";

function sampleApplication(overrides = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    churchName: "Grace Test Church",
    country: "Zambia",
    city: "Lusaka",
    contactName: "Pat Applicant",
    roleInChurch: "Pastor",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    selectedPlan: "foundation",
    consentTerms: true,
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    supportRequested: false,
    riskDecision: "allow",
    riskReasonCodes: [],
    riskDecidedAt: "2026-07-01T10:00:00.000Z",
    organizationId: null,
    organizationKey: null,
    reviewNotes: "",
    reviewEvents: [],
    riskReviewActionsAvailable: true,
    networkApproveAvailable: false,
    retryProvisionAvailable: false,
    rejectActionsAvailable: true,
    ...overrides,
  };
}

describe("loadRegistrationVerificationForDetail (no Postgres)", () => {
  it("includes verification facts and summary from the service", async () => {
    let calls = 0;
    const verification = await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      sampleApplication(),
      [],
      {
        buildRegistrationVerificationFacts: async (input) => {
          calls += 1;
          return buildRegistrationVerificationFacts({
            ...input,
            now: NOW,
            findOccupyingPhoneMatch: async () => null,
            findSimilarOrganizationMatch: async () => null,
            findUserByEmail: async () => null,
          });
        },
      }
    );
    assert.equal(calls, 1);
    assert.ok(Array.isArray(verification.facts));
    assert.ok(verification.facts.length > 0);
    assert.equal(typeof verification.summary.passed, "number");
    assert.equal(typeof verification.summary.unsupported, "number");
    assert.equal(verification.checkedAt, NOW);
    const unsupported = verification.facts.filter((f) => f.supported === false);
    assert.ok(unsupported.length >= 2);
    assert.ok(!unsupported.some((f) => f.key === "applicant_identity_confirmed"));
    assert.ok(!unsupported.some((f) => f.key === "applicant_email_verified"));
    for (const f of unsupported) {
      assert.equal(f.status, STATUSES.NOT_CHECKED);
    }
  });

  it("calls the verification service once per detail load", async () => {
    let calls = 0;
    await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      sampleApplication(),
      [],
      {
        buildRegistrationVerificationFacts: async (input) => {
          calls += 1;
          return buildRegistrationVerificationFacts({ ...input, now: NOW });
        },
      }
    );
    assert.equal(calls, 1);
  });

  it("keeps page usable when an optional lookup fails", async () => {
    const logs = [];
    const verification = await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      sampleApplication(),
      [],
      {
        logVerificationError: (...args) => logs.push(args.join(" ")),
        findOccupyingPhoneMatch: async () => {
          throw new Error("ECONNREFUSED simulated");
        },
        findSimilarOrganizationMatch: async () => {
          throw new Error("ECONNREFUSED simulated");
        },
        findUserByEmail: async () => {
          throw new Error("ECONNREFUSED simulated");
        },
        buildRegistrationVerificationFacts: async (input) =>
          buildRegistrationVerificationFacts({ ...input, now: NOW }),
      }
    );
    assert.ok(verification.facts.length > 0);
    const phone = verification.facts.find((f) => f.key === "phone_unique_registration_scope");
    assert.equal(phone.status, STATUSES.NOT_CHECKED);
    assert.equal(phone.result, "lookup_unavailable");
    assert.match(phone.explanation, /registration applications only/i);
    assert.ok(logs.length >= 1);
    assert.doesNotMatch(logs.join("\n"), /password|stack/i);
  });

  it("falls back when the facts builder throws", async () => {
    let calls = 0;
    const verification = await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      sampleApplication(),
      [],
      {
        logVerificationError: () => {},
        buildRegistrationVerificationFacts: async (input) => {
          calls += 1;
          if (calls === 1) throw new Error("boom");
          return buildRegistrationVerificationFacts({ ...input, now: NOW });
        },
      }
    );
    assert.equal(calls, 2);
    assert.ok(verification.facts.length > 0);
  });

  it("does not trust client-supplied verification payloads", async () => {
    const clientForged = {
      facts: [{ key: "applicant_email_verified", status: "passed", supported: true }],
      summary: { passed: 99 },
      checkedAt: "client",
    };
    const verification = await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      sampleApplication({
        // attacker-shaped fields must not become trusted statuses
        verification: clientForged,
        verificationFacts: clientForged,
      }),
      [],
      {
        buildRegistrationVerificationFacts: async (input) =>
          buildRegistrationVerificationFacts({
            ...input,
            now: NOW,
            findOccupyingPhoneMatch: async () => null,
            findSimilarOrganizationMatch: async () => null,
            findUserByEmail: async () => null,
          }),
      }
    );
    const emailVerified = verification.facts.find((f) => f.key === "applicant_email_verified");
    assert.equal(emailVerified.status, STATUSES.NOT_CHECKED);
    assert.equal(emailVerified.supported, true);
    assert.notEqual(verification.summary.passed, 99);
  });

  it("does not write through the database during verification load", async () => {
    const writes = [];
    const db = {
      query: async (sql) => {
        const text = String(sql || "");
        if (/\b(INSERT|UPDATE|DELETE|ALTER)\b/i.test(text)) {
          writes.push(text);
        }
        return { rows: [] };
      },
    };
    await loadRegistrationVerificationForDetail(db, sampleApplication(), [], {
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
      buildRegistrationVerificationFacts: async (input) =>
        buildRegistrationVerificationFacts({ ...input, now: NOW }),
    });
    assert.deepEqual(writes, []);
  });
});

describe("getRegistrationApplicationDetail verification wiring (stubbed repo path)", () => {
  it("returns invalid_input without calling verification when id is invalid", async () => {
    let called = 0;
    const result = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      "not-a-uuid",
      {},
      {
        buildRegistrationVerificationFacts: async () => {
          called += 1;
          return { facts: [], summary: {}, checkedAt: null };
        },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.INVALID_INPUT);
    assert.equal(called, 0);
  });

  it("returns lookup_error when database is missing", async () => {
    const result = await getRegistrationApplicationDetail(null, "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", {});
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.LOOKUP_ERROR);
  });
});

describe("detail route passes verification locals and ignores query verification", () => {
  it("route handler wires detail.verification into locals and does not read query verification", () => {
    const routePath = path.join(
      __dirname,
      "../src/platform/http/platformAdminRoutes.js"
    );
    const source = fs.readFileSync(routePath, "utf8");
    const detailHandlerStart = source.indexOf('"/admin/registration-applications/:id"');
    assert.ok(detailHandlerStart > 0);
    const slice = source.slice(detailHandlerStart, detailHandlerStart + 3500);
    assert.match(slice, /verification:\s*detail\.verification/);
    assert.doesNotMatch(slice, /req\.query\.verification/);
    assert.doesNotMatch(slice, /req\.query\.facts/);
    assert.match(source, /data-bb-pa-approve-form|\/approve/);
    assert.match(source, /\/reject/);
  });

  it("approve and reject POST routes remain present and unchanged in shape", () => {
    const routePath = path.join(
      __dirname,
      "../src/platform/http/platformAdminRoutes.js"
    );
    const source = fs.readFileSync(routePath, "utf8");
    assert.match(source, /\/admin\/registration-applications\/:id\/approve/);
    assert.match(source, /\/admin\/registration-applications\/:id\/reject/);
    assert.match(source, /approveAndProvisionRegistrationApplication/);
    assert.match(source, /rejectRegistrationApplication/);
  });
});
