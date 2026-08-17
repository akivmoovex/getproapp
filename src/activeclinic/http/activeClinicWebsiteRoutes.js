"use strict";

const { validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const contentService = require("../../platform/website/contentService");
const submissionService = require("../../platform/website/submissionService");
const mediaService = require("../../platform/website/mediaService");
const {
  grantedPermissions,
  canEditClinicWebsite,
  attachActiveClinicWebsiteLocals,
} = require("./attachActiveClinicWebsiteChrome");
const {
  resolvePublishableClinicByKey,
} = require("../services/activeClinicPublicVisibilityService");
const {
  sendClinicResolveFailure,
} = require("./activeClinicPublicRespond");

function json(res, status, body) {
  return res.status(status).json(body);
}

function actorId(req) {
  return (
    (req.activeClinicAuth &&
      req.activeClinicAuth.platformIdentity &&
      req.activeClinicAuth.platformIdentity.id) ||
    null
  );
}

function registerActiveClinicWebsiteRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;

  async function loadClinic(req, res) {
    const result = await resolvePublishableClinicByKey(getPool(), {
      clinicKey: req.params.clinicKey,
      allowUnpublished: true,
    });
    if (!result.ok) {
      sendClinicResolveFailure(res, result, deps.respondDeps || deps);
      return null;
    }
    if (result.clinic.websitePublished !== true && !canEditClinicWebsite(req, result.clinic)) {
      sendClinicResolveFailure(res, { ok: false, code: "clinic_not_published" }, deps.respondDeps || deps);
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
      const saved = await contentService.saveWebsiteDraft(getPool(), {
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
      return json(res, 200, { ok: true, code: "saved_to_draft", content: saved.content });
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

  app.post("/clinics/:clinicKey/website/media", async (req, res, next) => {
    try {
      const clinic = await loadClinic(req, res);
      if (!clinic) return undefined;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
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
      const registered = await mediaService.registerWebsiteMedia(getPool(), {
        organizationId: clinic.organizationId,
        instanceId: attached.instance.id,
        actorIdentityId: actorId(req),
        mediaKind: req.body && req.body.mediaKind,
        externalUrl: req.body && req.body.externalUrl,
        originalFilename: req.body && req.body.originalFilename,
        mimeType: req.body && req.body.mimeType,
        sizeBytes: req.body && req.body.sizeBytes,
        altText: req.body && req.body.altText,
        storageKey: req.body && req.body.storageKey,
      });
      return json(res, registered.ok ? 200 : 400, registered);
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicWebsiteRoutes,
};
