"use strict";

/**
 * BlessBoard registration wizard draft cookie — thin product config over platform.
 * Cookie name is the only product-specific parameter.
 */

const {
  createSignedRegistrationDraftCookie,
} = require("../../platform/registration/signedRegistrationDraftCookie");

module.exports = createSignedRegistrationDraftCookie({
  cookieName: "bb_reg_draft",
});
