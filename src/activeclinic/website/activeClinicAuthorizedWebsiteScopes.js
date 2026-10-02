"use strict";

/**
 * ActiveClinic authorized website scopes for the shared selector (E1).
 * One clinic-organization public website only — facilities are NOT websites.
 */

const {
  PRODUCT_CODE,
  buildPublicWebsiteEditPath,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");
const { getPendingChangeSummary } = require("../../platform/website/websiteChangeManagerService");
const { presentActiveClinicInheritance } = require("../../platform/website/websiteInheritancePresentation");

/**
 * @param {{
 *   db: object,
 *   organizationId: string,
 *   organizationKey: string,
 *   displayName?: string,
 *   instance?: object|null,
 *   publicationStatus?: string,
 *   canEdit?: boolean,
 * }} input
 */
async function listActiveClinicAuthorizedWebsiteScopes(input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "").trim();
  if (!organizationId || !organizationKey) {
    return {
      ok: false,
      code: "invalid_input",
      websites: [],
      hierarchySupported: false,
      hierarchyNote: presentActiveClinicInheritance().detail,
    };
  }

  let pending = 0;
  const instance = input && input.instance;
  if (input.db && instance && instance.id) {
    try {
      const summary = await getPendingChangeSummary(input.db, {
        organizationId,
        instanceId: instance.id,
        grantedPermissions: ["website.view", "website.edit"],
      });
      pending = summary.ok ? Number(summary.pendingChangeCount) || 0 : 0;
    } catch {
      pending = 0;
    }
  }

  const name =
    String((input && input.displayName) || "").trim() || organizationKey;

  return {
    ok: true,
    websites: [
      {
        id: "clinic",
        name,
        scopeKind: "clinic",
        scopeLabel: "Clinic",
        publicationStatus:
          (input && input.publicationStatus) ||
          (instance && instance.status) ||
          "published",
        pendingChangeCount: pending,
        editHref: buildPublicWebsiteEditPath({
          product: PRODUCT_CODE.ACTIVECLINIC,
          organizationKey,
        }),
        liveHref: buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.ACTIVECLINIC,
          organizationKey,
        }),
        settingsHref: "/app/settings/website",
        canEdit: input.canEdit !== false,
        isCurrent: true,
        inheritNote: null,
      },
    ],
    hierarchySupported: false,
    hierarchyNote:
      "ActiveClinic exposes one public website per clinic organization. Operational facilities are not separate public websites.",
    multiSite: false,
  };
}

module.exports = {
  listActiveClinicAuthorizedWebsiteScopes,
};
