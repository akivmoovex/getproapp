"use strict";

/**
 * Phase2 Prompt 050 — Duplicate Matches screen rendering (no PostgreSQL).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const {
  presentMatchForView,
  RISK_DISPLAY_LABELS,
} = require("../src/blessboard/services/registrationDuplicateMatchesAdminLoader");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-duplicates.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function sampleMatch(overrides = {}) {
  return presentMatchForView(
    {
      id: MATCH_ID,
      matchedRecordType: "organization",
      matchedRecordId: ORG_ID,
      score: 55,
      riskLevel: "strong",
      reviewDecision: null,
      evidenceSnapshot: {
        signals: ["exact_church_name", "exact_phone_overlap", "same_city_country"],
        reasons: [
          {
            code: "exact_church_name",
            weight: 12,
            message: "Exact church name match after normalization.",
          },
          {
            code: "exact_phone_overlap",
            weight: 55,
            message: "Same normalized phone number.",
          },
          {
            code: "same_city_country",
            weight: 8,
            message: "Same town/city and country.",
          },
        ],
        explanation: "Strong advisory match on name and phone.",
      },
      candidate: {
        type: "organization",
        id: ORG_ID,
        displayName: "Grace Community Church",
        organizationKey: "grace",
        status: "active",
        dataEnvironment: "production",
        hasPrimaryEmail: true,
        city: "Lusaka",
        country: "Zambia",
      },
      ...overrides,
    },
    APP_ID
  );
}

function sampleDuplicates(overrides = {}) {
  const match = sampleMatch();
  return {
    ok: true,
    status: "ok",
    applicationId: APP_ID,
    subject: {
      id: APP_ID,
      type: "application",
      churchName: "Grace Community Church",
      city: "Lusaka",
      country: "Zambia",
      applicationStatus: "submitted",
      provisioningStatus: "not_started",
      organizationId: null,
      hasContactEmail: true,
      hasContactPhone: true,
    },
    matches: [match],
    empty: false,
    unavailable: false,
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
    detailHref: `/admin/registration-applications/${APP_ID}`,
    ...overrides,
  };
}

function renderDuplicates(locals = {}) {
  const source = fs.readFileSync(VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      duplicates: sampleDuplicates(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("Duplicate Matches screen rendering (Prompt 050)", () => {
  it("renders candidate, risk, score, reasons, location, contact overlap, statuses, and compare", () => {
    const html = renderDuplicates();
    assert.match(html, /data-bb-pa-reg-duplicates-screen="1"/);
    assert.match(html, /data-bb-pa-reg-duplicates-title="1">Duplicate Matches</);
    assert.match(html, /data-bb-pa-reg-duplicates-cards="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-match="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-name="1">\s*Grace Community Church\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-risk="1"\s*>\s*High match\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-score="1"\s*>\s*Score 55\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-location="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-contact-overlap="1"\s*>\s*Phone overlap\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-org-status="1"\s*>\s*active\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-review-status="1"\s*>\s*Not reviewed\s*</);
    assert.match(html, /data-bb-pa-reg-duplicate-reasons="1"/);
    assert.match(html, /data-bb-pa-reg-duplicate-reason="1">Exact name</);
    assert.match(html, /data-bb-pa-reg-duplicate-reason="1">Phone match</);
    assert.match(html, /data-bb-pa-reg-duplicate-compare-link="1"/);
    assert.match(
      html,
      new RegExp(`/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}`)
    );
  });

  it("uses mobile-friendly cards and never renders a matches table", () => {
    const html = renderDuplicates();
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(html, /bb-pa-reg-dup-card/);
    assert.match(html, /bb-pa-reg-duplicates__cards/);
    assert.doesNotMatch(html, /<table[\s\S]*data-bb-pa-reg-duplicate/);
    assert.doesNotMatch(html, /bb-pa-table/);
    assert.match(css, /\.bb-pa-reg-duplicates__cards/);
    assert.match(css, /\.bb-pa-reg-dup-card__compare/);
  });

  it("renders empty state without match cards", () => {
    const html = renderDuplicates({
      duplicates: sampleDuplicates({
        matches: [],
        empty: true,
      }),
    });
    assert.match(html, /data-bb-pa-reg-duplicates-empty="1"/);
    assert.match(html, /data-bb-pa-reg-duplicates-empty-state="1"/);
    assert.match(html, /data-bb-ds="empty-state"/);
    assert.match(html, /No duplicate matches/);
    assert.doesNotMatch(html, /data-bb-pa-reg-duplicate-match="1"/);
  });

  it("renders error state when matches are unavailable", () => {
    const html = renderDuplicates({
      duplicates: sampleDuplicates({
        matches: [],
        empty: true,
        unavailable: true,
        subject: null,
      }),
    });
    assert.match(html, /data-bb-pa-reg-duplicates-unavailable="1"/);
    assert.match(html, /data-bb-pa-reg-duplicates-error="1"/);
    assert.match(html, /data-bb-ds="error-state"/);
    assert.match(html, /Unable to load duplicate matches/);
    assert.doesNotMatch(html, /data-bb-pa-reg-duplicate-match="1"/);
  });

  it("omits approval, rejection, and automatic-match language", () => {
    const html = renderDuplicates();
    assert.doesNotMatch(html, /method="post"/i);
    assert.doesNotMatch(html, />\s*Approve\s*</i);
    assert.doesNotMatch(html, />\s*Reject\s*</i);
    assert.doesNotMatch(html, /Mark Different|Create New Ministry/i);
    assert.doesNotMatch(html, /automatically matched|machine learning|AI Assistant|confidence %/i);
    assert.match(html, /data-bb-pa-auto-merge="0"/);
    assert.match(html, /data-bb-pa-auto-reject="0"/);
    assert.match(html, /data-bb-pa-unavailable="decision-controls"/);
    assert.match(html, /data-bb-pa-unavailable="decision-on-compare"/);
    assert.doesNotMatch(html, /data-bb-pa-unavailable="decision-post"/);
    assert.match(html, /Scores are advisory/);
  });

  it("does not expose unrelated user identities", () => {
    const userMatch = presentMatchForView(
      {
        id: MATCH_ID,
        matchedRecordType: "user",
        matchedRecordId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        score: 18,
        riskLevel: "possible",
        evidenceSnapshot: {
          signals: ["platform_user_email"],
          reasons: [
            {
              code: "platform_user_email",
              weight: 18,
              message: "Applicant email matches an existing platform user account.",
            },
          ],
        },
        candidate: {
          type: "user",
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          label: "Platform user account",
          status: "active",
          email: "secret-user@example.com",
          displayName: "Secret Person",
        },
      },
      APP_ID
    );
    const html = renderDuplicates({
      duplicates: sampleDuplicates({
        matches: [userMatch],
      }),
    });
    assert.match(html, /Platform user account/);
    assert.doesNotMatch(html, /secret-user@example\.com/);
    assert.doesNotMatch(html, /Secret Person/);
    assert.match(html, /data-bb-pa-unavailable="user-identities"/);
  });

  it("maps risk levels to Stitch-aligned display labels without ML confidence theater", () => {
    assert.equal(RISK_DISPLAY_LABELS.confirmed, "Identical match");
    assert.equal(RISK_DISPLAY_LABELS.strong, "High match");
    assert.equal(RISK_DISPLAY_LABELS.possible, "Partial match");
    const confirmed = sampleMatch({ riskLevel: "confirmed", score: 80 });
    assert.equal(confirmed.riskLabel, "Identical match");
    assert.match(renderDuplicates({ duplicates: sampleDuplicates({ matches: [confirmed] }) }), /Score 80/);
  });
});
