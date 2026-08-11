"use strict";

/**
 * ActiveClinic staff profile lifecycle and identity linking.
 */

const repo = require("../repositories/staffMemberRepository");
const {
  getHealthcareOrganizationById,
  requireActiveHealthcareOrganization,
  RESULT: HCO_RESULT,
} = require("./healthcareOrganizationService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const {
  resolvePlatformIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  linkIdentityToProductProfile,
  unlinkIdentityProductProfile,
  listProductProfilesForIdentity,
} = require("../../platform/services/identityProductProfileService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
} = require("./normalizeActiveClinicContact");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const EMPLOYMENT_TYPES = Object.freeze([
  "permanent",
  "contract",
  "temporary",
  "volunteer",
  "visiting",
  "agency",
  "other",
]);

const STATUSES = Object.freeze([
  "invited",
  "active",
  "inactive",
  "suspended",
  "archived",
]);

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_STATUS: "invalid_status",
  INVALID_EMPLOYMENT_TYPE: "invalid_employment_type",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  HCO_NOT_FOUND: "healthcare_organization_not_found",
  HCO_NOT_ACTIVE: "healthcare_organization_not_active",
  NOT_FOUND: "staff_not_found",
  NOT_ACTIVE: "staff_not_active",
  DUPLICATE_IDENTITY: "duplicate_staff_identity",
  IDENTITY_DISABLED: "identity_disabled",
  LINK_CONFLICT: "identity_link_conflict",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapStaff(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    platformIdentityId: row.platform_identity_id || null,
    staffNumber: row.staff_number || null,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name || null,
    displayName: row.display_name,
    phoneNormalized: row.phone_normalized,
    phoneDisplay: row.phone_display,
    emailNormalized: row.email_normalized || null,
    emailDisplay: row.email_display || null,
    jobTitle: row.job_title || null,
    employmentType: row.employment_type,
    status: row.status,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function trimRequired(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text;
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function createStaffMember(db, input) {
  const healthcareOrganizationId = String(
    (input && input.healthcareOrganizationId) || ""
  ).trim();
  let organizationId = String((input && input.organizationId) || "").trim();
  if (!healthcareOrganizationId || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }

  const hco = await getHealthcareOrganizationById(db, {
    id: healthcareOrganizationId,
    organizationId,
  });
  if (!hco.ok) {
    return { ok: false, code: RESULT.HCO_NOT_FOUND, staffMember: null };
  }
  organizationId = hco.healthcareOrganization.organizationId;

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, staffMember: null };
  }
  if (hco.healthcareOrganization.status === "archived") {
    return { ok: false, code: RESULT.HCO_NOT_ACTIVE, staffMember: null };
  }

  const firstName = trimRequired(input.firstName, 100);
  const lastName = trimRequired(input.lastName, 100);
  if (!firstName || !lastName) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  const displayName =
    trimRequired(input.displayName, 200) || `${firstName} ${lastName}`;
  const employmentType = String((input && input.employmentType) || "")
    .trim()
    .toLowerCase();
  if (!EMPLOYMENT_TYPES.includes(employmentType)) {
    return { ok: false, code: RESULT.INVALID_EMPLOYMENT_TYPE, staffMember: null };
  }
  const status = String((input && input.status) || "invited")
    .trim()
    .toLowerCase();
  if (!STATUSES.includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, staffMember: null };
  }

  const phone = normalizeActiveClinicPhone({
    phone: input.phone || input.primaryPhone,
    phoneCountry: input.phoneCountry || null,
    phoneNational: input.phoneNational || null,
    clinicDefaultCountry: input.clinicDefaultCountry || null,
  });
  if (!phone.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  const email = normalizeActiveClinicEmail(input.email);
  if (!email.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }

  let platformIdentityId = null;
  if (input.platformIdentityId) {
    const id = String(input.platformIdentityId).trim();
    if (!UUID_RE.test(id)) {
      return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
    }
    const resolved = await resolvePlatformIdentity(db, {
      identityId: id,
      requireActive: true,
    });
    if (!resolved.ok) {
      return { ok: false, code: RESULT.IDENTITY_DISABLED, staffMember: null };
    }
    const existing = await repo.findByIdentityAndOrganization(db, {
      platformIdentityId: id,
      organizationId,
    });
    if (existing) {
      return { ok: false, code: RESULT.DUPLICATE_IDENTITY, staffMember: null };
    }
    platformIdentityId = id;
  }

  try {
    const row = await repo.insertStaffMember(db, {
      organizationId,
      healthcareOrganizationId,
      platformIdentityId,
      staffNumber: trimRequired(input.staffNumber, 64),
      firstName,
      lastName,
      preferredName: trimRequired(input.preferredName, 100),
      displayName,
      phoneNormalized: phone.normalized,
      phoneDisplay: phone.display,
      emailNormalized: email.normalized,
      emailDisplay: email.display,
      jobTitle: trimRequired(input.jobTitle, 120),
      employmentType,
      status,
      startDate: input.startDate || null,
      endDate: input.endDate || null,
    });

    if (platformIdentityId) {
      const linked = await linkIdentityToProductProfile(db, {
        identityId: platformIdentityId,
        productKey: "activeclinic",
        productProfileId: row.id,
      });
      if (!linked.ok) {
        // Best-effort: staff row exists; surface link conflict.
        return {
          ok: false,
          code: RESULT.LINK_CONFLICT,
          staffMember: mapStaff(row),
        };
      }
    }

    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId,
      actorUserId: null,
      actionKey: "activeclinic.staff.create",
      entityType: "staff_member",
      entityId: row.id,
      outcome: "success",
      metadataJson: {
        status,
        employment_type: employmentType,
        has_identity: Boolean(platformIdentityId),
        actor_kind: "system",
      },
    });

    return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/staff_members_hco_identity_live_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_IDENTITY, staffMember: null };
    }
    if (/requires active ActiveClinic/i.test(msg)) {
      return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, staffMember: null };
    }
    throw err;
  }
}

