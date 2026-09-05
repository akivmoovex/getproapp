#!/usr/bin/env node
"use strict";

/**
 * Read-only readiness verification for the three hosted website QA personas.
 *
 * Writes nothing to the database and prints no secrets. Refuses to run unless
 * the connected database is the V7 testing identity.
 *
 * Checks per persona: identity exists, enabled, credential configured, product
 * access, organization, branch/facility membership, website edit / preview /
 * publish / version history / restore, and cross-tenant isolation.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing node scripts/local/qa-personas-verify.js
 */

const { Pool } = require("pg");
const { readIdentityRow } = require("../../db/scripts/lib/databaseIdentity");
const rbac = require("../../src/blessboard/services/blessBoardRbacAuthorizationService");
const acAuthz = require("../../src/activeclinic/services/activeClinicAuthorizationService");

const BB_ORG_KEY = "demo-church";
const BB_HQ_EMAIL = "qa.organisation_administrator@demo-church.example.test";
const BB_BRANCH_EMAIL = "qa.branch_administrator@demo-church.example.test";
const BB_BRANCH_KEY = "demo-church-lusaka";

// Website permissions QA needs. Restore accepts either key, matching the route.
const BB_PERMS = ["website.view", "website.edit", "website.publish"];
const BB_RESTORE_ANY = ["website.rollback", "website.restore"];
const AC_PERMS = ["website.view", "website.edit", "website.publish"];
const AC_RESTORE_ANY = ["website.restore", "website.rollback"];

const results = [];
function record(persona, check, ok, detail) {
  results.push({ persona, check, ok, detail: detail || "" });
}

function mark(ok) {
  return ok ? "PASS" : "FAIL";
}

async function loadBlessBoardTenant(pool, orgKey) {
  const r = await pool.query(
    `SELECT o.id AS organization_id, o.organization_key, o.status AS org_status,
            c.id AS church_id, c.church_key, c.display_name,
            (SELECT count(*) FROM blessboard.branches b WHERE b.church_id=c.id AND b.status='active') AS active_branches
       FROM platform.organizations o
       JOIN blessboard.churches c ON c.organization_id = o.id
      WHERE o.organization_key = $1 AND o.data_environment = 'testing'`,
    [orgKey]
  );
  return r.rows[0] || null;
}

async function loadBranch(pool, churchId, branchKey) {
  const r = await pool.query(
    `SELECT id, branch_key, display_name, is_primary, status
       FROM blessboard.branches WHERE church_id=$1 AND branch_key=$2`,
    [churchId, branchKey]
  );
  return r.rows[0] || null;
}

async function loadBlessBoardUser(pool, email) {
  const r = await pool.query(
    `SELECT id, email_display, status,
            (password_hash IS NOT NULL) AS has_password,
            password_change_required,
            sign_in_locked_until
       FROM blessboard.users WHERE email_normalized = lower($1)`,
    [email]
  );
  return r.rows[0] || null;
}

async function productEnrolled(pool, organizationId, productKey) {
  const r = await pool.query(
    `SELECT op.status
       FROM platform.organization_products op
       JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1 AND p.product_key = $2`,
    [organizationId, productKey]
  );
  return r.rows.map((x) => x.status);
}

