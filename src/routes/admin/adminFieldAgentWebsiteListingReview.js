/**
 * Approved field-agent submissions: staff review website/directory listing draft and publish (create company).
 */
"use strict";

const { requireDirectoryEditor, requireNotViewer } = require("../../auth");
const { normalizeRole, ROLES } = require("../../auth/roles");
const { getPgPool } = require("../../db/pg");
const { getAdminTenantId, redirectWithEmbed, uniqueCompanySubdomainForTenantAsync } = require("./adminShared");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../../db/pg/companiesRepo");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const phoneRulesService = require("../../phone/phoneRulesService");
const {
  buildCompanyPhotosFromFieldAgentSubmission,
} = require("../../fieldAgent/fieldAgentSubmissionPhotosToCompany");

function parseSpecialitiesFromBody(body) {
  const raw = body && body.specialities ? body.specialities : [];
  const list = Array.isArray(raw) ? raw : [raw];
  return fieldAgentSubmissionsRepo.normalizeSpecialityNames(list);
}

function parseSpecialityVerificationFromBody(body) {
  const raw = body && body.specialities_verified ? body.specialities_verified : [];
  const list = Array.isArray(raw) ? raw : [raw];
  const names = fieldAgentSubmissionsRepo.normalizeSpecialityNames(list);
  return new Set(names.map((x) => String(x || "").trim().toLowerCase()));
}

