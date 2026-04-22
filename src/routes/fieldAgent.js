"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { getPgPool } = require("../db/pg");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../db/pg/fieldAgentSubmissionsRepo");
const fieldAgentCallbackLeadsRepo = require("../db/pg/fieldAgentCallbackLeadsRepo");
const {
  getFieldAgentSession,
  setFieldAgentSession,
  clearFieldAgentSession,
  authenticateFieldAgent,
  requireFieldAgent,
} = require("../auth/fieldAgentAuth");
const phoneRulesService = require("../phone/phoneRulesService");
const { saveJpegImages, MAX_IMAGE_BYTES } = require("../fieldAgent/fieldAgentUploads");
const fieldAgentCrm = require("../fieldAgent/fieldAgentCrm");
const { fieldAgentLoginLimiter, fieldAgentAuthedPostLimiter } = require("../middleware/authRateLimit");
const { getTenantCitiesForClientAsync, getJoinCityWatermarkRotateAsync } = require("../tenants/tenantCities");
const categoriesRepo = require("../db/pg/categoriesRepo");
const companiesRepo = require("../db/pg/companiesRepo");
const fieldAgentLeadFeeCommissionRepo = require("../db/pg/fieldAgentLeadFeeCommissionRepo");
const fieldAgentEcCommissionRepo = require("../db/pg/fieldAgentEcCommissionRepo");
const fieldAgentSpRatingRepo = require("../db/pg/fieldAgentSpRatingRepo");
const fieldAgentPayRunRepo = require("../db/pg/fieldAgentPayRunRepo");
const fieldAgentPayRunDisputesRepo = require("../db/pg/fieldAgentPayRunDisputesRepo");
const fieldAgentPayRunAdjustmentsRepo = require("../db/pg/fieldAgentPayRunAdjustmentsRepo");
const fieldAgentSubmissionAuditRepo = require("../db/pg/fieldAgentSubmissionAuditRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");
const { getCommerceSettingsForTenant, commerceCurrencyCodeUpper } = require("../tenants/tenantCommerceSettings");
const { buildStatementDetailFromSnapshotRow } = require("../fieldAgent/fieldAgentStatementPayload");
const {
  computeSpCommissionQualityPayable,
  formatFieldAgentMoneyAmount,
} = require("../fieldAgent/fieldAgentSpCommissionQualityPayable");
const { computeEcCommissionQualityPayableHoldbackOnly } = require("../fieldAgent/fieldAgentEcCommissionQualityPayable");
const { normalizeSpRatingThresholdsForTenant } = require("../fieldAgent/normalizeSpRatingThresholds");
const { FIELD_AGENT_DASHBOARD } = require("../auth/postLoginDestinations");
const { buildCompanyPageLocals } = require("../companies/companyPageRender");
const { mergeDraftCompanyForPreviewAsync } = require("./admin/adminShared");

function tenantPrefix(req) {
  return req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
}

function tenantHomeHrefFromPrefix(prefix) {
  if (prefix === "" || prefix == null) return "/";
  const ps = String(prefix);
  if (ps.startsWith("http")) return `${ps.replace(/\/$/, "")}/`;
  return `${ps}/`;
}

function formatStatementMoney(amount, currencySymbol, currencyCode) {
  return formatFieldAgentMoneyAmount(amount, currencySymbol, currencyCode);
}

async function verifyPayRunItemEligibleForDispute(pool, { tenantId, payRunId, payRunItemId, fieldAgentId }) {
  const r = await pool.query(
    `
    SELECT i.id
    FROM public.field_agent_pay_run_items i
    INNER JOIN public.field_agent_pay_runs pr ON pr.id = i.pay_run_id AND pr.tenant_id = i.tenant_id
    WHERE i.id = $1 AND i.tenant_id = $2 AND i.field_agent_id = $3 AND i.pay_run_id = $4
      AND pr.status IN ('approved', 'paid')
    `,
    [payRunItemId, tenantId, fieldAgentId, payRunId]
  );
  return r.rows[0] ?? null;
}

function renderLocals(req, res, extra) {
  const prefix = tenantPrefix(req);
  const tenant = req.tenant;
  const showRegionPickerUi = !!req.isApexHost || (!!tenant && tenant.slug === "global");
  return {
    tenant,
    tenantUrlPrefix: prefix,
    tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
    /** Public marketing home can 503 when tenant is not Enabled; use sign-in hub for safe navigation. */
    fieldAgentExitHomeHref:
      typeof res.locals.opsHref === "function" ? res.locals.opsHref("/login") : "/login",
    asset: res.locals.asset,
    brandProductName: res.locals.brandProductName,
    brandPublicTagline: res.locals.brandPublicTagline,
    regionChoices: req.regionChoices || [],
    regionZmUrl: req.regionZmUrl || "",
    regionIlUrl: req.regionIlUrl || "",
    isApexHost: !!req.isApexHost,
    showRegionPickerUi,
    renderRegionPickerTrigger: false,
    ...extra,
  };
}

/**
 * Add-contact + resubmit: required identity/address fields (trimmed strings; empty fails).
 * Mirrors product rules: PACRA plus full street-level address lines and city, with NRC and profession.
 */
function fieldAgentProviderCoreFieldsMissing(p) {
  return (
    !p.firstName ||
    !p.lastName ||
    !p.profession ||
    !p.pacra ||
    !p.addressStreet ||
    !p.addressLandmarks ||
    !p.addressNeighbourhood ||
    !p.addressCity ||
    !p.nrcNumber
  );
}

/** Server-side email check for callback form (no new deps): local@host.tld, no spaces. */
function isPlausibleEmail(raw, maxLen = 320) {
  const s = String(raw || "").trim();
  if (!s || s.length > maxLen) return false;
  if (/\s|["<>]/.test(s)) return false;
  const at = s.indexOf("@");
  if (at < 1 || at !== s.lastIndexOf("@")) return false;
  const local = s.slice(0, at);
  const host = s.slice(at + 1);
  if (!local || !host || !host.includes(".")) return false;
  const tld = host.slice(host.lastIndexOf(".") + 1);
  if (tld.length < 2) return false;
  return true;
}

function parseEstablishedYearOrError(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d{4}$/.test(s)) {
    return { ok: false, error: "Established in year must be exactly 4 digits." };
  }
  const n = Number(s);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isFinite(n) || n < 1800 || n > currentYear) {
    return { ok: false, error: `Established in year must be between 1800 and ${currentYear}.` };
  }
  return { ok: true, value: n };
}

function normalizeWebsiteDraftInputForFieldAgent(draft, row) {
  const payload = draft && typeof draft === "object" && !Array.isArray(draft) ? { ...draft } : {};
  const existingDraft = fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(row.website_listing_draft_json);
  payload.listing_phone = String(existingDraft.listing_phone || row.phone_raw || "")
    .trim()
    .slice(0, 120);
  return payload;
}

function parseSpecialitiesFromDraft(draft) {
  const raw = draft && Array.isArray(draft.specialities) ? draft.specialities : [];
  return fieldAgentSubmissionsRepo.normalizeSpecialityNames(raw);
}

function parseWeeklyHoursFromDraft(draft) {
  const raw = draft && draft.weekly_hours && typeof draft.weekly_hours === "object" ? draft.weekly_hours : {};
  return fieldAgentSubmissionsRepo.normalizeWebsiteWeeklyHours(raw);
}

function validateWeeklyHours(weeklyHours) {
  const weekly = fieldAgentSubmissionsRepo.normalizeWebsiteWeeklyHours(weeklyHours);
  for (const day of Object.keys(weekly)) {
    const row = weekly[day];
    if (row.closed) continue;
    if (!row.from || !row.to) {
      return { ok: false, error: "For each open day, both from and to times are required." };
    }
    if (row.from >= row.to) {
      return { ok: false, error: "Open time must be before close time." };
    }
  }
  return { ok: true };
}

