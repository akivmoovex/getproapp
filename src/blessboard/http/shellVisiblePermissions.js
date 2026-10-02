"use strict";

/**
 * Permission keys that justify entering HQ or Branch Admin shells.
 * Shell entry does not grant module access — each module still checks its own keys.
 * Evaluated with listEffectivePermissions / authorize under the intended scope:
 * - HQ: resourceContext.branchId = null (branch-only grants do not match)
 * - Branch: resourceContext.branchId = trusted session branch
 */

/** @type {readonly string[]} */
const HQ_SHELL_VISIBLE_PERMISSIONS = Object.freeze([
  "organisation.view",
  "organisation.settings.manage",
  "branches.view",
  "branches.create",
  "branches.edit",
  "members.view",
  "attendance.view",
  "events.view",
  "website.view",
  "website.edit",
  "website.publish",
  "requests.view",
  "announcements.view",
  "broadcasts.view",
  "audit.view",
  "audit.view_access",
  "audit.view_website",
  "roles.view",
  "giving.view_summary",
  "finance.transactions.view",
  "finance.reports.view",
  "ministries.view",
  "departments.view",
  "cells.view",
  "classes.view",
  "journey_contacts.view_team",
  "journey_handovers.view_status",
  "pastoral_cases.view_restricted",
  "pastoral_cases.view_confidential",
  "welfare_cases.view",
]);

/** @type {readonly string[]} */
const BRANCH_SHELL_VISIBLE_PERMISSIONS = Object.freeze([
  "organisation.view",
  "branches.view",
  "branches.edit",
  "members.view",
  "attendance.view",
  "events.view",
  "website.view",
  "website.edit",
  "website.publish",
  "requests.view",
  "announcements.view",
  "giving.view_summary",
  "finance.transactions.view",
  "finance.reports.view",
  "ministries.view",
  "departments.view",
  "cells.view",
  "classes.view",
  "journey_contacts.view_team",
  "journey_handovers.view_status",
  "roles.assign_standard",
]);

/** @type {readonly string[]} */
const CONTENT_SHELL_VISIBLE_PERMISSIONS = Object.freeze([
  "website.view",
  "website.edit",
  "website.publish",
]);

module.exports = {
  HQ_SHELL_VISIBLE_PERMISSIONS,
  BRANCH_SHELL_VISIBLE_PERMISSIONS,
  CONTENT_SHELL_VISIBLE_PERMISSIONS,
};
