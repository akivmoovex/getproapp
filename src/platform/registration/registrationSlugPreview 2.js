"use strict";

/**
 * Shared BlessBoard registration website URL preview (server + browser mirror).
 */

const { resolveBaseOrganizationKey } = require("../../blessboard/services/organizationKey");
const { resolveBaseBranchKey } = require("../../blessboard/services/branchKey");
const { publicBranchHomePath } = require("../../blessboard/urls/churchUrlHelper");
const {
  PRODUCT_CODE,
  publicOriginForProduct,
} = require("../website/publicWebsiteUrl");

/**
 * @param {{ churchName?: unknown, branchName?: unknown, origin?: string|null, env?: NodeJS.ProcessEnv }} input
 */
function buildBlessBoardRegistrationWebsitePreview(input) {
  const churchName = String((input && input.churchName) || "").trim();
  const branchName = String((input && input.branchName) || "").trim();
  const env = (input && input.env) || process.env;
  const origin =
    String((input && input.origin) || "").replace(/\/$/, "") ||
    publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, env) ||
    "https://blessboard.com";

  const org = resolveBaseOrganizationKey(churchName);
  const branch = resolveBaseBranchKey(branchName);
  const organizationKey = org.ok ? org.key : null;
  const branchKey = branch.ok ? branch.key : null;
  const publicPath =
    organizationKey && branchKey ? publicBranchHomePath(organizationKey, branchKey) : null;
  const publicUrl = publicPath ? `${origin}${publicPath}` : null;

  return {
    organizationKey,
    branchKey,
    publicPath,
    publicUrl,
    publicUrlDisplay: publicUrl || `${origin}/c/your-church/your-branch`,
  };
}

module.exports = {
  buildBlessBoardRegistrationWebsitePreview,
  resolveBaseOrganizationKey,
  resolveBaseBranchKey,
};
