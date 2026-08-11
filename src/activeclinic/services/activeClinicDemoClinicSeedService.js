"use strict";

/**
 * Idempotent ActiveClinic demo + Julflona clinic provisioning.
 * Uses canonical platform/ActiveClinic services for identities and passwords.
 * Never prints hashes, tokens, or plaintext passwords.
 */

const { provisionPlatformTenant } = require("../../platform/services/provisionPlatformTenant");
const {
  createHealthcareOrganization,
  getHealthcareOrganizationByOrganizationId,
} = require("./healthcareOrganizationService");
const { createFacility } = require("./facilityService");
const {
  createStaffMember,
  linkStaffMemberToIdentity,
  listStaffMembersByOrganization,
  updateStaffMemberProfile,
} = require("./activeClinicStaffService");
const { assignStaffToFacility } = require("./activeClinicStaffFacilityService");
const {
  assignStaffRole,
  listStaffRoleAssignments,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
} = require("./activeClinicAuthorizationService");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  createPlatformIdentity,
  mapIdentity,
} = require("../../platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
  RESULT: CRED_RESULT,
} = require("../../platform/services/platformIdentityCredentialService");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  DEMO_BANNER,
  ALLOWED_SEED_ENVIRONMENTS,
  CLINIC_SPECS,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
} = require("./activeClinicDemoClinicSpec");
const {
  ensureDefaultDepartments,
} = require("./activeClinicDepartmentService");

const RESULT = Object.freeze({
  OK: "ok",
  ABORT_DATABASE_IDENTITY_UNKNOWN: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
  ABORT_ENVIRONMENT: "ABORT_WITH_ENVIRONMENT_REFUSED",
  ABORT_ORG_KEY_CONFLICT: "ABORT_WITH_ORGANIZATION_KEY_CONFLICT",
  JULFLONA_ADMIN_EMAIL_CONFLICT: "JULFLONA_ADMIN_EMAIL_CONFLICT",
  JULFLONA_PASSWORD_POLICY_BLOCKED: "JULFLONA_PASSWORD_POLICY_BLOCKED",
  DEMO_ADMIN_EMAIL_CONFLICT: "DEMO_ADMIN_EMAIL_CONFLICT",
  INVALID_INPUT: "invalid_input",
});

/** Policy-compliant temporary password returned once in CLI handoff when requested password is rejected. */
const JULFLONA_TEMP_PASSWORD = "JulflonaTmp-2026A";

/**
 * Testing/demo-only credential for departmental users and optional demo-admin reset
 * (mustChangePassword=true). Override with options / ACTIVECLINIC_DEMO_STAFF_PASSWORD.
 * Only usable after assertSafeSeedEnvironment (testing|demo). Never print in normal logs.
 */
const DEMO_ROLE_STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";

function resolveDemoStaffPassword(explicit) {
  if (explicit != null && String(explicit).length) return String(explicit);
  if (process.env.ACTIVECLINIC_DEMO_STAFF_PASSWORD) {
    return String(process.env.ACTIVECLINIC_DEMO_STAFF_PASSWORD);
  }
  return DEMO_ROLE_STAFF_PASSWORD;
}

function bump(counts, key) {
  counts[key] = (counts[key] || 0) + 1;
}

async function readDatabaseIdentity(db) {
  const r = await db.query(
    `SELECT environment_code, identity_key, host_fingerprint
       FROM platform.database_identity
      LIMIT 1`
  );
  return r.rows[0] || null;
}

async function assertSafeSeedEnvironment(db, opts = {}) {
  const identity = await readDatabaseIdentity(db);
  if (!identity || !identity.identity_key || !identity.environment_code) {
    return {
      ok: false,
      code: RESULT.ABORT_DATABASE_IDENTITY_UNKNOWN,
      message: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
      identity: null,
    };
  }
  const env = String(identity.environment_code).trim().toLowerCase();
  if (!ALLOWED_SEED_ENVIRONMENTS.includes(env)) {
    return {
      ok: false,
      code: RESULT.ABORT_ENVIRONMENT,
      message: `Refusing seed against environment_code=${env}`,
      identity,
    };
  }
  if (opts.requireIdentityKey) {
    const expected = String(opts.requireIdentityKey).trim();
    if (expected && expected !== identity.identity_key) {
      return {
        ok: false,
        code: RESULT.ABORT_DATABASE_IDENTITY_UNKNOWN,
        message: "ABORT_WITH_DATABASE_IDENTITY_UNKNOWN",
        identity,
      };
    }
  }
  return { ok: true, code: RESULT.OK, identity };
}

/**
 * Ensure ActiveClinic product + deployment catalogue rows exist (seeds/004 equivalent).
 */
