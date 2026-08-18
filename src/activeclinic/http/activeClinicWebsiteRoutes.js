"use strict";

const multer = require("multer");
const { validateCsrf, CSRF_FIELD, issueCsrfToken, setCsrfCookie } = require("../../platform/http/v5Csrf");
const { renderPublicPage } = require("./renderActiveClinicPublic");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const contentService = require("../../platform/website/contentService");
const publicationService = require("../../platform/website/publicationService");
const submissionService = require("../../platform/website/submissionService");
const mediaService = require("../../platform/website/mediaService");
const editSessionService = require("../../platform/website/editSessionService");
const {
  grantedPermissions,
  canEditClinicWebsite,
  attachActiveClinicWebsiteLocals,
} = require("./attachActiveClinicWebsiteChrome");
const versionService = require("../../platform/website/versionService");
const {
  setClinicWebsiteAvailability,
} = require("../services/clinicWebsiteAvailabilityService");
const {
  resolvePublishableClinicByKey,
} = require("../services/activeClinicPublicVisibilityService");
const {
  sendClinicResolveFailure,
  sendClinicResolveFailureJson,
  isWebsiteApiRequest,
} = require("./activeClinicPublicRespond");

function json(res, status, body) {
  return res.status(status).json(body);
}

function wantsHtml(req) {
  return Boolean(
    req.accepts("html") && !req.xhr && !(String(req.headers.accept || "").includes("application/json"))
  );
}

function canPublishClinicWebsite(req, clinic) {
  const auth = req.activeClinicAuth;
  if (!auth || !auth.authenticated || !clinic) return false;
  if (!auth.organization || auth.organization.id !== clinic.organizationId) return false;
  return hasWebsitePermission(grantedPermissions(req), PERMISSIONS.PUBLISH);
}

function canRestoreClinicWebsite(req, clinic) {
  const auth = req.activeClinicAuth;
  if (!auth || !auth.authenticated || !clinic) return false;
  if (!auth.organization || auth.organization.id !== clinic.organizationId) return false;
  return (
    hasWebsitePermission(grantedPermissions(req), PERMISSIONS.ROLLBACK) ||
    hasWebsitePermission(grantedPermissions(req), PERMISSIONS.RESTORE)
  );
}
function actorId(req) {
  return (
    (req.activeClinicAuth &&
      req.activeClinicAuth.platformIdentity &&
      req.activeClinicAuth.platformIdentity.id) ||
    null
  );
}

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: mediaService.MAX_BYTES, files: 1 },
});

function registerActiveClinicWebsiteRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;

  function sendResolveFailure(req, res, result) {
    if (isWebsiteApiRequest(req)) {
      return sendClinicResolveFailureJson(res, result);
    }
    return sendClinicResolveFailure(res, result, deps.respondDeps || deps);
  }

  async function loadClinic(req, res) {
    const result = await resolvePublishableClinicByKey(getPool(), {
      clinicKey: req.params.clinicKey,
      allowUnpublished: true,
    });
    if (!result.ok) {
      sendResolveFailure(req, res, result);
      return null;
    }
    if (result.clinic.websitePublished !== true && !canEditClinicWebsite(req, result.clinic)) {
      sendResolveFailure(req, res, { ok: false, code: "clinic_not_published" });
      return null;
    }
    return result.clinic;
  }

  app.get("/clinics/:clinicKey/website/preview", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!canEditClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      return res.redirect(303, `/clinics/${encodeURIComponent(clinic.clinicKey)}?website_edit=1&website_mode=draft`);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/drafts", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!canEditClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const saved = await publicationService.saveDraftAndMaybePublish(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        contentKey: req.body && req.body.contentKey,
        value: req.body && req.body.value,
        visibility: req.body && req.body.visibility,
        actorIdentityId: actorId(req),
      });
      if (!saved.ok) {
        return json(res, 400, { ok: false, code: saved.code, reason: saved.reason || null });
      }
      return json(res, 200, {
        ok: true,
        code: saved.published ? "saved_and_published" : "saved_to_draft",
        content: saved.content,
        version: saved.version || null,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/drafts/discard", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!canEditClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const discarded = await contentService.discardWebsiteDraft(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        contentKey: req.body && req.body.contentKey,
        actorIdentityId: actorId(req),
      });
      return json(res, discarded.ok ? 200 : 400, discarded);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/edit-session/finish", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!canEditClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const closed = await editSessionService.closeOpenSessionsForInstance(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        editorIdentityId: actorId(req),
        reason: editSessionService.CLOSE_REASON.FINISH,
      });
      if (req.accepts("html") && !req.xhr && !(req.headers.accept || "").includes("application/json")) {
        return res.redirect(303, `/clinics/${encodeURIComponent(clinic.clinicKey)}?website_mode=live`);
      }
      return json(res, 200, { ok: true, sessions: closed.sessions || [] });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/submit", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!hasWebsitePermission(grantedPermissions(req), PERMISSIONS.SUBMIT)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      if (!req.activeClinicAuth || req.activeClinicAuth.organization.id !== clinic.organizationId) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const submitted = await submissionService.submitWebsiteChanges(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        actorIdentityId: actorId(req),
      });
      return json(res, submitted.ok ? 200 : 400, submitted);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/publish", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!canPublishClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      if (attached.instance.publishLocked) {
        return json(res, 403, { ok: false, code: "website_publish_locked" });
      }
      const published = await publicationService.publishWebsiteDraft(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        actorIdentityId: actorId(req),
        allowEmpty: true,
      });
      if (!published.ok) {
        return json(res, 400, { ok: false, code: published.code });
      }
      let availability = null;
      if (req.body && (req.body.makePublic === "1" || req.body.makePublic === true || req.body.make_public === "1")) {
        availability = await setClinicWebsiteAvailability(getPool(), {
          organizationKey: clinic.clinicKey,
          public: true,
          actorIdentityId: actorId(req),
          overrideReadiness: true,
          reason: "organisation_admin_publish",
          env,
        });
      }
      if (wantsHtml(req)) {
        return res.redirect(
          303,
          `/clinics/${encodeURIComponent(clinic.clinicKey)}/website/history?notice=published`
        );
      }
      return json(res, 200, {
        ok: true,
        code: "published",
        version: published.version || null,
        changedKeys: published.changedKeys || [],
        availability,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/website/versions", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!canEditClinicWebsite(req, clinic) && !canPublishClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const listed = await versionService.listWebsiteVersions(getPool(), {
        instanceId: attached.instance.id,
        organizationId: clinic.organizationId,
      });
      const changes = await contentService.listUnpublishedChanges(
        getPool(),
        attached.instance,
        clinic.organizationId
      );
      return json(res, 200, {
        ok: true,
        versions: listed.versions || [],
        unpublishedCount: changes.length,
        canPublish: canPublishClinicWebsite(req, clinic),
        canRestore: canRestoreClinicWebsite(req, clinic),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/website/history", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!canEditClinicWebsite(req, clinic) && !canPublishClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const listed = await versionService.listWebsiteVersions(getPool(), {
        instanceId: attached.instance.id,
        organizationId: clinic.organizationId,
      });
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, {
        secure: String(env.NODE_ENV || "") === "production",
        env,
        req,
      });
      return res.status(200).type("html").send(
        renderPublicPage({
          pageId: "tenant-website-history",
          pageTitle: "Website version history",
          contentTemplate: "tenant/website-history",
          shellVariant: "tenant",
          robots: "noindex, nofollow",
          locals: {
            ...attached,
            csrfToken,
            versions: listed.versions || [],
            notice: String(req.query.notice || ""),
            error: String(req.query.error || ""),
          },
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/website/versions/:versionId", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!canEditClinicWebsite(req, clinic) && !canPublishClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const loaded = await versionService.getWebsiteVersion(getPool(), {
        versionId: req.params.versionId,
        organizationId: clinic.organizationId,
      });
      if (!loaded.ok) {
        return json(res, 404, { ok: false, code: loaded.code });
      }
      return json(res, 200, { ok: true, version: loaded.version, preview: loaded.version.snapshot || {} });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/website/versions/:versionId/restore", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!canRestoreClinicWebsite(req, clinic)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      const restored = await publicationService.restoreWebsiteVersionLive(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        versionId: req.params.versionId,
        actorIdentityId: actorId(req),
      });
      if (!restored.ok) {
        if (wantsHtml(req)) {
          return res.redirect(
            303,
            `/clinics/${encodeURIComponent(clinic.clinicKey)}/website/history?error=${encodeURIComponent(restored.code || "restore_failed")}`
          );
        }
        return json(res, 400, { ok: false, code: restored.code });
      }
      if (wantsHtml(req)) {
        return res.redirect(
          303,
          `/clinics/${encodeURIComponent(clinic.clinicKey)}/website/history?notice=restored`
        );
      }
      return json(res, 200, {
        ok: true,
        code: "restored",
        version: restored.version || null,
        restoredFrom: restored.restoredFrom || null,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/website/media/:mediaId", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      const mediaId = String(req.params.mediaId || "");
      const loaded = await mediaService.getWebsiteMedia(getPool(), {
        mediaId,
        organizationId: clinic.organizationId,
      });
      if (!loaded.ok || loaded.media.status !== "active") {
        return res.status(404).type("text").send("Not found");
      }
      const published = await mediaService.isPublishedInUse(getPool(), mediaId, clinic.organizationId);
      if (!published && !canEditClinicWebsite(req, clinic)) {
        return res.status(404).type("text").send("Not found");
      }
      const payload = await mediaService.getWebsiteMediaPayload(getPool(), {
        mediaId,
        organizationId: clinic.organizationId,
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

  app.post("/clinics/:clinicKey/website/media", (req, res, next) => {
    mediaUpload.single("file")(req, res, (err) => {
      if (err) {
        const code =
          err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
            ? mediaService.RESULT.TOO_LARGE
            : "invalid_upload";
        return json(res, 400, { ok: false, code });
      }
      return registerMedia(req, res, next);
    });
  });

  async function registerMedia(req, res, next) {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      const csrfValue = (req.body && req.body[CSRF_FIELD]) || req.query[CSRF_FIELD];
      if (!validateCsrf(req, csrfValue, env)) {
        return json(res, 403, { ok: false, code: "csrf" });
      }
      if (!hasWebsitePermission(grantedPermissions(req), PERMISSIONS.MEDIA_UPLOAD)) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      if (!req.activeClinicAuth || req.activeClinicAuth.organization.id !== clinic.organizationId) {
        return json(res, 403, { ok: false, code: "forbidden" });
      }
      const attached = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      if (!attached.instance) {
        return json(res, 404, { ok: false, code: "website_instance_not_found" });
      }
      if (req.body && req.body.reuseMediaId) {
        const existing = await mediaService.getWebsiteMedia(getPool(), {
          mediaId: req.body.reuseMediaId,
          organizationId: clinic.organizationId,
        });
        if (!existing.ok || existing.media.instanceId !== attached.instance.id) {
          return json(res, 404, { ok: false, code: "media_not_found" });
        }
        return json(res, 200, { ok: true, media: existing.media, reused: true });
      }
      const file = req.file || null;
      const registered = await mediaService.registerWebsiteMedia(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        actorIdentityId: actorId(req),
        mediaKind: (req.body && req.body.mediaKind) || (file ? "image" : undefined),
        externalUrl: req.body && req.body.externalUrl,
        originalFilename: (file && file.originalname) || (req.body && req.body.originalFilename),
        mimeType: (file && file.mimetype) || (req.body && req.body.mimeType),
        sizeBytes: file ? file.size : req.body && req.body.sizeBytes,
        altText: req.body && req.body.altText,
        storageKey: req.body && req.body.storageKey,
        buffer: file ? file.buffer : null,
      });
      return json(res, registered.ok ? 200 : 400, registered);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = {
  registerActiveClinicWebsiteRoutes,
};
