"use strict";

/**
 * Compatibility re-export — organization_key mechanics live in platform.
 *
 * Prefer: `require("../../platform/organization/organizationKey")`
 * Church-specific URL/compat: `organizationKeyCompat`, `churchUrlHelper`.
 */

module.exports = require("../../platform/organization/organizationKey");
