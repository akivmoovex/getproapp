"use strict";

/**
 * V2.03 shared platform foundation — focused unit tests.
 * Covers new primitives without product screen implementation.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStatusHistoryEntry,
  appendStatusHistory,
  assertStatusTransition,
  appendBuiltStatusHistory,
} = require("../src/platform/history");

const {
  parseListQuery,
  sanitizeSearchQuery,
  pickAllowedFilters,
  buildListPageResult,
  parseAdminListPageParams,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} = require("../src/platform/http/listQuery");

const {
  normalizePreferenceInput,
  buildPolicyAcceptanceDraft,
  assertTrustedOrgScope,
  POLICY_KEYS,
} = require("../src/platform/consent");

const {
  registerNotificationChannel,
  clearNotificationChannels,
  dispatchNotification,
  listRegisteredNotificationChannels,
} = require("../src/platform/notifications");

const {
  registerDataJobAdapter,
  clearDataJobAdapters,
  getDataJobAdapter,
  listDataJobAdapters,
  assertTrustedJobScope,
  JOB_TRANSITIONS,
} = require("../src/platform/jobs");

const {
  assertStatusTransition: assertJobTransition,
} = require("../src/platform/history");

const {
  buildTimelineEntry,
  timelineFromStatusHistory,
  mergeTimelineStreams,
} = require("../src/platform/timeline");

const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
} = require("../src/platform/audit");

const {
  rejectForgedTenantIdentifiers,
} = require("../src/platform/rbac");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("V2.03 status history primitive", () => {
  it("builds and appends entries with truncation", () => {
    const built = buildStatusHistoryEntry({ from: "queued", to: "running", by: "user-1" });
    assert.equal(built.ok, true);
    assert.equal(built.entry.to, "running");

    const first = appendStatusHistory([], built.entry);
    assert.equal(first.ok, true);
    assert.equal(first.history.length, 1);

    const many = [];
    for (let i = 0; i < 5; i += 1) {
      many.push({ at: new Date().toISOString(), from: "a", to: `s${i}` });
    }
    const truncated = appendStatusHistory(many, built.entry, { maxEntries: 3 });
    assert.equal(truncated.ok, true);
    assert.equal(truncated.history.length, 3);
    assert.equal(truncated.truncated, true);
  });

  it("enforces transition maps", () => {
    const ok = assertStatusTransition("queued", "running", JOB_TRANSITIONS);
    assert.equal(ok.ok, true);
    const bad = assertStatusTransition("succeeded", "running", JOB_TRANSITIONS);
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "transition_not_allowed");

    const chained = appendBuiltStatusHistory([], {
      from: null,
      to: "queued",
    });
    assert.equal(chained.ok, true);
  });
});

describe("V2.03 list query helpers", () => {
  it("clamps pagination and sanitizes search/filters", () => {
    const parsed = parseListQuery(
      {
        page: "2",
        limit: "999",
        q: "  jane\u0000doe  ",
        status: "open",
        forged: "x",
        sort: "created_at",
      },
      {
        filterKeys: ["status"],
        sortKeys: ["created_at", "name"],
        defaultSort: "name",
      }
    );
    assert.equal(parsed.page, 2);
    assert.equal(parsed.limit, MAX_PAGE_SIZE);
    assert.equal(parsed.offset, MAX_PAGE_SIZE);
    assert.equal(parsed.q, "jane doe");
    assert.deepEqual(parsed.filters, { status: "open" });
    assert.equal(parsed.sort, "created_at");

    assert.equal(sanitizeSearchQuery(""), null);
    assert.equal(pickAllowedFilters({ a: "1", b: "2" }, ["a"]).a, "1");

    const page = buildListPageResult({ page: 9, limit: 10, total: 25 });
    assert.equal(page.totalPages, 3);
    assert.equal(page.page, 3);

    const compat = parseAdminListPageParams({ page: 1, limit: 10 });
    assert.deepEqual(compat, { page: 1, limit: 10, offset: 0 });
    assert.equal(DEFAULT_PAGE_SIZE, 50);
  });
});

describe("V2.03 consent / preference primitives", () => {
  it("normalizes preferences and policy drafts without clinical semantics", () => {
    const pref = normalizePreferenceInput({
      productCode: "activeclinic",
      subjectKind: "identity",
      subjectRef: "id-1",
      channel: "email",
      purposeKey: "reminders",
      optedIn: true,
    });
    assert.equal(pref.ok, true);
    assert.equal(pref.channel, "email");

    const badClinicalShape = normalizePreferenceInput({
      productCode: "activeclinic",
      subjectKind: "identity",
      subjectRef: "id-1",
      channel: "carrier_pigeon",
      purposeKey: "reminders",
    });
    assert.equal(badClinicalShape.ok, false);

    const draft = buildPolicyAcceptanceDraft({
      productCode: "blessboard",
      policyKey: POLICY_KEYS.TERMS,
      policyVersion: "2026-09",
      subjectRef: "user-1",
    });
    assert.equal(draft.ok, true);
    assert.equal(draft.draft.policyKey, "terms");
  });

  it("rejects forged tenant identifiers on preference scope", () => {
    const denied = assertTrustedOrgScope({
      trusted: { organizationId: ORG },
      body: { organizationId: ORG_B },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reasonCode, "RBAC_FORGED_TENANT_ID");

    const allowed = assertTrustedOrgScope({
      trusted: { organizationId: ORG },
      body: { organizationId: ORG },
    });
    assert.equal(allowed.ok, true);
  });
});

describe("V2.03 notification abstraction", () => {
  beforeEach(() => clearNotificationChannels());
  afterEach(() => clearNotificationChannels());

  it("no-ops without adapter and dispatches with adapter", async () => {
    const noop = await dispatchNotification({
      productCode: "blessboard",
      organizationId: ORG,
      channel: "email",
      templateKey: "welcome",
      recipientRef: "member:1",
      trusted: { organizationId: ORG },
    });
    assert.equal(noop.ok, true);
    assert.equal(noop.code, "queued_noop");

    registerNotificationChannel("email", async () => ({ delivered: true }));
    assert.deepEqual(listRegisteredNotificationChannels(), ["email"]);

    const sent = await dispatchNotification({
      productCode: "activeclinic",
      organizationId: ORG,
      channel: "email",
      templateKey: "appt.reminder",
      recipientRef: "staff:9",
      trusted: { organizationId: ORG },
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.code, "dispatched");
    assert.equal(sent.delivered, true);

    const forged = await dispatchNotification({
      productCode: "activeclinic",
      organizationId: ORG,
      channel: "email",
      templateKey: "x",
      recipientRef: "y",
      body: { facilityId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      trusted: { organizationId: ORG, facilityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" },
    });
    assert.equal(forged.ok, false);
  });
});

describe("V2.03 data job adapters + scope", () => {
  beforeEach(() => clearDataJobAdapters());
  afterEach(() => clearDataJobAdapters());

  it("registers product adapters by entity_key without shared entity model", () => {
    const reg = registerDataJobAdapter({
      productCode: "activeclinic",
      entityKey: "ac.patients",
      jobKinds: ["import", "export"],
      previewImport: async () => ({ rows: 0 }),
    });
    assert.equal(reg.ok, true);
    assert.equal(getDataJobAdapter("activeclinic", "ac.patients").entityKey, "ac.patients");
    assert.equal(listDataJobAdapters("activeclinic").length, 1);
    assert.equal(getDataJobAdapter("blessboard", "ac.patients"), null);
  });

  it("rejects forged org on job scope and validates transitions", () => {
    const forged = assertTrustedJobScope({
      trusted: { organizationId: ORG },
      body: { organization_id: ORG_B },
    });
    assert.equal(forged.ok, false);

    const ok = assertTrustedJobScope({
      trusted: { organizationId: ORG, facilityId: null },
      body: {},
    });
    assert.equal(ok.ok, true);

    assert.equal(assertJobTransition("queued", "validating", JOB_TRANSITIONS).ok, true);
    assert.equal(assertJobTransition("failed", "queued", JOB_TRANSITIONS).ok, false);
  });
});

describe("V2.03 activity timeline", () => {
  it("builds, maps status history, and merges streams", () => {
    const entry = buildTimelineEntry({
      at: "2026-09-26T12:00:00.000Z",
      kind: "status_change",
      title: "Checked in",
      actorLabel: "Reception",
    });
    assert.equal(entry.ok, true);

    const fromHistory = timelineFromStatusHistory(
      [{ at: "2026-09-26T11:00:00.000Z", from: "scheduled", to: "confirmed", by: "A" }],
      { source: "appointments" }
    );
    assert.equal(fromHistory.length, 1);
    assert.match(fromHistory[0].title, /confirmed/);

    const merged = mergeTimelineStreams(
      [fromHistory, [entry.entry]],
      { limit: 10 }
    );
    assert.equal(merged.length, 2);
    assert.equal(merged[0].at >= merged[1].at, true);
  });
});

describe("V2.03 audit catalogue extensions", () => {
  it("exposes data job and preference audit keys", () => {
    assert.equal(SHARED_AUDIT_ACTION.DATA_JOB_CREATED, "data_job.created");
    assert.equal(SHARED_AUDIT_ENTITY.DATA_JOB, "data_job");
    assert.equal(SHARED_AUDIT_ACTION.POLICY_ACCEPTED, "policy.accepted");
  });
});

describe("V2.03 forged tenant rejection remains server-side", () => {
  it("rejects mismatched facility ids from request bodies", () => {
    const decision = rejectForgedTenantIdentifiers({
      body: { facilityId: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
      trusted: {
        organizationId: ORG,
        facilityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      },
      allowMatchingTrusted: true,
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.reasonCode, "RBAC_FORGED_TENANT_ID");
  });
});
