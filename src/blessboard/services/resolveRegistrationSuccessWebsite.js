"use strict";

/**
 * Resolve provisioned church website facts for the registration success screen.
 * Never trust client-supplied organization keys — only DB-backed references.
 */

const appRepo = require("../repositories/platformChurchRegistrationRepository");
const {
  sanitizePublicRegistrationReference,
} = require("../../platform/registration/registrationSuccessPresentation");
const {
  PRODUCT_CODE,
  buildPublicWebsiteEditPath,
} = require("../../platform/website/publicWebsiteUrl");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");

/**
 * @param {import('pg').Pool | { query: Function }} db
 * @param {{
 *   reference?: string|null,
 *   ready?: boolean,
 *   sessionOrganizationId?: string|null,
 *   publicOrigin?: string|null,
 * }} input
 */
async function resolveBlessBoardRegistrationSuccessWebsite(db, input) {
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
    "BB"
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

  const resolved = await appRepo.findProvisionedOrganizationByPublicReference(db, reference);
  if (!resolved || !resolved.organizationKey) {
    return {
      showWebsite: false,
      organizationKey: null,
      publicPath: null,
      publicUrl: null,
      editPath: null,
      statusLabel: null,
    };
  }

  const sessionOrgId =
    input && input.sessionOrganizationId != null
      ? String(input.sessionOrganizationId).trim()
      : "";
  if (sessionOrgId && String(resolved.organizationId) !== sessionOrgId) {
    return {
      showWebsite: false,
      organizationKey: null,
      publicPath: null,
      publicUrl: null,
      editPath: null,
      statusLabel: null,
    };
  }

  const organizationKey = String(resolved.organizationKey);
  const publicPath = publicChurchHomePath(organizationKey);
  const editPath =
    buildPublicWebsiteEditPath({
      product: PRODUCT_CODE.BLESSBOARD,
      organizationKey,
    }) || null;
  const origin = String((input && input.publicOrigin) || "").replace(/\/$/, "");
  const publicUrl = origin && publicPath ? `${origin}${publicPath}` : publicPath;

  return {
    showWebsite: true,
    organizationKey,
    publicPath,
    publicUrl,
    editPath,
    statusLabel: "Draft — not published yet",
    websitePublished: Boolean(resolved.websitePublished),
  };
}

module.exports = {
  resolveBlessBoardRegistrationSuccessWebsite,
};
