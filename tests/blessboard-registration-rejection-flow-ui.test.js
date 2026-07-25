"use strict";

/**
 * Phase 5 — rejection confirmation / rejected result UI (markup; no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");
const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");

const REJECT_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-reject.ejs"
);
const REJECTED_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-rejected.ejs"
);
const DETAIL_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const SHELL = path.join(
  __dirname,
  "../views/blessboard/v5/partials/platform-admin-shell-start.ejs"
);

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    riskReviewActionsAvailable: true,
    rejectActionsAvailable: true,
    networkApproveAvailable: false,
    ...overrides,
  };
}

function render(view, locals) {
  const source = fs.readFileSync(view, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationQueue,
      registrationStatus,
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      ...locals,
    },
    { filename: view, root: PARTIALS, views: [PARTIALS] }
  );
}

describe("Phase 5 rejection presentation helpers", () => {
  it("maps Rejected visible label from application_status", () => {
    const status = registrationQueue.presentPhase5QueueStatus({
      application_status: "rejected",
      provisioning_status: "not_started",
      follow_up_status: "contact_pending",
    });
    assert.equal(status.key, "rejected");
    assert.equal(status.label, "Rejected");
  });

  it("words rejection delivery honestly", () => {
    const recorded = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        rejectionCategory: "duplicate_registration",
        rejectionReason: "Internal",
        rejectionNotificationStatus: "recorded",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z", actor_user_id: "a" }],
      },
      { items: [] }
    );
    assert.equal(recorded.deliveryLabel, "Rejection recorded");
    assert.equal(recorded.categoryLabel, "Duplicate church");
    assert.equal(recorded.canReopen, true);

    const sent = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        rejectionNotificationStatus: "sent",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z" }],
      },
      null
    );
    assert.equal(sent.deliveryLabel, "Email sent");

    const unavailable = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        rejectionNotificationStatus: "sending_unavailable",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z" }],
      },
      null
    );
    assert.equal(unavailable.deliveryLabel, "Delivery unavailable");

    const failed = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        rejectionNotificationStatus: "failed",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z" }],
      },
      null
    );
    assert.equal(failed.deliveryLabel, "Delivery failed");
  });

  it("hides reopen when linked or provisioned", () => {
    const linked = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        organizationId: "org-1",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z" }],
      },
      null
    );
    assert.equal(linked.canReopen, false);
  });
});

describe("Phase 5 rejection UI (no Postgres)", () => {
  it("loads reject page with contact summary, reasons, CSRF, and cancel", () => {
    const html = render(REJECT_VIEW, {
      application: baseApp(),
      rejectReasons: registrationQueue.PHASE5_REJECT_REASONS,
      preselectCategory: "",
      rejectBlocked: false,
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-reject="1"/);
    assert.match(html, /data-bb-pa-reg-reject-church="1"[^>]*>Grace Test Church</);
    assert.match(html, /data-bb-pa-reg-reject-contact="1"/);
    assert.match(html, /data-bb-pa-reg-reject-reason="duplicate_registration"/);
    assert.match(html, /Confirm rejection/i);
    assert.match(html, /data-bb-pa-reg-reject-confirm-check="1"/);
    assert.match(html, /data-bb-pa-reg-reject-processing="1"/);
    assert.match(
      html,
      /action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reject"/
    );
    assert.match(html, /name="_csrf" value="test-csrf"/);
    assert.match(html, /data-bb-pa-reg-reject-cancel="1"/);
    assert.match(html, /data-bb-pa-reg-reject-no-send-claim="1"/);
  });

  it("preselects duplicate reason and shows matching record context", () => {
    const html = render(REJECT_VIEW, {
      application: baseApp(),
      rejectReasons: registrationQueue.PHASE5_REJECT_REASONS,
      preselectCategory: "duplicate_registration",
      rejectBlocked: false,
      duplicateWarning: {
        show: true,
        match: {
          name: "Existing Grace Church",
          location: "Lusaka",
          reason: "Similar church name",
          existingHref: "/admin/registration-applications/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        },
      },
    });
    assert.match(html, /data-bb-pa-reg-dup-banner="1"/);
    assert.match(html, /data-bb-pa-reg-dup-name="1"[^>]*>Existing Grace Church</);
    assert.match(html, /data-bb-pa-reg-dup-view-existing="1"/);
    assert.match(
      html,
      /name="rejection_category"[\s\S]*value="duplicate_registration"[^>]*checked/
    );
  });

  it("shows blocked state without rejection form for provisioned applications", () => {
    const html = render(REJECT_VIEW, {
      application: baseApp({
        applicationStatus: "approved",
        provisioningStatus: "provisioned",
        organizationId: "org-1",
        rejectActionsAvailable: false,
      }),
      rejectReasons: registrationQueue.PHASE5_REJECT_REASONS,
      rejectBlocked: true,
      organizationHref: "/admin/organizations/grace-test",
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-reject-blocked="1"/);
    assert.match(html, /data-bb-pa-reg-reject-blocked-panel="1"/);
    assert.match(html, /data-bb-pa-reg-reject-org="1"/);
    assert.doesNotMatch(html, /data-bb-pa-reg-reject-form="1"/);
  });

  it("escapes applicant and administrator text on rejected result", () => {
    const summary = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        rejectionCategory: "other",
        rejectionReason: 'Internal <script>alert(1)</script>',
        rejectionNotificationStatus: null,
        reviewEvents: [
          {
            action: "reject",
            at: "2026-07-25T12:00:00.000Z",
            actor_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          },
        ],
      },
      {
        items: [
          {
            communicationType: "rejection_notice",
            applicantMessage: 'Facing <img src=x onerror=alert(1)>',
          },
        ],
      }
    );
    const html = render(REJECTED_VIEW, {
      application: baseApp({ applicationStatus: "rejected", rejectActionsAvailable: false }),
      rejectionSummary: summary,
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-rejected="1"/);
    assert.match(html, /Rejection recorded/);
    assert.match(html, /Internal &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Facing &lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /data-bb-pa-reg-rejected-reopen="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-return="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-view="1"/);
  });

  it("omits reopen when unsupported", () => {
    const summary = registrationQueue.presentPhase5RejectionSummary(
      {
        applicationStatus: "rejected",
        organizationId: "org-1",
        provisioningStatus: "provisioned",
        reviewEvents: [{ action: "reject", at: "2026-07-25T12:00:00.000Z" }],
      },
      null
    );
    const html = render(REJECTED_VIEW, {
      application: baseApp({
        applicationStatus: "rejected",
        organizationId: "org-1",
        provisioningStatus: "provisioned",
      }),
      rejectionSummary: summary,
      duplicateWarning: { show: false },
    });
    assert.doesNotMatch(html, /data-bb-pa-reg-rejected-reopen="1"/);
  });

  it("hub reject links use dedicated /reject route and hide unsafe reject", () => {
    const open = render(DETAIL_VIEW, {
      application: baseApp(),
      communications: { items: [], summary: {}, unavailable: false },
      contacts: [],
      auditEvents: [],
      platformAdmins: [],
      followUpStatuses: [],
      contactMethods: [],
      contactOutcomes: [],
      duplicateWarning: { show: false },
      intent: "",
    });
    assert.match(
      open,
      /href="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reject"/
    );
    assert.match(open, /data-bb-pa-phase5-decision="reject"/);

    const provisioned = render(DETAIL_VIEW, {
      application: baseApp({
        applicationStatus: "approved",
        provisioningStatus: "provisioned",
        organizationId: "org-1",
        rejectActionsAvailable: false,
        riskReviewActionsAvailable: false,
      }),
      communications: { items: [], summary: {}, unavailable: false },
      contacts: [],
      auditEvents: [],
      platformAdmins: [],
      followUpStatuses: [],
      contactMethods: [],
      contactOutcomes: [],
      duplicateWarning: { show: false },
      intent: "",
    });
    assert.doesNotMatch(provisioned, /data-bb-pa-phase5-decision="reject"/);
  });

  it("includes mobile responsive hooks and bumped CSS cache", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-reject\b/);
    assert.match(css, /\.bb-pa-reg-rejected\b/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*bb-pa-reg-reject__actions/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=55/);
  });
});