function parseWeeklyHoursFromBody(body) {
  const out = {};
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  for (const d of days) {
    out[d] = {
      closed: !!(body && (body[`hours_${d}_closed`] === "1" || body[`hours_${d}_closed`] === "on")),
      from: String((body && body[`hours_${d}_from`]) || "").trim(),
      to: String((body && body[`hours_${d}_to`]) || "").trim(),
    };
  }
  return fieldAgentSubmissionsRepo.normalizeWebsiteWeeklyHours(out);
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

/**
 * Canonical publish flow for website listing review (single-item + bulk reuse).
 * Returns structured result so callers can decide whether to skip/fail.
 * @param {import("pg").Pool} pool
 * @param {{
 *  tenantId: number,
 *  submissionId: number,
 *  adminUserId?: number | null,
 *  body?: Record<string, unknown> | null
 * }} params
 */
async function publishWebsiteListingForAdmin(pool, params) {
  const tid = Number(params && params.tenantId);
  const sid = Number(params && params.submissionId);
  const adminUserId =
    params && params.adminUserId != null && Number.isFinite(Number(params.adminUserId))
      ? Number(params.adminUserId)
      : null;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) {
    return { ok: false, kind: "skip", message: "Invalid submission id." };
  }
  const sub = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, sid);
  if (!sub) return { ok: false, kind: "skip", message: "Not found." };
  if (String(sub.status || "") !== "approved") {
    return { ok: false, kind: "skip", message: "Submission must be approved." };
  }
  const existing = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, sid, null);
  if (existing != null) {
    return { ok: false, kind: "skip", message: "Already published.", companyId: Number(existing) };
  }

  const hasBody = !!(params && params.body && typeof params.body === "object");
  const b = hasBody ? { ...(params.body || {}) } : { ...fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(sub.website_listing_draft_json) };

  let specialities = [];
  let verifiedSet = new Set();
  if (hasBody) {
    specialities = parseSpecialitiesFromBody(b);
    if (specialities.length > 10) return { ok: false, kind: "skip", message: "Maximum 10 specialities." };
    verifiedSet = parseSpecialityVerificationFromBody(b);
  } else {
    const entries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, sid);
    specialities = entries.map((x) => String(x.name || "").trim()).filter(Boolean);
    verifiedSet = new Set(
      entries
        .filter((x) => !!x.isVerified)
        .map((x) => String(x.name || "").trim().toLowerCase())
        .filter(Boolean)
    );
  }

  const weeklyHours = hasBody
    ? parseWeeklyHoursFromBody(b)
    : await fieldAgentSubmissionsRepo.getWebsiteWeeklyHoursForSubmission(pool, tid, sid);
  const hv = validateWeeklyHours(weeklyHours);
  if (!hv.ok) return { ok: false, kind: "skip", message: hv.error };
  const establishedYear = parseEstablishedYearOrError(b.established_year);
  if (!establishedYear.ok) return { ok: false, kind: "skip", message: establishedYear.error };

  b.service_areas = fieldAgentSubmissionsRepo.specialitiesToLegacyText(specialities);
  b.hours_text = fieldAgentSubmissionsRepo.weeklyHoursToLegacyText(weeklyHours);
  const draftMerged = fieldAgentSubmissionsRepo.normalizeWebsiteListingDraft(b);
  const fn = String(sub.first_name || "").trim();
  const ln = String(sub.last_name || "").trim();
  const listingName = String(draftMerged.listing_name || "").trim() || `${fn} ${ln}`.trim() || `Submission ${sid}`;
  const phoneMain = String(draftMerged.listing_phone || sub.phone_raw || "").trim();
  const email = String(draftMerged.email || "").trim();
  const catRaw = b.category_id;
  let catId = null;
  if (catRaw !== undefined && catRaw !== null && String(catRaw).trim() !== "") {
    catId = Number(catRaw);
    if (!Number.isFinite(catId) || catId < 1) catId = null;
  }
  if (catId) {
    const okCat = await categoriesRepo.getByIdAndTenantId(pool, catId, tid);
    if (!okCat) return { ok: false, kind: "skip", message: "Invalid category for this region." };
  }
  if (phoneMain) {
    const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneMain, "phone");
    if (!vp.ok) return { ok: false, kind: "skip", message: vp.error || "Invalid phone." };
  }
  const fp = String(draftMerged.featured_cta_phone || "").trim();
  if (fp) {
    const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, fp, "phone");
    if (!vf.ok) return { ok: false, kind: "skip", message: vf.error || "Invalid featured CTA phone." };
  }

  const yoeRaw = String(b.years_experience != null ? b.years_experience : "").trim();
  let yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
  if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
    return { ok: false, kind: "skip", message: "Years in business must be a number between 0 and 999." };
  }
  if (yearsExp != null) yearsExp = Math.floor(yearsExp);
  const establishedYearNum = establishedYear.value;

  const headline = String(draftMerged.headline || sub.profession || listingName).trim().slice(0, 500);
  const about = String(draftMerged.about || "").trim();
  const services = String(draftMerged.services || sub.profession || "").trim();
  const location = String(draftMerged.location || sub.city || sub.address_city || "").trim();
  const featuredLabel = String(draftMerged.featured_cta_label || "Call us").trim() || "Call us";
  const featuredPhone = String(draftMerged.featured_cta_phone || phoneMain || "").trim();

  const subdomain = await uniqueCompanySubdomainForTenantAsync(tid, `fa-${sid}-${listingName}`);

  let logoUrl = "";
  let galleryJson = "[]";
  try {
    const mapped = buildCompanyPhotosFromFieldAgentSubmission(sub);
    logoUrl = mapped.logoUrl;
    galleryJson = mapped.galleryJson;
  } catch {
    /* non-blocking: publish without photos */
  }

  const client = await pool.connect();
  let newCompanyId = null;
  try {
    await client.query("BEGIN");
    const okDraft = await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(client, {
      tenantId: tid,
      submissionId: sid,
      draft: b,
    });
    if (!okDraft) throw new Error("Could not update draft before publish.");
    await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(client, {
      tenantId: tid,
      submissionId: sid,
      entries: specialities.map((name) => ({ name, isVerified: verifiedSet.has(String(name).toLowerCase()) })),
      verifiedByAdminUserId: adminUserId,
    });
    await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(client, {
      tenantId: tid,
      submissionId: sid,
      weeklyHours,
    });
    const row = await companiesRepo.insertFull(client, {
      tenantId: tid,
      subdomain,
      name: listingName.slice(0, 500),
      categoryId: catId,
      headline,
      about,
      services,
      phone: phoneMain,
      email,
      location,
      featuredCtaLabel: featuredLabel,
      featuredCtaPhone: featuredPhone,
      yearsExperience: yearsExp,
      establishedYear: establishedYearNum,
      serviceAreas: String(draftMerged.service_areas || "").trim(),
      hoursText: String(draftMerged.hours_text || "").trim(),
      galleryJson,
      logoUrl,
      accountManagerFieldAgentId: sub.field_agent_id,
      sourceFieldAgentSubmissionId: sid,
    });
    newCompanyId = row && row.id != null ? Number(row.id) : null;
    if (!newCompanyId) throw new Error("Company was not created.");
    const okOutcome = await fieldAgentSubmissionsRepo.setWebsiteListingReviewOutcomeForAdmin(client, {
      tenantId: tid,
      submissionId: sid,
      reviewStatus: "published",
      reviewComment: "",
    });
    if (!okOutcome) throw new Error("Could not update website review status.");
    await client.query("COMMIT");
    return { ok: true, companyId: newCompanyId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    return { ok: false, kind: "fail", message: e.message || "Could not publish listing." };
  } finally {
    client.release();
  }
}

