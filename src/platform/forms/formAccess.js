"use strict";

/**
 * Access / discovery constants for shared tenant forms (SH07).
 * Discovery (unlist) is independent of payload access control.
 */

const ACCESS_MODES = Object.freeze({
  OPEN_PUBLIC: "open_public",
  EMAIL_TOKEN: "email_token",
});

const FORM_STATUSES = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
});

const PRODUCT_CODES = Object.freeze({
  BLESSBOARD: "blessboard",
  ACTIVECLINIC: "activeclinic",
});

module.exports = {
  ACCESS_MODES,
  FORM_STATUSES,
  PRODUCT_CODES,
};
