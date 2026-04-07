"use strict";

/**
 * PostgreSQL data access (required at runtime — `server.js` exits if not configured).
 * Comments in `*Repo.js` that mention SQLite describe historical parity / migration notes only.
 *
 * - Pool: `getPgPool`, `isPgConfigured`, `closePgPool` (see `pool.js`)
 * - Repositories: SQL-only modules (`*Repo.js`); pass the pool as the first argument.
 */

const pool = require("./pool");

module.exports = {
  ...pool,
  tenantsRepo: require("./tenantsRepo"),
  categoriesRepo: require("./categoriesRepo"),
  companiesRepo: require("./companiesRepo"),
  reviewsRepo: require("./reviewsRepo"),
  leadsRepo: require("./leadsRepo"),
  tenantCitiesRepo: require("./tenantCitiesRepo"),
  callbacksRepo: require("./callbacksRepo"),
  professionalSignupsRepo: require("./professionalSignupsRepo"),
  crmAuditRepo: require("./crmAuditRepo"),
  crmTasksRepo: require("./crmTasksRepo"),
  contentPagesRepo: require("./contentPagesRepo"),
  adminUsersRepo: require("./adminUsersRepo"),
  adminUserTenantRolesRepo: require("./adminUserTenantRolesRepo"),
  companyPersonnelUsersRepo: require("./companyPersonnelUsersRepo"),
  intakeCodeSequencesRepo: require("./intakeCodeSequencesRepo"),
  intakeSettingsRepo: require("./intakeSettingsRepo"),
  intakeClientsRepo: require("./intakeClientsRepo"),
  intakeClientProjectsRepo: require("./intakeClientProjectsRepo"),
  intakeProjectImagesRepo: require("./intakeProjectImagesRepo"),
  intakePhoneOtpRepo: require("./intakePhoneOtpRepo"),
  intakeAssignmentsRepo: require("./intakeAssignmentsRepo"),
  companyPortalLeadsRepo: require("./companyPortalLeadsRepo"),
};
