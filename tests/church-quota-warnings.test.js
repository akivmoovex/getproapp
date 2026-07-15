"use strict";

const path = require("path");
const ejs = require("ejs");
const test = require("node:test");
const assert = require("node:assert/strict");

const { BLESSBOARD_PACKAGES, FAIR_USE } = require("../src/church/blessBoardPackageCatalogue");
const { checkQuota } = require("../src/services/church/churchEntitlementService");
const {
  buildQuotaWarning,
  buildQuotaWarningsFromMeters,
  formatHardLimitFailureMessage,
  filterQuotaWarnings,
} = require("../src/church/blessBoardQuotaWarnings");

const PARTIAL = path.join(__dirname, "../views/church/partials/quota_warnings.ejs");

function foundationPlan() {
  return {
    packageCode: "foundation",
    packageLabel: "Foundation",
    entitlements: BLESSBOARD_PACKAGES.foundation.entitlements,
  };
}

function growthPlan() {
  return {
    packageCode: "growth",
    packageLabel: "Growth",
    entitlements: BLESSBOARD_PACKAGES.growth.entitlements,
  };
}

function meterFromQuota(quota) {
  const warningBand = quota.warningBand || null;
  let state = "ok";
  if (quota.status === "exceeded" || quota.status === "at_limit" || warningBand === 100) {
    state = "blocked";
  } else if (
    warningBand === 90 ||
    warningBand === 80 ||
    quota.status === "near" ||
    quota.status === "warn_90" ||
    quota.status === "warn_80"
  ) {
    state = "warning";
  }
  return {
    key: quota.key,
    used: quota.used,
    limit: quota.limit,
    status: quota.status,
    warningBand,
    state,
    display: `${quota.used} / ${quota.limit}`,
  };
}

test("79 percent does not warn; 80 / 90 / 100 percent escalate", () => {
  const plan = foundationPlan();
  const at79 = meterFromQuota(checkQuota(plan, "members.max_active", 197));
  assert.equal(at79.warningBand, null);
  assert.equal(buildQuotaWarning(at79, { meterKey: "members", packageLabel: "Foundation" }), null);

  const at80 = meterFromQuota(checkQuota(plan, "members.max_active", 200));
  assert.equal(at80.warningBand, 80);
  const w80 = buildQuotaWarning(at80, { meterKey: "members", packageLabel: "Foundation" });
  assert.equal(w80.band, 80);
  assert.equal(w80.level, "info");
  assert.match(w80.message, /80%/);
  assert.equal(w80.restrictedAction, null);
  assert.equal(w80.guidance, null);

  const at90 = meterFromQuota(checkQuota(plan, "members.max_active", 225));
  assert.equal(at90.warningBand, 90);
  const w90 = buildQuotaWarning(at90, { meterKey: "members", packageLabel: "Foundation" });
  assert.equal(w90.band, 90);
  assert.equal(w90.level, "strong");
  assert.match(w90.message, /90%/);
  assert.match(w90.guidance, /Archive|before you reach capacity/i);
  assert.equal(w90.restrictedAction, null);

  const at100 = meterFromQuota(checkQuota(plan, "members.max_active", 250));
  assert.equal(at100.warningBand, 100);
  const w100 = buildQuotaWarning(at100, { meterKey: "members", packageLabel: "Foundation" });
  assert.equal(w100.band, 100);
  assert.equal(w100.level, "limit");
  assert.match(w100.restrictedAction, /Verifying or activating/i);
  assert.match(w100.existingDataNote, /Existing data remains available/);
  assert.match(w100.guidance, /upgrade to Growth/i);
});

test("over-limit legacy tenant uses exceeded messaging at band 100", () => {
  const plan = foundationPlan();
  const over = meterFromQuota(checkQuota(plan, "members.max_active", 260));
  assert.equal(over.status, "exceeded");
  const w = buildQuotaWarning(over, { meterKey: "members", packageLabel: "Foundation" });
  assert.equal(w.band, 100);
  assert.match(w.message, /over the Foundation limit/i);
  assert.match(w.message, /restricted/i);
  assert.match(w.existingDataNote, /Existing data remains available/);
});

