"use strict";

/**
 * ActiveClinic Platform Admin contact inquiry review.
 * Routes for platform-level contact form submissions (activeclinic.platform_contact_inquiries).
 */

const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  listPlatformContactInquiriesForAdmin,
  getPlatformContactInquiryDetail,
  updatePlatformContactInquiryStatusForAdmin,
} = require("../services/activeClinicPlatformContactInquiryAdminService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function inquiryDetailPath(id) {
  return `/admin/activeclinic/contact-inquiries/${encodeURIComponent(id)}`;
}

/**
 * Register platform admin routes for AC contact inquiries.
 * @param {import('express').Router} router
 * @param {object} deps
 */
function registerActiveClinicPlatformAdminContactInquiryRoutes(router, deps) {
  const {
    getPool,
    env,
    requireApex,
    requirePlatformAdmin,
    renderPlatformAdminView,
    buildPlatformAdminShellLocals,
    setAdminNoStore,
  } = deps;

  const isProduction = String(env.NODE_ENV || "") === "production";

  // GET /admin/activeclinic/contact-inquiries — list view
  router.get(
    "/admin/activeclinic/contact-inquiries",
    requireApex,
    requirePlatformAdmin,
    async (req, res, next) => {
      try {
        setAdminNoStore(res);
        const listed = await listPlatformContactInquiriesForAdmin(getPool(), {
          status: req.query.status,
        });
        const html = renderPlatformAdminView("platform-admin/ac-contact-inquiries.ejs", {
          ...buildPlatformAdminShellLocals(req, res, {
            env,
            isProduction,
            activeNav: "ac-contact-inquiries",
            pageTitle: "AC Contact Inquiries",
          }),
          inquiries: listed.inquiries,
          filters: listed.filters,
          notice: String(req.query.notice || ""),
          error: String(req.query.error || ""),
        });
        return res.status(200).type("html").send(html);
      } catch (err) {
        return next(err);
      }
    }
  );

  // GET /admin/activeclinic/contact-inquiries/:id — detail view
  router.get(
    "/admin/activeclinic/contact-inquiries/:id",
    requireApex,
    requirePlatformAdmin,
    async (req, res, next) => {
      try {
        setAdminNoStore(res);
        const id = String(req.params.id || "").trim();
        if (!UUID_RE.test(id)) {
          return res.redirect(303, "/admin/activeclinic/contact-inquiries?error=not_found");
        }
        const detail = await getPlatformContactInquiryDetail(getPool(), id);
        if (!detail.ok) {
          return res.redirect(303, "/admin/activeclinic/contact-inquiries?error=not_found");
        }
        const html = renderPlatformAdminView("platform-admin/ac-contact-inquiry-detail.ejs", {
          ...buildPlatformAdminShellLocals(req, res, {
            env,
            isProduction,
            activeNav: "ac-contact-inquiries",
            pageTitle: "Contact Inquiry",
          }),
          inquiry: detail.inquiry,
          notice: String(req.query.notice || ""),
          error: String(req.query.error || ""),
        });
        return res.status(200).type("html").send(html);
      } catch (err) {
        return next(err);
      }
    }
  );

  // POST /admin/activeclinic/contact-inquiries/:id/status — update status
  router.post(
    "/admin/activeclinic/contact-inquiries/:id/status",
    requireApex,
    requirePlatformAdmin,
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.redirect(303, "/admin/activeclinic/contact-inquiries?error=csrf");
        }
        const id = String(req.params.id || "").trim();
        if (!UUID_RE.test(id)) {
          return res.redirect(303, "/admin/activeclinic/contact-inquiries?error=not_found");
        }
        const result = await updatePlatformContactInquiryStatusForAdmin(getPool(), id, {
          status: req.body && req.body.status,
        });
        if (!result.ok) {
          return res.redirect(
            303,
            `${inquiryDetailPath(id)}?error=${encodeURIComponent(result.code)}`
          );
        }
        return res.redirect(303, `${inquiryDetailPath(id)}?notice=status_updated`);
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicPlatformAdminContactInquiryRoutes,
};
