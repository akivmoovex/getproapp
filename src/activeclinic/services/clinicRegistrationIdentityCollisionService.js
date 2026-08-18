"use strict";

/**
 * ActiveClinic public-registration identity collision (product policy).
 * Platform multi-org is allowed; this helper only describes whether approval
 * would attach an existing identity to another clinic. Not a platform guard.
 */

function emptyCollision() {
  return {
    existingIdentity: false,
    existingActiveClinicIdentity: false,
    identityId: null,
    identityStatus: null,
    matchOn: null,
    existingOrganizations: [],
    requiresSecondClinicAcknowledgement: false,
  };
}

function matchOnFor(row, email, phone) {
  const emailHit = Boolean(email && row.email_normalized === email);
  const phoneHit = Boolean(phone && row.phone_normalized === phone);
  if (emailHit && phoneHit) return "email_and_phone";
  if (emailHit) return "email";
  if (phoneHit) return "phone";
  return "contact";
}

/**
 * @param {{ query: Function }} db
 * @param {{ contact_email_normalized?: string, contact_phone_normalized?: string, organization_id?: string|null }} application
 */
async function resolveClinicRegistrationIdentityCollision(db, application) {
  if (!application) return emptyCollision();
  const email = String(application.contact_email_normalized || "").trim().toLowerCase() || null;
  const phone = String(application.contact_phone_normalized || "").trim() || null;
  if (!email && !phone) return emptyCollision();

  const existing = await db.query(
    `SELECT id, status, email_normalized, phone_normalized
       FROM platform.identities
      WHERE ($1::text IS NOT NULL AND email_normalized = $1)
         OR ($2::text IS NOT NULL AND phone_normalized = $2)
      ORDER BY CASE WHEN $1::text IS NOT NULL AND email_normalized = $1 THEN 0 ELSE 1 END
      LIMIT 1`,
    [email, phone]
  );
  const identity = existing.rows[0];
  if (!identity) return emptyCollision();

  const memberships = await db.query(
    `SELECT sm.id AS staff_member_id,
            sm.status AS staff_status,
            sm.organization_id,
            o.organization_key,
            o.display_name
       FROM activeclinic.staff_members sm
       JOIN platform.organizations o ON o.id = sm.organization_id
      WHERE sm.platform_identity_id = $1
        AND sm.status <> 'archived'
      ORDER BY o.display_name ASC`,
    [identity.id]
  );

  const applicationOrgId = application.organization_id
    ? String(application.organization_id)
    : null;
  const existingOrganizations = memberships.rows.map((row) => ({
    staffMemberId: row.staff_member_id,
    staffStatus: row.staff_status,
    organizationId: row.organization_id,
    organizationKey: row.organization_key,
    displayName: row.display_name,
    isCurrentApplicationOrg: Boolean(
      applicationOrgId && String(row.organization_id) === applicationOrgId
    ),
  }));
  const otherClinics = existingOrganizations.filter((row) => !row.isCurrentApplicationOrg);
  const existingActiveClinicIdentity = otherClinics.length > 0;
  const alreadyAttached = Boolean(application.clinic_admin_staff_id);
  const pending = ["pending_review", "review_required"].includes(
    String(application.status || "pending_review")
  );

  return {
    existingIdentity: true,
    existingActiveClinicIdentity,
    identityId: identity.id,
    identityStatus: identity.status,
    matchOn: matchOnFor(identity, email, phone),
    existingOrganizations: otherClinics,
    requiresSecondClinicAcknowledgement:
      existingActiveClinicIdentity && pending && !alreadyAttached,
  };
}

module.exports = {
  resolveClinicRegistrationIdentityCollision,
};
