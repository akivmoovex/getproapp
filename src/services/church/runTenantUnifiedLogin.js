"use strict";

/**
 * Shared POST completion for tenant unified login (used by /login and legacy role login routes).
 */

const { renderChurchUnavailable, isOperationalStatus } = require("../../church/churchStatusAccess");
const {
  authenticateTenantUnifiedLogin,
  regenerateSession,
  destinationForRole,
} = require("./tenantUnifiedLoginService");
const {
  clearAllChurchRoleSessions,
  applyRoleSession,
  storePortalChoice,
} = require("../../church/tenantLoginSession");

function persistAuthenticatedSession(req) {
  return new Promise((resolve, reject) => {
    if (!req || !req.session || typeof req.session.save !== "function") {
      const unavailable = new Error("Unable to complete sign-in.");
      unavailable.code = "AUTH_SESSION_SAVE_UNAVAILABLE";
      reject(unavailable);
      return;
    }
    const rejectPersistenceFailure = () => {
      const persistenceError = new Error("Unable to complete sign-in.");
      persistenceError.code = "AUTH_SESSION_SAVE_FAILED";
      reject(persistenceError);
    };
    try {
      req.session.save((err) => {
        if (err) {
          rejectPersistenceFailure();
          return;
        }
        resolve();
      });
    } catch {
      rejectPersistenceFailure();
    }
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 * @param {{ identifier: string, password: string, renderError: (message: string) => unknown, renderUnavailable?: () => unknown }} opts
 */
async function runTenantUnifiedLoginPost(pool, req, res, opts) {
  const organization = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const identifier = String(opts.identifier || "").trim();
  const password = String(opts.password || "");

  const renderUnavailable = () => {
    clearAllChurchRoleSessions(req);
    if (typeof opts.renderUnavailable === "function") return opts.renderUnavailable();
    return renderChurchUnavailable(req, res);
  };

  // Host-resolved organization status — never create sessions or portal choice when inactive.
  if (!isOperationalStatus(organization && organization.status)) {
    return renderUnavailable();
  }

  const result = await authenticateTenantUnifiedLogin(pool, req, {
    organization,
    branch,
    identifier,
    password,
  });

  if (!result.ok) {
    if (result.clearSessions) clearAllChurchRoleSessions(req);
    if (result.orgUnavailable) return renderUnavailable();
    return opts.renderError(result.error);
  }

  await regenerateSession(req);

  // Never auto-select a role from route availability. Multi-role users always choose explicitly.
  if (result.needsPortalChoice) {
    storePortalChoice(req, {
      roles: result.roles,
      organizationId: organization.id,
      branchId: branch.id,
    });
    await persistAuthenticatedSession(req);
    return res.redirect(303, "/choose-portal");
  }

  clearAllChurchRoleSessions(req);
  applyRoleSession(req, result.primaryRole);
  const requested = String(opts.nextPath || "").trim();
  let destination = destinationForRole(result.primaryRole);
  if (
    requested === "/member/dashboard" ||
    requested.startsWith("/member/") &&
      !requested.includes("://") &&
      !requested.startsWith("//")
  ) {
    destination = requested;
  }
  await persistAuthenticatedSession(req);
  return res.redirect(303, destination);
}

module.exports = {
  persistAuthenticatedSession,
  runTenantUnifiedLoginPost,
};
