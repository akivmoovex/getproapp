"use strict";

/**
 * Explicit allowlisted SQL for BlessBoard V5 testing data reset.
 * Never discovers tables dynamically. Never touches getpro/ngo/public schemas.
 * Never deletes platform.database_identity, schema_migrations, deployments,
 * products, plans, plan_features, or platform_admin identities/roles.
 */

const ALLOWLISTED_ACTIONS = Object.freeze([
  "preview",
  "clear_registrations",
  "clear_organizations",
  "clear_invitations",
  "clear_all",
]);

/**
 * @param {{ query: Function }} client
 */
async function listPlatformAdminPreserveSet(client) {
  const users = await client.query(
    `SELECT DISTINCT u.id AS user_id, ur.organization_id
       FROM blessboard.users u
       INNER JOIN blessboard.user_roles ur
         ON ur.user_id = u.id
        AND ur.role_key = 'platform_admin'
        AND ur.status = 'active'
      WHERE u.status = 'active'`
  );
  const userIds = [...new Set(users.rows.map((r) => String(r.user_id)))];
  const orgIds = [...new Set(users.rows.map((r) => String(r.organization_id)).filter(Boolean))];
  return { userIds, orgIds };
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} preserveOrgIds
 */
async function listResettableOrganizationIds(client, preserveOrgIds) {
  const r = await client.query(
    `SELECT id
       FROM platform.organizations
      WHERE NOT (id = ANY($1::uuid[]))
      ORDER BY created_at ASC`,
    [preserveOrgIds]
  );
  return r.rows.map((row) => String(row.id));
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} organizationIds
 */
async function listChurchIdsForOrganizations(client, organizationIds) {
  if (!organizationIds.length) return [];
  const r = await client.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  return r.rows.map((row) => String(row.id));
}

/**
 * Category counts for dry-run / UI summary. Read-only.
 * @param {{ query: Function }} client
 * @param {{ preserveOrgIds: string[], preserveUserIds: string[] }} preserve
 */
