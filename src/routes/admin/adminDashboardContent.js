/**
 * Dashboard, content, settings hub.
 */
const slugify = require("slugify");
const {
  requireDirectoryEditor,
  requireNotViewer,
  isSuperAdmin,
  isTenantViewer,
} = require("../../auth");
const {
  canEditDirectoryData,
  canAccessCrm,
  canManageTenantUsers,
  canAccessTenantSettings,
  canAccessSettingsHub,
} = require("../../auth/roles");
const {
  DEFAULT_CALLCENTER_PHONE,
  DEFAULT_SUPPORT_HELP_PHONE,
  DEFAULT_WHATSAPP_PHONE,
  DEFAULT_CALLCENTER_EMAIL,
} = require("../../tenants/tenantContactSupport");
const { LEAD_STATUSES, normalizeLeadStatus, leadStatusLabel } = require("../../crm/leadStatuses");
const { ADMIN_COMPANY_LEAD_SELECT, mapAdminCompanyLeadRow } = require("../../crm/leadCompanyRequestViewModel");
const { platformTenantPrefixForSlug } = require("../../companies/companyPageRender");
const { listAllByKind, getById } = require("../../content/contentPages");
const { CRM_TASK_STATUSES, normalizeCrmTaskStatus, crmTaskStatusLabel } = require("../../crm/crmTaskStatuses");
const {
  isEmbedRequest,
  redirectWithEmbed,
  getAdminTenantId,
  parseEditMode,
} = require("./adminShared");

