/**
 * Categories, cities, companies, leads, partner signups.
 */
const slugify = require("slugify");
const { requireDirectoryEditor, requireNotViewer, isTenantViewer } = require("../../auth");
const {
  parseGalleryAdminText,
  parseGalleryJson,
  galleryToAdminText,
  buildCompanyMiniSiteUrl,
  companyMiniSiteLabel,
  absoluteCompanyProfileUrl,
} = require("../../companies/companyProfile");
const { isValidPhoneForTenant } = require("../../tenants");
const { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel } = require("../../crm/leadStatuses");
const { ADMIN_COMPANY_LEAD_SELECT, mapAdminCompanyLeadRow } = require("../../crm/leadCompanyRequestViewModel");
const { buildCompanyPageLocals } = require("../../companies/companyPageRender");
const { tenantUsesZmwLeadCredits, isLeadAcceptanceBlockedByCredit } = require("../../companyPortal/companyPortalLeadCredits");
const {
  listRecentLedgerEntries,
  recordAdminPaymentCredit,
  paymentMethodLabel,
  PAYMENT_METHODS,
} = require("../../companyPortal/companyPortalCreditLedger");
const {
  redirectWithEmbed,
  getAdminTenantId,
  getCategoriesForSelect,
  uniqueCompanySubdomainForTenant,
  parseEditMode,
  filterSuffixFromQuery,
  mergeDraftCompanyForPreview,
} = require("./adminShared");

