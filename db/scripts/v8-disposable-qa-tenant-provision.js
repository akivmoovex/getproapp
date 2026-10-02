#!/usr/bin/env node
"use strict";

/**
 * PROMPT 27 — Provision disposable V8 QA tenants (BlessBoard + ActiveClinic).
 *
 * Uses supported provision / registration / user / role services only.
 * Dry-run by default. Writes require --confirm.
 * Never prints passwords, OTPs, cookies, or DATABASE_URL.
 *
 * Credentials (if created) are written only to:
 *   .env.v8-qa-tenants.local  (gitignored via .env.*)
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v8-disposable-qa-tenant-provision.js --dry-run
 *   scripts/local/run-with-blessboard-env.sh testing \
 *     node db/scripts/v8-disposable-qa-tenant-provision.js --confirm
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  createProvisionPool,
  requireMatchedIdentity,
  assertDeploymentTarget,
  redactSecretsDeep,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
} = require("../../src/platform/config/canonicalDeploymentProfiles");
const {
  provisionPlatformTenant,
} = require("../../src/platform/services/provisionPlatformTenant");
const {
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  FEATURE_KEYS,
} = require("../../src/platform/services/entitlementService");
const {
  provisionBlessBoardChurch,
} = require("../../src/blessboard/services/provisionBlessBoardChurch");
const {
  createBlessBoardBranch,
} = require("../../src/blessboard/services/createBlessBoardBranch");
const {
  createBlessBoardUser,
} = require("../../src/blessboard/services/createBlessBoardUser");
const {
  assignBlessBoardRole,
} = require("../../src/blessboard/services/assignBlessBoardRole");
const {
  authenticateBlessBoardUser,
} = require("../../src/blessboard/services/authenticateBlessBoardUser");
const rbacRepo = require("../../src/blessboard/repositories/blessBoardRbacRepository");
const {
  submitAndProvisionClinicRegistration,
} = require("../../src/activeclinic/services/submitClinicRegistrationService");
const {
  prepareHostedAuthQaBookable,
  publishHostedAuthQaWebsite,
  KEY_PREFIX: AC_KEY_PREFIX,
} = require("../../src/activeclinic/qa/activeClinicHostedAuthQaFixture");
const {
  authenticateActiveClinicIdentity,
} = require("../../src/activeclinic/services/authenticateActiveClinicIdentity");

const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";
const DEPLOYMENT = CODE_MOOVEX_PLATFORM_V8_TESTING;
const CREDENTIALS_FILE = path.join(
  process.cwd(),
  ".env.v8-qa-tenants.local"
);
const BB_PREFIX = "bb-v8qa-";

function emit(obj) {
  const text = JSON.stringify(redactSecretsDeep(obj), null, 2);
  assertNoSecretsInText(text);
  // eslint-disable-next-line no-console
  console.log(text);
}

function generatePassword() {
  return `V8q${crypto.randomBytes(14).toString("base64url")}9!`;
}

function generatePhone(suffix) {
  const n = String(Date.now()).slice(-6) + String(suffix).padStart(2, "0");
  return `+26097${n.slice(0, 7)}`;
}

async function ensureCatalogueAssignment(db, input) {
  const role = await rbacRepo.findRoleByKey(db, input.roleKey);
  if (!role || !role.isActive) {
    return { ok: false, reason: "role_missing", roleKey: input.roleKey };
  }
  const existing = await db.query(
    `SELECT id FROM blessboard.user_role_assignments
      WHERE user_id = $1 AND role_id = $2 AND organization_id = $3
        AND scope_type = $4 AND status = 'active' AND revoked_at IS NULL
      LIMIT 1`,
    [input.userId, role.id, input.organizationId, input.scopeType]
  );
  if (existing.rows[0]) {
    return { ok: true, status: "already_assigned" };
  }
  const inserted = await rbacRepo.insertAssignment(db, {
    userId: input.userId,
    organizationId: input.organizationId,
    churchId: input.scopeType === "organisation" ? null : input.churchId,
    roleId: role.id,
    scopeType: input.scopeType,
    scopeId: input.scopeId || null,
    assignedByUserId: input.actorUserId || null,
    assignmentOrigin: "system",
    assignmentReason: "v8_disposable_qa_tenant_provision",
    expiresAt: null,
  });
  await rbacRepo.insertAssignmentEvent(db, {
    assignmentId: inserted.id,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId || null,
    eventKey: "rbac.assignment.created",
    previousStatus: null,
    newStatus: "active",
    reason: "v8_disposable_qa_tenant_provision",
    metadata: { source: "v8_disposable_qa_tenant_provision", roleKey: input.roleKey },
  });
  return { ok: true, status: "assigned" };
}

async function createStaffPersona(db, {
  email,
  displayName,
  password,
  organizationKey,
  churchKey,
  organizationId,
  churchId,
  legacyRoleKey,
  branchKey,
  catalogueRoleKey,
  catalogueScopeType,
  catalogueScopeId,
  actorUserId,
}) {
  const created = await createBlessBoardUser(
    db,
    { email, displayName, password },
    { manageTransaction: true }
  );
  if (!created.ok && created.status !== "already_exists") {
    return { ok: false, phase: "create_user", status: created.status, message: created.message };
  }
  let userId = created.user && created.user.id;
  if (!userId) {
    const found = await db.query(
      `SELECT id FROM blessboard.users WHERE email_normalized = $1 LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );
    userId = found.rows[0] && found.rows[0].id;
  }
  if (!userId) {
    return { ok: false, phase: "create_user", status: "user_missing_after_create" };
  }
  const legacy = await assignBlessBoardRole(
    db,
    {
      email,
      organizationKey,
      roleKey: legacyRoleKey,
      churchKey: legacyRoleKey === "platform_admin" ? null : churchKey,
      branchKey: legacyRoleKey === "branch_admin" ? branchKey : null,
    },
    { manageTransaction: true }
  );
  if (!legacy.ok && legacy.status !== "already_assigned") {
    return { ok: false, phase: "legacy_role", status: legacy.status, message: legacy.message };
  }
  const catalogue = await ensureCatalogueAssignment(db, {
    userId,
    organizationId,
    churchId,
    roleKey: catalogueRoleKey,
    scopeType: catalogueScopeType,
    scopeId: catalogueScopeId,
    actorUserId,
  });
  if (!catalogue.ok) {
    return { ok: false, phase: "catalogue_role", reason: catalogue.reason };
  }

  const auth = await authenticateBlessBoardUser(db, {
    email,
    password,
    deploymentCode: DEPLOYMENT,
    requireOrganizationId: organizationId,
  });
  const loginReady = Boolean(auth && auth.ok);

  return {
    ok: true,
    email,
    displayName,
    legacyRoleKey,
    catalogueRoleKey,
    branchKey: branchKey || null,
    loginReady,
    userId,
  };
}

async function provisionBlessBoardDisposable(db, stamp, password) {
  const organizationKey = `${BB_PREFIX}${stamp}`.slice(0, 48);
  const churchKey = organizationKey;
  const displayName = `V8 QA Church ${stamp}`;

  const platform = await provisionPlatformTenant(db, {
    organizationKey,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    productKey: "blessboard",
    productTenantKey: organizationKey,
    deploymentCode: DEPLOYMENT,
    skipDomain: true,
    isPrimary: true,
  });
  if (!platform.ok) {
    return { ok: false, phase: "platform_tenant", status: platform.status, message: platform.message };
  }

  const plan = await assignOrganizationPlan(db, {
    organizationId: platform.records.organization.id,
    planKey: "growth",
    productKey: "blessboard",
  });
  if (!plan || plan.ok !== true) {
    await setOrganizationEntitlementOverride(db, {
      organizationId: platform.records.organization.id,
      productKey: "blessboard",
      featureKey: FEATURE_KEYS.MAX_BRANCHES,
      featureKind: "limit",
      limitValue: 10,
      reason: "v8_disposable_qa_tenant_max_branches",
      env: { PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT },
    });
  }

  const church = await provisionBlessBoardChurch(db, {
    organizationKey,
    churchKey,
    displayName,
    legalName: null,
    dataEnvironment: "testing",
    hqBranchKey: "hq",
    hqBranchDisplayName: "Headquarters",
    timezone: "Africa/Lusaka",
    countryCode: "ZM",
  });
  if (!church.ok) {
    return { ok: false, phase: "church", status: church.status, message: church.message };
  }

  const organizationId = platform.records.organization.id;
  const churchId = church.records.church.id;
  const hqBranchId = church.records.hqBranch.id;

  // Bootstrap HQ admin first (needed as actor for branch creates).
  const hqEmail = `hq.admin@${organizationKey}.example.invalid`;
  const hq = await createStaffPersona(db, {
    email: hqEmail,
    displayName: "V8 QA HQ Admin",
    password,
    organizationKey,
    churchKey,
    organizationId,
    churchId,
    legacyRoleKey: "church_hq_admin",
    catalogueRoleKey: "organisation_administrator",
    catalogueScopeType: "organisation",
    catalogueScopeId: organizationId,
    actorUserId: null,
  });
  if (!hq.ok) return { ok: false, phase: "hq_admin", detail: hq };

  const tenantContext = {
    resolved: true,
    organization: { id: organizationId },
    church: { id: churchId },
    primaryBranch: { id: hqBranchId },
  };

  const branchA = await createBlessBoardBranch(db, {
    actorUserId: hq.userId,
    tenantContext,
    organizationId,
    churchId,
    branchKey: "campus-a",
    displayName: "Campus A",
    timezone: "Africa/Lusaka",
  });
  if (!branchA.ok) {
    return { ok: false, phase: "branch_a", status: branchA.status, message: branchA.message || branchA.reason };
  }
  const branchB = await createBlessBoardBranch(db, {
    actorUserId: hq.userId,
    tenantContext,
    organizationId,
    churchId,
    branchKey: "campus-b",
    displayName: "Campus B",
    timezone: "Africa/Lusaka",
  });
  if (!branchB.ok) {
    return { ok: false, phase: "branch_b", status: branchB.status, message: branchB.message || branchB.reason };
  }

  const branchAdminEmail = `branch.admin@${organizationKey}.example.invalid`;
  const branchAdmin = await createStaffPersona(db, {
    email: branchAdminEmail,
    displayName: "V8 QA Branch Admin",
    password,
    organizationKey,
    churchKey,
    organizationId,
    churchId,
    legacyRoleKey: "branch_admin",
    branchKey: "campus-a",
    catalogueRoleKey: "branch_administrator",
    catalogueScopeType: "branch",
    catalogueScopeId: branchA.branch.id,
    actorUserId: hq.userId,
  });
  if (!branchAdmin.ok) return { ok: false, phase: "branch_admin", detail: branchAdmin };

  const reviewerEmail = `membership.reviewer@${organizationKey}.example.invalid`;
  const reviewer = await createStaffPersona(db, {
    email: reviewerEmail,
    displayName: "V8 QA Membership Reviewer",
    password,
    organizationKey,
    churchKey,
    organizationId,
    churchId,
    legacyRoleKey: "church_hq_admin",
    catalogueRoleKey: "first_timers_coordinator",
    catalogueScopeType: "church",
    catalogueScopeId: churchId,
    actorUserId: hq.userId,
  });
  if (!reviewer.ok) return { ok: false, phase: "reviewer", detail: reviewer };

  // Visitor / member test identities: emails only (no platform login accounts).
  const visitorEmail = `visitor@${organizationKey}.example.invalid`;
  const memberEmail = `member.applicant@${organizationKey}.example.invalid`;

  return {
    ok: true,
    organizationKey,
    churchKey,
    displayName,
    organizationId,
    churchId,
    branches: [
      { key: "hq", id: hqBranchId, name: "Headquarters" },
      { key: "campus-a", id: branchA.branch.id, name: "Campus A" },
      { key: "campus-b", id: branchB.branch.id, name: "Campus B" },
    ],
    roles: {
      hq_admin: { email: hq.email, loginReady: hq.loginReady, catalogue: hq.catalogueRoleKey },
      branch_admin: {
        email: branchAdmin.email,
        loginReady: branchAdmin.loginReady,
        catalogue: branchAdmin.catalogueRoleKey,
        branchKey: "campus-a",
      },
      membership_reviewer: {
        email: reviewer.email,
        loginReady: reviewer.loginReady,
        catalogue: reviewer.catalogueRoleKey,
      },
      visitor_identity: { email: visitorEmail, platformLogin: false },
      member_applicant_identity: { email: memberEmail, platformLogin: false },
    },
    workingAdminUrl: "https://blessboard.neuniversity.org/login",
    tenantHostname: null,
    tenantHostnameNote:
      "No dedicated church hostname: canonicalHostRegistry is exact-match only; skipDomain used. Admin flows use session-scoped tenant on product host.",
    testCleanupEligible: true,
  };
}

async function provisionActiveClinicDisposable(db, stamp, password, env) {
  const organizationHint = `${AC_KEY_PREFIX}v8${stamp}`.slice(0, 48);
  const adminEmail = `clinic.admin@${organizationHint}.example.invalid`;
  const adminPhone = generatePhone(1);
  // Keep clinicName aligned with ac-hqa-* disposable prefix expectations when the
  // registration engine derives organization_key from the display name.
  const clinicName = `Ac Hqa V8 ${stamp}`;

  const clinic = await submitAndProvisionClinicRegistration(db, {
    clinicName,
    contactName: "V8 QA Clinic Admin",
    contactEmail: adminEmail,
    contactPhone: adminPhone,
    province: "Lusaka",
    city: "Lusaka",
    address: "V8 QA Avenue",
    countryCode: "ZM",
    password,
    passwordConfirm: password,
    acceptTerms: "on",
    deploymentCode: DEPLOYMENT,
    dataEnvironment: "testing",
    organizationKey: organizationHint,
    env,
  });

  if (!clinic.ok || clinic.reviewRequired) {
    return {
      ok: false,
      phase: "clinic_registration",
      code: clinic.code || "provision_failed",
      reviewRequired: clinic.reviewRequired === true,
    };
  }

  const organizationId = clinic.organizationId;
  const orgRow = await db.query(
    `SELECT organization_key, test_cleanup_eligible
       FROM platform.organizations WHERE id = $1`,
    [organizationId]
  );
  const organizationKey = String(
    (orgRow.rows[0] && orgRow.rows[0].organization_key) || clinic.slug || organizationHint
  ).toLowerCase();

  if (orgRow.rows[0] && orgRow.rows[0].test_cleanup_eligible !== true) {
    await db.query(
      `UPDATE platform.organizations SET test_cleanup_eligible = true WHERE id = $1`,
      [organizationId]
    );
  }

  const prepared = await prepareHostedAuthQaBookable(db, {
    organizationId,
    organizationKey,
    identityId: clinic.identityId || null,
  });
  const published = await publishHostedAuthQaWebsite(
    db,
    {
      organizationId,
      organizationKey,
      identityId: clinic.identityId || null,
    },
    env
  );

  let loginReady = false;
  try {
    const auth = await authenticateActiveClinicIdentity(db, {
      identifier: adminEmail,
      password,
      deploymentCode: DEPLOYMENT,
      hostname: "activeclinic.neuniversity.org",
      country: "ZM",
    });
    loginReady = Boolean(auth && auth.ok);
  } catch {
    loginReady = false;
  }

  return {
    ok: true,
    organizationKey,
    clinicKey: organizationKey,
    clinicName,
    adminEmail,
    adminPhone,
    bookable: prepared.ok === true,
    websitePublished: published.ok === true,
    loginReady,
    workingAdminUrl: "https://activeclinic.neuniversity.org/login",
    publicClinicUrl: `https://activeclinic.neuniversity.org/clinics/${organizationKey}`,
    testCleanupEligible: true,
  };
}

function writeCredentialsFile(payload) {
  const lines = [
    "# V8 disposable QA tenant credentials — DO NOT COMMIT",
    `# Generated ${new Date().toISOString()}`,
    `# Deployment ${DEPLOYMENT}`,
    "",
    `V8_QA_BB_ORG_KEY=${payload.blessboard.organizationKey}`,
    `V8_QA_BB_HQ_EMAIL=${payload.blessboard.roles.hq_admin.email}`,
    `V8_QA_BB_BRANCH_EMAIL=${payload.blessboard.roles.branch_admin.email}`,
    `V8_QA_BB_REVIEWER_EMAIL=${payload.blessboard.roles.membership_reviewer.email}`,
    `V8_QA_BB_VISITOR_EMAIL=${payload.blessboard.roles.visitor_identity.email}`,
    `V8_QA_BB_MEMBER_EMAIL=${payload.blessboard.roles.member_applicant_identity.email}`,
    `V8_QA_BB_PASSWORD=${payload.sharedPassword}`,
    "",
    `V8_QA_AC_ORG_KEY=${payload.activeclinic.organizationKey}`,
    `V8_QA_AC_ADMIN_EMAIL=${payload.activeclinic.adminEmail}`,
    `V8_QA_AC_ADMIN_PHONE=${payload.activeclinic.adminPhone}`,
    `V8_QA_AC_PASSWORD=${payload.sharedPassword}`,
    "",
  ];
  fs.writeFileSync(CREDENTIALS_FILE, lines.join("\n"), { mode: 0o600 });
  return CREDENTIALS_FILE;
}

async function main() {
  const mode = parseWriteMode(process.argv.slice(2));
  let pool = null;
  let exitCode = 0;

  try {
    const dbUrl = resolveDatabaseUrlSafe();
    if (!dbUrl.ok) {
      emit({ ok: false, code: "DATABASE_URL_required", message: dbUrl.message });
      process.exitCode = 2;
      return;
    }

    pool = createProvisionPool(dbUrl.connectionString, { max: 4 });
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      emit({ ok: false, code: "identity_refused", message: identity.message });
      process.exitCode = 2;
      return;
    }
    if (
      String(identity.identityKey) !== EXPECTED_IDENTITY ||
      String(identity.environmentCode) !== EXPECTED_ENV
    ) {
      emit({
        ok: false,
        code: "identity_mismatch",
        expected: { identityKey: EXPECTED_IDENTITY, environmentCode: EXPECTED_ENV },
        actual: {
          identityKey: identity.identityKey,
          environmentCode: identity.environmentCode,
        },
      });
      process.exitCode = 2;
      return;
    }

    const dep = await assertDeploymentTarget(pool, DEPLOYMENT);
    if (!dep.ok) {
      emit({ ok: false, code: "deployment_refused", message: dep.message, detail: dep });
      process.exitCode = 2;
      return;
    }

    const stamp = `${Date.now().toString(36)}${crypto.randomBytes(2).toString("hex")}`;
    const planned = {
      tool: "v8-disposable-qa-tenant-provision",
      dryRun: mode.dryRun,
      deploymentCode: DEPLOYMENT,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      plannedKeys: {
        blessboard: `${BB_PREFIX}${stamp}`,
        activeclinic: `${AC_KEY_PREFIX}v8${stamp}`,
      },
      note:
        "BlessBoard uses skipDomain (no inventing unlisted hostnames). AC uses product-host path routing.",
    };

    if (mode.dryRun) {
      emit({ ok: true, ...planned, message: "dry_run_only_pass_confirm_to_write" });
      return;
    }

    const password = generatePassword();
    const env = {
      ...process.env,
      PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
      DEPLOYMENT_ENV: "testing",
      DATABASE_IDENTITY_EXPECTED: EXPECTED_IDENTITY,
      DATABASE_IDENTITY_ENV: EXPECTED_ENV,
    };

    const blessboard = await provisionBlessBoardDisposable(pool, stamp, password);
    if (!blessboard.ok) {
      emit({ ok: false, phase: "blessboard", detail: redactSecretsDeep(blessboard) });
      exitCode = 2;
      return;
    }

    const activeclinic = await provisionActiveClinicDisposable(pool, stamp, password, env);
    if (!activeclinic.ok) {
      emit({
        ok: false,
        phase: "activeclinic",
        blessboardRef: { organizationKey: blessboard.organizationKey },
        detail: redactSecretsDeep(activeclinic),
      });
      exitCode = 2;
      return;
    }

    const credPath = writeCredentialsFile({
      sharedPassword: password,
      blessboard,
      activeclinic,
    });

    emit({
      ok: true,
      tool: "v8-disposable-qa-tenant-provision",
      deploymentCode: DEPLOYMENT,
      identityKey: identity.identityKey,
      environmentCode: identity.environmentCode,
      credentialsFile: path.basename(credPath),
      credentialsFileMode: "0600",
      credentialsNote: "Passwords written only to gitignored .env.v8-qa-tenants.local — not printed here.",
      blessboard: {
        organizationKey: blessboard.organizationKey,
        churchKey: blessboard.churchKey,
        displayName: blessboard.displayName,
        branches: blessboard.branches.map((b) => ({ key: b.key, name: b.name })),
        roles: {
          hq_admin: {
            email: blessboard.roles.hq_admin.email,
            loginReady: blessboard.roles.hq_admin.loginReady,
          },
          branch_admin: {
            email: blessboard.roles.branch_admin.email,
            loginReady: blessboard.roles.branch_admin.loginReady,
            branchKey: blessboard.roles.branch_admin.branchKey,
          },
          membership_reviewer: {
            email: blessboard.roles.membership_reviewer.email,
            loginReady: blessboard.roles.membership_reviewer.loginReady,
          },
          visitor_identity: blessboard.roles.visitor_identity,
          member_applicant_identity: blessboard.roles.member_applicant_identity,
        },
        workingAdminUrl: blessboard.workingAdminUrl,
        tenantHostname: blessboard.tenantHostname,
        tenantHostnameNote: blessboard.tenantHostnameNote,
        testCleanupEligible: true,
      },
      activeclinic: {
        organizationKey: activeclinic.organizationKey,
        clinicName: activeclinic.clinicName,
        adminEmail: activeclinic.adminEmail,
        loginReady: activeclinic.loginReady,
        bookable: activeclinic.bookable,
        websitePublished: activeclinic.websitePublished,
        workingAdminUrl: activeclinic.workingAdminUrl,
        publicClinicUrl: activeclinic.publicClinicUrl,
        testCleanupEligible: true,
      },
    });
  } catch (err) {
    emit({
      ok: false,
      code: "unexpected_error",
      message: String(err && err.message ? err.message : err).slice(0, 300),
    });
    exitCode = 2;
  } finally {
    if (pool) await pool.end().catch(() => {});
  }
  process.exitCode = exitCode;
}

main();
