"use strict";

const submissionService = require("../website/submissionService");
const instanceRepo = require("../website/instanceRepository");
const resolver = require("../website/resolver");
const versionService = require("../website/versionService");
const mediaService = require("../website/mediaService");
const checklistService = require("../website/checklistService");
const auditService = require("../website/auditService");
const { buildWebsiteReviewDiff } = require("../website/reviewDiff");
const { PERMISSIONS, hasWebsitePermission, PLATFORM_ADMIN_PERMISSIONS } = require("../website/permissions");
const { ALLOWED_IMAGE_MIME } = require("../website/mediaService");
const { CSRF_FIELD, validateCsrf } = require("./v5Csrf");
const { listRecentWebsiteChanges } = require("../website/recentChangesService");
const { listModerationEvents } = require("../website/moderationEventService");
const {
  listRecentWebsitePublications,
  resolveApprovedVersions,
  approveWebsiteVersion,
  hideWebsite,
  unhideWebsite,
  blockWebsite,
  unblockWebsite,
  revertToApprovedVersion,
  buildGovernanceReview,
  REVIEW_STATUS,
  WEBSITE_STATUS,
} = require("../website/websiteGovernanceService");
const {
  takeWebsiteOffline,
  suspendWebsite,
  restoreWebsiteAvailability,
  setWebsitePublishPolicy,
  requestLiveWebsiteChanges,
} = require("../website/lifecycleService");
const { LIFECYCLE_STATUS } = require("../website/lifecycleStatus");
const {
  loadClinicWebsiteOperational,
} = require("../../activeclinic/services/clinicWebsiteAvailabilityService");
const {
  listPlatformAdminWebsites,
  loadPlatformAdminWebsiteDetail,
  applyPlatformAdminWebsiteAction,
  loadActorLabels,
} = require("../website/platformAdminWebsitesService");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatTs(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return String(value).slice(0, 19);
  }
}

function decorateVersion(version) {
  const keys = Array.isArray(version.changedKeys) ? version.changedKeys : [];
  const pages = [...new Set(keys.map((k) => String(k).split(".")[0]).filter(Boolean))];
  const sections = [
    ...new Set(keys.map((k) => String(k).split(".").slice(0, 2).join(".")).filter(Boolean)),
  ];
  return {
    ...version,
    fieldCount: keys.length,
    pagesAffected: pages,
    sectionsAffected: sections,
    publishedLabel: formatTs(version.publishedAt),
    sessionStartLabel: formatTs(version.sessionStartedAt),
    sessionEndLabel: formatTs(version.sessionClosedAt),
    sessionOpen: version.sessionStatus === "open",
  };
}

async function loadEditorLabel(db, identityId) {
  const map = await loadActorLabels(db, [identityId]);
  return map.get(String(identityId || "")) || "Editor";
}

async function loadEditorLabels(db, identityIds) {
  return loadActorLabels(db, identityIds);
}

function actorId(req) {
  const ctx = req.platformAdminContext || {};
  return ctx.platformIdentityId || ctx.userId || null;
}

function granted(req) {
  const ctx = req.platformAdminContext || {};
  if (Array.isArray(ctx.permissions) && ctx.permissions.length) {
    return ctx.permissions;
  }
  // Apex platform_admin is already required on these routes. Empty context
  // must not silently allow-all; use the explicit Platform Admin website set.
  return PLATFORM_ADMIN_PERMISSIONS;
}

