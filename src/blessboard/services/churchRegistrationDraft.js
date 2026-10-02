"use strict";

/**
 * BlessBoard registration wizard draft cookie — thin product config over platform.
 * Cookie name + step field allowlists are the only product-specific parameters.
 */

const {
  createSignedRegistrationDraftCookie,
} = require("../../platform/registration/signedRegistrationDraftCookie");

const draft = createSignedRegistrationDraftCookie({
  cookieName: "bb_reg_draft",
});

/** Keys each wizard step may update in the shared draft (server allowlist). */
const STEP_FIELD_ALLOWLIST = Object.freeze({
  church: Object.freeze([
    "church_name",
    "country",
    "city",
    "branch_name",
    "branch_count",
    "selected_plan",
    "message",
    "branch_key_preview",
  ]),
  administrator: Object.freeze([
    "contact_name",
    "email",
    "phone",
    "phone_country",
    "phone_national",
    "role_in_church",
    "registration_consent",
    "consent_contact",
  ]),
  review: Object.freeze(["registration_consent", "consent_contact"]),
});

/** Never accept these from the client body into the draft. */
const PROTECTED_KEYS = Object.freeze(["organization_key"]);

module.exports = {
  ...draft,
  STEP_FIELD_ALLOWLIST,
  PROTECTED_KEYS,
};
