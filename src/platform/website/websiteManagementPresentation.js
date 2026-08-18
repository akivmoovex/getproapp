"use strict";

const { PERMISSIONS, hasWebsitePermission } = require("./permissions");
const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const versionService = require("./versionService");
const { POLICY_LABELS } = require("./publishPolicy");
const { LIFECYCLE_LABELS } = require("./lifecycleStatus");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicOrganizationWebsiteUrl,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsitePublishPath,
} = require("./publicWebsiteUrl");

function grantedList(grantedPermissions) {
  return Array.isArray(grantedPermissions) ? grantedPermissions.map(String) : [];
}

function websiteStateLabel(input) {
  if (!input.exists) return "Not provisioned";
  if (input.publishedVersionNumber) {
    return input.unpublishedChanges
      ? `Published (version ${input.publishedVersionNumber}) · unpublished changes`
      : `Published (version ${input.publishedVersionNumber})`;
  }
  if (input.availabilityPublished) return "Public · draft not versioned yet";
  return "Draft";
}

async function loadWebsiteManagementSummary(db, input) {
  const productCode = String((input && (input.productCode || input.product)) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "").trim();
  const granted = grantedList(input && input.grantedPermissions);
  const canView =
    hasWebsitePermission(granted, PERMISSIONS.VIEW) ||
    hasWebsitePermission(granted, PERMISSIONS.EDIT);
  const canEdit = hasWebsitePermission(granted, PERMISSIONS.EDIT);
  const canPublish = hasWebsitePermission(granted, PERMISSIONS.PUBLISH);
  const canRestore =
    hasWebsitePermission(granted, PERMISSIONS.ROLLBACK) ||
    hasWebsitePermission(granted, PERMISSIONS.RESTORE);

  if (!canView) {
    return { ok: false, code: "forbidden", summary: null };
  }
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input", summary: null };
  }

  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode,
  });
  const key = organizationKey || (instance && instance.slug) || "";
  const publicPath = buildPublicOrganizationWebsitePath({
    product: productCode,
    organizationKey: key,
  });
  const publicUrl = buildPublicOrganizationWebsiteUrl({
    product: productCode,
    organizationKey: key,
    origin: input.origin || "",
    env: input.env,
  });

  let unpublishedChanges = false;
  let unpublishedCount = 0;
  let publishedVersionNumber = null;
  let availabilityPublished = false;

  if (instance) {
    const rows = await contentService.listWebsiteContent(db, instance, organizationId);
    const changed = rows.filter(
      (row) => !contentService.valuesEqual(row.draftValue, row.publishedValue)
    );
    unpublishedCount = changed.length;
    unpublishedChanges = unpublishedCount > 0;
    const listed = await versionService.listWebsiteVersions(db, {
      instanceId: instance.id,
      organizationId,
    });
    const live = (listed.versions || []).find((version) => version.status === "published");
    publishedVersionNumber = live ? live.versionNumber : null;
  }

  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    try {
      const hco = await db.query(
        `SELECT website_published FROM activeclinic.healthcare_organizations
          WHERE organization_id = $1 LIMIT 1`,
        [organizationId]
      );
      availabilityPublished = Boolean(hco.rows[0] && hco.rows[0].website_published === true);
    } catch (err) {
      const message = err && err.message ? String(err.message) : "";
      if (!/website_published/i.test(message) && err && err.code !== "42703") throw err;
    }
  }

  const exists = Boolean(instance);
  const statusLabel = websiteStateLabel({
    exists,
    unpublishedChanges,
    publishedVersionNumber,
    availabilityPublished,
  });

  return {
    ok: true,
    code: "ok",
    summary: {
      productCode,
      organizationId,
      organizationKey: key,
      exists,
      instanceId: instance ? instance.id : null,
      slug: instance ? instance.slug : key,
      lifecycleStatus: instance ? instance.lifecycleStatus : null,
      lifecycleLabel: instance ? LIFECYCLE_LABELS[instance.lifecycleStatus] || "" : "",
      publishPolicy: instance ? instance.publishPolicy : null,
      publishPolicyLabel: instance ? POLICY_LABELS[instance.publishPolicy] || "" : "",
      statusLabel,
      draftState: unpublishedChanges ? "unpublished_changes" : exists ? "current" : "missing",
      unpublishedChanges,
      unpublishedCount,
      publishedVersionNumber,
      availabilityPublished,
      publicPath,
      publicUrl,
      canView,
      canEdit,
      canPublish,
      canRestore,
      actions: {
        viewLive: publicPath,
        editWebsite: canEdit ? buildPublicWebsiteEditPath({ product: productCode, organizationKey: key }) : null,
      preview: canEdit
        ? buildPublicWebsitePreviewPath({ product: productCode, organizationKey: key })
        : null,
      history:
        canView || canEdit || canPublish
          ? buildPublicWebsiteHistoryPath({ product: productCode, organizationKey: key })
          : null,
        publishPath: canPublish
          ? buildPublicWebsitePublishPath({ product: productCode, organizationKey: key })
          : null,
      },
    },
  };
}

module.exports = {
  loadWebsiteManagementSummary,
};
