"use strict";

/**
 * Phase2 Prompt 051 — Duplicate Comparison screen rendering (no PostgreSQL).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const {
  COMPARISON_ATTRIBUTE_DEFS,
  buildComparisonAttributeRows,
  RISK_DISPLAY_LABELS,
} = require("../src/blessboard/services/registrationDuplicateMatchesAdminLoader");
const {
  presentAuthorizedComparisonSide,
} = require("../src/blessboard/services/registrationDuplicateMatchQueryService");
const {
  DECISION_OPTIONS,
  isReasonRequired,
} = require("../src/blessboard/services/registrationDuplicateReviewDecisionService");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-duplicate-compare.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function sampleSides() {
  const authorizedSubject = presentAuthorizedComparisonSide("application", "application", {
    id: APP_ID,
    church_name: "Grace Community Church",
    city: "Lusaka",
    country: "Zambia",
    contact_name: "Pat Applicant",
    contact_email: "pat@example.com",
    contact_phone: "+260971234567",
    application_status: "submitted",
    created_at: "2026-07-01T10:00:00.000Z",
  });
  const authorizedCandidate = presentAuthorizedComparisonSide("candidate", "organization", {
    id: ORG_ID,
    display_name: "Grace Community Church",
    legal_name: "Grace Community Church Ltd",
    status: "active",
    primary_email: "office@grace.example",
    primary_phone: "+260977000001",
    created_at: "2025-01-01T10:00:00.000Z",
  });
  return { authorizedSubject, authorizedCandidate };
}

function sampleComparison(overrides = {}) {
  const { authorizedSubject, authorizedCandidate } = sampleSides();
  const attributes = buildComparisonAttributeRows(
    authorizedSubject,
    authorizedCandidate,
    ["exact_church_name", "exact_phone_overlap"],
    { reasonTags: ["Exact name", "Phone match"] }
  );
  const riskLevel = "strong";
  const base = {
    ok: true,
    status: "ok",
    applicationId: APP_ID,
    matchId: MATCH_ID,
    unavailable: false,
    empty: false,
    match: {
      id: MATCH_ID,
      applicationId: APP_ID,
      matchedRecordType: "organization",
      matchedRecordTypeLabel: "Organization",
      candidateLabel: "Grace Community Church",
      riskLevel,
      riskLabel: RISK_DISPLAY_LABELS.strong,
      score: 55,
      reviewDecision: null,
      reviewStatus: "Not reviewed",
      reviewReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reasonTags: ["Exact name", "Phone match"],
      reasons: ["Exact church name match.", "Same normalized phone number."],
    },
    comparison: {
      authorizedSubject,
      authorizedCandidate,
      attributes,
      score: 55,
      riskLevel,
      riskLabel: RISK_DISPLAY_LABELS.strong,
      reasonTags: ["Exact name", "Phone match"],
      reasons: ["Exact church name match.", "Same normalized phone number."],
      explanation: "Strong advisory match on name and phone.",
      decisionOptions: DECISION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        reasonRequired: isReasonRequired(opt.value, riskLevel),
      })),
      reasonRequiredForStrongMatch: true,
    },
    listHref: `/admin/registration-applications/${APP_ID}/duplicates`,
    detailHref: `/admin/registration-applications/${APP_ID}`,
    advisory: true,
    autoMerge: false,
    autoReject: false,
  };
  return {
    ...base,
    ...overrides,
    match: { ...base.match, ...(overrides.match || {}) },
    comparison:
      overrides.comparison === null
        ? null
        : { ...base.comparison, ...(overrides.comparison || {}) },
  };
}

function renderCompare(locals = {}) {
  const source = fs.readFileSync(VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      comparison: sampleComparison(),
      csrfField: CSRF_FIELD,
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("Duplicate Comparison screen rendering (Prompts 051 / 053)", () => {
  it("defines the authorized attribute set required by the screen", () => {
    const keys = COMPARISON_ATTRIBUTE_DEFS.map((d) => d.key);
    for (const key of [
      "legalName",
      "country",
      "province",
      "district",
      "town",
      "address",
      "phone",
      "email",
      "website",
      "registrationNumber",
      "leader",
      "branchCount",
      "adminCount",
      "organizationStatus",
      "createdAt",
    ]) {
      assert.ok(keys.includes(key), `missing attribute ${key}`);
    }
  });

  it("renders desktop side-by-side and mobile attribute cards", () => {
    const html = renderCompare();
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(html, /data-bb-pa-reg-duplicate-compare-screen="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-desktop="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-mobile="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-rows="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr-cards="1"/);
    assert.match(html, /Side-by-side comparison/);
    assert.match(html, /Attribute comparison/);
    assert.match(css, /\.bb-pa-reg-duplicate-compare__desktop/);
    assert.match(css, /\.bb-pa-reg-duplicate-compare__mobile/);
    assert.match(css, /@media \(max-width: 899px\)/);
    assert.match(css, /\.bb-pa-reg-duplicate-compare__decision[\s\S]*position:\s*sticky/);
  });

  it("renders authorized fields with match highlights using text and icons", () => {
    const html = renderCompare();
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="legalName"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="country"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="town"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="phone"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="email"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="website"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="registrationNumber"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="leader"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="branchCount"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="adminCount"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="organizationStatus"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-attr="createdAt"/);
    assert.match(html, /data-compare-state="match"/);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-state="1"/);
    assert.match(html, />Match</);
    assert.match(html, /check_circle/);
    assert.match(html, /Exact name/);
    assert.match(html, /Not provided/);
  });

  it("shows unavailable fields honestly and withholds unrelated user identities", () => {
    const subject = presentAuthorizedComparisonSide("application", "application", {
      id: APP_ID,
      church_name: "Grace",
      contact_email: "pat@example.com",
    });
    const userCandidate = presentAuthorizedComparisonSide("candidate", "user", {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "active",
      email_normalized: "secret@example.com",
    });
    assert.equal(userCandidate.emailWithheld, true);
    assert.equal(userCandidate.phoneWithheld, true);
    const attributes = buildComparisonAttributeRows(subject, userCandidate, [
      "platform_user_email",
    ]);
    const emailAttr = attributes.find((a) => a.key === "email");
    assert.equal(emailAttr.candidateValue, "Not shown");
    const html = renderCompare({
      comparison: sampleComparison({
        comparison: {
          ...sampleComparison().comparison,
          authorizedCandidate: userCandidate,
          attributes,
        },
        match: {
          ...sampleComparison().match,
          matchedRecordType: "user",
          matchedRecordTypeLabel: "Platform user account",
          candidateLabel: "Platform user account",
        },
      }),
    });
    assert.doesNotMatch(html, /secret@example\.com/);
    assert.match(html, /Not shown/);
    assert.match(html, /data-bb-pa-unavailable="user-identities"/);
  });

  it("renders error state without the decision form when comparison is unavailable", () => {
    const html = renderCompare({
      comparison: sampleComparison({
        unavailable: true,
        comparison: null,
      }),
    });
    assert.match(html, /data-bb-pa-reg-duplicate-compare-error="1"/);
    assert.match(html, /data-bb-ds="error-state"/);
    assert.doesNotMatch(html, /data-bb-pa-reg-duplicate-decision-form="1"/);
    assert.match(html, /data-bb-pa-unavailable="auto-merge"/);
    assert.match(html, /data-bb-pa-unavailable="auto-approve"/);
  });

  it("renders the decision form with CSRF, options, and reason guidance", () => {
    const html = renderCompare();
    assert.match(html, /data-bb-pa-reg-duplicate-decision="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-decision-form="1"/);
    assert.match(
      html,
      new RegExp(
        `action="/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}/decision"`
      )
    );
    assert.match(html, new RegExp(`name="${CSRF_FIELD}"`));
    assert.match(html, /value="test-csrf-token"/);
    assert.match(html, /name="decision"/);
    assert.match(html, /name="reason"/);
    for (const opt of DECISION_OPTIONS) {
      assert.match(html, new RegExp(`value="${opt.value}"`));
      assert.match(html, new RegExp(opt.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(html, /data-bb-pa-reg-duplicate-reason-guidance="1"/);
    assert.match(html, /impersonation concern/i);
    assert.match(html, /confirmed duplicate/i);
    assert.match(html, /strong or confirmed match/i);
    assert.match(html, /does not merge/i);
    assert.match(html, /data-bb-pa-auto-merge="0"/);
    assert.match(html, /data-bb-pa-auto-reject="0"/);
    assert.match(html, /data-bb-pa-auto-approve="0"/);
  });

  it("shows current review state with reviewer and reviewed time when present", () => {
    const html = renderCompare({
      comparison: sampleComparison({
        match: {
          reviewDecision: "different_church",
          reviewStatus: "different church",
          reviewReason: "Separate congregations after site visit",
          reviewedByUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          reviewedAt: "2026-07-24T12:00:00.000Z",
        },
      }),
    });
    assert.match(html, /data-bb-pa-reg-duplicate-review-state="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-review-status="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-review-decision="1">\s*different church\s*</);
    assert.match(
      html,
      /data-bb-pa-reg-duplicate-review-reason="1">\s*Separate congregations after site visit\s*</
    );
    assert.match(html, /data-bb-pa-reg-duplicate-reviewer="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-reviewed-at="1"/);
    assert.match(html, /2026-07-24 12:00 UTC/);
  });

  it("renders safe success and error notices", () => {
    const okHtml = renderCompare({ notice: "duplicate_decision_saved" });
    assert.match(okHtml, /data-bb-pa-reg-duplicate-compare-notice="1"/);
    assert.match(okHtml, /Duplicate review decision saved/);

    const errHtml = renderCompare({ error: "reason_required" });
    assert.match(errHtml, /data-bb-pa-reg-duplicate-compare-error-banner="1"/);
    assert.match(errHtml, /A reason is required/);
  });
});
