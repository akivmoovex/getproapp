"use strict";

/**
 * Presentation metadata for BlessBoard platform brand chrome.
 * Derived only from the authoritative deployment profile — never hostname or NODE_ENV alone.
 */

const { resolveDeploymentConfiguration } = require("./deploymentProfiles");

/**
 * @typedef {Readonly<{
 *   authoritative: boolean,
 *   brandSubtitle: string|null,
 *   brandSubtitleVariant: "production-partner"|"demo"|null,
 * }>} DeploymentBrand
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {DeploymentBrand}
 */
function resolveDeploymentBrand(env) {
  const config = resolveDeploymentConfiguration(env);
  if (!config.authoritative) {
    return Object.freeze({
      authoritative: false,
      brandSubtitle: null,
      brandSubtitleVariant: null,
    });
  }
  const subtitle =
    config.brandSubtitle != null && String(config.brandSubtitle).trim()
      ? String(config.brandSubtitle).trim()
      : null;
  const variant =
    config.brandSubtitleVariant != null &&
    String(config.brandSubtitleVariant).trim()
      ? String(config.brandSubtitleVariant).trim()
      : null;
  return Object.freeze({
    authoritative: true,
    brandSubtitle: subtitle,
    brandSubtitleVariant: variant,
  });
}

module.exports = {
  resolveDeploymentBrand,
};
