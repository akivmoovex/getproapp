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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Tables that must have zero rows for a deleted organization_id after purge.
 * Used by verification helpers / tests.
 */
const ORGANIZATION_SCOPED_TABLES = Object.freeze([
  "blessboard.churches",
  "blessboard.organization_growth_trial_offers",
  "blessboard.organization_onboarding",
  "blessboard.organization_support_contacts",
  "blessboard.user_invitations",
  "blessboard.user_roles",
  "blessboard.website_approval_settings",
  "blessboard.website_audit_events",
  "blessboard.website_change_submission_events",
  "blessboard.website_change_submissions",
  "blessboard.website_inline_field_drafts",
  "blessboard.website_publication_versions",
  "blessboard.website_structured_drafts",
  "platform.audit_events",
  "platform.auth_transfers",
  "platform.deployment_sessions",
  "platform.domains",
  "platform.organization_entitlements",
  "platform.organization_products",
  "platform.organization_subscriptions",
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
 * Eligible orgs: test_cleanup_eligible marker AND not in platform-admin preserve set.
 * @param {{ query: Function }} client
 * @param {string[]} preserveOrgIds
 * @returns {Promise<Array<{ id: string, organizationKey: string, displayName: string }>>}
 */
async function listResettableOrganizations(client, preserveOrgIds) {
  const r = await client.query(
    `SELECT id, organization_key, display_name
       FROM platform.organizations
      WHERE test_cleanup_eligible = true
        AND NOT (id = ANY($1::uuid[]))
      ORDER BY created_at ASC`,
    [preserveOrgIds]
  );
  return r.rows.map((row) => ({
    id: String(row.id),
    organizationKey: String(row.organization_key),
    displayName: String(row.display_name),
  }));
}

/**
 * @param {{ query: Function }} client
 * @param {string[]} preserveOrgIds
 */
async function listResettableOrganizationIds(client, preserveOrgIds) {
  const rows = await listResettableOrganizations(client, preserveOrgIds);
  return rows.map((r) => r.id);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 * @param {string[]} preserveOrgIds
 */
async function getOrganizationPurgeEligibility(client, organizationId, preserveOrgIds) {
  if (!UUID_RE.test(String(organizationId || ""))) {
    return { ok: false, reason: "invalid_organization_id" };
  }
  const r = await client.query(
    `SELECT id, organization_key, display_name, status, data_environment, test_cleanup_eligible
       FROM platform.organizations
      WHERE id = $1
      LIMIT 1`,
    [organizationId]
  );
  const row = r.rows[0];
  if (!row) {
    return { ok: false, reason: "organization_not_found" };
  }
  if (preserveOrgIds.includes(String(row.id))) {
    return {
      ok: false,
      reason: "preserved_platform_admin_organization",
      organization: mapOrgRow(row),
    };
  }
  if (!row.test_cleanup_eligible) {
    return {
      ok: false,
      reason: "not_test_cleanup_eligible",
      organization: mapOrgRow(row),
    };
  }
  return { ok: true, organization: mapOrgRow(row) };
}

function mapOrgRow(row) {
  return {
    id: String(row.id),
    organizationKey: String(row.organization_key),
    displayName: String(row.display_name),
    status: String(row.status),
    dataEnvironment: String(row.data_environment),
    testCleanupEligible: Boolean(row.test_cleanup_eligible),
  };
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

  const registrations = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.platform_church_registration_applications`
  );
  const supportContactsApp = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.organization_support_contacts
      WHERE registration_application_id IS NOT NULL`
  );
  const orgs = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.organizations
      WHERE test_cleanup_eligible = true
        AND NOT (id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const churches = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.churches c
      INNER JOIN platform.organizations o ON o.id = c.organization_id
     WHERE o.test_cleanup_eligible = true
       AND NOT (c.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const invitations = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.user_invitations`
  );
  const tenantRoles = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.user_roles ur
      INNER JOIN platform.organizations o ON o.id = ur.organization_id
     WHERE ur.role_key <> 'platform_admin'
       AND o.test_cleanup_eligible = true
       AND NOT (ur.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const media = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.media_assets m
      INNER JOIN blessboard.churches c ON c.id = m.church_id
      INNER JOIN platform.organizations o ON o.id = c.organization_id
     WHERE o.test_cleanup_eligible = true
       AND NOT (c.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const domains = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.domains d
      INNER JOIN platform.organizations o ON o.id = d.organization_id
     WHERE d.organization_id IS NOT NULL
       AND o.test_cleanup_eligible = true
       AND NOT (d.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const subscriptions = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.organization_subscriptions s
      INNER JOIN platform.organizations o ON o.id = s.organization_id
     WHERE o.test_cleanup_eligible = true
       AND NOT (s.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const sessionsTenant = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.deployment_sessions s
      INNER JOIN platform.organizations o ON o.id = s.organization_id
     WHERE s.organization_id IS NOT NULL
       AND o.test_cleanup_eligible = true
       AND NOT (s.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );
  const auditForOrgs = await client.query(
    `SELECT COUNT(*)::int AS n FROM platform.audit_events a
      INNER JOIN platform.organizations o ON o.id = a.organization_id
     WHERE o.test_cleanup_eligible = true
       AND NOT (a.organization_id = ANY($1::uuid[]))`,
    [preserveOrgIds]
  );

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
 * Website / draft / submission dependents keyed by organization.
 * Must run before church deletion (publication versions RESTRICT church_id).
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function deleteOrganizationWebsiteRecords(client, organizationId) {
  // Delete restoration versions first (CHECK requires source_version_id when source_type=content_restoration).
  await client.query(
    `DELETE FROM blessboard.website_publication_versions
      WHERE organization_id = $1
        AND source_type = 'content_restoration'`,
    [organizationId]
  );
  // Break self-FK on publication versions before delete.
  await client.query(
    `UPDATE blessboard.website_publication_versions
        SET source_version_id = NULL
      WHERE organization_id = $1
        AND source_version_id IS NOT NULL`,
    [organizationId]
  );
  await client.query(
    `UPDATE blessboard.website_publication_versions
        SET source_submission_id = NULL
      WHERE organization_id = $1
        AND source_submission_id IS NOT NULL`,
    [organizationId]
  );

  await client.query(
    `DELETE FROM blessboard.website_change_submission_events
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_publication_versions
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_change_submissions
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_audit_events
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_inline_field_drafts
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_structured_drafts
      WHERE organization_id = $1`,
    [organizationId]
  );
  await client.query(
    `DELETE FROM blessboard.website_approval_settings
      WHERE organization_id = $1`,
    [organizationId]
  );
}

/**
 * Messaging / notification tables that RESTRICT church deletion.
 * @param {{ query: Function }} client
 * @param {string[]} churchIds
 */
async function deleteChurchMessaging(client, churchIds) {
  if (!churchIds.length) return;
  await client.query(
    `DELETE FROM blessboard.message_delivery_attempts
      WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_notifications
      WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.message_audiences
      WHERE message_id IN (
        SELECT id FROM blessboard.messages WHERE church_id = ANY($1::uuid[])
      )`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.messages WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
  await client.query(
    `DELETE FROM blessboard.member_notification_preferences
      WHERE church_id = ANY($1::uuid[])`,
    [churchIds]
  );
}

/**
 * Delete church-scoped catalogue content for the given church ids.
 * @param {{ query: Function }} client
 * @param {string[]} churchIds
 */
async function deleteChurchScopedContent(client, churchIds) {
  if (!churchIds.length) return { deletedChurches: 0 };

  await deleteChurchMessaging(client, churchIds);

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
    `DELETE FROM blessboard.giving_entry_events
      WHERE entry_id IN (
        SELECT id FROM blessboard.giving_entries WHERE church_id = ANY($1::uuid[])
      )`,
    [churchIds]
  );
  // Testing data reset is authorized to remove finance history; disable hard-delete guard.
  await client.query(
    `ALTER TABLE blessboard.giving_entries DISABLE TRIGGER giving_entries_no_hard_delete_posted`
  );
  try {
    await client.query(
      `DELETE FROM blessboard.giving_entries WHERE church_id = ANY($1::uuid[])`,
      [churchIds]
    );
  } finally {
    await client.query(
      `ALTER TABLE blessboard.giving_entries ENABLE TRIGGER giving_entries_no_hard_delete_posted`
    );
  }
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
  await client.query(
    `ALTER TABLE blessboard.user_role_assignment_events DISABLE TRIGGER user_role_assignment_events_no_delete`
  );
  await client.query(
    `ALTER TABLE blessboard.user_role_assignment_events DISABLE TRIGGER user_role_assignment_events_no_update`
  );
  try {
    await client.query(
      `DELETE FROM blessboard.user_role_assignment_events
        WHERE assignment_id IN (
          SELECT id FROM blessboard.user_role_assignments
           WHERE church_id = ANY($1::uuid[])
              OR organization_id IN (
                SELECT organization_id FROM blessboard.churches WHERE id = ANY($1::uuid[])
              )
        )`,
      [churchIds]
    );
  } finally {
    await client.query(
      `ALTER TABLE blessboard.user_role_assignment_events ENABLE TRIGGER user_role_assignment_events_no_delete`
    );
    await client.query(
      `ALTER TABLE blessboard.user_role_assignment_events ENABLE TRIGGER user_role_assignment_events_no_update`
    );
  }
  await client.query(
    `DELETE FROM blessboard.user_role_assignments
      WHERE church_id = ANY($1::uuid[])
         OR organization_id IN (
           SELECT organization_id FROM blessboard.churches WHERE id = ANY($1::uuid[])
         )`,
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
 * Purge one eligible organization and all organization-scoped dependents.
 * Caller owns the transaction.
 *
 * @param {{ query: Function }} client
 * @param {{
 *   organizationId: string,
 *   preserveOrgIds: string[],
 *   preserveUserIds: string[],
 *   keepSessionId?: string|null,
 * }} opts
 */
async function purgeOrganizationTree(client, opts) {
  const organizationId = String(opts.organizationId || "");
  const preserveOrgIds = opts.preserveOrgIds || [];
  const preserveUserIds = opts.preserveUserIds || [];
  const keepSessionId = opts.keepSessionId || null;

  const eligibility = await getOrganizationPurgeEligibility(
    client,
    organizationId,
    preserveOrgIds
  );
  if (!eligibility.ok) {
    return {
      ok: false,
      status: "skipped",
      reason: eligibility.reason,
      organization: eligibility.organization || { id: organizationId },
    };
  }

  const organizationIds = [organizationId];
  const churchIds = await listChurchIdsForOrganizations(client, organizationIds);
  const mediaObjects = await listMediaObjectsForChurches(client, churchIds);

  await client.query(
    `DELETE FROM platform.auth_transfers WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );

  if (keepSessionId) {
    await client.query(
      `DELETE FROM platform.deployment_sessions
        WHERE organization_id = ANY($1::uuid[])
          AND id <> $2::uuid`,
      [organizationIds, keepSessionId]
    );
  } else {
    await client.query(
      `DELETE FROM platform.deployment_sessions
        WHERE organization_id = ANY($1::uuid[])`,
      [organizationIds]
    );
  }

  const auditEvents = await deleteAuditEventsForOrganizations(client, organizationIds);

  // Website records before churches (publication versions RESTRICT church_id).
  await deleteOrganizationWebsiteRecords(client, organizationId);

  try {
    await client.query(
      `UPDATE activeclinic.clinic_registration_applications
          SET website_instance_id = NULL
        WHERE organization_id = $1`,
      [organizationId]
    );
  } catch {
    /* table/column may be absent on older resets */
  }

  await client.query(
    `ALTER TABLE platform.website_audit_events DISABLE TRIGGER website_audit_events_no_delete`
  );
  try {
    await client.query(
      `UPDATE platform.website_submissions SET version_id = NULL WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `UPDATE platform.website_versions SET submission_id = NULL WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_media_usages WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_checklist_state WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_content WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_submissions WHERE organization_id = $1`,
      [organizationId]
    );
    try {
      await client.query(
        `ALTER TABLE platform.website_moderation_events DISABLE TRIGGER website_moderation_events_no_delete`
      );
      await client.query(
        `DELETE FROM platform.website_moderation_events WHERE organization_id = $1`,
        [organizationId]
      );
    } catch (err) {
      if (!(err && (err.code === "42P01" || err.code === "42704"))) throw err;
    } finally {
      try {
        await client.query(
          `ALTER TABLE platform.website_moderation_events ENABLE TRIGGER website_moderation_events_no_delete`
        );
      } catch {
        /* table/trigger may be absent */
      }
    }
    try {
      await client.query(
        `UPDATE platform.website_versions SET edit_session_id = NULL, previous_version_id = NULL WHERE organization_id = $1`,
        [organizationId]
      );
      await client.query(
        `DELETE FROM platform.website_edit_sessions WHERE organization_id = $1`,
        [organizationId]
      );
    } catch (err) {
      if (!(err && err.code === "42P01")) throw err;
    }
    await client.query(
      `DELETE FROM platform.website_versions WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_media WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_audit_events WHERE organization_id = $1`,
      [organizationId]
    );
    await client.query(
      `DELETE FROM platform.website_instances WHERE organization_id = $1`,
      [organizationId]
    );
  } catch (err) {
    if (!(err && err.code === "42P01")) throw err;
  } finally {
    try {
      await client.query(
        `ALTER TABLE platform.website_audit_events ENABLE TRIGGER website_audit_events_no_delete`
      );
    } catch {
      /* table may be absent */
    }
  }

  const churchResult = await deleteChurchScopedContent(client, churchIds);

  await client.query(
    `DELETE FROM blessboard.user_invitations WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.organization_staff_phones WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );
  await client.query(
    `DELETE FROM blessboard.user_roles
      WHERE organization_id = ANY($1::uuid[])
        AND role_key <> 'platform_admin'
        AND NOT (user_id = ANY($2::uuid[]))`,
    [organizationIds, preserveUserIds]
  );
  // Platform-admin roles should never live on cleanup-eligible orgs; remove any leftover tenant roles.
  await client.query(
    `DELETE FROM blessboard.user_roles
      WHERE organization_id = ANY($1::uuid[])
        AND role_key <> 'platform_admin'`,
    [organizationIds]
  );

  await client.query(
    `UPDATE blessboard.platform_church_registration_applications
        SET organization_id = NULL,
            provisioned_at = NULL,
            provisioning_status = CASE
              WHEN provisioning_status = 'provisioned' THEN 'not_started'
              ELSE provisioning_status
            END
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
  await client.query(
    `DELETE FROM platform.media_folders WHERE organization_id = ANY($1::uuid[])`,
    [organizationIds]
  );

  const orgDel = await client.query(
    `DELETE FROM platform.organizations WHERE id = ANY($1::uuid[])`,
    [organizationIds]
  );

  if ((orgDel.rowCount || 0) !== 1) {
    const err = new Error("organization_delete_rowcount_mismatch");
    err.code = "PURGE_VERIFY";
    throw err;
  }

  return {
    ok: true,
    status: "deleted",
    organization: eligibility.organization,
    churches: churchResult.deletedChurches,
    auditEvents,
    mediaListed: mediaObjects.length,
    mediaObjects,
  };
}

/**
 * Batch helper retained for callers that already hold a transaction over many orgs.
 * Prefer per-organization transactions via purgeOrganizationTree in the service layer.
 *
 * @param {{ query: Function }} client
 * @param {{
 *   organizationIds: string[],
 *   preserveOrgIds: string[],
 *   preserveUserIds: string[],
 *   keepSessionId?: string|null,
 * }} opts
 */
async function deleteOrganizationTrees(client, opts) {
  const organizationIds = opts.organizationIds || [];
  const preserveOrgIds = opts.preserveOrgIds || [];
  const preserveUserIds = opts.preserveUserIds || [];
  if (!organizationIds.length) {
    return {
      organizations: 0,
      churches: 0,
      auditEvents: 0,
      mediaListed: 0,
      mediaObjects: [],
      results: [],
    };
  }

  const results = [];
  let churches = 0;
  let auditEvents = 0;
  let mediaListed = 0;
  const mediaObjects = [];
  let organizations = 0;

  for (const organizationId of organizationIds) {
    const result = await purgeOrganizationTree(client, {
      organizationId,
      preserveOrgIds,
      preserveUserIds,
      keepSessionId: opts.keepSessionId || null,
    });
    results.push(result);
    if (result.ok) {
      organizations += 1;
      churches += result.churches || 0;
      auditEvents += result.auditEvents || 0;
      mediaListed += result.mediaListed || 0;
      if (result.mediaObjects && result.mediaObjects.length) {
        mediaObjects.push(...result.mediaObjects);
      }
    } else if (result.status !== "skipped") {
      const err = new Error(result.reason || "organization_purge_failed");
      err.code = "PURGE_FAILED";
      err.organizationId = organizationId;
      throw err;
    }
  }

  return {
    organizations,
    churches,
    auditEvents,
    mediaListed,
    mediaObjects,
    results,
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

  if (preserve.preserveOrgIds.length) {
    const orgs = await client.query(
      `SELECT COUNT(*)::int AS n FROM platform.organizations
        WHERE id = ANY($1::uuid[])`,
      [preserve.preserveOrgIds]
    );
    if (orgs.rows[0].n !== preserve.preserveOrgIds.length) {
      failures.push("platform_admin_organization_missing");
    }
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

/**
 * Assert no organization-scoped rows remain for a deleted org id.
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function countOrganizationScopedResiduals(client, organizationId) {
  const residuals = [];
  for (const table of ORGANIZATION_SCOPED_TABLES) {
    const r = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE organization_id = $1`,
      [organizationId]
    );
    if (r.rows[0].n > 0) {
      residuals.push({ table, count: r.rows[0].n });
    }
  }
  // Registration applications may remain unlinked (organization_id NULL) — only count linked.
  return residuals;
}

module.exports = {
  ALLOWLISTED_ACTIONS,
  ORGANIZATION_SCOPED_TABLES,
  listPlatformAdminPreserveSet,
  listResettableOrganizations,
  listResettableOrganizationIds,
  getOrganizationPurgeEligibility,
  listChurchIdsForOrganizations,
  countResettableCategories,
  listMediaObjectsForChurches,
  deleteOrganizationWebsiteRecords,
  deleteChurchMessaging,
  deleteChurchScopedContent,
  deleteAuditEventsForOrganizations,
  purgeOrganizationTree,
  deleteOrganizationTrees,
  deleteRegistrationApplications,
  deleteAllInvitations,
  verifyPreservedFoundation,
  countOrphanTenantIdentities,
  countOrganizationScopedResiduals,
};