async function ensureActiveClinicCatalogue(db, { dryRun = false } = {}) {
  const counts = { created: 0, updated: 0, unchanged: 0 };
  if (dryRun) {
    const product = await db.query(
      `SELECT product_key, status FROM platform.products WHERE product_key = 'activeclinic'`
    );
    const dep = await db.query(
      `SELECT deployment_code, status FROM platform.deployments WHERE deployment_code = $1`,
      [CODE_ACTIVECLINIC_ORG_V6]
    );
    if (!product.rows.length) bump(counts, "created");
    else bump(counts, "unchanged");
    if (!dep.rows.length) bump(counts, "created");
    else bump(counts, "unchanged");
    return { ok: true, dryRun: true, counts, productExists: product.rows.length > 0, deploymentExists: dep.rows.length > 0 };
  }

  const product = await db.query(
    `INSERT INTO platform.products (product_key, display_name, status)
     VALUES ('activeclinic', 'ActiveClinic', 'active')
     ON CONFLICT (product_key) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`
  );
  if (product.rows[0] && product.rows[0].inserted) bump(counts, "created");
  else bump(counts, "updated");

  const dep = await db.query(
    `INSERT INTO platform.deployments (
       deployment_code, application_code, release_version, canonical_domain,
       environment_code, status, jobs_enabled, database_access_mode, session_cookie_name
     ) VALUES (
       $1, 'activeclinic', 'v6', 'activeclinic.org',
       'testing', 'active', false, 'read_write', 'activeclinic_org_sid'
     )
     ON CONFLICT (deployment_code) DO UPDATE SET
       application_code = EXCLUDED.application_code,
       release_version = EXCLUDED.release_version,
       canonical_domain = EXCLUDED.canonical_domain,
       environment_code = EXCLUDED.environment_code,
       status = EXCLUDED.status,
       jobs_enabled = EXCLUDED.jobs_enabled,
       database_access_mode = EXCLUDED.database_access_mode,
       session_cookie_name = EXCLUDED.session_cookie_name,
       updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [CODE_ACTIVECLINIC_ORG_V6]
  );
  if (dep.rows[0] && dep.rows[0].inserted) bump(counts, "created");
  else bump(counts, "updated");

  return { ok: true, dryRun: false, counts };
}

async function findOrganizationByKey(db, organizationKey) {
  const r = await db.query(
    `SELECT id, organization_key, display_name, status, data_environment, legal_name
       FROM platform.organizations
      WHERE organization_key = $1
      LIMIT 1`,
    [organizationKey]
  );
  return r.rows[0] || null;
}

async function findActiveClinicEnrolment(db, organizationId) {
  const r = await db.query(
    `SELECT op.id, op.status, p.product_key, op.product_tenant_key
       FROM platform.organization_products op
       JOIN platform.products p ON p.id = op.product_id
      WHERE op.organization_id = $1 AND p.product_key = 'activeclinic'
      LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

async function ensureOrganization(db, spec, { dryRun = false, counts }) {
  const existing = await findOrganizationByKey(db, spec.organizationKey);
  if (existing) {
    const enrolment = await findActiveClinicEnrolment(db, existing.id);
    if (!enrolment) {
      const other = await db.query(
        `SELECT p.product_key FROM platform.organization_products op
         JOIN platform.products p ON p.id = op.product_id
         WHERE op.organization_id = $1 LIMIT 3`,
        [existing.id]
      );
      if (other.rows.length) {
        return {
          ok: false,
          code: RESULT.ABORT_ORG_KEY_CONFLICT,
          message: "ABORT_WITH_ORGANIZATION_KEY_CONFLICT",
          organization: existing,
        };
      }
    }
    if (dryRun) {
      bump(counts, "unchanged");
      return { ok: true, organizationId: existing.id, organization: existing, created: false };
    }
    await db.query(
      `UPDATE platform.organizations
          SET display_name = $2,
              legal_name = COALESCE($3, legal_name),
              status = 'active',
              data_environment = 'demo',
              updated_at = now()
        WHERE id = $1`,
      [existing.id, spec.platformDisplayName, spec.healthcareLegalName]
    );
    if (enrolment && enrolment.status !== "active") {
      await db.query(
        `UPDATE platform.organization_products SET status = 'active', updated_at = now() WHERE id = $1`,
        [enrolment.id]
      );
    }
    if (!enrolment) {
      const provision = await provisionPlatformTenant(db, {
        organizationKey: spec.organizationKey,
        displayName: spec.platformDisplayName,
        legalName: spec.healthcareLegalName,
        dataEnvironment: "demo",
        productKey: "activeclinic",
        productTenantKey: spec.productTenantKey,
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        skipDomain: true,
      });
      if (!provision.ok) {
        return { ok: false, code: provision.status, message: provision.message, provision };
      }
    }
    bump(counts, "updated");
    const refreshed = await findOrganizationByKey(db, spec.organizationKey);
    return { ok: true, organizationId: refreshed.id, organization: refreshed, created: false };
  }

  if (dryRun) {
    bump(counts, "created");
    return { ok: true, organizationId: null, organization: null, created: true, dryRun: true };
  }

  const provision = await provisionPlatformTenant(db, {
    organizationKey: spec.organizationKey,
    displayName: spec.platformDisplayName,
    legalName: spec.healthcareLegalName,
    dataEnvironment: "demo",
    productKey: "activeclinic",
    productTenantKey: spec.productTenantKey,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    skipDomain: true,
  });
  if (!provision.ok) {
    return { ok: false, code: provision.status, message: provision.message, provision };
  }
  bump(counts, "created");
  return {
    ok: true,
    organizationId: provision.records.organization.id,
    organization: provision.records.organization,
    created: true,
  };
}

async function ensureHealthcareOrganization(db, spec, organizationId, { dryRun, counts }) {
  const existing = await getHealthcareOrganizationByOrganizationId(db, { organizationId });
  if (existing.ok && existing.healthcareOrganization) {
    if (dryRun) {
      bump(counts, "unchanged");
      return { ok: true, hco: existing.healthcareOrganization, created: false };
    }
    await db.query(
      `UPDATE activeclinic.healthcare_organizations
          SET legal_name = $2,
              public_name = $3,
              status = 'active',
              timezone = $4,
              country_code = $5,
              website_published = true,
              public_booking_enabled = true,
              website_tagline = $6,
              website_about = $7,
              website_logo_url = $8,
              public_phone_display = $9,
              public_email_display = $10,
              updated_at = now()
        WHERE id = $1`,
      [
        existing.healthcareOrganization.id,
        spec.healthcareLegalName,
        spec.healthcarePublicName,
        spec.timezone,
        spec.countryCode,
        spec.websiteTagline,
        spec.websiteAbout,
        spec.websiteLogoUrl,
        spec.publicPhoneDisplay,
        spec.publicEmailDisplay,
      ]
    );
    bump(counts, "updated");
    const refreshed = await getHealthcareOrganizationByOrganizationId(db, { organizationId });
    return { ok: true, hco: refreshed.healthcareOrganization, created: false };
  }

  if (dryRun) {
    bump(counts, "created");
    return { ok: true, hco: null, created: true, dryRun: true };
  }

  const created = await createHealthcareOrganization(db, {
    organizationId,
    legalName: spec.healthcareLegalName,
    publicName: spec.healthcarePublicName,
    organizationType: "private_healthcare",
    countryCode: spec.countryCode,
    timezone: spec.timezone,
    status: "active",
  });
  if (!created.ok) {
    return { ok: false, code: created.code, message: created.code };
  }
  await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = true,
            public_booking_enabled = true,
            website_tagline = $2,
            website_about = $3,
            public_phone_display = $4,
            public_email_display = $5,
            updated_at = now()
      WHERE id = $1`,
    [
      created.healthcareOrganization.id,
      spec.websiteTagline,
      spec.websiteAbout,
      spec.publicPhoneDisplay,
      spec.publicEmailDisplay,
    ]
  );
  bump(counts, "created");
  return { ok: true, hco: created.healthcareOrganization, created: true };
}

async function ensureFacility(db, spec, organizationId, healthcareOrganizationId, { dryRun, counts }) {
  const existing = await db.query(
    `SELECT * FROM activeclinic.facilities
      WHERE healthcare_organization_id = $1 AND facility_key = $2
      LIMIT 1`,
    [healthcareOrganizationId, spec.facilityKey]
  );
  if (existing.rows[0]) {
    if (dryRun) {
      bump(counts, "unchanged");
      return { ok: true, facility: existing.rows[0], created: false };
    }
    await db.query(
      `UPDATE activeclinic.facilities
          SET display_name = $2,
              status = 'active',
              is_primary = true,
              country_code = $3,
              province = $4,
              city = $5,
              timezone = $6,
              address_line_1 = $7,
              phone_normalized = $8,
              phone_display = $9,
              email_display = $10,
              show_in_directory = true,
              website_published = true,
              public_hours_json = $11::jsonb,
              updated_at = now()
        WHERE id = $1`,
      [
        existing.rows[0].id,
        spec.facilityDisplayName,
        spec.countryCode,
        spec.province,
        spec.city,
        spec.timezone,
        spec.addressLine1,
        spec.facilityPhone,
        spec.publicPhoneDisplay,
        spec.publicEmailDisplay,
        JSON.stringify(spec.publicHours),
      ]
    );
    bump(counts, "updated");
    const refreshed = await db.query(`SELECT * FROM activeclinic.facilities WHERE id = $1`, [
      existing.rows[0].id,
    ]);
    return { ok: true, facility: refreshed.rows[0], created: false };
  }

  if (dryRun) {
    bump(counts, "created");
    return { ok: true, facility: null, created: true, dryRun: true };
  }

  const created = await createFacility(db, {
    organizationId,
    healthcareOrganizationId,
    facilityKey: spec.facilityKey,
    displayName: spec.facilityDisplayName,
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: spec.countryCode,
    timezone: spec.timezone,
    phone: spec.facilityPhone,
    city: spec.city,
    province: spec.province,
  });
  if (!created.ok) {
    return { ok: false, code: created.code, message: created.code };
  }
  await db.query(
    `UPDATE activeclinic.facilities
        SET show_in_directory = true,
            website_published = true,
            address_line_1 = $2,
            phone_display = $3,
            email_display = $4,
            public_hours_json = $5::jsonb,
            updated_at = now()
      WHERE id = $1`,
    [
      created.facility.id,
      spec.addressLine1,
      spec.publicPhoneDisplay,
      spec.publicEmailDisplay,
      JSON.stringify(spec.publicHours),
    ]
  );
  bump(counts, "created");
  return { ok: true, facility: created.facility, created: true };
}

async function ensureServices(db, spec, organizationId, healthcareOrganizationId, { dryRun, counts }) {
  for (const service of spec.services) {
    const existing = await db.query(
      `SELECT id FROM activeclinic.appointment_service_types
        WHERE healthcare_organization_id = $1 AND service_key = $2`,
      [healthcareOrganizationId, service.serviceKey]
    );
    if (existing.rows[0]) {
      if (dryRun) {
        bump(counts, "unchanged");
        continue;
      }
      await db.query(
        `UPDATE activeclinic.appointment_service_types
            SET display_name = $2,
                description = $3,
                public_summary = $4,
                default_duration_minutes = $5,
                public_bookable = true,
                status = 'active',
                updated_at = now()
          WHERE id = $1`,
        [
          existing.rows[0].id,
          service.displayName,
          service.description,
          service.publicSummary,
          service.durationMinutes,
        ]
      );
      bump(counts, "updated");
    } else if (dryRun) {
      bump(counts, "created");
    } else {
      await db.query(
        `INSERT INTO activeclinic.appointment_service_types (
           organization_id, healthcare_organization_id, service_key, display_name,
           description, default_duration_minutes, public_bookable, public_summary, status
         ) VALUES ($1,$2,$3,$4,$5,$6,true,$7,'active')`,
        [
          organizationId,
          healthcareOrganizationId,
          service.serviceKey,
          service.displayName,
          service.description,
          service.durationMinutes,
          service.publicSummary,
        ]
      );
      bump(counts, "created");
    }
  }
  return { ok: true };
}

async function ensureProcedures(db, spec, organizationId, healthcareOrganizationId, facilityId, { dryRun, counts }) {
  for (const procedure of spec.procedures) {
    const existing = await db.query(
      `SELECT id FROM activeclinic.public_procedures
        WHERE healthcare_organization_id = $1 AND procedure_key = $2`,
      [healthcareOrganizationId, procedure.procedureKey]
    );
    if (existing.rows[0]) {
      if (dryRun) {
        bump(counts, "unchanged");
        continue;
      }
      await db.query(
        `UPDATE activeclinic.public_procedures
            SET display_name = $2,
                summary = $3,
                category = $4,
                referral_required = $5,
                preparation_instructions = $6,
                estimated_duration_minutes = $7,
                facility_id = $8,
                status = 'active',
                updated_at = now()
          WHERE id = $1`,
        [
          existing.rows[0].id,
          procedure.displayName,
          procedure.summary,
          procedure.category,
          procedure.referralRequired,
          procedure.preparationInstructions,
          procedure.estimatedDurationMinutes,
          facilityId,
        ]
      );
      bump(counts, "updated");
    } else if (dryRun) {
      bump(counts, "created");
    } else {
      await db.query(
        `INSERT INTO activeclinic.public_procedures (
           organization_id, healthcare_organization_id, facility_id, procedure_key,
           display_name, summary, category, referral_required, preparation_instructions,
           estimated_duration_minutes, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')`,
        [
          organizationId,
          healthcareOrganizationId,
          facilityId,
          procedure.procedureKey,
          procedure.displayName,
          procedure.summary,
          procedure.category,
          procedure.referralRequired,
          procedure.preparationInstructions,
          procedure.estimatedDurationMinutes,
        ]
      );
      bump(counts, "created");
    }
  }
  return { ok: true };
}

