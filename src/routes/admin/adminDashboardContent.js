/**
 * Dashboard, content, settings hub.
 */
const slugify = require("slugify");
const {
  requireAdmin,
  requireDirectoryEditor,
  requireNotViewer,
  requireContentManager,
  isSuperAdmin,
  isTenantViewer,
} = require("../../auth");
const {
  canEditDirectoryData,
  canAccessCrm,
  canManageTenantUsers,
  canAccessTenantSettings,
  canAccessSettingsHub,
  canManageArticles,
  canManageServiceProviderCategories,
  ROLES,
  normalizeRole,
} = require("../../auth/roles");
const {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_SUPPORT_HELP_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
} = require("../../tenants/tenantContactSupport");
const { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel } = require("../../crm/leadStatuses");
const { platformTenantPrefixForSlug } = require("../../companies/companyPageRender");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const phoneRulesRepo = require("../../db/pg/phoneRulesRepo");
const phoneRulesService = require("../../phone/phoneRulesService");
const contentPagesRepo = require("../../db/pg/contentPagesRepo");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const {
  isEmbedRequest,
  redirectWithEmbed,
  getAdminTenantId,
  parseEditMode,
} = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const companiesRepo = require("../../db/pg/companiesRepo");
const tenantCommerceSettingsRepo = require("../../db/pg/tenantCommerceSettingsRepo");
const { normalizeCommerceRow } = require("../../tenants/tenantCommerceSettings");
const leadsRepo = require("../../db/pg/leadsRepo");
const crmTasksRepo = require("../../db/pg/crmTasksRepo");

/** Match SQLite `date('now', '-n days')` for UTC calendar dates (dashboard sparkline). */
function dashboardUtcDateStringDaysAgo(daysAgo) {
  const now = new Date();
  const u = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return u.toISOString().slice(0, 10);
}

