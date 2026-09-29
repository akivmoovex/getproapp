"use strict";

/**
 * Shared announcement publication HTTP routes (AN01–AN05).
 * Product shells inject branding + authz. No background scheduler.
 */

const express = require("express");
const path = require("path");
const fs = require("fs");
const ejs = require("ejs");
const {
  CSRF_FIELD,
  validateCsrf,
  issueCsrfToken,
  setCsrfCookie,
} = require("./v5Csrf");
const svc = require("../announcements/tenantAnnouncementService");

const VIEWS = path.join(__dirname, "../../../views/platform/announcements");

function render(viewName, locals) {
  const layoutPath = path.join(VIEWS, "layout.ejs");
  const bodyPath = path.join(VIEWS, `${viewName}.ejs`);
  const body = ejs.render(fs.readFileSync(bodyPath, "utf8"), locals, {
    filename: bodyPath,
  });
  return ejs.render(
    fs.readFileSync(layoutPath, "utf8"),
    { ...locals, body },
    { filename: layoutPath }
  );
}

function createSharedAnnouncementRouter(deps) {
  const productCode = deps.productCode;
  const adminBasePath = deps.adminBasePath;
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = deps.isProduction === true;
  const brand = deps.brand || { productName: "Moovex", productClass: "" };
  const requireAdmin = deps.requireAdmin;
  const canView = deps.canView;
  const canManage = deps.canManage;
  const resolveTenant = deps.resolveTenant;

  const router = express.Router();

  function sendHtml(res, html, status) {
    res.status(status || 200).type("html").send(html);
  }

  function csrfLocals(req, res) {
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return { csrfField: CSRF_FIELD, csrfToken };
  }

  function authzFor(req) {
    return async (action) => {
      if (action === "view" && canView(req)) return { ok: true };
      if (action === "manage" && canManage(req)) return { ok: true };
      return { ok: false, reason: "forbidden" };
    };
  }

  // Public safe list (before admin gate)
  router.get(deps.publicListPath || "/announcements/public", async (req, res) => {
    const tenant = resolveTenant(req);
    if (!tenant || !tenant.organizationId) {
      return res.status(404).json({ ok: false });
    }
    const listed = await svc.listPublicAnnouncements(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      limit: 20,
    });
    return res.status(200).json({
      ok: listed.ok,
      items: (listed.items || []).map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        mediaUrl: i.mediaUrl,
        publishedAt: i.publishedAt,
        effectiveStatus: i.effectiveStatus,
      })),
      scheduler: svc.SCHEDULER_DEPENDENCY,
    });
  });

  if (Array.isArray(requireAdmin)) {
    router.use(adminBasePath, ...requireAdmin);
  } else if (typeof requireAdmin === "function") {
    router.use(adminBasePath, requireAdmin);
  }

  router.get(adminBasePath, async (req, res) => {
    if (!canView(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN01" }), 403);
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const listed = await svc.listAnnouncements(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      status: req.query.status || null,
      authz: authzFor(req),
    });
    const locals = {
      brand,
      basePath: adminBasePath,
      items: listed.items || [],
      stitchScreen: listed.items && listed.items.length ? "AN01" : "AN01",
      mobile: true,
      pageTitle: "Announcements",
      scheduler: svc.SCHEDULER_DEPENDENCY,
      canManage: canManage(req),
      ...csrfLocals(req, res),
    };
    return sendHtml(res, render("dashboard", locals));
  });

  router.get(adminBasePath + "/new", async (req, res) => {
    if (!canManage(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN02" }), 403);
    }
    return sendHtml(
      res,
      render("editor", {
        brand,
        basePath: adminBasePath,
        item: null,
        stitchScreen: "AN02",
        mode: "create",
        pageTitle: "New announcement",
        scheduler: svc.SCHEDULER_DEPENDENCY,
        error: null,
        ...csrfLocals(req, res),
      })
    );
  });

  router.post(adminBasePath, async (req, res) => {
    if (!canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const created = await svc.createAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      title: req.body.title,
      body: req.body.body,
      status: req.body.status || "draft",
      timezone: req.body.timezone,
      startsAt: req.body.starts_at,
      endsAt: req.body.ends_at,
      mediaUrl: req.body.media_url,
      mediaAssetRef: req.body.media_asset_ref,
      confirmPublish: req.body.confirm_publish,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req),
    });
    if (!created.ok) {
      return sendHtml(
        res,
        render("editor", {
          brand,
          basePath: adminBasePath,
          item: null,
          stitchScreen: "AN02",
          mode: "create",
          pageTitle: "New announcement",
          scheduler: svc.SCHEDULER_DEPENDENCY,
          error: created.reason || "Unable to save",
          ...csrfLocals(req, res),
        }),
        400
      );
    }
    return res.redirect(303, `${adminBasePath}/${created.item.id}`);
  });

  router.get(adminBasePath + "/:id", async (req, res) => {
    if (!canView(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN02" }), 403);
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const loaded = await svc.getAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      authz: authzFor(req),
    });
    if (!loaded.ok) return res.status(404).send("Not found");
    return sendHtml(
      res,
      render("editor", {
        brand,
        basePath: adminBasePath,
        item: loaded.item,
        history: loaded.history || [],
        stitchScreen: "AN02",
        mode: "edit",
        pageTitle: loaded.item.title,
        scheduler: svc.SCHEDULER_DEPENDENCY,
        error: null,
        canManage: canManage(req),
        ...csrfLocals(req, res),
      })
    );
  });

  router.post(adminBasePath + "/:id", async (req, res) => {
    if (!canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const updated = await svc.updateAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      title: req.body.title,
      body: req.body.body,
      status: req.body.status,
      timezone: req.body.timezone,
      startsAt: req.body.starts_at,
      endsAt: req.body.ends_at,
      mediaUrl: req.body.media_url,
      mediaAssetRef: req.body.media_asset_ref,
      confirmPublish: req.body.confirm_publish,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req),
    });
    if (!updated.ok) return res.status(400).send(updated.reason || "Unable to save");
    return res.redirect(303, `${adminBasePath}/${req.params.id}`);
  });

  router.get(adminBasePath + "/:id/schedule", async (req, res) => {
    if (!canManage(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN03" }), 403);
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const loaded = await svc.getAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      authz: authzFor(req),
    });
    if (!loaded.ok) return res.status(404).send("Not found");
    return sendHtml(
      res,
      render("schedule", {
        brand,
        basePath: adminBasePath,
        item: loaded.item,
        stitchScreen: "AN03",
        pageTitle: "Scheduling",
        scheduler: svc.SCHEDULER_DEPENDENCY,
        ...csrfLocals(req, res),
      })
    );
  });

  router.get(adminBasePath + "/:id/preview", async (req, res) => {
    if (!canView(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN04" }), 403);
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const loaded = await svc.getAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      authz: authzFor(req),
    });
    if (!loaded.ok) return res.status(404).send("Not found");
    return sendHtml(
      res,
      render("preview", {
        brand,
        basePath: adminBasePath,
        item: loaded.item,
        stitchScreen: "AN04",
        pageTitle: "Preview",
        scheduler: svc.SCHEDULER_DEPENDENCY,
      })
    );
  });

  router.get(adminBasePath + "/:id/confirm-publish", async (req, res) => {
    if (!canManage(req)) {
      return sendHtml(res, render("access-denied", { brand, stitchScreen: "AN05" }), 403);
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const loaded = await svc.getAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      authz: authzFor(req),
    });
    if (!loaded.ok) return res.status(404).send("Not found");
    return sendHtml(
      res,
      render("confirm-publish", {
        brand,
        basePath: adminBasePath,
        item: loaded.item,
        stitchScreen: "AN05",
        pageTitle: "Confirm publish",
        action: req.query.action === "unpublish" ? "unpublish" : "publish",
        scheduler: svc.SCHEDULER_DEPENDENCY,
        ...csrfLocals(req, res),
      })
    );
  });

  router.post(adminBasePath + "/:id/confirm-publish", async (req, res) => {
    if (!canManage(req)) return res.status(403).send("Forbidden");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).send("CSRF");
    }
    const tenant = resolveTenant(req);
    if (!tenant) return res.status(403).send("Forbidden");
    const action = String(req.body.action || "publish");
    const updated = await svc.updateAnnouncement(getPool(), {
      organizationId: tenant.organizationId,
      productCode,
      id: req.params.id,
      status: action === "unpublish" ? "draft" : action === "archive" ? "archived" : "published",
      confirmPublish: action === "publish" ? true : undefined,
      actorIdentityId: tenant.actorIdentityId,
      authz: authzFor(req),
    });
    if (!updated.ok) return res.status(400).send(updated.reason || "Unable to update");
    return res.redirect(303, `${adminBasePath}/${req.params.id}`);
  });

  return router;
}

module.exports = {
  createSharedAnnouncementRouter,
  SCHEDULER_DEPENDENCY: svc.SCHEDULER_DEPENDENCY,
};