async function countResettableCategories(client, preserve) {
  const preserveOrgIds = preserve.preserveOrgIds || [];
  const preserveUserIds = preserve.preserveUserIds || [];

  const [
    registrations,
    supportContactsApp,
    orgs,
    churches,
    invitations,
    tenantRoles,
    media,
    domains,
    subscriptions,
    sessionsTenant,
    auditForOrgs,
  ] = await Promise.all([
    client.query(`SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`),
    client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.organization_support_contacts
        WHERE registration_application_id IS NOT NULL`
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations
        WHERE NOT (id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.churches
        WHERE NOT (organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(`SELECT COUNT(*)::int AS n FROM blessboard.user_invitations`),
    client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
        WHERE role_key <> 'platform_admin'
          AND organization_id = ANY(
            SELECT id FROM platform.organizations WHERE NOT (id = ANY($1::uuid[]))
          )`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.media_assets m
        INNER JOIN blessboard.churches c ON c.id = m.church_id
       WHERE NOT (c.organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM platform.domains
        WHERE organization_id IS NOT NULL
          AND NOT (organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions
        WHERE NOT (organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM platform.deployment_sessions
        WHERE organization_id IS NOT NULL
          AND NOT (organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
    client.query(
      `SELECT COUNT(*)::int AS n FROM platform.audit_events
        WHERE NOT (organization_id = ANY($1::uuid[]))`,
      [preserveOrgIds]
    ),
  ]);

  const preservedAdmins = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.users WHERE id = ANY($1::uuid[])`,
    [preserveUserIds]
  );
  const preservedAdminRoles = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
      WHERE role_key = 'platform_admin' AND status = 'active'`
  );
  const plans = await client.query(`SELECT COUNT(*)::int AS n FROM platform.plans`);
  const identities = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.database_identity`
  );
  const migrations = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.schema_migrations`
  );

  return {
    registrations: registrations.rows[0].n,
    registration_support_contacts: supportContactsApp.rows[0].n,
    organizations: orgs.rows[0].n,
    churches: churches.rows[0].n,
    invitations: invitations.rows[0].n,
    tenant_role_assignments: tenantRoles.rows[0].n,
    media_assets: media.rows[0].n,
    tenant_domains: domains.rows[0].n,
    subscriptions: subscriptions.rows[0].n,
    tenant_sessions: sessionsTenant.rows[0].n,
    audit_events_for_resettable_orgs: auditForOrgs.rows[0].n,
    preserved: {
      platform_admin_users: preservedAdmins.rows[0].n,
      platform_admin_roles: preservedAdminRoles.rows[0].n,
      platform_admin_organizations: preserveOrgIds.length,
      plans: plans.rows[0].n,
      database_identity_rows: identities.rows[0].n,
      schema_migrations_rows: migrations.rows[0].n,
    },
  };
}

/**
 * List media object keys for churches about to be deleted (for post-commit file cleanup).
 * @param {{ query: Function }} client
 * @param {string[]} churchIds
 */
async function listMediaObjectsForChurches(client, churchIds) {
  if (!churchIds.length) return [];
  const r = await client.query(
    `SELECT storage_bucket, storage_key, church_id
       FROM blessboard.media_assets
      WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  return r.rows.map((row) => ({
    storageBucket: row.storage_bucket,
    storageKey: row.storage_key,
    churchId: String(row.church_id),
  }));
}

/**
 * Delete church-scoped catalogue content for the given church ids.
 * @param {{ query: Function }} client
 * @param {string[]} churchIds
 */
async function deleteChurchScopedContent(client, churchIds) {
  if (!churchIds.length) return { deletedChurches: 0 };

  // Announcement children cascade from announcements; delete parents.
  await client.query(
    `DELETE FROM blessboard.announcements WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.attendance_events WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.event_registrations
      WHERE event_id IN (SELECT id FROM blessboard.events WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(`DELETE FROM blessboard.events WHERE church_id = ANY($1::uuid[])`, [churchIds]);
  await client.query(
    `DELETE FROM blessboard.ministry_memberships
      WHERE ministry_id IN (SELECT id FROM blessboard.ministries WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.ministries WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_request_status_history
      WHERE request_id IN (
        SELECT id FROM blessboard.member_requests WHERE church_id = ANY($1::uuid[])
      )`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_requests WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.form_submissions
      WHERE form_id IN (SELECT id FROM blessboard.forms WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(`DELETE FROM blessboard.forms WHERE church_id = ANY($1::uuid[])`, [churchIds]);
  await client.query(
    `DELETE FROM blessboard.resources WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.giving_entries WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.giving_categories WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.giving_methods WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(`DELETE FROM blessboard.sermons WHERE church_id = ANY($1::uuid[])`, [churchIds]);
  await client.query(`DELETE FROM blessboard.leaders WHERE church_id = ANY($1::uuid[])`, [churchIds]);
  await client.query(
    `DELETE FROM blessboard.contact_channels WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.page_sections
      WHERE page_id IN (SELECT id FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.public_pages WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_registrations
      WHERE member_id IN (SELECT id FROM blessboard.members WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_branch_memberships
      WHERE member_id IN (SELECT id FROM blessboard.members WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(`DELETE FROM blessboard.members WHERE church_id = ANY($1::uuid[])`, [churchIds]);
  await client.query(
    `DELETE FROM blessboard.media_assets WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.church_settings WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.branch_settings
      WHERE branch_id IN (SELECT id FROM blessboard.branches WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.user_invitations WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.user_roles
      WHERE church_id = ANY($1::uuid[])
         OR branch_id IN (SELECT id FROM blessboard.branches WHERE church_id = ANY($1::uuid[]))`,
    [churchIds]
  );
  await client.query(`DELETE FROM blessboard.branches WHERE church_id = ANY($1::uuid[])`, [
    churchIds,
  ]);
  const delChurches = await client.query(
    `DELETE FROM blessboard.churches WHERE id = ANY($1::uuid[])`,
    [churchIds]
  );
  return { deletedChurches: delChurches.rowCount || 0 };
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} organizationIds
 */
async function deleteAuditEventsForOrganizations(client, organizationIds) {
  if (!organizationIds.length) return 0;
  await client.query(
    `ALTER TABLE platform.audit_events DISABLE TRIGGER audit_events_no_delete`
  );
  try {
    const r = await client.query(
      `DELETE FROM platform.audit_events WHERE organization_id = ANY($1::uuid[])`,
      [organizationIds]
    );
    return r.rowCount || 0;
  } finally {
    await client.query(
      `ALTER TABLE platform.audit_events ENABLE TRIGGER audit_events_no_delete`
    );
  }
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   organizationIds: string[],
 *   preserveUserIds: string[],
 *   keepSessionId?: string|null,
 * }} opts
 */
async function deleteOrganizationTrees(client, opts) {
  const organizationIds = opts.organizationIds || [];
  const preserveUserIds = opts.preserveUserIds || [];
  if (!organizationIds.length) {
    return {
      organizations: 0,
      churches: 0,
      auditEvents: 0,
      mediaListed: 0,
      mediaObjects: [],
    };
  }

  const churchIds = await listChurchIdsForOrganizations(client, organizationIds);
  const mediaObjects = await listMediaObjectsForChurches(client, churchIds);

  await client.query(
    `DELETE FROM platform.auth_transfers WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM platform.deployment_sessions
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );

  const auditEvents = await deleteAuditEventsForOrganizations(client, organizationIds);
  const churchResult = await deleteChurchScopedContent(client, churchIds);

  await client.query(
    `DELETE FROM blessboard.user_invitations WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.user_roles
      WHERE organization_id = ANY($1::uuid[])
        AND role_key <> 'platform_admin'`,
    [organizationIds]
  );

  await client.query(
    `UPDATE blessboard.platform_church_registration_applications
        SET organization_id = NULL
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.organization_support_contacts
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.organization_onboarding
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.organization_growth_trial_offers
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );

  await client.query(
    `DELETE FROM platform.organization_entitlements WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM platform.organization_subscriptions WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM platform.organization_products WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM platform.domains
      WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );

  const orgDel = await client.query(
    `DELETE FROM platform.organizations WHERE id = ANY($1::uuid[])`,
    [organizationIds]
  );

  return {
    organizations: orgDel.rowCount || 0,
    churches: churchResult.deletedChurches,
    auditEvents,
    mediaListed: mediaObjects.length,
    mediaObjects,
  };
}

/**
 * @param {{ query: Function }} client
 */
async function deleteRegistrationApplications(client) {
  const support = await client.query(
    `DELETE FROM blessboard.organization_support_contacts
      WHERE registration_application_id IS NOT NULL`
  );
  // Unlink onboarding that points at applications being removed
  await client.query(
    `UPDATE blessboard.organization_onboarding
        SET registration_application_id = NULL
      WHERE registration_application_id IS NOT NULL`
  );
  const apps = await client.query(
    `DELETE FROM blessboard.platform_church_registration_applications`
  );
  return {
    supportContacts: support.rowCount || 0,
    applications: apps.rowCount || 0,
  };
}

/**
 * @param {{ query: Function }} client
 */
async function deleteAllInvitations(client) {
  const r = await client.query(`DELETE FROM blessboard.user_invitations`);
  return { invitations: r.rowCount || 0 };
}

/**
 * Post-reset integrity checks for preserved foundation.
 * @param {{ query: Function }} client
 * @param {{ preserveUserIds: string[], preserveOrgIds: string[] }} preserve
 */
async function verifyPreservedFoundation(client, preserve) {
  const failures = [];
  const identity = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.database_identity`
  );
  if (identity.rows[0].n < 1) failures.push("database_identity_missing");

  const migrations = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.schema_migrations`
  );
  if (migrations.rows[0].n < 1) failures.push("schema_migrations_empty");

  const plans = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.plans WHERE status = 'active'`
  );
  if (plans.rows[0].n < 1) failures.push("plans_missing");

  const planFeatures = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.plan_features`
  );
  if (planFeatures.rows[0].n < 1) failures.push("plan_features_missing");

  const deployments = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.deployments`
  );
  if (deployments.rows[0].n < 1) failures.push("deployments_missing");

  if (preserve.preserveUserIds.length) {
    const admins = await client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.users
        WHERE id = ANY($1::uuid[]) AND status = 'active'`,
      [preserve.preserveUserIds]
    );
    if (admins.rows[0].n !== preserve.preserveUserIds.length) {
      failures.push("platform_admin_user_missing");
    }
    const roles = await client.query(
      `SELECT COUNT(*)::int AS n FROM blessboard.user_roles
        WHERE user_id = ANY($1::uuid[])
          AND role_key = 'platform_admin'
          AND status = 'active'`,
      [preserve.preserveUserIds]
    );
    if (roles.rows[0].n < 1) failures.push("platform_admin_role_missing");
  }

  return { ok: failures.length === 0, failures };
}

/**
 * Count orphaned non-PA users (no remaining roles) — report only, never auto-delete.
 * @param {{ query: Function }} client
 * @param {string[]} preserveUserIds
 */
async function countOrphanTenantIdentities(client, preserveUserIds) {
  const r = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.users u
      WHERE NOT (u.id = ANY($1::uuid[]))
        AND NOT EXISTS (
          SELECT 1 FROM blessboard.user_roles ur WHERE ur.user_id = u.id
        )`,
    [preserveUserIds]
  );
  return r.rows[0].n;
}

module.exports = {
  ALLOWLISTED_ACTIONS,
  listPlatformAdminPreserveSet,
  listResettableOrganizationIds,
  listChurchIdsForOrganizations,
  countResettableCategories,
  listMediaObjectsForChurches,
  deleteChurchScopedContent,
  deleteAuditEventsForOrganizations,
  deleteOrganizationTrees,
  deleteRegistrationApplications,
  deleteAllInvitations,
  verifyPreservedFoundation,
  countOrphanTenantIdentities,
};
