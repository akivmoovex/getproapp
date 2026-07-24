"use strict";

/**
 * Central product policy for BlessBoard V5 announcement admin writes.
 *
 * Platform Admin publish/write elevation is allowed only when:
 * - DEPLOYMENT_ENV=testing, or
 * - explicit BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH=1 (existing opt-in)
 *
 * Never driven by NODE_ENV alone, query params, cookies, or form fields.
 */

const DEFAULT_PRODUCT_POLICY = Object.freeze({
  allowPlatformAdminPublish: false,
  isTestingDeployment: false,
  showTestingPlatformAdminPublishBanner: false,
});

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   allowPlatformAdminPublish: boolean,
 *   isTestingDeployment: boolean,
 *   showTestingPlatformAdminPublishBanner: boolean,
 * }}
 */
function resolveAnnouncementProductPolicy(env) {
  const source = env && typeof env === "object" ? env : process.env;
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  const isTestingDeployment = deploymentEnv === "testing";
  const explicitOptIn =
    String(source.BLESSBOARD_ALLOW_PLATFORM_ADMIN_ANNOUNCEMENT_PUBLISH || "").trim() === "1";
  const allowPlatformAdminPublish = isTestingDeployment || explicitOptIn;
  return Object.freeze({
    allowPlatformAdminPublish,
    isTestingDeployment,
    showTestingPlatformAdminPublishBanner: Boolean(
      isTestingDeployment && allowPlatformAdminPublish
    ),
  });
}

module.exports = {
  DEFAULT_PRODUCT_POLICY,
  resolveAnnouncementProductPolicy,
};
