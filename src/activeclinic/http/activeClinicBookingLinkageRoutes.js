"use strict";

/**
 * Staff routes: public booking patient-linkage review.
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
  loadBookingRequestsReviewScreen,
  loadBookingRequestDetailScreen,
} = require("../services/loadActiveClinicBookingLinkageScreens");
const {
  linkBookingToExistingPatient,
  createPatientFromBookingAndLink,
  RESULT: LINK_RESULT,
} = require("../services/activeClinicBookingPatientLinkageService");
const { PERM } = require("../services/activeClinicPatientService");
const { requirePlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapLinkError(code) {
  switch (code) {
    case LINK_RESULT.ACCESS_DENIED:
      return "You do not have permission to resolve patient linkage.";
    case LINK_RESULT.NOT_FOUND:
      return "Booking request not found.";
    case LINK_RESULT.PATIENT_NOT_FOUND:
      return "Patient not found in this organization.";
    case LINK_RESULT.ALREADY_LINKED:
      return "This booking is already linked to a different patient.";
    case LINK_RESULT.CROSS_TENANT:
      return "That patient belongs to another organization.";
    case LINK_RESULT.DUPLICATE_WARNING:
      return "Possible duplicate patients were found. Confirm before creating.";
    case LINK_RESULT.IDENTIFIER_CONFLICT:
      return "That identifier already belongs to another patient.";
    case LINK_RESULT.OVERRIDE_DENIED:
      return "You cannot override the duplicate warning.";
    default:
      return "Unable to update booking patient linkage.";
  }
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember && auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization && auth.organization.id,
  };
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicBookingLinkageRoutes(app, deps) {
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
      activeNav: options.activeNav || "reception",
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
    "/app/booking-requests",
    requireAuth,
    requirePermission(PERM.SEARCH),
    async (req, res, next) => {
      try {
        const loaded = await loadBookingRequestsReviewScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return renderSimpleState(res, {
            status: 403,
            state: "access-denied",
            linkHref: "/app",
            linkLabel: "Back to dashboard",
          });
        }
        return await renderShell(req, res, {
          activeNav: "reception",
          content: "app/booking-requests-content.ejs",
          pageHeader: {
            title: "Booking patient linkage",
            description: "Resolve clinic patient records for public booking requests.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception", href: "/app/reception" },
            { label: "Booking requests" },
          ],
          pageData: { bookingRequests: loaded.list },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/booking-requests/:bookingId",
    requireAuth,
    requirePermission(PERM.SEARCH),
    async (req, res, next) => {
      try {
        const bookingId = String(req.params.bookingId || "").trim();
        if (!UUID_RE.test(bookingId)) {
          return renderSimpleState(res, {
            status: 404,
            state: "not-found",
            linkHref: "/app/booking-requests",
            linkLabel: "Back",
          });
        }
        const loaded = await loadBookingRequestDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          bookingId,
        });
        if (!loaded.ok) {
          return renderSimpleState(res, {
            status: loaded.code === "access_denied" ? 403 : 404,
            state: loaded.code === "access_denied" ? "access-denied" : "not-found",
            linkHref: "/app/booking-requests",
            linkLabel: "Back",
          });
        }
        return await renderShell(req, res, {
          activeNav: "reception",
          content: "app/booking-request-detail-content.ejs",
          pageHeader: {
            title: loaded.detail.booking.requestNumber,
            description: "Review patient identity linkage for this booking.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Booking requests", href: "/app/booking-requests" },
            { label: loaded.detail.booking.requestNumber },
          ],
          pageData: { bookingDetail: loaded.detail },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/booking-requests/:bookingId/link",
    requireAuth,
    requirePermission(PERM.SEARCH),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, env)) {
          return res.status(403).type("html").send("Invalid CSRF token");
        }
        const bookingId = String(req.params.bookingId || "").trim();
        const patientId = String(req.body.patient_id || "").trim();
        const patientNumber = String(req.body.patient_number || "").trim();
        const auth = req.activeClinicAuth;
        let resolvedPatientId = patientId;

        if (!UUID_RE.test(resolvedPatientId) && patientNumber) {
          const {
            getPatientByOrgAndNumber,
          } = require("../services/activeClinicPatientService");
          const found = await getPatientByOrgAndNumber(getPool(), {
            organizationId: auth.organization.id,
            healthcareOrganizationId: auth.healthcareOrganization.id,
            patientNumber,
          });
          if (found.ok && found.patient) resolvedPatientId = found.patient.id;
        }

        const linked = await linkBookingToExistingPatient(getPool(), {
          organizationId: auth.organization.id,
          bookingId,
          patientId: resolvedPatientId,
          actor: actorFromAuth(auth),
          source: "staff_review",
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });
        if (!linked.ok) {
          const loaded = await loadBookingRequestDetailScreen(getPool(), {
            auth,
            bookingId,
            errors: [mapLinkError(linked.code)],
          });
          return await renderShell(req, res, {
            status: 400,
            activeNav: "reception",
            content: "app/booking-request-detail-content.ejs",
            pageHeader: {
              title: "Booking linkage",
              description: null,
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Booking requests", href: "/app/booking-requests" },
            ],
            pageData: { bookingDetail: loaded.ok ? loaded.detail : { errors: [mapLinkError(linked.code)] } },
          });
        }
        return res.redirect(303, `/app/booking-requests/${encodeURIComponent(bookingId)}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/booking-requests/:bookingId/create-patient",
    requireAuth,
    requirePermission([PERM.CREATE, PERM.QUICK_REGISTER]),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, env)) {
          return res.status(403).type("html").send("Invalid CSRF token");
        }
        const bookingId = String(req.params.bookingId || "").trim();
        const auth = req.activeClinicAuth;
        const created = await createPatientFromBookingAndLink(getPool(), {
          organizationId: auth.organization.id,
          bookingId,
          actor: actorFromAuth(auth),
          dateOfBirth: req.body.date_of_birth || null,
          sexAtRegistration: req.body.sex_at_registration || null,
          duplicateOverride: req.body.duplicate_override === "1",
          duplicateOverrideReason: String(req.body.duplicate_override_reason || "").trim(),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });
        if (!created.ok) {
          const loaded = await loadBookingRequestDetailScreen(getPool(), {
            auth,
            bookingId,
            errors: [mapLinkError(created.code)],
            flash: created.matches
              ? { tone: "warning", message: "Review possible matches before creating." }
              : null,
          });
          if (loaded.ok && created.matches) {
            loaded.detail.duplicateMatches = created.matches;
          }
          return await renderShell(req, res, {
            status: 400,
            activeNav: "reception",
            content: "app/booking-request-detail-content.ejs",
            pageHeader: {
              title: "Create patient from booking",
              description: null,
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Booking requests", href: "/app/booking-requests" },
            ],
            pageData: { bookingDetail: loaded.ok ? loaded.detail : { errors: [mapLinkError(created.code)] } },
          });
        }
        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(created.patient.patientNumber)}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicBookingLinkageRoutes,
};
