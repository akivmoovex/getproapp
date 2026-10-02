"use strict";

/**
 * ActiveClinic registration wizard draft cookie — thin product config over platform.
 * Cookie name + step field allowlists are the only product-specific parameters.
 */

const {
  createSignedRegistrationDraftCookie,
} = require("../../platform/registration/signedRegistrationDraftCookie");

const draft = createSignedRegistrationDraftCookie({
  cookieName: "ac_reg_draft",
});

/** Keys each wizard step may update in the shared draft (server allowlist). */
const STEP_FIELD_ALLOWLIST = Object.freeze({
  clinic: Object.freeze([
    "clinicName",
    "clinicType",
    "countryCode",
    "province",
    "city",
    "locationId",
    "address",
    "notes",
  ]),
  administrator: Object.freeze([
    "contactName",
    "contactEmail",
    "contactPhone",
    "phoneCountry",
    "phoneNational",
    "acceptTerms",
    "registration_consent",
  ]),
  review: Object.freeze(["acceptTerms", "registration_consent"]),
});

const PROTECTED_KEYS = Object.freeze([]);

module.exports = {
  ...draft,
  STEP_FIELD_ALLOWLIST,
  PROTECTED_KEYS,
};
