"use strict";

/**
 * Phase2 Batch 3 — registration queue view parity (markup / filter contract).
 * Prefer no PostgreSQL. Optional HTTP cases skip when DB unavailable.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  APPLICATION_STATUSES,
  PROVISIONING_STATUSES,
  FOLLOW_UP_STATUSES,
  LINKED_FILTERS,
} = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const { QUEUE_FILTERS } = require("../src/blessboard/services/registrationOperatorPresenter");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-applications.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");

function renderList(locals) {
  const source = fs.readFileSync(VIEW, "utf8");
  // Stub shell includes so we can render the section in isolation.
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationStatus,
      applications: [],
      filters: {},
      queueFilters: QUEUE_FILTERS,
      allowedLimits: [10, 25, 50, 100],
      allowedPlans: ["foundation", "growth", "network"],
      applicationStatuses: APPLICATION_STATUSES,
      provisioningStatuses: PROVISIONING_STATUSES,
      followUpStatuses: FOLLOW_UP_STATUSES,
      linkedFilters: LINKED_FILTERS,
      page: 1,
      limit: 25,
      total: 0,
      totalPages: 0,
      rangeFrom: 0,
      rangeTo: 0,
      listError: false,
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration queue view parity (no Postgres)", () => {
  it("exposes all supported filter field names", () => {
    const html = renderList({});
    for (const name of [
      "q",
      "queue",
      "selected_plan",
      "application_status",
      "provisioning_status",
      "follow_up_status",
      "from",
      "to",
      "support_requested",
      "requires_review",
      "overdue_follow_up",
      "linked",
      "limit",
    ]) {
      assert.match(html, new RegExp(`name="${name}"`));
      assert.match(html, new RegExp(`data-bb-pa-reg-filter-field="${name}"`));
    }
  });

  it("keeps selected filter values after render", () => {
    const html = renderList({
      filters: {
        q: "grace",
        queue: "needs_review",
        selectedPlan: "growth",
        applicationStatus: "submitted",
        provisioningStatus: "not_started",
        followUpStatus: "contact_pending",
        from: "2026-01-01",
        to: "2026-01-31",
        supportRequested: "true",
        requiresReview: "true",
        overdueFollowUp: "true",
        linked: "unlinked",
      },
      limit: 50,
    });
    assert.match(html, /value="grace"/);
    assert.match(html, /value="needs_review"[^>]*selected|selected[^>]*value="needs_review"/);
    assert.match(html, /value="growth"[^>]*selected|selected[^>]*value="growth"/);
    assert.match(html, /value="submitted"[^>]*selected|selected[^>]*value="submitted"/);
    assert.match(html, /value="not_started"[^>]*selected|selected[^>]*value="not_started"/);
    assert.match(html, /value="contact_pending"[^>]*selected|selected[^>]*value="contact_pending"/);
    assert.match(html, /value="2026-01-01"/);
    assert.match(html, /value="2026-01-31"/);
    assert.match(html, /name="support_requested"[\s\S]*value="true"[^>]*selected/);
    assert.match(html, /name="requires_review"[\s\S]*value="true"[^>]*selected/);
    assert.match(html, /name="overdue_follow_up"[\s\S]*value="true"[^>]*selected/);
    assert.match(html, /name="linked"[\s\S]*value="unlinked"[^>]*selected/);
    assert.match(html, /value="50"[^>]*selected|selected[^>]*value="50"/);
    assert.match(html, /data-bb-pa-reg-clear-filters="1"/);
    assert.match(html, /href="\/admin\/registration-applications"/);
  });

  it("hides Clear filters when no active filters", () => {
    const html = renderList({ filters: { linked: "all" } });
    assert.doesNotMatch(html, /data-bb-pa-reg-clear-filters="1"/);
  });

  it("renders empty queue state without create-application CTA", () => {
    const html = renderList({ applications: [], total: 0, filters: {} });
    assert.match(html, /data-bb-pa-reg-state="empty"/);
    assert.match(html, /No registration applications yet/i);
    assert.doesNotMatch(html, /Manual Invite|Create application|New application/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-state="no-results"/);
  });

  it("renders no-results state with clear action when filters active", () => {
    const html = renderList({
      applications: [],
      total: 0,
      filters: { q: "zzznomatch" },
    });
    assert.match(html, /data-bb-pa-reg-state="no-results"/);
    assert.match(html, /No matching applications/i);
    assert.match(html, /data-bb-pa-reg-clear-filters="1"/);
    assert.match(html, /Clear filters/);
  });

  it("renders in-shell error state with retry to canonical route", () => {
    const html = renderList({ listError: true, applications: [] });
    assert.match(html, /data-bb-pa-reg-list-error="1"/);
    assert.match(html, /data-bb-ds="error-state"/);
    assert.match(html, /Unable to load applications/i);
    assert.match(html, /href="\/admin\/registration-applications"/);
    assert.match(html, />Retry</);
    assert.doesNotMatch(html, /data-bb-pa-reg-filter="1"/);
    assert.doesNotMatch(html, /stack|ECONNREFUSED|postgresql:\/\//i);
  });

  it("renders mobile cards and desktop table without Approve/Reject queue actions", () => {
    const html = renderList({
      total: 1,
      totalPages: 1,
      rangeFrom: 1,
      rangeTo: 1,
      applications: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          churchName: "Queue Test Church",
          city: "Lusaka",
          country: "Zambia",
          selectedPlan: "foundation",
          selectedPlanLabel: "Foundation",
          contactName: "Pat",
          contactEmail: "pat@example.com",
          contactPhone: "+260971000001",
          createdAt: "2026-07-01T00:00:00.000Z",
          displayStatus: "Needs review",
          operatorTone: "warn",
          applicationStatus: "submitted",
          provisioningStatus: "not_started",
          recommendedActionLabel: "Approve and provision",
          openActionLabel: "Review",
          actionHref: "/admin/registration-applications/11111111-1111-4111-8111-111111111111",
          operatorQueue: "needs_review",
        },
      ],
    });
    assert.match(html, /data-bb-pa-reg-table="1"/);
    assert.match(html, /bb-pa-orgs-table-wrap/);
    assert.match(html, /data-bb-pa-reg-cards="1"/);
    assert.match(html, /data-bb-pa-reg-primary="1"/);
    assert.match(html, />Review</);
    assert.doesNotMatch(html, /data-bb-pa-reg-approve|name="approve"|Approve and Provision Church/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-reject|Reject Registration/i);
    assert.doesNotMatch(html, /Verification Progress|phone verification is completed/i);
    assert.doesNotMatch(html, /Confirmed duplicate|No likely duplicate|Possible match/i);
  });

  it("preserves pagination links when multiple pages", () => {
    const html = renderList({
      page: 2,
      limit: 10,
      total: 25,
      totalPages: 3,
      rangeFrom: 11,
      rangeTo: 20,
      filters: { queue: "needs_review", selectedPlan: "foundation" },
      applications: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          churchName: "Paged Church",
          city: "Nairobi",
          country: "Kenya",
          selectedPlan: "foundation",
          selectedPlanLabel: "Foundation",
          contactName: "Sam",
          contactEmail: "sam@example.com",
          createdAt: "2026-07-02T00:00:00.000Z",
          displayStatus: "Needs review",
          operatorTone: "warn",
          applicationStatus: "submitted",
          provisioningStatus: "not_started",
          recommendedActionLabel: "Review",
          openActionLabel: "Review",
          actionHref: "/admin/registration-applications/22222222-2222-4222-8222-222222222222",
        },
      ],
    });
    assert.match(html, /Showing 11–20 of 25/);
    assert.match(html, /page=1/);
    assert.match(html, /page=3/);
    assert.match(html, /queue=needs_review/);
    assert.match(html, /selected_plan=foundation/);
  });
});
