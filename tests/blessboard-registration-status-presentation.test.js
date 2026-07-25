"use strict";

/**
 * Phase2 Batch 2 — registration status presentation helpers (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const api = require("../src/blessboard/services/registrationStatusPresentation");

const PARTIAL = path.join(
  __dirname,
  "../views/blessboard/v5/partials/pa-registration-status-chip.ejs"
);

function renderChip(locals) {
  const template = fs.readFileSync(PARTIAL, "utf8");
  return ejs.render(
    template,
    {
      registrationStatus: api,
      ...locals,
    },
    { filename: PARTIAL }
  );
}

describe("registrationStatusPresentation mappings", () => {
  it("maps every application status", () => {
    const expected = {
      submitted: "Submitted",
      duplicate_review: "Duplicate review",
      rejected: "Rejected",
      cancelled: "Cancelled",
      closed: "Closed",
    };
    for (const [value, label] of Object.entries(expected)) {
      const st = api.presentApplicationStatus(value);
      assert.equal(st.known, true);
      assert.equal(st.label, label);
      assert.equal(st.value, value);
      assert.match(st.chipClass, /^bb-pa-chip--/);
      assert.ok(st.label.trim().length > 0);
    }
  });

  it("maps every provisioning status", () => {
    const expected = {
      not_started: "Not started",
      provisioning: "Provisioning",
      provisioned: "Provisioned",
      provisioning_failed: "Provisioning failed",
    };
    for (const [value, label] of Object.entries(expected)) {
      const st = api.presentProvisioningStatus(value);
      assert.equal(st.known, true);
      assert.equal(st.label, label);
      assert.equal(st.value, value);
      assert.match(st.chipClass, /^bb-pa-chip--/);
    }
  });

  it("maps every verification status", () => {
    const expected = {
      not_checked: "Not checked",
      checking: "Checking",
      passed: "Passed",
      warning: "Warning",
      failed: "Failed",
      manually_reviewed: "Manually reviewed",
      overridden: "Overridden",
    };
    for (const [value, label] of Object.entries(expected)) {
      const st = api.presentVerificationStatus(value);
      assert.equal(st.known, true);
      assert.equal(st.label, label);
      assert.equal(st.value, value);
    }
  });

  it("maps every duplicate-risk status", () => {
    const expected = {
      none: "No likely duplicate",
      possible: "Possible match",
      strong: "Strong match",
      confirmed: "Confirmed duplicate",
      incomplete: "Review incomplete",
    };
    for (const [value, label] of Object.entries(expected)) {
      const st = api.presentDuplicateRisk(value);
      assert.equal(st.known, true);
      assert.equal(st.label, label);
      assert.equal(st.value, value);
    }
  });

  it("handles null and empty values safely", () => {
    for (const raw of [null, undefined, "", "   "]) {
      const st = api.presentApplicationStatus(raw);
      assert.equal(st.empty, true);
      assert.equal(st.known, false);
      assert.equal(st.label, api.EMPTY_LABEL);
      assert.equal(st.chipClass, "bb-pa-chip--muted");
    }
  });

  it("handles unknown values without inventing labels", () => {
    const st = api.presentApplicationStatus("brand_new_status");
    assert.equal(st.known, false);
    assert.equal(st.label, api.UNKNOWN_LABEL);
    assert.equal(st.value, "");
    assert.equal(st.chipClass, "bb-pa-chip--muted");
  });

  it("sanitizes unexpected input for attribute values", () => {
    const st = api.presentVerificationStatus('<script>alert(1)</script>');
    assert.equal(st.known, false);
    assert.equal(st.label, api.UNKNOWN_LABEL);
    assert.equal(st.value, "");
    assert.equal(api.sanitizeAttrValue('<script>x</script>'), "scriptx/script");
  });

  it("chipClassForTone maps operator tones to existing chip modifiers", () => {
    assert.equal(api.chipClassForTone("success"), "bb-pa-chip--ok");
    assert.equal(api.chipClassForTone("danger"), "bb-pa-chip--danger");
    assert.equal(api.chipClassForTone("warn"), "bb-pa-chip--warn");
    assert.equal(api.chipClassForTone("muted"), "bb-pa-chip--muted");
    assert.equal(api.chipClassForTone("nope"), "bb-pa-chip--muted");
  });

  it("presentRegistrationStatus dispatches by kind", () => {
    assert.equal(
      api.presentRegistrationStatus("application", "submitted").label,
      "Submitted"
    );
    assert.equal(
      api.presentRegistrationStatus("provisioning", "provisioned").label,
      "Provisioned"
    );
    assert.equal(
      api.presentRegistrationStatus("verification", "passed").label,
      "Passed"
    );
    assert.equal(
      api.presentRegistrationStatus("duplicate_risk", "confirmed").label,
      "Confirmed duplicate"
    );
  });
});

describe("pa-registration-status-chip partial", () => {
  it("renders accessible visible labels for known statuses", () => {
    const html = renderChip({
      statusKind: "application",
      statusValue: "duplicate_review",
    });
    assert.match(html, /data-bb-pa-reg-status="1"/);
    assert.match(html, /data-bb-pa-reg-status-known="1"/);
    assert.match(html, /bb-pa-chip--warn/);
    assert.match(html, />Duplicate review</);
    assert.doesNotMatch(html, /material-symbols-outlined/);
  });

  it("escapes unexpected input in attributes and keeps Unknown label", () => {
    const html = renderChip({
      statusKind: "verification",
      statusValue: '"><img src=x onerror=alert(1)>',
    });
    assert.match(html, /Unknown/);
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /onerror=/);
  });

  it("renders in list-style and detail-style wrappers", () => {
    const listStyle = ejs.render(
      `<td class="bb-pa-list-cell" data-bb-pa-reg-status-row="1">
        <%- include(partial, { statusKind: 'application', statusValue: 'submitted', registrationStatus: api }) %>
        <%- include(partial, { statusKind: 'provisioning', statusValue: 'not_started', registrationStatus: api }) %>
      </td>`,
      { partial: PARTIAL, api },
      { filename: path.join(__dirname, "list-wrap.ejs") }
    );
    assert.match(listStyle, /Submitted/);
    assert.match(listStyle, /Not started/);
    assert.match(listStyle, /data-bb-pa-reg-status-row="1"/);

    const detailStyle = ejs.render(
      `<dl class="bb-pa-dl">
        <div>
          <dt>Application status</dt>
          <dd><%- include(partial, { statusKind: 'application', statusValue: 'rejected', registrationStatus: api }) %></dd>
        </div>
        <div>
          <dt>Verification</dt>
          <dd><%- include(partial, { statusKind: 'verification', statusValue: 'not_checked', registrationStatus: api }) %></dd>
        </div>
        <div>
          <dt>Duplicate risk</dt>
          <dd><%- include(partial, { statusKind: 'duplicate_risk', statusValue: 'incomplete', registrationStatus: api }) %></dd>
        </div>
      </dl>`,
      { partial: PARTIAL, api },
      { filename: path.join(__dirname, "detail-wrap.ejs") }
    );
    assert.match(detailStyle, /Rejected/);
    assert.match(detailStyle, /Not checked/);
    assert.match(detailStyle, /Review incomplete/);
  });

  it("null value renders em dash with muted chip", () => {
    const html = renderChip({ statusKind: "application", statusValue: null });
    assert.match(html, /—|&mdash;|&#8212;/);
    assert.match(html, /bb-pa-chip--muted/);
    assert.match(html, /data-bb-pa-reg-status-known="0"/);
  });
});

describe("registration views wire shared status chips", () => {
  it("list and detail templates include the shared partial", () => {
    const list = fs.readFileSync(
      path.join(
        __dirname,
        "../views/blessboard/v5/platform-admin/registration-applications.ejs"
      ),
      "utf8"
    );
    const detail = fs.readFileSync(
      path.join(
        __dirname,
        "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
      ),
      "utf8"
    );
    const secondary = fs.readFileSync(
      path.join(
        __dirname,
        "../views/blessboard/v5/partials/pa-registration-detail-secondary.ejs"
      ),
      "utf8"
    );
    assert.match(list, /pa-registration-status-chip|data-bb-pa-phase5-status/);
    assert.match(detail, /data-bb-pa-phase5-status|data-bb-pa-display-status/);
    assert.match(secondary, /pa-registration-status-chip/);
    assert.match(secondary, /statusKind: 'application'/);
    assert.match(secondary, /statusKind: 'provisioning'/);
  });

  it("shell locals expose registrationStatus helper", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminShellLocals.js"),
      "utf8"
    );
    assert.match(src, /registrationStatusPresentation/);
    assert.match(src, /registrationStatus,/);
  });
});
