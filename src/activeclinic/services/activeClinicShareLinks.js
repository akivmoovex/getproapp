"use strict";

/**
 * ActiveClinic activation / reset link + share helpers.
 * Absolute origins follow the ActiveClinic product host matrix — never the shared
 * platform apex (pronline.org / moovex.org) and never a hard-coded production host
 * when DEPLOYMENT_ENV=testing.
 * WhatsApp = wa.me share URL only (no Business API).
 */

const {
  buildWhatsAppShareUrl,
} = require("../../platform/services/createScopedTeamMemberService");
const {
  getDeploymentProfile,
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  publicOriginForProduct,
  PRODUCT_CODE,
} = require("../../platform/website/publicWebsiteUrl");

const DELIVERY = Object.freeze({
  NOT_REQUESTED: "not_requested",
  LINK_GENERATED: "link_generated",
  QUEUED: "queued",
  SENT: "sent",
  FAILED: "failed",
  UNAVAILABLE: "unavailable",
});

const ACTIVECLINIC_PRODUCT_HOSTS = Object.freeze(
  new Set(["activeclinic.org", "activeclinic.pronline.org"])
);

/**
 * @param {NodeJS.ProcessEnv|object|null} env
 */
function activeClinicEnvMode(env) {
  const source = env && typeof env === "object" ? env : {};
  const mode = String(
    source.DEPLOYMENT_ENV || source.DATABASE_IDENTITY_ENV || source.NODE_ENV || ""
  ).toLowerCase();
  return mode === "production" ? "production" : "testing";
}

/**
 * @param {string} origin
 */
function hostnameOfOrigin(origin) {
  try {
    return String(new URL(origin).hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * @param {string} origin
 */
function isActiveClinicProductOrigin(origin) {
  return ACTIVECLINIC_PRODUCT_HOSTS.has(hostnameOfOrigin(origin));
}

/**
 * Resolve absolute public origin for ActiveClinic invitation / reset links.
 *
 * Priority:
 * 1. ACTIVECLINIC_PUBLIC_ORIGIN / PUBLIC_ORIGIN overrides
 * 2. Deployment profile publicOrigin when it is already an ActiveClinic product host
 *    and matches the env mode (testing ↔ *.pronline.org, production ↔ activeclinic.org)
 * 3. Domain matrix product origin for ActiveClinic (handles shared platform deployments
 *    whose profile publicOrigin is pronline.org / moovex.org)
 * 4. Env-aware fallback (never force production host under testing)
 *
 * @param {NodeJS.ProcessEnv|object|null} env
 * @param {string} [deploymentCode]
 */
function resolvePublicOrigin(env, deploymentCode) {
  const source = env && typeof env === "object" ? env : {};
  const override = String(
    source.ACTIVECLINIC_PUBLIC_ORIGIN || source.PUBLIC_ORIGIN || ""
  )
    .trim()
    .replace(/\/+$/, "");
  if (override) {
    return override;
  }

  const mode = activeClinicEnvMode(source);
  const fromMatrix = String(
    publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, source) || ""
  ).replace(/\/+$/, "");

  const code = deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  try {
    const profile = getDeploymentProfile({
      ...source,
      PLATFORM_DEPLOYMENT_CODE: code,
    });
    if (profile && profile.publicOrigin) {
      const profileOrigin = String(profile.publicOrigin).replace(/\/+$/, "");
      if (isActiveClinicProductOrigin(profileOrigin)) {
        const host = hostnameOfOrigin(profileOrigin);
        // Legacy activeclinic-org-v6 is labeled for local/test but points at production host.
        if (mode === "testing" && host === "activeclinic.org") {
          return fromMatrix || "https://activeclinic.pronline.org";
        }
        if (mode === "production" && host === "activeclinic.pronline.org") {
          return fromMatrix || "https://activeclinic.org";
        }
        return profileOrigin;
      }
    }
  } catch {
    /* fall through to matrix */
  }

  if (fromMatrix) {
    return fromMatrix;
  }

  return mode === "production"
    ? "https://activeclinic.org"
    : "https://activeclinic.pronline.org";
}

/**
 * @param {{ publicOrigin?: string, env?: object, deploymentCode?: string, rawToken: string }} input
 */
function buildActivationUrl(input) {
  const origin =
    (input.publicOrigin && String(input.publicOrigin).replace(/\/+$/, "")) ||
    resolvePublicOrigin(input.env, input.deploymentCode);
  return `${origin}/activate/${encodeURIComponent(String(input.rawToken))}`;
}

/**
 * @param {{ publicOrigin?: string, env?: object, deploymentCode?: string, rawToken: string }} input
 */
function buildResetPasswordUrl(input) {
  const origin =
    (input.publicOrigin && String(input.publicOrigin).replace(/\/+$/, "")) ||
    resolvePublicOrigin(input.env, input.deploymentCode);
  return `${origin}/reset-password/${encodeURIComponent(String(input.rawToken))}`;
}

/**
 * @param {{
 *   organizationName: string,
 *   staffDisplayName?: string|null,
 *   activationUrl: string,
 * }} input
 */
function buildActivationShareMessage(input) {
  const org = String(input.organizationName || "your organization").trim();
  const link = String(input.activationUrl || "").trim();
  return (
    `You have been invited to join ${org} on ActiveClinic. ` +
    `Use this secure link to activate your account: ${link}`
  );
}

/**
 * @param {{
 *   phoneNormalized?: string|null,
 *   emailNormalized?: string|null,
 *   organizationName: string,
 *   activationUrl: string,
 *   staffDisplayName?: string|null,
 * }} input
 */
function buildInvitationShareViewModel(input) {
  const message = buildActivationShareMessage({
    organizationName: input.organizationName,
    staffDisplayName: input.staffDisplayName,
    activationUrl: input.activationUrl,
  });
  const phone = input.phoneNormalized ? String(input.phoneNormalized) : null;
  const email = input.emailNormalized
    ? String(input.emailNormalized).trim().toLowerCase()
    : null;
  const whatsappUrl = phone
    ? buildWhatsAppShareUrl({ phoneE164: phone, message })
    : null;
  const mailtoUrl = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
        "ActiveClinic account activation"
      )}&body=${encodeURIComponent(message)}`
    : null;

  return {
    activationUrl: input.activationUrl,
    shareMessage: message,
    copyText: input.activationUrl,
    whatsappUrl,
    mailtoUrl,
    hasPhone: Boolean(phone),
    hasEmail: Boolean(email),
    deliveryStatus: DELIVERY.LINK_GENERATED,
    deliveryNote:
      "Link generated for authorized sharing. Automated email/SMS delivery is unavailable without a configured provider.",
  };
}

module.exports = {
  DELIVERY,
  resolvePublicOrigin,
  buildActivationUrl,
  buildResetPasswordUrl,
  buildActivationShareMessage,
  buildInvitationShareViewModel,
  buildWhatsAppShareUrl,
};
