/**
 * CRM tasks.
 */
const { isSuperAdmin } = require("../../auth");
const {
  ROLES,
  normalizeRole,
  canAccessCrm,
  canMutateCrm,
  canClaimCrmTasks,
} = require("../../auth/roles");
const fieldAgentCrm = require("../../fieldAgent/fieldAgentCrm");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const { getAdminTenantId, normalizeCrmAttachmentUrl, safeCrmRedirect } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const crmTasksRepo = require("../../db/pg/crmTasksRepo");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const { publishWebsiteListingForAdmin } = require("./adminFieldAgentWebsiteListingReview");

module.exports = function registerAdminCrmRoutes(router) {
  const WEBSITE_MISSING_BADGE_DEFS = [
    { key: "missing_business_name", label: "Missing business name" },
    { key: "missing_about", label: "Missing about text" },
    { key: "short_about", label: "Short about text" },
    { key: "missing_contact", label: "Missing contact info" },
    { key: "missing_specialities", label: "Missing specialities" },
    { key: "missing_hours", label: "Missing hours" },
    { key: "missing_established_year", label: "Missing established year" },
  ];
  const WEBSITE_MISSING_BADGE_LABEL_BY_KEY = Object.fromEntries(
    WEBSITE_MISSING_BADGE_DEFS.map((x) => [x.key, x.label])
  );

  function canAccessWebsiteQueue(role) {
    const n = normalizeRole(role);
    return n === ROLES.SUPER_ADMIN || n === ROLES.TENANT_MANAGER || n === ROLES.TENANT_EDITOR;
  }

  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }

  function parseWebsiteReportFilters(query) {
    const q = query || {};
    const reviewStatus = String(q.review_status || "").trim().slice(0, 40);
    const publishedRaw = String(q.published || "all").trim().toLowerCase();
    const published = publishedRaw === "yes" || publishedRaw === "no" ? publishedRaw : "all";
    const city = String(q.city || "").trim().slice(0, 120);
    const qualityTierRaw = String(q.quality_tier || "all").trim().toLowerCase();
    const qualityTier =
      qualityTierRaw === "high" || qualityTierRaw === "medium" || qualityTierRaw === "low" ? qualityTierRaw : "all";
    const qualityMinNum = Number(String(q.quality_min || "").trim());
    const qualityMin =
      Number.isFinite(qualityMinNum) && qualityMinNum >= 0 && qualityMinNum <= 100 ? Math.floor(qualityMinNum) : null;
    const hasVerifiedRaw = String(q.has_verified_specialities || "all").trim().toLowerCase();
    const hasVerifiedSpecialities = hasVerifiedRaw === "yes" || hasVerifiedRaw === "no" ? hasVerifiedRaw : "all";
    const hasHoursRaw = String(q.has_hours || "all").trim().toLowerCase();
    const hasHours = hasHoursRaw === "yes" || hasHoursRaw === "no" ? hasHoursRaw : "all";
    const hasEstablishedRaw = String(q.has_established_year || "all").trim().toLowerCase();
    const hasEstablishedYear = hasEstablishedRaw === "yes" || hasEstablishedRaw === "no" ? hasEstablishedRaw : "all";
    const category = String(q.category || "").trim().slice(0, 80);
    return {
      reviewStatus,
      published,
      city,
      category,
      qualityTier,
      qualityMin,
      hasVerifiedSpecialities,
      hasHours,
      hasEstablishedYear,
    };
  }

  /** UI-only: open Advanced share formats when <code>share_view=advanced</code> (ignored by filters and share URLs). */
  function parseWebsiteShareViewAdvancedOpen(query) {
    return String((query && query.share_view) || "").trim().toLowerCase() === "advanced";
  }

  const WEBSITE_SHARE_TARGET_KEYS = new Set(["markdown", "chat", "named", "email", "bundles"]);

  /** UI-only: deep-link emphasis inside Advanced share card; ignored by filters and share URLs. */
  function parseWebsiteShareTarget(query) {
    const raw = String((query && query.share_target) || "").trim().toLowerCase();
    if (!raw) return null;
    return WEBSITE_SHARE_TARGET_KEYS.has(raw) ? raw : null;
  }

  function appendWebsiteShareDeepLinkParams(path, shareTarget) {
    const base = String(path == null ? "" : path).trim();
    const t = String(shareTarget || "").trim().toLowerCase();
    if (!base || !WEBSITE_SHARE_TARGET_KEYS.has(t)) return null;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}share_view=${encodeURIComponent("advanced")}&share_target=${encodeURIComponent(t)}`;
  }

  function buildWebsiteShareDeepLinks(path) {
    const p = String(path == null ? "" : path).trim();
    if (!p) return null;
    return {
      markdown: appendWebsiteShareDeepLinkParams(p, "markdown"),
      chat: appendWebsiteShareDeepLinkParams(p, "chat"),
      named: appendWebsiteShareDeepLinkParams(p, "named"),
      email: appendWebsiteShareDeepLinkParams(p, "email"),
      bundles: appendWebsiteShareDeepLinkParams(p, "bundles"),
    };
  }

  function websiteQueueFilteredReportHrefFromControls(wqc) {
    const q = wqc && typeof wqc === "object" ? wqc : {};
    const sp = new URLSearchParams();
    const rs = String(q.reviewStatus || "").trim().slice(0, 40);
    if (rs) sp.set("review_status", rs);
    const city = String(q.city || "").trim().slice(0, 120);
    if (city) sp.set("city", city);
    const qt = String(q.qualityTier || "").trim().toLowerCase();
    if (qt === "high" || qt === "medium" || qt === "low") sp.set("quality_tier", qt);
    const cat = String(q.category || "").trim().slice(0, 80);
    if (cat) sp.set("category", cat);
    const hi = q.highlightSubmissionId != null ? Number(q.highlightSubmissionId) : NaN;
    if (Number.isFinite(hi) && hi > 0) sp.set("highlight_submission_id", String(Math.trunc(hi)));
    const qs = sp.toString();
    return qs ? `/admin/crm/websites/report?${qs}` : "/admin/crm/websites/report";
  }

  /** Shareable Websites queue URL from normalized controls (not raw req.query). */
  function buildWebsiteQueueSharePath(wqc, reportReturnHrefValidated) {
    const w = wqc && typeof wqc === "object" ? wqc : {};
    const sp = new URLSearchParams();
    sp.set("queue", "websites");
    if (w.qualityTier && w.qualityTier !== "all") sp.set("quality_tier", String(w.qualityTier));
    if (w.qualityMin != null) sp.set("quality_min", String(w.qualityMin));
    if (w.qualitySort === "asc" || w.qualitySort === "desc") sp.set("quality_sort", w.qualitySort);
    const city = String(w.city || "").trim().slice(0, 120);
    if (city) sp.set("city", city);
    const category = String(w.category || "").trim().slice(0, 80);
    if (category) sp.set("category", category);
    if (w.hasHours === "yes" || w.hasHours === "no") sp.set("has_hours", w.hasHours);
    const rs = String(w.reviewStatus || "").trim().slice(0, 40);
    if (rs) sp.set("review_status", rs);
    const mbs = Array.isArray(w.missingBadges) ? w.missingBadges : [];
    for (const b of mbs) {
      const k = String(b || "").trim().toLowerCase();
      if (k && WEBSITE_MISSING_BADGE_LABEL_BY_KEY[k]) sp.append("missing_badge", k);
    }
    const rr =
      reportReturnHrefValidated != null
        ? normalizeWebsiteQueueReportReturnPath(reportReturnHrefValidated)
        : null;
    if (rr) sp.set("report_return", rr);
    return `/admin/crm?${sp.toString()}`;
  }

  const WEBSITE_SHARE_LABEL_MAX_LEN = 280;

  /** Plain-text bundle of all share formats (labels + same strings as individual fields). */
  function buildWebsiteShareBundleAllFormats(parts) {
    const p = parts && typeof parts === "object" ? parts : {};
    const shareLabel = p.shareLabel != null ? String(p.shareLabel) : "";
    const shareUrl = p.shareUrl != null ? String(p.shareUrl) : "";
    const plainSnippet = p.plainSnippet != null ? String(p.plainSnippet) : "";
    const markdownSnippet = p.markdownSnippet != null ? String(p.markdownSnippet) : "";
    const chatSnippet = p.chatSnippet != null ? String(p.chatSnippet) : "";
    const namedLink = p.namedLink != null ? String(p.namedLink) : "";
    const emailSubject = p.emailSubject != null ? String(p.emailSubject) : "";
    const emailBody = p.emailBody != null ? String(p.emailBody) : "";
    return [
      "Summary",
      shareLabel,
      "",
      "URL",
      shareUrl,
      "",
      "Plain snippet",
      plainSnippet,
      "",
      "Markdown",
      markdownSnippet,
      "",
      "Chat",
      chatSnippet,
      "",
      "Named link",
      namedLink,
      "",
      "Email subject",
      emailSubject,
      "",
      "Email body",
      emailBody,
    ].join("\n");
  }

  function buildWebsiteReportShareLabel(filters, reportHtmlViewSet, highlightSubmissionId) {
    const f = filters && typeof filters === "object" ? filters : {};
    const parts = ["Websites report"];
    if (f.reviewStatus) parts.push(`review ${f.reviewStatus}`);
    if (f.published && f.published !== "all") parts.push(`published ${f.published}`);
    if (f.city) parts.push(`city ${String(f.city).trim()}`);
    if (f.category) parts.push(`category ${String(f.category).trim()}`);
    if (f.qualityTier && f.qualityTier !== "all") parts.push(`quality ${f.qualityTier}`);
    if (f.qualityMin != null) parts.push(`min score ${f.qualityMin}`);
    if (f.hasVerifiedSpecialities && f.hasVerifiedSpecialities !== "all") {
      parts.push(`verified specs ${f.hasVerifiedSpecialities}`);
    }
    if (f.hasHours && f.hasHours !== "all") parts.push(`hours ${f.hasHours}`);
    if (f.hasEstablishedYear && f.hasEstablishedYear !== "all") {
      parts.push(`est. year ${f.hasEstablishedYear}`);
    }
    const vs = String(reportHtmlViewSet || "").trim().toLowerCase();
    if (vs && vs !== "default") parts.push(`columns ${vs}`);
    if (highlightSubmissionId != null) parts.push(`highlight #${highlightSubmissionId}`);
    let s = parts.join(" · ");
    if (s.length > WEBSITE_SHARE_LABEL_MAX_LEN) s = `${s.slice(0, WEBSITE_SHARE_LABEL_MAX_LEN - 1)}…`;
    return s;
  }

  function buildWebsiteQueueShareLabel(wqc, reportReturnHrefValidated) {
    const w = wqc && typeof wqc === "object" ? wqc : {};
    const parts = ["Websites queue"];
    if (w.reviewStatus) parts.push(`review ${w.reviewStatus}`);
    if (w.city) parts.push(`city ${String(w.city).trim()}`);
    if (w.category) parts.push(`category ${String(w.category).trim()}`);
    if (w.qualityTier && w.qualityTier !== "all") parts.push(`quality ${w.qualityTier}`);
    if (w.qualityMin != null) parts.push(`min score ${w.qualityMin}`);
    const mbs = Array.isArray(w.missingBadges) ? w.missingBadges : [];
    if (mbs.length) parts.push(`${mbs.length} missing badges`);
    if (w.hasHours === "yes" || w.hasHours === "no") parts.push(`has hours ${w.hasHours}`);
    if (reportReturnHrefValidated != null && normalizeWebsiteQueueReportReturnPath(reportReturnHrefValidated)) {
      parts.push("linked from report");
    }
    let s = parts.join(" · ");
    if (s.length > WEBSITE_SHARE_LABEL_MAX_LEN) s = `${s.slice(0, WEBSITE_SHARE_LABEL_MAX_LEN - 1)}…`;
    return s;
  }

  /** Per-card report deep link: only params the report route already supports (no queue-only filters). */
  function buildWebsiteQueueCardReportHref(task) {
    const t = task && typeof task === "object" ? task : {};
    const sid = Number(t.source_ref_id);
    const highlightSubmissionId = Number.isFinite(sid) && sid > 0 ? Math.trunc(sid) : null;
    return websiteQueueFilteredReportHrefFromControls({
      reviewStatus: t.website_queue_review_status,
      city: t.website_queue_city,
      qualityTier: t.website_quality_tier,
      category: t.website_queue_category,
      highlightSubmissionId,
    });
  }

  /** HTML-only: optional row highlight; ignored for CSV and filtering. */
  function parseWebsiteReportHighlightSubmissionId(query) {
    const raw = String((query && query.highlight_submission_id) || "").trim();
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.trunc(n);
  }

  /** Queue only: safe relative path back to the Websites report (no open redirects). */
  function normalizeWebsiteQueueReportReturnPath(raw) {
    const rawStr = String(raw == null ? "" : raw).trim();
    if (!rawStr) return null;
    let decoded = rawStr;
    try {
      decoded = decodeURIComponent(rawStr);
    } catch {
      return null;
    }
    if (/[\0\r\n]/.test(decoded)) return null;
    if (!decoded.startsWith("/admin/crm/websites/report")) return null;
    if (decoded.includes("://")) return null;
    if (decoded.length > 2048) return null;
    return decoded;
  }

  function parseWebsiteQueueReportReturn(query) {
    return normalizeWebsiteQueueReportReturnPath(query && query.report_return);
  }

  function mergeWebsiteReportReturnWithSubmission(safeReportPath, submissionId) {
    const base = normalizeWebsiteQueueReportReturnPath(safeReportPath);
    if (!base) return null;
    const qMark = base.indexOf("?");
    const sp = qMark >= 0 ? new URLSearchParams(base.slice(qMark + 1)) : new URLSearchParams();
    const sid = Number(submissionId);
    if (Number.isFinite(sid) && sid > 0) sp.set("highlight_submission_id", String(Math.trunc(sid)));
    else sp.delete("highlight_submission_id");
    const qs = sp.toString();
    const out = qs ? `/admin/crm/websites/report?${qs}` : "/admin/crm/websites/report";
    return out.length <= 2048 ? out : null;
  }

  function parseWebsiteBulkSelection(body) {
    const raw = body && body.crm_task_ids ? body.crm_task_ids : [];
    const list = Array.isArray(raw) ? raw : [raw];
    const out = [];
    const seen = new Set();
    for (const v of list) {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1) continue;
      const key = String(Math.trunc(n));
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(Math.trunc(n));
      if (out.length >= 200) break;
    }
    return out;
  }

  function parseWebsiteQueueQualityControls(query) {
    const q = query || {};
    const tierRaw = String(q.quality_tier || "all").trim().toLowerCase();
    const qualityTier =
      tierRaw === "high" || tierRaw === "medium" || tierRaw === "low" ? tierRaw : "all";
    const minRaw = String(q.quality_min || "").trim();
    const minNum = Number(minRaw);
    const qualityMin =
      Number.isFinite(minNum) && minNum >= 0 && minNum <= 100 ? Math.floor(minNum) : null;
    const sortRaw = String(q.quality_sort || "").trim().toLowerCase();
    const qualitySort = sortRaw === "asc" || sortRaw === "desc" ? sortRaw : "none";
    const city = String(q.city || "").trim().slice(0, 120);
    const category = String(q.category || "").trim().slice(0, 80);
    const hasHoursRaw = String(q.has_hours || "all").trim().toLowerCase();
    const hasHours = hasHoursRaw === "yes" || hasHoursRaw === "no" ? hasHoursRaw : "all";
    const reviewStatus = String(q.review_status || "").trim().slice(0, 40);
    const missingBadgeRaw = q.missing_badge;
    const missingBadgeList =
      missingBadgeRaw == null ? [] : Array.isArray(missingBadgeRaw) ? missingBadgeRaw : [missingBadgeRaw];
    const missingBadges = [];
    const missingSeen = new Set();
    for (const item of missingBadgeList) {
      const k = String(item || "").trim().toLowerCase();
      if (!k || !WEBSITE_MISSING_BADGE_LABEL_BY_KEY[k] || missingSeen.has(k)) continue;
      missingSeen.add(k);
      missingBadges.push(k);
    }
    return { qualityTier, qualityMin, qualitySort, city, category, hasHours, reviewStatus, missingBadges };
  }

  function computeWebsiteQueueQuality(snapshot) {
    const s = snapshot && typeof snapshot === "object" ? snapshot : {};
    const draft = s.website_listing_draft_json && typeof s.website_listing_draft_json === "object" ? s.website_listing_draft_json : {};
    const listingName = String(draft.listing_name || "").trim();
    const about = String(draft.about || "").trim();
    const email = String(draft.email || "").trim();
    const phone = String(draft.listing_phone || s.phone_raw || "").trim();
    const specialitiesCount = Number(s.specialities_count || 0);
    const hoursDaysCount = Number(s.hours_days_count || 0);
    const establishedYear =
      s.established_year != null && Number.isFinite(Number(s.established_year)) ? Number(s.established_year) : null;
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasPhone = phone.length >= 7;
    let score = 0;
    if (listingName) score += 20;
    if (about.length >= 30) score += 25;
    else if (about) score += 10;
    if (hasEmail || hasPhone) score += 20;
    if (specialitiesCount > 0) score += 15;
    if (hoursDaysCount >= 5) score += 10;
    else if (hoursDaysCount > 0) score += 5;
    if (establishedYear != null) score += 10;
    if (score < 0) score = 0;
    if (score > 100) score = 100;
    const tier = score >= 75 ? "high" : score >= 45 ? "medium" : "low";
    return { score, tier };
  }

  function computeWebsiteMissingBadgeKeys(snapshot) {
    const s = snapshot && typeof snapshot === "object" ? snapshot : {};
    const draft = s.website_listing_draft_json && typeof s.website_listing_draft_json === "object" ? s.website_listing_draft_json : {};
    const badges = [];
    const listingName = String(draft.listing_name || "").trim();
    const about = String(draft.about || "").trim();
    const email = String(draft.email || "").trim();
    const phone = String(draft.listing_phone || s.phone_raw || "").trim();
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const hasPhone = phone.length >= 7;
    const specialitiesCount = Number(s.specialities_count || 0);
    const hoursDaysCount = Number(s.hours_days_count || 0);
    const establishedYear =
      s.established_year != null && Number.isFinite(Number(s.established_year)) ? Number(s.established_year) : null;
    if (!listingName) badges.push("missing_business_name");
    if (!about) badges.push("missing_about");
    else if (about.length < 30) badges.push("short_about");
    if (!hasEmail && !hasPhone) badges.push("missing_contact");
    if (specialitiesCount < 1) badges.push("missing_specialities");
    if (hoursDaysCount < 1) badges.push("missing_hours");
    if (establishedYear == null) badges.push("missing_established_year");
    return badges;
  }

  function computeWebsiteMissingBadges(snapshot) {
    const keys = computeWebsiteMissingBadgeKeys(snapshot);
    return keys
      .map((k) => WEBSITE_MISSING_BADGE_LABEL_BY_KEY[k])
      .filter(Boolean);
  }

  function buildWebsiteReportRowQueueHref(row, forcedMissingBadgeKey, reportReturnQueryString) {
    const sp = new URLSearchParams();
    sp.set("queue", "websites");
    sp.set("review_status", String(row.review_status || "").trim() || "not_submitted");
    const tier = String(row.quality_tier || "").trim().toLowerCase();
    if (tier === "high" || tier === "medium" || tier === "low") sp.set("quality_tier", tier);
    const city = String(row.website_report_queue_city || "").trim().slice(0, 120);
    if (city) sp.set("city", city);
    const category = String(row.website_report_queue_category || "").trim().slice(0, 80);
    if (category) sp.set("category", category);
    const mbKeys = computeWebsiteMissingBadgeKeys(row);
    const force = String(forcedMissingBadgeKey || "").trim().toLowerCase();
    if (WEBSITE_MISSING_BADGE_LABEL_BY_KEY[force]) {
      sp.set("missing_badge", force);
    } else if (mbKeys.length) {
      sp.set("missing_badge", mbKeys[0]);
    }
    const rrq = String(reportReturnQueryString || "").trim();
    if (rrq) {
      const retPath = `/admin/crm/websites/report?${rrq}`;
      if (retPath.length <= 2048) sp.set("report_return", retPath);
    }
    return `/admin/crm?${sp.toString()}`;
  }

  function websitesQueueRedirect(req, extraParams) {
    const returnQueryRaw = String((req.body && req.body.return_query) || "").trim();
    const sp = new URLSearchParams();
    sp.set("queue", "websites");
    if (returnQueryRaw.startsWith("?")) {
      const src = new URLSearchParams(returnQueryRaw.slice(1));
      for (const [k, v] of src.entries()) {
        if (k === "bulk_notice" || k === "bulk_error") continue;
        if (!k) continue;
        if (k === "missing_badge") sp.append(k, v);
        else sp.set(k, v);
      }
    }
    const extras = extraParams && typeof extraParams === "object" ? extraParams : {};
    for (const [k, v] of Object.entries(extras)) {
      if (v == null || v === "") continue;
      sp.set(k, String(v));
    }
    return `/admin/crm?${sp.toString()}`;
  }

  function hoursCompletenessLabel(daysCount) {
    const n = Number(daysCount || 0);
    if (n >= 7) return "complete";
    if (n > 0) return "partial";
    return "none";
  }

  function csvCell(value) {
    const s = String(value == null ? "" : value);
    return `"${s.replace(/"/g, '""')}"`;
  }

  const WEBSITE_REPORT_CSV_COLUMN_KEYS_DEFAULT = [
    "submission_id",
    "lead_name",
    "tenant",
    "field_agent",
    "review_status",
    "published",
    "quality_score",
    "quality_tier",
    "established_year",
    "has_established_year",
    "specialities_count",
    "verified_specialities_count",
    "hours_completeness",
    "has_hours",
    "submission_updated_at",
    "review_requested_at",
    "company_created_at",
    "city",
    "missing_count",
    "missing_summary",
  ];
  const WEBSITE_REPORT_CSV_SETS = {
    default: WEBSITE_REPORT_CSV_COLUMN_KEYS_DEFAULT,
    moderation: [
      "submission_id",
      "lead_name",
      "city",
      "tenant",
      "field_agent",
      "phone_raw",
      "review_status",
      "published",
      "submission_updated_at",
      "review_requested_at",
    ],
    quality: [
      "submission_id",
      "lead_name",
      "city",
      "quality_score",
      "quality_tier",
      "established_year",
      "has_established_year",
      "specialities_count",
      "verified_specialities_count",
      "hours_completeness",
      "has_hours",
      "missing_count",
      "missing_summary",
    ],
    publish_readiness: [
      "submission_id",
      "lead_name",
      "tenant",
      "field_agent",
      "review_status",
      "published",
      "company_id",
      "quality_score",
      "quality_tier",
      "verified_specialities_count",
      "has_hours",
      "has_established_year",
      "established_year",
      "review_requested_at",
      "company_created_at",
      "missing_count",
      "missing_summary",
    ],
  };

  function normalizeWebsiteReportExportSet(query) {
    const raw = String((query && query.export_set) || "").trim().toLowerCase();
    if (raw === "moderation" || raw === "quality" || raw === "publish_readiness") return raw;
    return "default";
  }

  const WEBSITE_REPORT_HTML_ALL_COLUMNS = [
    "submission",
    "tenant",
    "field_agent",
    "review",
    "published",
    "quality",
    "established",
    "est_set",
    "specs",
    "verified",
    "hours",
    "has_hours",
    "updated",
    "submitted",
    "published_at",
    "missing_summary",
    "actions",
  ];
  const WEBSITE_REPORT_HTML_VIEWS = {
    default: [...WEBSITE_REPORT_HTML_ALL_COLUMNS],
    moderation: [
      "submission",
      "tenant",
      "field_agent",
      "review",
      "published",
      "updated",
      "submitted",
      "missing_summary",
      "actions",
    ],
    quality: [
      "submission",
      "review",
      "published",
      "quality",
      "established",
      "est_set",
      "specs",
      "verified",
      "hours",
      "has_hours",
      "missing_summary",
      "actions",
    ],
    publish_readiness: [
      "submission",
      "tenant",
      "field_agent",
      "review",
      "published",
      "quality",
      "verified",
      "has_hours",
      "established",
      "est_set",
      "submitted",
      "published_at",
      "missing_summary",
      "actions",
    ],
  };

  function normalizeWebsiteReportHtmlViewSet(query) {
    const raw = String((query && query.view_set) || "").trim().toLowerCase();
    if (raw === "moderation" || raw === "quality" || raw === "publish_readiness") return raw;
    return "default";
  }

  function websiteReportFiltersSearchParams(filters) {
    const sp = new URLSearchParams();
    if (filters.reviewStatus) sp.set("review_status", filters.reviewStatus);
    if (filters.published && filters.published !== "all") sp.set("published", filters.published);
    if (filters.city) sp.set("city", filters.city);
    if (filters.qualityTier && filters.qualityTier !== "all") sp.set("quality_tier", filters.qualityTier);
    if (filters.qualityMin != null) sp.set("quality_min", String(filters.qualityMin));
    if (filters.hasVerifiedSpecialities && filters.hasVerifiedSpecialities !== "all") {
      sp.set("has_verified_specialities", filters.hasVerifiedSpecialities);
    }
    if (filters.hasHours && filters.hasHours !== "all") sp.set("has_hours", filters.hasHours);
    if (filters.hasEstablishedYear && filters.hasEstablishedYear !== "all") {
      sp.set("has_established_year", filters.hasEstablishedYear);
    }
    if (filters.category) sp.set("category", String(filters.category).trim().slice(0, 80));
    return sp;
  }

  function websiteReportCsvQueryString(filters, exportSet) {
    const sp = websiteReportFiltersSearchParams(filters);
    sp.set("format", "csv");
    const es = String(exportSet || "").trim().toLowerCase();
    if (es === "moderation" || es === "quality" || es === "publish_readiness") sp.set("export_set", es);
    return sp.toString();
  }

  function websiteReportHtmlPageQueryString(filters, viewSlug, highlightSubmissionId) {
    const sp = websiteReportFiltersSearchParams(filters);
    const vs = String(viewSlug || "").trim().toLowerCase();
    if (vs === "moderation" || vs === "quality" || vs === "publish_readiness") sp.set("view_set", vs);
    const hi = highlightSubmissionId != null ? Number(highlightSubmissionId) : NaN;
    if (Number.isFinite(hi) && hi > 0) sp.set("highlight_submission_id", String(Math.trunc(hi)));
    return sp.toString();
  }

  function buildWebsiteReportCsvRowCells(row) {
    const leadName = `${String(row.first_name || "").trim()} ${String(row.last_name || "").trim()}`.trim();
    const tenantLabel = `${String(row.tenant_name || "").trim()} (${String(row.tenant_slug || "").trim()})`.trim();
    const fieldAgentLabel =
      String(row.field_agent_display_name || "").trim() || String(row.field_agent_username || "").trim();
    const published = row.company_id != null ? "yes" : "no";
    const status = String(row.website_listing_review_status || "").trim() || "not_submitted";
    const hoursCompleteness = hoursCompletenessLabel(row.hours_days_count);
    const mbKeys = computeWebsiteMissingBadgeKeys(row);
    const missingLabels = mbKeys.map((k) => WEBSITE_MISSING_BADGE_LABEL_BY_KEY[k] || k);
    return {
      submission_id: row.submission_id,
      lead_name: leadName,
      tenant: tenantLabel,
      field_agent: fieldAgentLabel,
      review_status: status,
      published,
      quality_score: row.quality_score != null ? Number(row.quality_score) : "",
      quality_tier: row.quality_tier || "",
      established_year: row.established_year != null ? Number(row.established_year) : "",
      has_established_year: row.established_year != null ? "yes" : "no",
      specialities_count: Number(row.specialities_count || 0),
      verified_specialities_count: Number(row.verified_specialities_count || 0),
      hours_completeness: hoursCompleteness,
      has_hours: Number(row.hours_days_count || 0) > 0 ? "yes" : "no",
      submission_updated_at: row.submission_updated_at || "",
      review_requested_at: row.website_listing_review_requested_at || "",
      company_created_at: row.company_created_at || "",
      city: row.city || "",
      phone_raw: row.phone_raw || "",
      company_id: row.company_id != null ? Number(row.company_id) : "",
      missing_count: mbKeys.length,
      missing_summary: missingLabels.join(", "),
    };
  }

  function buildWebsiteReportCsv(rows, exportSet) {
    const setKey =
      exportSet === "moderation" || exportSet === "quality" || exportSet === "publish_readiness" ? exportSet : "default";
    const keys = WEBSITE_REPORT_CSV_SETS[setKey] || WEBSITE_REPORT_CSV_SETS.default;
    const lines = [keys.map((k) => csvCell(k)).join(",")];
    for (const row of rows || []) {
      const cells = buildWebsiteReportCsvRowCells(row);
      lines.push(keys.map((k) => csvCell(cells[k])).join(","));
    }
    return `${lines.join("\n")}\n`;
  }

  async function loadCrmTaskDetailData(req, rawId) {
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(rawId);
    if (!id || id < 1) return null;
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return null;
    if (normalizeRole(role) === ROLES.CSR) {
      const st = normalizeCrmTaskStatus(task.status);
      const unassigned = task.owner_id == null && st === "new";
      const isMine = task.owner_id != null && Number(task.owner_id) === Number(uid);
      if (!unassigned && !isMine) return null;
    }
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    const canEdit = canMutateCrm(role) && (isOwner || superU);
    const showClaim =
      canClaimCrmTasks(role) &&
      task.owner_id == null &&
      normalizeCrmTaskStatus(task.status) === "new";

    const comments = await crmTasksRepo.listCommentsForTask(pool, id, tid);
    const tenantUsersForReassign = superU ? await crmTasksRepo.listTenantUsersForCrm(pool, tid) : [];
    const auditLogs = await crmTasksRepo.listAuditForTask(pool, id, tid);

    let fieldAgentProviderSubmission = null;
    const _srcType = String(task.source_type || "").trim();
    if (
      (_srcType === "field_agent_provider" || _srcType === "field_agent_website_listing") &&
      task.source_ref_id != null
    ) {
      const refId = Number(task.source_ref_id);
      if (Number.isFinite(refId) && refId > 0) {
        fieldAgentProviderSubmission = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, refId);
      }
    }

    return {
      activeNav: "crm",
      task,
      fieldAgentProviderSubmission,
      comments,
      auditLogs,
      crmTaskStatusLabel,
      CRM_TASK_STATUSES,
      currentStatus: normalizeCrmTaskStatus(task.status),
      canEdit,
      isOwner,
      showClaim,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      tenantUsersForReassign,
    };
  }

  router.get("/crm", requireCrmAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);

    const pool = getPgPool();
    const csrBoard = normalizeRole(role) === ROLES.CSR;
    const websitesOnly = String((req.query && req.query.queue) || "").trim() === "websites";
    const websiteQualityControls = parseWebsiteQueueQualityControls(req.query || {});
    const websiteQueueReportReturnHref = websitesOnly ? parseWebsiteQueueReportReturn(req.query || {}) : null;
    if (websitesOnly && !canAccessWebsiteQueue(role)) {
      return res.status(403).type("text").send("Websites queue is not available for your role.");
    }
    const rows = csrBoard
      ? await crmTasksRepo.listTasksForBoardCsrScope(pool, tid, uid)
      : await crmTasksRepo.listTasksForBoard(pool, tid);
    const filteredRows = websitesOnly
      ? rows.filter((t) => String(t.source_type || "").trim() === fieldAgentCrm.WEBSITE_LISTING_CRM_SOURCE)
      : rows;

    if (websitesOnly && filteredRows.length) {
      const websiteSubmissionIds = filteredRows
        .map((t) => Number(t.source_ref_id))
        .filter((n) => Number.isFinite(n) && n > 0);
      const qualityRows = await fieldAgentSubmissionsRepo.listWebsiteQueueQualityRowsBySubmissionIdsForAdmin(
        pool,
        tid,
        websiteSubmissionIds
      );
      const qualityBySubmissionId = new Map();
      for (const row of qualityRows) {
        qualityBySubmissionId.set(Number(row.submission_id), computeWebsiteQueueQuality(row));
      }
      const tenantCategories = await categoriesRepo.listByTenantId(pool, tid);
      const categoryById = new Map(
        (tenantCategories || [])
          .map((c) => ({
            id: Number(c.id),
            name: String(c.name || "").trim(),
          }))
          .filter((x) => Number.isFinite(x.id) && x.id > 0)
          .map((x) => [x.id, x.name])
      );
      for (const t of filteredRows) {
        const sid = Number(t.source_ref_id);
        const q = qualityBySubmissionId.get(sid);
        const row = qualityRows.find((r) => Number(r.submission_id) === sid) || null;
        const draft = row && row.website_listing_draft_json && typeof row.website_listing_draft_json === "object" ? row.website_listing_draft_json : {};
        const city = String((draft.location || row && row.city || "") || "").trim();
        const catRaw = draft.category_id;
        const catId = catRaw != null && String(catRaw).trim() !== "" ? Number(catRaw) : null;
        const categoryName =
          catId != null && Number.isFinite(catId) && catId > 0 && categoryById.has(catId)
            ? String(categoryById.get(catId) || "")
            : "";
        t.website_queue_city = city;
        t.website_queue_category = categoryName;
        t.website_queue_review_status = String((row && row.website_listing_review_status) || "").trim();
        t.website_queue_has_hours = Number((row && row.hours_days_count) || 0) > 0;
        if (q) {
          t.website_quality_score = q.score;
          t.website_quality_tier = q.tier;
        } else {
          t.website_quality_score = 0;
          t.website_quality_tier = "low";
        }
        t.website_missing_badge_keys = row ? computeWebsiteMissingBadgeKeys(row) : ["missing_business_name", "missing_about"];
        t.website_missing_badges = row
          ? computeWebsiteMissingBadges(row)
          : ["Missing business name", "Missing about text"];
        const baseCardReportHref = buildWebsiteQueueCardReportHref(t);
        t.website_queue_report_href =
          websiteQueueReportReturnHref != null
            ? mergeWebsiteReportReturnWithSubmission(websiteQueueReportReturnHref, t.source_ref_id) || baseCardReportHref
            : baseCardReportHref;
      }
      let qualityFilteredRows = filteredRows;
      if (websiteQualityControls.city) {
        const cityNeedle = String(websiteQualityControls.city || "").toLowerCase();
        qualityFilteredRows = qualityFilteredRows.filter((t) =>
          String(t.website_queue_city || "").toLowerCase().includes(cityNeedle)
        );
      }
      if (websiteQualityControls.category) {
        const catNeedle = String(websiteQualityControls.category || "").toLowerCase();
        qualityFilteredRows = qualityFilteredRows.filter(
          (t) => String(t.website_queue_category || "").toLowerCase() === catNeedle
        );
      }
      if (websiteQualityControls.reviewStatus) {
        qualityFilteredRows = qualityFilteredRows.filter(
          (t) => String(t.website_queue_review_status || "") === websiteQualityControls.reviewStatus
        );
      }
      if (websiteQualityControls.missingBadges && websiteQualityControls.missingBadges.length) {
        const sel = websiteQualityControls.missingBadges;
        qualityFilteredRows = qualityFilteredRows.filter((t) => {
          const keys = t.website_missing_badge_keys;
          if (!Array.isArray(keys)) return false;
          return sel.some((b) => keys.includes(b));
        });
      }
      if (websiteQualityControls.hasHours === "yes") {
        qualityFilteredRows = qualityFilteredRows.filter((t) => !!t.website_queue_has_hours);
      } else if (websiteQualityControls.hasHours === "no") {
        qualityFilteredRows = qualityFilteredRows.filter((t) => !t.website_queue_has_hours);
      }
      if (websiteQualityControls.qualityTier !== "all") {
        qualityFilteredRows = qualityFilteredRows.filter(
          (t) => String(t.website_quality_tier || "") === websiteQualityControls.qualityTier
        );
      }
      if (websiteQualityControls.qualityMin != null) {
        qualityFilteredRows = qualityFilteredRows.filter(
          (t) => Number(t.website_quality_score || 0) >= websiteQualityControls.qualityMin
        );
      }
      if (websiteQualityControls.qualitySort === "asc" || websiteQualityControls.qualitySort === "desc") {
        const dir = websiteQualityControls.qualitySort === "asc" ? 1 : -1;
        qualityFilteredRows = [...qualityFilteredRows].sort((a, b) => {
          const av = Number(a.website_quality_score || 0);
          const bv = Number(b.website_quality_score || 0);
          if (av === bv) return 0;
          return av > bv ? dir : -dir;
        });
      }
      filteredRows.length = 0;
      filteredRows.push(...qualityFilteredRows);
      res.locals.websiteQueueCityOptions = [
        ...new Set(
          (qualityRows || [])
            .map((r) => {
              const d = r.website_listing_draft_json && typeof r.website_listing_draft_json === "object" ? r.website_listing_draft_json : {};
              return String((d.location || r.city || "") || "").trim();
            })
            .filter(Boolean)
        ),
      ].sort((a, b) => String(a).localeCompare(String(b)));
      res.locals.websiteQueueCategoryOptions = [...new Set((tenantCategories || []).map((c) => String(c.name || "").trim()).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b))
      );
    }

    for (const t of filteredRows) {
      t.canDrag =
        canMutateCrm(role) &&
        (superU ||
          (!t.owner_id && normalizeCrmTaskStatus(t.status) === "new" && canClaimCrmTasks(role)) ||
          (t.owner_id != null && Number(t.owner_id) === Number(uid)));
    }

    const tasksByStatus = {};
    for (const s of CRM_TASK_STATUSES) tasksByStatus[s] = [];
    for (const t of filteredRows) {
      const st = normalizeCrmTaskStatus(t.status);
      if (tasksByStatus[st]) tasksByStatus[st].push(t);
    }

    let crmTenantUsers = await crmTasksRepo.listTenantUsersForCrm(pool, tid);
    if (!crmTenantUsers.length) {
      const uname = req.session.adminUser.username || "You";
      crmTenantUsers = [{ id: uid, username: uname }];
    }

    const unassignedTasks = filteredRows.filter(
      (t) => t.owner_id == null && normalizeCrmTaskStatus(t.status) === "new"
    );

    const websiteQueueSharePath = websitesOnly
      ? buildWebsiteQueueSharePath(websiteQualityControls, websiteQueueReportReturnHref)
      : null;
    const queueShareHost = String(req.get("x-forwarded-host") || req.get("host") || "").trim();
    const queueShareProtoRaw = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
    const queueShareProto =
      queueShareProtoRaw || (req.protocol && String(req.protocol).replace(/:$/, "")) || "http";
    const websiteQueueShareUrl =
      websitesOnly && websiteQueueSharePath
        ? queueShareHost
          ? `${queueShareProto}://${queueShareHost}${websiteQueueSharePath}`
          : websiteQueueSharePath
        : null;
    const websiteQueueShareLabel = websitesOnly
      ? buildWebsiteQueueShareLabel(websiteQualityControls, websiteQueueReportReturnHref)
      : null;
    const websiteQueueShareSnippet =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? `${websiteQueueShareLabel}\n${websiteQueueShareUrl}`
        : null;
    const websiteQueueShareSnippetMarkdown =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? `[${websiteQueueShareLabel}](${websiteQueueShareUrl})`
        : null;
    const websiteQueueShareChatSnippet =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? `<${websiteQueueShareUrl}|${websiteQueueShareLabel}>`
        : null;
    const websiteQueueShareNamedLink =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? `${websiteQueueShareLabel} — ${websiteQueueShareUrl}`
        : null;
    const websiteQueueShareEmailSubject =
      websitesOnly && websiteQueueShareLabel ? websiteQueueShareLabel : null;
    const websiteQueueShareEmailBody =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? `${websiteQueueShareLabel}\n\n${websiteQueueShareUrl}`
        : null;
    const websiteQueueShareMailtoDraftHref =
      websiteQueueShareEmailSubject != null && websiteQueueShareEmailBody
        ? `mailto:?subject=${encodeURIComponent(websiteQueueShareEmailSubject)}&body=${encodeURIComponent(websiteQueueShareEmailBody)}`
        : null;
    const websiteQueueShareBundleQuickLink = websiteQueueShareNamedLink;
    const websiteQueueShareBundleEmailReady =
      websiteQueueShareEmailSubject != null && websiteQueueShareEmailBody
        ? `Subject: ${websiteQueueShareEmailSubject}\n\n${websiteQueueShareEmailBody}`
        : null;
    const websiteQueueShareBundleChatReady = websiteQueueShareChatSnippet;
    const websiteQueueShareBundleAllFormats =
      websitesOnly && websiteQueueShareUrl && websiteQueueShareLabel
        ? buildWebsiteShareBundleAllFormats({
            shareLabel: websiteQueueShareLabel,
            shareUrl: websiteQueueShareUrl,
            plainSnippet: websiteQueueShareSnippet,
            markdownSnippet: websiteQueueShareSnippetMarkdown,
            chatSnippet: websiteQueueShareChatSnippet,
            namedLink: websiteQueueShareNamedLink,
            emailSubject: websiteQueueShareEmailSubject,
            emailBody: websiteQueueShareEmailBody,
          })
        : null;

    const websiteQueueShareDeepLinks =
      websitesOnly && websiteQueueSharePath ? buildWebsiteShareDeepLinks(websiteQueueSharePath) : null;

    return res.render("admin/crm", {
      activeNav: "crm",
      tasksByStatus,
      unassignedTasks,
      CRM_TASK_STATUSES,
      crmTaskStatusLabel,
      canMutateCrm: canMutateCrm(role),
      canClaimCrmTasks: canClaimCrmTasks(role),
      isSuperCrm: superU,
      currentUserId: uid,
      currentUsername: req.session.adminUser.username || "",
      crmTenantUsers,
      crmCsrScopedBoard: csrBoard,
      crmWebsitesOnly: websitesOnly,
      canAccessWebsiteQueue: canAccessWebsiteQueue(role),
      crmWebsiteReportUrl: "/admin/crm/websites/report",
      websiteBulkNotice: String((req.query && req.query.bulk_notice) || "").trim(),
      websiteBulkError: String((req.query && req.query.bulk_error) || "").trim(),
      websiteQualityControls,
      websiteQueueReturnQuery: req.originalUrl && req.originalUrl.includes("?") ? `?${req.originalUrl.split("?")[1]}` : "?queue=websites",
      websiteQueueFilteredReportHref: websitesOnly
        ? websiteQueueFilteredReportHrefFromControls(websiteQualityControls)
        : null,
      websiteQueueReportReturnHref,
      websiteQueueSharePath,
      websiteQueueShareUrl,
      websiteQueueShareLabel,
      websiteQueueShareSnippet,
      websiteQueueShareSnippetMarkdown,
      websiteQueueShareChatSnippet,
      websiteQueueShareNamedLink,
      websiteQueueShareEmailSubject,
      websiteQueueShareEmailBody,
      websiteQueueShareMailtoDraftHref,
      websiteQueueShareBundleQuickLink,
      websiteQueueShareBundleEmailReady,
      websiteQueueShareBundleChatReady,
      websiteQueueShareBundleAllFormats,
      websiteQueueShareTarget: websitesOnly ? parseWebsiteShareTarget(req.query || {}) : null,
      websiteQueueShareAdvancedOpen:
        websitesOnly &&
        (parseWebsiteShareViewAdvancedOpen(req.query || {}) ||
          parseWebsiteShareTarget(req.query || {}) != null),
      websiteQueueShareDeepLinks,
      websiteQueueCityOptions: res.locals.websiteQueueCityOptions || [],
      websiteQueueCategoryOptions: res.locals.websiteQueueCategoryOptions || [],
      websiteQueueMissingBadgeOptions: WEBSITE_MISSING_BADGE_DEFS,
    });
  });

  router.post("/crm/websites/bulk-review", requireCrmAccess, async (req, res) => {
    const role = req.session.adminUser.role;
    if (!canAccessWebsiteQueue(role)) {
      return res.status(403).type("text").send("Websites bulk moderation is not available for your role.");
    }
    if (!canMutateCrm(role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    const action = String((req.body && req.body.bulk_action) || "").trim();
    if (action !== "changes_requested" && action !== "publish_ready") {
      return res.redirect(websitesQueueRedirect(req, { bulk_error: "Invalid bulk action." }));
    }
    const comment = String((req.body && req.body.bulk_comment) || "").trim().slice(0, 4000);
    if (action === "changes_requested" && !comment) {
      return res.redirect(websitesQueueRedirect(req, { bulk_error: "Comment is required for bulk changes requested." }));
    }
    const taskIds = parseWebsiteBulkSelection(req.body || {});
    if (!taskIds.length) {
      return res.redirect(websitesQueueRedirect(req, { bulk_error: "Select at least one item." }));
    }

    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const taskId of taskIds) {
      const task = await crmTasksRepo.getTaskByIdAndTenant(pool, taskId, tid);
      if (!task) {
        skipped += 1;
        continue;
      }
      if (String(task.source_type || "").trim() !== fieldAgentCrm.WEBSITE_LISTING_CRM_SOURCE || task.source_ref_id == null) {
        skipped += 1;
        continue;
      }
      const sid = Number(task.source_ref_id);
      if (!Number.isFinite(sid) || sid < 1) {
        skipped += 1;
        continue;
      }
      if (action === "changes_requested") {
        const ok = await fieldAgentSubmissionsRepo.setWebsiteListingReviewOutcomeForAdmin(pool, {
          tenantId: tid,
          submissionId: sid,
          reviewStatus: "changes_requested",
          reviewComment: comment,
        });
        if (ok) updated += 1;
        else skipped += 1;
        continue;
      }
      const sub = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, sid);
      if (!sub || String(sub.status || "") !== "approved") {
        skipped += 1;
        continue;
      }
      const pubRes = await publishWebsiteListingForAdmin(pool, {
        tenantId: tid,
        submissionId: sid,
        adminUserId: req.session && req.session.adminUser ? Number(req.session.adminUser.id) : null,
      });
      if (pubRes.ok) {
        updated += 1;
      } else if (pubRes.kind === "skip") {
        skipped += 1;
      } else {
        failed += 1;
      }
    }
    const verb = action === "publish_ready" ? "published" : "updated";
    const msg = `Bulk action complete: ${updated} ${verb}, ${skipped} skipped, ${failed} failed.`;
    return res.redirect(websitesQueueRedirect(req, { bulk_notice: msg }));
  });

  router.get("/crm/websites/report", requireCrmAccess, async (req, res) => {
    const role = req.session.adminUser.role;
    if (!canAccessWebsiteQueue(role)) {
      return res.status(403).type("text").send("Websites report is not available for your role.");
    }
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const filters = parseWebsiteReportFilters(req.query || {});
    const reportHtmlViewSetForQueueReturn = normalizeWebsiteReportHtmlViewSet(req.query || {});
    const rows = await fieldAgentSubmissionsRepo.listWebsiteContentReportRowsForAdmin(pool, tid, {
      reviewStatus: filters.reviewStatus,
      published: filters.published,
      city: filters.city,
      limit: 2000,
    });
    const tenantCategories = await categoriesRepo.listByTenantId(pool, tid);
    const categoryById = new Map(
      (tenantCategories || [])
        .map((c) => ({
          id: Number(c.id),
          name: String(c.name || "").trim(),
        }))
        .filter((x) => Number.isFinite(x.id) && x.id > 0)
        .map((x) => [x.id, x.name])
    );
    const mappedRows = (rows || []).map((row) => {
      const q = computeWebsiteQueueQuality(row);
      const draft =
        row.website_listing_draft_json && typeof row.website_listing_draft_json === "object"
          ? row.website_listing_draft_json
          : {};
      const queueCityForLink = String((draft.location || row.city || "") || "").trim().slice(0, 120);
      const catRaw = draft.category_id;
      const catId = catRaw != null && String(catRaw).trim() !== "" ? Number(catRaw) : null;
      const queueCategoryForLink =
        catId != null && Number.isFinite(catId) && catId > 0 && categoryById.has(catId)
          ? String(categoryById.get(catId) || "").trim().slice(0, 80)
          : "";
      const merged = {
        ...row,
        quality_score: q.score,
        quality_tier: q.tier,
        lead_name: `${String(row.first_name || "").trim()} ${String(row.last_name || "").trim()}`.trim(),
        tenant_label: `${String(row.tenant_name || "").trim()} (${String(row.tenant_slug || "").trim()})`.trim(),
        field_agent_label:
          String(row.field_agent_display_name || "").trim() || String(row.field_agent_username || "").trim(),
        review_status: String(row.website_listing_review_status || "").trim() || "not_submitted",
        published: row.company_id != null ? "yes" : "no",
        hours_completeness: hoursCompletenessLabel(row.hours_days_count),
        website_report_queue_city: queueCityForLink,
        website_report_queue_category: queueCategoryForLink,
      };
      const reportQueueReturnQs = websiteReportHtmlPageQueryString(
        filters,
        reportHtmlViewSetForQueueReturn,
        merged.submission_id
      );
      const mbKeysForRow = computeWebsiteMissingBadgeKeys(merged);
      const website_report_missing_slices = mbKeysForRow.slice(0, 3).map((key) => ({
        key,
        href: buildWebsiteReportRowQueueHref(merged, key, reportQueueReturnQs),
        label: WEBSITE_MISSING_BADGE_LABEL_BY_KEY[key] || key,
      }));
      const website_report_missing_summary_labels = mbKeysForRow.map(
        (key) => WEBSITE_MISSING_BADGE_LABEL_BY_KEY[key] || key
      );
      const website_report_missing_count = mbKeysForRow.length;
      const website_report_missing_preview_labels = website_report_missing_summary_labels.slice(0, 2).join(", ");
      const website_report_missing_more_count = Math.max(0, website_report_missing_summary_labels.length - 2);
      return {
        ...merged,
        website_report_queue_href: buildWebsiteReportRowQueueHref(merged, undefined, reportQueueReturnQs),
        website_report_missing_slices,
        website_report_missing_count,
        website_report_missing_preview_labels,
        website_report_missing_more_count,
      };
    });
    const filteredRows = mappedRows.filter((row) => {
      if (filters.category) {
        const catNeedle = String(filters.category || "").toLowerCase();
        if (String(row.website_report_queue_category || "").toLowerCase() !== catNeedle) return false;
      }
      if (filters.qualityTier !== "all" && String(row.quality_tier || "") !== filters.qualityTier) return false;
      if (filters.qualityMin != null && Number(row.quality_score || 0) < Number(filters.qualityMin)) return false;
      if (filters.hasVerifiedSpecialities === "yes" && Number(row.verified_specialities_count || 0) < 1) return false;
      if (filters.hasVerifiedSpecialities === "no" && Number(row.verified_specialities_count || 0) > 0) return false;
      if (filters.hasHours === "yes" && Number(row.hours_days_count || 0) < 1) return false;
      if (filters.hasHours === "no" && Number(row.hours_days_count || 0) > 0) return false;
      if (filters.hasEstablishedYear === "yes" && row.established_year == null) return false;
      if (filters.hasEstablishedYear === "no" && row.established_year != null) return false;
      return true;
    });
    const wantsCsv = String((req.query && req.query.format) || "").trim().toLowerCase() === "csv";
    if (wantsCsv) {
      const reportExportSet = normalizeWebsiteReportExportSet(req.query || {});
      const csv = buildWebsiteReportCsv(filteredRows, reportExportSet);
      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="website-content-report-${stamp}.csv"`);
      return res.send(csv);
    }
    const websiteReportHighlightSubmissionId = parseWebsiteReportHighlightSubmissionId(req.query || {});
    const csvQs = websiteReportCsvQueryString(filters, null);
    const reportHtmlViewSet = normalizeWebsiteReportHtmlViewSet(req.query || {});
    const reportShareQs = websiteReportHtmlPageQueryString(
      filters,
      reportHtmlViewSet,
      websiteReportHighlightSubmissionId
    );
    const websiteReportSharePath = reportShareQs
      ? `/admin/crm/websites/report?${reportShareQs}`
      : "/admin/crm/websites/report";
    const shareHost = String(req.get("x-forwarded-host") || req.get("host") || "").trim();
    const shareProtoRaw = String(req.get("x-forwarded-proto") || "").split(",")[0].trim();
    const shareProto =
      shareProtoRaw || (req.protocol && String(req.protocol).replace(/:$/, "")) || "http";
    const websiteReportShareUrl = shareHost ? `${shareProto}://${shareHost}${websiteReportSharePath}` : websiteReportSharePath;
    const reportHtmlColumns =
      WEBSITE_REPORT_HTML_VIEWS[reportHtmlViewSet] || WEBSITE_REPORT_HTML_VIEWS.default;
    const reportHtmlColumnShow = Object.fromEntries(
      WEBSITE_REPORT_HTML_ALL_COLUMNS.map((k) => [k, reportHtmlColumns.includes(k)])
    );
    const websiteReportShareLabel = buildWebsiteReportShareLabel(
      filters,
      reportHtmlViewSet,
      websiteReportHighlightSubmissionId
    );
    const websiteReportShareSnippet = `${websiteReportShareLabel}\n${websiteReportShareUrl}`;
    const websiteReportShareSnippetMarkdown = `[${websiteReportShareLabel}](${websiteReportShareUrl})`;
    const websiteReportShareChatSnippet = `<${websiteReportShareUrl}|${websiteReportShareLabel}>`;
    const websiteReportShareNamedLink = `${websiteReportShareLabel} — ${websiteReportShareUrl}`;
    const websiteReportShareEmailSubject = websiteReportShareLabel;
    const websiteReportShareEmailBody = `${websiteReportShareLabel}\n\n${websiteReportShareUrl}`;
    const websiteReportShareMailtoDraftHref = `mailto:?subject=${encodeURIComponent(websiteReportShareEmailSubject)}&body=${encodeURIComponent(websiteReportShareEmailBody)}`;
    const websiteReportShareBundleQuickLink = websiteReportShareNamedLink;
    const websiteReportShareBundleEmailReady = `Subject: ${websiteReportShareEmailSubject}\n\n${websiteReportShareEmailBody}`;
    const websiteReportShareBundleChatReady = websiteReportShareChatSnippet;
    const websiteReportShareBundleAllFormats = buildWebsiteShareBundleAllFormats({
      shareLabel: websiteReportShareLabel,
      shareUrl: websiteReportShareUrl,
      plainSnippet: websiteReportShareSnippet,
      markdownSnippet: websiteReportShareSnippetMarkdown,
      chatSnippet: websiteReportShareChatSnippet,
      namedLink: websiteReportShareNamedLink,
      emailSubject: websiteReportShareEmailSubject,
      emailBody: websiteReportShareEmailBody,
    });
    const websiteReportShareDeepLinks = buildWebsiteShareDeepLinks(websiteReportSharePath);
    return res.render("admin/website_content_report", {
      navTitle: "Website content report",
      activeNav: "crm",
      rows: filteredRows,
      filters,
      websiteReportHighlightSubmissionId,
      websiteReportCategoryOptions: [...new Set((tenantCategories || []).map((c) => String(c.name || "").trim()).filter(Boolean))].sort(
        (a, b) => String(a).localeCompare(String(b))
      ),
      reportHtmlViewSet,
      reportHtmlColumnShow,
      reportHtmlColspan: reportHtmlColumns.length,
      htmlViewHrefDefault: `/admin/crm/websites/report?${websiteReportHtmlPageQueryString(
        filters,
        "default",
        websiteReportHighlightSubmissionId
      )}`,
      htmlViewHrefModeration: `/admin/crm/websites/report?${websiteReportHtmlPageQueryString(
        filters,
        "moderation",
        websiteReportHighlightSubmissionId
      )}`,
      htmlViewHrefQuality: `/admin/crm/websites/report?${websiteReportHtmlPageQueryString(
        filters,
        "quality",
        websiteReportHighlightSubmissionId
      )}`,
      htmlViewHrefPublishReadiness: `/admin/crm/websites/report?${websiteReportHtmlPageQueryString(
        filters,
        "publish_readiness",
        websiteReportHighlightSubmissionId
      )}`,
      csvHref: `/admin/crm/websites/report?${csvQs}`,
      csvHrefModeration: `/admin/crm/websites/report?${websiteReportCsvQueryString(filters, "moderation")}`,
      csvHrefQuality: `/admin/crm/websites/report?${websiteReportCsvQueryString(filters, "quality")}`,
      csvHrefPublishReadiness: `/admin/crm/websites/report?${websiteReportCsvQueryString(filters, "publish_readiness")}`,
      canAccessWebsiteQueue: canAccessWebsiteQueue(role),
      websiteReportSharePath,
      websiteReportShareUrl,
      websiteReportShareLabel,
      websiteReportShareSnippet,
      websiteReportShareSnippetMarkdown,
      websiteReportShareChatSnippet,
      websiteReportShareNamedLink,
      websiteReportShareEmailSubject,
      websiteReportShareEmailBody,
      websiteReportShareMailtoDraftHref,
      websiteReportShareBundleQuickLink,
      websiteReportShareBundleEmailReady,
      websiteReportShareBundleChatReady,
      websiteReportShareBundleAllFormats,
      websiteReportShareTarget: parseWebsiteShareTarget(req.query || {}),
      websiteReportShareAdvancedOpen:
        parseWebsiteShareViewAdvancedOpen(req.query || {}) ||
        parseWebsiteShareTarget(req.query || {}) != null,
      websiteReportShareDeepLinks,
    });
  });

  router.get("/crm/tasks/:id/panel", requireCrmAccess, async (req, res) => {
    const data = await loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).type("text").send("Not found");
    return res.render("admin/crm_task_panel", { ...data, overlayMode: true });
  });

  router.get("/crm/tasks/:id", requireCrmAccess, async (req, res) => {
    const data = await loadCrmTaskDetailData(req, req.params.id);
    if (!data) return res.status(404).send("Task not found");
    return res.render("admin/crm_task_detail", { ...data, overlayMode: false });
  });

  router.post("/crm/tasks", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");

    const rawOwner = req.body && req.body.owner_id;
    let ownerId = null;
    if (rawOwner !== "" && rawOwner !== undefined && rawOwner !== null) {
      const n = Number(rawOwner);
      if (n && n > 0) ownerId = n;
    }
    const pool = getPgPool();
    if (ownerId != null) {
      if (!(await crmTasksRepo.userIsInTenant(pool, null, ownerId, tid))) {
        return res.status(400).send("Invalid assignee.");
      }
    }
    const status = ownerId != null ? "in_progress" : "new";

    try {
      await crmTasksRepo.createTaskWithAudit(pool, {
        tenantId: tid,
        title,
        description,
        status,
        ownerId,
        createdById: uid,
        attachmentUrl: attachment_url,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not create task");
    }
    return res.redirect("/admin/crm");
  });

  router.post("/crm/tasks/:id/fields", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found.");
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const isOwner = task.owner_id != null && Number(task.owner_id) === Number(uid);
    if (!superU && !isOwner) return res.status(403).type("text").send("Forbidden.");
    const title = String((req.body && req.body.title) || "").trim().slice(0, 200);
    const description = String((req.body && req.body.description) || "").trim().slice(0, 8000);
    const attachment_url = normalizeCrmAttachmentUrl(req.body && req.body.attachment_url);
    if (!title) return res.status(400).send("Title is required.");
    try {
      const ok = await crmTasksRepo.updateTaskFieldsWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        title,
        description,
        attachmentUrl: attachment_url,
      });
      if (!ok) return res.status(404).send("Not found.");
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/claim", requireCrmAccess, async (req, res) => {
    if (!canClaimCrmTasks(req.session.adminUser.role)) {
      return res.status(403).type("text").send("You cannot claim tasks.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id != null) return res.status(400).send("Task already assigned.");
    try {
      const ok = await crmTasksRepo.claimTaskWithAudit(pool, { tenantId: tid, taskId: id, userId: uid });
      if (!ok) return res.status(400).send("Could not claim");
    } catch (e) {
      return res.status(400).send(e.message || "Could not claim");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/status", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const status = normalizeCrmTaskStatus(req.body && req.body.status);
    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");
    if (task.owner_id == null || Number(task.owner_id) !== Number(uid)) {
      if (!isSuperAdmin(req.session.adminUser.role)) {
        return res.status(403).type("text").send("Only the task owner can change status.");
      }
    }
    const prev = task.status;
    try {
      const ok = await crmTasksRepo.updateTaskStatusWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        status,
        prevStatus: prev,
      });
      if (!ok) return res.status(404).send("Not found");
    } catch (e) {
      return res.status(400).send(e.message || "Could not update");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  router.post("/crm/tasks/:id/move", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).json({ error: "Read-only access." });
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const role = req.session.adminUser.role;
    const superU = isSuperAdmin(role);
    const id = Number(req.params.id);
    const newStatus = normalizeCrmTaskStatus(req.body && req.body.status);
    if (!id || id < 1) return res.status(400).json({ error: "Invalid id" });

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).json({ error: "Not found" });

    const prev = normalizeCrmTaskStatus(task.status);
    if (prev === newStatus) return res.json({ ok: true });

    if (!superU) {
      if (!task.owner_id) {
        if (prev !== "new") return res.status(403).json({ error: "Forbidden" });
        if (newStatus === "new") return res.json({ ok: true });
        if (!canClaimCrmTasks(role)) return res.status(403).json({ error: "Cannot claim" });
      } else if (Number(task.owner_id) !== Number(uid)) {
        return res.status(403).json({ error: "Only the owner can move this task" });
      }
    }

    let nextOwnerId = task.owner_id;
    if (newStatus === "new") {
      if (superU) {
        nextOwnerId = null;
      } else if (task.owner_id) {
        return res.status(403).json({ error: "Cannot move to unassigned pool" });
      }
    } else if (!task.owner_id) {
      nextOwnerId = uid;
    }

    try {
      await crmTasksRepo.moveKanbanWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        newStatus,
        prevStatus: prev,
        task,
        nextOwnerId,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not move" });
    }
    return res.json({ ok: true });
  });

  router.post("/crm/tasks/:id/reassign", requireCrmAccess, async (req, res) => {
    if (!isSuperAdmin(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Only super admin can reassign.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const raw = req.body && req.body.owner_id;
    const newOwnerId =
      raw === "" || raw === undefined || raw === null ? null : Number(raw);
    if (newOwnerId != null && (!newOwnerId || newOwnerId < 1)) {
      return res.status(400).send("Invalid user.");
    }

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");

    if (newOwnerId != null) {
      if (!(await crmTasksRepo.userIsInTenant(pool, null, newOwnerId, tid))) {
        return res.status(400).send("User not in this tenant.");
      }
    }

    const prevOwner = task.owner_id;
    let nextStatus = normalizeCrmTaskStatus(task.status);
    if (newOwnerId == null) {
      nextStatus = "new";
    } else if (nextStatus === "new") {
      nextStatus = "in_progress";
    }

    try {
      const ok = await crmTasksRepo.reassignTaskWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        newOwnerId,
        nextStatus,
        prevOwner,
      });
      if (!ok) return res.status(404).send("Not found");
    } catch (e) {
      return res.status(400).send(e.message || "Could not reassign");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });

  async function loadFieldAgentProviderContext(req, taskIdRaw) {
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const taskId = Number(taskIdRaw);
    if (!taskId || taskId < 1) return { error: "Invalid task.", status: 400 };
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, taskId, tid);
    if (!task) return { error: "Not found.", status: 404 };
    if (String(task.source_type || "").trim() !== "field_agent_provider" || task.source_ref_id == null) {
      return { error: "This task is not linked to a field agent provider submission.", status: 400 };
    }
    const refId = Number(task.source_ref_id);
    if (!Number.isFinite(refId) || refId < 1) return { error: "Invalid submission reference.", status: 400 };
    const submission = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, refId);
    if (!submission) return { error: "Submission not found.", status: 404 };
    if (Number(submission.id) !== refId) return { error: "Submission reference mismatch.", status: 400 };
    return { pool, tid, taskId, task, submission };
  }

  router.post("/crm/tasks/:id/field-agent-submission/approve", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const rawCommission = (req.body && req.body.commission_amount) ?? "";
    let commission = 0;
    if (String(rawCommission).trim() !== "") {
      commission = Number(rawCommission);
      if (!Number.isFinite(commission) || commission < 0) {
        return res.status(400).type("text").send("Invalid commission amount.");
      }
    }
    const ok = await fieldAgentSubmissionsRepo.approveFieldAgentSubmission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      commissionAmount: commission,
      auditContext: {
        adminUserId: req.session.adminUser.id,
        metadata: String(rawCommission).trim() !== "" ? { commission_amount: commission } : undefined,
      },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not approve — submission is not awaiting a decision.");
    }
    try {
      let note = `Field agent provider submission #${Number(ctx.submission.id)} approved.`;
      if (String(rawCommission).trim() !== "") {
        note += ` Commission on approve (informational): ${commission}.`;
      }
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: note.slice(0, 4000),
      });
    } catch {
      /* informational note only; moderation already succeeded */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/reject", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const reason = String((req.body && req.body.rejection_reason) || "").trim();
    if (!reason) return res.status(400).type("text").send("Rejection reason is required.");
    const ok = await fieldAgentSubmissionsRepo.rejectFieldAgentSubmission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      rejectionReason: reason,
      auditContext: { adminUserId: req.session.adminUser.id },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not reject — submission is not awaiting a decision.");
    }
    try {
      let note = `Field agent provider submission #${Number(ctx.submission.id)} rejected.`;
      const snippet = reason.slice(0, 200);
      if (snippet) {
        note += ` Reason (informational): ${snippet}`;
        if (reason.length > 200) note += "…";
      }
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: note.slice(0, 4000),
      });
    } catch {
      /* informational note only; moderation already succeeded */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/info-needed", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const b = req.body || {};
    const adminInfoRequest = String(b.info_request != null ? b.info_request : b.admin_info_request != null ? b.admin_info_request : "")
      .trim()
      .slice(0, 4000);
    if (!adminInfoRequest) {
      return res.status(400).type("text").send("Info request message is required.");
    }
    const ok = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionInfoNeeded(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      adminInfoRequest,
      auditContext: {
        adminUserId: req.session.adminUser.id,
        metadata: { info_request: adminInfoRequest.slice(0, 500) },
      },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not mark info needed — use pending or appealed submissions.");
    }
    try {
      const head = `Field agent provider submission #${Number(ctx.submission.id)} marked as info needed.`;
      const note = `${head}\n\n${adminInfoRequest}`.slice(0, 4000);
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: note,
      });
    } catch {
      /* informational */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/appeal", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const ok = await fieldAgentSubmissionsRepo.markFieldAgentSubmissionAppealed(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      auditContext: { adminUserId: req.session.adminUser.id },
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not mark appealed — submission must be rejected.");
    }
    try {
      await crmTasksRepo.insertCommentWithAudit(ctx.pool, {
        tenantId: ctx.tid,
        taskId: ctx.taskId,
        userId: req.session.adminUser.id,
        body: `Field agent provider submission #${Number(ctx.submission.id)} marked as appealed (reopened for review).`.slice(
          0,
          4000
        ),
      });
    } catch {
      /* informational */
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/field-agent-submission/commission", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) return res.status(403).type("text").send("Read-only access.");
    const ctx = await loadFieldAgentProviderContext(req, req.params.id);
    if (ctx.error) return res.status(ctx.status).type("text").send(ctx.error);
    const amt = Number((req.body && req.body.commission_amount) ?? "");
    if (!Number.isFinite(amt) || amt < 0) {
      return res.status(400).type("text").send("Invalid commission amount.");
    }
    const ok = await fieldAgentSubmissionsRepo.updateFieldAgentSubmissionCommission(ctx.pool, {
      tenantId: ctx.tid,
      submissionId: ctx.submission.id,
      commissionAmount: amt,
    });
    if (!ok) {
      return res.status(400).type("text").send("Could not update commission — submission must be approved.");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${ctx.taskId}`));
  });

  router.post("/crm/tasks/:id/comments", requireCrmAccess, async (req, res) => {
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    const tid = getAdminTenantId(req);
    const uid = req.session.adminUser.id;
    const id = Number(req.params.id);
    const body = String((req.body && req.body.body) || "").trim().slice(0, 4000);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    if (!body) return res.status(400).send("Comment is required.");

    const pool = getPgPool();
    const task = await crmTasksRepo.getTaskByIdAndTenant(pool, id, tid);
    if (!task) return res.status(404).send("Not found");
    if (normalizeRole(req.session.adminUser.role) === ROLES.CSR) {
      const st = normalizeCrmTaskStatus(task.status);
      const unassigned = task.owner_id == null && st === "new";
      const isMine = task.owner_id != null && Number(task.owner_id) === Number(uid);
      if (!unassigned && !isMine) return res.status(403).type("text").send("Forbidden.");
    }

    try {
      await crmTasksRepo.insertCommentWithAudit(pool, {
        tenantId: tid,
        taskId: id,
        userId: uid,
        body,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not save comment");
    }
    return res.redirect(safeCrmRedirect(req, `/admin/crm/tasks/${id}`));
  });
};