async function getStaffMemberByIdAndOrganization(db, input) {
  const id = String((input && input.id) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!id || !organizationId || !UUID_RE.test(id) || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  const row = await repo.findByIdAndOrganization(db, { id, organizationId });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, staffMember: null };
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

async function getStaffMemberByIdentityAndOrganization(db, input) {
  const platformIdentityId = String((input && input.platformIdentityId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (
    !platformIdentityId ||
    !organizationId ||
    !UUID_RE.test(platformIdentityId) ||
    !UUID_RE.test(organizationId)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  const row = await repo.findByIdentityAndOrganization(db, {
    platformIdentityId,
    organizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, staffMember: null };
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

async function requireActiveStaffMember(db, input) {
  const enabled = await organizationHasActiveProduct(db, {
    organizationId: input.organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) {
    return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, staffMember: null };
  }
  const hco = await requireActiveHealthcareOrganization(db, {
    organizationId: input.organizationId,
  });
  if (!hco.ok) {
    if (hco.code === HCO_RESULT.PRODUCT_NOT_ENABLED) {
      return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, staffMember: null };
    }
    return { ok: false, code: RESULT.HCO_NOT_ACTIVE, staffMember: null };
  }

  let got;
  if (input.staffMemberId) {
    got = await getStaffMemberByIdAndOrganization(db, {
      id: input.staffMemberId,
      organizationId: input.organizationId,
    });
  } else {
    got = await getStaffMemberByIdentityAndOrganization(db, {
      platformIdentityId: input.platformIdentityId,
      organizationId: input.organizationId,
    });
  }
  if (!got.ok) return got;
  if (got.staffMember.status !== "active") {
    return { ok: false, code: RESULT.NOT_ACTIVE, staffMember: got.staffMember };
  }
  return got;
}

async function listStaffMembersByOrganization(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMembers: [] };
  }
  const rows = await repo.listByOrganization(db, {
    organizationId,
    status: input.status || null,
  });
  return { ok: true, code: RESULT.OK, staffMembers: rows.map(mapStaff) };
}

async function listStaffMembersByFacility(db, input) {
  const rows = await repo.listByFacility(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId,
  });
  return { ok: true, code: RESULT.OK, staffMembers: rows.map(mapStaff) };
}

async function suspendStaffMember(db, input) {
  const existing = await getStaffMemberByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  const row = await repo.updateStaffMember(db, {
    id: input.id,
    organizationId: input.organizationId,
    patch: { status: "suspended" },
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.suspend",
    entityType: "staff_member",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

async function archiveStaffMember(db, input) {
  const existing = await getStaffMemberByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  const row = await repo.updateStaffMember(db, {
    id: input.id,
    organizationId: input.organizationId,
    patch: { status: "archived" },
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.archive",
    entityType: "staff_member",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

async function linkStaffMemberToIdentity(db, input) {
  const existing = await getStaffMemberByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  if (existing.staffMember.platformIdentityId) {
    if (existing.staffMember.platformIdentityId === input.platformIdentityId) {
      return existing;
    }
    return { ok: false, code: RESULT.LINK_CONFLICT, staffMember: existing.staffMember };
  }

  const identityId = String(input.platformIdentityId || "").trim();
  if (!UUID_RE.test(identityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
  }
  const resolved = await resolvePlatformIdentity(db, {
    identityId,
    requireActive: true,
  });
  if (!resolved.ok) {
    return { ok: false, code: RESULT.IDENTITY_DISABLED, staffMember: null };
  }

  const dup = await repo.findByIdentityAndOrganization(db, {
    platformIdentityId: identityId,
    organizationId: input.organizationId,
  });
  if (dup) {
    return { ok: false, code: RESULT.DUPLICATE_IDENTITY, staffMember: null };
  }

  try {
    const row = await repo.setPlatformIdentity(db, {
      id: input.id,
      organizationId: input.organizationId,
      platformIdentityId: identityId,
    });
    const linked = await linkIdentityToProductProfile(db, {
      identityId,
      productKey: "activeclinic",
      productProfileId: input.id,
    });
    if (!linked.ok) {
      return { ok: false, code: RESULT.LINK_CONFLICT, staffMember: mapStaff(row) };
    }
    await recordAuditEventSafe(db, {
      deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
      organizationId: input.organizationId,
      actorUserId: null,
      actionKey: "activeclinic.staff.identity_link",
      entityType: "staff_member",
      entityId: input.id,
      outcome: "success",
      metadataJson: { actor_kind: "system" },
    });
    return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/staff_members_hco_identity_live_uidx/i.test(msg)) {
      return { ok: false, code: RESULT.DUPLICATE_IDENTITY, staffMember: null };
    }
    throw err;
  }
}

async function unlinkStaffMemberFromIdentity(db, input) {
  const existing = await getStaffMemberByIdAndOrganization(db, input);
  if (!existing.ok) return existing;
  const identityId = existing.staffMember.platformIdentityId;
  if (!identityId) {
    return existing;
  }
  const row = await repo.clearPlatformIdentity(db, {
    id: input.id,
    organizationId: input.organizationId,
  });
  const profiles = await listProductProfilesForIdentity(db, { identityId });
  const match = (profiles.links || []).find(
    (l) =>
      l.productKey === "activeclinic" &&
      l.productProfileId === input.id &&
      l.status === "active"
  );
  if (match) {
    await unlinkIdentityProductProfile(db, {
      identityId,
      productKey: "activeclinic",
      productProfileId: input.id,
    });
  }
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.identity_unlink",
    entityType: "staff_member",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

async function updateStaffMemberProfile(db, input) {
  const existing = await getStaffMemberByIdAndOrganization(db, {
    id: input.id,
    organizationId: input.organizationId,
  });
  if (!existing.ok) return existing;
  if (
    existing.staffMember.status === "archived" ||
    existing.staffMember.status === "suspended"
  ) {
    // Profile edits while suspended/archived still allowed for admins fixing data,
    // but status must not be changed through this path.
  }

  const patch = {};
  const src = input.patch || {};
  if (src.firstName != null) {
    const firstName = trimRequired(src.firstName, 100);
    if (!firstName) return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
    patch.firstName = firstName;
  }
  if (src.lastName != null) {
    const lastName = trimRequired(src.lastName, 100);
    if (!lastName) return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
    patch.lastName = lastName;
  }
  if (src.preferredName !== undefined) {
    patch.preferredName = src.preferredName
      ? trimRequired(src.preferredName, 100)
      : null;
  }
  if (src.displayName != null) {
    const displayName = trimRequired(src.displayName, 200);
    if (!displayName) return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
    patch.displayName = displayName;
  } else if (patch.firstName || patch.lastName) {
    const first = patch.firstName || existing.staffMember.firstName;
    const last = patch.lastName || existing.staffMember.lastName;
    patch.displayName = `${first} ${last}`;
  }
  if (src.jobTitle !== undefined) {
    patch.jobTitle = src.jobTitle ? trimRequired(src.jobTitle, 120) : null;
  }
  if (src.employmentType != null) {
    const employmentType = String(src.employmentType).trim().toLowerCase();
    if (!EMPLOYMENT_TYPES.includes(employmentType)) {
      return { ok: false, code: RESULT.INVALID_EMPLOYMENT_TYPE, staffMember: null };
    }
    patch.employmentType = employmentType;
  }
  if (src.staffNumber !== undefined) {
    patch.staffNumber = src.staffNumber
      ? trimRequired(String(src.staffNumber), 64)
      : null;
  }
  if (src.startDate !== undefined) {
    patch.startDate = src.startDate || null;
  }
  if (src.endDate !== undefined) {
    patch.endDate = src.endDate || null;
  }
  if (src.phone != null || src.phoneNational != null) {
    const phone = normalizeActiveClinicPhone({
      phone: src.phone,
      phoneCountry: src.phoneCountry || null,
      phoneNational: src.phoneNational || null,
      clinicDefaultCountry: src.clinicDefaultCountry || null,
    });
    if (!phone.ok) {
      return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
    }
    patch.phoneNormalized = phone.normalized;
    patch.phoneDisplay = phone.display;
  }
  if (src.email !== undefined) {
    if (!src.email) {
      patch.emailNormalized = null;
      patch.emailDisplay = null;
    } else {
      const email = normalizeActiveClinicEmail(src.email);
      if (!email.ok) {
        return { ok: false, code: RESULT.INVALID_INPUT, staffMember: null };
      }
      patch.emailNormalized = email.normalized;
      patch.emailDisplay = email.display;
    }
  }

  const row = await repo.updateStaffMember(db, {
    id: input.id,
    organizationId: input.organizationId,
    patch,
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.staff.update",
    entityType: "staff_member",
    entityId: input.id,
    outcome: "success",
    metadataJson: { actor_kind: "system" },
  });
  return { ok: true, code: RESULT.OK, staffMember: mapStaff(row) };
}

module.exports = {
  RESULT,
  EMPLOYMENT_TYPES,
  STATUSES,
  mapStaff,
  createStaffMember,
  getStaffMemberByIdAndOrganization,
  getStaffMemberByIdentityAndOrganization,
  requireActiveStaffMember,
  listStaffMembersByOrganization,
  listStaffMembersByFacility,
  updateStaffMemberProfile,
  suspendStaffMember,
  archiveStaffMember,
  linkStaffMemberToIdentity,
  unlinkStaffMemberFromIdentity,
};
