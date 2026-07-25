"use strict";

/**
 * Phase 5 — registration queue visible-status presentation (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const api = require("../src/blessboard/services/registrationQueuePresentation");

describe("registrationQueuePresentation Phase 5 status mapping", () => {
  it("maps rejected and cancelled to Rejected", () => {
    assert.equal(api.presentPhase5QueueStatus({ applicationStatus: "rejected" }).label, "Rejected");
    assert.equal(api.presentPhase5QueueStatus({ application_status: "cancelled" }).key, "rejected");
  });

  it("maps provisioned (and closed+org) to Approved without requiring approved enum", () => {
    const provisioned = api.presentPhase5QueueStatus({
      applicationStatus: "submitted",
      provisioningStatus: "provisioned",
    });
    assert.equal(provisioned.label, "Approved");
    assert.equal(provisioned.key, "approved");
    assert.match(provisioned.chipClass, /bb-pa-chip--ok/);

    const closedLinked = api.presentPhase5QueueStatus({
      application_status: "closed",
      provisioning_status: "not_started",
      organization_key: "grace-church",
    });
    assert.equal(closedLinked.label, "Approved");
  });

  it("maps awaiting_customer follow-up to Needs Information", () => {
    const st = api.presentPhase5QueueStatus({
      applicationStatus: "submitted",
      provisioningStatus: "not_started",
      followUpStatus: "awaiting_customer",
    });
    assert.equal(st.label, "Needs Information");
    assert.equal(st.key, "needs_information");
  });

  it("maps submitted / duplicate_review / network paths to New", () => {
    assert.equal(
      api.presentPhase5QueueStatus({
        applicationStatus: "submitted",
        provisioningStatus: "not_started",
      }).label,
      "New"
    );
    assert.equal(
      api.presentPhase5QueueStatus({
        application_status: "duplicate_review",
        provisioning_status: "not_started",
      }).label,
      "New"
    );
    assert.equal(
      api.presentPhase5QueueStatus({
        applicationStatus: "submitted",
        provisioningStatus: "provisioning_failed",
      }).label,
      "New"
    );
  });

  it("formats dates and locations for queue rows", () => {
    assert.match(api.formatRegistrationDate("2024-10-24T12:00:00.000Z"), /Oct/);
    assert.equal(
      api.formatRegistrationLocation({ city: "Lusaka", country: "Zambia" }),
      "Lusaka, Zambia"
    );
  });

  it("always presents Review linking to registration detail", () => {
    const act = api.presentPhase5QueueAction({
      id: "11111111-1111-4111-8111-111111111111",
      organizationKey: "some-org",
    });
    assert.equal(act.label, "Review");
    assert.equal(
      act.href,
      "/admin/registration-applications/11111111-1111-4111-8111-111111111111"
    );
  });

  it("maps visible_status onto existing query params without inventing filters", () => {
    assert.deepEqual(api.applyVisibleStatusQuery({ visible_status: "new", q: "grace" }), {
      q: "grace",
      queue: "needs_review",
    });
    assert.deepEqual(api.applyVisibleStatusQuery({ visible_status: "needs_information" }), {
      follow_up_status: "needs_information",
    });
    assert.deepEqual(api.applyVisibleStatusQuery({ visible_status: "approved" }), {
      queue: "provisioned",
    });
    assert.deepEqual(api.applyVisibleStatusQuery({ visible_status: "rejected" }), {
      queue: "rejected",
    });
    assert.deepEqual(
      api.applyVisibleStatusQuery({ visible_status: "new", queue: "network_validation" }),
      { queue: "network_validation" }
    );
  });

  it("presents advisory duplicate warning from existing match loader payload", () => {
    const hidden = api.presentPhase5DuplicateWarning(
      { ok: true, empty: true, matches: [] },
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    );
    assert.equal(hidden.show, false);

    const shown = api.presentPhase5DuplicateWarning(
      {
        ok: true,
        empty: false,
        matches: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            riskLevel: "possible",
            riskLabel: "Partial match",
            score: 40,
            candidateLabel: "Other Chapel",
            location: "Ndola",
            reasonTags: ["Exact name"],
            matchedRecordType: "organization",
            candidate: { organizationKey: "other-chapel" },
            organizationStatus: "active",
          },
        ],
      },
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    );
    assert.equal(shown.show, true);
    assert.equal(shown.advisory, true);
    assert.equal(shown.match.name, "Other Chapel");
    assert.equal(shown.match.existingHref, "/admin/organizations/other-chapel");

    const noOrgKey = api.presentPhase5DuplicateWarning(
      {
        ok: true,
        empty: false,
        matches: [
          {
            id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            riskLevel: "strong",
            riskLabel: "Strong match",
            score: 80,
            candidateLabel: "Nameless Match",
            matchedRecordType: "organization",
            candidate: {},
          },
        ],
      },
      "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    );
    assert.equal(noOrgKey.show, true);
    assert.equal(
      noOrgKey.match.existingHref,
      "/admin/registration-applications/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/duplicates"
    );
  });
});
