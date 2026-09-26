"use strict";

/**
 * ActiveClinic Batch 1A ops config routes (ACN02–ACN05).
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const { createRequireActiveClinicAuth } = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const { renderActiveClinicAppPage } = require("./renderActiveClinicShell");
const {
  listOpsServices,
  getOpsService,
  saveOpsService,
} = require("../services/activeClinicOpsCatalogueService");
const {
  listPractitioners,
  getPractitionerWorkspace,
  savePractitionerWorkspace,
  cancelPractitionerBlock,
} = require("../services/activeClinicPractitionerConfigService");

function authContext(auth) {
  return {
    organizationId: auth.organization && auth.organization.id,
    healthcareOrganizationId:
      auth.healthcareOrganization && auth.healthcareOrganization.id,
    facilityId: auth.selectedFacility && auth.selectedFacility.id,
    permissions: auth.permissions || [],
    staffId: auth.staffMember && auth.staffMember.id,
  };
}

function registerActiveClinicOpsConfigRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction === true;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res, req);
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
    "/app/services",
    requireAuth,
    requirePermission(["website.view", "website.edit"]),
    async (req, res, next) => {
      try {
        const ctx = authContext(req.activeClinicAuth);
        const listed = await listOpsServices(getPool(), {
          ...ctx,
          query: req.query,
        });
        if (!listed.ok) {
          return res.status(listed.httpStatus || 403).type("html").send(
            renderSimpleState(
              "Services unavailable",
              "You do not have permission to view the services catalogue.",
              { linkHref: "/app", linkLabel: "Back to dashboard", state: "access-denied" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "services",
          content: "app/services-catalogue-content.ejs",
          pageHeader: {
            title: "Services & Pricing Catalogue",
            subtitle:
              "Configure clinical services, consultation pricing, practitioner allocations, and online booking availability.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Services & Pricing" },
          ],
          pageData: { catalogue: listed, csrfField: CSRF_FIELD },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/services/new",
    requireAuth,
    requirePermission("website.edit"),
    async (req, res, next) => {
      try {
        const ctx = authContext(req.activeClinicAuth);
        const listed = await listOpsServices(getPool(), { ...ctx, query: {} });
        return renderShell(req, res, {
          activeNav: "services",
          content: "app/service-editor-content.ejs",
          pageHeader: {
            title: "Add service",
            subtitle: "Create a bookable clinical service with pricing and practitioners.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Services & Pricing", href: "/app/services" },
            { label: "Add service" },
          ],
          pageData: {
            editor: {
              mode: "create",
              service: {
                name: "",
                description: "",
                defaultDurationMinutes: 30,
                currencyCode: "ZMW",
                active: true,
                publicBookable: false,
                publicWebsiteVisible: false,
                amountMinor: null,
              },
              assignedStaffIds: [],
              facilities: listed.ok ? listed.filterOptions.facilities : [],
              staffOptions: listed.ok ? listed.staffOptions : [],
              canEdit: true,
            },
            csrfField: CSRF_FIELD,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/services/:serviceId/edit",
    requireAuth,
    requirePermission(["website.view", "website.edit"]),
    async (req, res, next) => {
      try {
        const ctx = authContext(req.activeClinicAuth);
        const got = await getOpsService(getPool(), {
          ...ctx,
          serviceId: req.params.serviceId,
        });
        if (!got.ok) {
          return res.status(got.httpStatus || 404).type("html").send(
            renderSimpleState(
              "Service not found",
              "That service is not available in this clinic.",
              { linkHref: "/app/services", linkLabel: "Back to catalogue", state: "not-found" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "services",
          content: "app/service-editor-content.ejs",
          pageHeader: {
            title: got.service.name,
            subtitle: "Edit service identity, pricing, locations, and practitioners.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Services & Pricing", href: "/app/services" },
            { label: "Edit service" },
          ],
          flash:
            req.query.ok === "1"
              ? { type: "success", message: "Service saved." }
              : req.query.err === "1"
                ? { type: "error", message: "Could not save service." }
                : null,
          pageData: {
            editor: { mode: "edit", ...got },
            csrfField: CSRF_FIELD,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/services",
    requireAuth,
    requirePermission("website.edit"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("text").send("CSRF validation failed.");
        }
        const ctx = authContext(req.activeClinicAuth);
        const saved = await saveOpsService(getPool(), {
          ...ctx,
          body: req.body,
          displayName: req.body.displayName || req.body.name,
          description: req.body.description,
          defaultDurationMinutes: req.body.defaultDurationMinutes,
          status: req.body.status,
          publicBookable: req.body.publicBookable,
          publicWebsiteVisible: req.body.publicWebsiteVisible,
          priceMajor: req.body.priceMajor,
          followUpPriceMajor: req.body.followUpPriceMajor,
          currencyCode: req.body.currencyCode,
          bufferMinutes: req.body.bufferMinutes,
          facilityId: req.body.facilityId,
          staffMemberIds: req.body.staffMemberIds,
          serviceKey: req.body.serviceKey,
        });
        if (!saved.ok) {
          return res.redirect(303, "/app/services/new?err=1");
        }
        return res.redirect(
          303,
          `/app/services/${encodeURIComponent(saved.service.id)}/edit?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/services/:serviceId",
    requireAuth,
    requirePermission("website.edit"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("text").send("CSRF validation failed.");
        }
        const ctx = authContext(req.activeClinicAuth);
        const saved = await saveOpsService(getPool(), {
          ...ctx,
          body: req.body,
          serviceId: req.params.serviceId,
          displayName: req.body.displayName || req.body.name,
          description: req.body.description,
          defaultDurationMinutes: req.body.defaultDurationMinutes,
          status: req.body.status,
          publicBookable: req.body.publicBookable,
          publicWebsiteVisible: req.body.publicWebsiteVisible,
          priceMajor: req.body.priceMajor,
          followUpPriceMajor: req.body.followUpPriceMajor,
          currencyCode: req.body.currencyCode,
          bufferMinutes: req.body.bufferMinutes,
          facilityId: req.body.facilityId,
          staffMemberIds: req.body.staffMemberIds,
        });
        if (!saved.ok) {
          return res.redirect(
            303,
            `/app/services/${encodeURIComponent(req.params.serviceId)}/edit?err=1`
          );
        }
        return res.redirect(
          303,
          `/app/services/${encodeURIComponent(saved.service.id)}/edit?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/practitioners",
    requireAuth,
    requirePermission("activeclinic.staff.view"),
    async (req, res, next) => {
      try {
        const ctx = authContext(req.activeClinicAuth);
        const listed = await listPractitioners(getPool(), {
          ...ctx,
          query: req.query,
        });
        if (!listed.ok) {
          return res.status(listed.httpStatus || 403).type("html").send(
            renderSimpleState(
              "Practitioners unavailable",
              "You do not have permission to view practitioners.",
              { linkHref: "/app", linkLabel: "Back to dashboard", state: "access-denied" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "practitioners",
          content: "app/practitioners-directory-content.ejs",
          pageHeader: {
            title: "Practitioners Directory",
            subtitle:
              "Manage clinical practitioners, credentials, locations, availability, and public booking visibility.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Practitioners" },
          ],
          pageData: { directory: listed, csrfField: CSRF_FIELD },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/practitioners/:staffId",
    requireAuth,
    requirePermission("activeclinic.staff.view"),
    async (req, res, next) => {
      try {
        const ctx = authContext(req.activeClinicAuth);
        const workspace = await getPractitionerWorkspace(getPool(), {
          ...ctx,
          staffId: req.params.staffId,
        });
        if (!workspace.ok) {
          return res.status(workspace.httpStatus || 404).type("html").send(
            renderSimpleState(
              "Practitioner not found",
              "That practitioner profile is not available.",
              {
                linkHref: "/app/practitioners",
                linkLabel: "Back to directory",
                state: "not-found",
              }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "practitioners",
          content: "app/practitioner-workspace-content.ejs",
          pageHeader: {
            title: workspace.practitioner.displayName,
            subtitle: "Profile, credentials, weekly schedule, and leave blocks.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Practitioners", href: "/app/practitioners" },
            { label: workspace.practitioner.displayName },
          ],
          flash:
            req.query.ok === "1"
              ? {
                  type: "success",
                  message: "Practitioner profile and availability saved.",
                }
              : req.query.err === "1"
                ? { type: "error", message: "Could not save practitioner." }
                : null,
          pageData: { workspace, csrfField: CSRF_FIELD },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/practitioners/:staffId",
    requireAuth,
    requirePermission("activeclinic.staff.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("text").send("CSRF validation failed.");
        }
        const ctx = authContext(req.activeClinicAuth);
        const saved = await savePractitionerWorkspace(getPool(), {
          ...ctx,
          staffId: req.params.staffId,
          body: req.body,
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          displayName: req.body.displayName,
          jobTitle: req.body.jobTitle,
          phone: req.body.phone || req.body.phoneDisplay,
          email: req.body.email || req.body.emailDisplay,
          credentialsText: req.body.credentialsText,
          licenseNumber: req.body.licenseNumber,
          specialtiesText: req.body.specialtiesText,
          publicBookable: req.body.publicBookable,
          publicProfileEnabled: req.body.publicProfileEnabled,
          publicBio: req.body.publicBio,
          blockStartsAt: req.body.blockStartsAt,
          blockEndsAt: req.body.blockEndsAt,
          blockKind: req.body.blockKind,
          blockReason: req.body.blockReason,
          actorStaffId: ctx.staffId,
        });
        if (!saved.ok) {
          return res.redirect(
            303,
            `/app/practitioners/${encodeURIComponent(req.params.staffId)}?err=1`
          );
        }
        return res.redirect(
          303,
          `/app/practitioners/${encodeURIComponent(req.params.staffId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/practitioners/:staffId/blocks/:blockId/cancel",
    requireAuth,
    requirePermission("activeclinic.staff.update"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("text").send("CSRF validation failed.");
        }
        const ctx = authContext(req.activeClinicAuth);
        await cancelPractitionerBlock(getPool(), {
          ...ctx,
          staffId: req.params.staffId,
          blockId: req.params.blockId,
          body: req.body,
        });
        return res.redirect(
          303,
          `/app/practitioners/${encodeURIComponent(req.params.staffId)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicOpsConfigRoutes,
};
