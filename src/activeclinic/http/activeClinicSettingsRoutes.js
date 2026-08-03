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
} = require("../services/loadActiveClinicSettingsScreens");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

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
          },
        });
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
