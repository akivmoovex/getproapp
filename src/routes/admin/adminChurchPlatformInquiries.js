"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const platformInquiriesRepo = require("../../db/pg/church/platformInquiriesRepo");
const {
  INQUIRY_STATUS_OPTIONS,
  INQUIRY_TYPES,
  validatePlatformInquiryStatusUpdate,
  inquiryStatusLabel,
  inquiryTypeLabel,
} = require("../../church/platformInquiryValidation");
const { requirePlatformAdminCsrf } = require("../../church/platformAdminCsrf");

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { hour12: false });
}

function parseListFilters(query) {
  const inquiryType = String(query.inquiry_type || "all").trim().toLowerCase();
  const status = String(query.status || "all").trim().toLowerCase();
  return {
    inquiry_type: INQUIRY_TYPES.includes(inquiryType) ? inquiryType : "all",
    status: INQUIRY_STATUS_OPTIONS.includes(status) ? status : "all",
  };
}

function buildListQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.inquiry_type && filters.inquiry_type !== "all") {
    params.set("inquiry_type", filters.inquiry_type);
  }
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  const qs = params.toString();
  return qs ? `/admin/church/platform-inquiries?${qs}` : "/admin/church/platform-inquiries";
}

module.exports = function registerAdminChurchPlatformInquiriesRoutes(router) {
  router.get("/church/platform-inquiries", requireSuperAdmin, async (req, res, next) => {
    try {
      const filters = parseListFilters(req.query);
      const pool = getPgPool();
      const items = await platformInquiriesRepo.listPlatformInquiries(pool, filters);
      const newCount = await platformInquiriesRepo.countNewPlatformInquiries(pool);

      return res.render("admin/church/platform_inquiries", {
        items,
        filters,
        newCount,
        inquiryTypes: INQUIRY_TYPES,
        inquiryStatuses: INQUIRY_STATUS_OPTIONS,
        inquiryStatusLabel,
        inquiryTypeLabel,
        formatDateTime,
        buildListQueryString,
        activeNav: "church_platform_inquiries",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/church/platform-inquiries/:inquiryId", requireSuperAdmin, async (req, res, next) => {
    try {
      const inquiryId = Number(req.params.inquiryId);
      if (!Number.isInteger(inquiryId) || inquiryId < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const pool = getPgPool();
      const inquiry = await platformInquiriesRepo.findPlatformInquiryById(pool, inquiryId);
      if (!inquiry) {
        return res.status(404).type("text").send("Not found.");
      }

      const returnTo = buildListQueryString(parseListFilters(req.query));
      return res.render("admin/church/platform_inquiry_detail", {
        inquiry,
        returnTo,
        inquiryStatuses: INQUIRY_STATUS_OPTIONS,
        inquiryStatusLabel,
        inquiryTypeLabel,
        formatDateTime,
        statusError: null,
        activeNav: "church_platform_inquiries",
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    "/church/platform-inquiries/:inquiryId/status",
    requireSuperAdmin,
    requirePlatformAdminCsrf,
    async (req, res, next) => {
      try {
        const inquiryId = Number(req.params.inquiryId);
        if (!Number.isInteger(inquiryId) || inquiryId < 1) {
          return res.status(404).type("text").send("Not found.");
        }
        const validation = validatePlatformInquiryStatusUpdate(req.body);
        const pool = getPgPool();
        const inquiry = await platformInquiriesRepo.findPlatformInquiryById(pool, inquiryId);
        if (!inquiry) {
          return res.status(404).type("text").send("Not found.");
        }
        if (!validation.ok) {
          return res.status(400).render("admin/church/platform_inquiry_detail", {
            inquiry,
            returnTo: buildListQueryString(parseListFilters(req.query)),
            inquiryStatuses: INQUIRY_STATUS_OPTIONS,
            inquiryStatusLabel,
            inquiryTypeLabel,
            formatDateTime,
            statusError: validation.error,
            activeNav: "church_platform_inquiries",
          });
        }

        const updated = await platformInquiriesRepo.updatePlatformInquiryStatus(
          pool,
          inquiryId,
          validation.status
        );
        if (!updated) {
          return res.status(404).type("text").send("Not found.");
        }
        return res.redirect(303, `/admin/church/platform-inquiries/${inquiryId}`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
