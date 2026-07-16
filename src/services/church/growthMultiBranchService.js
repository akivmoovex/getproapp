"use strict";

/**
 * Growth multi-branch HQ administration — branch lifecycle and cross-branch members.
 * No Network hierarchy; path routing uses org-scoped branch slugs under /branches/:slug.
 */

const bcrypt = require("bcryptjs");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const platformProvisioningRepo = require("../../db/pg/church/platformProvisioningRepo");
const { normalizeSlug } = require("../../church/platformProvisioningValidation");
const { validateBranchPathSlug } = require("../../church/branchPathSlug");
const { organisationAllowsBranchPaths } = require("./branchPathRoutingService");
const {
  resolveCreateBranchLifecycle,
  activateBranch,
  deactivateBranch,
} = require("./branchActivationPolicyService");
const { onboardNewBranchContent } = require("./branchOnboardingService");
const seatQuota = require("./churchSeatQuotaService");

async function deriveUniqueBranchHostSlug(db, orgSlug, branchSlug) {
  const orgPart = normalizeSlug(orgSlug);
  const branchPart = normalizeSlug(branchSlug);
  let base = normalizeSlug(`${orgPart}-${branchPart}`).slice(0, 63).replace(/-+$/, "");
  if (!base) base = branchPart.slice(0, 63);
  let candidate = base;
  let n = 0;
  while (!(await branchesRepo.isBranchHostSlugAvailable(db, candidate))) {
    n += 1;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, Math.max(1, 63 - suffix.length))}${suffix}`;
  }
  return candidate;
}

function assertCrossBranchMemberAccess(organization) {
  if (!organisationAllowsBranchPaths(organization)) {
    throw Object.assign(new Error("Cross-branch member lookup requires Growth."), {
      code: "PACKAGE_REQUIRED",
    });
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {number} hqAdminId
 * @param {{ branch: object, branchAdmin: object }} payload
 */
async function createBranchByHq(pool, organizationId, hqAdminId, payload) {
  const organization = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!organization) {
    throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
  }

  await platformProvisioningRepo.assertOrganizationCanAddBranch(pool, organization);

  const slugCheck = validateBranchPathSlug(payload.branch.slug);
  if (!slugCheck.ok) {
    throw Object.assign(new Error(slugCheck.error), { code: "INVALID_SLUG" });
  }

  const existingSlug = await branchesRepo.findBranchBySlug(pool, organization.id, slugCheck.slug);
  if (existingSlug) {
    throw Object.assign(new Error("A branch with this slug already exists in your organisation."), {
      code: "DUPLICATE_BRANCH_SLUG",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const hostSlug = await deriveUniqueBranchHostSlug(client, organization.slug, slugCheck.slug);
    const lifecycle = await resolveCreateBranchLifecycle(client, organization, { preferActive: true });

    await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
      organizationId: organization.id,
      actorType: "hq_admin",
      actorId: hqAdminId || null,
      reason: "hq_create_branch_initial_admin",
    });

    const branch = await branchesRepo.createBranch(client, {
      organization_id: organization.id,
      slug: slugCheck.slug,
      host_slug: hostSlug,
      name: payload.branch.name,
      status: lifecycle.status,
      lifecycle_phase: lifecycle.lifecycle_phase,
      billing_ready: false,
      city: payload.branch.city,
      country: payload.branch.country,
      pastor_name: payload.branch.pastor_name,
      contact_phone: payload.branch.contact_phone,
      contact_email: payload.branch.contact_email,
      welcome_message: payload.branch.welcome_message || "",
      service_times: payload.branch.service_times || "",
      location_text: payload.branch.location_text || "",
      member_registration_enabled: true,
    });

    const branchPasswordHash = await bcrypt.hash(payload.branchAdmin.temporary_password, 12);
    const branchAdmin = await platformProvisioningRepo.createInitialBranchAdminForBranch(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      full_name: payload.branchAdmin.full_name,
      email: payload.branchAdmin.email,
      phone: payload.branchAdmin.phone,
      username: payload.branchAdmin.username,
      password_hash: branchPasswordHash,
    });

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organization.id,
      branch_id: branch.id,
      actor_type: "hq_admin",
      actor_id: hqAdminId || null,
      action: "hq_branch_created",
      entity_type: "church_branch",
      entity_id: branch.id,
      target_label: branch.name,
      metadata_json: {
        slug: branch.slug,
        host_slug: hostSlug,
        status: branch.status,
        lifecycle_phase: lifecycle.lifecycle_phase,
        package_code: lifecycle.packageCode,
        created_as_active: lifecycle.createdAsActive,
        defer_reason: lifecycle.deferReason || null,
      },
    });

    try {
      await onboardNewBranchContent(client, organization, branch, {
        publishWebsite: lifecycle.createdAsActive,
        includeDraftStarters: true,
      });
    } catch (onboardingErr) {
      onboardingErr.code = onboardingErr.code || "ONBOARDING_CONTENT_FAILED";
      throw onboardingErr;
    }

    await client.query("COMMIT");
    return {
      organization,
      branch,
      branchAdmin,
      createdAsActive: lifecycle.createdAsActive,
      deferReason: lifecycle.deferReason || null,
    };
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
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} organizationId
 * @param {number} hqAdminId
 * @param {{ billingAcknowledged?: boolean, reason?: string | null }} opts
 */
async function activateBranchByHq(pool, branchId, organizationId, hqAdminId, opts = {}) {
  const branch = await branchesRepo.findBranchByIdForPlatform(pool, branchId);
  if (!branch || Number(branch.organization_id) !== Number(organizationId)) {
    throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
  }

  const result = await activateBranch(pool, branchId, {
    billingAcknowledged: opts.billingAcknowledged === true,
    reason: opts.reason || null,
  });

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    actor_type: "hq_admin",
    actor_id: hqAdminId || null,
    action: "hq_branch_activated",
    entity_type: "church_branch",
    entity_id: branchId,
    target_label: result.branch.name,
    metadata_json: {
      package_code: result.packageCode,
      already_active: result.alreadyActive === true,
    },
  });

  return result;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} organizationId
 * @param {number} hqAdminId
 * @param {{ reason?: string | null }} opts
 */
async function deactivateBranchByHq(pool, branchId, organizationId, hqAdminId, opts = {}) {
  const branch = await branchesRepo.findBranchByIdForPlatform(pool, branchId);
  if (!branch || Number(branch.organization_id) !== Number(organizationId)) {
    throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
  }
  if (String(branch.status) !== "active") {
    throw Object.assign(new Error("Only active branches can be deactivated."), { code: "NOT_ACTIVE" });
  }

  const activeCount = await branchesRepo.countActiveBranchesForOrganization(pool, organizationId);
  if (activeCount <= 1) {
    throw Object.assign(new Error("At least one active branch must remain."), {
      code: "LAST_ACTIVE_BRANCH",
    });
  }

  const updated = await deactivateBranch(pool, branchId, {
    reason: opts.reason || null,
    lifecyclePhase: "temporarily_inactive",
  });

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    actor_type: "hq_admin",
    actor_id: hqAdminId || null,
    action: "hq_branch_deactivated",
    entity_type: "church_branch",
    entity_id: branchId,
    target_label: updated.name,
    metadata_json: { reason: opts.reason || null },
  });

  return updated;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} query
 * @param {{ status?: string, limit?: number }} [opts]
 */
async function searchMembersAcrossBranches(pool, organizationId, query, opts = {}) {
  return membersRepo.searchMembersForOrganization(pool, organizationId, query, opts);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} organizationId
 */
async function findMemberForHq(pool, memberId, organizationId) {
  return membersRepo.findMemberByIdForOrganization(pool, memberId, organizationId);
}

module.exports = {
  deriveUniqueBranchHostSlug,
  assertCrossBranchMemberAccess,
  createBranchByHq,
  activateBranchByHq,
  deactivateBranchByHq,
  searchMembersAcrossBranches,
  findMemberForHq,
};
