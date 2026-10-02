"use strict";

/**
 * ActiveClinic roles & access routes (AC-V6-S06).
 * Stitch access screens are STITCH_GAP / VISUAL_BLOCKED.
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  loadActiveClinicAccessOverviewScreen,
  loadActiveClinicStaffAccessDetailScreen,
  loadActiveClinicAssignRoleScreen,
  loadActiveClinicEditRoleScreen,
  loadActiveClinicRevokeRoleScreen,
  loadActiveClinicRoleDetailScreen,
} = require("../services/loadActiveClinicAccessScreens");
const {
  RESULT,
  assignFoundationalStaffRole,
  updateStaffRoleAssignmentExpiry,
  replaceStaffRoleAssignment,
  revokeFoundationalStaffRole,
  scopesForRole,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  ORGANIZATION_ADMIN,
} = require("../services/activeClinicAccessManagementService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

function assignErrorMessage(code) {
  switch (code) {
    case RESULT.DUPLICATE:
      return "An active assignment with this role and scope already exists.";
    case RESULT.INVALID_ROLE:
    case RESULT.BLESSBOARD_ROLE:
      return "Only ActiveClinic catalogue roles can be assigned.";
    case RESULT.INVALID_SCOPE:
      return "Role and scope combination is not valid.";
    case RESULT.FACILITY_ASSIGNMENT_REQUIRED:
      return "The staff member must have an active facility assignment for that facility.";
    case RESULT.FACILITY_OUT_OF_SCOPE:
      return "You are not authorized to grant access for that facility.";
    case RESULT.GRANT_DENIED:
    case RESULT.DENIED:
      return "You are not authorized to grant this access.";
    case RESULT.SELF_ESCALATION:
      return "You cannot grant organization administrator access to yourself.";
    case RESULT.LAST_ORG_ADMIN:
      return "Cannot remove or suspend the last organization administrator for this clinic.";
    case RESULT.DEPENDENT_FACILITY_ROLES:
      return "Revoke facility-scoped roles for this facility before removing the facility assignment.";
    case RESULT.RAW_PERMISSIONS:
      return "Permission keys cannot be submitted directly.";
    case RESULT.CROSS_ORGANIZATION:
      return "Cross-organization access changes are not allowed.";
    case RESULT.TARGET_NOT_ACTIVE:
      return "Access can only be assigned to active or invited staff.";
    case RESULT.ACTOR_NOT_ACTIVE:
      return "Your staff profile is not active.";
    case RESULT.STAFF_NOT_FOUND:
      return "Staff member was not found in this organization.";
    case RESULT.NOT_FOUND:
      return "Role assignment was not found.";
    default:
      return "Unable to update access.";
  }
}

function parseExpiresAt(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicAccessRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    shell.pageData = options.pageData || {};
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function denyPage(res, status, title, message) {
    return res.status(status).type("html").send(
      renderSimpleState(title, message, {
        state: status === 404 ? "not-found" : "access-denied",
        linkHref: "/app/access",
        linkLabel: "Back to access",
      })
    );
  }

  function deploymentCode() {
    try {
      const identity = getPlatformDeploymentCode(env);
      return (identity && identity.code) || CODE_ACTIVECLINIC_ORG_V6;
    } catch (_err) {
      return CODE_ACTIVECLINIC_ORG_V6;
    }
  }

  app.get(
    "/app/access",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicAccessOverviewScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query || {},
        });
        if (!loaded.ok) {
          return denyPage(res, 403, "Access Denied", "You do not have the required permissions to perform this action or access this clinical record.");
        }
        const catalogueTab =
          String((req.query && req.query.tab) || "").trim() === "catalogue";
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-content.ejs",
          pageHeader: {
            title: catalogueTab ? "Roles Overview" : "Staff Users",
            description: catalogueTab
              ? "Standardized access levels and permission groupings for all staff members across the facility."
              : "Manage access and roles for all clinical facility staff.",
            actions: [
              {
                label: "Staff directory",
                href: "/app/staff",
                variant: "ghost",
              },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access" },
          ],
          pageData: { overview: loaded.overview },
          flash: req.query.ok
            ? { type: "success", message: "Access updated." }
            : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/access/roles/:roleKey",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicRoleDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          roleKey: req.params.roleKey,
        });
        if (!loaded.ok) {
          const notFound = loaded.code === "role_not_found";
          return denyPage(
            res,
            notFound ? 404 : 403,
            notFound ? "Role not found" : "Access Denied",
            notFound
              ? "That role is not in the ActiveClinic catalogue."
              : "You do not have permission to view role details."
          );
        }
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-role-detail-content.ejs",
          pageHeader: {
            title: loaded.detail.role.label,
            description: loaded.detail.role.description,
            actions: [
              {
                label: "Back to catalogue",
                href: "/app/access?tab=catalogue",
                variant: "ghost",
              },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access", href: "/app/access" },
            { label: "Catalogue", href: "/app/access?tab=catalogue" },
            { label: loaded.detail.role.label },
          ],
          pageData: { detail: loaded.detail },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/access/staff/:staffId",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicStaffAccessDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffMemberId: req.params.staffId,
        });
        if (!loaded.ok) {
          const status =
            loaded.code === RESULT.STAFF_NOT_FOUND ? 404 : 403;
          return denyPage(
            res,
            status,
            status === 404 ? "Staff not found" : "Access Denied",
            status === 404
              ? "That staff profile was not found in this organization."
              : "You do not have permission to view this access record."
          );
        }
        const actions = [];
        if (loaded.detail.actions.canAssign) {
          actions.push({
            label: "Assign role",
            href: loaded.detail.actions.assignHref,
          });
        }
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-staff-content.ejs",
          pageHeader: {
            title: loaded.detail.staff.displayName,
            description: "Assigned roles, facility membership, and effective permissions.",
            actions,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access", href: "/app/access" },
            { label: loaded.detail.staff.displayName },
          ],
          pageData: { detail: loaded.detail },
          flash: req.query.ok
            ? { type: "success", message: "Access updated." }
            : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/access/staff/:staffId/assign",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicAssignRoleScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffMemberId: req.params.staffId,
        });
        if (!loaded.ok) {
          return denyPage(res, loaded.code === RESULT.STAFF_NOT_FOUND ? 404 : 403, "Unable to assign role", assignErrorMessage(loaded.code));
        }
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-role-form-content.ejs",
          pageHeader: {
            title: "Assign Staff Role",
            description: `Grant an ActiveClinic role to ${loaded.form.staff.displayName}.`,
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access", href: "/app/access" },
            {
              label: loaded.form.staff.displayName,
              href: `/app/access/staff/${loaded.form.staff.id}`,
            },
            { label: "Assign role" },
          ],
          pageData: { form: loaded.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/access/staff/:staffId/roles",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const body = req.body || {};
        const expiresAt = parseExpiresAt(body.expires_at);
        let roleKeys = body.role_keys || body["role_keys[]"] || [];
        if (!Array.isArray(roleKeys)) roleKeys = roleKeys ? [roleKeys] : [];
        roleKeys = roleKeys.map((k) => String(k || "").trim()).filter(Boolean);
        if (!roleKeys.length && body.role_key) {
          roleKeys = [String(body.role_key).trim()].filter(Boolean);
        }
        const facilityId = String(body.facility_id || "").trim() || null;

        async function renderAssignFailure(errors, fieldErrors, status) {
          const loaded = await loadActiveClinicAssignRoleScreen(getPool(), {
            auth: req.activeClinicAuth,
            staffMemberId: req.params.staffId,
            values: {
              roleKeys,
              roleKey: roleKeys[0] || "",
              scopeType: String(body.scope_type || "").trim(),
              facilityId: facilityId || "",
              expiresAt: String(body.expires_at || "").trim(),
            },
            errors,
            fieldErrors: fieldErrors || {},
          });
          if (!loaded.ok) {
            return denyPage(
              res,
              loaded.code === RESULT.STAFF_NOT_FOUND ? 404 : 403,
              "Unable to assign role",
              assignErrorMessage(loaded.code)
            );
          }
          return await renderShell(req, res, {
            status: status || 400,
            activeNav: "access",
            content: "app/access-role-form-content.ejs",
            pageHeader: {
              title: "Assign role",
              description: "Fix the validation errors and try again.",
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Roles & access", href: "/app/access" },
              { label: "Assign role" },
            ],
            pageData: { form: loaded.form },
          });
        }

        if (expiresAt === undefined) {
          return await renderAssignFailure(
            ["Enter a valid expiry date and time, or leave it blank."],
            { expires_at: "Invalid expiry" }
          );
        }
        if (!roleKeys.length) {
          return await renderAssignFailure(
            ["Select at least one role."],
            { role_keys: "Select at least one role." }
          );
        }

        for (const roleKey of roleKeys) {
          const scopes = scopesForRole(roleKey);
          let scopeType = String(body.scope_type || "").trim();
          if (scopes.length === 1) scopeType = scopes[0];
          if (
            !scopeType ||
            (scopes.includes("facility") &&
              !scopes.includes("organisation") &&
              scopeType !== "facility")
          ) {
            scopeType = scopes.includes("facility") ? "facility" : scopes[0];
          }
          if (
            roleKey === ORGANIZATION_ADMIN ||
            roleKey === NETWORK_ADMIN
          ) {
            scopeType = "organisation";
          }

          const result = await assignFoundationalStaffRole(getPool(), {
            auth: req.activeClinicAuth,
            staffMemberId: req.params.staffId,
            roleKey,
            scopeType,
            facilityId: scopeType === "facility" ? facilityId : null,
            expiresAt,
            organizationId: body.organization_id,
            permissionKeys: body.permission_keys || body.permissions,
            deploymentCode: deploymentCode(),
          });
          if (!result.ok) {
            return await renderAssignFailure(
              [assignErrorMessage(result.code)],
              {}
            );
          }
        }
        return res.redirect(
          303,
          `/app/access/staff/${encodeURIComponent(req.params.staffId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/access/staff/:staffId/roles/:assignmentId/edit",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicEditRoleScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffMemberId: req.params.staffId,
          assignmentId: req.params.assignmentId,
        });
        if (!loaded.ok) {
          return denyPage(res, loaded.code === RESULT.NOT_FOUND ? 404 : 403, "Unable to edit assignment", assignErrorMessage(loaded.code));
        }
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-role-form-content.ejs",
          pageHeader: {
            title: "Edit assignment",
            description: loaded.form.policyNote,
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access", href: "/app/access" },
            {
              label: loaded.form.staff.displayName,
              href: `/app/access/staff/${loaded.form.staff.id}`,
            },
            { label: "Edit assignment" },
          ],
          pageData: { form: loaded.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/access/staff/:staffId/roles/:assignmentId",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const body = req.body || {};
        const editMode = String(body.edit_mode || "expiry").trim();
        const expiresAt = parseExpiresAt(body.expires_at);
        if (expiresAt === undefined) {
          return denyPage(res, 400, "Invalid expiry", "Enter a valid expiry date and time, or leave it blank.");
        }

        let result;
        if (editMode === "replace") {
          result = await replaceStaffRoleAssignment(getPool(), {
            auth: req.activeClinicAuth,
            staffMemberId: req.params.staffId,
            assignmentId: req.params.assignmentId,
            roleKey: body.role_key,
            scopeType: body.scope_type,
            facilityId: body.facility_id || null,
            expiresAt,
            deploymentCode: deploymentCode(),
          });
        } else {
          result = await updateStaffRoleAssignmentExpiry(getPool(), {
            auth: req.activeClinicAuth,
            staffMemberId: req.params.staffId,
            assignmentId: req.params.assignmentId,
            expiresAt,
            deploymentCode: deploymentCode(),
          });
        }

        if (!result.ok) {
          return denyPage(res, 400, "Unable to update assignment", assignErrorMessage(result.code));
        }
        return res.redirect(
          303,
          `/app/access/staff/${encodeURIComponent(req.params.staffId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/access/staff/:staffId/roles/:assignmentId/revoke",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicRevokeRoleScreen(getPool(), {
          auth: req.activeClinicAuth,
          staffMemberId: req.params.staffId,
          assignmentId: req.params.assignmentId,
        });
        if (!loaded.ok) {
          return denyPage(res, loaded.code === RESULT.NOT_FOUND ? 404 : 403, "Unable to revoke assignment", assignErrorMessage(loaded.code));
        }
        return await renderShell(req, res, {
          activeNav: "access",
          content: "app/access-revoke-content.ejs",
          pageHeader: {
            title: "Revoke access",
            description:
              "Revocation takes effect immediately. The assignment is retained for audit.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Roles & access", href: "/app/access" },
            {
              label: loaded.revoke.staff.displayName,
              href: `/app/access/staff/${loaded.revoke.staff.id}`,
            },
            { label: "Revoke" },
          ],
          pageData: { revoke: loaded.revoke },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/access/staff/:staffId/roles/:assignmentId/revoke",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const result = await revokeFoundationalStaffRole(getPool(), {
          auth: req.activeClinicAuth,
          staffMemberId: req.params.staffId,
          assignmentId: req.params.assignmentId,
          reason: String((req.body && req.body.reason) || "admin_revoke").slice(0, 500),
          deploymentCode: deploymentCode(),
        });
        if (!result.ok) {
          return denyPage(res, 400, "Unable to revoke assignment", assignErrorMessage(result.code));
        }
        return res.redirect(
          303,
          `/app/access/staff/${encodeURIComponent(req.params.staffId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicAccessRoutes,
  CSRF_FIELD,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
};
