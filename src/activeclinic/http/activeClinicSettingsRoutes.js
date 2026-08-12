"use strict";

/**
 * ActiveClinic organization settings routes (AC-V6-S07).
 * Stitch settings screens are STITCH_GAP / VISUAL_BLOCKED.
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
  RESULT,
  loadActiveClinicSettingsOverviewScreen,
  loadHealthcareOrganizationSettingsScreen,
  loadEditHealthcareOrganizationScreen,
  updateHealthcareOrganizationSettings,
  loadRegionalSettingsScreen,
  updateRegionalSettings,
} = require("../services/loadActiveClinicSettingsScreens");
const {
  loadDepartmentsSettingsScreen,
  createDepartment,
  updateDepartment,
  RESULT: DEPT_RESULT,
  PERM: DEPT_PERM,
} = require("../services/loadActiveClinicDepartmentsSettingsScreen");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { readV5SessionCookie } = require("../../platform/session/v5SessionCookie");
const { hashSessionToken } = require("../../platform/session/sessionToken");

function departmentErrorMessage(code) {
  switch (code) {
    case DEPT_RESULT.ACCESS_DENIED:
      return "You are not authorized to manage clinic departments.";
    case DEPT_RESULT.FACILITY_NOT_FOUND:
      return "Facility was not found in this organization.";
    case DEPT_RESULT.DUPLICATE_KEY:
      return "A department with that key already exists at this facility.";
    case DEPT_RESULT.INVALID_TYPE:
      return "Choose a supported department type.";
    case DEPT_RESULT.INVALID_STATUS:
      return "Choose active or inactive.";
    case DEPT_RESULT.NOT_FOUND:
      return "Department was not found.";
    case DEPT_RESULT.INVALID_INPUT:
      return "Check the department name, type, and facility.";
    default:
      return "Unable to update departments.";
  }
}

function updateErrorMessage(code) {
  switch (code) {
    case RESULT.INVALID_TYPE:
      return "Choose an approved organization type.";
    case RESULT.INVALID_INPUT:
      return "Check legal name, public name, country, timezone, and registration number.";
    case RESULT.DENIED:
      return "You are not authorized to change organization settings.";
    case RESULT.NOT_FOUND:
      return "Healthcare organization profile was not found.";
    case RESULT.PRODUCT_NOT_ENABLED:
      return "ActiveClinic is not enabled for this organization.";
    default:
      return "Unable to save organization profile.";
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicSettingsRoutes(app, deps) {
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
        linkHref: "/app/settings",
        linkLabel: "Back to settings",
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
    "/app/settings",
    requireAuth,
    requirePermission("activeclinic.access"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicSettingsOverviewScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return denyPage(
            res,
            403,
            "Access restricted",
            "You do not have permission to view settings."
          );
        }
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-content.ejs",
          pageHeader: {
            title: "Settings",
            description: "Organization, facilities, access, and account preferences.",
            actions: [],
          },
          breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Settings" }],
          pageData: { overview: loaded.overview },
          flash: req.query.ok
            ? { type: "success", message: "Organization profile saved." }
            : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/organization",
    requireAuth,
    requirePermission("activeclinic.organization.view"),
    async (req, res, next) => {
      try {
        const loaded = await loadHealthcareOrganizationSettingsScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return denyPage(
            res,
            loaded.code === RESULT.NOT_FOUND ? 404 : 403,
            loaded.code === RESULT.NOT_FOUND
              ? "Organization not found"
              : "Access restricted",
            updateErrorMessage(loaded.code)
          );
        }
        const actions = [];
        if (loaded.profile.actions.canEdit) {
          actions.push({
            label: "Edit profile",
            href: loaded.profile.actions.editHref,
          });
        }
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-organization-content.ejs",
          pageHeader: {
            title: "Organization profile",
            description: "Healthcare organization identity, locale, and status.",
            actions,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Organization" },
          ],
          pageData: { profile: loaded.profile },
          flash: req.query.ok
            ? { type: "success", message: "Organization profile saved." }
            : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/organization/edit",
    requireAuth,
    requirePermission("activeclinic.organization.manage"),
    async (req, res, next) => {
      try {
        const loaded = await loadEditHealthcareOrganizationScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return denyPage(
            res,
            loaded.code === RESULT.NOT_FOUND ? 404 : 403,
            "Unable to edit organization",
            updateErrorMessage(loaded.code)
          );
        }
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-organization-form-content.ejs",
          pageHeader: {
            title: "Edit organization profile",
            description: "Update legal and public identity, type, country, and timezone.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Organization", href: "/app/settings/organization" },
            { label: "Edit" },
          ],
          pageData: { form: loaded.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/organization",
    requireAuth,
    requirePermission("activeclinic.organization.manage"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const body = req.body || {};
        const values = {
          legalName: String(body.legal_name || "").trim(),
          publicName: String(body.public_name || "").trim(),
          organizationType: String(body.organization_type || "").trim(),
          countryCode: String(body.country_code || "").trim(),
          registrationNumber: String(body.registration_number || "").trim(),
          timezone: String(body.timezone || "").trim(),
        };

        const result = await updateHealthcareOrganizationSettings(getPool(), {
          auth: req.activeClinicAuth,
          organizationId: body.organization_id,
          status: body.status,
          productStatus: body.product_status,
          enrolmentStatus: body.enrolment_status,
          deploymentCode: deploymentCode(),
          ...values,
        });

        if (!result.ok) {
          const loaded = await loadEditHealthcareOrganizationScreen(getPool(), {
            auth: req.activeClinicAuth,
            values,
            errors: [updateErrorMessage(result.code)],
            fieldErrors: {},
          });
          if (!loaded.ok) {
            return denyPage(res, 403, "Unable to save", updateErrorMessage(result.code));
          }
          return await renderShell(req, res, {
            status: 400,
            activeNav: "settings",
            content: "app/settings-organization-form-content.ejs",
            pageHeader: {
              title: "Edit organization profile",
              description: "Fix the validation errors and try again.",
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Settings", href: "/app/settings" },
              { label: "Organization", href: "/app/settings/organization" },
              { label: "Edit" },
            ],
            pageData: { form: loaded.form },
          });
        }

        return res.redirect(303, "/app/settings/organization?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/facilities",
    requireAuth,
    requirePermission("activeclinic.facility.view"),
    async (req, res, next) => {
      try {
        const overview = await loadActiveClinicSettingsOverviewScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-link-content.ejs",
          pageHeader: {
            title: "Facility settings",
            description: "Facility management lives in the facilities module.",
            actions: [{ label: "Open facilities", href: "/app/facilities" }],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Facilities" },
          ],
          pageData: {
            linkPage: {
              title: "Facilities",
              body: "Use the facilities catalogue to create, edit, archive, and set a primary facility.",
              primaryHref: "/app/facilities",
              primaryLabel: "Go to facilities",
              summary: overview.ok
                ? overview.overview.primaryFacility
                  ? `Primary: ${overview.overview.primaryFacility.displayName}`
                  : "No primary facility configured."
                : null,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/access",
    requireAuth,
    requirePermission("activeclinic.staff.assign_access"),
    async (_req, res) => {
      return res.redirect(303, "/app/access");
    }
  );

  app.get(
    "/app/settings/account",
    requireAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-account-content.ejs",
          pageHeader: {
            title: "Account security",
            description: "Password and session actions for your ActiveClinic login.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Account" },
          ],
          pageData: {
            account: {
              staffDisplayName:
                (auth.staffMember && auth.staffMember.displayName) || "Staff member",
              organizationName:
                (auth.healthcareOrganization &&
                  (auth.healthcareOrganization.publicName ||
                    auth.healthcareOrganization.legalName)) ||
                (auth.organization && auth.organization.displayName) ||
                "Organization",
              mustChangePassword: Boolean(auth.mustChangePassword),
              changePasswordHref: "/account/change-password",
              logoutHref: "/logout",
            },
            stitch: { desktop: "c50a51a04a084f0badd48da9827aa11f" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/account/sessions",
    requireAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const identityId = auth.platformIdentity && auth.platformIdentity.id;
        const deploymentCodeValue = deploymentCode();
        const rawToken = readV5SessionCookie(req, env);
        const currentHash = rawToken ? hashSessionToken(rawToken) : null;

        let sessions = [];
        if (identityId) {
          const result = await getPool().query(
            `SELECT id, created_at, last_seen_at, expires_at, session_token_hash
               FROM platform.deployment_sessions
              WHERE platform_identity_id = $1
                AND deployment_code = $2
                AND revoked_at IS NULL
                AND expires_at > now()
              ORDER BY last_seen_at DESC
              LIMIT 25`,
            [identityId, deploymentCodeValue]
          );
          sessions = result.rows.map((row) => {
            const isCurrent = currentHash && row.session_token_hash === currentHash;
            return {
              id: row.id,
              isCurrent: Boolean(isCurrent),
              createdAtLabel: new Date(row.created_at).toLocaleString(),
              lastSeenLabel: new Date(row.last_seen_at).toLocaleString(),
              expiresAtLabel: new Date(row.expires_at).toLocaleString(),
            };
          });
        }

        const current = sessions.find((s) => s.isCurrent) || null;
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-account-sessions-content.ejs",
          pageHeader: {
            title: "Active sessions",
            description: "Review signed-in devices for your account.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Account", href: "/app/settings/account" },
            { label: "Sessions" },
          ],
          pageData: {
            sessions,
            currentSessionId: current ? current.id : null,
            stitch: { desktop: "e132749f634c4fff818acf3f8e21c361" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/account/sessions/revoke-others",
    requireAuth,
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const identityId = auth.platformIdentity && auth.platformIdentity.id;
        const deploymentCodeValue = deploymentCode();
        const rawToken = readV5SessionCookie(req, env);
        const currentHash = rawToken ? hashSessionToken(rawToken) : null;
        if (identityId && currentHash) {
          await getPool().query(
            `UPDATE platform.deployment_sessions
                SET revoked_at = now()
              WHERE platform_identity_id = $1
                AND deployment_code = $2
                AND revoked_at IS NULL
                AND session_token_hash <> $3`,
            [identityId, deploymentCodeValue, currentHash]
          );
        }
        return res.redirect(303, "/app/settings/account/sessions?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/clinic-setup/regional",
    requireAuth,
    requirePermission("activeclinic.organization.manage"),
    async (req, res, next) => {
      try {
        const loaded = await loadRegionalSettingsScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return denyPage(res, 403, "Access restricted", "You cannot manage regional settings.");
        }
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-regional-content.ejs",
          pageHeader: {
            title: "Regional settings",
            description: "Clinic Setup — default country and timezone.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Clinic Setup" },
            { label: "Regional" },
          ],
          pageData: { form: loaded.form },
          flash: req.query.ok
            ? {
                type: "success",
                message: "Regional settings saved. Existing phone numbers were not changed.",
              }
            : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/clinic-setup/regional",
    requireAuth,
    requirePermission("activeclinic.organization.manage"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const body = req.body || {};
        const values = {
          countryCode: String(body.country_code || "").trim().toUpperCase(),
          timezone: String(body.timezone || "").trim(),
        };
        const result = await updateRegionalSettings(getPool(), {
          auth: req.activeClinicAuth,
          deploymentCode: deploymentCode(),
          ...values,
        });
        if (!result.ok) {
          const loaded = await loadRegionalSettingsScreen(getPool(), {
            auth: req.activeClinicAuth,
            values,
            errors: ["Unable to save regional settings. Check country and timezone."],
            fieldErrors: {},
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "settings",
            content: "app/settings-regional-content.ejs",
            pageHeader: {
              title: "Regional settings",
              description: "Fix the validation errors and try again.",
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Settings", href: "/app/settings" },
              { label: "Clinic Setup" },
              { label: "Regional" },
            ],
            pageData: { form: loaded.form },
          });
        }
        return res.redirect(303, "/app/settings/clinic-setup/regional?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/settings/clinic-setup/departments",
    requireAuth,
    requirePermission(DEPT_PERM.MANAGE),
    async (req, res, next) => {
      try {
        const loaded = await loadDepartmentsSettingsScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return denyPage(
            res,
            403,
            "Access restricted",
            departmentErrorMessage(loaded.code)
          );
        }
        return await renderShell(req, res, {
          activeNav: "settings",
          content: "app/settings-departments-content.ejs",
          pageHeader: {
            title: "Departments",
            description: "Clinic Setup — configure operational departments per facility.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Settings", href: "/app/settings" },
            { label: "Clinic Setup" },
            { label: "Departments" },
          ],
          pageData: { departmentsPage: loaded.departmentsPage },
          flash: req.query.ok
            ? { type: "success", message: "Department configuration saved." }
            : req.query.err
              ? { type: "error", message: departmentErrorMessage(req.query.err) }
              : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/clinic-setup/departments",
    requireAuth,
    requirePermission(DEPT_PERM.MANAGE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const body = req.body || {};
        const result = await createDepartment(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          facilityId: String(body.facility_id || "").trim(),
          departmentType: String(body.department_type || "").trim(),
          displayName: String(body.display_name || "").trim(),
          departmentKey: String(body.department_key || "").trim() || null,
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/settings/clinic-setup/departments?err=${encodeURIComponent(result.result)}`
          );
        }
        return res.redirect(303, "/app/settings/clinic-setup/departments?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/clinic-setup/departments/:id/edit",
    requireAuth,
    requirePermission(DEPT_PERM.MANAGE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const result = await updateDepartment(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          departmentId: req.params.id,
          displayName: String((req.body && req.body.display_name) || "").trim(),
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/settings/clinic-setup/departments?err=${encodeURIComponent(result.result)}`
          );
        }
        return res.redirect(303, "/app/settings/clinic-setup/departments?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/clinic-setup/departments/:id/activate",
    requireAuth,
    requirePermission(DEPT_PERM.MANAGE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const result = await updateDepartment(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          departmentId: req.params.id,
          status: "active",
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/settings/clinic-setup/departments?err=${encodeURIComponent(result.result)}`
          );
        }
        return res.redirect(303, "/app/settings/clinic-setup/departments?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/settings/clinic-setup/departments/:id/deactivate",
    requireAuth,
    requirePermission(DEPT_PERM.MANAGE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const result = await updateDepartment(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          departmentId: req.params.id,
          status: "inactive",
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/settings/clinic-setup/departments?err=${encodeURIComponent(result.result)}`
          );
        }
        return res.redirect(303, "/app/settings/clinic-setup/departments?ok=1");
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicSettingsRoutes,
  CSRF_FIELD,
};