async function verifyBlessBoardPersona(pool, label, email, opts) {
  const tenant = opts.tenant;
  const scopeBranchId = opts.branchId || null;

  const user = await loadBlessBoardUser(pool, email);
  record(label, "identity exists", Boolean(user), user ? user.email_display : `no user ${email}`);
  if (!user) return;

  record(label, "enabled (status=active)", user.status === "active", `status=${user.status}`);
  record(label, "login credential configured", user.has_password === true, "password_hash present");
  record(
    label,
    "not locked / no forced password change",
    !user.sign_in_locked_until && user.password_change_required !== true,
    `locked=${user.sign_in_locked_until ? "yes" : "no"} mustChange=${user.password_change_required}`
  );

  const statuses = await productEnrolled(pool, tenant.organization_id, "blessboard");
  record(
    label,
    "product access (blessboard enrolled)",
    statuses.includes("active"),
    `organization_products=${statuses.join(",") || "none"}`
  );
  record(label, "correct organization", tenant.organization_key === BB_ORG_KEY, `org=${tenant.organization_key}`);

  // Membership: which scope does this user actually hold, per legacy + RBAC.
  const legacy = await pool.query(
    `SELECT ur.role_key, b.branch_key
       FROM blessboard.user_roles ur
       LEFT JOIN blessboard.branches b ON b.id = ur.branch_id
      WHERE ur.user_id=$1 AND ur.status='active' AND ur.church_id=$2`,
    [user.id, tenant.church_id]
  );
  const legacyDesc = legacy.rows.map((r) => `${r.role_key}${r.branch_key ? ":" + r.branch_key : ""}`).join(", ");
  record(
    label,
    "legacy sign-in role present (required by establishBlessBoardSession)",
    legacy.rows.length > 0,
    legacyDesc || "none"
  );
  if (opts.expectLegacyRole) {
    record(
      label,
      `legacy role is ${opts.expectLegacyRole}`,
      legacy.rows.some((r) => r.role_key === opts.expectLegacyRole),
      legacyDesc
    );
  }
  if (opts.expectBranchKey) {
    record(
      label,
      `branch membership = ${opts.expectBranchKey}`,
      legacy.rows.some((r) => r.branch_key === opts.expectBranchKey),
      legacyDesc
    );
  }

  const resourceContext = {
    organizationId: tenant.organization_id,
    churchId: tenant.church_id,
    branchId: scopeBranchId,
  };

  for (const perm of BB_PERMS) {
    const d = await rbac.authorize(pool, {
      actor: { userId: user.id },
      permission: perm,
      resourceContext,
    });
    record(label, `${perm} @ ${opts.scopeLabel}`, d.allowed === true, d.allowed ? "allowed" : `denied (${d.reasonCode})`);
  }

  // Version history is the website.view surface; restore needs either key.
  const restoreChecks = [];
  for (const perm of BB_RESTORE_ANY) {
    const d = await rbac.authorize(pool, {
      actor: { userId: user.id },
      permission: perm,
      resourceContext,
    });
    restoreChecks.push(`${perm}=${d.allowed ? "allow" : "deny"}`);
  }
  // Rollback is deliberately an HQ-level capability: the role catalogue grants
  // website.rollback to organisation_administrator / church_system_administrator
  // / website_publisher, and withholds it from branch_administrator. So for a
  // branch persona the correct expectation is DENY, not allow.
  const restoreAllowed = restoreChecks.some((s) => s.endsWith("=allow"));
  if (opts.expectRestore === false) {
    record(
      label,
      `restore correctly withheld @ ${opts.scopeLabel} (HQ-only by design)`,
      restoreAllowed === false,
      restoreChecks.join(" ")
    );
  } else {
    record(
      label,
      `restore (any of ${BB_RESTORE_ANY.join("|")}) @ ${opts.scopeLabel}`,
      restoreAllowed,
      restoreChecks.join(" ")
    );
  }

  // Isolation: same permission must be denied on a foreign church.
  if (opts.foreignChurch) {
    const d = await rbac.authorize(pool, {
      actor: { userId: user.id },
      permission: "website.edit",
      resourceContext: {
        organizationId: opts.foreignChurch.organization_id,
        churchId: opts.foreignChurch.church_id,
        branchId: null,
      },
    });
    record(
      label,
      `isolation: website.edit denied on foreign church (${opts.foreignChurch.organization_key})`,
      d.allowed !== true,
      d.allowed ? "ALLOWED — LEAK" : `denied (${d.reasonCode})`
    );
  }

  // Isolation: branch admin must be denied on a sibling branch.
  if (opts.foreignBranch) {
    const d = await rbac.authorize(pool, {
      actor: { userId: user.id },
      permission: "website.edit",
      resourceContext: {
        organizationId: tenant.organization_id,
        churchId: tenant.church_id,
        branchId: opts.foreignBranch.id,
      },
    });
    record(
      label,
      `isolation: website.edit denied on sibling branch (${opts.foreignBranch.branch_key})`,
      d.allowed !== true,
      d.allowed ? "ALLOWED — LEAK" : `denied (${d.reasonCode})`
    );
  }
}