function registerPlatformWebsiteAdminRoutes(router, deps) {
  const {
    getPool,
    env,
    requireApex,
    requirePlatformAdmin,
    requireWebsiteGovernance,
    renderPlatformAdminView,
    buildPlatformAdminShellLocals,
    setAdminNoStore,
  } = deps;

  require("../../activeclinic/website/activeClinicWebsiteTemplate").registerActiveClinicWebsiteTemplate();
  require("../../blessboard/website/blessboardChurchTemplate").registerBlessBoardWebsiteTemplate();
  const requireGovernance = requireWebsiteGovernance || requirePlatformAdmin;

  function actorRole(req) {
    const ctx = req.platformAdminContext || {};
    return ctx.actorRole || (ctx.websiteGovernanceOnly ? "csr" : "platform_admin");
  }

  function actorDisplayName(req) {
    const ctx = req.platformAdminContext || {};
    return ctx.displayName || "";
  }

  function canApprove(req) {
    return hasWebsitePermission(granted(req), PERMISSIONS.APPROVE);
  }

  function canReview(req) {
    return (
      hasWebsitePermission(granted(req), PERMISSIONS.REVIEW) ||
      hasWebsitePermission(granted(req), PERMISSIONS.PUBLISH)
    );
  }

  function canToggleAvailability(req) {
    return hasWebsitePermission(granted(req), PERMISSIONS.PUBLISH);
  }

  function canModerate(req) {
    return (
      hasWebsitePermission(granted(req), PERMISSIONS.MODERATE) ||
      hasWebsitePermission(granted(req), PERMISSIONS.REVIEW)
    );
  }

  function canTakeOffline(req) {
    return hasWebsitePermission(granted(req), PERMISSIONS.TAKE_OFFLINE);
  }

  function canSuspend(req) {
    return hasWebsitePermission(granted(req), PERMISSIONS.SUSPEND);
  }

  function canRestore(req) {
    return (
      hasWebsitePermission(granted(req), PERMISSIONS.RESTORE) ||
      hasWebsitePermission(granted(req), PERMISSIONS.ROLLBACK)
    );
  }

  function canManagePolicy(req) {
    return hasWebsitePermission(granted(req), PERMISSIONS.MANAGE_POLICY);
  }

  router.get("/admin/websites", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const tab = String(req.query.tab || "overview").trim();
      const listed = await listPlatformAdminWebsites(getPool(), {
        tab,
        q: req.query.q,
      });
      const html = renderPlatformAdminView("platform-admin/websites.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "websites",
          pageTitle: "Websites",
        }),
        websites: listed.websites || [],
        tab: listed.tab,
        q: listed.q,
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/website-changes", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const status = String(req.query.status || "submitted").trim();
      const clinic = String(req.query.clinic || "").trim();
      const listed = await submissionService.listWebsiteSubmissions(getPool(), {
        status: status === "all" ? null : status,
        limit: 100,
      });
      let rows = listed.submissions || [];
      if (clinic) {
        rows = rows.filter(
          (r) =>
            String(r.organizationKey || "").includes(clinic) ||
            String(r.organizationName || "").toLowerCase().includes(clinic.toLowerCase())
        );
      }
      const html = renderPlatformAdminView("platform-admin/website-changes.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "website-changes",
          pageTitle: "Website Changes",
        }),
        submissions: rows,
        filters: { status, clinic },
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/website-changes/:submissionId", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const row = await getPool().query(
        `SELECT s.*, i.slug, o.organization_key, o.display_name, o.id AS org_id
           FROM platform.website_submissions s
           JOIN platform.website_instances i ON i.id = s.instance_id
           JOIN platform.organizations o ON o.id = s.organization_id
          WHERE s.id = $1
          LIMIT 1`,
        [req.params.submissionId]
      );
      if (!row.rows[0]) return res.status(404).type("html").send("Submission not found.");
      const sub = submissionService.mapSubmission(row.rows[0]);
      const instance = await instanceRepo.findWebsiteInstanceById(
        getPool(),
        sub.instanceId,
        sub.organizationId
      );
      const template = instance
        ? require("../website/templateRegistry").getWebsiteTemplate(
            instance.templateId,
            instance.templateVersion
          )
        : null;
      const readiness = checklistService.evaluatePublicationReadiness({
        template,
        resolved: { values: (sub.snapshot && sub.snapshot.values) || {} },
        hasPublishedVersion: Boolean(instance && (instance.publishedAt || instance.lastPublishedAt)),
        firstPublication: !(instance && (instance.publishedAt || instance.lastPublishedAt)),
      });
      const reviewDiff = buildWebsiteReviewDiff({
        snapshot: sub.snapshot || {},
        template,
        changedKeys: sub.changedKeys,
      });
      const html = renderPlatformAdminView("platform-admin/website-change-review.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "website-changes",
          pageTitle: "Review website changes",
        }),
        sub: {
          ...sub,
          organizationKey: row.rows[0].organization_key,
          organizationName: row.rows[0].display_name,
          slug: row.rows[0].slug,
        },
        reviewDiff,
        readiness,
        canReview: canReview(req),
        requestChangesNoteRequired: false,
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/website-media/:mediaId", requireApex, requireGovernance, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const loaded = await mediaService.getWebsiteMediaById(getPool(), req.params.mediaId);
      if (!loaded.ok) return res.status(404).type("text").send("Not found");
      const payload = await mediaService.getWebsiteMediaPayload(getPool(), {
        mediaId: loaded.media.id,
        organizationId: loaded.media.organizationId,
      });
      if (!payload.ok) return res.status(404).type("text").send("Not found");
      const mime = String(payload.mimeType || "").toLowerCase();
      if (!ALLOWED_IMAGE_MIME.has(mime)) return res.status(404).type("text").send("Not found");
      res.setHeader("Content-Type", mime);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, max-age=120");
      return res.status(200).send(payload.buffer);
    } catch (err) {
      return next(err);
    }
  });

  router.post("/admin/website-changes/:submissionId/:decision", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, `/admin/website-changes/${req.params.submissionId}?error=csrf`);
      }
      if (!canReview(req)) {
        return res.redirect(303, `/admin/website-changes/${req.params.submissionId}?error=forbidden`);
      }
      const row = await getPool().query(
        `SELECT organization_id, row_version FROM platform.website_submissions WHERE id = $1 LIMIT 1`,
        [req.params.submissionId]
      );
      if (!row.rows[0]) return res.redirect(303, "/admin/website-changes?error=not_found");
      const decided = await submissionService.decideWebsiteSubmission(getPool(), {
        organizationId: row.rows[0].organization_id,
        submissionId: req.params.submissionId,
        decision: req.params.decision,
        rowVersion: Number(req.body.rowVersion || row.rows[0].row_version),
        reviewNote: req.body.review_note || null,
        overrideReadiness: req.body.override_readiness === "1",
        actorIdentityId: actorId(req),
      });
      if (!decided.ok) {
        return res.redirect(
          303,
          `/admin/website-changes/${req.params.submissionId}?error=${encodeURIComponent(decided.code)}`
        );
      }
      return res.redirect(303, `/admin/website-changes?status=${encodeURIComponent(decided.submission.status)}`);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/organizations/:organizationKey/website", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      const detail = await loadPlatformAdminWebsiteDetail(getPool(), organizationKey, { env });
      if (!detail.ok) return res.status(404).type("html").send("Organization not found.");
      const availability = detail.clinicAvailability;
      const instance = detail.instance;
      let unpublishedCount = detail.unpublishedCount || 0;
      let versions = detail.versions || [];
      let media = [];
      let audit = { events: [] };
      let checklist = null;
      let pending = [];
      let changeSummary = detail.changeSummary || [];
      const productCode = detail.productCode;
      if (instance && productCode === "activeclinic") {
        media = (await mediaService.listWebsiteMedia(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
        })).media;
        audit = await auditService.listWebsiteAudit(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
          limit: 50,
        });
        const cl = await checklistService.getWebsiteChecklist(getPool(), {
          organizationId: instance.organizationId,
          instance,
          operational: availability
            ? await loadClinicWebsiteOperational(getPool(), detail.organization.id)
            : {},
        });
        checklist = cl.ok ? cl.checklist : null;
        pending = (await submissionService.listWebsiteSubmissions(getPool(), {
          organizationId: instance.organizationId,
          instanceId: instance.id,
          status: "submitted",
        })).submissions;
        if (!versions.length) {
          const listedVersions = (
            await versionService.listWebsiteVersions(getPool(), {
              instanceId: instance.id,
              organizationId: instance.organizationId,
            })
          ).versions;
          const editorLabels = await loadEditorLabels(
            getPool(),
            listedVersions.map((v) => v.editorIdentityId)
          );
          versions = listedVersions.map((v) => ({
            ...decorateVersion(v),
            editorLabel: editorLabels.get(String(v.editorIdentityId || "")) || "Editor",
          }));
        } else {
          versions = versions.map((v) => ({
            ...decorateVersion(v),
            editorLabel: v.editorLabel || "Editor",
          }));
        }
      }
      const html = renderPlatformAdminView("platform-admin/organization-website.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "organizations",
          pageTitle: productCode === "blessboard" ? "Church website" : "Clinic website",
        }),
        organization: detail.organization,
        instance,
        unpublishedCount,
        versions,
        media,
        auditEvents: audit.events || [],
        checklist,
        pendingSubmissions: pending,
        changeSummary,
        productCode,
        productLabel: detail.productLabel,
        websiteStatus: detail.websiteStatus,
        currentDraft: detail.currentDraft,
        lastEditor: detail.lastEditor,
        lastPublisher: detail.lastPublisher,
        publicPath: detail.publicPath,
        publicUrl: detail.publicUrl,
        websitePublished: detail.websitePublished,
        liveVersion: detail.liveVersion,
        actions: detail.actions,
        canResume: detail.canResume === true,
        availability: availability || {
          ok: true,
          publicPath: detail.publicPath,
          publicUrl: detail.publicUrl,
          healthcareOrganization: productCode === "activeclinic"
            ? { websitePublished: detail.websitePublished }
            : { websitePublished: detail.websitePublished },
          latestApprovedVersion: detail.liveVersion,
          readiness: null,
          lastToggle: null,
        },
        canToggleAvailability: canToggleAvailability(req),
        canModerate: canModerate(req),
        canTakeOffline: canTakeOffline(req),
        canSuspend: canSuspend(req),
        canRestore: canRestore(req),
        canManagePolicy: canManagePolicy(req),
        canApprove: canApprove(req),
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  function websiteManagePath(organizationKey, query) {
    const base = `/admin/organizations/${encodeURIComponent(organizationKey)}/website`;
    if (!query) return base;
    return `${base}?${query}`;
  }

  async function handleAvailabilityToggle(req, res, next, wantPublic) {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=csrf"));
      }
      if (!canToggleAvailability(req)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
      }
      const result = await applyPlatformAdminWebsiteAction(getPool(), {
        organizationKey,
        action: wantPublic ? "publish" : "unpublish",
        actorIdentityId: actorId(req),
        overrideReadiness: req.body && req.body.override_readiness === "1",
        reason: req.body && req.body.reason,
        env,
      });
      if (!result.ok) {
        return res.redirect(
          303,
          websiteManagePath(organizationKey, `error=${encodeURIComponent(result.code || result.reason || "failed")}`)
        );
      }
      return res.redirect(
        303,
        websiteManagePath(organizationKey, wantPublic ? "notice=published" : "notice=unpublished")
      );
    } catch (err) {
      return next(err);
    }
  }

  router.post(
    "/admin/organizations/:organizationKey/website/publish",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleAvailabilityToggle(req, res, next, true)
  );

  router.post(
    "/admin/organizations/:organizationKey/website/unpublish",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleAvailabilityToggle(req, res, next, false)
  );

  router.post("/admin/organizations/:organizationKey/website/versions/:versionId/restore", requireApex, requirePlatformAdmin, async (req, res, next) => {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=csrf"));
      }
      if (!canRestore(req)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
      }
      const restored = await applyPlatformAdminWebsiteAction(getPool(), {
        organizationKey,
        action: "restore-version",
        versionId: req.params.versionId,
        actorIdentityId: actorId(req),
        env,
      });
      if (!restored.ok) {
        return res.redirect(
          303,
          websiteManagePath(
            organizationKey,
            `error=${encodeURIComponent(restored.code || restored.reason || restored.status || "restore_failed")}`
          )
        );
      }
      return res.redirect(303, websiteManagePath(organizationKey, "notice=restored"));
    } catch (err) {
      return next(err);
    }
  });

  function safeReturnTo(raw, fallback) {
    const value = String(raw || "").trim();
    if (!value.startsWith("/admin/")) return fallback;
    if (value.includes("://") || value.includes("//")) return fallback;
    if (value.startsWith("/admin/recent-website-changes") || value.startsWith("/admin/organizations/")) {
      return value.slice(0, 240);
    }
    return fallback;
  }

  function governanceRedirect(req, organizationKey, query) {
    const fallback = websiteManagePath(organizationKey, query);
    const requested = String((req.body && req.body.return_to) || "").trim();
    const base = safeReturnTo(requested, "");
    if (!base) return fallback;
    if (!query) return base;
    return base.includes("?") ? `${base}&${query}` : `${base}?${query}`;
  }

  router.get("/admin/recent-website-changes", requireApex, requireGovernance, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const view = String(req.query.view || "publications").trim();
      const filter = String(req.query.filter || "").trim();
      let rows = [];
      if (view === "activity") {
        const listed = await listRecentWebsiteChanges(getPool(), {
          productCode: String(req.query.product || "").trim() || null,
          lifecycleStatus: String(req.query.lifecycle || "").trim() || null,
          tenant: String(req.query.tenant || "").trim() || null,
          flagged: String(req.query.flagged || "") === "1",
          limit: 80,
        });
        rows = listed.changes || [];
        if (filter === "provisional") rows = rows.filter((r) => r.lifecycleStatus === "provisional");
        if (filter === "public") rows = rows.filter((r) => r.lifecycleStatus === "public");
        if (filter === "suspended") rows = rows.filter((r) => r.lifecycleStatus === "suspended");
        if (filter === "under_review") {
          rows = rows.filter(
            (r) => r.lifecycleStatus === "under_review" || r.moderationState === "submitted"
          );
        }
      } else {
        const listed = await listRecentWebsitePublications(getPool(), {
          productCode: String(req.query.product || "").trim() || null,
          tenant: String(req.query.tenant || "").trim() || null,
          reviewStatus: filter === "unreviewed" || filter === "approved" ? filter : null,
          websiteStatus:
            filter === "hidden" || filter === "blocked" || filter === "live" ? filter : null,
          limit: 80,
        });
        rows = listed.publications || [];
        const labels = await loadEditorLabels(
          getPool(),
          rows.map((row) => row.publishedByIdentityId)
        );
        rows = rows.map((row) => ({
          ...row,
          publishedByLabel: labels.get(String(row.publishedByIdentityId || "")) || row.publishedByIdentityId || "—",
        }));
      }
      const html = renderPlatformAdminView("platform-admin/recent-website-changes.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "recent-website-changes",
          pageTitle: "Recent Website Changes",
        }),
        changes: rows,
        view,
        filters: {
          product: String(req.query.product || ""),
          tenant: String(req.query.tenant || ""),
          lifecycle: String(req.query.lifecycle || ""),
          filter,
          flagged: String(req.query.flagged || "") === "1",
        },
        canModerate: canModerate(req),
        canTakeOffline: canTakeOffline(req),
        canSuspend: canSuspend(req),
        canRestore: canRestore(req),
        canApprove: canApprove(req),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/admin/recent-website-changes/:kind/:changeId", requireApex, requireGovernance, async (req, res, next) => {
    try {
      setAdminNoStore(res);
      const kind = String(req.params.kind || "").trim();
      const changeId = String(req.params.changeId || "").trim();
      if (!UUID_RE.test(changeId) || !["version", "submission", "event", "audit"].includes(kind)) {
        return res.status(404).type("html").send("Change not found.");
      }
      const pool = getPool();
      let organizationKey = "";
      let organizationName = "";
      let instance = null;
      let version = null;
      let previous = null;
      let reviewDiff = { items: [], count: 0, source: "version_snapshot" };
      let events = [];
      let productCode = "";
      let slug = "";
      let editorLabel = "Editor";
      let timestamp = "";
      let actionKey = "";
      let approved = { currentPublished: null, lastApproved: null, previousApproved: null };
      let publicPath = "";

      if (kind === "version") {
        const row = await pool.query(
          `SELECT v.organization_id
             FROM platform.website_versions v WHERE v.id = $1 LIMIT 1`,
          [changeId]
        );
        if (!row.rows[0]) return res.status(404).type("html").send("Change not found.");
        const loaded = await versionService.getWebsiteVersion(pool, {
          versionId: changeId,
          organizationId: row.rows[0].organization_id,
        });
        if (!loaded.ok) return res.status(404).type("html").send("Change not found.");
        version = decorateVersion(loaded.version);
        instance = await instanceRepo.findWebsiteInstanceById(
          pool,
          version.instanceId,
          version.organizationId
        );
        if (version.previousVersionId) {
          const prev = await versionService.getWebsiteVersion(pool, {
            versionId: version.previousVersionId,
            organizationId: version.organizationId,
          });
          previous = prev.ok ? prev.version : null;
        }
        timestamp = version.publishedLabel;
        editorLabel = await loadEditorLabel(pool, version.editorIdentityId);
      } else if (kind === "submission") {
        const row = await pool.query(
          `SELECT s.*, i.slug, o.organization_key, o.display_name
             FROM platform.website_submissions s
             JOIN platform.website_instances i ON i.id = s.instance_id
             JOIN platform.organizations o ON o.id = s.organization_id
            WHERE s.id = $1 LIMIT 1`,
          [changeId]
        );
        if (!row.rows[0]) return res.status(404).type("html").send("Change not found.");
        const sub = submissionService.mapSubmission(row.rows[0]);
        instance = await instanceRepo.findWebsiteInstanceById(pool, sub.instanceId, sub.organizationId);
        const template = instance
          ? require("../website/templateRegistry").getWebsiteTemplate(
              instance.templateId,
              instance.templateVersion
            )
          : null;
        reviewDiff = buildWebsiteReviewDiff({
          snapshot: sub.snapshot || {},
          template,
          changedKeys: sub.changedKeys,
        });
        organizationKey = row.rows[0].organization_key;
        organizationName = row.rows[0].display_name;
        slug = row.rows[0].slug;
        timestamp = formatTs(sub.submittedAt);
        editorLabel = await loadEditorLabel(pool, sub.submitterIdentityId);
      } else if (kind === "audit") {
        const row = await pool.query(
          `SELECT a.*, i.slug, o.organization_key, o.display_name
             FROM platform.website_audit_events a
             JOIN platform.website_instances i ON i.id = a.instance_id
             JOIN platform.organizations o ON o.id = a.organization_id
            WHERE a.id = $1 LIMIT 1`,
          [changeId]
        );
        if (!row.rows[0]) return res.status(404).type("html").send("Change not found.");
        instance = await instanceRepo.findWebsiteInstanceById(
          pool,
          row.rows[0].instance_id,
          row.rows[0].organization_id
        );
        actionKey = row.rows[0].action_key;
        timestamp = formatTs(row.rows[0].created_at);
        editorLabel = await loadEditorLabel(pool, row.rows[0].actor_identity_id);
        organizationKey = row.rows[0].organization_key;
        organizationName = row.rows[0].display_name;
        slug = row.rows[0].slug;
      } else {
        const row = await pool.query(
          `SELECT * FROM platform.website_moderation_events WHERE id = $1 LIMIT 1`,
          [changeId]
        );
        if (!row.rows[0]) return res.status(404).type("html").send("Change not found.");
        instance = row.rows[0].instance_id
          ? await instanceRepo.findWebsiteInstanceById(
              pool,
              row.rows[0].instance_id,
              row.rows[0].organization_id
            )
          : null;
        actionKey = row.rows[0].action_key;
        timestamp = formatTs(row.rows[0].created_at);
        editorLabel = await loadEditorLabel(pool, row.rows[0].actor_identity_id);
      }

      if (instance) {
        const org = await pool.query(
          `SELECT organization_key, display_name FROM platform.organizations WHERE id = $1`,
          [instance.organizationId]
        );
        organizationKey = organizationKey || (org.rows[0] && org.rows[0].organization_key) || "";
        organizationName = organizationName || (org.rows[0] && org.rows[0].display_name) || "";
        productCode = instance.productCode;
        slug = slug || instance.slug;
        const listedEvents = await listModerationEvents(pool, {
          organizationId: instance.organizationId,
          instanceId: instance.id,
          limit: 40,
        });
        events = listedEvents.events || [];
        approved = await resolveApprovedVersions(pool, {
          organizationId: instance.organizationId,
          instanceId: instance.id,
        });
        publicPath = require("../website/publicWebsiteUrl").buildPublicOrganizationWebsitePath({
          product: productCode,
          organizationKey,
        });
        if (kind === "version") {
          reviewDiff = buildGovernanceReview({
            instance,
            organizationKey,
            currentPublished: approved.currentPublished || version,
            lastApproved: approved.lastApproved,
            previousSnapshot: previous && previous.snapshot ? previous.snapshot : {},
            changedKeys: version && version.changedKeys,
          });
        }
      }

      const html = renderPlatformAdminView("platform-admin/recent-website-change-detail.ejs", {
        ...buildPlatformAdminShellLocals(req, res, {
          env,
          isProduction: String(env.NODE_ENV || "") === "production",
          activeNav: "recent-website-changes",
          pageTitle: "Review website changes",
        }),
        kind,
        changeId,
        organizationKey,
        organizationName,
        productCode,
        slug,
        publicPath,
        instance,
        version,
        reviewDiff,
        events,
        editorLabel,
        timestamp,
        actionKey,
        currentPublished: approved.currentPublished,
        lastApproved: approved.lastApproved,
        previousApproved: approved.previousApproved,
        websiteStatus: instance
          ? require("../website/websiteGovernanceService").websiteStatusFromLifecycle(
              instance.lifecycleStatus
            )
          : null,
        canModerate: canModerate(req),
        canTakeOffline: canTakeOffline(req),
        canSuspend: canSuspend(req),
        canApprove: canApprove(req) && kind === "version" && version,
        canRestoreVersion: canRestore(req) && Boolean(approved.lastApproved),
        canRestoreSite:
          canRestore(req) &&
          instance &&
          (instance.lifecycleStatus === "offline" || instance.lifecycleStatus === "suspended"),
        canUnhide: canRestore(req) && instance && instance.lifecycleStatus === "offline",
        canUnblock: canRestore(req) && instance && instance.lifecycleStatus === "suspended",
        notice: String(req.query.notice || ""),
        error: String(req.query.error || ""),
      });
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  async function loadOrgInstance(organizationKey) {
    const org = await getPool().query(
      `SELECT id, organization_key, display_name FROM platform.organizations
        WHERE organization_key = $1 LIMIT 1`,
      [String(organizationKey || "").toLowerCase()]
    );
    if (!org.rows[0]) return { org: null, instance: null };
    const instances = await instanceRepo.listWebsiteInstancesForOrganization(
      getPool(),
      org.rows[0].id
    );
    return { org: org.rows[0], instance: instances[0] || null };
  }

  async function handleGovernanceAction(req, res, next, action) {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      const fallback = `/admin/recent-website-changes`;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, governanceRedirect(req, organizationKey, "error=csrf"));
      }
      const loaded = await loadOrgInstance(organizationKey);
      if (!loaded.org || !loaded.instance) {
        return res.redirect(303, fallback + "?error=not_found");
      }
      const actor = {
        organizationId: loaded.org.id,
        instanceId: loaded.instance.id,
        actorIdentityId: actorId(req),
        actorRole: actorRole(req),
        actorDisplayName: actorDisplayName(req),
        reason: req.body && req.body.reason,
        notes: req.body && (req.body.notes || req.body.note),
        note: req.body && (req.body.note || req.body.notes),
        versionId: (req.body && req.body.version_id) || req.params.versionId,
      };
      let result;
      if (action === "approve") {
        if (!canApprove(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await approveWebsiteVersion(getPool(), actor);
      } else if (action === "hide") {
        if (!canTakeOffline(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await hideWebsite(getPool(), actor);
      } else if (action === "unhide") {
        if (!canRestore(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await unhideWebsite(getPool(), actor);
      } else if (action === "block") {
        if (!canSuspend(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await blockWebsite(getPool(), actor);
      } else if (action === "unblock") {
        if (!canRestore(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await unblockWebsite(getPool(), actor);
      } else if (action === "revert") {
        if (!canRestore(req)) {
          return res.redirect(303, governanceRedirect(req, organizationKey, "error=forbidden"));
        }
        result = await revertToApprovedVersion(getPool(), actor);
      } else {
        result = { ok: false, code: "invalid_input" };
      }
      const dest = governanceRedirect(req, organizationKey, result.ok ? `notice=${action}` : `error=${encodeURIComponent(result.code)}`);
      return res.redirect(303, dest);
    } catch (err) {
      return next(err);
    }
  }

  async function handleModerationAction(req, res, next, action) {
    try {
      const organizationKey = String(req.params.organizationKey || "").toLowerCase();
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=csrf"));
      }
      const loaded = await loadOrgInstance(organizationKey);
      if (!loaded.org || !loaded.instance) {
        return res.redirect(303, websiteManagePath(organizationKey, "error=not_found"));
      }
      const body = {
        organizationId: loaded.org.id,
        instanceId: loaded.instance.id,
        actorIdentityId: actorId(req),
        actorRole: actorRole(req),
        reason: req.body && req.body.reason,
        notes: req.body && req.body.notes,
        notePublic: req.body && req.body.note_public,
        notesTenantVisible: true,
      };
      let result;
      if (action === "offline") {
        if (!canTakeOffline(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await takeWebsiteOffline(getPool(), body);
      } else if (action === "suspend") {
        if (!canSuspend(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await suspendWebsite(getPool(), {
          ...body,
          editLocked: req.body && req.body.edit_lock !== "0",
          publishLocked: req.body && req.body.publish_lock !== "0",
        });
      } else if (action === "restore-site") {
        if (!canRestore(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await restoreWebsiteAvailability(getPool(), {
          ...body,
          lifecycleStatus: req.body && req.body.lifecycle_status,
        });
      } else if (action === "request-changes") {
        if (!canModerate(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await requestLiveWebsiteChanges(getPool(), {
          ...body,
          takeOffline: req.body && req.body.take_offline === "1",
          targetVersionId: req.body && req.body.version_id,
        });
      } else if (action === "policy") {
        if (!canManagePolicy(req)) return res.redirect(303, websiteManagePath(organizationKey, "error=forbidden"));
        result = await setWebsitePublishPolicy(getPool(), {
          ...body,
          publishPolicy: req.body && req.body.publish_policy,
        });
      } else {
        result = { ok: false, code: "invalid_input" };
      }
      if (!result.ok) {
        return res.redirect(303, websiteManagePath(organizationKey, `error=${encodeURIComponent(result.code)}`));
      }
      return res.redirect(303, websiteManagePath(organizationKey, `notice=${encodeURIComponent(action)}`));
    } catch (err) {
      return next(err);
    }
  }

  router.get(
    "/admin/organizations/:organizationKey/website/versions/:versionId/preview",
    requireApex,
    requireGovernance,
    async (req, res, next) => {
      try {
        setAdminNoStore(res);
        const organizationKey = String(req.params.organizationKey || "").toLowerCase();
        const loaded = await loadOrgInstance(organizationKey);
        if (!loaded.org || !loaded.instance) {
          return res.status(404).type("html").send("Website not found.");
        }
        const version = await versionService.getWebsiteVersion(getPool(), {
          versionId: req.params.versionId,
          organizationId: loaded.org.id,
          instanceId: loaded.instance.id,
        });
        if (!version.ok) return res.status(404).type("html").send("Version not found.");
        const html = renderPlatformAdminView("platform-admin/website-version-preview.ejs", {
          ...buildPlatformAdminShellLocals(req, res, {
            env,
            isProduction: String(env.NODE_ENV || "") === "production",
            activeNav: "recent-website-changes",
            pageTitle: `Website version v${version.version.versionNumber}`,
          }),
          organizationKey,
          organizationName: loaded.org.display_name,
          productCode: loaded.instance.productCode,
          version: decorateVersion(version.version),
          snapshot: version.version.snapshot || {},
        });
        res.setHeader("X-Robots-Tag", "noindex, nofollow");
        return res.status(200).type("html").send(html);
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/website/approve",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "approve")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/hide",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "hide")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/unhide",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "unhide")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/block",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "block")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/unblock",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "unblock")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/revert",
    requireApex,
    requireGovernance,
    (req, res, next) => handleGovernanceAction(req, res, next, "revert")
  );

  router.post(
    "/admin/organizations/:organizationKey/website/offline",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "offline")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/suspend",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "suspend")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/restore-site",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "restore-site")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/request-changes",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "request-changes")
  );
  router.post(
    "/admin/organizations/:organizationKey/website/policy",
    requireApex,
    requirePlatformAdmin,
    (req, res, next) => handleModerationAction(req, res, next, "policy")
  );

  void resolver;
  void LIFECYCLE_STATUS;
  void REVIEW_STATUS;
  void WEBSITE_STATUS;
}

module.exports = {
  registerPlatformWebsiteAdminRoutes,
};
