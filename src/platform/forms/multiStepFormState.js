"use strict";

/**
 * Thin façade for multi-step form draft state (cookie-backed).
 * No product imports — callers inject cookie name / product code / vault hooks.
 */

const {
  createSignedRegistrationDraftCookie,
} = require("../registration/signedRegistrationDraftCookie");
const {
  resolveRegistrationDraftForGet,
  isRegistrationFreshStartRequest,
  sanitizeRegistrationDraftFormData,
} = require("../registration/registrationDraftLifecycle");
const { mergeDraftFields, DEFAULT_SECRET_KEYS } = require("../registration/multiStepDraftMerge");

/**
 * @param {{
 *   cookieName: string,
 *   productCode?: string,
 *   maxAgeMs?: number,
 *   secretFieldNames?: string[],
 * }} config
 */
function createMultiStepFormState(config) {
  const cookie = createSignedRegistrationDraftCookie({
    cookieName: config && config.cookieName,
    maxAgeMs: config && config.maxAgeMs,
  });
  const secretFieldNames = Array.isArray(config && config.secretFieldNames)
    ? config.secretFieldNames
    : [...DEFAULT_SECRET_KEYS];

  return {
    COOKIE_NAME: cookie.COOKIE_NAME,
    MAX_AGE_MS: cookie.MAX_AGE_MS,
    productCode: config && config.productCode ? String(config.productCode) : null,
    readDraft: cookie.readRegistrationDraft,
    writeDraft: cookie.writeRegistrationDraft,
    clearDraft: cookie.clearRegistrationDraft,
    mergeFields(prior, incoming, options) {
      return mergeDraftFields({
        prior,
        incoming,
        options: {
          secretKeys: secretFieldNames,
          ...(options || {}),
        },
      });
    },
    sanitizeFormData(formData) {
      return sanitizeRegistrationDraftFormData(formData);
    },
    resolveForGet(input) {
      return resolveRegistrationDraftForGet({
        ...input,
        clearDraft: cookie.clearRegistrationDraft,
        readDraft: cookie.readRegistrationDraft,
      });
    },
    isFreshStart: isRegistrationFreshStartRequest,
  };
}

module.exports = {
  createMultiStepFormState,
};