module.exports = function registerAdminDashboardContentRoutes(router) {
  router.get("/dashboard", async (req, res, next) => {
    try {
      const u = req.session.adminUser;
      const tid = getAdminTenantId(req);

      const pool = getPgPool();
      const categoriesCount = await categoriesRepo.countForTenant(pool, tid);
      const companiesCount = await companiesRepo.countForTenant(pool, tid);

      const leadsCount = await leadsRepo.countByTenantId(pool, tid);
      const leadStatusRaw = await leadsRepo.countGroupedByStatus(pool, tid);
      const startD = dashboardUtcDateStringDaysAgo(6);
      const endD = dashboardUtcDateStringDaysAgo(0);
      const dayMap = await leadsRepo.countByCreatedUtcDateInRange(pool, tid, startD, endD);
      const latestLeads = await leadsRepo.listForAdminByTenant(pool, tid, 10);

      const leadMerged = {};
      for (const row of leadStatusRaw) {
        const st = normalizeLeadStatus(row.status);
        leadMerged[st] = (leadMerged[st] || 0) + Number(row.c);
      }
      const leadsByStatus = LEAD_STATUSES.map((st) => ({
        status: st,
        label: leadStatusLabel(st),
        count: leadMerged[st] || 0,
      }));
      const leadsStatusDen = Math.max(1, leadsByStatus.reduce((a, x) => a + x.count, 0));

      const leadsLast7Days = [];
      let maxDay = 0;
      for (let i = 6; i >= 0; i--) {
        const dStr = dashboardUtcDateStringDaysAgo(i);
        const count = dayMap[dStr] || 0;
        if (count > maxDay) maxDay = count;
        const dt = new Date(`${dStr}T12:00:00`);
        leadsLast7Days.push({
          date: dStr,
          count,
          label: dt.toLocaleDateString("en", { weekday: "short" }),
        });
      }
      const leadsLast7Max = Math.max(1, maxDay);

      let crmSnapshot = null;
      if (canAccessCrm(u.role)) {
        const crmRaw =
          normalizeRole(u.role) === ROLES.CSR
            ? await crmTasksRepo.countGroupedByStatusForCsrScope(pool, tid, u.id)
            : await crmTasksRepo.countGroupedByStatusForTenant(pool, tid);
        const crmMerged = {};
        for (const row of crmRaw) {
          const st = normalizeCrmTaskStatus(row.status);
          crmMerged[st] = (crmMerged[st] || 0) + Number(row.c);
        }
        const crmByStatus = CRM_TASK_STATUSES.map((st) => ({
          status: st,
          label: crmTaskStatusLabel(st),
          count: crmMerged[st] || 0,
        }));
        const crmTotal = crmByStatus.reduce((a, x) => a + x.count, 0);
        crmSnapshot = { total: crmTotal, byStatus: crmByStatus, den: Math.max(1, crmTotal) };
      }

      return res.render("admin/dashboard", {
        categoriesCount,
        companiesCount,
        leadsCount,
        latestLeads,
        leadsByStatus,
        leadsStatusDen,
        leadsLast7Days,
        leadsLast7Max,
        crmSnapshot,
        baseDomain: process.env.BASE_DOMAIN || "",
        role: u.role,
        isViewer: isTenantViewer(u.role),
        canAccessCrm: canAccessCrm(u.role),
        canManageServiceProviderCategories: canManageServiceProviderCategories(u.role),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/settings", (req, res) => {
    const u = req.session.adminUser;
    if (!u) return res.redirect("/admin/login");
    if (!canAccessSettingsHub(u.role)) {
      return res.status(403).type("text").send("Access denied.");
    }
    const tid = getAdminTenantId(req);
    return res.render("admin/settings_hub", {
      activeNav: "settings",
      tenantIdForSettings: tid,
      isSuper: isSuperAdmin(u.role),
      canEditDirectory: canEditDirectoryData(u.role),
      canManageUsers: canManageTenantUsers(u.role),
      canAccessTenantSettings: canAccessTenantSettings(u.role),
      canManageArticles: canManageArticles(u.role),
      canManageServiceProviderCategories: canManageServiceProviderCategories(u.role),
    });
  });

  function contentKindLabel(kind) {
    if (kind === "guide") return "Pro guides";
    if (kind === "faq") return "Questions & answers";
    if (kind === "eula") return "Terms of use (EULA)";
    return "Articles";
  }

  function contentLocaleDefault(req) {
    return req.tenant && req.tenant.defaultLocale ? String(req.tenant.defaultLocale) : "en";
  }

  async function tenantPublicPrefixForAdmin(req, pool) {
    const tid = getAdminTenantId(req);
    const t = await tenantsRepo.getIdSlugById(pool, tid);
    if (!t || !t.slug) return "";
    return platformTenantPrefixForSlug(t.slug);
  }

  function contentPreviewPath(kind, slug) {
    if (kind === "eula") return `/terms?preview=1`;
    const seg = kind === "article" ? "articles" : kind === "guide" ? "guides" : "answers";
    return `/${seg}/${encodeURIComponent(slug)}?preview=1`;
  }

  router.get("/content/new", requireContentManager, (req, res) => {
    const kind = String(req.query.kind || "article").toLowerCase();
    if (!["article", "guide", "faq", "eula"].includes(kind)) return res.status(400).send("Invalid kind.");
    return res.render("admin/content_form", {
      activeNav: kind === "article" ? "articles" : "settings",
      kind,
      kindLabel: contentKindLabel(kind),
      row: null,
      editMode: true,
      embed: isEmbedRequest(req),
      publicPreviewUrl: "",
      contentLocaleDefault: contentLocaleDefault(req),
    });
  });

  router.get("/content", requireAdmin, async (req, res, next) => {
    try {
      const kind = String(req.query.kind || "article").toLowerCase();
      if (!["article", "guide", "faq", "eula"].includes(kind)) return res.status(400).send("Invalid kind.");
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const items = await contentPagesRepo.listAllByKindAdmin(pool, tid, kind);
      return res.render("admin/content_list", {
        activeNav: kind === "article" ? "articles" : "settings",
        kind,
        kindLabel: contentKindLabel(kind),
        items,
        editMode: parseEditMode(req),
        embed: isEmbedRequest(req),
        contentLocaleDefault: contentLocaleDefault(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/content/:id", requireAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      let editMode = parseEditMode(req);
      const u = req.session && req.session.adminUser;
      if (editMode && u && !canManageArticles(u.role)) {
        return res.redirect(redirectWithEmbed(req, `/admin/content/${id}`));
      }
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const row = await contentPagesRepo.getByIdAndTenantAdmin(pool, id, tid);
      if (!row) return res.status(404).send("Content not found.");
      const prefix = await tenantPublicPrefixForAdmin(req, pool);
      const previewPath = contentPreviewPath(row.kind, row.slug);
      const publicPreviewUrl = prefix ? `${String(prefix).replace(/\/$/, "")}${previewPath}` : previewPath;
      return res.render("admin/content_form", {
        activeNav: row.kind === "article" ? "articles" : "settings",
        kind: row.kind,
        kindLabel: contentKindLabel(row.kind),
        row,
        editMode,
        embed: isEmbedRequest(req),
        publicPreviewUrl,
        contentLocaleDefault: contentLocaleDefault(req),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/content", requireContentManager, async (req, res, next) => {
    const kind = String(req.body.kind || "").toLowerCase();
    if (!["article", "guide", "faq", "eula"].includes(kind)) return res.status(400).send("Invalid kind.");
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).send("Title is required.");
    let slug = String(req.body.slug || "").trim().toLowerCase();
    if (kind === "eula") {
      slug = "eula";
    } else if (!slug) {
      slug = slugify(title, { lower: true, strict: true });
    }
    const excerpt = String(req.body.excerpt || "").trim();
    const body = String(req.body.body || "").trim();
    const hero_image_url = String(req.body.hero_image_url || "").trim();
    const hero_image_alt = String(req.body.hero_image_alt || "").trim();
    const seo_title = String(req.body.seo_title || "").trim();
    const seo_description = String(req.body.seo_description || "").trim();
    const sort_order = Number(req.body.sort_order || 0) || 0;
    const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
    const locale = String(req.body.locale || "en").trim().slice(0, 32) || "en";
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    try {
      const newId = await contentPagesRepo.insertForAdmin(pool, {
        tenantId: tid,
        kind,
        slug,
        title,
        excerpt,
        body,
        heroImageUrl: hero_image_url,
        heroImageAlt: hero_image_alt,
        seoTitle: seo_title || title,
        seoDescription: seo_description || excerpt,
        published,
        sortOrder: sort_order,
        locale,
      });
      return res.redirect(redirectWithEmbed(req, `/admin/content/${newId}?edit=1`));
    } catch (e) {
      const msg = String(e.message || "");
      const uniqueViolation = e.code === "23505" || msg.includes("UNIQUE");
      if (uniqueViolation) {
        return res.status(400).send("That slug is already used for this content type in this region.");
      }
      return res.status(400).send(e.message || "Could not create content.");
    }
  });

  router.post("/content/:id", requireContentManager, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const existing = await contentPagesRepo.getByIdAndTenantAdmin(pool, id, tid);
      if (!existing) return res.status(404).send("Not found.");
      const title = String(req.body.title || "").trim();
      if (!title) return res.status(400).send("Title is required.");
      let slug = String(req.body.slug || "").trim().toLowerCase();
      if (existing.kind === "eula") {
        slug = "eula";
      } else if (!slug) {
        slug = slugify(title, { lower: true, strict: true });
      }
      const excerpt = String(req.body.excerpt || "").trim();
      const body = String(req.body.body || "").trim();
      const hero_image_url = String(req.body.hero_image_url || "").trim();
      const hero_image_alt = String(req.body.hero_image_alt || "").trim();
      const seo_title = String(req.body.seo_title || "").trim();
      const seo_description = String(req.body.seo_description || "").trim();
      const sort_order = Number(req.body.sort_order || 0) || 0;
      const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
      const locale = String(req.body.locale || "en").trim().slice(0, 32) || "en";
      try {
        const ok = await contentPagesRepo.updateForAdmin(pool, {
          id,
          tenantId: tid,
          slug,
          title,
          excerpt,
          body,
          heroImageUrl: hero_image_url,
          heroImageAlt: hero_image_alt,
          seoTitle: seo_title || title,
          seoDescription: seo_description || excerpt,
          published,
          sortOrder: sort_order,
          locale,
        });
        if (!ok) return res.status(404).send("Not found.");
        return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
      } catch (e) {
        const msg = String(e.message || "");
        const uniqueViolation = e.code === "23505" || msg.includes("UNIQUE");
        if (uniqueViolation) {
          return res.status(400).send("That slug is already used for this content type in this region.");
        }
        return res.status(400).send(e.message || "Could not update content.");
      }
    } catch (e) {
      next(e);
    }
  });

  router.post("/content/:id/publish", requireContentManager, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const row = await contentPagesRepo.getByIdAndTenantAdmin(pool, id, tid);
      if (!row) return res.status(404).send("Not found.");
      const nextPublished = !Boolean(row.published);
      const ok = await contentPagesRepo.setPublishedForAdmin(pool, tid, id, nextPublished);
      if (!ok) return res.status(404).send("Not found.");
      return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
    } catch (e) {
      next(e);
    }
  });

  router.post("/content/:id/delete", requireContentManager, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const deleted = await contentPagesRepo.deleteByIdAndTenantAdmin(pool, id, tid);
      if (!deleted) return res.status(404).send("Not found.");
      const kind = String(req.body.kind || "article").toLowerCase();
      const k = ["article", "guide", "faq", "eula"].includes(kind) ? kind : "article";
      return res.redirect(redirectWithEmbed(req, `/admin/content?kind=${encodeURIComponent(k)}&edit=1`));
    } catch (e) {
      next(e);
    }
  });

  router.get("/settings/tenants", async (req, res, next) => {
    try {
      const u = req.session.adminUser;
      if (!u) return res.redirect("/admin/login");
      if (!isSuperAdmin(u.role)) {
        if (!canAccessTenantSettings(u.role)) {
          return res.status(403).type("text").send("Access denied.");
        }
        const tid = getAdminTenantId(req);
        if (tid) return res.redirect(`/admin/settings/tenant/${tid}`);
        return res.status(403).type("text").send("Access denied.");
      }
      const pool = getPgPool();
      const tenants = await tenantsRepo.listAllOrderedByNameForSettings(pool);
      return res.render("admin/tenant_settings_list", {
        activeNav: "settings",
        tenants,
      });
    } catch (e) {
      next(e);
    }
  });

  router.get("/settings/tenant/:id", async (req, res, next) => {
    try {
      const u = req.session.adminUser;
      if (!u) return res.redirect("/admin/login");
      if (!canAccessTenantSettings(u.role)) {
        return res.status(403).type("text").send("Access denied.");
      }
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      const adminTid = getAdminTenantId(req);
      if (!isSuperAdmin(u.role) && id !== adminTid) {
        return res.status(403).type("text").send("You can only edit your region.");
      }
      const pool = getPgPool();
      const tenant = await tenantsRepo.getByIdForAdminSettings(pool, id);
      if (!tenant) return res.status(404).send("Region not found.");
      const commerceRaw = await tenantCommerceSettingsRepo.getByTenantId(pool, id);
      const commerce = normalizeCommerceRow(commerceRaw);
      const saved = req.query.saved === "1" || req.query.saved === "true";
      return res.render("admin/tenant_settings_detail", {
        activeNav: "tenant_contact",
        tenant,
        commerce,
        isSuper: isSuperAdmin(u.role),
        saved,
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/settings/tenant/:id", async (req, res, next) => {
    try {
      const u = req.session.adminUser;
      if (!u) return res.redirect("/admin/login");
      if (!canAccessTenantSettings(u.role)) {
        return res.status(403).type("text").send("Access denied.");
      }
      const id = Number(req.params.id);
      if (!id || id < 1) return res.status(400).send("Invalid id.");
      const adminTid = getAdminTenantId(req);
      if (!isSuperAdmin(u.role) && id !== adminTid) {
        return res.status(403).type("text").send("You can only edit your region.");
      }
      const pool = getPgPool();
      const exists = await tenantsRepo.tenantExistsById(pool, id);
      if (!exists) return res.status(404).send("Region not found.");

      const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
      const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
      const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
      const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;

      const hasPhoneRulesSection =
        req.body &&
        (Object.prototype.hasOwnProperty.call(req.body, "phone_regex") ||
          Object.prototype.hasOwnProperty.call(req.body, "phone_normalization_mode"));

      let phonePatch = null;
      if (hasPhoneRulesSection) {
        const phone_regex = String(req.body.phone_regex ?? "").trim();
        const cr = phoneRulesService.safeCompileRegex(phone_regex);
        if (phone_regex && !cr.ok) {
          return res.status(400).send("Invalid phone regex — fix the pattern or clear the field.");
        }
        const phone_strict_validation = ["1", "on", "true"].includes(
          String(req.body.phone_strict_validation || "").toLowerCase()
        );
        const phone_default_country_code = String(req.body.phone_default_country_code ?? "").trim();
        const phone_normalization_mode = String(req.body.phone_normalization_mode || "generic_digits").trim() || "generic_digits";
        phonePatch = {
          phone_strict_validation,
          phone_regex,
          phone_default_country_code,
          phone_normalization_mode,
        };
      }

      try {
        const ok = await tenantsRepo.updateContactSupportFields(pool, id, {
          callcenter_phone,
          support_help_phone,
          whatsapp_phone,
          callcenter_email,
        });
        if (!ok) return res.status(404).send("Region not found.");
        if (phonePatch) {
          const okPr = await phoneRulesRepo.updatePhoneRules(pool, id, phonePatch);
          if (!okPr) return res.status(404).send("Region not found.");
        }
        const hasCommerceSection = req.body && String(req.body.commerce_section || "").trim() === "1";
        if (hasCommerceSection) {
          const currency = String(req.body.commerce_currency || "").trim().slice(0, 12) || "ZMW";
          const deal_price_percentage = Number(req.body.commerce_deal_price_percentage);
          const minimum_credit_balance = Number(req.body.commerce_minimum_credit_balance);
          const starting_credit_balance = Number(req.body.commerce_starting_credit_balance);
          const minimum_review_rating = Number(req.body.commerce_minimum_review_rating);
          await tenantCommerceSettingsRepo.upsert(pool, id, {
            currency,
            deal_price_percentage,
            minimum_credit_balance,
            starting_credit_balance,
            minimum_review_rating,
          });
        }
      } catch (e) {
        return res.status(400).send(e.message || "Could not save");
      }
      return res.redirect(redirectWithEmbed(req, `/admin/settings/tenant/${id}?saved=1`));
    } catch (e) {
      next(e);
    }
  });
};
