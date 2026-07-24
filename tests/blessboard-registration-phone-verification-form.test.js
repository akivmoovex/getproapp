"use strict";

/**
 * Phase2 Prompt 031 — Record call attempt form on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  derivePhoneVerificationSummary,
} = require("../src/blessboard/services/registrationPhoneVerificationService");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    roleInChurch: "Pastor",
    city: "Lusaka",
    country: "Zambia",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    isNetworkPlan: false,
    supportRequested: false,
    consentTerms: true,
    createdAt: "2026-07-01T12:00:00.000Z",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    displayStatus: "Needs review",
    operatorTone: "warn",
    operatorQueue: "needs_review",
    statusExplanation: "Held for review.",
    riskReviewActionsAvailable: true,
    rejectActionsAvailable: true,
    retryProvisionAvailable: false,
    networkApproveAvailable: false,
    markValidationCompleteAvailable: false,
    followUpAvailable: true,
    supportAssignmentAvailable: true,
    contactHistoryAvailable: true,
    linkOrganizationAvailable: true,
    operatorView: {
      displayStatus: "Needs review",
      tone: "warn",
      queue: "needs_review",
      explanation: "Held for review.",
      recommendedActionLabel: "Approve and provision",
    },
    ...overrides,
  };
}

function sampleAttempts() {
  return [
    {
      id: "attempt-1",
      attempted_at: "2026-07-22T12:00:00.000Z",
      phone_number_called: "+260971000001",
      outcome: "answered",
      applicant_identity_status: "confirmed",
      applicant_authority_status: "not_checked",
      verification_result: "pending",
      notes: "Prior call",
    },
  ];
}

function samplePhoneVerification(overrides = {}) {
  const attempts = overrides.attempts != null ? overrides.attempts : sampleAttempts();
  const summary =
    overrides.summary != null
      ? overrides.summary
      : derivePhoneVerificationSummary(attempts, { now: "2026-07-23T12:00:00.000Z" });
  return {
    attempts,
    summary,
    ...overrides,
    attempts: overrides.attempts != null ? overrides.attempts : attempts,
    summary: overrides.summary != null ? overrides.summary : summary,
  };
}

function renderDetail(locals = {}) {
  const source = fs.readFileSync(VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationStatus,
      application: baseApp(),
      contacts: [],
      auditEvents: [],
      platformAdmins: [],
      followUpStatuses: ["contact_pending"],
      contactMethods: ["phone", "email"],
      contactOutcomes: ["reached", "other"],
      csrfField: "_csrf",
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      verification: null,
      reviewRecommendation: null,
      approvalChecklist: null,
      phoneVerification: samplePhoneVerification(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function phoneSlice(html) {
  const start = html.indexOf('id="reg-phone-verification"');
  const end = html.indexOf('id="reg-activity"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function formSlice(html) {
  const slice = phoneSlice(html);
  const start = slice.indexOf('data-bb-pa-reg-phone-form="1"');
  assert.ok(start >= 0, "form missing");
  const fromForm = slice.slice(slice.lastIndexOf("<form", start));
  const end = fromForm.indexOf("</form>");
  assert.ok(end > 0);
  return fromForm.slice(0, end + "</form>".length);
}

describe("registration phone verification record form (Prompt 031, no Postgres)", () => {
  it("posts to the existing attempts route with CSRF", () => {
    const html = renderDetail();
    const form = formSlice(html);
    assert.match(
      form,
      new RegExp(
        `method="post"[\\s\\S]*action="/admin/registration-applications/${APP_ID}/phone-verification/attempts"`
      )
    );
    assert.match(form, /name="_csrf"\s+value="test-csrf-token"/);
  });

  it("renders all accepted fields", () => {
    const form = formSlice(renderDetail());
    const fields = [
      "phone_number_called",
      "country",
      "contact_person_name",
      "contact_person_role",
      "attempted_at",
      "outcome",
      "applicant_identity_status",
      "applicant_authority_status",
      "verification_result",
      "verification_reason",
      "notes",
      "follow_up_at",
    ];
    for (const name of fields) {
      assert.match(form, new RegExp(`name="${name}"`));
      assert.match(form, new RegExp(`data-bb-pa-reg-phone-field="${name}"`));
    }
  });

  it("does not submit application id, administrator id, or normalized phone as trusted hiddens", () => {
    const form = formSlice(renderDetail());
    assert.doesNotMatch(form, /name="application_id"|name="applicationId"/i);
    assert.doesNotMatch(form, /name="administrator_id"|name="admin_id"|name="created_by/i);
    assert.doesNotMatch(form, /name="phone_number_normalized"|name="contact_phone_normalized"/i);
    assert.doesNotMatch(form, /name="approval_|name="checklist_|name="recommendation_/i);
    const hiddens = form.match(/<input[^>]*type="hidden"[^>]*>/gi) || [];
    assert.equal(hiddens.length, 1);
    assert.match(hiddens[0], /name="_csrf"/);
  });

  it("safely prefills applicant phone and country", () => {
    const html = renderDetail({
      application: baseApp({
        contactPhone: '+260<script>alert(1)</script>',
        country: 'ZM"><img src=x onerror=alert(1)>',
      }),
    });
    const form = formSlice(html);
    assert.match(form, /name="phone_number_called"[\s\S]*?value="\+260&lt;script&gt;alert\(1\)&lt;\/script&gt;"/);
    assert.match(form, /name="country"[\s\S]*?value="ZM(?:&quot;|&#34;)&gt;&lt;img src=x onerror=alert\(1\)&gt;"/);
    assert.doesNotMatch(form, /value="[^"]*<script/i);
    assert.doesNotMatch(form, /value="[^"]*<img/i);
  });

  it("uses conservative defaults and does not default to verified", () => {
    const form = formSlice(renderDetail());
    assert.match(form, /name="outcome"[\s\S]*?<option value="" selected>Select outcome<\/option>/);
    assert.match(
      form,
      /name="applicant_identity_status"[\s\S]*?<option value="not_checked" selected>Not checked<\/option>/
    );
    assert.match(
      form,
      /name="applicant_authority_status"[\s\S]*?<option value="not_checked" selected>Not checked<\/option>/
    );
    assert.match(
      form,
      /name="verification_result"[\s\S]*?<option value="pending" selected>Pending<\/option>/
    );
    assert.doesNotMatch(
      form,
      /name="verification_result"[\s\S]*?<option value="verified" selected>/
    );
    assert.match(form, /name="verification_reason"[\s\S]*?><\/textarea>/);
    assert.match(form, /name="follow_up_at"[\s\S]*?(?:><\/input>|\/>)/);
    assert.doesNotMatch(form, /name="applicant_identity_status"[\s\S]*?<option value="confirmed" selected>/);
    assert.doesNotMatch(form, /name="applicant_authority_status"[\s\S]*?<option value="confirmed" selected>/);
  });

  it("renders every allowlisted option", () => {
    const form = formSlice(renderDetail());
    for (const [value, label] of [
      ["answered", "Answered"],
      ["no_answer", "No answer"],
      ["unavailable", "Number unavailable"],
      ["wrong_number", "Wrong number"],
      ["callback_requested", "Callback requested"],
      ["information_inconsistent", "Information inconsistent"],
    ]) {
      assert.match(form, new RegExp(`<option value="${value}">${label}</option>`));
    }
    for (const [value, label] of [
      ["not_checked", "Not checked"],
      ["confirmed", "Confirmed"],
      ["not_confirmed", "Not confirmed"],
    ]) {
      assert.match(
        form,
        new RegExp(`name="applicant_identity_status"[\\s\\S]*?<option value="${value}"[^>]*>${label}</option>`)
      );
      assert.match(
        form,
        new RegExp(`name="applicant_authority_status"[\\s\\S]*?<option value="${value}"[^>]*>${label}</option>`)
      );
    }
    for (const [value, label] of [
      ["pending", "Pending"],
      ["verified", "Verified"],
      ["failed", "Failed"],
    ]) {
      assert.match(
        form,
        new RegExp(`name="verification_result"[\\s\\S]*?<option value="${value}"[^>]*>${label}</option>`)
      );
    }
  });

  it("renders guidance text and correct submit label", () => {
    const form = formSlice(renderDetail());
    assert.match(form, /Answered does not automatically mean verified/);
    assert.match(form, /Verified requires applicant identity confirmation/);
    assert.match(form, /Authority confirmation should only be selected when discussed during an answered call/);
    assert.match(form, /A reason is required when marking verified or failed/);
    assert.match(form, /Use follow-up when another call or document is needed/);
    assert.match(form, /data-bb-pa-reg-phone-submit="1">\s*Record call attempt\s*</);
  });

  it("renders allowlisted notices and errors only", () => {
    const ok = renderDetail({ notice: "phone_attempt_recorded", error: null });
    assert.match(ok, /Phone verification attempt recorded\./);
    assert.doesNotMatch(ok, /<script>/);

    const invalid = renderDetail({ notice: null, error: "invalid" });
    assert.match(
      invalid,
      /The request could not be processed\. Review the fields and try again\./
    );

    const failed = renderDetail({ notice: null, error: "phone_attempt_failed" });
    assert.match(failed, /The call attempt could not be saved right now\./);

    const arbitrary = renderDetail({
      notice: '<img src=x onerror=alert(1)>',
      error: 'DROP TABLE users; --',
    });
    assert.doesNotMatch(arbitrary, /<img src=x/);
    assert.doesNotMatch(arbitrary, /DROP TABLE users/);
    assert.doesNotMatch(arbitrary, /&lt;img src=x/);
  });

  it("keeps history visible and places the form before history", () => {
    const slice = phoneSlice(renderDetail());
    const formIdx = slice.indexOf('data-bb-pa-reg-phone-form="1"');
    const historyIdx = slice.indexOf('data-bb-pa-reg-phone-history="1"');
    const attemptIdx = slice.indexOf('data-bb-pa-reg-phone-attempt-list="1"');
    assert.ok(formIdx >= 0 && historyIdx > formIdx);
    assert.ok(attemptIdx > historyIdx);
    assert.match(slice, /data-bb-pa-reg-phone-record="1"/);
    assert.match(slice, /data-bb-pa-reg-phone-record-summary="1">Record call attempt</);
    assert.match(slice, /<details class="bb-pa-reg-phone__record"/);
    assert.doesNotMatch(slice, /<details[^>]*open/);
  });

  it("preserves Approve and Reject forms unchanged", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/approve"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/reject"/);
  });

  it("does not calculate approval or verification status in client script", () => {
    const slice = phoneSlice(renderDetail());
    assert.doesNotMatch(slice, /<script[\s\S]*verification/i);
    assert.doesNotMatch(slice, /derivePhoneVerification|approvalChecklist|recommendedAction/);
    const source = fs.readFileSync(VIEW, "utf8");
    const phoneBlock = source.slice(
      source.indexOf("<!-- Phone verification"),
      source.indexOf("<!-- Review activity -->")
    );
    assert.doesNotMatch(phoneBlock, /<script/);
  });

  it("uses a mobile-friendly form structure without wide tables", () => {
    const slice = phoneSlice(renderDetail());
    assert.doesNotMatch(slice, /<table/);
    assert.match(slice, /bb-pa-reg-phone__form/);
    assert.match(slice, /bb-pa-reg-phone__fieldset/);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-phone__record/);
    assert.match(css, /\.bb-pa-reg-phone__form/);
  });

  it("escapes dynamic values in the phone section", () => {
    const html = renderDetail({
      application: baseApp({
        contactName: 'Pat <b>Bold</b>',
        contactPhone: '"><script>x</script>',
        country: "<zambia>",
      }),
      phoneVerification: samplePhoneVerification({
        attempts: [
          {
            id: "a1",
            attempted_at: "2026-07-22T12:00:00.000Z",
            phone_number_called: "+1",
            outcome: "answered",
            notes: "<img src=x>",
            verification_result: "pending",
            applicant_identity_status: "not_checked",
            applicant_authority_status: "not_checked",
          },
        ],
      }),
    });
    const slice = phoneSlice(html);
    assert.doesNotMatch(slice, /<b>Bold<\/b>/);
    assert.doesNotMatch(slice, /<script>x<\/script>/);
    assert.doesNotMatch(slice, /<img src=x>/);
    assert.match(slice, /Pat &lt;b&gt;Bold&lt;\/b&gt;/);
  });
});
