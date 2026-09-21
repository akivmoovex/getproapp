"use strict";

/**
 * V8 BlessBoard membership workflow — BB01–BB08, BB11–BB18.
 * Registration, review transitions, privacy, pastoral RBAC, transfers, V7 compat.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const {
  submitMemberRegistration,
  approveMemberRegistration,
  rejectMemberRegistration,
  STATUS,
} = require("../src/blessboard/services/memberRegistrationService");
const {
  createMembershipIntakeForm,
  publishMembershipIntakeForm,
  submitMembershipApplication,
  requestNeedsFollowUp,
  updateRegistrationPastoralNotes,
  getMembershipApplicationForReview,
  requestMemberBranchTransfer,
  reviewMemberBranchTransfer,
  updateApprovedMemberProfile,
  FORBIDDEN_APPLICATION_KEYS,
} = require("../src/blessboard/services/membershipWorkflowService");

const PASSWORD = "MembershipQa99!";
let pool;
let skipReason = null;
let phoneSeq = 770000000;

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function seedChurch(key) {
  const org = await provisionPlatformTenant(pool, {
    organizationKey: key,
    displayName: `Org ${key}`,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: key,
    hostname: `${key}.blessboard.test`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-staging",
    isPrimary: true,
  });
  assert.equal(org.ok, true, org.message);
  const church = await provisionBlessBoardChurch(pool, {
    organizationKey: key,
    churchKey: key,
    displayName: `Church ${key}`,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "HQ",
  });
  assert.equal(church.ok, true, church.message);

  // Second branch for transfers
  const branch2 = await pool.query(
    `INSERT INTO blessboard.branches
       (church_id, branch_key, display_name, status, branch_type, is_primary)
     VALUES ($1, 'north', 'North Campus', 'active', 'branch', false)
     RETURNING id, branch_key, display_name, church_id, status`,
    [church.records.church.id]
  );

  return {
    organization: org.records.organization,
    church: church.records.church,
    branch: church.records.hqBranch,
    branch2: branch2.rows[0],
  };
}

async function makeUser(opts) {
  const created = await createBlessBoardUser(pool, {
    email: opts.email,
    displayName: opts.email,
    password: PASSWORD,
  });
  assert.equal(created.ok, true, created.reason || created.message);
  const assigned = await assignBlessBoardRole(pool, {
    email: opts.email,
    organizationKey: opts.organizationKey,
    churchKey: opts.churchKey,
    roleKey: opts.roleKey,
    branchKey: opts.branchKey || undefined,
  });
  assert.equal(assigned.ok, true, assigned.message);
  return created.user;
}

function tenantCtx(seed) {
  return {
    resolved: true,
    church: { id: seed.church.id },
    primaryBranch: { id: seed.branch.id },
    organization: { id: seed.organization.id },
  };
}

before(async () => {
  try {
    const databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    await migrate({ connectionString: databaseUrl });
  } catch (err) {
    skipReason = err && err.message ? err.message : String(err);
    pool = null;
  }
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe("V8 BlessBoard membership workflow", () => {
  it("publishes intake form and accepts multi-step application without login", async () => {
    requireDb();
    const key = uniq("bb-mem");
    const seed = await seedChurch(key);
    const admin = await makeUser({
      email: `hq-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "church_hq_admin",
    });

    const created = await createMembershipIntakeForm(pool, {
      churchId: seed.church.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      title: "Join our church",
      formKey: "join_us",
    });
    assert.equal(created.ok, true, created.reason || created.status);
    assert.equal(created.form.status, "draft");

    const published = await publishMembershipIntakeForm(pool, {
      churchId: seed.church.id,
      formId: created.form.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
    });
    assert.equal(published.ok, true, published.reason);
    assert.equal(published.form.status, "published");

    const phone = nextPhone();
    const submitted = await submitMembershipApplication(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Ada",
      lastName: "Lovelace",
      preferredName: "Ada",
      email: `ada-${key}@example.test`,
      phone,
      country: "ZM",
      intakeFormId: created.form.id,
      application: {
        faithBackground: "Grew up in church",
        baptismStatus: "baptized",
        interests: ["worship", "outreach"],
        ministryInterest: "Choir",
        consentContact: true,
      },
    });
    assert.equal(submitted.ok, true, submitted.reason || submitted.status);
    assert.equal(submitted.registration.status, "submitted");
    assert.equal(submitted.registration.applicationJson.baptismStatus, "baptized");
    assert.equal(submitted.registration.memberId, null);

    // No automatic user/login was created for applicant email
    const users = await pool.query(
      `SELECT id FROM blessboard.users WHERE lower(email_normalized) = lower($1)`,
      [`ada-${key}@example.test`]
    );
    assert.equal(users.rowCount, 0);
  });

  it("rejects forbidden sensitive application keys", async () => {
    requireDb();
    const key = uniq("bb-priv");
    const seed = await seedChurch(key);
    const phone = nextPhone();
    const bad = await submitMembershipApplication(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Pat",
      lastName: "Private",
      phone,
      application: { nationalId: "secret", faithBackground: "ok" },
    });
    assert.equal(bad.ok, false);
    assert.match(String(bad.reason), /privacy_forbidden/);
    assert.ok(FORBIDDEN_APPLICATION_KEYS.includes("nationalId"));
  });

  it("supports needs_follow_up, approve to member, and separate audit events", async () => {
    requireDb();
    const key = uniq("bb-rev");
    const seed = await seedChurch(key);
    const reviewer = await makeUser({
      email: `rev-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "branch_admin",
      branchKey: "hq",
    });

    const phone = nextPhone();
    const submitted = await submitMembershipApplication(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Grace",
      lastName: "Hopper",
      phone,
      country: "ZM",
      application: { interests: ["youth"] },
    });
    assert.equal(submitted.ok, true, submitted.reason || submitted.status);

    const follow = await requestNeedsFollowUp(pool, {
      registrationId: submitted.registration.id,
      actorUserId: reviewer.id,
      churchId: seed.church.id,
      tenant: tenantCtx(seed),
      reviewNotes: "Please confirm campus preference",
    });
    assert.equal(follow.ok, true, follow.reason || follow.status);
    assert.equal(follow.registration.status, "needs_follow_up");

    const approved = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: reviewer.id,
      tenant: tenantCtx(seed),
      reviewNotes: "Approved after follow-up",
    });
    assert.equal(approved.ok, true, approved.reason);
    assert.equal(approved.registration.status, "approved");
    assert.ok(approved.member && approved.member.id);
    assert.equal(approved.member.userId, null);

    const events = await pool.query(
      `SELECT decision_code FROM blessboard.member_registration_review_events
        WHERE registration_id = $1 ORDER BY created_at ASC`,
      [submitted.registration.id]
    );
    const codes = events.rows.map((r) => r.decision_code);
    assert.ok(codes.includes("submitted"));
    assert.ok(codes.includes("needs_follow_up"));
    assert.ok(codes.includes("approved"));
  });

  it("redacts pastoral notes without pastoral_cases.view_restricted", async () => {
    requireDb();
    const key = uniq("bb-pas");
    const seed = await seedChurch(key);
    const branchAdmin = await makeUser({
      email: `ba-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "branch_admin",
      branchKey: "hq",
    });

    const phone = nextPhone();
    const submitted = await submitMemberRegistration(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Sam",
      lastName: "Care",
      phone,
    });
    assert.equal(submitted.ok, true, submitted.reason);

    // Seed pastoral note directly (bypass gate) then assert redaction on read
    await pool.query(
      `UPDATE blessboard.member_registrations
          SET pastoral_notes = $2, pastoral_notes_updated_at = now()
        WHERE id = $1`,
      [submitted.registration.id, "Confidential pastoral context"]
    );

    const deniedWrite = await updateRegistrationPastoralNotes(pool, {
      registrationId: submitted.registration.id,
      actorUserId: branchAdmin.id,
      tenant: tenantCtx(seed),
      pastoralNotes: "Attempted overwrite",
    });
    assert.equal(deniedWrite.ok, false);
    assert.equal(deniedWrite.reason, "pastoral_restricted");

    const viewed = await getMembershipApplicationForReview(pool, {
      registrationId: submitted.registration.id,
      actorUserId: branchAdmin.id,
      churchId: seed.church.id,
      tenant: tenantCtx(seed),
    });
    assert.equal(viewed.ok, true, viewed.reason);
    assert.equal(viewed.canViewPastoralNotes, false);
    assert.equal(viewed.registration.pastoralNotes, undefined);
    assert.equal(viewed.registration.pastoralNotesRestricted, true);
  });

  it("transfers member between branches with church isolation", async () => {
    requireDb();
    const key = uniq("bb-xfer");
    const seed = await seedChurch(key);
    const other = await seedChurch(uniq("bb-other"));
    const admin = await makeUser({
      email: `xfer-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "church_hq_admin",
    });

    const phone = nextPhone();
    const submitted = await submitMemberRegistration(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Terry",
      lastName: "Transfer",
      phone,
    });
    const approved = await approveMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
    });
    assert.equal(approved.ok, true, approved.reason);

    const cross = await requestMemberBranchTransfer(pool, {
      churchId: seed.church.id,
      memberId: approved.member.id,
      toBranchId: other.branch.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      reason: "Wrong church",
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.reason, "to_branch");

    const requested = await requestMemberBranchTransfer(pool, {
      churchId: seed.church.id,
      memberId: approved.member.id,
      toBranchId: seed.branch2.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      reason: "Closer to home",
    });
    assert.equal(requested.ok, true, requested.reason);
    assert.equal(requested.transfer.status, "requested");

    const reviewed = await reviewMemberBranchTransfer(pool, {
      churchId: seed.church.id,
      transferId: requested.transfer.id,
      decision: "approved",
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      reviewerNotes: "OK",
    });
    assert.equal(reviewed.ok, true, reviewed.reason);
    assert.equal(reviewed.transfer.status, "approved");

    const primary = await pool.query(
      `SELECT branch_id FROM blessboard.member_branch_memberships
        WHERE member_id = $1 AND is_primary = true`,
      [approved.member.id]
    );
    assert.equal(String(primary.rows[0].branch_id), String(seed.branch2.id));

    const profile = await updateApprovedMemberProfile(pool, {
      churchId: seed.church.id,
      memberId: approved.member.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      preferredName: "T",
    });
    assert.equal(profile.ok, true, profile.reason);
    assert.equal(profile.member.preferredName, "T");
  });

  it("decline leaves no member record and V7 submit path still works", async () => {
    requireDb();
    const key = uniq("bb-dec");
    const seed = await seedChurch(key);
    const admin = await makeUser({
      email: `dec-${key}@example.test`,
      organizationKey: key,
      churchKey: key,
      roleKey: "church_hq_admin",
    });

    const phone = nextPhone();
    const submitted = await submitMemberRegistration(pool, {
      churchId: seed.church.id,
      branchId: seed.branch.id,
      firstName: "Dee",
      lastName: "Clined",
      phone,
    });
    const rejected = await rejectMemberRegistration(pool, {
      registrationId: submitted.registration.id,
      actorUserId: admin.id,
      tenant: tenantCtx(seed),
      reviewNotes: "Incomplete",
    });
    assert.equal(rejected.ok, true, rejected.reason);
    assert.equal(rejected.registration.status, "rejected");
    assert.equal(rejected.registration.memberId, null);
  });

  it("ships stitch-marked views for BB01–BB08 and BB11–BB18", () => {
    const roots = [
      ["views/platform/forms/bb-membership-forms.ejs", "BB01"],
      ["views/platform/forms/bb-membership-form-edit.ejs", "BB02"],
      ["views/blessboard/v5/public/register.ejs", "BB03"],
      ["views/blessboard/v5/public/register.ejs", "BB04"],
      ["views/blessboard/v5/public/register.ejs", "BB05"],
      ["views/blessboard/v5/public/register.ejs", "BB06"],
      ["views/blessboard/v5/public/register-submitted.ejs", "BB07"],
      ["views/blessboard/v5/branch-admin/registrations.ejs", "BB11"],
      ["views/blessboard/v5/branch-admin/registration-detail.ejs", "BB12"],
      ["views/blessboard/v5/branch-admin/registration-detail.ejs", "BB13"],
      ["views/blessboard/v5/branch-admin/member-detail.ejs", "BB14"],
      ["views/blessboard/v5/branch-admin/member-detail.ejs", "BB15"],
      ["views/platform/forms/bb-membership-transfer.ejs", "BB16"],
      ["views/blessboard/v5/hq/members.ejs", "BB17"],
      ["views/blessboard/v5/branch-admin/members.ejs", "BB18"],
    ];
    for (const [rel, marker] of roots) {
      const abs = path.join(__dirname, "..", rel);
      const src = fs.readFileSync(abs, "utf8");
      assert.match(src, new RegExp(marker), `${rel} missing ${marker}`);
    }
    // BB08 visitor registration shares public register surface
    const register = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/public/register.ejs"),
      "utf8"
    );
    assert.match(register, /data-bb-membership="public-apply"/);
    assert.match(register, /data-bb-screen-desktop="BB03-D"/);
    assert.match(register, /data-bb-membership-step-nav/);
    assert.match(register, /data-bb-step-next/);
    const submitted = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/public/register-submitted.ejs"),
      "utf8"
    );
    assert.match(submitted, /data-bb-registration-reference/);
    assert.match(submitted, /data-bb-screen-desktop="BB07-D"/);
    assert.match(
      fs.readFileSync(path.join(__dirname, "..", "views/platform/forms/bb-membership-forms.ejs"), "utf8"),
      /data-bb-screen-mobile="BB01-M"/
    );

    const reviewQueue = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/branch-admin/registrations.ejs"),
      "utf8"
    );
    assert.match(reviewQueue, /data-bb-screen-desktop="BB11-D"/);
    assert.match(reviewQueue, /data-bb-screen-mobile="BB11-M"/);
    assert.doesNotMatch(reviewQueue, /Attendance Rate|Volunteer Hours|live KPI|99\.9%/i);

    const reviewDetail = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/branch-admin/registration-detail.ejs"),
      "utf8"
    );
    assert.match(reviewDetail, /data-bb-screen-desktop="BB12-D"/);
    assert.match(reviewDetail, /data-bb-screen-desktop="BB13-D"/);
    assert.match(reviewDetail, /data-bb-reg-audit|data-bb-pastoral/);
    assert.match(reviewDetail, /does <strong>not<\/strong> create a login account/i);

    const memberDetail = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/branch-admin/member-detail.ejs"),
      "utf8"
    );
    assert.match(memberDetail, /data-bb-screen-desktop="BB14-D"/);
    assert.match(memberDetail, /data-bb-screen-desktop="BB15-D"/);
    assert.match(memberDetail, /data-bb-screen-mobile="BB15-M"/);
    assert.match(memberDetail, /data-bb-screen-desktop="BB16-D"/);
    assert.match(memberDetail, /data-bb-screen-mobile="BB16-M"/);
    assert.match(memberDetail, /confirm_transfer/);
    assert.match(memberDetail, /data-bb-member-edit-form="1"/);
    assert.match(memberDetail, /data-bb-member-transfer-form="1"/);
    assert.match(memberDetail, /bb-ba-actions--sticky/);
    assert.doesNotMatch(memberDetail, /Attendance Rate|Volunteer Hours|Birthday|ECCL-/i);

    const formsDash = fs.readFileSync(
      path.join(__dirname, "..", "views/platform/forms/bb-membership-forms.ejs"),
      "utf8"
    );
    assert.match(formsDash, /data-bb-screen-mobile="BB01-M"/);
    assert.match(formsDash, /data-bb-forms-status-chips="1"/);
    assert.match(formsDash, /data-bb-forms-create="1"/);
    assert.match(formsDash, /bf56891b82894edba59cb34bc7cbf562/);

    const formEdit = fs.readFileSync(
      path.join(__dirname, "..", "views/platform/forms/bb-membership-form-edit.ejs"),
      "utf8"
    );
    assert.match(formEdit, /data-bb-screen-mobile="BB02-M"/);
    assert.match(formEdit, /data-bb-form-publish-form="1"|Published /);
    assert.match(formEdit, /mx-forms-actions--sticky|Published /);
    assert.match(formEdit, /f09b2b0363e44286b745727fb1ac2c76/);

    const transfer = fs.readFileSync(
      path.join(__dirname, "..", "views/platform/forms/bb-membership-transfer.ejs"),
      "utf8"
    );
    assert.match(transfer, /data-bb-screen-mobile="BB16-M"/);
    assert.match(transfer, /data-bb-transfer-triage="1"|data-bb-transfer-audit="1"/);
    assert.match(transfer, /decision" value="approved"/);
    assert.match(transfer, /decision" value="declined"/);
    assert.match(transfer, /9a061086176e49d3b55eabc3d95f2e1e/);

    const formsCss = fs.readFileSync(
      path.join(__dirname, "..", "public/platform/forms-builder.css"),
      "utf8"
    );
    assert.match(formsCss, /mx-forms-shell--bb-membership/);
    assert.match(formsCss, /@media \(max-width:\s*799px\)[\s\S]*max-width:\s*390px/);

    const baCss = fs.readFileSync(
      path.join(__dirname, "..", "public/blessboard/v5/branch-admin.css"),
      "utf8"
    );
    assert.match(baCss, /bb-ba-actions--sticky/);

    const branchMembers = fs.readFileSync(
      path.join(__dirname, "..", "views/blessboard/v5/branch-admin/members.ejs"),
      "utf8"
    );
    // BB18-M remains Stitch-blocked: only BB18-D exists in project inventory.
    assert.match(branchMembers, /data-bb-screen-desktop="BB18-D"/);
    assert.match(branchMembers, /data-bb-screen-mobile="BB18-M"/);
    assert.match(branchMembers, /bb-ba-members-cards/);
  });

  it("documents BB18-M Stitch design as missing (cannot invent)", () => {
    const coverage = fs.readFileSync(
      path.join(__dirname, "..", "docs/releases/V8_SCREEN_IMPLEMENTATION_COVERAGE.md"),
      "utf8"
    );
    assert.match(coverage, /BB18-M/);
    assert.match(coverage, /BLOCKED|missing/i);
  });
});
