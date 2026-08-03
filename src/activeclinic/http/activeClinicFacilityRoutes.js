"use strict";

/**
 * ActiveClinic facilities management routes (AC-V6-S03).
 * Shell-backed UI; Stitch facility screens are STITCH_GAP / VISUAL_BLOCKED.
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
  createFacility,
  updateFacility,
  archiveFacility,
  setPrimaryFacility,
  RESULT: FACILITY_RESULT,
} = require("../services/facilityService");
const {
  loadActiveClinicFacilitiesListScreen,
  loadActiveClinicFacilityDetailScreen,
  loadActiveClinicCreateFacilityScreen,
  loadActiveClinicEditFacilityScreen,
  parseFacilityFormBody,
} = require("../services/loadActiveClinicFacilityScreens");
const {
  clearSessionContextKeys,
} = require("../../platform/session/deploymentSessionContext");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

function errorMessageForCode(code) {
  switch (code) {
    case FACILITY_RESULT.DUPLICATE_KEY:
      return "That facility key is already in use for this organization.";
    case FACILITY_RESULT.INVALID_KEY:
      return "Facility key is invalid or reserved.";
    case FACILITY_RESULT.INVALID_TYPE:
      return "Choose a valid facility type.";
    case FACILITY_RESULT.INVALID_STATUS:
      return "Choose a valid status.";
    case FACILITY_RESULT.PRIMARY_CONFLICT:
      return "Another active primary facility already exists. Clear it first or leave primary unchecked.";
    case FACILITY_RESULT.INVALID_INPUT:
      return "Check required fields, phone, email, and timezone.";
    case FACILITY_RESULT.PRODUCT_NOT_ENABLED:
      return "ActiveClinic is not enabled for this organization.";
    case FACILITY_RESULT.HCO_NOT_ACTIVE:
    case FACILITY_RESULT.HCO_NOT_FOUND:
      return "Healthcare organization is not available.";
    default:
      return "Unable to save facility.";
  }
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicFacilityRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({});
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
      pageData: options.pageData || {},
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  app.get(
    "/app/facilities",
    requireAuth,
    requirePermission("activeclinic.facility.view"),
    async (req, res, next) => {
      try {
        const list = await loadActiveClinicFacilitiesListScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query || {},
        });
        const canCreate = list.actions && list.actions.canCreate;
        return await renderShell(req, res, {
          activeNav: "facilities",
          content: "app/facilities-list-content.ejs",
          pageHeader: {
            title: "Facilities",
            description: "Healthcare facilities in this organization.",
            actions: canCreate
              ? [{ label: "Add facility", href: "/app/facilities/new" }]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Facilities" },
          ],
          pageData: { list },
          flash: req.query && req.query.archived === "1"
            ? { type: "success", message: "Facility archived." }
            : req.query && req.query.primary === "set"
              ? { type: "success", message: "Primary facility updated." }
              : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/facilities/new",
    requireAuth,
    requirePermission("activeclinic.facility.create"),
    async (req, res, next) => {
      try {
        const form = await loadActiveClinicCreateFacilityScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        return await renderShell(req, res, {
          activeNav: "facilities",
          content: "app/facility-form-content.ejs",
          pageHeader: {
            title: "Add facility",
            description: "Create a facility for this healthcare organization.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Facilities", href: "/app/facilities" },
            { label: "Add" },
          ],
          pageData: { form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/facilities",
    requireAuth,
    requirePermission("activeclinic.facility.create"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const values = parseFacilityFormBody(req.body);
        const auth = req.activeClinicAuth;
        const hco = auth.healthcareOrganization;
        if (!hco || !hco.id) {
          const form = await loadActiveClinicCreateFacilityScreen(getPool(), {
            auth,
            values,
            errors: ["Healthcare organization context is missing."],
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "facilities",
            content: "app/facility-form-content.ejs",
            pageHeader: { title: "Add facility", description: null, actions: [] },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Facilities", href: "/app/facilities" },
              { label: "Add" },
            ],
            pageData: { form },
          });
        }

        const created = await createFacility(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: hco.id,
          displayName: values.displayName,
          facilityKey: values.facilityKey,
          legalName: values.legalName || null,
          facilityType: values.facilityType,
          status: values.status,
          isPrimary: values.isPrimary,
          countryCode: values.countryCode,
          province: values.province || null,
          district: values.district || null,
          city: values.city || null,
          addressLine1: values.addressLine1 || null,
          addressLine2: values.addressLine2 || null,
          postalCode: values.postalCode || null,
          phone: values.phone,
          email: values.email || null,
          timezone: values.timezone,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!created.ok) {
          const fieldErrors = {};
          if (created.code === FACILITY_RESULT.DUPLICATE_KEY || created.code === FACILITY_RESULT.INVALID_KEY) {
            fieldErrors.facility_key = errorMessageForCode(created.code);
          }
          if (created.code === FACILITY_RESULT.INVALID_INPUT) {
            fieldErrors.phone = "Enter a valid phone number.";
          }
          const form = await loadActiveClinicCreateFacilityScreen(getPool(), {
            auth,
            values,
            errors: [errorMessageForCode(created.code)],
            fieldErrors,
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "facilities",
            content: "app/facility-form-content.ejs",
            pageHeader: { title: "Add facility", description: null, actions: [] },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Facilities", href: "/app/facilities" },
              { label: "Add" },
            ],
            pageData: { form },
          });
        }

        return res.redirect(
          303,
          `/app/facilities/${encodeURIComponent(created.facility.facilityKey)}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/facilities/:facilityKey/edit",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        const form = await loadActiveClinicEditFacilityScreen(getPool(), {
          auth: req.activeClinicAuth,
          facilityKey: req.params.facilityKey,
        });
        if (!form.ok) {
          return res.status(form.code === "access_denied" ? 403 : 404).type("html").send(
            renderSimpleState(
              form.code === "access_denied" ? "Access Restricted" : "Not found",
              form.code === "access_denied"
                ? "You do not have permission to edit this facility."
                : "That facility is not available.",
              {
                state: form.code === "access_denied" ? "access-denied" : "not-found",
                linkHref: "/app/facilities",
                linkLabel: "Back to facilities",
              }
            )
          );
        }
        return await renderShell(req, res, {
          activeNav: "facilities",
          content: "app/facility-form-content.ejs",
          pageHeader: {
            title: `Edit ${form.facility.displayName}`,
            description: "Update facility infrastructure details.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Facilities", href: "/app/facilities" },
            {
              label: form.facility.displayName,
              href: `/app/facilities/${encodeURIComponent(form.facility.facilityKey)}`,
            },
            { label: "Edit" },
          ],
          pageData: { form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/facilities/:facilityKey",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const detail = await loadActiveClinicFacilityDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          facilityKey: req.params.facilityKey,
        });
        if (!detail.ok || !detail.actions.canUpdate) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That facility is not available.", {
              state: "not-found",
              linkHref: "/app/facilities",
              linkLabel: "Back to facilities",
            })
          );
        }

        const values = parseFacilityFormBody(req.body);
        values.facilityKey = detail.facility.facilityKey;
        const patch = {
          displayName: values.displayName,
          legalName: values.legalName || null,
          facilityType: values.facilityType,
          status: values.status,
          countryCode: values.countryCode,
          province: values.province || null,
          district: values.district || null,
          city: values.city || null,
          addressLine1: values.addressLine1 || null,
          addressLine2: values.addressLine2 || null,
          postalCode: values.postalCode || null,
          phone: values.phone,
          email: values.email || null,
          timezone: values.timezone,
        };

        const updated = await updateFacility(getPool(), {
          id: detail.facility.id,
          organizationId: req.activeClinicAuth.organization.id,
          patch,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!updated.ok) {
          const form = await loadActiveClinicEditFacilityScreen(getPool(), {
            auth: req.activeClinicAuth,
            facilityKey: req.params.facilityKey,
            values,
            errors: [errorMessageForCode(updated.code)],
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "facilities",
            content: "app/facility-form-content.ejs",
            pageHeader: {
              title: `Edit ${detail.facility.displayName}`,
              description: null,
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Facilities", href: "/app/facilities" },
              { label: "Edit" },
            ],
            pageData: { form },
          });
        }

        return res.redirect(
          303,
          `/app/facilities/${encodeURIComponent(updated.facility.facilityKey)}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/facilities/:facilityKey",
    requireAuth,
    requirePermission("activeclinic.facility.view"),
    async (req, res, next) => {
      try {
        const detail = await loadActiveClinicFacilityDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          facilityKey: req.params.facilityKey,
        });
        if (!detail.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That facility is not available.", {
              state: "not-found",
              linkHref: "/app/facilities",
              linkLabel: "Back to facilities",
            })
          );
        }
        const f = detail.facility;
        const headerActions = [{ label: "All facilities", href: "/app/facilities", ghost: true }];
        if (detail.actions.editHref) {
          headerActions.unshift({ label: "Edit", href: detail.actions.editHref });
        }
        return await renderShell(req, res, {
          activeNav: "facilities",
          content: "app/facility-detail-content.ejs",
          pageHeader: {
            title: f.displayName,
            description: "Facility infrastructure details.",
            actions: headerActions,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Facilities", href: "/app/facilities" },
            { label: f.displayName },
          ],
          pageData: { detail },
          flash:
            req.query && req.query.saved === "1"
              ? { type: "success", message: "Facility saved." }
              : null,
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/facilities/:facilityKey/set-primary",
    requireAuth,
    requirePermission("activeclinic.facility.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const detail = await loadActiveClinicFacilityDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          facilityKey: req.params.facilityKey,
        });
        if (!detail.ok || !detail.actions.canSetPrimary) {
          return res.redirect(303, "/app/facilities");
        }
        const result = await setPrimaryFacility(getPool(), {
          id: detail.facility.id,
          organizationId: req.activeClinicAuth.organization.id,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/facilities/${encodeURIComponent(req.params.facilityKey)}`
          );
        }
        return res.redirect(303, "/app/facilities?primary=set");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/facilities/:facilityKey/archive",
    requireAuth,
    requirePermission("activeclinic.facility.archive"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        if (!(req.body && (req.body.confirm_archive === "1" || req.body.confirm_archive === "on"))) {
          return res.redirect(
            303,
            `/app/facilities/${encodeURIComponent(req.params.facilityKey)}`
          );
        }
        const detail = await loadActiveClinicFacilityDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          facilityKey: req.params.facilityKey,
        });
        if (!detail.ok || !detail.actions.canArchive) {
          return res.redirect(303, "/app/facilities");
        }

        const archived = await archiveFacility(getPool(), {
          id: detail.facility.id,
          organizationId: req.activeClinicAuth.organization.id,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!archived.ok) {
          return res.redirect(303, "/app/facilities");
        }

        const session = req.v5Session && req.v5Session.session;
        const selectedId =
          (req.activeClinicAuth.selectedFacility &&
            req.activeClinicAuth.selectedFacility.id) ||
          null;
        if (session && session.id && selectedId && String(selectedId) === String(detail.facility.id)) {
          await clearSessionContextKeys(getPool(), {
            sessionId: session.id,
            keys: ["selectedFacilityId"],
          });
        }

        return res.redirect(303, "/app/facilities?archived=1");
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicFacilityRoutes,
};
