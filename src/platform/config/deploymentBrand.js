"use strict";

/**
 * Presentation metadata for BlessBoard platform brand chrome.
 * Derived only from the authoritative deployment profile — never hostname or NODE_ENV alone.
 *
 * When brandSubtitleSource is "buildIdentity", the subtitle comes from the shared
 * platform build identity (deployed Git branch + environment), not a hard-coded V9/V10 label.
 */

const { resolveDeploymentConfiguration } = require("./deploymentProfiles");
const { getBuildIdentity } = require("../runtime/buildIdentity");

/**
 * @typedef {Readonly<{
 *   authoritative: boolean,
 *   brandSubtitle: string|null,
 *   brandSubtitleVariant: "production-partner"|"demo"|null,
 *   brandSubtitleSource: "buildIdentity"|null,
 * }>} DeploymentBrand
 */

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {DeploymentBrand}
 */
function resolveDeploymentBrand(env) {
  const source = env || process.env;
  const config = resolveDeploymentConfiguration(source);
  if (!config.authoritative) {
    return Object.freeze({
      authoritative: false,
      brandSubtitle: null,
      brandSubtitleVariant: null,
      brandSubtitleSource: null,
    });
  }

  const subtitleSource =
    config.brandSubtitleSource != null && String(config.brandSubtitleSource).trim()
      ? String(config.brandSubtitleSource).trim()
      : null;

  let subtitle =
    config.brandSubtitle != null && String(config.brandSubtitle).trim()
      ? String(config.brandSubtitle).trim()
      : null;

  if (subtitleSource === "buildIdentity") {
    subtitle = getBuildIdentity({ env: source }).displayLabel;
  }

  const variant =
    config.brandSubtitleVariant != null &&
    String(config.brandSubtitleVariant).trim()
      ? String(config.brandSubtitleVariant).trim()
      : null;

  return Object.freeze({
    authoritative: true,
    brandSubtitle: subtitle,
    brandSubtitleVariant: variant,
    brandSubtitleSource: subtitleSource,
  });
}

module.exports = {
  resolveDeploymentBrand,
};