module.exports = function registerAdminFieldAgentWebsiteListingReviewRoutes(router) {
  function requireWebsiteReviewRole(req, res, next) {
    if (!req.session || !req.session.adminUser) return res.redirect("/admin/login");
    const role = normalizeRole(req.session.adminUser.role);
    if (role !== ROLES.SUPER_ADMIN && role !== ROLES.TENANT_MANAGER && role !== ROLES.TENANT_EDITOR) {
      return res.status(403).type("text").send("Websites review is not available for your role.");
    }
    return next();
  }

  router.get("/field-agent/submissions/:id/website-listing-review", requireDirectoryEditor, requireWebsiteReviewRole, async (req, res) => {
    const pool = getPgPool();
    const tid = getAdminTenantId(req);
    const sid = Number(req.params.id);
    if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
    const sub = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, sid);
    if (!sub) return res.status(404).type("text").send("Not found.");
    if (String(sub.status || "") !== "approved") {
      return res.status(400).type("text").send("Submission must be approved.");
    }
    const linkedId = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, sid, null);
    const websiteDraft = fieldAgentSubmissionsRepo.mergeWebsiteListingDraftForDisplay(sub.website_listing_draft_json);
    const websiteSpecialityEntries = await fieldAgentSubmissionsRepo.listWebsiteSpecialityEntriesForSubmission(pool, tid, sid);
    const websiteSpecialities = websiteSpecialityEntries.map((x) => x.name);
    const websiteVerifiedSpecialities = websiteSpecialityEntries.filter((x) => x.isVerified).map((x) => x.name);
    const websiteWeeklyHours = await fieldAgentSubmissionsRepo.getWebsiteWeeklyHoursForSubmission(pool, tid, sid);
    const specialitySuggestions = await fieldAgentSubmissionsRepo.listWebsiteSpecialitySuggestions(pool, tid, "", 60);
    const categories = await categoriesRepo.listByTenantId(pool, tid);
    return res.render("admin/field_agent_website_listing_review", {
      navTitle: "Website listing review",
      activeNav: "companies",
      submission: sub,
      websiteDraft,
      websiteSpecialities,
      websiteVerifiedSpecialities,
      websiteWeeklyHours,
      specialitySuggestions,
      existingCompanyId: linkedId,
      categories,
      reviewRequestedAt: sub.website_listing_review_requested_at || null,
      saved: req.query && req.query.saved === "1",
    });
  });

  router.post(
    "/field-agent/submissions/:id/website-listing-review/save",
    requireDirectoryEditor,
    requireWebsiteReviewRole,
    requireNotViewer,
    async (req, res) => {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
      const body = req.body || {};
      const specialities = parseSpecialitiesFromBody(body);
      if (specialities.length > 10) return res.status(400).type("text").send("Maximum 10 specialities.");
      const verifiedSet = parseSpecialityVerificationFromBody(body);
      const weeklyHours = parseWeeklyHoursFromBody(body);
      const hv = validateWeeklyHours(weeklyHours);
      if (!hv.ok) return res.status(400).type("text").send(hv.error);
      const establishedYear = parseEstablishedYearOrError(body.established_year);
      if (!establishedYear.ok) return res.status(400).type("text").send(establishedYear.error);
      const draftBody = {
        ...body,
        service_areas: fieldAgentSubmissionsRepo.specialitiesToLegacyText(specialities),
        hours_text: fieldAgentSubmissionsRepo.weeklyHoursToLegacyText(weeklyHours),
      };
      const ok = await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
        tenantId: tid,
        submissionId: sid,
        draft: draftBody,
      });
      if (!ok) return res.status(400).type("text").send("Could not save draft.");
      await fieldAgentSubmissionsRepo.replaceWebsiteSpecialityEntriesForSubmission(pool, {
        tenantId: tid,
        submissionId: sid,
        entries: specialities.map((name) => ({ name, isVerified: verifiedSet.has(String(name).toLowerCase()) })),
        verifiedByAdminUserId: req.session && req.session.adminUser ? Number(req.session.adminUser.id) : null,
      });
      await fieldAgentSubmissionsRepo.replaceWebsiteWeeklyHoursForSubmission(pool, {
        tenantId: tid,
        submissionId: sid,
        weeklyHours,
      });
      return res.redirect(
        redirectWithEmbed(req, `/admin/field-agent/submissions/${encodeURIComponent(String(sid))}/website-listing-review?saved=1`)
      );
    }
  );

  router.post(
    "/field-agent/submissions/:id/website-listing-review/reject",
    requireDirectoryEditor,
    requireWebsiteReviewRole,
    requireNotViewer,
    async (req, res) => {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
      const rejectionReason = String((req.body && req.body.rejection_reason) || "")
        .trim()
        .slice(0, 4000);
      if (!rejectionReason) {
        return res.status(400).type("text").send("Rejection reason is required.");
      }
      const ok = await fieldAgentSubmissionsRepo.setWebsiteListingReviewOutcomeForAdmin(pool, {
        tenantId: tid,
        submissionId: sid,
        reviewStatus: "changes_requested",
        reviewComment: rejectionReason,
      });
      if (!ok) return res.status(400).type("text").send("Could not reject listing review.");
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/field-agent/submissions/${encodeURIComponent(String(sid))}/website-listing-review?saved=1`
        )
      );
    }
  );

  router.post(
    "/field-agent/submissions/:id/website-listing-review/publish",
    requireDirectoryEditor,
    requireWebsiteReviewRole,
    requireNotViewer,
    async (req, res) => {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
      const result = await publishWebsiteListingForAdmin(pool, {
        tenantId: tid,
        submissionId: sid,
        adminUserId: req.session && req.session.adminUser ? Number(req.session.adminUser.id) : null,
        body: req.body || {},
      });
      if (!result.ok) {
        if (result.companyId != null) {
          return res.redirect(redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(String(result.companyId))}/workspace`));
        }
        return res.status(400).type("text").send(result.message || "Could not publish listing.");
      }
      return res.redirect(
        redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(String(result.companyId))}/workspace?published=1`)
      );
    }
  );
};

module.exports.publishWebsiteListingForAdmin = publishWebsiteListingForAdmin;