test("Foundation warns on members admins storage emails; Growth fair use does not", () => {
  const foundation = foundationPlan();
  const growth = growthPlan();

  const fMeters = {
    members: meterFromQuota(checkQuota(foundation, "members.max_active", 200)),
    admins: meterFromQuota(checkQuota(foundation, "admins.max", 9)),
    storage: meterFromQuota(
      checkQuota(foundation, "storage.bytes", Math.ceil(2147483648 * 0.9))
    ),
    externalEmails: meterFromQuota(checkQuota(foundation, "external_emails.monthly", 500)),
  };
  const fWarnings = buildQuotaWarningsFromMeters(fMeters, {
    packageCode: "foundation",
    packageLabel: "Foundation",
  });
  assert.equal(fWarnings.length, 4);
  assert.ok(fWarnings.every((w) => w.band >= 80));

  const gMeters = {
    members: {
      key: "members.max_active",
      used: 5000,
      limit: FAIR_USE,
      status: "fair_use",
      warningBand: null,
      display: "5000 / fair use",
    },
    admins: {
      key: "admins.max",
      used: 50,
      limit: FAIR_USE,
      status: "fair_use",
      warningBand: null,
      display: "50 / fair use",
    },
    storage: meterFromQuota(
      checkQuota(growth, "storage.bytes", 1000, { activeBranchCount: 1 })
    ),
    externalEmails: meterFromQuota(
      checkQuota(growth, "external_emails.monthly", 100, { activeBranchCount: 1 })
    ),
  };
  const gWarnings = buildQuotaWarningsFromMeters(gMeters, {
    packageCode: "growth",
    packageLabel: "Growth",
  });
  assert.equal(gWarnings.filter((w) => w.meterKey === "members" || w.meterKey === "admins").length, 0);
});

test("hard limit failure message states restricted action and existing data", () => {
  const msg = formatHardLimitFailureMessage("members", {
    packageLabel: "Foundation",
    used: 250,
    limit: 250,
  });
  assert.match(msg, /Verifying or activating additional members is restricted/);
  assert.match(msg, /Existing data remains available/);
  assert.match(msg, /Archive or suspend/);
  assert.match(msg, /upgrade to Growth/);
});

test("quota warning partial renders bands and ignores empty list", async () => {
  const empty = await ejs.renderFile(PARTIAL, { quotaWarnings: [] });
  assert.equal(empty.trim(), "");

  const html = await ejs.renderFile(PARTIAL, {
    quotaWarnings: [
      buildQuotaWarning(meterFromQuota(checkQuota(foundationPlan(), "admins.max", 10)), {
        meterKey: "admins",
        packageLabel: "Foundation",
      }),
    ],
  });
  assert.match(html, /data-quota-band="100"/);
  assert.match(html, /data-quota-meter="admins"/);
  assert.match(html, /Existing data remains available/);
  assert.match(html, /church-alert--warning/);
});

test("filterQuotaWarnings scopes list pages; unauthorised member surfaces get none by omission", () => {
  const warnings = buildQuotaWarningsFromMeters(
    {
      members: meterFromQuota(checkQuota(foundationPlan(), "members.max_active", 200)),
      admins: meterFromQuota(checkQuota(foundationPlan(), "admins.max", 9)),
      storage: meterFromQuota(
        checkQuota(foundationPlan(), "storage.bytes", Math.ceil(2147483648 * 0.8))
      ),
      externalEmails: meterFromQuota(checkQuota(foundationPlan(), "external_emails.monthly", 400)),
    },
    { packageLabel: "Foundation" }
  );
  const memberOnly = filterQuotaWarnings(warnings, ["members"]);
  assert.equal(memberOnly.length, 1);
  assert.equal(memberOnly[0].meterKey, "members");

  // Ordinary members never receive planContext/quotaWarnings in member portal views.
  const memberPortalLocals = { quotaWarnings: undefined, planContext: null };
  assert.equal(
    !memberPortalLocals.quotaWarnings && !memberPortalLocals.planContext,
    true
  );
});