module.exports = function registerAdminDirectoryRoutes(router, deps) {
  const { db } = deps;
  router.get("/categories", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const allCategories = db
      .prepare("SELECT * FROM categories WHERE tenant_id = ? ORDER BY sort ASC, name ASC")
      .all(tid);
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

  router.get("/categories/new", requireDirectoryEditor, (req, res) => {
    return res.render("admin/category_form", { category: null });
  });

  router.post("/categories", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    try {
      const tid = getAdminTenantId(req);
      db.prepare("INSERT INTO categories (tenant_id, slug, name) VALUES (?, ?, ?)").run(tid, cleanSlug, cleanName);
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not create category: ${e.message}`);
    }
  });

  router.get("/categories/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const category = db.prepare("SELECT * FROM categories WHERE id = ? AND tenant_id = ?").get(req.params.id, tid);
    if (!category) return res.status(404).send("Category not found");
    return res.render("admin/category_form", { category });
  });

  router.post("/categories/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const { name = "", slug = "" } = req.body || {};
    const cleanName = String(name).trim();
    const cleanSlug = String(slug || "").trim() ? String(slug).trim().toLowerCase() : slugify(cleanName);

    if (!cleanName) return res.status(400).send("Category name is required.");
    if (!cleanSlug) return res.status(400).send("Category slug is required.");

    try {
      const tid = getAdminTenantId(req);
      const r = db
        .prepare("UPDATE categories SET slug = ?, name = ? WHERE id = ? AND tenant_id = ?")
        .run(cleanSlug, cleanName, req.params.id, tid);
      if (r.changes === 0) return res.status(404).send("Category not found");
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not update category: ${e.message}`);
    }
  });

  router.post("/categories/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const catId = Number(req.params.id);
    if (!catId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    const inTx = db.transaction(() => {
      db.prepare("UPDATE companies SET category_id = NULL WHERE category_id = ? AND tenant_id = ?").run(catId, tid);
      db.prepare("DELETE FROM categories WHERE id = ? AND tenant_id = ?").run(catId, tid);
    });
    try {
      inTx();
      return res.redirect(redirectWithEmbed(req, "/admin/categories?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete category: ${e.message}`);
    }
  });

  router.get("/cities", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    let cities = db
      .prepare("SELECT * FROM tenant_cities WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC")
      .all(tid);
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

  router.post("/cities", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    try {
      db.prepare("INSERT INTO tenant_cities (tenant_id, name, enabled, big_city) VALUES (?, ?, ?, ?)").run(
        tid,
        name,
        enabled,
        bigCity
      );
      return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not add city: ${e.message}`);
    }
  });

  router.post("/cities/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const cleanName = String(req.body.name || "").trim();
    if (!cleanName) return res.status(400).send("City name is required.");
    const enabled = req.body.enabled === "1" || req.body.enabled === "on" ? 1 : 0;
    const bigCity = req.body.big_city === "1" || req.body.big_city === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    const r = db
      .prepare("UPDATE tenant_cities SET name = ?, enabled = ?, big_city = ? WHERE id = ? AND tenant_id = ?")
      .run(cleanName, enabled, bigCity, req.params.id, tid);
    if (r.changes === 0) return res.status(404).send("City not found");
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.post("/cities/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    db.prepare("DELETE FROM tenant_cities WHERE id = ? AND tenant_id = ?").run(req.params.id, tid);
    return res.redirect(redirectWithEmbed(req, "/admin/cities?edit=1"));
  });

  router.get("/companies", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    let companies = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
        ORDER BY c.updated_at DESC
        `
      )
      .all(tid);
    const qn = String(req.query.q_name || "").trim().toLowerCase();
    const qs = String(req.query.q_subdomain || "").trim().toLowerCase();
    const qc = String(req.query.q_category || "").trim().toLowerCase();
    const qu = String(req.query.q_updated || "").trim().toLowerCase();
    if (qn) companies = companies.filter((c) => c.name.toLowerCase().includes(qn));
    if (qs) companies = companies.filter((c) => (c.subdomain || "").toLowerCase().includes(qs));
    if (qc) {
      companies = companies.filter((c) => (c.category_name || "").toLowerCase().includes(qc));
    }
    if (qu) {
      companies = companies.filter((c) => String(c.updated_at || "").toLowerCase().includes(qu));
    }
    const editMode = parseEditMode(req);
    const filterSuffix = filterSuffixFromQuery(req);
    const tsCompanies = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const baseDomain = (process.env.BASE_DOMAIN || "").trim();
    const scheme = process.env.PUBLIC_SCHEME || "https";
    const tenantSlug = tsCompanies && tsCompanies.slug ? String(tsCompanies.slug) : "";
    const portalCreditUiActive = tenantUsesZmwLeadCredits(db, tid);
    const companiesWithUrls = companies.map((c) => {
      const sub = String(c.subdomain || "").trim();
      const miniSitePublicUrl =
        baseDomain && tenantSlug && sub
          ? `${scheme}://${tenantSlug}.${baseDomain}/${encodeURIComponent(sub)}`
          : "";
      const portal_credit_blocked =
        portalCreditUiActive && isLeadAcceptanceBlockedByCredit(db, tid, c.portal_lead_credits_balance);
      return { ...c, miniSitePublicUrl, portal_credit_blocked };
    });
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/companies", {
      companies: companiesWithUrls,
      baseDomain,
      adminTenantSlug: tenantSlug,
      editMode,
      filterSuffix,
      saved,
      portalCreditUiActive,
      filters: {
        q_name: req.query.q_name || "",
        q_subdomain: req.query.q_subdomain || "",
        q_category: req.query.q_category || "",
        q_updated: req.query.q_updated || "",
      },
    });
  });

  router.get("/companies/new", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const categories = getCategoriesForSelect(db, tid);
    const ts = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const tenantSlug = ts ? String(ts.slug) : "";
    const saved = req.query.saved === "1" || req.query.saved === "true";
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
    });
  });

  router.get("/companies/:id/workspace", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).send("Invalid id");
    const company = db
      .prepare(
        `
        SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
        FROM companies c
        LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
        `
      )
      .get(cid, tid);
    if (!company) return res.status(404).send("Company not found");
    const categories = getCategoriesForSelect(db, tid);
    const tsEdit = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const galleryAdminText = galleryToAdminText(parseGalleryJson(company.gallery_json));
    const baseForUrls = (process.env.BASE_DOMAIN || "").trim() || "getproapp.org";
    const tenantSlug = tsEdit ? String(tsEdit.slug) : "";
    const miniSiteUrl = buildCompanyMiniSiteUrl(tenantSlug, company.subdomain, baseForUrls);
    const miniSiteLabel = companyMiniSiteLabel(tenantSlug, company.subdomain, baseForUrls);
    const directoryProfileUrl = absoluteCompanyProfileUrl(tenantSlug, company.id);
    const portalCreditUiActive = tenantUsesZmwLeadCredits(db, tid);
    const portalCreditBlocked =
      portalCreditUiActive && isLeadAcceptanceBlockedByCredit(db, tid, company.portal_lead_credits_balance);
    const recentLedgerRaw = portalCreditUiActive ? listRecentLedgerEntries(db, tid, cid, 25) : [];
    const recentLedgerEntries = recentLedgerRaw.map((r) => ({
      ...r,
      payment_method_label: paymentMethodLabel(r.payment_method),
    }));
    const paymentMethodOptions = PAYMENT_METHODS.map((v) => ({ value: v, label: paymentMethodLabel(v) }));
    const defaultPaymentDate = new Date().toISOString().slice(0, 10);
    const portalCreditNotice = String(req.query.credit_notice || "").trim().slice(0, 500) || null;
    const portalCreditError = String(req.query.credit_error || "").trim().slice(0, 500) || null;
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
      recentLedgerEntries,
      paymentMethodOptions,
      defaultPaymentDate,
      portalCreditNotice,
      portalCreditError,
    });
  });

  router.post(
    "/companies/:id/portal-credit-payment",
    requireDirectoryEditor,
    requireNotViewer,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).send("Invalid id.");
      if (!tenantUsesZmwLeadCredits(db, tid)) {
        return res.status(400).send("Credit ledger applies only in ZMW (Zambia) regions.");
      }
      const result = recordAdminPaymentCredit(db, {
        tenantId: tid,
        companyId: cid,
        adminUserId: req.session.adminUser.id,
        amountZmw: req.body && req.body.amount_zmw,
        paymentMethod: req.body && req.body.payment_method,
        transactionReference: req.body && req.body.transaction_reference,
        paymentDate: req.body && req.body.payment_date,
        approverName: req.body && req.body.approver_name,
        notes: req.body && req.body.notes,
      });
      if (!result.ok) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/companies/${cid}/workspace?credit_error=` + encodeURIComponent(result.error))
        );
      }
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/companies/${cid}/workspace?credit_notice=` +
            encodeURIComponent(`Payment recorded. New balance: ${result.newBalance} ZMW.`)
        )
      );
    }
  );

  router.get("/companies/:id/preview-frame", requireDirectoryEditor, async (req, res, next) => {
    try {
      const tid = getAdminTenantId(req);
      const cid = Number(req.params.id);
      if (!cid || cid < 1) return res.status(400).type("text").send("Invalid id");
      const company = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      if (!company) return res.status(404).type("text").send("Not found");
      const locals = await buildCompanyPageLocals(req, db, company);
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
      const baseRow = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      if (!baseRow) return res.status(404).json({ error: "Company not found" });
      const draft = req.body && req.body.company ? req.body.company : {};
      const merged = mergeDraftCompanyForPreview(db, baseRow, draft);
      const locals = await buildCompanyPageLocals(req, db, merged, {});
      return res.render("company", locals, (err, html) => {
        if (err) return next(err);
        return res.type("html").send(html);
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/companies/:id/publish", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    if (!cid || cid < 1) return res.status(400).json({ error: "Invalid id" });
    const row = db.prepare("SELECT * FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
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
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).json({ error: "Invalid category for this tenant." });
    }

    const tenantSlugRowUp = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const phoneVal = d.phone !== undefined ? String(d.phone).trim() : row.phone;
    const fpVal = d.featured_cta_phone !== undefined ? String(d.featured_cta_phone).trim() : row.featured_cta_phone;
    if (tenantSlugRowUp && tenantSlugRowUp.slug === "zm") {
      if (phoneVal && !isValidPhoneForTenant("zm", phoneVal)) {
        return res.status(400).json({ error: "Phone must be a Zambian number: 0 followed by 9 digits (10 digits total)." });
      }
      if (fpVal && !isValidPhoneForTenant("zm", fpVal)) {
        return res.status(400).json({ error: "CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total)." });
      }
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

    try {
      db.transaction(() => {
        db.prepare(
          `
          UPDATE companies
          SET
            subdomain = ?,
            name = ?,
            category_id = ?,
            headline = ?,
            about = ?,
            services = ?,
            phone = ?,
            email = ?,
            location = ?,
            featured_cta_label = ?,
            featured_cta_phone = ?,
            years_experience = ?,
            service_areas = ?,
            hours_text = ?,
            gallery_json = ?,
            logo_url = ?,
            updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
          `
        ).run(
          cleanSubdomain,
          cleanName,
          catId,
          d.headline !== undefined ? String(d.headline).trim() : row.headline,
          d.about !== undefined ? String(d.about).trim() : row.about,
          d.services !== undefined ? String(d.services).trim() : row.services,
          phoneVal,
          d.email !== undefined ? String(d.email).trim() : row.email,
          d.location !== undefined ? String(d.location).trim() : row.location,
          d.featured_cta_label !== undefined
            ? String(d.featured_cta_label).trim() || "Call us"
            : row.featured_cta_label,
          fpVal,
          yearsExpUp,
          d.service_areas !== undefined ? String(d.service_areas).trim() : row.service_areas,
          d.hours_text !== undefined ? String(d.hours_text).trim() : row.hours_text,
          galleryJsonUp,
          d.logo_url !== undefined ? String(d.logo_url).trim() : row.logo_url,
          cid,
          tid
        );
      })();

      const saved = db
        .prepare(
          `
          SELECT c.*, cat.slug AS category_slug, cat.name AS category_name
          FROM companies c
          LEFT JOIN categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
          WHERE c.id = ? AND c.tenant_id = ?
          `
        )
        .get(cid, tid);
      const reviewsOut = db
        .prepare(`SELECT id, rating, body, author_name, created_at FROM reviews WHERE company_id = ? ORDER BY datetime(created_at) DESC`)
        .all(cid);
      const galleryAdminTextOut = galleryToAdminText(parseGalleryJson(saved.gallery_json));
      return res.json({ ok: true, company: saved, reviews: reviewsOut, galleryAdminText: galleryAdminTextOut });
    } catch (e) {
      return res.status(400).json({ error: e.message || "Could not save" });
    }
  });

  router.post("/companies", requireDirectoryEditor, requireNotViewer, (req, res) => {
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
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const tenantSlugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRow && tenantSlugRow.slug === "zm") {
      const p = String(phone || "").trim();
      const fp = String(featured_cta_phone || "").trim();
      if (p && !isValidPhoneForTenant("zm", p)) {
        return res
          .status(400)
          .send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (fp && !isValidPhoneForTenant("zm", fp)) {
        return res
          .status(400)
          .send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRaw = String(years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));

    try {
      db.prepare(
        `
        INSERT INTO companies
          (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at,
           years_experience, service_areas, hours_text, gallery_json, logo_url)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
           ?, ?, ?, ?, ?)
        `
      ).run(
        cleanSubdomain,
        cleanName,
        catId,
        String(headline || "").trim(),
        String(about || "").trim(),
        String(services || "").trim(),
        String(phone || "").trim(),
        String(email || "").trim(),
        String(location || "").trim(),
        String(featured_cta_label || "").trim() || "Call us",
        String(featured_cta_phone || "").trim(),
        tid,
        yearsExp,
        String(service_areas || "").trim(),
        String(hours_text || "").trim(),
        galleryJson,
        String(logo_url || "").trim()
      );
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not create company: ${e.message}`);
    }
  });

  router.get("/companies/:id/edit", requireDirectoryEditor, (req, res) => {
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${encodeURIComponent(req.params.id)}/workspace`));
  });

  router.post("/companies/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
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
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
      if (!okCat) return res.status(400).send("Invalid category for this tenant.");
    }

    const tenantSlugRowUp = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRowUp && tenantSlugRowUp.slug === "zm") {
      const p = String(phone || "").trim();
      const fp = String(featured_cta_phone || "").trim();
      if (p && !isValidPhoneForTenant("zm", p)) {
        return res
          .status(400)
          .send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (fp && !isValidPhoneForTenant("zm", fp)) {
        return res
          .status(400)
          .send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRawUp = String(years_experience || "").trim();
    const yearsExpUp = yoeRawUp === "" ? null : Number(yoeRawUp);
    if (yearsExpUp != null && (Number.isNaN(yearsExpUp) || yearsExpUp < 0 || yearsExpUp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }
    const galleryJsonUp = JSON.stringify(parseGalleryAdminText(gallery_text));

    try {
      const r = db.prepare(
        `
        UPDATE companies
        SET
          subdomain = ?,
          name = ?,
          category_id = ?,
          headline = ?,
          about = ?,
          services = ?,
          phone = ?,
          email = ?,
          location = ?,
          featured_cta_label = ?,
          featured_cta_phone = ?,
          years_experience = ?,
          service_areas = ?,
          hours_text = ?,
          gallery_json = ?,
          logo_url = ?,
          updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `
      ).run(
        cleanSubdomain,
        cleanName,
        catId,
        String(headline || "").trim(),
        String(about || "").trim(),
        String(services || "").trim(),
        String(phone || "").trim(),
        String(email || "").trim(),
        String(location || "").trim(),
        String(featured_cta_label || "").trim() || "Call us",
        String(featured_cta_phone || "").trim(),
        yearsExpUp,
        String(service_areas || "").trim(),
        String(hours_text || "").trim(),
        galleryJsonUp,
        String(logo_url || "").trim(),
        req.params.id,
        tid
      );
      if (r.changes === 0) return res.status(404).send("Company not found");
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1&saved=1"));
    } catch (e) {
      return res.status(400).send(`Could not update company: ${e.message}`);
    }
  });

  router.post("/companies/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).send("Invalid id");
    const tid = getAdminTenantId(req);
    try {
      db.prepare("DELETE FROM leads WHERE company_id = ? AND tenant_id = ?").run(companyId, tid);
      db.prepare("DELETE FROM companies WHERE id = ? AND tenant_id = ?").run(companyId, tid);
      return res.redirect(redirectWithEmbed(req, "/admin/companies?edit=1"));
    } catch (e) {
      return res.status(400).send(`Could not delete company: ${e.message}`);
    }
  });

  /** Company leads: optional `company_id` filter is an explicit admin choice, not inferred from category/city. */
  router.get("/leads", (req, res) => {
    const tid = getAdminTenantId(req);

    let leads = [];
    let companies = [];
    let selectedCompanyId = null;
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    selectedCompanyId = companyId;
    companies = db
      .prepare("SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC")
      .all(tid);

    if (companyId) {
      leads = db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.company_id = ? AND l.tenant_id = ? AND c.tenant_id = ?
          ORDER BY l.created_at DESC
          `
        )
        .all(companyId, tid, tid)
        .map(mapAdminCompanyLeadRow)
        .filter(Boolean);
    } else {
      leads = db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.tenant_id = ?
          ORDER BY l.created_at DESC
          LIMIT 200
          `
        )
        .all(tid)
        .map(mapAdminCompanyLeadRow)
        .filter(Boolean);
    }

    const partnerCallbacks = db
      .prepare(
        `
        SELECT id, phone, name, context, interest_label, created_at
        FROM callback_interests
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 200
        `
      )
      .all(tid);

    const partnerSignups = db
      .prepare(
        `
        SELECT id, profession, city, name, phone, vat_or_pacra, created_at,
               COALESCE(converted_company_id, 0) AS converted_company_id
        FROM professional_signups
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT 200
        `
      )
      .all(tid);

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
  });

  router.get("/leads/:id/edit", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const lead = mapAdminCompanyLeadRow(
      db
        .prepare(
          `
          SELECT ${ADMIN_COMPANY_LEAD_SELECT}
          FROM leads l
          INNER JOIN companies c ON c.id = l.company_id
          WHERE l.id = ? AND l.tenant_id = ? AND c.tenant_id = ?
          `
        )
        .get(id, tid, tid)
    );
    if (!lead) return res.status(404).send("Lead not found");
    const comments = db
      .prepare(
        `SELECT id, body, created_at FROM lead_comments WHERE lead_id = ? ORDER BY datetime(created_at) ASC, id ASC`
      )
      .all(id);
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

  router.post("/leads/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const row = db.prepare("SELECT id FROM leads WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!row) return res.status(404).send("Lead not found");

    const status = normalizeLeadStatus(req.body && req.body.status);
    const comment = String((req.body && req.body.comment) || "").trim();

    try {
      db.transaction(() => {
        db.prepare(`UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
          status,
          id,
          tid
        );
        if (comment) {
          db.prepare(`INSERT INTO lead_comments (lead_id, body) VALUES (?, ?)`).run(id, comment.slice(0, 4000));
        }
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/leads/${id}/edit?saved=1`));
  });

  router.get("/partner-signups/:id", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const signup = db.prepare("SELECT * FROM professional_signups WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    let convertedCompany = null;
    if (conv > 0) {
      convertedCompany = db.prepare("SELECT id, name, subdomain FROM companies WHERE id = ? AND tenant_id = ?").get(conv, tid);
    }
    const categories = getCategoriesForSelect(db, tid);
    const defaultSub = uniqueCompanySubdomainForTenant(db, tid, signup.name || signup.profession || "listing");
    return res.render("admin/partner_signup_convert", {
      signup,
      categories,
      defaultSub,
      convertedCompany,
      activeNav: "leads",
    });
  });

  router.post("/partner-signups/:id/convert-to-company", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id");
    const signup = db.prepare("SELECT * FROM professional_signups WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!signup) return res.status(404).send("Join signup not found.");
    const conv = signup.converted_company_id != null ? Number(signup.converted_company_id) : 0;
    if (conv > 0) return res.status(400).send("This signup was already converted.");

    const body = req.body || {};
    const cleanName = String(body.name || signup.name || "").trim();
    let cleanSubdomain = String(body.subdomain || "").trim().toLowerCase();
    if (!cleanName) return res.status(400).send("Company name is required.");
    if (!cleanSubdomain) cleanSubdomain = uniqueCompanySubdomainForTenant(db, tid, cleanName);
    else cleanSubdomain = slugify(cleanSubdomain, { lower: true, strict: true, trim: true }).slice(0, 80);

    const catId = body.category_id ? Number(body.category_id) : null;
    if (catId) {
      const okCat = db.prepare("SELECT id FROM categories WHERE id = ? AND tenant_id = ?").get(catId, tid);
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

    const tenantSlugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (tenantSlugRow && tenantSlugRow.slug === "zm") {
      if (phone && !isValidPhoneForTenant("zm", phone)) {
        return res.status(400).send("Phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
      if (featured_cta_phone && !isValidPhoneForTenant("zm", featured_cta_phone)) {
        return res.status(400).send("CTA phone must be a Zambian number: 0 followed by 9 digits (10 digits total).");
      }
    }

    const yoeRaw = String(body.years_experience || "").trim();
    const yearsExp = yoeRaw === "" ? null : Number(yoeRaw);
    if (yearsExp != null && (Number.isNaN(yearsExp) || yearsExp < 0 || yearsExp > 999)) {
      return res.status(400).send("Years in business must be a number between 0 and 999.");
    }

    const galleryJson = JSON.stringify(parseGalleryAdminText(gallery_text));
    const dup = db.prepare("SELECT 1 FROM companies WHERE tenant_id = ? AND subdomain = ?").get(tid, cleanSubdomain);
    if (dup) return res.status(400).send("That mini-site slug is already in use for this region.");

    let newCompanyId = null;
    try {
      db.transaction(() => {
        const r = db
          .prepare(
            `
            INSERT INTO companies
              (subdomain, name, category_id, headline, about, services, phone, email, location, featured_cta_label, featured_cta_phone, tenant_id, updated_at,
               years_experience, service_areas, hours_text, gallery_json, logo_url)
            VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'),
               ?, ?, ?, ?, ?)
            `
          )
          .run(
            cleanSubdomain,
            cleanName,
            catId,
            headline,
            about,
            services,
            phone,
            email,
            location,
            featured_cta_label,
            featured_cta_phone,
            tid,
            yearsExp,
            service_areas,
            hours_text,
            galleryJson,
            logo_url
          );
        newCompanyId = Number(r.lastInsertRowid);
        const hasConv = db.prepare("PRAGMA table_info(professional_signups)").all().some((c) => c.name === "converted_company_id");
        if (hasConv) {
          db.prepare("UPDATE professional_signups SET converted_company_id = ? WHERE id = ? AND tenant_id = ?").run(
            newCompanyId,
            id,
            tid
          );
        }
      })();
    } catch (e) {
      return res.status(400).send(e.message || "Could not create company");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/companies/${newCompanyId}/workspace`));
  });
};
