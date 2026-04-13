/**
 * Categories, cities, companies, leads, partner signups.
 */
const slugify = require("slugify");
const {
  requireDirectoryEditor,
  requireNotViewer,
  requireServiceProviderCategoryAdmin,
  requireManageDirectoryFeaturedFlags,
  isTenantViewer,
} = require("../../auth");
const {
  parseGalleryAdminText,
  parseGalleryJson,
  galleryToAdminText,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
  absoluteCompanyProfileUrl,
} = require("../../companies/companyProfile");
const phoneRulesService = require("../../phone/phoneRulesService");
const { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel } = require("../../crm/leadStatuses");
const { buildCompanyPageLocals } = require("../../companies/companyPageRender");
const {
  tenantUsesZmwLeadCreditsWithStore,
  isLeadAcceptanceBlockedByCreditWithStore,
} = require("../../companyPortal/companyPortalLeadCredits");
const { getCommerceSettingsForTenant, commerceCurrencyCodeUpper } = require("../../tenants/tenantCommerceSettings");
const {
  listRecentLedgerEntriesAsync,
  recordAdminPaymentCreditAsync,
  paymentMethodLabel,
  PAYMENT_METHODS,
} = require("../../companyPortal/companyPortalCreditLedger");
const companyPortalLeadsRepo = require("../../db/pg/companyPortalLeadsRepo");
const {
  redirectWithEmbed,
  getAdminTenantId,
  getCategoriesForSelectAsync,
  uniqueCompanySubdomainForTenantAsync,
  parseEditMode,
  filterSuffixFromQuery,
  mergeDraftCompanyForPreviewAsync,
} = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const callbacksRepo = require("../../db/pg/callbacksRepo");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const companiesRepo = require("../../db/pg/companiesRepo");
const leadsRepo = require("../../db/pg/leadsRepo");
const tenantCitiesRepo = require("../../db/pg/tenantCitiesRepo");
const professionalSignupsRepo = require("../../db/pg/professionalSignupsRepo");
const reviewsRepo = require("../../db/pg/reviewsRepo");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const { canManageServiceProviderCategories, canMutateCompanyFieldAgentLinkage } = require("../../auth/roles");
const { resolveCompanyFieldAgentLinkage } = require("../../companies/companyFieldAgentLinkage");
const fieldAgentsRepo = require("../../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");

