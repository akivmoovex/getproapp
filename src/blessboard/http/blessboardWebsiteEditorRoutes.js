"use strict";

/**
 * BlessBoard public-website editor actions.
 * Same mechanism as ActiveClinic /clinics/:key/website/{drafts,media,preview,publish}.
 * Product HTTP only; mutation goes through the shared engine.
 */

const express = require("express");
const multer = require("multer");
const { validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");
const mediaService = require("../../platform/website/mediaService");
const contentService = require("../../platform/website/contentService");
const libraryModel = require("../../platform/website/libraryModel");
const {
  hasEditableField,
  ensureProductFieldsRegistered,
} = require("../../platform/website/editableFieldSchema");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteEditPath,
  buildPublicWebsiteHistoryPath,
  appendQuery,
} = require("../../platform/website/publicWebsiteUrl");
const { authorize, listEffectivePermissions } = require("../services/blessBoardRbacAuthorizationService");
const publicationService = require("../../platform/website/publicationService");
const versionService = require("../../platform/website/versionService");
const {
  loadHistoryPresentation,
  renderStandaloneHistoryPage,
} = require("../../platform/website/websiteHistoryHttp");
const { buildMediaPageView } = require("../../platform/website/mediaPageModel");
const {
  renderWebsiteMediaPageSection,
  MEDIA_PAGE_SCRIPT,
} = require("../../platform/website/renderWebsiteMediaPage");
const { renderWebsiteManagementPage } = require("../../platform/website/renderWebsiteManagementPage");
const { HISTORY_STYLESHEET } = require("../../platform/website/renderWebsiteHistory");
const { LIBRARY_STYLESHEET } = require("../../platform/website/renderWebsiteLibrary");
const { issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
const {
  locatorFromContentKey,
  saveFieldDraft,
} = require("../website/blessboardEngineContentService");
const {
  saveInlineFieldDraft,
} = require("../services/websiteInlineDraftService");
const {
  publishChurchWebsite,
} = require("../services/churchWebsitePublishService");
const { findOrganizationByKey } = require("../repositories/blessBoardCatalogueRepository");
const { getBlessBoardCatalogueContext } = require("../services/getBlessBoardCatalogueContext");
const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");
const { normalizeOrganizationKey } = require("../services/organizationKey");

function json(res, status, body) {
  return res.status(status).json(body);
}

function csrfFrom(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body[CSRF_FIELD]) return body[CSRF_FIELD];
  if (req.headers["x-csrf-token"] != null) return String(req.headers["x-csrf-token"]);
  return "";
}

function clientTenantOverride(body) {
  if (!body || typeof body !== "object") return false;
  return Boolean(
    body.organizationId ||
      body.organization_id ||
      body.instanceId ||
      body.instance_id ||
      body.product ||
      body.productCode
  );
}

function actorUserId(req) {
  return req.v5Session && req.v5Session.session && req.v5Session.session.userId
    ? req.v5Session.session.userId
    : null;
}

function parseLocator(body) {
  const contentKey = String((body && (body.contentKey || body.key)) || "").trim();
  if (contentKey) {
    const fromKey = locatorFromContentKey(contentKey);
    if (fromKey) return fromKey;
  }
  const pageKey = String((body && body.pageKey) || "").trim();
  const sectionKey = String((body && body.sectionKey) || "").trim();
  const fieldKey = String((body && body.fieldKey) || "").trim();
  if (pageKey && sectionKey && fieldKey) {
    return { pageKey, sectionKey, fieldKey };
  }
  return null;
}

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: mediaService.MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    const mime = String((file && file.mimetype) || "").toLowerCase();
    if (mime && mime !== "application/octet-stream" && !mediaService.ALLOWED_IMAGE_MIME.has(mime)) {
      const err = new Error("unsafe_media_type");
      err.code = mediaService.RESULT.UNSAFE_TYPE;
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   getEnv?: () => NodeJS.ProcessEnv,
 *   resolveTenant: (req: import('express').Request, res: import('express').Response) => Promise<{
 *     tenant: object,
 *     organizationKey: string,
 *   }|null>,
 *   pathPrefix: (organizationKey: string) => string,
 * }} opts
 */
