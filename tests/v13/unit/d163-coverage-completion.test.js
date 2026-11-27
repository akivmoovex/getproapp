"use strict";

/**
 * D163 coverage that D150, D159, D161, and D162 do not already assert.
 * Synthetic records only. No PostgreSQL, Resend, or browser.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canAttachLaboratoryResult,
  canAttachRadiologyReport,
  laboratoryQueueTabs,
  radiologyQueueTabs,
  isStoredOrderType,
  isStoredOrderStatus,
  storedDiagnosticUrgency,
  isClosedDiagnosticStatus,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");
const {
  intervalsOverlap,
  isBlockingAppointmentStatus,
  staffOverlapApplies,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");
const community = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { buildSermonFields } = require("../../../src/blessboard/services/publicContentAdminService");
const {
  requireActiveMemberForTenant,
} = require("../../../src/blessboard/services/requireActiveMemberForTenant");
const { serverMemberEmail } = require("../../../src/blessboard/services/blessBoardMemberPortalAuthService");

const CHURCH = "church-d163";
const OTHER = "church-other";
const BRANCH = "branch-d163";
const USER = "user-d163";

function blocksBooking(status, staffId, start, end, otherStart, otherEnd) {
  return (
    staffOverlapApplies(staffId) &&
    isBlockingAppointmentStatus(status) &&
    intervalsOverlap(start, end, otherStart, otherEnd)
  );
}

function memberDb(script) {
  return {
    async query(sql) {
      if (sql.includes("member_branch_memberships")) return { rows: script.membership || [] };
      if (sql.includes("FROM blessboard.members")) return { rows: script.member ? [script.member] : [] };
      if (sql.includes("blessboard.branches")) return { rows: script.branch ? [script.branch] : [] };
      if (sql.includes("blessboard.churches")) return { rows: script.church ? [script.church] : [] };
      if (sql.includes("blessboard.users")) return { rows: script.user ? [script.user] : [] };
      throw new Error("unexpected_sql");
    },
  };
}

const activeUser = { id: USER, status: "active" };
const activeChurch = { id: CHURCH, organization_id: "org-d163", status: "active" };
const activeBranch = { id: BRANCH, church_id: CHURCH, status: "active" };
const activeMember = {
  id: "member-d163",
  church_id: CHURCH,
  user_id: USER,
  status: "active",
  portal_access_status: "active",
};
const activeMembership = {
  id: "membership-d163",
  member_id: "member-d163",
  branch_id: BRANCH,
  membership_status: "active",
};

describe("D163 clinical filters, entry, and print boundaries", () => {
  it("keeps an unknown laboratory filter inactive and does not rewrite a disagreeing total", () => {
    const tabs = laboratoryQueueTabs({ received: 4, resulted: 1, total: 99 }, "forged");
    assert.equal(tabs.every((tab) => tab.active === false), true);
    assert.equal(tabs.find((tab) => tab.key === "received").count, 4);
    assert.equal(tabs.find((tab) => tab.key === "open").count, 4);
    assert.equal(tabs.find((tab) => tab.key === "all").count, 99);
    assert.equal(tabs.find((tab) => tab.key === "received").href.includes("status=received"), true);
  });

  it("allows a laboratory result only while the request is still open", () => {
    for (const status of ["pending_collection", "collected", "received", "processing"]) {
      assert.equal(canAttachLaboratoryResult(status), true, status);
    }
    for (const status of ["resulted", "verified", "released", "forged", ""]) {
      assert.equal(canAttachLaboratoryResult(status), false, status);
    }
    assert.equal(isClosedDiagnosticStatus("verified"), true);
    assert.equal(isClosedDiagnosticStatus("released"), true);
    assert.equal(isClosedDiagnosticStatus("resulted"), false);
  });

  it("allows a radiology report through completion and stops after it is reported", () => {
    const tabs = radiologyQueueTabs({ pending: 2, completed: 5, reported: 7, total: 2 }, "pending");
    assert.equal(tabs.find((tab) => tab.key === "pending").active, true);
    assert.equal(tabs.find((tab) => tab.key === "reported").active, false);
    assert.equal(tabs.find((tab) => tab.key === "open").count, 7);
    assert.equal(tabs.find((tab) => tab.key === "all").count, 2);
    for (const status of ["pending", "in_progress", "completed"]) {
      assert.equal(canAttachRadiologyReport(status), true, status);
    }
    for (const status of ["reported", "verified", "forged", ""]) {
      assert.equal(canAttachRadiologyReport(status), false, status);
    }
  });

  it("rejects an unknown diagnostic type, status, and urgency", () => {
    assert.equal(isStoredOrderType("radiology"), true);
    assert.equal(isStoredOrderType("lab"), false);
    assert.equal(isStoredOrderStatus("cancelled"), true);
    assert.equal(isStoredOrderStatus("deleted"), false);
    assert.equal(storedDiagnosticUrgency(""), "routine");
    assert.equal(storedDiagnosticUrgency("stat"), "stat");
    assert.equal(storedDiagnosticUrgency("emergency"), null);
  });
});

describe("D163 appointment edit, cancellation, and concurrency rules", () => {
  it("treats only a blocking assigned overlap as a conflict", () => {
    const start = Date.parse("2026-12-02T09:00:00.000Z");
    const end = start + 30 * 60 * 1000;
    assert.equal(blocksBooking("confirmed", "staff-1", start, end, start, end), true);
    assert.equal(blocksBooking("confirmed", "staff-1", start, end, end, end + 30 * 60 * 1000), false);
    assert.equal(blocksBooking("cancelled", "staff-1", start, end, start, end), false);
    assert.equal(blocksBooking("confirmed", "   ", start, end, start, end), false);
    assert.equal(blocksBooking("requested", "staff-1", start, end, start + 60 * 1000, end), true);
  });
});

describe("D163 community amount and sermon publication boundaries", () => {
  it("rejects a negative or fractional amount and does not post a zero-amount quote", () => {
    const store = createMemoryCommunityStore();
    const negative = community.previewInvoice(store, {
      personId: "missing-person",
      clinicId: "clinic-d163",
      serviceCode: "consult",
      amountMinor: -1,
    });
    const fraction = community.previewInvoice(store, {
      personId: "missing-person",
      clinicId: "clinic-d163",
      serviceCode: "consult",
      amountMinor: 1.5,
    });
    const zero = community.previewInvoice(store, {
      personId: "missing-person",
      clinicId: "clinic-d163",
      serviceCode: "consult",
      amountMinor: 0,
    });
    assert.equal(negative.ok, false);
    assert.equal(negative.code, "invalid_amount");
    assert.equal(fraction.code, "invalid_amount");
    assert.equal(zero.posted, false);
    assert.equal(zero.discountMinor, 0);
  });

  it("publishes only an explicit sermon status and enforces the title boundary", () => {
    const base = { speakerName: "Pastor Ada", preachedAt: "2026-07-18" };
    assert.equal(buildSermonFields({ ...base, title: "" }, { partial: false }).reason, "title");
    assert.equal(
      buildSermonFields({ ...base, title: "A".repeat(201) }, { partial: false }).reason,
      "title_length"
    );
    const published = buildSermonFields(
      { ...base, title: "A".repeat(200), status: "published" },
      { partial: false }
    );
    assert.equal(published.ok, true);
    assert.equal(published.fields.status, "published");
    assert.equal(buildSermonFields({ ...base, title: "Hope", status: "live" }, { partial: false }).reason, "status");
    assert.equal(
      buildSermonFields({ mediaUrl: "http://files.example/clip.mp3" }, { partial: true }).reason,
      "media_url_https_required"
    );
  });
});

describe("D163 member portal tenant and role denial", () => {
  it("denies a missing user, a missing tenant, and an inactive account before membership", async () => {
    const closed = memberDb({});
    const anonymous = await requireActiveMemberForTenant(closed, {});
    assert.equal(anonymous.status, "unauthenticated");
    const noTenant = await requireActiveMemberForTenant(closed, { userId: USER });
    assert.equal(noTenant.status, "forbidden");
    assert.equal(noTenant.reason, "tenant");
    const inactive = await requireActiveMemberForTenant(
      memberDb({ user: { id: USER, status: "suspended" } }),
      { userId: USER, churchId: CHURCH, branchId: BRANCH }
    );
    assert.equal(inactive.status, "inactive_user");
  });

  it("denies another church, a blocked portal, and a missing branch membership", async () => {
    const foreign = await requireActiveMemberForTenant(
      memberDb({
        user: activeUser,
        church: activeChurch,
        branch: { ...activeBranch, church_id: OTHER },
      }),
      { userId: USER, churchId: CHURCH, branchId: BRANCH }
    );
    assert.equal(foreign.reason, "branch");
    const blocked = await requireActiveMemberForTenant(
      memberDb({
        user: activeUser,
        church: activeChurch,
        branch: activeBranch,
        member: { ...activeMember, portal_access_status: "blocked" },
      }),
      { userId: USER, churchId: CHURCH, branchId: BRANCH }
    );
    assert.equal(blocked.status, "portal_blocked");
    const otherBranch = await requireActiveMemberForTenant(
      memberDb({
        user: activeUser,
        church: activeChurch,
        branch: activeBranch,
        member: activeMember,
      }),
      { userId: USER, churchId: CHURCH, branchId: BRANCH }
    );
    assert.equal(otherBranch.status, "wrong_branch");
  });

  it("uses only a normalized account email as the OTP destination", () => {
    assert.equal(
      serverMemberEmail(
        { email_normalized: "member.d164@pronline.org" },
        { emailNormalized: "", emailDisplay: "forged.display@example.test" }
      ),
      "member.d164@pronline.org"
    );
    assert.equal(
      serverMemberEmail(
        { email_normalized: "" },
        { emailNormalized: "member.d164@pronline.org", emailDisplay: "forged.display@example.test" }
      ),
      "member.d164@pronline.org"
    );
    assert.equal(
      serverMemberEmail({ email_normalized: "" }, { emailDisplay: "forged.display@example.test" }),
      null
    );
  });

  it("admits only the active member of the requested branch", async () => {
    const admitted = await requireActiveMemberForTenant(
      memberDb({
        user: activeUser,
        church: activeChurch,
        branch: activeBranch,
        member: activeMember,
        membership: [activeMembership],
      }),
      { userId: USER, churchId: CHURCH, branchId: BRANCH }
    );
    assert.equal(admitted.ok, true);
    assert.equal(admitted.member.churchId, CHURCH);
    assert.equal(admitted.membership.branchId, BRANCH);
  });
});
