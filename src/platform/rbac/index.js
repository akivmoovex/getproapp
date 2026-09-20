"use strict";

/**
 * Shared RBAC + tenant isolation (V8).
 * Product role catalogues remain in BlessBoard / ActiveClinic.
 */

const tenantScope = require("./sharedTenantScope");
const authzDecision = require("./sharedAuthzDecision");
const facade = require("./sharedRbacFacade");

module.exports = {
  ...tenantScope,
  ...authzDecision,
  authorizeBlessBoard: facade.authorizeBlessBoard,
  authorizeActiveClinic: facade.authorizeActiveClinic,
  assertExpectedProduct: facade.assertExpectedProduct,
};
