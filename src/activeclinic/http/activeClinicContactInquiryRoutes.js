"use strict";

/**
 * Staff routes: clinic contact inquiry review (AC Admin Console).
 * Routes under /app/operations/contact-inquiries.
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
  listPublicContactInquiriesForClinicAdmin,
  getPublicContactInquiryDetailForClinic,
  updatePublicContactInquiryStatusForClinicAdmin,
  RESULT,
} = require("../services/activeClinicPublicContactInquiryAdminService");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  NETWORK_ADMIN,
} = require("../services/activeClinicAuthorizationService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Permission check: reception.view, patient.search, or website.view
const CONTACT_INBOX_PERMISSIONS = [
  "activeclinic.reception.view",
  "activeclinic.patient.search",
  "website.view",
];

function mapStatusError(code) {
  switch (code) {
    case RESULT.ACCESS_DENIED:
      return "You do not have permission to view contact inquiries.";
    case RESULT.NOT_FOUND:
      return "Contact inquiry not found.";
    case RESULT.INVALID_STATUS:
      return "Invalid status.";
    default:
      return "Unable to process contact inquiry.";
  }
}

async function resolveOrgWide(pool, auth) {
  const roles = await accessRepo.listRoleAssignmentsForStaff(pool, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  return roles.some(
    (r) =>
      r.status === "active" &&
      (r.scope_type === "organisation" || r.role_key === NETWORK_ADMIN)
  );
}

/**
 * Resolve facility scope for staff member.
 * Org-wide roles see all facilities; otherwise restrict to active facility assignments.
 */
async function resolveFacilityScope(pool, auth) {
  if (!auth.staffMember || !auth.staffMember.id) {
    return { orgWide: false, facilityIds: [] };
  }
  if (await resolveOrgWide(pool, auth)) {
    return { orgWide: true, facilityIds: null };
  }
  const assignments = await accessRepo.listFacilitiesForStaff(pool, {
    staffMemberId: auth.staffMember.id,
    organizationId: auth.organization.id,
  });
  const facilityIds = (assignments || [])
    .filter((a) => a.status === "active")
    .map((a) => a.facility_id)
    .filter((id) => id && UUID_RE.test(String(id)));
  return {
    orgWide: false,
    facilityIds,
  };
}

