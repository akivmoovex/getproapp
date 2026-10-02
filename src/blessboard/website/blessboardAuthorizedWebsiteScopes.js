"use strict";

/**
 * BlessBoard authorized website scopes for the shared selector (E1).
 * Uses existing resolveWebsiteMode + resolveWebsiteScope — no fictitious sites.
 */

const { PRODUCT_CODE, buildPublicWebsiteEditPath, buildPublicOrganizationWebsitePath } = require("../../platform/website/publicWebsiteUrl");
const { resolveWebsiteMode, WEBSITE_MODE } = require("../services/resolveWebsiteMode");
const { resolveWebsiteScope } = require("../services/resolveWebsiteScope");
const { getPendingChangeSummary } = require("../../platform/website/websiteChangeManagerService");
const { hqWebsiteBranchBasePath } = require("../urls/churchUrlHelper");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");

async function pendingForInstance(db, organizationId, instance) {
  if (!organizationId || !instance || !instance.id) return 0;
  try {
    const summary = await getPendingChangeSummary(db, {
      organizationId,
      instanceId: instance.id,
      grantedPermissions: ["website.view", "website.edit"],
    });
    return summary.ok ? Number(summary.pendingChangeCount) || 0 : 0;
  } catch {
    return 0;
  }
}

async function resolveInstance(db, organizationId, branchId) {
  try {
    const {
      resolveEngineInstance,
    } = require("./blessboardEngineContentService");
    const found = await resolveEngineInstance(db, {
      organizationId,
      branchId: branchId || null,
      createIfMissing: false,
    });
    return found && found.ok ? found.instance : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   db: object,
 *   tenant: object,
 *   organizationKey: string,
 *   authenticatedUser: object|string,
 *   currentBranchKey?: string|null,
 * }} input
 */
async function listBlessBoardAuthorizedWebsiteScopes(input) {
  const db = input && input.db;
  const tenant = input && input.tenant;
  const organizationKey = String((input && input.organizationKey) || "").trim();
  const church = tenant && tenant.church;
  const organization = tenant && tenant.organization;
  const organizationId = organization && organization.id;
  const churchId = church && church.id;
  if (!db || !tenant || !organizationId || !churchId || !organizationKey) {
    return {
      ok: false,
      code: "invalid_input",
      websites: [],
      hierarchySupported: true,
      hierarchyNote: null,
    };
  }

  const churchName =
    String((church && (church.displayName || church.name)) || "").trim() ||
    organizationKey;

  const modeResult = await resolveWebsiteMode(db, { churchId });
  const multi =
    modeResult &&
    modeResult.ok &&
    modeResult.websiteMode === WEBSITE_MODE.MULTI_SITE;
  const activeBranches = (modeResult && modeResult.activeBranches) || [];

  /** @type {object[]} */
  const websites = [];

  const hqScope = await resolveWebsiteScope(db, {
    tenant,
    authenticatedUser: input.authenticatedUser,
    requestedBranchKey: null,
  });

  let sharedPending = 0;
  const hqInstance = await resolveInstance(db, organizationId, null);
  if (hqInstance) {
    sharedPending = await pendingForInstance(db, organizationId, hqInstance);
  }

  if (hqScope && hqScope.ok) {
    websites.push({
      id: "hq",
      name: `${churchName} — Headquarters`,
      scopeKind: "hq",
      scopeLabel: "Headquarters",
      publicationStatus: (hqInstance && hqInstance.status) || "published",
      pendingChangeCount: sharedPending,
      editHref: buildPublicWebsiteEditPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey,
      }),
      liveHref: buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey,
      }),
      settingsHref: "/hq/website",
      canEdit: true,
      isCurrent: !input.currentBranchKey,
      inheritNote: multi
        ? "HQ publish updates content that branches inherit live from Headquarters."
        : null,
    });
  }

  if (multi) {
    for (const branch of activeBranches) {
      const branchKey = normalizeBranchKey(branch && branch.key);
      if (!branchKey) continue;
      const branchScope = await resolveWebsiteScope(db, {
        tenant,
        authenticatedUser: input.authenticatedUser,
        requestedBranchKey: branchKey,
      });
      if (!branchScope || !branchScope.ok) continue;
      const branchId = branchScope.branchId || null;
      const branchInstance = await resolveInstance(db, organizationId, branchId);
      const pending = branchInstance
        ? await pendingForInstance(db, organizationId, branchInstance)
        : sharedPending;
      const displayName =
        String((branch && branch.displayName) || "").trim() || branchKey;
      websites.push({
        id: `branch:${branchKey}`,
        name: displayName,
        scopeKind: "branch",
        scopeLabel: "Branch",
        publicationStatus: (branchInstance && branchInstance.status) || "published",
        pendingChangeCount: pending,
        editHref: buildPublicWebsiteEditPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey,
          scope: { kind: "branch", branchKey },
        }),
        liveHref: buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey,
          scope: { kind: "branch", branchKey },
        }),
        settingsHref: hqWebsiteBranchBasePath(branchKey)
          ? `${hqWebsiteBranchBasePath(branchKey)}/settings`
          : `/hq/website/branches/${encodeURIComponent(branchKey)}/settings`,
        canEdit: true,
        isCurrent: String(input.currentBranchKey || "") === branchKey,
        inheritNote:
          "Identity, contact, and SEO settings can inherit From Headquarters until overridden.",
      });
    }
  }

  // Branch-only editors with no HQ card still need their site.
  if (!websites.length) {
    return {
      ok: false,
      code: "forbidden",
      websites: [],
      hierarchySupported: true,
      hierarchyNote: multi
        ? "Multi-site church — authorized websites only."
        : "Single church website.",
    };
  }

  return {
    ok: true,
    websites,
    hierarchySupported: true,
    hierarchyNote: multi
      ? "Headquarters plus authorized branch mini-websites."
      : "Single church website (multi-site inactive).",
    multiSite: multi,
  };
}

module.exports = {
  listBlessBoardAuthorizedWebsiteScopes,
};
