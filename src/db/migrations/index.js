"use strict";

/**
 * Ordered migration runner. Steps are extracted from the former monolithic src/db.js
 * in the same sequence to preserve deterministic startup.
 *
 * @see ../MIGRATIONS.md
 */
const STEPS = [
  require("./01-legacy-pragma-alters"),
  require("./02-tenant-id-layout"),
  require("./03-categories-and-repeatable-seeds"),
  require("./04-tenant-defaults-and-demo-companies"),
  require("./05-reviews"),
  require("./06-repair-and-company-profile-columns"),
  require("./07-demo-rich-profiles-and-noncanonical-tenants"),
  require("./08-tenant-cities"),
  require("./09-leads-and-crm-core"),
  require("./10-tenants-contact-and-demo-fixes"),
  require("./11-demo-logos-users-admin-roles-content-intake"),
  require("./12-company-portal-and-demo-seeds"),
  require("./13-nrz-intake-lifecycle-credits"),
  require("./14-company-directory-fts"),
  require("./15-query-pattern-indexes"),
  require("./16-drop-redundant-indexes"),
];

function runAllMigrations(db) {
  for (const step of STEPS) {
    step(db);
  }
}

module.exports = { runAllMigrations, STEPS };
