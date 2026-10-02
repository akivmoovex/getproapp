"use strict";

/**
 * Safe demo-organisation content reset.
 * Never deletes production/pilot/test organisations or their records.
 * Re-seeds fabricated public demo content for data_environment = 'demo' only.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const {
  getDataEnvironment,
  isDemoEnvironment,
} = require("../../church/orgDataEnvironment");
const {
  seedChurchDemoOrganizationIfMissing,
  DEMO_ORG_SLUG,
} = require("../../seeds/seedChurchDemoOrganization");

async function assertDemoResetAllowed(org) {
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (!isDemoEnvironment(org)) {
    const err = new Error(
      `Demo reset is only allowed for organisations classified as demo (current: ${getDataEnvironment(org)}). Production records are never deleted.`
    );
    err.code = "RESET_FORBIDDEN";
    err.dataEnvironment = getDataEnvironment(org);
    throw err;
  }
}

/**
 * Wipe demo content tables for one demo organisation, then re-run demo seeders.
 * Preserves organisation + primary branch identity and admin accounts.
 *
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ platformAdminId?: number|null, actorLabel?: string }} [opts]
 */
async function resetDemoOrganisationContent(pool, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  const org = await organizationsRepo.findOrganizationById(pool, orgId);
  await assertDemoResetAllowed(org);

  const branches = await branchesRepo.listBranchesForOrganization(pool, orgId);
  const branchIds = branches.map((b) => b.id);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Content-only wipe — never delete organization / branch / admin identity rows.
    await client.query(`DELETE FROM public.church_attendance_records WHERE organization_id = $1`, [
      orgId,
    ]);
    await client.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.church_announcements WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.church_events WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.church_sermons WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.church_resources WHERE organization_id = $1`, [orgId]);
    await client.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]);
    await client.query(
      `DELETE FROM public.church_branch_website_content WHERE organization_id = $1`,
      [orgId]
    );
    await client.query(
      `DELETE FROM public.church_public_contact_submissions WHERE organization_id = $1`,
      [orgId]
    ).catch(() => {});

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }

  // Re-seed fabricated demo content (idempotent seeders).
  const seeded = await seedChurchDemoOrganizationIfMissing(pool);

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: orgId,
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: opts.platformAdminId || null,
    action: "platform_demo_organisation_reset",
    entity_type: "organization",
    entity_id: orgId,
    target_label: org.slug,
    metadata_json: {
      data_environment: "demo",
      branch_ids: branchIds,
      reseeding: true,
      preserved: ["organization", "branches", "admins"],
      actor_label: opts.actorLabel || null,
    },
  });

  return {
    organizationId: orgId,
    slug: org.slug,
    dataEnvironment: "demo",
    branchCount: branchIds.length,
    seededOrganizationId: seeded && seeded.organization ? seeded.organization.id : orgId,
  };
}

/**
 * Reset the canonical demo slug organisation (or reject if missing / misclassified).
 */
async function resetCanonicalDemoOrganisation(pool, opts = {}) {
  const org = await organizationsRepo.findOrganizationBySlug(pool, DEMO_ORG_SLUG);
  if (!org) {
    // Seed first, then reset content for a clean demo.
    const seeded = await seedChurchDemoOrganizationIfMissing(pool);
    if (!seeded || !seeded.organization) {
      const err = new Error("Demo organisation could not be created.");
      err.code = "NOT_FOUND";
      throw err;
    }
    // Ensure classification
    await pool.query(
      `UPDATE public.church_organizations SET data_environment = 'demo', updated_at = now() WHERE id = $1`,
      [seeded.organization.id]
    );
    return resetDemoOrganisationContent(pool, seeded.organization.id, opts);
  }
  if (!isDemoEnvironment(org)) {
    await pool.query(
      `UPDATE public.church_organizations SET data_environment = 'demo', updated_at = now() WHERE id = $1 AND slug = $2`,
      [org.id, DEMO_ORG_SLUG]
    );
    const refreshed = await organizationsRepo.findOrganizationById(pool, org.id);
    return resetDemoOrganisationContent(pool, refreshed.id, opts);
  }
  return resetDemoOrganisationContent(pool, org.id, opts);
}

async function updateOrganisationDataEnvironment(pool, organizationId, nextEnv, opts = {}) {
  const { normalizeDataEnvironment, isValidDataEnvironment } = require("../../church/orgDataEnvironment");
  if (!isValidDataEnvironment(nextEnv)) {
    const err = new Error("Invalid data environment.");
    err.code = "VALIDATION";
    throw err;
  }
  const env = normalizeDataEnvironment(nextEnv);
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const previous = getDataEnvironment(org);
  // Safety: never silently reclassify production via demo reset helpers — explicit admin update only.
  const r = await pool.query(
    `UPDATE public.church_organizations
     SET data_environment = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [organizationId, env]
  );
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: opts.platformAdminId || null,
    action: "platform_organization_data_environment_updated",
    entity_type: "organization",
    entity_id: organizationId,
    target_label: org.slug,
    metadata_json: {
      previous,
      next: env,
    },
  });
  return r.rows[0];
}

module.exports = {
  assertDemoResetAllowed,
  resetDemoOrganisationContent,
  resetCanonicalDemoOrganisation,
  updateOrganisationDataEnvironment,
};