async function assertInquiryFacilityAccess(pool, auth, inquiry) {
  if (!inquiry || !inquiry.facilityId) return true;
  const facilityScope = await resolveFacilityScope(pool, auth);
  if (facilityScope.orgWide || !facilityScope.facilityIds) return true;
  return facilityScope.facilityIds.includes(inquiry.facilityId);
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicContactInquiryRoutes(app, deps) {
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
      activeNav: options.activeNav || "contact_inquiries",
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

  /**
   * Deny platform/system admins without clinic staff eligibility.
   * Staff context is already resolved in auth middleware — if no staff, deny.
   */
  function denyIfNotClinicStaff(req, res) {
    const auth = req.activeClinicAuth;
    if (!auth || !auth.staffMember || !auth.organization) {
      return res.status(403).type("html").send(
        renderSimpleState(
          "Access Restricted",
          "You do not have access to clinic contact inquiries.",
          {
            state: "access-denied",
            linkHref: "/app",
            linkLabel: "Dashboard",
          }
        )
      );
    }
    return null;
  }

  function sendInquiryState(res, status, state, message) {
    return res.status(status).type("html").send(
      renderSimpleState(
        status === 404 ? "Not found" : "Access Restricted",
        message ||
          (status === 404
            ? "That contact inquiry could not be found."
            : "You do not have access to this contact inquiry."),
        {
          state,
          linkHref: "/app/operations/contact-inquiries",
          linkLabel: "Back",
        }
      )
    );
  }

  // GET /app/operations/contact-inquiries — list view
  app.get(
    "/app/operations/contact-inquiries",
    requireAuth,
    requirePermission(CONTACT_INBOX_PERMISSIONS),
    async (req, res, next) => {
      try {
        const denied = denyIfNotClinicStaff(req, res);
        if (denied) return denied;

        const auth = req.activeClinicAuth;
        const facilityScope = await resolveFacilityScope(getPool(), auth);

        // If selectedFacility is set, further narrow scope
        let effectiveFacilityIds = facilityScope.facilityIds;
        if (auth.selectedFacility && auth.selectedFacility.id) {
          if (
            Array.isArray(facilityScope.facilityIds) &&
            !facilityScope.facilityIds.includes(auth.selectedFacility.id)
          ) {
            effectiveFacilityIds = []; // no access
          } else if (!facilityScope.orgWide) {
            effectiveFacilityIds = [auth.selectedFacility.id];
          } else {
            effectiveFacilityIds = [auth.selectedFacility.id];
          }
        }

        if (
          !facilityScope.orgWide &&
          Array.isArray(effectiveFacilityIds) &&
          effectiveFacilityIds.length === 0
        ) {
          return await renderShell(req, res, {
            activeNav: "contact_inquiries",
            content: "app/contact-inquiries-content.ejs",
            pageHeader: {
              title: "Contact Inquiries",
              description: "Review public contact form submissions.",
              actions: [],
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Contact inquiries" },
            ],
            flash: null,
            pageData: {
              contactInquiries: {
                inquiries: [],
                filters: { status: req.query.status || "all" },
              },
              csrfField: CSRF_FIELD,
            },
          });
        }

        const listed = await listPublicContactInquiriesForClinicAdmin(getPool(), {
          organizationId: auth.organization.id,
          facilityIds: facilityScope.orgWide && !auth.selectedFacility ? null : effectiveFacilityIds,
          status: req.query.status || null,
        });

        return await renderShell(req, res, {
          activeNav: "contact_inquiries",
          content: "app/contact-inquiries-content.ejs",
          pageHeader: {
            title: "Contact Inquiries",
            description: "Review public contact form submissions.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Contact inquiries" },
          ],
          flash:
            req.query.ok === "status_updated"
              ? { type: "success", message: "Status updated." }
              : req.query.err
                ? { type: "error", message: mapStatusError(req.query.err) }
                : null,
          pageData: {
            contactInquiries: {
              inquiries: listed.ok ? listed.inquiries : [],
              filters: listed.filters,
            },
            csrfField: CSRF_FIELD,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // GET /app/operations/contact-inquiries/:id — detail view
  app.get(
    "/app/operations/contact-inquiries/:id",
    requireAuth,
    requirePermission(CONTACT_INBOX_PERMISSIONS),
    async (req, res, next) => {
      try {
        const denied = denyIfNotClinicStaff(req, res);
        if (denied) return denied;

        const auth = req.activeClinicAuth;
        const id = String(req.params.id || "").trim();
        if (!UUID_RE.test(id)) {
          return sendInquiryState(res, 404, "not-found");
        }

        const detail = await getPublicContactInquiryDetailForClinic(
          getPool(),
          id,
          auth.organization.id
        );
        if (!detail.ok) {
          return sendInquiryState(
            res,
            detail.code === RESULT.ACCESS_DENIED ? 403 : 404,
            detail.code === RESULT.ACCESS_DENIED ? "access-denied" : "not-found"
          );
        }

        if (!(await assertInquiryFacilityAccess(getPool(), auth, detail.inquiry))) {
          return sendInquiryState(res, 403, "access-denied");
        }

        return await renderShell(req, res, {
          activeNav: "contact_inquiries",
          content: "app/contact-inquiry-detail-content.ejs",
          pageHeader: {
            title: "Contact Inquiry",
            description: null,
            actions: [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Contact inquiries", href: "/app/operations/contact-inquiries" },
            { label: detail.inquiry.senderName || "Inquiry" },
          ],
          flash:
            req.query.ok === "status_updated"
              ? { type: "success", message: "Status updated." }
              : req.query.err
                ? { type: "error", message: mapStatusError(req.query.err) }
                : null,
          pageData: {
            inquiry: detail.inquiry,
            csrfField: CSRF_FIELD,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // POST /app/operations/contact-inquiries/:id/status — update status
  app.post(
    "/app/operations/contact-inquiries/:id/status",
    requireAuth,
    requirePermission(CONTACT_INBOX_PERMISSIONS),
    async (req, res, next) => {
      try {
        const denied = denyIfNotClinicStaff(req, res);
        if (denied) return denied;

        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.redirect(
            303,
            "/app/operations/contact-inquiries?err=csrf"
          );
        }

        const auth = req.activeClinicAuth;
        const id = String(req.params.id || "").trim();
        if (!UUID_RE.test(id)) {
          return res.redirect(
            303,
            "/app/operations/contact-inquiries?err=not_found"
          );
        }

        const detail = await getPublicContactInquiryDetailForClinic(
          getPool(),
          id,
          auth.organization.id
        );
        if (!detail.ok) {
          return res.redirect(
            303,
            `/app/operations/contact-inquiries?err=${encodeURIComponent(detail.code)}`
          );
        }
        if (!(await assertInquiryFacilityAccess(getPool(), auth, detail.inquiry))) {
          return res.redirect(303, "/app/operations/contact-inquiries?err=access_denied");
        }

        const result = await updatePublicContactInquiryStatusForClinicAdmin(
          getPool(),
          id,
          auth.organization.id,
          { status: req.body && req.body.status }
        );
        if (!result.ok) {
          return res.redirect(
            303,
            `/app/operations/contact-inquiries/${encodeURIComponent(id)}?err=${encodeURIComponent(result.code)}`
          );
        }
        return res.redirect(
          303,
          `/app/operations/contact-inquiries/${encodeURIComponent(id)}?ok=status_updated`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicContactInquiryRoutes,
};