module.exports = function fieldAgentRoutes() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.tenant || !req.tenant.id) {
      return res.status(404).type("text").send("Region not found.");
    }
    next();
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 20 },
  });

  router.get("/field-agent/signup", (req, res) => {
    if (getFieldAgentSession(req)) {
      return res.redirect(302, `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}`);
    }
    return res.render("field_agent/signup", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/signup", fieldAgentLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const username = String((req.body && req.body.username) || "")
      .trim()
      .toLowerCase();
    const password = String((req.body && req.body.password) || "");
    const displayName = String((req.body && req.body.display_name) || "").trim().slice(0, 120);
    if (!username || username.length < 2) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Username is required." }));
    }
    if (!password || password.length < 4) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Password must be at least 4 characters." }));
    }
    const existing = await fieldAgentsRepo.getByUsernameAndTenant(pool, username, tid);
    if (existing) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Username already registered." }));
    }
    const hash = await bcrypt.hash(password, 12);
    const id = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: tid,
      username,
      passwordHash: hash,
      displayName,
      phone: "",
    });
    setFieldAgentSession(req, { id, tenantId: tid, username, displayName });
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}`));
  });

  router.get("/field-agent/login", (req, res) => {
    if (getFieldAgentSession(req)) {
      return res.redirect(302, `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}`);
    }
    return res.render("field_agent/login", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/login", fieldAgentLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const username = String((req.body && req.body.username) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const user = await authenticateFieldAgent(pool, username, password, tid);
    if (!user) {
      return res.status(400).render("field_agent/login", renderLocals(req, res, { error: "Invalid username or password." }));
    }
    setFieldAgentSession(req, {
      id: user.id,
      tenantId: tid,
      username: user.username,
      displayName: user.display_name || "",
    });
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}`));
  });

  router.post("/field-agent/logout", (req, res) => {
    clearFieldAgentSession(req);
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}/`));
  });

  router.get("/field-agent/dashboard", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const metricPending = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "pending");
    const metricInfoNeeded = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "info_needed");
    const metricApproved = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "approved");
    const metricRejected = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "rejected");
    const metricAppealed = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "appealed");
    const recruitmentCommission30 = await fieldAgentSubmissionsRepo.sumCommissionLastDays(pool, s.id, 30);
    const commerce = await getCommerceSettingsForTenant(pool, tid);
    const faPctRaw = commerce && commerce.field_agent_sp_commission_percent;
    const faPct =
      faPctRaw != null && Number.isFinite(Number(faPctRaw)) ? Math.min(100, Math.max(0, Number(faPctRaw))) : 0;
    const ecPctRaw = commerce && commerce.field_agent_ec_commission_percent;
    const ecPct =
      ecPctRaw != null && Number.isFinite(Number(ecPctRaw)) ? Math.min(100, Math.max(0, Number(ecPctRaw))) : 0;
    const sumLeadFees30 = await fieldAgentLeadFeeCommissionRepo.sumDealPriceCollectedLastDaysForAccountManagerFieldAgent(
      pool,
      tid,
      s.id,
      30
    );
    const metricSpCommission30 = Math.round(sumLeadFees30 * (faPct / 100) * 100) / 100;
    const sumEcBase30 =
      await fieldAgentEcCommissionRepo.sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
        pool,
        tid,
        s.id,
        30
      );
    const metricEcCommission30 = Math.round(sumEcBase30 * (ecPct / 100) * 100) / 100;
    const metricLinkedSpCount = await companiesRepo.countCompaniesByAccountManagerFieldAgent(pool, tid, s.id);
    const rawSpRating30 = await fieldAgentSpRatingRepo.getAvgRatingLastDaysForAccountManagerFieldAgent(pool, tid, s.id, 30);
    const spRatingThresholds = normalizeSpRatingThresholdsForTenant(commerce);
    let metricSpRating30Display = "—";
    let metricSpRating30Band = "neutral";
    if (rawSpRating30 != null && Number.isFinite(Number(rawSpRating30))) {
      const v = Number(rawSpRating30);
      metricSpRating30Display = v.toFixed(1);
      if (v >= spRatingThresholds.high) metricSpRating30Band = "high";
      else if (v < spRatingThresholds.low) metricSpRating30Band = "low";
      else metricSpRating30Band = "neutral";
    }
    const bonusPctRaw = commerce && commerce.field_agent_sp_high_rating_bonus_percent;
    const spQualityPayable = computeSpCommissionQualityPayable({
      earnedSpCommission30: metricSpCommission30,
      avgRating30: rawSpRating30,
      bonusPercent: bonusPctRaw,
      lowThreshold: spRatingThresholds.low,
      highThreshold: spRatingThresholds.high,
    });
    const ecQualityPayable = computeEcCommissionQualityPayableHoldbackOnly({
      earnedEcCommission30: metricEcCommission30,
      avgRating30: rawSpRating30,
      lowThreshold: spRatingThresholds.low,
    });
    const faCurrencyCode = commerceCurrencyCodeUpper(commerce);
    const faCurrencySymbol =
      commerce && commerce.currency_symbol != null && String(commerce.currency_symbol).trim()
        ? String(commerce.currency_symbol).trim().slice(0, 16)
        : "";
    const spQualityPayableDisplay = {
      earnedDisplay: formatFieldAgentMoneyAmount(
        spQualityPayable.earnedSpCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      bonusDisplay: formatFieldAgentMoneyAmount(
        spQualityPayable.highRatingBonusSpCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      payableDisplay: formatFieldAgentMoneyAmount(
        spQualityPayable.payableSpCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      adjustmentDisplay: formatFieldAgentMoneyAmount(
        spQualityPayable.qualityAdjustmentSpCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      withheldDisplay: formatFieldAgentMoneyAmount(
        spQualityPayable.withheldSpCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      ...spQualityPayable,
    };
    const spRatingThresholdLowDisplay = spRatingThresholds.low.toFixed(1);
    const spRatingThresholdHighDisplay = spRatingThresholds.high.toFixed(1);
    const spPayableBreakdownPayload = {
      spRatingDisplay: metricSpRating30Display,
      lowThresholdDisplay: spRatingThresholdLowDisplay,
      highThresholdDisplay: spRatingThresholdHighDisplay,
      earnedDisplay: spQualityPayableDisplay.earnedDisplay,
      bonusDisplay: spQualityPayableDisplay.bonusDisplay,
      adjustmentDisplay: spQualityPayableDisplay.adjustmentDisplay,
      withheldDisplay: spQualityPayableDisplay.withheldDisplay,
      payableDisplay: spQualityPayableDisplay.payableDisplay,
      qualityEligibilityLabel: spQualityPayableDisplay.qualityEligibilityLabel,
      faCurrencyCode: faCurrencyCode || "",
      withheldSpCommission30: spQualityPayable.withheldSpCommission30,
      highRatingBonusSpCommission30: spQualityPayable.highRatingBonusSpCommission30,
    };
    const ecQualityPayableDisplay = {
      earnedDisplay: formatFieldAgentMoneyAmount(
        ecQualityPayable.earnedEcCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      payableDisplay: formatFieldAgentMoneyAmount(
        ecQualityPayable.payableEcCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      withheldDisplay: formatFieldAgentMoneyAmount(
        ecQualityPayable.withheldEcCommission30,
        faCurrencySymbol,
        faCurrencyCode
      ),
      ...ecQualityPayable,
    };
    const ecPayableBreakdownPayload = {
      spRatingDisplay: metricSpRating30Display,
      lowThresholdDisplay: spRatingThresholdLowDisplay,
      highThresholdDisplay: spRatingThresholdHighDisplay,
      earnedDisplay: ecQualityPayableDisplay.earnedDisplay,
      withheldDisplay: ecQualityPayableDisplay.withheldDisplay,
      payableDisplay: ecQualityPayableDisplay.payableDisplay,
      qualityEligibilityLabel: ecQualityPayableDisplay.qualityEligibilityLabel,
      faCurrencyCode: faCurrencyCode || "",
      withheldEcCommission30: ecQualityPayable.withheldEcCommission30,
    };
    const rejectedRows = await fieldAgentSubmissionsRepo.listRejectedWithReason(pool, s.id, 20);
    const approvedWebsiteNextRows = await fieldAgentSubmissionsRepo.listApprovedForFieldAgentNotLinkedToCompany(
      pool,
      tid,
      s.id,
      25
    );
    const metricTotal = metricPending + metricInfoNeeded + metricApproved + metricRejected + metricAppealed;
    return res.render("field_agent/dashboard", renderLocals(req, res, {
      fieldAgent: s,
      metricPending,
      metricInfoNeeded,
      metricApproved,
      metricRejected,
      metricAppealed,
      metricTotal,
      recruitmentCommission30,
      metricSpCommission30,
      metricEcCommission30,
      metricLinkedSpCount,
      metricSpRating30Display,
      metricSpRating30Band,
      spQualityPayableDisplay,
      faCurrencyCode,
      spRatingThresholdLowDisplay,
      spRatingThresholdHighDisplay,
      spPayableBreakdownPayload,
      ecQualityPayableDisplay,
      ecPayableBreakdownPayload,
      rejectedRows,
      approvedWebsiteNextRows,
      submitted: req.query && req.query.submitted === "1",
      callback: req.query && req.query.callback === "1",
      resubmitted: req.query && req.query.resubmitted === "1",
    }));
  });

  router.get("/field-agent/sp-websites", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const approvedRows = await fieldAgentSubmissionsRepo.listApprovedForFieldAgentNotLinkedToCompany(
        pool,
        tid,
        s.id,
        100
      );
      return res.render(
        "field_agent/sp_websites",
        renderLocals(req, res, {
          fieldAgent: s,
          approvedRows,
          tenantId: tid,
          faActiveNav: "sp_websites",
          faIncludeFaq: true,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  /**
   * Placeholder entry for post-approval website / directory content workflow (non-publishing).
   * Guards: session field agent + tenant + submission status approved.
   */
  router.get("/field-agent/submissions/:id/website-content", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      if (String(row.status || "") !== "approved") {
        return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`);
      }
      const linkedCompanyId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, id, null);
      const websiteDraft = fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(row.website_listing_draft_json);
      const websiteSpecialityEntries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, id);
      const websiteSpecialities = websiteSpecialityEntries.map((x) => x.name);
      const websiteVerifiedSpecialities = websiteSpecialityEntries.filter((x) => x.isVerified).map((x) => x.name);
      const websiteWeeklyHours = await fieldAgentSubmissionsRepo.getWebsiteWeeklyHoursForSubmission(pool, tid, id);
      const specialitySuggestions = await fieldAgentSubmissionsRepo.listWebsiteSpecialitySuggestions(pool, tid, "", 40);
      const reviewRequestedAt = row.website_listing_review_requested_at || null;
      const websiteReviewStatus = String(row.website_listing_review_status || "").trim();
      const websiteReviewComment = String(row.website_listing_review_comment || "").trim();
      return res.render(
        "field_agent/website_content",
        renderLocals(req, res, {
          submission: row,
          linkedCompanyId,
          websiteDraft,
          websiteSpecialities,
          websiteVerifiedSpecialities,
          websiteWeeklyHours,
          specialitySuggestions,
          reviewRequestedAt,
          websiteReviewStatus,
          websiteReviewComment,
          websiteReadOnly: linkedCompanyId != null,
          faActiveNav: "sp_websites",
          faIncludeFaq: true,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  /** Field-agent saved-draft preview via canonical company template (no publish / no company row creation). */
  router.get("/field-agent/submissions/:id/website-content/preview", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      if (String(row.status || "") !== "approved") {
        return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`);
      }
      const linkedId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, id, null);
      if (linkedId != null) {
        return res.status(403).type("text").send("Preview is unavailable for linked submissions.");
      }
      const websiteDraft = fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(row.website_listing_draft_json);
      const websiteSpecialityEntries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, id);
      const websiteSpecialities = websiteSpecialityEntries.map((x) => x.name);
      const websiteVerifiedSpecialities = websiteSpecialityEntries.filter((x) => x.isVerified).map((x) => x.name);
      const websiteWeeklyHours = await fieldAgentSubmissionsRepo.getWebsiteWeeklyHoursForSubmission(pool, tid, id);
      const baseCompany = {
        id: 0,
        tenant_id: tid,
        category_id: null,
        category_slug: null,
        category_name: null,
        name: `${String(row.first_name || "").trim()} ${String(row.last_name || "").trim()}`.trim() || "Service provider",
        subdomain: `fa-preview-${id}`,
        headline: "",
        about: "",
        services: "",
        phone: String(row.phone_raw || "").trim(),
        email: "",
        location: String(row.city || row.address_city || "").trim(),
        featured_cta_label: "Call us",
        featured_cta_phone: "",
        years_experience: null,
        established_year: null,
        service_areas: "",
        hours_text: "",
        gallery_json: "[]",
        logo_url: "",
      };
      const previewDraft = {
        ...websiteDraft,
        name: websiteDraft.listing_name,
        phone: websiteDraft.listing_phone,
        established_year: websiteDraft.established_year,
        service_areas: fieldAgentSubmissionsRepo.specialitiesToLegacyText(websiteSpecialities),
        hours_text: fieldAgentSubmissionsRepo.weeklyHoursToLegacyText(websiteWeeklyHours),
      };
      const merged = await mergeDraftCompanyForPreviewAsync(pool, baseCompany, previewDraft);
      const locals = await buildCompanyPageLocals(req, merged, {});
      return res.render(
        "company",
        renderLocals(req, res, {
          ...locals,
          previewMode: true,
          previewEditHref: `${tenantPrefix(req)}/field-agent/submissions/${id}/website-content`,
          previewLabel: "Preview mode",
          verifiedSpecialities: websiteVerifiedSpecialities,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/api/website-specialities/suggest", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const q = String((req.query && req.query.q) || "").trim();
    const items = await fieldAgentSubmissionsRepo.listWebsiteSpecialitySuggestions(pool, tid, q, 20);
    return res.json({ ok: true, items });
  });

  /** Update submission after admin feedback (info_needed or rejected → resubmit to pending). */
  router.get("/field-agent/submissions/:id/edit", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      const st = String(row.status || "");
      if (st !== "info_needed" && st !== "rejected") {
        return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`);
      }
      return res.render("field_agent/edit_submission", renderLocals(req, res, {
        submission: row,
        faActiveNav: "dashboard",
        faIncludeFaq: true,
      }));
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/statements/:payRunId/download", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const payRunId = Number(req.params.payRunId);
      if (!Number.isFinite(payRunId) || payRunId < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const row = await fieldAgentPayRunRepo.getVisiblePayRunItemDetailForFieldAgent(pool, tid, s.id, payRunId);
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      const commerce = await getCommerceSettingsForTenant(pool, tid);
      const detail = buildStatementDetailFromSnapshotRow(row, commerce);
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const tenantRegionLabel = tenantRow
        ? `${String(tenantRow.name || "").trim() || tenantRow.slug} (${tenantRow.slug})`
        : "";
      return res.render("field_agent/statement_print", {
        detail,
        brandProductName: res.locals.brandProductName || "Pro-online",
        tenantRegionLabel,
        showTenantLine: true,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/adjustments", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const commerce = await getCommerceSettingsForTenant(pool, tid);
      const faCurrencyCode = commerceCurrencyCodeUpper(commerce);
      const faCurrencySymbol =
        commerce && commerce.currency_symbol != null && String(commerce.currency_symbol).trim()
          ? String(commerce.currency_symbol).trim().slice(0, 16)
          : "";
      const rows = await fieldAgentPayRunAdjustmentsRepo.listAdjustmentsForFieldAgent(pool, tid, s.id, 100);
      const adjustments = rows.map((a) => ({
        ...a,
        periodLabel:
          a.original_period_start && a.original_period_end
            ? `${new Date(a.original_period_start).toISOString().slice(0, 10)} – ${new Date(a.original_period_end).toISOString().slice(0, 10)}`
            : "—",
        amountDisplay: formatStatementMoney(a.adjustment_amount, faCurrencySymbol, faCurrencyCode),
      }));
      return res.render(
        "field_agent/adjustments",
        renderLocals(req, res, {
          fieldAgent: s,
          adjustments,
          faCurrencyCode,
          faCurrencySymbol,
          faActiveNav: "adjustments",
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/disputes", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const rows = await fieldAgentPayRunDisputesRepo.listDisputesForFieldAgent(pool, tid, s.id, 80);
      const disputes = rows.map((d) => ({
        ...d,
        periodLabel:
          d.period_start && d.period_end
            ? `${new Date(d.period_start).toISOString().slice(0, 10)} – ${new Date(d.period_end).toISOString().slice(0, 10)}`
            : "—",
      }));
      return res.render(
        "field_agent/disputes",
        renderLocals(req, res, {
          fieldAgent: s,
          disputes,
          faActiveNav: "disputes",
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent/statements/:payRunId/disputes", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const payRunId = Number(req.params.payRunId);
      const body = req.body || {};
      const payRunItemId = Number(body.pay_run_item_id);
      const disputeReason = String(body.dispute_reason || "").trim();
      const disputeNotes = body.dispute_notes != null && String(body.dispute_notes).trim() !== "" ? String(body.dispute_notes).trim() : null;
      if (!Number.isFinite(payRunId) || payRunId < 1 || !Number.isFinite(payRunItemId) || payRunItemId < 1) {
        return res.status(400).type("text").send("Invalid request.");
      }
      if (!disputeReason) {
        return res.status(400).type("text").send("Reason is required.");
      }
      const eligible = await verifyPayRunItemEligibleForDispute(pool, {
        tenantId: tid,
        payRunId,
        payRunItemId,
        fieldAgentId: s.id,
      });
      if (!eligible) {
        return res.status(404).type("text").send("Not found.");
      }
      const active = await fieldAgentPayRunDisputesRepo.getActiveDisputeForPayRunItem(pool, tid, payRunItemId);
      if (active) {
        return res.status(409).type("text").send("A dispute is already in progress for this statement.");
      }
      let created;
      try {
        created = await fieldAgentPayRunDisputesRepo.createDispute(pool, {
          tenantId: tid,
          payRunId,
          payRunItemId,
          fieldAgentId: s.id,
          disputeReason,
          disputeNotes,
        });
      } catch (e) {
        if (e && e.code === "23505") {
          return res.status(409).type("text").send("A dispute is already in progress for this statement.");
        }
        throw e;
      }
      if (created.error || !created.dispute) {
        return res.status(400).type("text").send("Could not submit dispute.");
      }
      const q = new URLSearchParams();
      q.set("dispute_submitted", "1");
      return res.redirect(302, `${tenantPrefix(req)}/field-agent/statements/${payRunId}?${q.toString()}`);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/statements", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const rows = await fieldAgentPayRunRepo.listVisiblePayRunItemsForFieldAgent(pool, tid, s.id, { limit: 50 });
      const commerce = await getCommerceSettingsForTenant(pool, tid);
      const faCurrencyCode = commerceCurrencyCodeUpper(commerce);
      const faCurrencySymbol =
        commerce && commerce.currency_symbol != null && String(commerce.currency_symbol).trim()
          ? String(commerce.currency_symbol).trim().slice(0, 16)
          : "";
      const statements = rows.map((row) => ({
        ...row,
        totalPayableDisplay: formatStatementMoney(row.total_payable, faCurrencySymbol, faCurrencyCode),
        periodLabel:
          row.period_start && row.period_end
            ? `${new Date(row.period_start).toISOString().slice(0, 10)} – ${new Date(row.period_end).toISOString().slice(0, 10)}`
            : "—",
      }));
      return res.render(
        "field_agent/statements",
        renderLocals(req, res, {
          fieldAgent: s,
          statements,
          faCurrencyCode,
          faCurrencySymbol,
          faActiveNav: "statements",
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent/statements/:payRunId", requireFieldAgent, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const payRunId = Number(req.params.payRunId);
      if (!Number.isFinite(payRunId) || payRunId < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const row = await fieldAgentPayRunRepo.getVisiblePayRunItemDetailForFieldAgent(pool, tid, s.id, payRunId);
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      const commerce = await getCommerceSettingsForTenant(pool, tid);
      const detail = buildStatementDetailFromSnapshotRow(row, commerce);
      const faCurrencyCode = detail.faCurrencyCode;
      const faCurrencySymbol = detail.faCurrencySymbol;
      const tenantRow = await tenantsRepo.getById(pool, tid);
      const tenantRegionLabel = tenantRow
        ? `${String(tenantRow.name || "").trim() || tenantRow.slug} (${tenantRow.slug})`
        : "";
      const activeDispute = await fieldAgentPayRunDisputesRepo.getActiveDisputeForPayRunItem(pool, tid, row.item_id);
      const canRaiseDispute = !activeDispute && (row.status === "approved" || row.status === "paid");
      const adjustmentRows = await fieldAgentPayRunAdjustmentsRepo.getAdjustmentsForPayRunItem(pool, tid, row.item_id);
      const statementAdjustments = adjustmentRows.map((a) => ({
        ...a,
        amountDisplay: formatStatementMoney(a.adjustment_amount, faCurrencySymbol, faCurrencyCode),
        appliedLabel:
          a.applied_in_pay_run_id != null && a.applied_period_start && a.applied_period_end
            ? `Applied in statement ${new Date(a.applied_period_start).toISOString().slice(0, 10)} – ${new Date(a.applied_period_end).toISOString().slice(0, 10)}`
            : null,
      }));
      return res.render(
        "field_agent/statement_detail",
        renderLocals(req, res, {
          fieldAgent: s,
          detail,
          payRunItemId: row.item_id,
          activeDispute,
          canRaiseDispute,
          disputeSubmitted: req.query.dispute_submitted === "1",
          statementAdjustments,
          tenantRegionLabel,
          showTenantLine: true,
          faCurrencyCode,
          faCurrencySymbol,
          faActiveNav: "statements",
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  /** JSON: lead-fee charge rows for SP_Commission (30d) drill-down (read-only). */
  router.get("/field-agent/api/sp-commission-charges", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const rows = await fieldAgentLeadFeeCommissionRepo.listDealFeeChargesForAccountManagerFieldAgent(pool, tid, s.id, {
      days: 30,
      limit: 100,
    });
    const cs = await getCommerceSettingsForTenant(pool, tid);
    const currency_code = commerceCurrencyCodeUpper(cs);
    const currency_symbol =
      cs && cs.currency_symbol != null && String(cs.currency_symbol).trim()
        ? String(cs.currency_symbol).trim().slice(0, 16)
        : "";
    const items = rows.map((row) => {
      const ca = row.charged_at;
      let charge_timestamp = null;
      if (ca instanceof Date) {
        charge_timestamp = ca.toISOString();
      } else if (ca != null) {
        charge_timestamp = String(ca);
      }
      return {
        assignment_id: Number(row.assignment_id),
        company_name: row.company_name != null ? String(row.company_name) : "",
        category_name: row.category_name != null && String(row.category_name).trim() ? String(row.category_name) : null,
        deal_price: row.deal_price != null && Number.isFinite(Number(row.deal_price)) ? Number(row.deal_price) : 0,
        charge_timestamp,
        project_id: Number(row.project_id),
        subdomain: row.subdomain != null && String(row.subdomain).trim() ? String(row.subdomain).trim() : null,
        location: row.location != null && String(row.location).trim() ? String(row.location).trim() : null,
      };
    });
    return res.json({ ok: true, currency_code, currency_symbol, items });
  });

  /** JSON: distinct qualifying EC lead projects for EC_Commission (30d) drill-down (read-only). */
  router.get("/field-agent/api/ec-commission-projects", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const cs = await getCommerceSettingsForTenant(pool, tid);
    const currency_code = commerceCurrencyCodeUpper(cs);
    const currency_symbol =
      cs && cs.currency_symbol != null && String(cs.currency_symbol).trim()
        ? String(cs.currency_symbol).trim().slice(0, 16)
        : "";
    const rows = await fieldAgentEcCommissionRepo.listDistinctEcCommissionProjectsForAccountManagerFieldAgent(
      pool,
      tid,
      s.id,
      30
    );
    const items = rows.map((row) => {
      const ca = row.created_at;
      let created_at = null;
      if (ca instanceof Date) {
        created_at = ca.toISOString();
      } else if (ca != null) {
        created_at = String(ca);
      }
      return {
        project_id: Number(row.project_id),
        project_code: row.project_code != null ? String(row.project_code) : "",
        deal_price: row.deal_price != null && Number.isFinite(Number(row.deal_price)) ? Number(row.deal_price) : 0,
        created_at,
        assignment_count:
          row.assignment_count != null && Number.isFinite(Number(row.assignment_count))
            ? Number(row.assignment_count)
            : 0,
      };
    });
    return res.json({ ok: true, currency_code, currency_symbol, items });
  });

  /** JSON: client→SP reviews + average for SP_Rating (30d) drill-down (read-only). */
  router.get("/field-agent/api/sp-rating-reviews", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const avgRating = await fieldAgentSpRatingRepo.getAvgRatingLastDaysForAccountManagerFieldAgent(pool, tid, s.id, 30);
    const rows = await fieldAgentSpRatingRepo.listRecentClientReviewsForAccountManagerFieldAgent(pool, tid, s.id, {
      days: 30,
      limit: 100,
    });
    const items = rows.map((row) => {
      const ca = row.created_at;
      let created_at = null;
      if (ca instanceof Date) {
        created_at = ca.toISOString();
      } else if (ca != null) {
        created_at = String(ca);
      }
      return {
        company_name: row.company_name != null ? String(row.company_name) : "",
        rating: row.rating != null && Number.isFinite(Number(row.rating)) ? Number(row.rating) : 0,
        created_at,
        project_id: row.project_id != null ? Number(row.project_id) : null,
        project_code: row.project_code != null && String(row.project_code).trim() ? String(row.project_code).trim() : null,
      };
    });
    return res.json({
      ok: true,
      avg_rating: avgRating != null && Number.isFinite(Number(avgRating)) ? Number(avgRating) : null,
      items,
    });
  });

  /** JSON: service provider companies linked to this field agent as account manager (read-only). */
  router.get("/field-agent/api/linked-companies", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const rows = await companiesRepo.listCompaniesByAccountManagerFieldAgent(pool, tid, s.id, { limit: 100 });
    return res.json({ ok: true, items: rows });
  });

  /** JSON: submissions for the logged-in field agent only, by status (dashboard drill-down). */
  router.get("/field-agent/api/submissions", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const status = String((req.query && req.query.status) || "").trim();
    const rows = await fieldAgentSubmissionsRepo.listSubmissionsForFieldAgentByStatus(pool, s.id, status, 100);
    return res.json({ ok: true, items: rows });
  });

  /** JSON: single submission row if it belongs to the logged-in field agent (same tenant). */
  router.get("/field-agent/api/submissions/:id", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(404).json({ ok: false, error: "Not found." });
    }
    const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
    if (!row) {
      return res.status(404).json({ ok: false, error: "Not found." });
    }
    const history = await fieldAgentSubmissionAuditRepo.listAuditForFieldAgentVisible(pool, tid, id, { limit: 80 });
    return res.json({ ok: true, submission: row, history });
  });

  /** JSON: save structured website/directory listing draft (approved, not company-linked only). */
  router.post("/field-agent/api/submissions/:id/website-content-draft", requireFieldAgent, async (req, res) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ ok: false, error: "Invalid submission." });
      }
      const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      if (!row) {
        return res.status(404).json({ ok: false, error: "Not found." });
      }
      if (String(row.status || "") !== "approved") {
        return res.status(400).json({ ok: false, error: "Submission must be approved to edit website content." });
      }
      const linkedId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, id, null);
      if (linkedId != null) {
        return res.status(403).json({
          ok: false,
          error: "This submission is linked to a directory listing; draft edits are disabled here.",
        });
      }
      const body = req.body || {};
      const draftRaw = body.draft != null ? body.draft : body;
      const draft = normalizeWebsiteDraftInputForFieldAgent(draftRaw, row);
      const specialities = parseSpecialitiesFromDraft(draft);
      if (specialities.length > 10) {
        return res.status(400).json({ ok: false, error: "Maximum 10 specialities." });
      }
      const weeklyHours = parseWeeklyHoursFromDraft(draft);
      const hv = validateWeeklyHours(weeklyHours);
      if (!hv.ok) {
        return res.status(400).json({ ok: false, error: hv.error });
      }
      draft.service_areas = fieldAgentSubmissionsRepo.specialitiesToLegacyText(specialities);
      draft.hours_text = fieldAgentSubmissionsRepo.weeklyHoursToLegacyText(weeklyHours);
      const email = String(draft.email || "").trim();
      if (email && !isPlausibleEmail(email, 320)) {
        return res.status(400).json({ ok: false, error: "Enter a valid email address." });
      }
      const establishedYear = parseEstablishedYearOrError(draft.established_year);
      if (!establishedYear.ok) {
        return res.status(400).json({ ok: false, error: establishedYear.error });
      }
      const ok = await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForFieldAgent(pool, {
        tenantId: tid,
        fieldAgentId: s.id,
        submissionId: id,
        draft,
      });
      if (!ok) {
        return res.status(400).json({ ok: false, error: "Could not save draft." });
      }
      const existingEntries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, id);
      const verifiedByName = new Set(
        existingEntries.filter((x) => x.isVerified).map((x) => String(x.nameNorm || "").toLowerCase())
      );
      const entries = specialities.map((name) => ({
        name,
        isVerified: verifiedByName.has(String(name || "").trim().toLowerCase()),
      }));
      await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        entries,
      });
      await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        weeklyHours,
      });
      const next = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      return res.json({ ok: true, submission: next });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[field-agent] website-content-draft save failed", {
        tenantId: req.tenant && req.tenant.id,
        fieldAgentId: req.session && req.session.fieldAgent && req.session.fieldAgent.id,
        submissionId: Number(req.params && req.params.id),
        error: e && e.message ? e.message : String(e),
      });
      return res.status(500).json({ ok: false, error: "Could not save draft." });
    }
  });

  /** JSON: submit listing text for staff second review (sets timestamp only; no moderation status change). */
  router.post("/field-agent/api/submissions/:id/website-content-submit-review", requireFieldAgent, async (req, res) => {
    try {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ ok: false, error: "Invalid submission." });
      }
      const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      if (!row) {
        return res.status(404).json({ ok: false, error: "Not found." });
      }
      if (String(row.status || "") !== "approved") {
        return res.status(400).json({ ok: false, error: "Submission must be approved to submit for review." });
      }
      const linkedId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, id, null);
      if (linkedId != null) {
        return res.status(403).json({
          ok: false,
          error: "This submission is linked to a directory listing; you cannot submit for review from here.",
        });
      }
      const body = req.body || {};
      const draftRaw = body.draft != null ? body.draft : undefined;
      const draft = draftRaw !== undefined ? normalizeWebsiteDraftInputForFieldAgent(draftRaw, row) : undefined;
      let specialities = [];
      let weeklyHours = fieldAgentSubmissionsRepo.normalizeWebsiteWeeklyHours({});
      if (draft) {
        specialities = parseSpecialitiesFromDraft(draft);
        if (specialities.length > 10) {
          return res.status(400).json({ ok: false, error: "Maximum 10 specialities." });
        }
        weeklyHours = parseWeeklyHoursFromDraft(draft);
        const hv = validateWeeklyHours(weeklyHours);
        if (!hv.ok) {
          return res.status(400).json({ ok: false, error: hv.error });
        }
        draft.service_areas = fieldAgentSubmissionsRepo.specialitiesToLegacyText(specialities);
        draft.hours_text = fieldAgentSubmissionsRepo.weeklyHoursToLegacyText(weeklyHours);
        const email = String(draft.email || "").trim();
        if (email && !isPlausibleEmail(email, 320)) {
          return res.status(400).json({ ok: false, error: "Enter a valid email address." });
        }
        const establishedYear = parseEstablishedYearOrError(draft.established_year);
        if (!establishedYear.ok) {
          return res.status(400).json({ ok: false, error: establishedYear.error });
        }
      }
      const ok = await fieldAgentSubmissionsRepo.submitWebsiteListingReviewRequestForFieldAgent(pool, {
        tenantId: tid,
        fieldAgentId: s.id,
        submissionId: id,
        draft,
      });
      if (!ok) {
        return res.status(400).json({ ok: false, error: "Could not submit for review." });
      }
      if (draft) {
        const existingEntries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, id);
        const verifiedByName = new Set(
          existingEntries.filter((x) => x.isVerified).map((x) => String(x.nameNorm || "").toLowerCase())
        );
        const entries = specialities.map((name) => ({
          name,
          isVerified: verifiedByName.has(String(name || "").trim().toLowerCase()),
        }));
        await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
          tenantId: tid,
          submissionId: id,
          entries,
        });
        await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
          tenantId: tid,
          submissionId: id,
          weeklyHours,
        });
      }
      const next = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
      try {
      const fn = String(next.first_name || "").trim();
      const ln = String(next.last_name || "").trim();
      const prof = String(next.profession || "").trim();
      const draft = fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(next.website_listing_draft_json);
      const sumHead = String(draft.headline || "").trim().slice(0, 120);
      const sumLine = [sumHead && `Headline: ${sumHead}`, draft.listing_name && `Listing name: ${String(draft.listing_name).slice(0, 80)}`]
        .filter(Boolean)
        .join("\n");
      const desc = [
        "Field agent submitted website / directory listing text for staff review.",
        "",
        "Next steps: call the service provider, review and edit content in Admin, then publish to create the directory listing.",
        "",
        `Submission #${id}: ${fn} ${ln}${prof ? ` — ${prof}` : ""}`,
        next.phone_raw ? `Phone: ${next.phone_raw}` : "",
        sumLine || "(No headline in draft yet — open review page to edit.)",
      ]
        .filter((x) => x !== "")
        .join("\n")
        .slice(0, 8000);
      const crmTaskId = await fieldAgentCrm.notifyWebsiteListingReviewToCrm({
        tenantId: tid,
        submissionId: id,
        title: `Website listing review — submission #${id}`,
        description: desc,
      });
      if (crmTaskId == null) {
        // eslint-disable-next-line no-console
        console.error(
          "[getpro] field-agent CRM inbound task not created",
          JSON.stringify({
            op: "field_agent_website_listing_review",
            severity: "warning",
            tenantId: tid,
            submissionId: id,
            sourceType: fieldAgentCrm.WEBSITE_LISTING_CRM_SOURCE,
            reason: "null_task_id",
          })
        );
      }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          "[getpro] field-agent CRM inbound task failed",
          JSON.stringify({
            op: "field_agent_website_listing_review",
            severity: "error",
            tenantId: tid,
            submissionId: id,
            sourceType: fieldAgentCrm.WEBSITE_LISTING_CRM_SOURCE,
            error: e && e.message ? String(e.message) : String(e),
          })
        );
        // eslint-disable-next-line no-console
        if (e && e.stack) console.error(e.stack);
      }
      return res.json({ ok: true, submission: next });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[field-agent] website-content-submit-review failed", {
        tenantId: req.tenant && req.tenant.id,
        fieldAgentId: req.session && req.session.fieldAgent && req.session.fieldAgent.id,
        submissionId: Number(req.params && req.params.id),
        error: e && e.message ? e.message : String(e),
      });
      return res.status(500).json({ ok: false, error: "Could not submit for review." });
    }
  });

  /** JSON: set reply text while submission is info_needed or rejected (no status change). */
  router.patch("/field-agent/api/submissions/:id/reply", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const id = Number(req.params.id);
    const body = req.body || {};
    const message = String(body.message != null ? body.message : body.field_agent_reply || "").trim();
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ ok: false, error: "Invalid submission." });
    }
    if (!message) {
      return res.status(400).json({ ok: false, error: "Message is required." });
    }
    const ok = await fieldAgentSubmissionsRepo.patchFieldAgentSubmissionReply(pool, {
      tenantId: tid,
      fieldAgentId: s.id,
      submissionId: id,
      message,
    });
    if (!ok) {
      return res.status(400).json({
        ok: false,
        error: "Could not save reply — submission must be yours in info needed or rejected status.",
      });
    }
    const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
    return res.json({ ok: true, submission: row });
  });

  /** JSON: update submission fields and resubmit (info_needed | rejected → pending). */
  router.post("/field-agent/api/submissions/:id/resubmit", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      return res.status(400).json({ ok: false, error: "Invalid submission." });
    }
    const existing = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
    const existingStatus = existing ? String(existing.status || "") : "";
    if (!existing || (existingStatus !== "info_needed" && existingStatus !== "rejected")) {
      return res.status(400).json({ ok: false, error: "Submission is not awaiting your response." });
    }
    const b = req.body || {};
    const phoneRaw = String(b.phone || "").trim();
    const whatsappRaw = String(b.whatsapp || "").trim();
    const firstName = String(b.first_name || "").trim().slice(0, 120);
    const lastName = String(b.last_name || "").trim().slice(0, 120);
    const profession = String(b.profession || "").trim().slice(0, 200);
    const pacra = String(b.pacra || "").trim().slice(0, 200);
    const addressStreet = String(b.address_street || "").trim().slice(0, 300);
    const addressLandmarks = String(b.address_landmarks || "").trim().slice(0, 300);
    const addressNeighbourhood = String(b.address_neighbourhood || "").trim().slice(0, 200);
    const addressCity = String(b.address_city || "").trim().slice(0, 120);
    const city = addressCity;
    const nrcNumber = String(b.nrc_number || "").trim().slice(0, 80);
    const photoProfileUrl = b.photo_profile_url != null ? String(b.photo_profile_url).trim().slice(0, 500) : String(existing.photo_profile_url || "").trim();
    let workPhotosJson = "[]";
    if (b.work_photos_json != null) {
      const w = String(b.work_photos_json).trim();
      workPhotosJson = w.length > 20000 ? w.slice(0, 20000) : w || "[]";
    } else {
      workPhotosJson = String(existing.work_photos_json || "[]");
    }

    const vPhone = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneRaw, "phone");
    if (!vPhone.ok) {
      return res.status(400).json({ ok: false, error: vPhone.error || "Invalid phone." });
    }
    if (whatsappRaw) {
      const vWa = await phoneRulesService.validatePhoneForTenant(pool, tid, whatsappRaw, "whatsapp");
      if (!vWa.ok) {
        return res.status(400).json({ ok: false, error: vWa.error || "Invalid WhatsApp number." });
      }
    }
    const pNorm = await phoneRulesService.normalizePhoneForTenant(pool, tid, phoneRaw);
    const wNorm = whatsappRaw ? await phoneRulesService.normalizePhoneForTenant(pool, tid, whatsappRaw) : "";
    if (
      !pNorm ||
      fieldAgentProviderCoreFieldsMissing({
        firstName,
        lastName,
        profession,
        pacra,
        addressStreet,
        addressLandmarks,
        addressNeighbourhood,
        addressCity,
        nrcNumber,
      })
    ) {
      return res.status(400).json({ ok: false, error: "Missing required fields." });
    }

    const dupS = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(pool, tid, pNorm, wNorm, id);
    if (dupS.duplicate) {
      return res.status(400).json({ ok: false, error: "Service provider exists in system." });
    }
    const dupCandidates = await phoneRulesService.expandDuplicateNormsForTenant(pool, tid, pNorm, wNorm);
    const dupC = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(pool, tid, dupCandidates);
    if (dupC.duplicate) {
      return res.status(400).json({ ok: false, error: "Service provider exists in system." });
    }

    let fieldAgentReply = undefined;
    if (Object.prototype.hasOwnProperty.call(b, "field_agent_reply")) {
      fieldAgentReply = String(b.field_agent_reply).trim().slice(0, 4000);
    }

    const exPhone = String(existing.phone_raw || "").trim();
    const exWa = String(existing.whatsapp_raw || "").trim();
    const exFn = String(existing.first_name || "").trim();
    const exLn = String(existing.last_name || "").trim();
    const exPr = String(existing.profession || "").trim();
    const exPac = String(existing.pacra || "").trim();
    const exSt = String(existing.address_street || "").trim();
    const exLm = String(existing.address_landmarks || "").trim();
    const exNh = String(existing.address_neighbourhood || "").trim();
    const exCity = String(existing.address_city || "").trim();
    const exNrc = String(existing.nrc_number || "").trim();
    const exPhoto = String(existing.photo_profile_url || "").trim();
    const exWork = String(existing.work_photos_json || "[]").trim();
    const exPn = String(existing.phone_norm || "").trim();
    const exWn = String(existing.whatsapp_norm || "").trim();
    const fieldsChanged =
      exPhone !== phoneRaw ||
      exWa !== whatsappRaw ||
      exFn !== firstName ||
      exLn !== lastName ||
      exPr !== profession ||
      exPac !== pacra ||
      exSt !== addressStreet ||
      exLm !== addressLandmarks ||
      exNh !== addressNeighbourhood ||
      exCity !== addressCity ||
      exNrc !== nrcNumber ||
      exPhoto !== (b.photo_profile_url != null ? String(b.photo_profile_url).trim().slice(0, 500) : exPhoto) ||
      exWork !== workPhotosJson ||
      exPn !== pNorm ||
      exWn !== wNorm;
    const existingReply = String(existing.field_agent_reply || "").trim();
    const replyProvided = fieldAgentReply !== undefined && String(fieldAgentReply).trim() !== "";
    const replyChanged = replyProvided && String(fieldAgentReply).trim() !== existingReply;
    if (!fieldsChanged && !replyChanged) {
      return res.status(400).json({
        ok: false,
        error: "Update your contact details and/or add a reply before resubmitting.",
      });
    }

    const ok = await fieldAgentSubmissionsRepo.resubmitFieldAgentSubmissionForReview(pool, {
      tenantId: tid,
      fieldAgentId: s.id,
      submissionId: id,
      phoneRaw,
      phoneNorm: pNorm,
      whatsappRaw,
      whatsappNorm: wNorm,
      firstName,
      lastName,
      profession,
      city,
      pacra,
      addressStreet,
      addressLandmarks,
      addressNeighbourhood,
      addressCity,
      nrcNumber,
      photoProfileUrl,
      workPhotosJson,
      fieldAgentReply,
    });
    if (!ok) {
      return res.status(400).json({ ok: false, error: "Could not resubmit — try again or contact support." });
    }
    const row = await fieldAgentSubmissionsRepo.getSubmissionByIdForFieldAgent(pool, tid, s.id, id);
    return res.json({ ok: true, submission: row });
  });

  router.get("/field-agent/add-contact", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const joinTenantCities = await getTenantCitiesForClientAsync(pool, tid);
    const joinCityWatermarkRotate = await getJoinCityWatermarkRotateAsync(pool, tid);
    const catRows = await categoriesRepo.listByTenantId(pool, tid);
    const joinProfessionWatermarkRotate =
      (catRows || [])
        .slice(0, 3)
        .map((c) => `Search: ${c.name}`)
        .join("|") || "Search:";
    const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, tid);
    return res.render("field_agent/add_contact", renderLocals(req, res, {
      joinTenantCities,
      joinCityWatermarkRotate,
      joinProfessionWatermarkRotate,
      phoneRulesPublic,
    }));
  });

  router.post(
    "/field-agent/api/check-phone",
    requireFieldAgent,
    fieldAgentAuthedPostLimiter,
    async (req, res) => {
      const pool = getPgPool();
      const tid = req.tenant.id;
      const b = req.body || {};
      const phone = String(b.phone || "").trim();
      const whatsappRaw = String(b.whatsapp || "").trim();
      const vPhone = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
      if (!vPhone.ok) {
        return res.status(400).json({ ok: false, error: vPhone.error || "Invalid phone." });
      }
      if (whatsappRaw) {
        const vWa = await phoneRulesService.validatePhoneForTenant(pool, tid, whatsappRaw, "whatsapp");
        if (!vWa.ok) {
          return res.status(400).json({ ok: false, error: vWa.error || "Invalid WhatsApp number." });
        }
      }
      const pNorm = await phoneRulesService.normalizePhoneForTenant(pool, tid, phone);
      const wNorm = whatsappRaw ? await phoneRulesService.normalizePhoneForTenant(pool, tid, whatsappRaw) : "";
      const dupS = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(pool, tid, pNorm, wNorm, null);
      if (dupS.duplicate) {
        return res.json({ ok: true, duplicate: true, message: "Service provider exists in system." });
      }
      const dupCandidates = await phoneRulesService.expandDuplicateNormsForTenant(pool, tid, pNorm, wNorm);
      const dupC = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(pool, tid, dupCandidates);
      if (dupC.duplicate) {
        return res.json({ ok: true, duplicate: true, message: "Service provider exists in system." });
      }
      return res.json({ ok: true, duplicate: false });
    }
  );

  router.post(
    "/field-agent/add-contact/submit",
    requireFieldAgent,
    fieldAgentAuthedPostLimiter,
    upload.fields([
      { name: "profile", maxCount: 1 },
      { name: "works", maxCount: 15 },
    ]),
    async (req, res) => {
      const accept = String(req.get("Accept") || "");
      const wantsJson = accept.includes("application/json");
      const dashboardBase = `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}`;
      const sendSubmitErr = (status, msg) => {
        if (wantsJson) return res.status(status).json({ ok: false, error: msg });
        return res.status(status).type("text").send(msg);
      };
      const sendSubmitSuccess = () => {
        if (wantsJson) return res.status(200).json({ ok: true, redirect: dashboardBase });
        return res.redirect(302, `${dashboardBase}?submitted=1`);
      };

      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const agentRow = await fieldAgentsRepo.getByIdAndTenant(pool, s.id, tid);
      if (!agentRow) {
        clearFieldAgentSession(req);
        return sendSubmitErr(401, "Session expired. Please sign in again.");
      }
      const fieldAgentDbId = Number(agentRow.id);
      const b = req.body || {};
      const phoneRaw = String(b.phone || "").trim();
      const whatsappRaw = String(b.whatsapp || "").trim();
      const firstName = String(b.first_name || "").trim().slice(0, 120);
      const lastName = String(b.last_name || "").trim().slice(0, 120);
      const profession = String(b.profession || "").trim().slice(0, 200);
      const pacra = String(b.pacra || "").trim().slice(0, 200);
      const addressStreet = String(b.address_street || "").trim().slice(0, 300);
      const addressLandmarks = String(b.address_landmarks || "").trim().slice(0, 300);
      const addressNeighbourhood = String(b.address_neighbourhood || "").trim().slice(0, 200);
      const addressCity = String(b.address_city || "").trim().slice(0, 120);
      /** Listing / CRM city: primary city field removed from UI; mirror address_city so CRM never shows an empty city. */
      const city = addressCity;
      const nrcNumber = String(b.nrc_number || "").trim().slice(0, 80);

      const vPhone = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneRaw, "phone");
      if (!vPhone.ok) {
        return sendSubmitErr(400, vPhone.error || "Invalid phone.");
      }
      if (whatsappRaw) {
        const vWa = await phoneRulesService.validatePhoneForTenant(pool, tid, whatsappRaw, "whatsapp");
        if (!vWa.ok) {
          return sendSubmitErr(400, vWa.error || "Invalid WhatsApp number.");
        }
      }

      const pNorm = await phoneRulesService.normalizePhoneForTenant(pool, tid, phoneRaw);
      const wNorm = whatsappRaw ? await phoneRulesService.normalizePhoneForTenant(pool, tid, whatsappRaw) : "";

      if (
        !pNorm ||
        fieldAgentProviderCoreFieldsMissing({
          firstName,
          lastName,
          profession,
          pacra,
          addressStreet,
          addressLandmarks,
          addressNeighbourhood,
          addressCity,
          nrcNumber,
        })
      ) {
        return sendSubmitErr(400, "Missing required fields.");
      }
      const profileFiles = (req.files && req.files.profile) || [];
      const workFiles = (req.files && req.files.works) || [];
      if (profileFiles.length !== 1) {
        return sendSubmitErr(400, "Please upload exactly one profile photo.");
      }
      if (workFiles.length < 2) {
        return sendSubmitErr(400, "Please upload at least 2 work photos.");
      }
      if (workFiles.length > 10) {
        return sendSubmitErr(400, "Please upload at most 10 work photos.");
      }

      const dupS = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(pool, tid, pNorm, wNorm, null);
      if (dupS.duplicate) {
        return sendSubmitErr(400, "Service provider exists in system.");
      }
      const dupCandidates = await phoneRulesService.expandDuplicateNormsForTenant(pool, tid, pNorm, wNorm);
      const dupC = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(pool, tid, dupCandidates);
      if (dupC.duplicate) {
        return sendSubmitErr(400, "Service provider exists in system.");
      }

      const client = await pool.connect();
      let submissionId;
      try {
        await client.query("BEGIN");
        submissionId = await fieldAgentSubmissionsRepo.insertSubmission(pool, client, {
          tenantId: tid,
          fieldAgentId: fieldAgentDbId,
          phoneRaw,
          phoneNorm: pNorm,
          whatsappRaw,
          whatsappNorm: wNorm,
          firstName,
          lastName,
          profession,
          city,
          pacra,
          addressStreet,
          addressLandmarks,
          addressNeighbourhood,
          addressCity,
          nrcNumber,
          photoProfileUrl: "",
          workPhotosJson: "[]",
        });

        const profileUrls = await saveJpegImages(tid, submissionId, profileFiles, { maxFiles: 1 });
        const workUrls = await saveJpegImages(tid, submissionId, workFiles, { maxFiles: 10 });
        if (profileUrls.length !== 1 || workUrls.length < 2) {
          await client.query("ROLLBACK");
          return sendSubmitErr(
            400,
            "One or more images could not be processed. Use JPEG, PNG, WebP, or GIF under 5 MB per file."
          );
        }
        const profileUrl = profileUrls[0] || "";
        await fieldAgentSubmissionsRepo.updatePhotosAfterUpload(pool, client, {
          submissionId,
          tenantId: tid,
          photoProfileUrl: profileUrl,
          workPhotosJson: JSON.stringify(workUrls),
        });

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        // eslint-disable-next-line no-console
        console.error("[getpro] field-agent submit:", e.message);
        return sendSubmitErr(500, "Could not save submission.");
      } finally {
        client.release();
      }

      const title = `Field agent provider · ${firstName} ${lastName}`.trim().slice(0, 200);
      const description = [
        `Phone: ${phoneRaw}`,
        `WhatsApp: ${whatsappRaw}`,
        `Profession: ${profession}`,
        `City: ${city}`,
        `PACRA: ${pacra}`,
        `Address: ${addressStreet}, ${addressLandmarks}, ${addressNeighbourhood}, ${addressCity}`,
        `NRC: ${nrcNumber}`,
        `Submission #${submissionId}`,
      ].join("\n");

      try {
        const crmTaskId = await fieldAgentCrm.notifyProviderSubmissionToCrm({
          tenantId: tid,
          submissionId,
          title,
          description,
        });
        if (crmTaskId == null) {
          // eslint-disable-next-line no-console
          console.error(
            "[getpro] field-agent CRM inbound task not created",
            JSON.stringify({
              op: "field_agent_provider_submission",
              severity: "warning",
              tenantId: tid,
              submissionId,
              sourceType: "field_agent_provider",
              reason: "null_task_id",
            })
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          "[getpro] field-agent CRM inbound task failed",
          JSON.stringify({
            op: "field_agent_provider_submission",
            severity: "error",
            tenantId: tid,
            submissionId,
            sourceType: "field_agent_provider",
            error: e && e.message ? String(e.message) : String(e),
          })
        );
        // eslint-disable-next-line no-console
        if (e && e.stack) console.error(e.stack);
      }

      return sendSubmitSuccess();
    }
  );

  router.get("/field-agent/call-me-back", requireFieldAgent, (req, res) => {
    return res.render("field_agent/callback", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/call-me-back", requireFieldAgent, fieldAgentAuthedPostLimiter, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const agentRow = await fieldAgentsRepo.getByIdAndTenant(pool, s.id, tid);
    if (!agentRow) {
      clearFieldAgentSession(req);
      return res.status(401).type("text").send("Session expired. Please sign in again.");
    }
    const fieldAgentDbId = Number(agentRow.id);
    const b = req.body || {};
    const firstName = String(b.first_name || "").trim().slice(0, 120);
    const lastName = String(b.last_name || "").trim().slice(0, 120);
    const phone = String(b.phone || "").trim().slice(0, 40);
    const email = String(b.email || "").trim().slice(0, 200);
    const locationCity = String(b.location_city || "").trim().slice(0, 120);
    if (!firstName || !lastName || !phone || !email || !locationCity) {
      return res.status(400).render("field_agent/callback", renderLocals(req, res, { error: "All fields are required." }));
    }
    if (!isPlausibleEmail(email, 200)) {
      return res.status(400).render("field_agent/callback", renderLocals(req, res, { error: "Enter a valid email address." }));
    }
    const vPh = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
    if (!vPh.ok) {
      return res.status(400).render("field_agent/callback", renderLocals(req, res, { error: vPh.error || "Invalid phone." }));
    }
    const leadId = await fieldAgentCallbackLeadsRepo.insertCallbackLead(pool, null, {
      tenantId: tid,
      fieldAgentId: fieldAgentDbId,
      firstName,
      lastName,
      phone,
      email,
      locationCity,
    });
    try {
      const crmTaskId = await fieldAgentCrm.notifyCallbackLeadToCrm({
        tenantId: tid,
        leadId,
        title: `Field agent callback · ${firstName} ${lastName}`,
        description: `Phone: ${phone}\nEmail: ${email}\nLocation: ${locationCity}\nLead #${leadId}`,
      });
      if (crmTaskId == null) {
        // eslint-disable-next-line no-console
        console.error(
          "[getpro] field-agent CRM inbound task not created",
          JSON.stringify({
            op: "field_agent_callback_lead",
            severity: "warning",
            tenantId: tid,
            leadId,
            sourceType: "field_agent_callback",
            reason: "null_task_id",
          })
        );
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        "[getpro] field-agent CRM inbound task failed",
        JSON.stringify({
          op: "field_agent_callback_lead",
          severity: "error",
          tenantId: tid,
          leadId,
          sourceType: "field_agent_callback",
          error: e && e.message ? String(e.message) : String(e),
        })
      );
      // eslint-disable-next-line no-console
      if (e && e.stack) console.error(e.stack);
    }
    return res.redirect(302, `${tenantPrefix(req)}${FIELD_AGENT_DASHBOARD}?callback=1`);
  });

  router.get("/field-agent/faq", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_faq", renderLocals(req, res, {}));
  });

  router.get("/field-agent/support", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_support", renderLocals(req, res, {}));
  });

  router.get("/field-agent/about", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_about", renderLocals(req, res, {}));
  });

  return router;
};
