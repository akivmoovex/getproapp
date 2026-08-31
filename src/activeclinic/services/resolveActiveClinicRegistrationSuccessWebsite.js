"use strict";

/**
 * Resolve provisioned clinic website facts for the registration success screen.
 * Never trust client-supplied organization keys — only DB-backed references.
 */

const {
  sanitizePublicRegistrationReference,
} = require("../../platform/registration/registrationSuccessPresentation");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteSettingsPath,
} = require("../../platform/website/publicWebsiteUrl");

/**
 * @param {import('pg').Pool | { query: Function }} db
 * @param {{
 *   reference?: string|null,
 *   ready?: boolean,
 *   publicOrigin?: string|null,
 * }} input
 */
async function resolveActiveClinicRegistrationSuccessWebsite(db, input) {
  const ready = Boolean(input && input.ready);
  if (!ready) {
    return {
      showWebsite: false,
      organizationKey: null,
      publicPath: null,
      publicUrl: null,
      editPath: null,
      statusLabel: null,
    };
  }

  const reference = sanitizePublicRegistrationReference(
    (input && input.reference) || "",
    "AC"
  );
  if (!reference) {
    return {
      showWebsite: false,
      organizationKey: null,
      publicPath: null,
      publicUrl: null,
      editPath: null,
      statusLabel: null,
    };
  }

  const r = await db.query(
    `SELECT a.organization_id,
            o.organization_key,
            COALESCE(h.website_published, false) AS website_published
       FROM activeclinic.clinic_registration_applications a
       INNER JOIN platform.organizations o ON o.id = a.organization_id
       LEFT JOIN activeclinic.healthcare_organizations h ON h.organization_id = a.organization_id
      WHERE a.application_number = $1
        AND a.organization_id IS NOT NULL
        AND a.status = 'active'
      LIMIT 1`,
    [reference]
  );
  const row = r.rows[0];
  if (!row || !row.organization_key) {
    return {
      showWebsite: false,
      organizationKey: null,
      publicPath: null,
      publicUrl: null,
      editPath: null,
      statusLabel: null,
    };
  }

  const organizationKey = String(row.organization_key);
  const publicPath = buildPublicOrganizationWebsitePath({
    product: PRODUCT_CODE.ACTIVECLINIC,
    organizationKey,
  });
  const hubPath =
    buildPublicWebsiteSettingsPath({
      product: PRODUCT_CODE.ACTIVECLINIC,
    }) || "/app/settings/website";
  const origin = String((input && input.publicOrigin) || "").replace(/\/$/, "");
  const publicUrl = origin && publicPath ? `${origin}${publicPath}` : publicPath;

  return {
    showWebsite: true,
    organizationKey,
    publicPath,
    publicUrl,
    editPath: hubPath,
    statusLabel: "Draft — not published yet",
    websitePublished: Boolean(row.website_published),
  };
}

module.exports = {
  resolveActiveClinicRegistrationSuccessWebsite,
};