async function verifyActiveClinicPersona(pool, label, orgKey, email) {
  const org = await pool.query(
    `SELECT id, organization_key, status FROM platform.organizations
      WHERE organization_key=$1 AND data_environment='testing'`,
    [orgKey]
  );
  if (!org.rows[0]) {
    record(label, "organization exists", false, `no testing org ${orgKey}`);
    return;
  }
  const organizationId = org.rows[0].id;
  record(label, "correct organization", true, `${orgKey} (${org.rows[0].status})`);

  const staff = await pool.query(
    `SELECT sm.id AS staff_member_id, sm.status AS staff_status, sm.display_name,
            pi.id AS identity_id, pi.primary_email, pi.status AS identity_status,
            (pi.password_hash IS NOT NULL) AS has_password,
            pi.must_change_password, pi.locked_at, pi.suspended_at, pi.sign_in_locked_until
       FROM activeclinic.staff_members sm
       JOIN platform.identities pi ON pi.id = sm.platform_identity_id
      WHERE sm.organization_id=$1 AND pi.email_normalized = lower($2)`,
    [organizationId, email]
  );
  const s = staff.rows[0];
  record(label, "identity exists + linked to staff member", Boolean(s), s ? s.primary_email : `no staff identity ${email}`);
  if (!s) return;

  record(
    label,
    "enabled (identity + staff active, not locked/suspended)",
    s.identity_status === "active" && s.staff_status === "active" && !s.locked_at && !s.suspended_at && !s.sign_in_locked_until,
    `identity=${s.identity_status} staff=${s.staff_status} locked=${s.locked_at ? "yes" : "no"} suspended=${s.suspended_at ? "yes" : "no"}`
  );
  record(label, "login credential configured", s.has_password === true, "password_hash present");
  record(label, "no forced password change", s.must_change_password !== true, `mustChange=${s.must_change_password}`);

  const statuses = await productEnrolled(pool, organizationId, "activeclinic");
  record(label, "product access (activeclinic enrolled)", statuses.includes("active"), `organization_products=${statuses.join(",") || "none"}`);

  const fac = await pool.query(
    `SELECT f.facility_key, f.display_name, f.is_primary,
            (SELECT count(*) FROM activeclinic.staff_facility_assignments sfa
              WHERE sfa.staff_member_id=$2 AND sfa.facility_id=f.id AND sfa.status='active') AS assigned
       FROM activeclinic.facilities f WHERE f.organization_id=$1`,
    [organizationId, s.staff_member_id]
  );
  const facDesc = fac.rows.map((f) => `${f.facility_key}${f.is_primary ? "*" : ""}(assigned=${f.assigned})`).join(", ");
  const listed = await acAuthz.listStaffRoleAssignments(pool, {
    staffMemberId: s.staff_member_id,
    organizationId,
  });
  const assignments = (listed && listed.assignments) || [];
  const roleDesc = assignments.map((r) => `${r.roleKey || r.roleId}/${r.scopeType}`).join(", ");
  record(
    label,
    "facility membership / org-wide scope",
    fac.rows.length > 0 && assignments.length > 0,
    `facilities=[${facDesc}] roles=[${roleDesc}]`
  );

  for (const perm of AC_PERMS) {
    const d = await acAuthz.authorizeStaffPermission(pool, {
      organizationId,
      staffMemberId: s.staff_member_id,
      permissionKey: perm,
    });
    record(label, `${perm}`, d.allowed === true, d.allowed ? "allowed" : `denied (${d.code})`);
  }
  const restore = [];
  for (const perm of AC_RESTORE_ANY) {
    const d = await acAuthz.authorizeStaffPermission(pool, {
      organizationId,
      staffMemberId: s.staff_member_id,
      permissionKey: perm,
    });
    restore.push(`${perm}=${d.allowed ? "allow" : "deny"}`);
  }
  record(label, `restore (any of ${AC_RESTORE_ANY.join("|")})`, restore.some((x) => x.endsWith("=allow")), restore.join(" "));

  // Website instance readiness for edit/preview/publish/version history.
  const wi = await pool.query(
    `SELECT slug, status, lifecycle_status, edit_locked, publish_locked,
            last_published_at IS NOT NULL AS ever_published
       FROM platform.website_instances
      WHERE organization_id=$1 AND product_code='activeclinic'`,
    [organizationId]
  );
  const w = wi.rows[0];
  record(label, "website instance exists", Boolean(w), w ? `slug=${w.slug} status=${w.status} lifecycle=${w.lifecycle_status}` : "none");
  if (w) {
    record(label, "website not edit/publish locked", !w.edit_locked && !w.publish_locked, `editLock=${w.edit_locked} pubLock=${w.publish_locked}`);
    record(label, "website has been published at least once (version history seed)", w.ever_published === true, `everPublished=${w.ever_published}`);
  }
  const versions = await pool.query(
    `SELECT count(*) AS n FROM platform.website_versions wv
       JOIN platform.website_instances i ON i.id = wv.instance_id
      WHERE i.organization_id=$1`,
    [organizationId]
  );
  record(label, "version history rows present", Number(versions.rows[0].n) > 0, `versions=${versions.rows[0].n}`);

  // Isolation: another testing clinic org must deny this staff member.
  const other = await pool.query(
    `SELECT o.id, o.organization_key FROM platform.organizations o
      WHERE o.data_environment='testing' AND o.id <> $1
        AND EXISTS (SELECT 1 FROM activeclinic.facilities f WHERE f.organization_id=o.id)
      LIMIT 1`,
    [organizationId]
  );
  if (other.rows[0]) {
    const d = await acAuthz.authorizeStaffPermission(pool, {
      organizationId: other.rows[0].id,
      staffMemberId: s.staff_member_id,
      permissionKey: "website.edit",
    });
    record(
      label,
      `isolation: website.edit denied on foreign clinic (${other.rows[0].organization_key})`,
      d.allowed !== true,
      d.allowed ? "ALLOWED — LEAK" : `denied (${d.code})`
    );
  }
}

