/**
 * Approved field-agent submissions: staff review website/directory listing draft and publish (create company).
 */
"use strict";

const { requireDirectoryEditor, requireNotViewer } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const { getAdminTenantId, redirectWithEmbed, uniqueCompanySubdomainForTenantAsync } = require("./adminShared");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");
const companiesRepo = require("../../db/pg/companiesRepo");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const phoneRulesService = require("../../phone/phoneRulesService");
const {
  buildCompanyPhotosFromFieldAgentSubmission,
} = require("../../fieldAgent/fieldAgentSubmissionPhotosToCompany");

module.exports = function registerAdminFieldAgentWebsiteListingReviewRoutes(router) {
  router.get("/field-agent/submissions/:id/website-listing-review", requireDirectoryEditor, async (req, res) => {
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
    const categories = await categoriesRepo.listByTenantId(pool, tid);
    return res.render("admin/field_agent_website_listing_review", {
      navTitle: "Website listing review",
      activeNav: "companies",
      submission: sub,
      websiteDraft,
      existingCompanyId: linkedId,
      categories,
      reviewRequestedAt: sub.website_listing_review_requested_at || null,
      saved: req.query && req.query.saved === "1",
    });
  });

  router.post(
    "/field-agent/submissions/:id/website-listing-review/save",
    requireDirectoryEditor,
    requireNotViewer,
    async (req, res) => {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
      const ok = await fieldAgentSubmissionsRepo.patchWebsiteListingDraftForAdmin(pool, {
        tenantId: tid,
        submissionId: sid,
        draft: req.body || {},
      });
      if (!ok) return res.status(400).type("text").send("Could not save draft.");
      return res.redirect(
        redirectWithEmbed(req, `/admin/field-agent/submissions/${encodeURIComponent(String(sid))}/website-listing-review?saved=1`)
      );
    }
  );

  router.post(
    "/field-agent/submissions/:id/website-listing-review/publish",
    requireDirectoryEditor,
    requireNotViewer,
    async (req, res) => {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) return res.status(404).type("text").send("Not found.");
      const sub = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, sid);
      if (!sub) return res.status(404).type("text").send("Not found.");
      if (String(sub.status || "") !== "approved") {
        return res.status(400).type("text").send("Submission must be approved.");
      }
      const existing = await companiesRepo.findCompanyIdBySourceSubmissionExcluding(pool, tid, sid, null);
      if (existing != null) {
        return res.redirect(redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(String(existing))}/workspace`));
      }

      const b = req.body || {};
      const draftMerged = fieldAgentSubmissionsRepo.normalizeWebsiteListingDraft(b);
      const fn = String(sub.first_name || "").trim();
      const ln = String(sub.last_name || "").trim();
      const listingName =
        String(draftMerged.listing_name || "").trim() || `${fn} ${ln}`.trim() || `Submission ${sid}`;
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
        if (!okCat) return res.status(400).type("text").send("Invalid category for this region.");
      }

      if (phoneMain) {
        const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneMain, "phone");
        if (!vp.ok) return res.status(400).type("text").send(vp.error || "Invalid phone.");
      }
      const fp = String(draftMerged.featured_cta_phone || "").trim();
      if (fp) {
        const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, fp, "phone");
        if (!vf.ok) return res.status(400).type("text").send(vf.error || "Invalid featured CTA phone.");
      }

      const yoeRaw = String(b.years_experience != null ? b.years_experience : "").trim();
      let yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
      if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
        return res.status(400).type("text").send("Years in business must be a number between 0 and 999.");
      }
      if (yearsExp != null) yearsExp = Math.floor(yearsExp);

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
          serviceAreas: String(draftMerged.service_areas || "").trim(),
          hoursText: String(draftMerged.hours_text || "").trim(),
          galleryJson,
          logoUrl,
          accountManagerFieldAgentId: sub.field_agent_id,
          sourceFieldAgentSubmissionId: sid,
        });
        newCompanyId = row && row.id != null ? Number(row.id) : null;
        if (!newCompanyId) throw new Error("Company was not created.");
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        return res.status(400).type("text").send(e.message || "Could not publish listing.");
      } finally {
        client.release();
      }
      return res.redirect(
        redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(String(newCompanyId))}/workspace?published=1`)
      );
    }
  );
};