function attachBlessBoardWebsiteEditorRoutes(router, opts) {
  const getPool = opts.getPool;
  const getEnv = typeof opts.getEnv === "function" ? opts.getEnv : () => process.env;
  const resolveTenant = opts.resolveTenant;
  const pathPrefix = opts.pathPrefix;

  function wantsHtml(req) {
    const accept = String((req.headers && req.headers.accept) || "");
    return accept.includes("text/html") || !accept.includes("application/json");
  }

  async function grantedWebsitePermissions(req, tenant) {
    const session = req.v5Session && req.v5Session.authenticated && req.v5Session.session;
    if (!session || !session.userId) return [];
    const listed = await listEffectivePermissions(getPool(), {
      actor: { userId: session.userId },
      tenantContext: tenant,
      resourceContext: {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: null,
      },
    });
    const keys = listed && Array.isArray(listed.permissions) ? listed.permissions : [];
    const granted = [];
    if (keys.includes("website.edit")) granted.push("website.edit", "website.view");
    if (keys.includes("website.publish")) granted.push("website.publish");
    if (keys.includes("website.rollback") || keys.includes("website.restore")) {
      granted.push("website.rollback", "website.restore");
    }
    return Array.from(new Set(granted));
  }

  async function resolveEngineInstanceForTenant(resolved) {
    const { resolveEngineInstance } = require("../website/blessboardEngineContentService");
    return resolveEngineInstance(getPool(), {
      organizationId: resolved.tenant.organization.id,
      slug: resolved.organizationKey,
      createIfMissing: false,
    });
  }

  async function requireEditor(req, res, permissionKey) {
    const resolved = await resolveTenant(req, res);
    if (!resolved) return null;
    const session = req.v5Session && req.v5Session.authenticated && req.v5Session.session;
    if (!session || !session.userId) {
      json(res, 401, { ok: false, code: "not_authenticated" });
      return null;
    }
    const authz = await authorize(getPool(), {
      actor: { userId: session.userId },
      permission: permissionKey,
      tenantContext: resolved.tenant,
      resourceContext: {
        organizationId: resolved.tenant.organization.id,
        churchId: resolved.tenant.church.id,
        branchId: null,
      },
    });
    if (!authz.allowed) {
      json(res, 403, { ok: false, code: "forbidden" });
      return null;
    }
    return resolved;
  }

  router.post(`${pathPrefix}/website/drafts`, express.json({ limit: "64kb" }), async (req, res, next) => {
    try {
      if (!validateCsrf(req, csrfFrom(req), getEnv())) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (clientTenantOverride(req.body)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const value = req.body && Object.prototype.hasOwnProperty.call(req.body, "value")
        ? req.body.value
        : "";
      const contentKey = String((req.body && (req.body.contentKey || req.body.key)) || "").trim();
      ensureProductFieldsRegistered(PRODUCT_CODE.BLESSBOARD);
      if (contentKey && hasEditableField(PRODUCT_CODE.BLESSBOARD, contentKey)) {
        const {
          resolveEngineInstance,
        } = require("../website/blessboardEngineContentService");
        const found = await resolveEngineInstance(getPool(), {
          organizationId: resolved.tenant.organization.id,
          slug: resolved.organizationKey,
          actorIdentityId: actorUserId(req),
        });
        if (!found.ok || !found.instance) {
          return json(res, 404, { ok: false, code: "website_instance_not_found" });
        }
        const engineSaved = await contentService.saveWebsiteDraft(getPool(), {
          organizationId: resolved.tenant.organization.id,
          instanceId: found.instance.id,
          expectedProductCode: PRODUCT_CODE.BLESSBOARD,
          contentKey,
          value,
          actorIdentityId: actorUserId(req),
          grantedPermissions: ["website.edit"],
        });
        if (!engineSaved.ok) {
          const notFound = engineSaved.code === "tenant_mismatch" || engineSaved.code === "media_not_found";
          return json(res, notFound ? 404 : 400, {
            ok: false,
            code: engineSaved.code || "save_failed",
            reason: engineSaved.reason || null,
          });
        }
        if (typeof value === "string") {
          const locator = locatorFromContentKey(contentKey);
          if (locator) {
            try {
              await saveInlineFieldDraft(getPool(), {
                organizationId: resolved.tenant.organization.id,
                churchId: resolved.tenant.church.id,
                branchId: null,
                editorUserId: actorUserId(req),
                pageKey: locator.pageKey,
                sectionKey: locator.sectionKey,
                fieldKey: locator.fieldKey,
                newValue: value,
                grantedPermissions: ["website.edit"],
              });
            } catch {
              /* overlay dual-write is compatibility-only */
            }
          }
        }
        return json(res, 200, {
          ok: true,
          published: false,
          code: "saved_to_draft",
          content: engineSaved.content || null,
          version: null,
        });
      }
      const locator = parseLocator(req.body);
      if (!locator) {
        return json(res, 400, { ok: false, code: "unknown_content_key" });
      }
      const engineSaved = await saveFieldDraft(getPool(), {
        organizationId: resolved.tenant.organization.id,
        churchId: resolved.tenant.church.id,
        branchId: null,
        pageKey: locator.pageKey,
        sectionKey: locator.sectionKey,
        fieldKey: locator.fieldKey,
        value,
        actorIdentityId: actorUserId(req),
        grantedPermissions: ["website.edit"],
        slug: resolved.organizationKey,
      });
      if (!engineSaved.ok && engineSaved.code !== "website_instance_not_found") {
        return json(res, 400, { ok: false, code: engineSaved.code || "save_failed" });
      }
      if (typeof value === "string") {
        try {
          await saveInlineFieldDraft(getPool(), {
            organizationId: resolved.tenant.organization.id,
            churchId: resolved.tenant.church.id,
            branchId: null,
            editorUserId: actorUserId(req),
            pageKey: locator.pageKey,
            sectionKey: locator.sectionKey,
            fieldKey: locator.fieldKey,
            newValue: value,
            grantedPermissions: ["website.edit"],
          });
        } catch {
          /* overlay dual-write is compatibility-only */
        }
      }
      return json(res, 200, {
        ok: true,
        published: false,
        code: "saved_to_draft",
        content: engineSaved.content || null,
        version: null,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post(`${pathPrefix}/website/section-actions`, express.json({ limit: "16kb" }), async (req, res, next) => {
    try {
      if (!validateCsrf(req, csrfFrom(req), getEnv())) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (clientTenantOverride(req.body)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const { applySectionAction } = require("../website/blessboardSectionActionService");
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const result = await applySectionAction(getPool(), {
        organizationId: resolved.tenant.organization.id,
        churchId: resolved.tenant.church.id,
        branchId: null,
        editorUserId: actorUserId(req),
        actorRole: "church_hq_admin",
        pageKey: body.pageKey,
        sectionKey: body.sectionKey,
        action: body.action,
        order: body.order,
        grantedPermissions: ["website.edit"],
      });
      if (!result.ok) {
        const status =
          result.code === "forbidden" || result.code === "locked_item" ? 403 : result.code === "not_found" ? 404 : 400;
        return json(res, status, { ok: false, code: result.code || "action_failed" });
      }
      return json(res, 200, { ok: true, published: false, ...result });
    } catch (err) {
      return next(err);
    }
  });

  router.get(`${pathPrefix}/website/preview`, async (req, res, next) => {
    try {
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const dest = buildPublicWebsitePreviewPath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: resolved.organizationKey,
      });
      return res.redirect(303, dest || appendQuery(req.originalUrl || "/", { website_mode: "draft" }));
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    `${pathPrefix}/website/drafts/discard`,
    express.urlencoded({ extended: false }),
    express.json({ limit: "8kb" }),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, csrfFrom(req), getEnv())) {
          if (String(req.headers.accept || "").includes("application/json")) {
            return json(res, 403, { ok: false, code: "csrf" });
          }
          return res.status(403).type("text").send("Invalid CSRF token");
        }
        const resolved = await requireEditor(req, res, "website.edit");
        if (!resolved) return undefined;
        const { discardWebsiteDrafts } = require("../services/websiteDraftPublishService");
        const result = await discardWebsiteDrafts(getPool(), {
          organizationId: resolved.tenant.organization.id,
          churchId: resolved.tenant.church.id,
          branchId: null,
          actorUserId: actorUserId(req),
          confirmDiscard: req.body && req.body.confirm_discard,
          actorRole: "church_hq_admin",
        });
        if (String(req.headers.accept || "").includes("application/json")) {
          return json(res, result.ok ? 200 : 400, {
            ok: Boolean(result.ok),
            code: result.ok ? "discarded" : result.reason || result.status,
            discarded: result.discarded || 0,
          });
        }
        const publicPath =
          buildPublicOrganizationWebsitePath({
            product: PRODUCT_CODE.BLESSBOARD,
            organizationKey: resolved.organizationKey,
          }) || "/";
        if (!result.ok) {
          return res.redirect(303, `${publicPath}?website_discard_error=1`);
        }
        return res.redirect(303, appendQuery(publicPath, { website_edit: "1", website_mode: "draft" }));
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(`${pathPrefix}/website/publish`, express.urlencoded({ extended: false }), express.json({ limit: "8kb" }), async (req, res, next) => {
    try {
      if (!validateCsrf(req, csrfFrom(req), getEnv())) {
        if (String(req.headers.accept || "").includes("application/json")) {
          return json(res, 403, { ok: false, code: "csrf" });
        }
        return res.status(403).type("text").send("Invalid CSRF token");
      }
      const resolved = await requireEditor(req, res, "website.publish");
      if (!resolved) return undefined;
      const published = await publishChurchWebsite(getPool(), {
        churchId: resolved.tenant.church.id,
        organizationId: resolved.tenant.organization.id,
        actorUserId: actorUserId(req),
        deferServiceTimes: true,
        confirmPublish: true,
        mobilePreviewConfirmed: true,
        relaxPreviewRequirement: true,
        forcePublishVersion: true,
      });
      if (String(req.headers.accept || "").includes("application/json")) {
        return json(res, published.ok ? 200 : 400, {
          ok: Boolean(published.ok),
          published: Boolean(published.ok),
          code: published.ok ? "published" : published.reason || published.status,
        });
      }
      if (!published.ok) {
        return res.redirect(303, `/hq/website/publish/error?codes=${encodeURIComponent(published.reason || "publish")}`);
      }
      const publicPath = buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: resolved.organizationKey,
      });
      return res.redirect(303, publicPath || "/hq/website");
    } catch (err) {
      return next(err);
    }
  });

  router.get(`${pathPrefix}/website/media`, async (req, res, next) => {
    try {
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const {
        resolveEngineInstance,
      } = require("../website/blessboardEngineContentService");
      const found = await resolveEngineInstance(getPool(), {
        organizationId: resolved.tenant.organization.id,
        slug: resolved.organizationKey,
        createIfMissing: false,
      });
      if (!found.ok || !found.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const listed = await mediaService.listWebsiteMedia(getPool(), {
        organizationId: resolved.tenant.organization.id,
        instanceId: found.instance.id,
      });
      const items = libraryModel.normalizeLibraryItems(listed.media || [], (row) => {
        const delivered = mediaService.presentWebsiteMediaForClient(found.instance, row);
        return { previewUrl: delivered.publicSrc };
      });
      return json(res, 200, {
        ok: true,
        media: items.map((item) => ({
          ...item,
          publicSrc: item.previewUrl,
          originalFilename: item.title,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  router.get(`${pathPrefix}/website/media/:mediaId`, async (req, res, next) => {
    try {
      const resolved = await resolveTenant(req, res);
      if (!resolved) return undefined;
      const mediaId = String(req.params.mediaId || "");
      const organizationId = resolved.tenant.organization.id;
      const loaded = await mediaService.getWebsiteMedia(getPool(), {
        mediaId,
        organizationId,
      });
      if (!loaded.ok || loaded.media.status !== "active") {
        return res.status(404).type("text").send("Not found");
      }
      const {
        resolveEngineInstance,
      } = require("../website/blessboardEngineContentService");
      const found = await resolveEngineInstance(getPool(), {
        organizationId,
        slug: resolved.organizationKey,
        createIfMissing: false,
      });
      if (!found.ok || !found.instance || loaded.media.instanceId !== found.instance.id) {
        return res.status(404).type("text").send("Not found");
      }
      const published = await mediaService.isPublishedInUse(getPool(), mediaId, organizationId);
      if (!published) {
        const session = req.v5Session && req.v5Session.authenticated && req.v5Session.session;
        if (!session || !session.userId) {
          return res.status(404).type("text").send("Not found");
        }
        const authz = await authorize(getPool(), {
          actor: { userId: session.userId },
          permission: "website.edit",
          tenantContext: resolved.tenant,
          resourceContext: {
            organizationId,
            churchId: resolved.tenant.church.id,
            branchId: null,
          },
        });
        if (!authz.allowed) {
          return res.status(404).type("text").send("Not found");
        }
      }
      const payload = await mediaService.getWebsiteMediaPayload(getPool(), {
        mediaId,
        organizationId,
      });
      if (!payload.ok) return res.status(404).type("text").send("Not found");
      const mime = String(payload.mimeType || "").toLowerCase();
      if (!mediaService.ALLOWED_IMAGE_MIME.has(mime)) {
        return res.status(404).type("text").send("Not found");
      }
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", published ? "public, max-age=300" : "private, no-store");
      return res.status(200).send(payload.buffer);
    } catch (err) {
      return next(err);
    }
  });

  router.post(`${pathPrefix}/website/media`, (req, res, next) => {
    mediaUpload.single("file")(req, res, (err) => {
      if (err) {
        const code =
          err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
            ? mediaService.RESULT.TOO_LARGE
            : err && err.code === mediaService.RESULT.UNSAFE_TYPE
              ? mediaService.RESULT.UNSAFE_TYPE
              : "invalid_upload";
        return json(res, 400, { ok: false, code });
      }
      return registerMedia(req, res, next);
    });
  });

  async function registerMedia(req, res, next) {
    try {
      if (!validateCsrf(req, csrfFrom(req), getEnv())) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const {
        resolveEngineInstance,
      } = require("../website/blessboardEngineContentService");
      const found = await resolveEngineInstance(getPool(), {
        organizationId: resolved.tenant.organization.id,
        slug: resolved.organizationKey,
        actorIdentityId: actorUserId(req),
      });
      if (!found.ok || !found.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      if (req.body && req.body.reuseMediaId) {
        const existing = await mediaService.getWebsiteMedia(getPool(), {
          mediaId: req.body.reuseMediaId,
          organizationId: resolved.tenant.organization.id,
        });
        if (!existing.ok || existing.media.instanceId !== found.instance.id) {
          return json(res, 404, { ok: false, code: "media_not_found" });
        }
        return json(res, 200, {
          ok: true,
          published: false,
          media: mediaService.presentWebsiteMediaForClient(found.instance, existing.media),
          reused: true,
        });
      }
      const file = req.file || null;
      const registered = await mediaService.registerWebsiteMedia(getPool(), {
        organizationId: resolved.tenant.organization.id,
        instanceId: found.instance.id,
        expectedProductCode: PRODUCT_CODE.BLESSBOARD,
        actorIdentityId: actorUserId(req),
        mediaKind: (req.body && req.body.mediaKind) || (file ? "image" : undefined),
        originalFilename: (file && file.originalname) || (req.body && req.body.originalFilename),
        mimeType: (file && file.mimetype) || (req.body && req.body.mimeType),
        sizeBytes: file ? file.size : req.body && req.body.sizeBytes,
        altText: req.body && req.body.altText,
        buffer: file ? file.buffer : null,
      });
      if (!registered.ok) {
        return json(res, 400, { ok: false, code: registered.code || "invalid_upload" });
      }
      return json(res, 200, {
        ok: true,
        published: false,
        media: mediaService.presentWebsiteMediaForClient(found.instance, registered.media),
      });
    } catch (err) {
      return next(err);
    }
  }

  router.get(`${pathPrefix}/website/history`, async (req, res, next) => {
    try {
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const found = await resolveEngineInstanceForTenant(resolved);
      if (!found.ok || !found.instance) {
        return wantsHtml(req)
          ? res.status(404).type("text").send("Website not found")
          : json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const granted = await grantedWebsitePermissions(req, resolved.tenant);
      const canRestore =
        granted.includes("website.restore") || granted.includes("website.rollback");
      const env = getEnv();
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, {
        secure: String(env.NODE_ENV || "") === "production",
        env,
        req,
      });
      const basePath = buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: resolved.organizationKey,
      });
      const presentation = await loadHistoryPresentation(getPool(), {
        organizationId: resolved.tenant.organization.id,
        instance: found.instance,
        productCode: PRODUCT_CODE.BLESSBOARD,
        siteLabel:
          (resolved.tenant.church && resolved.tenant.church.displayName) ||
          resolved.organizationKey,
        canRestore,
        backHref: buildPublicWebsiteEditPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: resolved.organizationKey,
        }),
        previewHrefFor: (versionId) =>
          basePath ? `${basePath}/website/versions/${encodeURIComponent(versionId)}` : null,
        restoreHrefFor: (versionId) =>
          basePath
            ? `${basePath}/website/versions/${encodeURIComponent(versionId)}/restore`
            : null,
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
        csrfField: CSRF_FIELD,
        csrfToken,
      });
      if (!wantsHtml(req)) {
        return json(res, 200, {
          ok: true,
          versions: presentation.history.versions,
          unpublishedCount: presentation.unpublishedCount,
          canRestore,
        });
      }
      return res.status(200).type("html").send(renderStandaloneHistoryPage(presentation));
    } catch (err) {
      return next(err);
    }
  });

  router.post(
    `${pathPrefix}/website/versions/:versionId/restore`,
    express.urlencoded({ extended: false }),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, csrfFrom(req), getEnv())) {
          return wantsHtml(req)
            ? res.status(403).type("text").send("Invalid CSRF token")
            : json(res, 403, { ok: false, code: "csrf" });
        }
        if (clientTenantOverride(req.body)) {
          return json(res, 403, { ok: false, code: "forbidden" });
        }
        const resolved = await requireEditor(req, res, "website.edit");
        if (!resolved) return undefined;
        const found = await resolveEngineInstanceForTenant(resolved);
        if (!found.ok || !found.instance) {
          return json(res, 404, { ok: false, code: "website_instance_not_found" });
        }
        const granted = await grantedWebsitePermissions(req, resolved.tenant);
        const restored = await publicationService.restoreWebsiteVersionToDraft(getPool(), {
          organizationId: resolved.tenant.organization.id,
          instanceId: found.instance.id,
          expectedProductCode: PRODUCT_CODE.BLESSBOARD,
          versionId: req.params.versionId,
          actorIdentityId: actorUserId(req),
          grantedPermissions: granted,
        });
        if (!restored.ok) {
          if (wantsHtml(req)) {
            return res.redirect(
              303,
              appendQuery(
                buildPublicWebsiteHistoryPath({
                  product: PRODUCT_CODE.BLESSBOARD,
                  organizationKey: resolved.organizationKey,
                }),
                { error: restored.code || "restore_failed" }
              )
            );
          }
          return json(res, restored.code === "forbidden" ? 403 : 400, {
            ok: false,
            code: restored.code,
          });
        }
        if (wantsHtml(req)) {
          return res.redirect(
            303,
            appendQuery(
              buildPublicWebsiteEditPath({
                product: PRODUCT_CODE.BLESSBOARD,
                organizationKey: resolved.organizationKey,
              }),
              { notice: "restored_draft" }
            )
          );
        }
        return json(res, 200, { ok: true, code: "restored_draft", publishedUnchanged: true });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.get(`${pathPrefix}/website/versions/:versionId`, async (req, res, next) => {
    try {
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const found = await resolveEngineInstanceForTenant(resolved);
      if (!found.ok || !found.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const loaded = await versionService.getWebsiteVersion(getPool(), {
        versionId: req.params.versionId,
        organizationId: resolved.tenant.organization.id,
        instanceId: found.instance.id,
      });
      if (!loaded.ok) {
        return json(res, 404, { ok: false, code: loaded.code });
      }
      if (!wantsHtml(req)) {
        return json(res, 200, { ok: true, version: loaded.version });
      }
      const bodyHtml = [
        '<section class="gp-we-history" data-gp-website-history="1">',
        `<h1>Version v${Number(loaded.version.versionNumber) || "—"}</h1>`,
        "<p>Restore this version as a draft to preview it in the editor. The live website stays unchanged until you publish.</p>",
        `<p><a class="gp-we-history__back" href="${buildPublicWebsiteHistoryPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: resolved.organizationKey,
        })}">Back to version history</a></p>`,
        "</section>",
      ].join("");
      return res.status(200).type("html").send(
        renderWebsiteManagementPage({
          pageTitle: `Version v${Number(loaded.version.versionNumber) || ""}`,
          productCode: PRODUCT_CODE.BLESSBOARD,
          siteLabel:
            (resolved.tenant.church && resolved.tenant.church.displayName) ||
            resolved.organizationKey,
          backHref: buildPublicWebsiteHistoryPath({
            product: PRODUCT_CODE.BLESSBOARD,
            organizationKey: resolved.organizationKey,
          }),
          bodyHtml,
          stylesheets: [HISTORY_STYLESHEET],
          scripts: [],
          csrfToken: "",
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  router.get(`${pathPrefix}/website/media-library`, async (req, res, next) => {
    try {
      const resolved = await requireEditor(req, res, "website.edit");
      if (!resolved) return undefined;
      const found = await resolveEngineInstanceForTenant(resolved);
      if (!found.ok || !found.instance) {
        return res.status(404).type("text").send("Website not found");
      }
      const env = getEnv();
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, {
        secure: String(env.NODE_ENV || "") === "production",
        env,
        req,
      });
      const basePath = `${buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: resolved.organizationKey,
      })}/website/media-library`;
      const listed = await mediaService.listWebsiteMedia(getPool(), {
        organizationId: resolved.tenant.organization.id,
        instanceId: found.instance.id,
      });
      const items = libraryModel.normalizeLibraryItems(listed.media || [], (row) => {
        const delivered = mediaService.presentWebsiteMediaForClient(found.instance, row);
        return {
          previewUrl: delivered.publicSrc,
          detailsUrl: `${basePath}?media=${encodeURIComponent(row.id)}`,
        };
      });
      const page = buildMediaPageView({
        productCode: PRODUCT_CODE.BLESSBOARD,
        siteLabel:
          (resolved.tenant.church && resolved.tenant.church.displayName) ||
          resolved.organizationKey,
        items,
        basePath,
        backHref: buildPublicWebsiteEditPath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: resolved.organizationKey,
        }),
        uploadAction: `${buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.BLESSBOARD,
          organizationKey: resolved.organizationKey,
        })}/website/media`,
        canUpload: true,
        q: req.query && req.query.q,
        kind: req.query && req.query.type,
        csrfField: CSRF_FIELD,
        csrfToken,
      });
      const bodyHtml = renderWebsiteMediaPageSection(page);
      return res.status(200).type("html").send(
        renderWebsiteManagementPage({
          pageTitle: page.pageTitle,
          productCode: page.productCode,
          siteLabel: page.siteLabel,
          backHref: page.backHref,
          bodyHtml,
          stylesheets: [HISTORY_STYLESHEET, page.libraryStylesheet || LIBRARY_STYLESHEET],
          scripts: [MEDIA_PAGE_SCRIPT],
          csrfToken,
        })
      );
    } catch (err) {
      return next(err);
    }
  });
}

async function resolvePathEditorTenant(getPool, req, organizationKeyRaw) {
  const rawKey = String(organizationKeyRaw || "").trim().toLowerCase();
  const keyNorm = normalizeOrganizationKey(rawKey);
  if (!keyNorm.ok) return null;
  const org = await findOrganizationByKey(getPool, keyNorm.key);
  if (!org) return null;
  const catalogue = await getBlessBoardCatalogueContext(getPool, org.id);
  if (!catalogue.ok || !catalogue.context) return null;
  const tenant = buildBlessBoardTenantContext({
    organization: {
      id: catalogue.context.organization.id,
      key: catalogue.context.organization.key,
    },
    church: catalogue.context.church
      ? {
          id: catalogue.context.church.id,
          churchKey: catalogue.context.church.key,
          displayName: catalogue.context.church.displayName,
          dataEnvironment: catalogue.context.church.dataEnvironment,
        }
      : null,
    hqBranch: catalogue.context.hqBranch
      ? {
          id: catalogue.context.hqBranch.id,
          branchKey: catalogue.context.hqBranch.key,
          displayName: catalogue.context.hqBranch.displayName,
        }
      : null,
    primaryBranch: catalogue.context.primaryBranch
      ? {
          id: catalogue.context.primaryBranch.id,
          branchKey: catalogue.context.primaryBranch.key,
          displayName: catalogue.context.primaryBranch.displayName,
        }
      : null,
  });
  if (!tenant || !tenant.resolved) return null;
  return { tenant, organizationKey: keyNorm.key };
}

function createBlessBoardPathWebsiteEditorRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  attachBlessBoardWebsiteEditorRoutes(router, {
    getPool,
    getEnv: deps.getEnv,
    pathPrefix: "/c/:organizationKey",
    resolveTenant: async (req, res) => {
      try {
        const resolved = await resolvePathEditorTenant(getPool(), req, req.params.organizationKey);
        if (!resolved) {
          json(res, 404, { ok: false, code: "not_found" });
          return null;
        }
        return resolved;
      } catch {
        json(res, 503, { ok: false, code: "lookup_error" });
        return null;
      }
    },
  });
  return router;
}

function createBlessBoardTenantWebsiteEditorRouter(deps) {
  const router = express.Router();
  attachBlessBoardWebsiteEditorRoutes(router, {
    getPool: deps.getPool,
    getEnv: deps.getEnv,
    pathPrefix: "",
    resolveTenant: async (req, res) => {
      const tenant = req.blessBoardTenantContext;
      if (!tenant || !tenant.resolved) {
        json(res, 404, { ok: false, code: "not_found" });
        return null;
      }
      return {
        tenant,
        organizationKey:
          (tenant.organization && (tenant.organization.organizationKey || tenant.organization.key)) ||
          "",
      };
    },
  });
  return router;
}

module.exports = {
  createBlessBoardPathWebsiteEditorRouter,
  createBlessBoardTenantWebsiteEditorRouter,
  attachBlessBoardWebsiteEditorRoutes,
};