module.exports = function registerAdminDirectoryRoutes(router) {
  router.get("/categories", requireServiceProviderCategoryAdmin, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const allCategories = await categoriesRepo.listByTenantId(pool, tid);
    let categories = allCategories;
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qs = String(req.query.q_slug || "").trim().toLowerCase();
    const qc = String(req.query.q_created || "").trim().toLowerCase();
    if (qn) categories = categories.filter((c) => c.name.toLowerCase().includes(qn));
    if (qs) categories = categories.filter((c) => (c.slug || "").toLowerCase().includes(qs));
    if (qc) {
      categories = categories.filter((c) => String(c.created_at || "").toLowerCase().includes(qc));
    }
    const hasActiveFilters = !!(qn || qs || qc);
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    return res.render("admin/categories", {
      navTitle: "Service providers",
      categories,
      totalCategoryCount: allCategories.length,
      hasActiveFilters,
      editMode,
      filterSuffix,
      filters: {
        q_name: req.query.q_name || "",
        q_slug: req.query.q_slug || "",
        q_created: req.query.q_created || "",
      },
    });
  });

  router.get("/categories/new", requireServiceProviderCategoryAdmin, (req, res) => {
    return res.render("admin/category_form", { category: null, navTitle: "New service provider category" });
  });

  router.post("/categories", requireServiceProviderCategoryAdmin, requireNotViewer, async (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      await categoriesRepo.insert(pool, { tenantId: tid, slug: cleanSlug, name: cleanName });
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", requireServiceProviderCategoryAdmin, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const category = await categoriesRepo.getByIdAndTenantId(pool, req.params.id, tid);
    if (!category) return res.status(404).send("Category not found");
    return res.render("admin/category_form", { category, navTitle: "Edit service provider category" });
  });

  router.post("/categories/:id", requireServiceProviderCategoryAdmin, requireNotViewer, async (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      const row = await categoriesRepo.update(pool, {
        id: Number(req.params.id),
        tenantId: tid,
        slug: cleanSlug,
        name: cleanName,
      });
      if (!row) return res.status(404).send("Category not found");
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", requireServiceProviderCategoryAdmin, requireNotViewer, async (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      const ok = await categoriesRepo.deleteByIdAndTenantId(pool, catId, tid);
      if (!ok) return res.status(404).send("Category not found");
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete category: ${e.message}`);
    }
  });

  router.get("/cities", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const cities = await tenantCitiesRepo.listByTenantIdOrderByName(pool, tid);
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qen = String(req.query.q_enabled || "").trim().toLowerCase();
    const qb = String(req.query.q_big || "").trim().toLowerCase();
    if (qn) cities = cities.filter((c) => c.name.toLowerCase().includes(qn));
    if (qen === "yes") cities = cities.filter((c) => c.enabled);
    if (qen === "no") cities = cities.filter((c) => !c.enabled);
    if (qb === "yes") cities = cities.filter((c) => c.big_city);
    if (qb === "no") cities = cities.filter((c) => !c.big_city);
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    return res.render("admin/cities", {
      cities,
      editMode,
      filterSuffix,
      filters: {
        q_name: req.query.q_name || "",
        q_enabled: req.query.q_enabled || "",
        q_big: req.query.q_big || "",
      },
    });
  });

  router.post("/cities", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on";
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on";
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      await tenantCitiesRepo.insert(pool, { tenantId: tid, name, enabled, bigCity });
      return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not add city: ${e.message}`);
    }
  });

  router.post("/cities/:id", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const cleanName = String(req.body.name || "").trim();
    if (!cleanName) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on";
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on";
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const row = await tenantCitiesRepo.updateByIdAndTenantId(pool, {
      id: Number(req.params.id),
      tenantId: tid,
      name: cleanName,
      enabled,
      bigCity,
    });
    if (!row) return res.status(404).send("City not found");
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.post("/cities/:id/delete", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    await tenantCitiesRepo.deleteByIdAndTenantId(pool, Number(req.params.id), tid);
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.get("/companies", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    let companies = await companiesRepo.listAdminWithCategory(pool, tid);
    companies = await companiesRepo.enrichCompaniesWithAccountManagerLabels(pool, tid, companies);
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qs = String(req.query.q_subdomain || "").trim().toLowerCase();
    const qc = String(req.query.q_category || "").trim().toLowerCase();
    const qu = String(req.query.q_updated || "").trim().toLowerCase();
    const qFaLinked = String(req.query.q_fa_linked || "").trim().toLowerCase();
    if (qn) companies = companies.filter((c) => c.name.toLowerCase().includes(qn));
    if (qs) companies = companies.filter((c) => (c.subdomain || "").toLowerCase().includes(qs));
    if (qc) {
      companies = companies.filter((c) => (c.category_name || "").toLowerCase().includes(qc));
    }
    if (qu) {
      companies = companies.filter((c) => String(c.updated_at || "").toLowerCase().includes(qu));
    }
    if (qFaLinked === "1" || qFaLinked === "yes" || qFaLinked === "true") {
      companies = companies.filter((c) => c.account_manager_field_agent_id != null);
    }
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    const baseDomain = (process.env.BASE_DOMAIN || "").trim();
    const scheme = process.env.PUBLIC_SCHEME || "https";
    const tr = await tenantsRepo.getById(pool, tid);
    const tenantSlug = tr && tr.slug ? String(tr.slug) : "";
    const portalCreditUiActive = await tenantUsesZmwLeadCreditsWithStore(pool, tid);
    const portalCreditCs = portalCreditUiActive ? await getCommerceSettingsForTenant(pool, tid) : null;
    const portalCreditCurrencyCode = portalCreditCs ? commerceCurrencyCodeUpper(portalCreditCs) : "ZMW";
    const companiesWithUrls = await Promise.all(
      companies.map(async (c) => {
        const sub = String(c.subdomain || "").trim();
        const miniSitePublicUrl =
          baseDomain && tenantSlug && sub
            ? `${scheme}://${tenantSlug}.${baseDomain}/${encodeURIComponent(sub)}`
            : "";
        const maxDeal = await companyPortalLeadsRepo.getMaxDealPriceForCompanyPublishedActiveAssignments(
          pool,
          tid,
          Number(c.id)
        );
        const portal_credit_blocked = await isLeadAcceptanceBlockedByCreditWithStore(
          pool,
          tid,
          c.portal_lead_credits_balance,
          maxDeal
        );
        return { ...c, miniSitePublicUrl, portal_credit_blocked };
      })
    );
    const saved = req.query.saved === "1" || req.query.saved === "true";
    const canManageFeaturedPremium = canManageServiceProviderCategories(req.session.adminUser.role);
    const filterQueryForSave = req.originalUrl.includes("?") ? `?${req.originalUrl.split("?")[1]}` : "";
    return res.render("admin/companies", {
      companies: companiesWithUrls,
      baseDomain,
      adminTenantSlug: tenantSlug,
      editMode,
      filterSuffix,
      saved,
      portalCreditUiActive,
      portalCreditCurrencyCode,
      canManageFeaturedPremium,
      filterQueryForSave,
      filters: {
        q_name: req.query.q_name || "",
        q_subdomain: req.query.q_subdomain || "",
        q_category: req.query.q_category || "",
        q_updated: req.query.q_updated || "",
        q_fa_linked: req.query.q_fa_linked || "",
      },
    });
  });

  router.post(
    "/companies/:id/directory-flags",
    requireManageDirectoryFeaturedFlags,
    requireNotViewer,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!Number.isFinite(cid) || cid <= 0) return res.status(400).send("Invalid company.");
      const featured = req.body.directory_featured === "1" || req.body.directory_featured === "on";
      const premium = req.body.is_premium === "1" || req.body.is_premium === "on";
      const pool = getPgPool();
      const row = await companiesRepo.updateDirectoryFlagsByIdAndTenantId(pool, {
        id: cid,
        tenantId: tid,
        directoryFeatured: featured,
        isPremium: premium,
      });
      if (!row) return res.status(404).send("Company not found.");
      const returnQuery = String(req.body.return_query || "").trim();
      let back = "/admin/companies?edit=1&saved=1";
      if (returnQuery.startsWith("?")) {
        const sp = new URLSearchParams(returnQuery.slice(1));
        sp.set("edit", "1");
        sp.set("saved", "1");
        back = `/admin/companies?${sp.toString()}`;
      }
      return res.redirect(redirectWithEmbed(req, back));
    }
  );

  router.get("/companies/new", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const categories = await getCategoriesForSelectAsync(db, tid);
    const pool = getPgPool();
    const tr = await tenantsRepo.getById(pool, tid);
    const tenantSlug = tr && tr.slug ? String(tr.slug) : "";
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const saved = req.query.saved === "1" || req.query.saved === "true";
    const canL = req.session.adminUser && canMutateCompanyFieldAgentLinkage(req.session.adminUser.role);
    let fieldAgentsForLinkage = [];
    let approvedSubmissionsForLinkage = [];
    if (canL) {
      fieldAgentsForLinkage = await fieldAgentsRepo.listForTenantSelect(pool, tid);
      approvedSubmissionsForLinkage = await fieldAgentSubmissionsRepo.listApprovedForCompanyLinkageSelect(pool, tid, null);
    }
    return res.render("admin/company_form", {
      company: null,
      categories,
      baseDomain: baseForUrls,
      adminTenantSlug: tenantSlug,
      galleryAdminText: "",
      miniSiteUrl: "",
      miniSiteLabel: "",
      directoryProfileUrl: "",
      miniSiteExampleLabel: tenantSlug ? companyMiniSiteLabel(tenantSlug, "your-company-slug", baseForUrls) : "",
      error: null,
      saved,
      canMutateCompanyFieldAgentLinkage: !!canL,
      fieldAgentsForLinkage,
      approvedSubmissionsForLinkage,
    });
  });

  router.get("/companies/:id/workspace", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const company = await companiesRepo.getWithCategoryByIdAndTenantId(pool, cid, tid);
    if (!company) return res.status(404).send("Company not found");
    const categories = await getCategoriesForSelectAsync(db, tid);
    const trWs = await tenantsRepo.getById(pool, tid);
    const tenantSlug = trWs && trWs.slug ? String(trWs.slug) : "";
    const galleryAdminText = galleryToAdminText(parseGalleryJson(company.gallery_json));
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const miniSiteUrl = buildCompanyMiniSiteUrl(tenantSlug, company.subdomain, baseForUrls);
    const miniSiteLabel = companyMiniSiteLabel(tenantSlug, company.subdomain, baseForUrls);
    const directoryProfileUrl = absoluteCompanyProfileUrl(tenantSlug, company.id);
    const portalCreditUiActive = await tenantUsesZmwLeadCreditsWithStore(pool, tid);
    const maxDeal = await companyPortalLeadsRepo.getMaxDealPriceForCompanyPublishedActiveAssignments(pool, tid, cid);
    const portalCreditBlocked = await isLeadAcceptanceBlockedByCreditWithStore(
      pool,
      tid,
      company.portal_lead_credits_balance,
      maxDeal
    );
    const recentLedgerRaw = portalCreditUiActive ? await listRecentLedgerEntriesAsync(pool, tid, cid, 25) : [];
    const recentLedgerEntries = recentLedgerRaw.map((r) => ({
      ...r,
      payment_method_label: paymentMethodLabel(r.payment_method),
    }));
    const paymentMethodOptions = PAYMENT_METHODS.map((v) => ({ value: v, label: paymentMethodLabel(v) }));
    const defaultPaymentDate = new Date().toISOString().slice(0, 10);
    const portalCreditNotice = String(req.query.credit_notice || "").trim().slice(0, 500) || null;
    const portalCreditError = String(req.query.credit_error || "").trim().slice(0, 500) || null;
    const portalCreditCs = portalCreditUiActive ? await getCommerceSettingsForTenant(pool, tid) : null;
    const portalCreditCurrencyCode = portalCreditCs ? commerceCurrencyCodeUpper(portalCreditCs) : "ZMW";
    const portalCreditMinBalance =
      portalCreditCs != null && Number.isFinite(Number(portalCreditCs.minimum_credit_balance))
        ? Number(portalCreditCs.minimum_credit_balance)
        : 0;
    const canL = req.session.adminUser && canMutateCompanyFieldAgentLinkage(req.session.adminUser.role);
    let fieldAgentsForLinkage = [];
    let approvedSubmissionsForLinkage = [];
    if (canL) {
      fieldAgentsForLinkage = await fieldAgentsRepo.listForTenantSelect(pool, tid);
      approvedSubmissionsForLinkage = await fieldAgentSubmissionsRepo.listApprovedForCompanyLinkageSelect(pool, tid, cid);
    }
    let accountManagerFieldAgentDisplay = "";
    let sourceFieldAgentSubmissionDisplay = "";
    if (company.account_manager_field_agent_id) {
      const faRow = await fieldAgentsRepo.getByIdAndTenant(pool, Number(company.account_manager_field_agent_id), tid);
      accountManagerFieldAgentDisplay = faRow
        ? String(faRow.display_name || "").trim() || String(faRow.username || "").trim() || `Agent #${faRow.id}`
        : "";
    }
    if (company.source_field_agent_submission_id) {
      const subRow = await fieldAgentSubmissionsRepo.getSubmissionByIdForAdmin(pool, tid, Number(company.source_field_agent_submission_id));
      sourceFieldAgentSubmissionDisplay = subRow
        ? `#${subRow.id} · ${String(subRow.first_name || "").trim()} ${String(subRow.last_name || "").trim()} · ${String(subRow.phone_raw || "").trim()}`
        : "";
    }
    return res.render("admin/company_workspace", {
      company,
      categories,
      galleryAdminText,
      baseDomain: baseForUrls,
      adminTenantSlug: tenantSlug,
      miniSiteUrl,
      miniSiteLabel,
      directoryProfileUrl,
      previewFramePath: `/admin/companies/${cid}/preview-frame`,
      portalCreditUiActive,
      portalCreditBlocked,
      portalCreditBalance: Number(company.portal_lead_credits_balance) || 0,
      portalCreditCurrencyCode,
      portalCreditMinBalance,
      recentLedgerEntries,
      paymentMethodOptions,
      defaultPaymentDate,
      portalCreditNotice,
      portalCreditError,
      canMutateCompanyFieldAgentLinkage: !!canL,
      fieldAgentsForLinkage,
      approvedSubmissionsForLinkage,
      accountManagerFieldAgentDisplay,
      sourceFieldAgentSubmissionDisplay,
    });
  });

  router.post(
    "/companies/:id/portal-credit-payment",
    requireDirectoryEditor,
    requireNotViewer,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).send("Invalid id.");
      const pool = getPgPool();
      const payload = {
        tenantId: tid,
        companyId: cid,
        adminUserId: req.session.adminUser.id,
        amountZmw: req.body && req.body.amount_zmw,
        paymentMethod: req.body && req.body.payment_method,
        transactionReference: req.body && req.body.transaction_reference,
        paymentDate: req.body && req.body.payment_date,
        approverName: req.body && req.body.approver_name,
        notes: req.body && req.body.notes,
      };
      if (!(await tenantUsesZmwLeadCreditsWithStore(pool, tid))) {
        return res.status(400).send("Credit ledger is not available for this region.");
      }
      const result = await recordAdminPaymentCreditAsync(pool, payload);
      if (!result.ok) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/companies/${cid}/workspace?credit_error=` + encodeURIComponent(result.error))
        );
      }
      const unit = result.currencyUnit || "ZMW";
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/companies/${cid}/workspace?credit_notice=` +
            encodeURIComponent(`Payment recorded. New balance: ${result.newBalance} ${unit}.`)
        )
      );
    }
  );

  router.get("/companies/:id/preview-frame", requireDirectoryEditor, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).type("text").send("Invalid id");
      const pool = getPgPool();
      const company = await companiesRepo.getWithCategoryByIdAndTenantId(pool, cid, tid);
      if (!company) return res.status(404).type("text").send("Not found");
      const locals = await buildCompanyPageLocals(req, company);
      return res.render("company", locals);
    } catch (e) {
      return next(e);
    }
  });

  router.post("/companies/:id/preview-draft", requireDirectoryEditor, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).json({ error: "Invalid id" });
      const pool = getPgPool();
      const baseRow = await companiesRepo.getWithCategoryByIdAndTenantId(pool, cid, tid);
      if (!baseRow) return res.status(404).json({ error: "Company not found" });
      const draft = req.body && req.body.company ? req.body.company : {};
      const merged = await mergeDraftCompanyForPreviewAsync(pool, baseRow, draft);
      const locals = await buildCompanyPageLocals(req, merged, {});
      return res.render("company", locals, (err, html) => {
        if (err) return next(err);
        return res.type("html").send(html);
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/companies/:id/publish", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).json({ error: "Invalid id" });
    const pool = getPgPool();
    const row = await companiesRepo.getByIdAndTenantId(pool, cid, tid);
    if (!row) return res.status(404).json({ error: "Company not found" });

    const d = (req.body && req.body.company) || {};

    const cleanName = d.name != null ? String(d.name).trim() : row.name;
    const cleanSubdomain = d.subdomain != null ? String(d.subdomain).trim().toLowerCase() : row.subdomain;
    if (!cleanName) return res.status(400).json({ error: "Company name is required." });
    if (!cleanSubdomain) return res.status(400).json({ error: "Company subdomain is required." });

    let catId = row.category_id;
    if (d.category_id !== undefined) {
      const s = String(d.category_id).trim();
      catId = s === "" ? null : Number(s);
      if (catId != null && Number.isNaN(catId)) catId = null;
    }
    if (catId) {
      const okCat = await categoriesRepo.getByIdAndTenantId(pool, catId, tid);
      if (!okCat) return res.status(400).json({ error: "Invalid category for this tenant." });
    }

    const phoneVal = d.phone !== undefined ? String(d.phone).trim() : row.phone;
    const fpVal = d.featured_cta_phone !== undefined ? String(d.featured_cta_phone).trim() : row.featured_cta_phone;
    if (phoneVal) {
      const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneVal, "phone");
      if (!vp.ok) return res.status(400).json({ error: vp.error || "Invalid phone." });
    }
    if (fpVal) {
      const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, fpVal, "phone");
      if (!vf.ok) return res.status(400).json({ error: vf.error || "Invalid CTA phone." });
    }

    let yearsExpUp = row.years_experience;
    if (d.years_experience !== undefined) {
      const yoeRawUp = String(d.years_experience).trim();
      if (yoeRawUp === "") yearsExpUp = null;
      else {
        yearsExpUp = Number(yoeRawUp);
        if (Number.isNaN(yearsExpUp) || yearsExpUp < 0 || yearsExpUp > 999) {
          return res.status(400).json({ error: "Years in business must be a number between 0 and 999." });
        }
      }
    }

    const galleryJsonUp = JSON.stringify(
      parseGalleryAdminText(d.gallery_text !== undefined ? String(d.gallery_text) : galleryToAdminText(parseGalleryJson(row.gallery_json)))
    );

    const canL = req.session.adminUser && canMutateCompanyFieldAgentLinkage(req.session.adminUser.role);
    const linkRes = await resolveCompanyFieldAgentLinkage(pool, {
      tenantId: tid,
      companyId: cid,
      canMutate: !!canL,
      existingRow: row,
      body: canL ? d : {},
    });
    if (!linkRes.ok) {
      return res.status(400).json({ error: linkRes.error });
    }

    try {
      const updated = await companiesRepo.updateFullByIdAndTenantId(pool, {
        id: cid,
        tenantId: tid,
        subdomain: cleanSubdomain,
        name: cleanName,
        categoryId: catId,
        headline: d.headline !== undefined ? String(d.headline).trim() : row.headline,
        about: d.about !== undefined ? String(d.about).trim() : row.about,
        services: d.services !== undefined ? String(d.services).trim() : row.services,
        phone: phoneVal,
        email: d.email !== undefined ? String(d.email).trim() : row.email,
        location: d.location !== undefined ? String(d.location).trim() : row.location,
        featuredCtaLabel:
          d.featured_cta_label !== undefined ? String(d.featured_cta_label).trim() || "Call us" : row.featured_cta_label,
        featuredCtaPhone: fpVal,
        yearsExperience: yearsExpUp,
        serviceAreas: d.service_areas !== undefined ? String(d.service_areas).trim() : row.service_areas,
        hoursText: d.hours_text !== undefined ? String(d.hours_text).trim() : row.hours_text,
        galleryJson: galleryJsonUp,
        logoUrl: d.logo_url !== undefined ? String(d.logo_url).trim() : row.logo_url,
        accountManagerFieldAgentId: linkRes.accountManagerFieldAgentId,
        sourceFieldAgentSubmissionId: linkRes.sourceFieldAgentSubmissionId,
      });
      if (!updated) return res.status(404).json({ error: "Company not found" });
      const saved = await companiesRepo.getWithCategoryByIdAndTenantId(pool, cid, tid);
      const reviewsOut = await reviewsRepo.listForCompanyAdminOrderByCreatedDesc(pool, cid);
      const galleryAdminTextOut = galleryToAdminText(parseGalleryJson(saved.gallery_json));
      return res.json({ ok: true, company: saved, reviews: reviewsOut, galleryAdminText: galleryAdminTextOut });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not save" });
    }
  });

  router.post("/companies", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const {
      name = "",
      subdomain = "",
      category_id = "",
      headline = "",
      about = "",
      services = "",
      phone = "",
      email = "",
      location = "",
      featured_cta_label = "Call us",
      featured_cta_phone = "",
      years_experience = "",
      service_areas = "",
      hours_text = "",
      gallery_text = "",
      logo_url = "",
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    if (catId) {
      const okCat = await categoriesRepo.getByIdAndTenantId(pool, catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const p = String(phone || "").trim();
    const fp = String(featured_cta_phone || "").trim();
    if (p) {
      const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, p, "phone");
      if (!vp.ok) return res.status(400).send(vp.error || "Invalid phone.");
    }
    if (fp) {
      const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, fp, "phone");
      if (!vf.ok) return res.status(400).send(vf.error || "Invalid CTA phone.");
    }

    const yoeRaw = String(years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));

    const canL = req.session.adminUser && canMutateCompanyFieldAgentLinkage(req.session.adminUser.role);
    const linkRes = await resolveCompanyFieldAgentLinkage(pool, {
      tenantId: tid,
      companyId: null,
      canMutate: !!canL,
      existingRow: null,
      body: req.body || {},
    });
    if (!linkRes.ok) {
      return res.status(400).send(linkRes.error);
    }

    try {
      await companiesRepo.insertFull(pool, {
        tenantId: tid,
        subdomain: cleanSubdomain,
        name: cleanName,
        categoryId: catId,
        headline: String(headline || "").trim(),
        about: String(about || "").trim(),
        services: String(services || "").trim(),
        phone: String(phone || "").trim(),
        email: String(email || "").trim(),
        location: String(location || "").trim(),
        featuredCtaLabel: String(featured_cta_label || "").trim() || "Call us",
        featuredCtaPhone: String(featured_cta_phone || "").trim(),
        yearsExperience: yearsExp,
        serviceAreas: String(service_areas || "").trim(),
        hoursText: String(hours_text || "").trim(),
        galleryJson,
        logoUrl: String(logo_url || "").trim(),
        accountManagerFieldAgentId: linkRes.accountManagerFieldAgentId,
        sourceFieldAgentSubmissionId: linkRes.sourceFieldAgentSubmissionId,
      });
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", requireDirectoryEditor, (req, res) => {
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(req.params.id)}/workspace`));
  });

  router.post("/companies/:id", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const {
      name = "",
      subdomain = "",
      category_id = "",
      headline = "",
      about = "",
      services = "",
      phone = "",
      email = "",
      location = "",
      featured_cta_label = "Call us",
      featured_cta_phone = "",
      years_experience = "",
      service_areas = "",
      hours_text = "",
      gallery_text = "",
      logo_url = "",
    } = req.body || {};

    const cleanName = String(name).trim();
    const cleanSubdomain = String(subdomain).trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) return res.status(400).send("Company subdomain is required.");

    const catId = category_id ? Number(category_id) : null;
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).send("Invalid id");

    const pool = getPgPool();
    if (catId) {
      const okCat = await categoriesRepo.getByIdAndTenantId(pool, catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const p = String(phone || "").trim();
    const fp = String(featured_cta_phone || "").trim();
    if (p) {
      const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, p, "phone");
      if (!vp.ok) return res.status(400).send(vp.error || "Invalid phone.");
    }
    if (fp) {
      const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, fp, "phone");
      if (!vf.ok) return res.status(400).send(vf.error || "Invalid CTA phone.");
    }

    const yoeRawUp = String(years_experience || "").trim();
    const yearsExpUp = yoeRawUp === "" ? null : Number(yoeRawUp);
    if (yearsExpUp != null && (Number.isNaN(yearsExpUp) || yearsExpUp < 0 || yearsExpUp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJsonUp = JSON.stringify(parseGalleryAdminText(gallery_text));

    const existing = await companiesRepo.getByIdAndTenantId(pool, cid, tid);
    if (!existing) return res.status(404).send("Company not found");
    const canL = req.session.adminUser && canMutateCompanyFieldAgentLinkage(req.session.adminUser.role);
    const linkRes = await resolveCompanyFieldAgentLinkage(pool, {
      tenantId: tid,
      companyId: cid,
      canMutate: !!canL,
      existingRow: existing,
      body: req.body || {},
    });
    if (!linkRes.ok) {
      return res.status(400).send(linkRes.error);
    }

    try {
      const updated = await companiesRepo.updateFullByIdAndTenantId(pool, {
        id: cid,
        tenantId: tid,
        subdomain: cleanSubdomain,
        name: cleanName,
        categoryId: catId,
        headline: String(headline || "").trim(),
        about: String(about || "").trim(),
        services: String(services || "").trim(),
        phone: String(phone || "").trim(),
        email: String(email || "").trim(),
        location: String(location || "").trim(),
        featuredCtaLabel: String(featured_cta_label || "").trim() || "Call us",
        featuredCtaPhone: String(featured_cta_phone || "").trim(),
        yearsExperience: yearsExpUp,
        serviceAreas: String(service_areas || "").trim(),
        hoursText: String(hours_text || "").trim(),
        galleryJson: galleryJsonUp,
        logoUrl: String(logo_url || "").trim(),
        accountManagerFieldAgentId: linkRes.accountManagerFieldAgentId,
        sourceFieldAgentSubmissionId: linkRes.sourceFieldAgentSubmissionId,
      });
      if (!updated) return res.status(404).send("Company not found");
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not update company: ${e.message}`);
    }
  });

  router.post("/companies/:id/delete", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`DELETE FROM public.leads WHERE company_id = $1 AND tenant_id = $2`, [companyId, tid]);
        const del = await client.query(`DELETE FROM public.companies WHERE id = $1 AND tenant_id = $2 RETURNING id`, [
          companyId,
          tid,
        ]);
        if (del.rowCount === 0) {
          await client.query("ROLLBACK");
          return res.status(404).send("Company not found");
        }
        await client.query("COMMIT");
      } catch (e) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {
          /* ignore */
        }
        throw e;
      } finally {
        client.release();
      }
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  /** Company leads: optional `company_id` filter is an explicit admin choice, not inferred from category/city. */
  router.get("/leads", async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);

      let leads = [];
      let companies = [];
      let selectedCompanyId = null;
      const companyId = req.query.company_id ? Number(req.query.company_id) : null;
      selectedCompanyId = companyId;
      const pool = getPgPool();
      companies = await companiesRepo.listIdNameSubdomainForTenant(pool, tid);

      if (companyId) {
        leads = await leadsRepo.listForAdminByCompany(pool, companyId, tid);
      } else {
        leads = await leadsRepo.listForAdminByTenant(pool, tid, 200);
      }

      const partnerCallbacks = await callbacksRepo.listForAdminByTenantId(pool, tid, 200);
      const partnerSignups = await professionalSignupsRepo.listByTenantId(pool, tid, 200);

      return res.render("admin/leads", {
        leads,
        companies,
        selectedCompanyId,
        partnerCallbacks,
        partnerSignups,
        role: req.session.adminUser.role,
        isViewer: isTenantViewer(req.session.adminUser.role),
        leadStatusLabel,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/leads/:id/edit", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const lead = await leadsRepo.getForAdminById(pool, id, tid);
    const comments = await leadsRepo.listCommentsByLeadId(pool, id);
    if (!lead) return res.status(404).send("Lead not found");
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/lead_edit", {
      lead,
      comments,
      leadStatuses: LEAD_STATUSES,
      currentStatus: normalizeLeadStatus(lead.status),
      activeNav: "leads",
      saved,
    });
  });

  router.post("/leads/:id", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const status = normalizeLeadStatus(req.body && req.body.status);
    const comment = String((req.body && req.body.comment) || "").trim();

    try {
      const exists = await leadsRepo.existsByIdAndTenantId(pool, id, tid);
      if (!exists) return res.status(404).send("Lead not found");
      const result = await leadsRepo.updateStatusWithOptionalComment(pool, {
        tenantId: tid,
        leadId: id,
        status,
        comment,
      });
      if (!result.ok) return res.status(404).send("Lead not found");
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/leads/${id}/edit?saved=1`));
  });

  router.get("/partner-signups/:id", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const signup = await professionalSignupsRepo.getByIdAndTenantId(pool, id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    let convertedCompany = null;
    if (conv > 0) {
      const r = await companiesRepo.getByIdAndTenantId(pool, conv, tid);
      convertedCompany = r ? { id: r.id, name: r.name, subdomain: r.subdomain } : null;
    }
    const categories = await getCategoriesForSelectAsync(db, tid);
    const defaultSub = await uniqueCompanySubdomainForTenantAsync(tid, signup.name || signup.profession || "listing");
    return res.render("admin/partner_signup_convert", {
      signup,
      categories,
      defaultSub,
      convertedCompany,
      activeNav: "leads",
    });
  });

  router.post("/partner-signups/:id/convert-to-company", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const pool = getPgPool();
    const signup = await professionalSignupsRepo.getByIdAndTenantId(pool, id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    if (conv > 0) return res.status(400).send("This signup was already converted.");

    const body = req.body || {};
    const cleanName = String(body.name || signup.name || "").trim();
    let cleanSubdomain = String(body.subdomain || "").trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) cleanSubdomain = await uniqueCompanySubdomainForTenantAsync(tid, cleanName);
    else cleanSubdomain = slugify(cleanSubdomain, { lower: true, strict: true, trim: true }).slice(0, 80);

    const catId = body.category_id ? Number(body.category_id) : null;
    if (catId) {
      const okCat = await categoriesRepo.getByIdAndTenantId(pool, catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const headline = String(body.headline || signup.profession || cleanName).trim().slice(0, 500);
    const about = String(body.about || "").trim();
    const services = String(body.services || signup.profession || "").trim();
    const phone = String(body.phone || signup.phone || "").trim();
    const email = String(body.email || "").trim();
    const location = String(body.location || signup.city || "").trim();
    const featured_cta_label = String(body.featured_cta_label || "Call us").trim() || "Call us";
    const featured_cta_phone = String(body.featured_cta_phone || signup.phone || "").trim();
    const service_areas = String(body.service_areas || "").trim();
    const hours_text = String(body.hours_text || "").trim();
    const logo_url = String(body.logo_url || "").trim();
    const gallery_text = String(body.gallery_text || "").trim();

    if (phone) {
      const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
      if (!vp.ok) return res.status(400).send(vp.error || "Invalid phone.");
    }
    if (featured_cta_phone) {
      const vf = await phoneRulesService.validatePhoneForTenant(pool, tid, featured_cta_phone, "phone");
      if (!vf.ok) return res.status(400).send(vf.error || "Invalid CTA phone.");
    }

    const yoeRaw = String(body.years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }

    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));
    const dup = await companiesRepo.existsSubdomainForTenant(pool, tid, cleanSubdomain);
    if (dup) return res.status(400).send("That mini-site slug is already in use for this region.");

    let newCompanyId = null;
    try {
      const raw = await companiesRepo.insertFull(pool, {
        tenantId: tid,
        subdomain: cleanSubdomain,
        name: cleanName,
        categoryId: catId,
        headline,
        about,
        services,
        phone,
        email,
        location,
        featuredCtaLabel: featured_cta_label,
        featuredCtaPhone: featured_cta_phone,
        yearsExperience: yearsExp,
        serviceAreas: service_areas,
        hoursText: hours_text,
        galleryJson,
        logoUrl: logo_url,
      });
      newCompanyId = raw.id;
      await professionalSignupsRepo.setConvertedCompanyId(pool, id, tid, newCompanyId);
    } catch (e) {
      return res.status(400).send(e.message || "Could not create company");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${newCompanyId}/workspace`));
  });
};
