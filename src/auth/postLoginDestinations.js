"use strict";

/**
 * Canonical post-login paths (one place for tests and imports).
 * Actual redirect logic stays in each portal’s POST handler (separate sessions).
 */

const FIELD_AGENT_DASHBOARD = "/field-agent/dashboard";
const ADMIN_DASHBOARD = "/admin/dashboard";
const ADMIN_SUPER = "/admin/super";
const CLIENT_LOGIN = "/client/login";

function dashboardPathAfterFieldAgentLogin() {
  return FIELD_AGENT_DASHBOARD;
}

module.exports = {
  dashboardPathAfterFieldAgentLogin,
  FIELD_AGENT_DASHBOARD,
  ADMIN_DASHBOARD,
  ADMIN_SUPER,
  CLIENT_LOGIN,
};