module.exports = function registerAdminDashboardContentRoutes(router, deps) {
  const { db } = deps;
  router.get("/dashboard", (req, res) => {
    const u = req.session.adminUser;
    const tid = getAdminTenantId(req);

    const categoriesCount = Number(db.prepare("SELECT COUNT(*) AS c FROM categories WHERE tenant_id = ?").get(tid).c);
    const companiesCount = Number(db.prepare("SELECT COUNT(*) AS c FROM companies WHERE tenant_id = ?").get(tid).c);
    const leadsCount = Number(db.prepare("SELECT COUNT(*) AS c FROM leads WHERE tenant_id = ?").get(tid).c);

    const leadStatusRaw = db
      .prepare("SELECT status, COUNT(*) AS c FROM leads WHERE tenant_id = ? GROUP BY status")
      .all(tid);
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

    const dayCounts = db
      .prepare(
        `SELECT date(created_at) AS d, COUNT(*) AS c FROM leads WHERE tenant_id = ? AND date(created_at) >= date('now', '-6 days') GROUP BY date(created_at)`
      )
      .all(tid);
    const dayMap = Object.fromEntries(dayCounts.map((r) => [r.d, Number(r.c)]));
    const leadsLast7Days = [];
    let maxDay = 0;
    for (let i = 6; i >= 0; i--) {
      const dStr = db.prepare(`SELECT date('now', ?) AS d`).get(`-${i} days`).d;
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
      const crmRaw = db
        .prepare("SELECT status, COUNT(*) AS c FROM crm_tasks WHERE tenant_id = ? GROUP BY status")
        .all(tid);
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

    const latestLeads = db
      .prepare(
        `
        SELECT ${ADMIN_COMPANY_LEAD_SELECT}
        FROM leads l
        INNER JOIN companies c ON c.id = l.company_id
        WHERE l.tenant_id = ?
        ORDER BY l.created_at DESC
        LIMIT 10
        `
      )
      .all(tid)
      .map(mapAdminCompanyLeadRow)
      .filter(Boolean);

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
    });
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
    });
  });

  function contentKindLabel(kind) {
    if (kind === "guide") return "Pro guides";
    if (kind === "faq") return "Questions & answers";
    return "Articles";
  }

  function tenantPublicPrefixForAdmin(req) {
    const tid = getAdminTenantId(req);
    const t = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    if (!t || !t.slug) return "";
    return platformTenantPrefixForSlug(t.slug);
  }

  function contentPreviewPath(kind, slug) {
    const seg = kind === "article" ? "articles" : kind === "guide" ? "guides" : "answers";
    return `/${seg}/${encodeURIComponent(slug)}?preview=1`;
  }

  router.get("/content/new", requireDirectoryEditor, (req, res) => {
    const kind = String(req.query.kind || "article").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    return res.render("admin/content_form", {
      activeNav: "settings",
      kind,
      kindLabel: contentKindLabel(kind),
      row: null,
      editMode: true,
      embed: isEmbedRequest(req),
      publicPreviewUrl: "",
    });
  });

  router.get("/content", requireDirectoryEditor, (req, res) => {
    const kind = String(req.query.kind || "article").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    const tid = getAdminTenantId(req);
    const items = listAllByKind(db, tid, kind);
    return res.render("admin/content_list", {
      activeNav: "settings",
      kind,
      kindLabel: contentKindLabel(kind),
      items,
      editMode: parseEditMode(req),
      embed: isEmbedRequest(req),
    });
  });

  router.get("/content/:id", requireDirectoryEditor, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const row = getById(db, tid, id);
    if (!row) return res.status(404).send("Content not found.");
    const prefix = tenantPublicPrefixForAdmin(req);
    const previewPath = contentPreviewPath(row.kind, row.slug);
    const publicPreviewUrl = prefix ? `${String(prefix).replace(/\/$/, "")}${previewPath}` : previewPath;
    return res.render("admin/content_form", {
      activeNav: "settings",
      kind: row.kind,
      kindLabel: contentKindLabel(row.kind),
      row,
      editMode: parseEditMode(req),
      embed: isEmbedRequest(req),
      publicPreviewUrl,
    });
  });

  router.post("/content", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const kind = String(req.body.kind || "").toLowerCase();
    if (!["article", "guide", "faq"].includes(kind)) return res.status(400).send("Invalid kind.");
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).send("Title is required.");
    let slug = String(req.body.slug || "").trim().toLowerCase();
    if (!slug) slug = slugify(title, { lower: true, strict: true });
    const excerpt = String(req.body.excerpt || "").trim();
    const body = String(req.body.body || "").trim();
    const hero_image_url = String(req.body.hero_image_url || "").trim();
    const hero_image_alt = String(req.body.hero_image_alt || "").trim();
    const seo_title = String(req.body.seo_title || "").trim();
    const seo_description = String(req.body.seo_description || "").trim();
    const sort_order = Number(req.body.sort_order || 0) || 0;
    const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
    const tid = getAdminTenantId(req);
    try {
      const info = db
        .prepare(
          `
        INSERT INTO content_pages (
          tenant_id, kind, slug, title, excerpt, body, hero_image_url, hero_image_alt,
          seo_title, seo_description, published, sort_order, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `
        )
        .run(
          tid,
          kind,
          slug,
          title,
          excerpt,
          body,
          hero_image_url,
          hero_image_alt,
          seo_title || title,
          seo_description || excerpt,
          published,
          sort_order
        );
      const newId = Number(info.lastInsertRowid);
      return res.redirect(redirectWithEmbed(req, `/admin/content/${newId}?edit=1`));
    } catch (e) {
      return res.status(400).send(e.message || "Could not create content.");
    }
  });

  router.post("/content/:id", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const existing = getById(db, tid, id);
    if (!existing) return res.status(404).send("Not found.");
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).send("Title is required.");
    let slug = String(req.body.slug || "").trim().toLowerCase();
    if (!slug) slug = slugify(title, { lower: true, strict: true });
    const excerpt = String(req.body.excerpt || "").trim();
    const body = String(req.body.body || "").trim();
    const hero_image_url = String(req.body.hero_image_url || "").trim();
    const hero_image_alt = String(req.body.hero_image_alt || "").trim();
    const seo_title = String(req.body.seo_title || "").trim();
    const seo_description = String(req.body.seo_description || "").trim();
    const sort_order = Number(req.body.sort_order || 0) || 0;
    const published = req.body.published === "1" || req.body.published === "on" ? 1 : 0;
    try {
      db.prepare(
        `
        UPDATE content_pages SET
          slug = ?, title = ?, excerpt = ?, body = ?, hero_image_url = ?, hero_image_alt = ?,
          seo_title = ?, seo_description = ?, published = ?, sort_order = ?, updated_at = datetime('now')
        WHERE id = ? AND tenant_id = ?
        `
      ).run(
        slug,
        title,
        excerpt,
        body,
        hero_image_url,
        hero_image_alt,
        seo_title || title,
        seo_description || excerpt,
        published,
        sort_order,
        id,
        tid
      );
      return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
    } catch (e) {
      return res.status(400).send(e.message || "Could not update content.");
    }
  });

  router.post("/content/:id/publish", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const row = getById(db, tid, id);
    if (!row) return res.status(404).send("Not found.");
    const published = row.published ? 0 : 1;
    db.prepare("UPDATE content_pages SET published = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?").run(
      published,
      id,
      tid
    );
    return res.redirect(redirectWithEmbed(req, `/admin/content/${id}?edit=1`));
  });

  router.post("/content/:id/delete", requireDirectoryEditor, requireNotViewer, (req, res) => {
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const tid = getAdminTenantId(req);
    const r = db.prepare("DELETE FROM content_pages WHERE id = ? AND tenant_id = ?").run(id, tid);
    if (r.changes === 0) return res.status(404).send("Not found.");
    const kind = String(req.body.kind || "article").toLowerCase();
    const k = ["article", "guide", "faq"].includes(kind) ? kind : "article";
    return res.redirect(redirectWithEmbed(req, `/admin/content?kind=${encodeURIComponent(k)}&edit=1`));
  });

  router.get("/settings/tenants", (req, res) => {
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
    const tenants = db.prepare("SELECT * FROM tenants ORDER BY name COLLATE NOCASE ASC, id ASC").all();
    return res.render("admin/tenant_settings_list", {
      activeNav: "settings",
      tenants,
    });
  });

  router.get("/settings/tenant/:id", (req, res) => {
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
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ?").get(id);
    if (!tenant) return res.status(404).send("Region not found.");
    const saved = req.query.saved === "1" || req.query.saved === "true";
    return res.render("admin/tenant_settings_detail", {
      activeNav: "settings",
      tenant,
      isSuper: isSuperAdmin(u.role),
      saved,
    });
  });

  router.post("/settings/tenant/:id", (req, res) => {
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
    const row = db.prepare("SELECT id FROM tenants WHERE id = ?").get(id);
    if (!row) return res.status(404).send("Region not found.");

    const callcenter_phone = String(req.body.callcenter_phone || "").trim() || DEFAULT_CALLCENTER_PHONE;
    const support_help_phone = String(req.body.support_help_phone || "").trim() || DEFAULT_SUPPORT_HELP_PHONE;
    const whatsapp_phone = String(req.body.whatsapp_phone || "").trim() || DEFAULT_WHATSAPP_PHONE;
    const callcenter_email = String(req.body.callcenter_email || "").trim() || DEFAULT_CALLCENTER_EMAIL;

    try {
      db.prepare(
        `UPDATE tenants SET callcenter_phone = ?, support_help_phone = ?, whatsapp_phone = ?, callcenter_email = ? WHERE id = ?`
      ).run(callcenter_phone, support_help_phone, whatsapp_phone, callcenter_email, id);
    } catch (e) {
      return res.status(400).send(e.message || "Could not save");
    }
    return res.redirect(redirectWithEmbed(req, `/admin/settings/tenant/${id}?saved=1`));
  });
};