async function ensureClinicians(db, spec, organizationId, healthcareOrganizationId, facilityId, { dryRun, counts }) {
  for (const clinician of spec.clinicians) {
    const existing = await db.query(
      `SELECT id FROM activeclinic.staff_members
        WHERE healthcare_organization_id = $1 AND public_profile_key = $2`,
      [healthcareOrganizationId, clinician.profileKey]
    );
    if (existing.rows[0]) {
      if (dryRun) {
        bump(counts, "unchanged");
        continue;
      }
      await db.query(
        `UPDATE activeclinic.staff_members
            SET first_name = $2,
                last_name = $3,
                display_name = $4,
                public_display_name = $4,
                public_title = $5,
                public_bio = $6,
                public_profile_enabled = true,
                status = 'active',
                updated_at = now()
          WHERE id = $1`,
        [
          existing.rows[0].id,
          clinician.firstName,
          clinician.lastName,
          clinician.displayName,
          clinician.title,
          clinician.bio,
        ]
      );
      bump(counts, "updated");
    } else if (dryRun) {
      bump(counts, "created");
    } else {
      const created = await createStaffMember(db, {
        organizationId,
        healthcareOrganizationId,
        firstName: clinician.firstName,
        lastName: clinician.lastName,
        displayName: clinician.displayName,
        employmentType: "permanent",
        phone: clinician.phone,
        jobTitle: clinician.title,
        status: "active",
      });
      if (!created.ok) {
        return { ok: false, code: created.code, message: created.code };
      }
      await db.query(
        `UPDATE activeclinic.staff_members
            SET public_profile_enabled = true,
                public_profile_key = $2,
                public_display_name = $3,
                public_title = $4,
                public_bio = $5,
                updated_at = now()
          WHERE id = $1`,
        [
          created.staffMember.id,
          clinician.profileKey,
          clinician.displayName,
          clinician.title,
          clinician.bio,
        ]
      );
      const assigned = await assignStaffToFacility(db, {
        organizationId,
        staffMemberId: created.staffMember.id,
        facilityId,
        isPrimaryFacility: false,
      });
      if (!assigned.ok && assigned.code !== "facility_assignment_exists") {
        return { ok: false, code: assigned.code, message: assigned.code };
      }
      bump(counts, "created");
    }
  }
  return { ok: true };
}