async function main() {
  const env = process.env;
  if (String(env.DEPLOYMENT_ENV || "") !== "testing") {
    console.error("refusing: DEPLOYMENT_ENV must be testing");
    process.exit(2);
  }
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.GETPRO_PG_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    max: 4,
    application_name: "qa-personas-verify",
  });

  const identity = await readIdentityRow(pool);
  if (!identity || identity.identity_key !== "moovex-platform-v7" || identity.environment_code !== "testing") {
    console.error("refusing: not the V7 testing database");
    await pool.end();
    process.exit(2);
  }
  console.log(`database: ${identity.identity_key} / ${identity.environment_code} / ${identity.host_fingerprint}\n`);

  const tenant = await loadBlessBoardTenant(pool, BB_ORG_KEY);
  if (!tenant) {
    console.error(`missing BlessBoard testing tenant ${BB_ORG_KEY}`);
    await pool.end();
    process.exit(1);
  }
  console.log(`BlessBoard tenant: ${tenant.organization_key}/${tenant.church_key} "${tenant.display_name}" activeBranches=${tenant.active_branches}`);

  const primary = await pool.query(
    `SELECT id, branch_key FROM blessboard.branches WHERE church_id=$1 AND is_primary=true AND status='active'`,
    [tenant.church_id]
  );
  const lusaka = await loadBranch(pool, tenant.church_id, BB_BRANCH_KEY);
  console.log(`  primary branch: ${primary.rows[0] ? primary.rows[0].branch_key : "none"}; QA branch: ${lusaka ? lusaka.branch_key : "MISSING"}\n`);

  const foreign = await loadBlessBoardTenant(pool, "baptist-church");

  await verifyBlessBoardPersona(pool, "BB_HQ", BB_HQ_EMAIL, {
    tenant,
    branchId: null,
    scopeLabel: "church-wide",
    expectLegacyRole: "church_hq_admin",
    foreignChurch: foreign,
  });

  await verifyBlessBoardPersona(pool, "BB_BRANCH", BB_BRANCH_EMAIL, {
    tenant,
    branchId: lusaka ? lusaka.id : null,
    scopeLabel: `branch:${BB_BRANCH_KEY}`,
    expectLegacyRole: "branch_admin",
    expectRestore: false,
    expectBranchKey: BB_BRANCH_KEY,
    foreignChurch: foreign,
    foreignBranch: primary.rows[0] || null,
  });

  await verifyActiveClinicPersona(
    pool,
    "AC_ADMIN",
    "qa-full-product-clinic-260817235630-805675",
    "qa.fullproduct.260817235630@example.test"
  );

  // BlessBoard website surface readiness (shared by both BB personas).
  const pv = await pool.query(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE status='published') AS published,
            count(*) FILTER (WHERE branch_id IS NOT NULL) AS branch_scoped,
            max(version_number) AS latest
       FROM blessboard.website_publication_versions
      WHERE church_id=$1`,
    [tenant.church_id]
  );
  const v = pv.rows[0];
  record("BB_SITE", "publication versions exist (version history + restore)", Number(v.total) > 0, `total=${v.total} published=${v.published} branchScoped=${v.branch_scoped} latest=#${v.latest}`);

  console.log("\n===== RESULTS =====");
  const byPersona = {};
  for (const r of results) {
    byPersona[r.persona] = byPersona[r.persona] || [];
    byPersona[r.persona].push(r);
  }
  let failures = 0;
  for (const [persona, list] of Object.entries(byPersona)) {
    const bad = list.filter((r) => !r.ok).length;
    failures += bad;
    console.log(`\n-- ${persona} -- ${list.length - bad}/${list.length} checks pass`);
    for (const r of list) {
      console.log(`  [${mark(r.ok)}] ${r.check}${r.detail ? " — " + r.detail : ""}`);
    }
  }
  console.log(`\nTOTAL FAILURES: ${failures}`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});
