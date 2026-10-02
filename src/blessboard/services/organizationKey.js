"use strict";

/**
 * Thin re-export — organization_key mechanics live in platform (PL06).
 * Runtime BB callers import platform directly; this remains for older test paths.
 *
 * Prefer: `require("../../platform/organization/organizationKey")`
 * Church-specific URL/compat: `organizationKeyCompat`, `churchUrlHelper`.
 */

module.exports = require("../../platform/organization/organizationKey");