async function findIdentityByEmail(db, emailNormalized) {
  const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
    emailNormalized,
  });
  return rows[0] || null;
}

async function findStaffLinkedToIdentity(db, identityId) {
  const r = await db.query(
    `SELECT s.id, s.organization_id, s.display_name, s.status, o.organization_key
       FROM activeclinic.staff_members s
       JOIN platform.organizations o ON o.id = s.organization_id
      WHERE s.platform_identity_id = $1
      LIMIT 5`,
    [identityId]
  );
  return r.rows;
}

/**
 * @returns {{ ok: boolean, code?: string, passwordOutcome?: string, temporaryPassword?: string|null, identity?: object|null }}
 */
async function ensureAdministrator(db, spec, organizationId, healthcareOrganizationId, facilityId, options) {
  const {
    dryRun = false,
    counts,
    resetDemoPassword = false,
    requestedPassword = null,
    allowTemporaryPassword = false,
  } = options;
  if (!spec.admin) {
    return { ok: true, skipped: true };
  }

  const email = String(spec.admin.email).trim().toLowerCase();
  let identity = await findIdentityByEmail(db, email);
  const isJulflona = spec.organizationKey === JULFLONA_CLINIC_KEY;

  if (identity) {
    const linked = await findStaffLinkedToIdentity(db, identity.id);
    const foreign = linked.find((row) => row.organization_id !== organizationId);
    if (foreign) {
      return {
        ok: false,
        code: isJulflona ? RESULT.JULFLONA_ADMIN_EMAIL_CONFLICT : RESULT.DEMO_ADMIN_EMAIL_CONFLICT,
        message: isJulflona ? "JULFLONA_ADMIN_EMAIL_CONFLICT" : "DEMO_ADMIN_EMAIL_CONFLICT",
        conflictOrganizationKey: foreign.organization_key,
      };
    }
  }

  if (dryRun) {
    if (!identity) bump(counts, "created");
    else bump(counts, "unchanged");
    return { ok: true, dryRun: true, identity: identity ? mapIdentity(identity) : null };
  }

  let identityCreated = false;
  if (!identity) {
    const created = await createPlatformIdentity(db, {
      primaryEmail: email,
      emailNormalized: email,
      emailVerifiedAt: new Date().toISOString(),
      status: "active",
      mustChangePassword: true,
    });
    if (!created.ok) {
      return { ok: false, code: created.code, message: created.code };
    }
    identity = created.identity;
    identityCreated = true;
    bump(counts, "created");
  } else {
    bump(counts, "updated");
  }

  let staffList = await listStaffMembersByOrganization(db, { organizationId });
  let adminStaff =
    (staffList.staffMembers || []).find(
      (s) =>
        s.platformIdentityId === identity.id ||
        (s.emailNormalized && s.emailNormalized === email)
    ) || null;

  if (!adminStaff) {
    const createdStaff = await createStaffMember(db, {
      organizationId,
      healthcareOrganizationId,
      firstName: spec.admin.firstName,
      lastName: spec.admin.lastName,
      displayName: spec.admin.displayName,
      email,
      phone: spec.admin.phone,
      jobTitle: spec.admin.jobTitle,
      employmentType: "permanent",
      status: "active",
      platformIdentityId: identity.id,
    });
    if (!createdStaff.ok) {
      if (createdStaff.code === "duplicate_staff_identity") {
        const link = await linkStaffMemberToIdentity(db, {
          id: (await listStaffMembersByOrganization(db, { organizationId })).staffMembers.find(
            (s) => s.emailNormalized === email
          )?.id,
          organizationId,
          platformIdentityId: identity.id,
        });
        if (!link.ok && !createdStaff.ok) {
          return { ok: false, code: createdStaff.code, message: createdStaff.code };
        }
      } else {
        return { ok: false, code: createdStaff.code, message: createdStaff.code };
      }
    } else {
      adminStaff = createdStaff.staffMember;
    }
  } else if (!adminStaff.platformIdentityId) {
    await linkStaffMemberToIdentity(db, {
      id: adminStaff.id,
      organizationId,
      platformIdentityId: identity.id,
    });
  }

  staffList = await listStaffMembersByOrganization(db, { organizationId });
  adminStaff =
    (staffList.staffMembers || []).find((s) => s.platformIdentityId === identity.id) ||
    adminStaff;

  if (!adminStaff) {
    return { ok: false, code: RESULT.INVALID_INPUT, message: "admin_staff_missing" };
  }

  const facilityAssign = await assignStaffToFacility(db, {
    organizationId,
    staffMemberId: adminStaff.id,
    facilityId,
    isPrimaryFacility: true,
  });
  if (!facilityAssign.ok && facilityAssign.code !== "facility_assignment_exists") {
    return { ok: false, code: facilityAssign.code, message: facilityAssign.code };
  }

  const roles = await listStaffRoleAssignments(db, {
    staffMemberId: adminStaff.id,
    organizationId,
  });
  const hasOrganizationAdmin = (roles.assignments || []).some(
    (a) => a.roleKey === ORGANIZATION_ADMIN && a.scopeType === "organisation"
  );
  if (!hasOrganizationAdmin) {
    const assigned = await assignStaffRole(db, {
      organizationId,
      staffMemberId: adminStaff.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    if (!assigned.ok && assigned.code !== "role_assignment_exists") {
      return { ok: false, code: assigned.code, message: assigned.code };
    }
  }

  // Prompt 3: demo/tenant clinic admins use organization_admin; drop legacy facility_admin.
  const legacyFacilityAdmin = (roles.assignments || []).filter(
    (a) => a.roleKey === FACILITY_ADMIN
  );
  for (const assignment of legacyFacilityAdmin) {
    await accessRepo.revokeRoleAssignment(db, {
      id: assignment.id,
      organizationId,
      revokedByPlatformIdentityId: null,
      revocationReason: "seed_org_admin_replaces_facility_admin",
    });
  }

  let passwordOutcome = "unchanged";
  let temporaryPassword = null;
  const identityRow = identity.password_hash !== undefined
    ? identity
    : await identityRepo.findIdentityById(db, identity.id);
  const hasPassword = Boolean(identityRow && identityRow.password_hash);
  const needsPassword = identityCreated || resetDemoPassword || !hasPassword;

  if (needsPassword) {
    let passwordToSet = null;
    if (requestedPassword) {
      const attempt = await setPlatformIdentityPassword(db, {
        identityId: identity.id,
        password: requestedPassword,
        mustChangePassword: true,
      });
      if (attempt.ok) {
        passwordOutcome = "requested_password_set";
        passwordToSet = null;
      } else if (attempt.code === CRED_RESULT.WEAK_PASSWORD) {
        passwordOutcome = RESULT.JULFLONA_PASSWORD_POLICY_BLOCKED;
        if (allowTemporaryPassword || isJulflona) {
          const temp = await setPlatformIdentityPassword(db, {
            identityId: identity.id,
            password: JULFLONA_TEMP_PASSWORD,
            mustChangePassword: true,
          });
          if (!temp.ok) {
            return {
              ok: false,
              code: RESULT.JULFLONA_PASSWORD_POLICY_BLOCKED,
              passwordOutcome,
              message: "JULFLONA_PASSWORD_POLICY_BLOCKED",
            };
          }
          temporaryPassword = JULFLONA_TEMP_PASSWORD;
          passwordOutcome = "temporary_password_set_after_policy_block";
        } else {
          return {
            ok: false,
            code: RESULT.JULFLONA_PASSWORD_POLICY_BLOCKED,
            passwordOutcome,
            message: "JULFLONA_PASSWORD_POLICY_BLOCKED",
          };
        }
      } else {
        return { ok: false, code: attempt.code, message: attempt.code };
      }
    } else if (resetDemoPassword && !isJulflona) {
      // Demo admin: require --reset-demo-password (testing/demo only). Uses explicit
      // options.demoPassword, else same ACTIVECLINIC_DEMO_STAFF_PASSWORD / demo staff default.
      const password = resolveDemoStaffPassword(options.demoPassword);
      const set = await setPlatformIdentityPassword(db, {
        identityId: identity.id,
        password,
        mustChangePassword: true,
      });
      if (!set.ok) {
        return { ok: false, code: set.code, message: set.code };
      }
      passwordOutcome = "demo_password_set";
    } else if (identityCreated && isJulflona && requestedPassword == null) {
      passwordOutcome = "identity_created_without_password";
    }
  }

  const refreshed = await identityRepo.findIdentityById(db, identity.id);
  return {
    ok: true,
    identity: mapIdentity(refreshed),
    staffMemberId: adminStaff.id,
    passwordOutcome,
    temporaryPassword,
    mustChangePassword: refreshed ? refreshed.must_change_password === true : null,
  };
}

/**
 * Idempotent login-capable departmental demo users for activeclinic-demo only.
 */
async function ensureDemoRoleUsers(
  db,
  spec,
  organizationId,
  healthcareOrganizationId,
  facilityId,
  options = {}
) {
  const {
    dryRun = false,
    counts,
    resetDemoRolePasswords = false,
  } = options;

  if (spec.organizationKey !== DEMO_CLINIC_KEY) {
    return { ok: true, skipped: true, users: [] };
  }

  const roleUsers = Array.isArray(spec.roleUsers) ? spec.roleUsers : [];
  if (!roleUsers.length) {
    return { ok: true, skipped: true, users: [] };
  }

  const password = resolveDemoStaffPassword(options.demoRolePassword);

  const users = [];

  for (const user of roleUsers) {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email || !user.roleKey || !user.scopeType) {
      return {
        ok: false,
        code: RESULT.INVALID_INPUT,
        message: `invalid_role_user:${user.key || "unknown"}`,
      };
    }

    let identity = await findIdentityByEmail(db, email);
    const linkedForeign = identity
      ? (await findStaffLinkedToIdentity(db, identity.id)).find(
          (row) => row.organization_id !== organizationId
        )
      : null;
    if (linkedForeign) {
      return {
        ok: false,
        code: RESULT.DEMO_ADMIN_EMAIL_CONFLICT,
        message: "DEMO_ROLE_EMAIL_CONFLICT",
        conflictOrganizationKey: linkedForeign.organization_key,
        email,
      };
    }

    if (dryRun) {
      bump(counts, identity ? "unchanged" : "created");
      users.push({
        key: user.key,
        email,
        dryRun: true,
        wouldCreateIdentity: !identity,
        roleKey: user.roleKey,
        scopeType: user.scopeType,
        reusePublicProfileKey: user.reusePublicProfileKey || null,
      });
      continue;
    }

    let identityCreated = false;
    if (!identity) {
      const created = await createPlatformIdentity(db, {
        primaryEmail: email,
        emailNormalized: email,
        emailVerifiedAt: new Date().toISOString(),
        status: "active",
        mustChangePassword: true,
      });
      if (!created.ok) {
        return {
          ok: false,
          code: created.code,
          message: created.code,
          email,
        };
      }
      identity = created.identity;
      identityCreated = true;
      bump(counts, "created");
    } else {
      bump(counts, "updated");
    }

    let staffMember = null;
    let staffReuse = false;

    if (user.reusePublicProfileKey) {
      const existing = await db.query(
        `SELECT id, platform_identity_id, display_name, status
           FROM activeclinic.staff_members
          WHERE healthcare_organization_id = $1
            AND public_profile_key = $2
          LIMIT 1`,
        [healthcareOrganizationId, user.reusePublicProfileKey]
      );
      if (existing.rows[0]) {
        staffMember = {
          id: existing.rows[0].id,
          platformIdentityId: existing.rows[0].platform_identity_id,
          displayName: existing.rows[0].display_name,
          status: existing.rows[0].status,
        };
        staffReuse = true;
      }
    }

    if (!staffMember) {
      const staffList = await listStaffMembersByOrganization(db, { organizationId });
      staffMember =
        (staffList.staffMembers || []).find(
          (s) =>
            s.platformIdentityId === identity.id ||
            (s.emailNormalized && s.emailNormalized === email)
        ) || null;
    }

    if (!staffMember) {
      const createdStaff = await createStaffMember(db, {
        organizationId,
        healthcareOrganizationId,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        email,
        phone: user.phone,
        jobTitle: user.jobTitle,
        employmentType: "permanent",
        status: "active",
        platformIdentityId: identity.id,
      });
      if (!createdStaff.ok) {
        return {
          ok: false,
          code: createdStaff.code,
          message: createdStaff.code,
          email,
        };
      }
      staffMember = createdStaff.staffMember;
      bump(counts, "created");
    } else {
      if (!staffMember.platformIdentityId) {
        const linked = await linkStaffMemberToIdentity(db, {
          id: staffMember.id,
          organizationId,
          platformIdentityId: identity.id,
        });
        if (!linked.ok) {
          return {
            ok: false,
            code: linked.code,
            message: linked.code,
            email,
          };
        }
      } else if (String(staffMember.platformIdentityId) !== String(identity.id)) {
        return {
          ok: false,
          code: RESULT.DEMO_ADMIN_EMAIL_CONFLICT,
          message: "DEMO_ROLE_STAFF_IDENTITY_CONFLICT",
          email,
        };
      }

      await updateStaffMemberProfile(db, {
        id: staffMember.id,
        organizationId,
        patch: {
          email,
          jobTitle: user.jobTitle,
          displayName: user.displayName,
        },
      });
    }

    const facilityAssign = await assignStaffToFacility(db, {
      organizationId,
      staffMemberId: staffMember.id,
      facilityId,
      isPrimary: false,
    });
    if (
      !facilityAssign.ok &&
      facilityAssign.code !== "facility_assignment_exists"
    ) {
      return {
        ok: false,
        code: facilityAssign.code,
        message: facilityAssign.code,
        email,
      };
    }

    const roles = await listStaffRoleAssignments(db, {
      staffMemberId: staffMember.id,
      organizationId,
    });
    const hasRole = (roles.assignments || []).some(
      (a) =>
        a.roleKey === user.roleKey &&
        a.scopeType === user.scopeType &&
        (user.scopeType === "organisation" ||
          String(a.facilityId) === String(facilityId))
    );
    if (!hasRole) {
      const assigned = await assignStaffRole(db, {
        organizationId,
        staffMemberId: staffMember.id,
        roleKey: user.roleKey,
        scopeType: user.scopeType,
        facilityId: user.scopeType === "facility" ? facilityId : null,
        assignmentOrigin: "system",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      });
      if (!assigned.ok && assigned.code !== "role_assignment_exists") {
        return {
          ok: false,
          code: assigned.code,
          message: assigned.code,
          email,
        };
      }
    }

    const identityRow =
      identity.password_hash !== undefined
        ? identity
        : await identityRepo.findIdentityById(db, identity.id);
    const hasPassword = Boolean(identityRow && identityRow.password_hash);
    let passwordOutcome = "unchanged";
    if (identityCreated || resetDemoRolePasswords || !hasPassword) {
      const set = await setPlatformIdentityPassword(db, {
        identityId: identity.id,
        password,
        mustChangePassword: true,
      });
      if (!set.ok) {
        return {
          ok: false,
          code: set.code,
          message: set.code,
          email,
        };
      }
      passwordOutcome = identityCreated
        ? "demo_role_password_set"
        : "demo_role_password_reset";
    }

    users.push({
      key: user.key,
      email,
      displayName: user.displayName,
      staffMemberId: staffMember.id,
      staffReuse,
      roleKey: user.roleKey,
      scopeType: user.scopeType,
      facilityId,
      passwordOutcome,
      credentialProvisioned: passwordOutcome !== "unchanged" || hasPassword,
    });
  }

  return { ok: true, users };
}

async function seedOneClinic(db, clinicKey, options = {}) {
  const dryRun = options.dryRun === true;
  const counts = { created: 0, updated: 0, unchanged: 0 };
  const spec = CLINIC_SPECS[clinicKey];
  if (!spec) {
    return { ok: false, code: RESULT.INVALID_INPUT, message: `Unknown clinic key: ${clinicKey}` };
  }

  const org = await ensureOrganization(db, spec, { dryRun, counts });
  if (!org.ok) return { ...org, clinicKey, counts };

  if (dryRun && !org.organizationId) {
    return {
      ok: true,
      clinicKey,
      dryRun: true,
      counts,
      summary: { wouldCreate: true, organizationKey: clinicKey },
    };
  }

  const hco = await ensureHealthcareOrganization(db, spec, org.organizationId, { dryRun, counts });
  if (!hco.ok) return { ...hco, clinicKey, counts };

  if (dryRun && !hco.hco) {
    return { ok: true, clinicKey, dryRun: true, counts, summary: { wouldCreate: true } };
  }

  const facility = await ensureFacility(
    db,
    spec,
    org.organizationId,
    hco.hco.id,
    { dryRun, counts }
  );
  if (!facility.ok) return { ...facility, clinicKey, counts };

  if (!dryRun || (hco.hco && facility.facility)) {
    const orgId = org.organizationId;
    const hcoId = hco.hco.id;
    const facilityId = facility.facility && (facility.facility.id || facility.facility);
    await ensureServices(db, spec, orgId, hcoId, { dryRun, counts });
    await ensureProcedures(db, spec, orgId, hcoId, facilityId, { dryRun, counts });
    await ensureClinicians(db, spec, orgId, hcoId, facilityId, { dryRun, counts });
    if (!dryRun && facilityId) {
      const deptSeed = await ensureDefaultDepartments(db, {
        organizationId: orgId,
        healthcareOrganizationId: hcoId,
        facilityId,
      });
      if (deptSeed.ok) {
        counts.created += deptSeed.created || 0;
        counts.updated += deptSeed.updated || 0;
        counts.unchanged += deptSeed.unchanged || 0;
      }
    }
  }

  let adminResult = { ok: true, skipped: !spec.admin };
  if (spec.admin && facility.facility) {
    adminResult = await ensureAdministrator(
      db,
      spec,
      org.organizationId,
      hco.hco.id,
      facility.facility.id,
      {
        dryRun,
        counts,
        resetDemoPassword: options.resetDemoPassword === true,
        requestedPassword: options.requestedPassword || null,
        allowTemporaryPassword: options.allowTemporaryPassword === true,
        demoPassword: options.demoPassword || null,
      }
    );
    if (!adminResult.ok) {
      return { ...adminResult, clinicKey, counts };
    }
  }

  let roleUsersResult = { ok: true, skipped: true, users: [] };
  if (facility.facility) {
    roleUsersResult = await ensureDemoRoleUsers(
      db,
      spec,
      org.organizationId,
      hco.hco.id,
      facility.facility.id,
      {
        dryRun,
        counts,
        resetDemoRolePasswords: options.resetDemoRolePasswords === true,
        demoRolePassword: options.demoRolePassword || null,
      }
    );
    if (!roleUsersResult.ok) {
      return { ...roleUsersResult, clinicKey, counts };
    }
  }

  return {
    ok: true,
    clinicKey,
    dryRun,
    counts,
    organizationKey: clinicKey,
    organizationId: org.organizationId,
    healthcareOrganizationId: hco.hco && hco.hco.id,
    facilityId: facility.facility && facility.facility.id,
    publicClinicUrl: `/clinics/${clinicKey}`,
    demoBanner: DEMO_BANNER,
    admin: adminResult.skipped
      ? null
      : {
          email: spec.admin.email,
          displayName: spec.admin.displayName,
          passwordOutcome: adminResult.passwordOutcome,
          mustChangePassword: adminResult.mustChangePassword,
          // temporaryPassword only returned to CLI for one-time handoff — never log elsewhere
          temporaryPassword: adminResult.temporaryPassword || null,
          role: ORGANIZATION_ADMIN,
        },
    roleUsers: roleUsersResult.users || [],
  };
}

/**
 * Seed one or more demo clinics.
 * @param {{ query: Function }} db
 * @param {{
 *   clinicKeys?: string[],
 *   dryRun?: boolean,
 *   resetDemoPassword?: boolean,
 *   julflonaRequestedPassword?: string|null,
 *   requireIdentityKey?: string|null,
 * }} [options]
 */
async function seedActiveClinicDemoClinics(db, options = {}) {
  const envGate = await assertSafeSeedEnvironment(db, {
    requireIdentityKey: options.requireIdentityKey || null,
  });
  if (!envGate.ok) {
    return envGate;
  }

  const dryRun = options.dryRun === true;
  const clinicKeys = (options.clinicKeys && options.clinicKeys.length
    ? options.clinicKeys
    : [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY]
  ).map((k) => String(k).trim().toLowerCase());

  const catalogue = await ensureActiveClinicCatalogue(db, { dryRun });
  const clinics = [];
  const totals = { created: 0, updated: 0, unchanged: 0 };
  let temporaryPasswordHandoff = null;
  let passwordPolicyBlocked = false;

  for (const key of clinicKeys) {
    const result = await seedOneClinic(db, key, {
      dryRun,
      resetDemoPassword: options.resetDemoPassword === true,
      requestedPassword:
        key === JULFLONA_CLINIC_KEY ? options.julflonaRequestedPassword || null : null,
      allowTemporaryPassword: key === JULFLONA_CLINIC_KEY,
      demoPassword: options.demoPassword || null,
      resetDemoRolePasswords:
        options.resetDemoRolePasswords === true || options.resetDemoPassword === true,
      demoRolePassword: options.demoRolePassword || options.demoPassword || null,
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        identity: envGate.identity,
        catalogue,
        clinics,
        failedClinic: key,
      };
    }
    if (result.admin && result.admin.temporaryPassword) {
      temporaryPasswordHandoff = result.admin.temporaryPassword;
      passwordPolicyBlocked = true;
      // Strip from nested report before generic JSON logging by callers
      result.admin = { ...result.admin, temporaryPassword: undefined, temporaryPasswordIssued: true };
    }
    if (
      result.admin &&
      (result.admin.passwordOutcome === RESULT.JULFLONA_PASSWORD_POLICY_BLOCKED ||
        result.admin.passwordOutcome === "temporary_password_set_after_policy_block")
    ) {
      passwordPolicyBlocked = true;
    }
    clinics.push(result);
    totals.created += result.counts.created || 0;
    totals.updated += result.counts.updated || 0;
    totals.unchanged += result.counts.unchanged || 0;
  }

  return {
    ok: true,
    code: passwordPolicyBlocked ? RESULT.JULFLONA_PASSWORD_POLICY_BLOCKED : RESULT.OK,
    identity: {
      identityKey: envGate.identity.identity_key,
      environmentCode: envGate.identity.environment_code,
      hostFingerprint: envGate.identity.host_fingerprint,
    },
    dryRun,
    catalogue,
    clinics,
    totals,
    temporaryPasswordHandoff,
    passwordPolicyBlocked,
  };
}

async function auditDemoClinics(db) {
  const keys = [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY];
  const rows = [];
  for (const key of keys) {
    const org = await findOrganizationByKey(db, key);
    if (!org) {
      rows.push({ organizationKey: key, found: false });
      continue;
    }
    const enrolment = await findActiveClinicEnrolment(db, org.id);
    const hcoRaw = await db.query(
      `SELECT id, public_name, status, website_published, public_booking_enabled
         FROM activeclinic.healthcare_organizations WHERE organization_id = $1 LIMIT 1`,
      [org.id]
    );
    const hcoRow = hcoRaw.rows[0] || null;
    const facilities = hcoRow
      ? (
          await db.query(
            `SELECT facility_key, display_name, status, show_in_directory, website_published, is_primary
               FROM activeclinic.facilities WHERE healthcare_organization_id = $1`,
            [hcoRow.id]
          )
        ).rows
      : [];
    const services = hcoRow
      ? (
          await db.query(
            `SELECT COUNT(*)::int AS n FROM activeclinic.appointment_service_types
              WHERE healthcare_organization_id = $1 AND public_bookable = true AND status = 'active'`,
            [hcoRow.id]
          )
        ).rows[0].n
      : 0;
    const doctors = hcoRow
      ? (
          await db.query(
            `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members
              WHERE healthcare_organization_id = $1 AND public_profile_enabled = true`,
            [hcoRow.id]
          )
        ).rows[0].n
      : 0;
    const adminSpec = CLINIC_SPECS[key] && CLINIC_SPECS[key].admin;
    let admin = null;
    if (adminSpec) {
      const identity = await findIdentityByEmail(db, adminSpec.email.toLowerCase());
      if (identity) {
        const linked = await findStaffLinkedToIdentity(db, identity.id);
        admin = {
          displayName: adminSpec.displayName,
          email: adminSpec.email,
          identityStatus: identity.status,
          mustChangePassword: identity.must_change_password === true,
          lastSuccessfulLoginAt: identity.last_sign_in_at || null,
          linkedStaff: linked.map((s) => ({
            organizationKey: s.organization_key,
            status: s.status,
          })),
        };
      }
    }
    rows.push({
      found: true,
      organizationKey: org.organization_key,
      platformOrganizationName: org.display_name,
      organizationStatus: org.status,
      dataEnvironment: org.data_environment,
      productStatus: enrolment ? enrolment.status : null,
      healthcareOrganizationName: hcoRow ? hcoRow.public_name : null,
      healthcareOrganizationStatus: hcoRow ? hcoRow.status : null,
      websitePublished: hcoRow ? hcoRow.website_published === true : false,
      publicBookingEnabled: hcoRow ? hcoRow.public_booking_enabled === true : false,
      facilities,
      servicesCount: services,
      doctorsCount: doctors,
      publicClinicUrl: `/clinics/${key}`,
      admin,
    });
  }
  return { ok: true, clinics: rows };
}

module.exports = {
  RESULT,
  JULFLONA_TEMP_PASSWORD,
  DEMO_ROLE_STAFF_PASSWORD,
  assertSafeSeedEnvironment,
  ensureActiveClinicCatalogue,
  seedActiveClinicDemoClinics,
  seedOneClinic,
  ensureDemoRoleUsers,
  auditDemoClinics,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
};
