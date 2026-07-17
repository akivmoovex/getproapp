"use strict";

/**
 * PostgreSQL tests for Platform Support Access + Account Manager MVP.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const {
  createGrowthSmokeTenant,
  cleanupPilotOrganization,
  makeSuffix,
} = require("./helpers/churchPilotSmokeFixtures");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const { TENANT_ZM, TENANT_ZW } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");
const service = require("../src/services/church/churchPlatformSupportAccessService");
const catalogue = require("../src/church/platformSupportAccessCatalogue");

const skip = !isPgConfigured();

async function createPlatformStaff(pool, opts) {
  const suffix = opts.suffix || makeSuffix("staff");
  const hash = await bcrypt.hash("SupportAccess_pw_2026!", 10);
  const id = await adminUsersRepo.insertUser(pool, {
    username: `sa_${opts.role}_${suffix}`.slice(0, 60),
    passwordHash: hash,
    role: opts.role,
    tenantId: opts.tenantId,
    displayName: opts.displayName || `${opts.role} ${suffix}`,
  });
  if (opts.enabled === false) {
    await pool.query(`UPDATE public.admin_users SET enabled = false WHERE id = $1`, [id]);
  }
  const row = await adminUsersRepo.getById(pool, id);
  return {
    id,
    username: row.username,
    role: row.role,
    tenant_id: row.tenant_id,
    display_name: row.display_name,
    enabled: row.enabled === 1 || row.enabled === true,
  };
}

async function cleanupAdmin(pool, adminId) {
  if (!adminId) return;
  await pool.query(`DELETE FROM public.church_platform_support_access_events WHERE actor_admin_user_id = $1`, [
    adminId,
  ]);
  await pool.query(
    `DELETE FROM public.church_platform_support_access_events
     WHERE access_id IN (
       SELECT id FROM public.church_platform_support_access WHERE support_admin_user_id = $1
     )`,
    [adminId]
  );
  await pool.query(`DELETE FROM public.church_platform_support_access WHERE support_admin_user_id = $1`, [
    adminId,
  ]);
  await pool.query(
    `UPDATE public.church_organization_account_managers
     SET primary_admin_user_id = NULL
     WHERE primary_admin_user_id = $1`,
    [adminId]
  );
  await pool.query(
    `UPDATE public.church_organization_account_managers
     SET backup_admin_user_id = NULL
     WHERE backup_admin_user_id = $1`,
    [adminId]
  );
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [adminId]);
}

test(
  "platform support access MVP: assignment, country scope, grants, enforcement, church history",
  { skip },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("supacc");
    const zmOrg = await createGrowthSmokeTenant(pool, { suffix: `zm${suffix}` });
    const zwOrg = await createGrowthSmokeTenant(pool, { suffix: `zw${suffix}` });
    await pool.query(`UPDATE public.church_organizations SET platform_tenant_id = $2 WHERE id = $1`, [
      zwOrg.organization.id,
      TENANT_ZW,
    ]);

    const countryAdmin = await createPlatformStaff(pool, {
      role: ROLES.TENANT_MANAGER,
      tenantId: TENANT_ZM,
      suffix: `${suffix}ca`,
      displayName: "ZM Country Admin",
    });
    const supportZm = await createPlatformStaff(pool, {
      role: ROLES.CSR,
      tenantId: TENANT_ZM,
      suffix: `${suffix}csr`,
      displayName: "ZM Support CSR",
    });
    const supportZw = await createPlatformStaff(pool, {
      role: ROLES.CSR,
      tenantId: TENANT_ZW,
      suffix: `${suffix}zwcsr`,
      displayName: "ZW Support CSR",
    });
    const backupZm = await createPlatformStaff(pool, {
      role: ROLES.TENANT_EDITOR,
      tenantId: TENANT_ZM,
      suffix: `${suffix}bak`,
      displayName: "ZM Backup Editor",
    });

    try {
      // 1) Primary / backup assignment
      const assignment = await service.assignAccountManagers(pool, {
        actor: countryAdmin,
        organizationId: zmOrg.organization.id,
        primaryAdminUserId: supportZm.id,
        backupAdminUserId: backupZm.id,
        status: "active",
        internalNote: "Internal only — must not leak to church history",
      });
      assert.equal(Number(assignment.primary_admin_user_id), supportZm.id);
      assert.equal(Number(assignment.backup_admin_user_id), backupZm.id);
      assert.equal(assignment.status, "active");

      // 2) Country-scope enforcement on assignment
      await assert.rejects(
        () =>
          service.assignAccountManagers(pool, {
            actor: countryAdmin,
            organizationId: zmOrg.organization.id,
            primaryAdminUserId: supportZw.id,
            backupAdminUserId: null,
          }),
        (e) => e && e.code === "COUNTRY_SCOPE_DENIED"
      );

      // 3) Support / requester cannot self-approve (authorized role requesting own access)
      const selfReq = await service.requestSupportAccess(pool, {
        actor: countryAdmin,
        organizationId: zmOrg.organization.id,
        ticketReference: `SELF-${suffix}`,
        reason: "Country admin investigating own ticket",
        requestedScope: "configuration",
      });
      await assert.rejects(
        () =>
          service.approveSupportAccess(pool, {
            actor: countryAdmin,
            accessId: selfReq.id,
            durationHours: 4,
          }),
        (e) => e && e.code === "SELF_APPROVAL_DENIED"
      );
      // Ordinary support cannot approve at all
      const pending = await service.requestSupportAccess(pool, {
        actor: supportZm,
        organizationId: zmOrg.organization.id,
        branchId: zmOrg.branchA.id,
        ticketReference: `TCK-${suffix}`,
        reason: "Help branch admin with login lockout",
        requestedScope: "user_support",
      });
      assert.equal(pending.status, "pending");
      await assert.rejects(
        () =>
          service.approveSupportAccess(pool, {
            actor: supportZm,
            accessId: pending.id,
            durationHours: 4,
          }),
        (e) => e && e.code === "FORBIDDEN"
      );

      // 4) Access before approval denied
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zmOrg.organization.id,
            branchId: zmOrg.branchA.id,
            action: "assist_user_account",
            recordUse: false,
          }),
        (e) => e && e.code === "SUPPORT_ACCESS_DENIED"
      );

      // 5) Approved access works within scope
      const approved = await service.approveSupportAccess(pool, {
        actor: countryAdmin,
        accessId: pending.id,
        durationHours: 4,
      });
      assert.equal(approved.status, "approved");
      assert.ok(new Date(approved.expires_at) > new Date());

      const ok = await service.assertCanPerformSupportAction(pool, {
        actor: supportZm,
        organizationId: zmOrg.organization.id,
        branchId: zmOrg.branchA.id,
        action: "assist_user_account",
      });
      assert.equal(ok.allowed, true);
      assert.equal(ok.mode, "grant");
      assert.equal(Number(ok.grant.id), Number(approved.id));

      // Redacted diagnostics without grant still allowed for CSR
      const redacted = await service.assertCanPerformSupportAction(pool, {
        actor: supportZm,
        organizationId: zmOrg.organization.id,
        action: "view_redacted_diagnostics",
        recordUse: false,
      });
      assert.equal(redacted.mode, "redacted_without_grant");

      // 6) Wrong organisation denied
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zwOrg.organization.id,
            action: "assist_user_account",
            recordUse: false,
          }),
        (e) => e && (e.code === "COUNTRY_SCOPE_DENIED" || e.code === "SUPPORT_ACCESS_DENIED")
      );

      // 7) Wrong branch denied
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zmOrg.organization.id,
            branchId: zmOrg.branchB.id,
            action: "assist_user_account",
            recordUse: false,
          }),
        (e) => e && e.code === "SUPPORT_ACCESS_DENIED"
      );

      // 8) Ungranted action denied (configuration not in user_support grant)
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zmOrg.organization.id,
            branchId: zmOrg.branchA.id,
            action: "view_org_config",
            recordUse: false,
          }),
        (e) => e && e.code === "SUPPORT_ACCESS_DENIED"
      );

      // 9) Expired access denied
      await pool.query(
        `UPDATE public.church_platform_support_access
         SET expires_at = now() - interval '1 minute'
         WHERE id = $1`,
        [approved.id]
      );
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zmOrg.organization.id,
            branchId: zmOrg.branchA.id,
            action: "assist_user_account",
            recordUse: false,
          }),
        (e) => e && e.code === "SUPPORT_ACCESS_DENIED"
      );

      // Fresh grant for revoke test
      const pending2 = await service.requestSupportAccess(pool, {
        actor: supportZm,
        organizationId: zmOrg.organization.id,
        ticketReference: `TCK2-${suffix}`,
        reason: "Configuration check after expiry",
        requestedScope: "configuration",
      });
      const approved2 = await service.approveSupportAccess(pool, {
        actor: countryAdmin,
        accessId: pending2.id,
        durationHours: 2,
      });
      await service.assertCanPerformSupportAction(pool, {
        actor: supportZm,
        organizationId: zmOrg.organization.id,
        action: "view_org_config",
        recordUse: false,
      });

      // 10) Revoked access denied
      await service.revokeSupportAccess(pool, {
        actor: countryAdmin,
        accessId: approved2.id,
      });
      await assert.rejects(
        () =>
          service.assertCanPerformSupportAction(pool, {
            actor: supportZm,
            organizationId: zmOrg.organization.id,
            action: "view_org_config",
            recordUse: false,
          }),
        (e) => e && e.code === "SUPPORT_ACCESS_DENIED"
      );

      // 11) Sensitive finance/pastoral/safeguarding remain denied
      for (const action of ["finance_view", "pastoral_notes", "safeguarding", "giving_detail"]) {
        assert.equal(catalogue.isSensitiveDeniedAction(action), true);
        await assert.rejects(
          () =>
            service.assertCanPerformSupportAction(pool, {
              actor: supportZm,
              organizationId: zmOrg.organization.id,
              action,
              recordUse: false,
            }),
          (e) => e && e.code === "SENSITIVE_ACTION_DENIED"
        );
      }

      // 12) Unrelated tenant unaffected — ZW support cannot use ZM grant path; ZW org has no ZM assignment bleed
      const zwManagers = await service.getAccountManagers(pool, zwOrg.organization.id);
      assert.equal(zwManagers, null);

      // 13) Church-visible audit contains safe information only
      const history = await service.listChurchVisibleHistory(pool, zmOrg.organization.id, {
        limit: 20,
      });
      assert.ok(history.length >= 1);
      const blob = JSON.stringify(history);
      assert.ok(!blob.includes("Internal only"));
      assert.ok(!blob.includes("internal_note"));
      assert.ok(!/password/i.test(blob));
      for (const row of history) {
        assert.ok(row.support_display_name);
        assert.ok(row.access_purpose);
        assert.ok(row.approved_scope);
        assert.ok(row.status);
        assert.ok(Array.isArray(row.high_level_actions));
      }
    } finally {
      await cleanupPilotOrganization(pool, zmOrg.organization.id);
      await cleanupPilotOrganization(pool, zwOrg.organization.id);
      await cleanupAdmin(pool, supportZm.id);
      await cleanupAdmin(pool, supportZw.id);
      await cleanupAdmin(pool, backupZm.id);
      await cleanupAdmin(pool, countryAdmin.id);
    }
  }
);

test("catalogue excludes finance/pastoral scopes from MVP", () => {
  for (const s of catalogue.SUPPORT_SCOPES) {
    assert.ok(!/finance|pastoral|safeguard|giving|private/i.test(s));
  }
  assert.ok(catalogue.SUPPORT_SCOPES.includes("redacted_diagnostics"));
  assert.ok(catalogue.SUPPORT_SCOPES.includes("job_support"));
});
