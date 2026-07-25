"use strict";

/**
 * Phase3 HQ Website Version History, Compare, Restore, and Publishing History routes.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");
const { CSRF_FIELD, validateCsrf } = require("../../platform/http/v5Csrf");
const versionSvc = require("../services/websitePublicationVersionService");
const versionRepo = require("../repositories/websitePublicationVersionRepository");
const {
  renderWebsiteFeatureLocked,
  checkWebsiteCapability,
  planEntitlementSvc,
} = require("./websitePlanEntitlementHttp");
const {
  buildVersionHistoryErrorState,
  buildVersionHistoryEmptyState,
  createNetworkGovernanceRoleGate,
  renderSystemStatePage,
  retryHrefFromRequest,
} = require("./websiteSystemStateHttp");

function renderHqView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Website versions · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=59" />
</head>
<body class="bb-hq-body">
  <main class="bb-hq-login-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/hq">HQ home</a></p>
  </main>
</body>
</html>`);
}

function actorUserId(req) {
  const session = req.v5Session && req.v5Session.session;
  if (session && session.userId) return String(session.userId);
  if (req.v5Session && req.v5Session.userId) return String(req.v5Session.userId);
  return (
    (req.blessBoardAuthorizationContext &&
      req.blessBoardAuthorizationContext.user &&
      req.blessBoardAuthorizationContext.user.id) ||
    null
  );
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsitePublicationVersionAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  async function shellLocals(req, res, extras) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: extras && extras.pageTitle ? extras.pageTitle : "Website Version History",
      getPool,
      extra: extras,
    });
  }

  const gateHq = createNetworkGovernanceRoleGate({
    getPool,
    shellLocalsFn: shellLocals,
    sendControlled,
    loginNext: "/hq/website/version-history",
    createRequireBlessBoardTenantRole,
  });

  function requireTenant(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    if (!tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    return tenant;
  }

  async function requireNetworkHistory(req, res) {
    const tenant = requireTenant(req, res);
    if (!tenant) return null;
    const entitled = await checkWebsiteCapability(
      getPool,
      tenant,
      "website.network_version_history",
      env
    );
    if (!entitled.ok && entitled.status === planEntitlementSvc.STATUS.NOT_ENTITLED) {
      await renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
        featureTitle: "Network Website Version History",
        returnHref: "/hq/website",
      });
      return null;
    }
    if (!entitled.ok) {
      sendControlled(req, res, 503, "Version history is temporarily unavailable.");
      return null;
    }
    return tenant;
  }

  router.get("/hq/website/version-history", rejectApex, gateHq, async (req, res) => {
    const tenant = await requireNetworkHistory(req, res);
    if (!tenant) return;

    const result = await versionSvc.loadVersionHistory(getPool(), {
      organizationId: tenant.organization.id,
      status: req.query && req.query.status,
      publishedBy: req.query && req.query.publisher,
      themeKey: req.query && req.query.theme,
      from: req.query && req.query.from,
      to: req.query && req.query.to,
    });

    if (!result.ok) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[website-version-history] load failed", {
          status: result.status || null,
        });
      }
      const listPath = "/hq/website/version-history";
      return renderSystemStatePage(
        req,
        res,
        shellLocals,
        buildVersionHistoryErrorState({
          retryHref: retryHrefFromRequest(req, listPath),
        }),
        { statusCode: 503, pageTitle: "Something went wrong" }
      );
    }

    const orgKey =
      (tenant.organization && (tenant.organization.key || tenant.organization.organizationKey)) ||
      null;
    const notice = String((req.query && req.query.notice) || "") || null;
    const html = await renderHqView(
      "hq/phase4-network-website-version-history.ejs",
      await shellLocals(req, res, {
        pageTitle: "Network Website Version History",
        items: result.items,
        total: result.total,
        current: result.current,
        publishers: result.publishers,
        themeKeys: result.themeKeys,
        filters: result.filters,
        statusLabels: result.statusLabels,
        sourceLabels: result.sourceLabels,
        livePreviewPath: publicChurchHomePath(orgKey),
        detailId: String((req.query && req.query.detail) || "") || null,
        historyListPath: "/hq/website/version-history",
        emptyState: buildVersionHistoryEmptyState(),
        notice,
      })
    );
    return res.type("html").send(html);
  });

  router.get("/hq/website/network-version-history", rejectApex, gateHq, async (req, res) => {
    const tenant = await requireNetworkHistory(req, res);
    if (!tenant) return;

    const result = await versionSvc.loadVersionHistory(getPool(), {
      organizationId: tenant.organization.id,
      status: req.query && req.query.status,
      publishedBy: req.query && req.query.publisher,
      themeKey: req.query && req.query.theme,
      from: req.query && req.query.from,
      to: req.query && req.query.to,
    });

    if (!result.ok) {
      if (typeof console !== "undefined" && console.error) {
        console.error("[website-network-version-history] load failed", {
          status: result.status || null,
        });
      }
      const listPath = "/hq/website/network-version-history";
      return renderSystemStatePage(
        req,
        res,
        shellLocals,
        buildVersionHistoryErrorState({
          retryHref: retryHrefFromRequest(req, listPath),
        }),
        { statusCode: 503, pageTitle: "Something went wrong" }
      );
    }

    const orgKey =
      (tenant.organization && (tenant.organization.key || tenant.organization.organizationKey)) ||
      null;
    const notice = String((req.query && req.query.notice) || "") || null;
    const html = await renderHqView(
      "hq/phase4-network-website-version-history.ejs",
      await shellLocals(req, res, {
        pageTitle: "Network Website Version History",
        items: result.items,
        total: result.total,
        current: result.current,
        publishers: result.publishers,
        themeKeys: result.themeKeys,
        filters: result.filters,
        statusLabels: result.statusLabels,
        sourceLabels: result.sourceLabels,
        livePreviewPath: publicChurchHomePath(orgKey),
        detailId: String((req.query && req.query.detail) || "") || null,
        historyListPath: "/hq/website/network-version-history",
        emptyState: buildVersionHistoryEmptyState(),
        notice,
      })
    );
    return res.type("html").send(html);
  });

  router.get("/hq/website/version-history/compare", rejectApex, gateHq, async (req, res) => {
    const tenant = await requireNetworkHistory(req, res);
    if (!tenant) return;

    const q = req.query || {};
    const result = await versionSvc.compareVersions(getPool(), {
      organizationId: tenant.organization.id,
      baseVersionId: q.baseVersionId || q.a || null,
      compareVersionId: q.compareVersionId || q.b || null,
      pageKey: q.page || null,
      changeType: q.changeType || "all",
    });

    if (!result.ok) {
      if (result.status === versionSvc.STATUS.NOT_FOUND) {
        return sendControlled(req, res, 404, "Version not found.");
      }
      const msg = result.message || "Select two valid versions to compare.";
      return res.redirect(
        303,
        `/hq/website/version-history?notice=${encodeURIComponent(msg)}`
      );
    }

    const versionsList = await versionRepo.listVersions(getPool(), {
      organizationId: tenant.organization.id,
      limit: 100,
    });

    const html = await renderHqView(
      "hq/phase3-compare-website-versions.ejs",
      await shellLocals(req, res, {
        pageTitle: "Compare Website Versions",
        versionA: result.versionA,
        versionB: result.versionB,
        current: result.current,
        diff: result.diff,
        filters: result.filters,
        statusLabels: result.statusLabels,
        sourceLabels: result.sourceLabels,
        pageTitles: result.pageTitles,
        allVersions: versionsList.items || [],
      })
    );
    return res.type("html").send(html);
  });

  router.get(
    "/hq/website/version-history/:versionId/preview",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;

      const result = await versionSvc.loadHistoricalVersionPreview(getPool(), {
        organizationId: tenant.organization.id,
        versionId: req.params.versionId,
      });
      if (!result.ok) {
        if (result.status === versionSvc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "Version not found.");
        }
        return sendControlled(req, res, 400, "Unable to preview this version.");
      }

      const html = await renderHqView(
        "hq/phase3-historical-version-preview.ejs",
        await shellLocals(req, res, {
          pageTitle: "Historical Version Preview",
          version: result.version,
          pages: result.pages,
          themeKey: result.themeKey,
          statusLabels: result.statusLabels,
          sourceLabels: result.sourceLabels,
          pageTitles: result.pageTitles,
          banner: result.banner,
          readOnly: true,
          robotsNoIndex: true,
        })
      );
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.type("html").send(html);
    }
  );

  router.get(
    "/hq/website/version-history/:versionId/restore",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;

      const result = await versionSvc.prepareVersionRestore(getPool(), {
        organizationId: tenant.organization.id,
        versionId: req.params.versionId,
      });
      if (!result.ok) {
        if (result.status === versionSvc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "Version not found.");
        }
        return sendControlled(req, res, 400, "This version cannot be restored.");
      }

      const formError = String((req.query && req.query.error) || "") || null;
      const html = await renderHqView(
        "hq/phase3-restore-website-version.ejs",
        await shellLocals(req, res, {
          pageTitle: "Restore Website Version",
          historical: result.historical,
          current: result.current,
          pageOptions: result.pageOptions,
          themeHistorical: result.themeHistorical,
          themeCurrent: result.themeCurrent,
          statusLabels: result.statusLabels,
          sourceLabels: result.sourceLabels,
          formError,
          success: null,
          draftVersion: null,
        })
      );
      return res.type("html").send(html);
    }
  );

  router.post(
    "/hq/website/version-history/:versionId/restore",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;

      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }

      const userId = actorUserId(req);
      if (!userId) {
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const churchId = tenant.church && tenant.church.id;
      if (!churchId) {
        return sendControlled(req, res, 403, "Church context is required.");
      }

      const body = req.body || {};
      let selectedPageKeys = body.pages || body.page_keys || [];
      if (!Array.isArray(selectedPageKeys)) selectedPageKeys = [selectedPageKeys];
      selectedPageKeys = selectedPageKeys.map((k) => String(k)).filter(Boolean);

      if (body.restore_all === "1" || body.restore_all === "on") {
        const prepared = await versionSvc.prepareVersionRestore(getPool(), {
          organizationId: tenant.organization.id,
          versionId: req.params.versionId,
        });
        if (!prepared.ok) {
          if (prepared.status === versionSvc.STATUS.NOT_FOUND) {
            return sendControlled(req, res, 404, "Version not found.");
          }
          return sendControlled(req, res, 400, "This version cannot be restored.");
        }
        selectedPageKeys = (prepared.pageOptions || []).map((p) => p.key);
      }

      const result = await versionSvc.createRestoredDraft(getPool(), {
        organizationId: tenant.organization.id,
        churchId,
        versionId: req.params.versionId,
        actorUserId: userId,
        restorationReason: body.restoration_reason || body.reason,
        selectedPageKeys,
        restoreTheme:
          body.keep_current_theme !== "1" &&
          body.keep_current_theme !== "on" &&
          (body.restore_theme === "1" ||
            body.restore_theme === "on" ||
            body.restore_theme == null),
        restoreNavigation:
          body.keep_current_navigation !== "1" &&
          body.keep_current_navigation !== "on" &&
          (body.restore_navigation === "1" ||
            body.restore_navigation === "on" ||
            body.restore_navigation == null),
        confirmed: body.confirm_restore === "1" || body.confirm_restore === "on",
      });

      if (!result.ok) {
        if (result.status === versionSvc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "Version not found.");
        }
        const reasonMap = {
          restoration_reason: "A restoration reason is required.",
          confirmation: "Confirm restoration before continuing.",
          pages: "Select at least one page to restore.",
          draft_source: "Draft versions cannot be used as a restore source.",
        };
        const msg = reasonMap[result.reason] || "Unable to create restored draft.";
        return res.redirect(
          303,
          `/hq/website/version-history/${encodeURIComponent(req.params.versionId)}/restore?error=${encodeURIComponent(msg)}`
        );
      }

      const html = await renderHqView(
        "hq/phase3-restore-website-version.ejs",
        await shellLocals(req, res, {
          pageTitle: "Restore Website Version",
          historical: result.historical,
          current: null,
          pageOptions: [],
          themeHistorical: result.historical.themeKey,
          themeCurrent: null,
          statusLabels: versionSvc.STATUS_LABELS,
          sourceLabels: versionSvc.SOURCE_LABELS,
          formError: null,
          success: result.message,
          draftVersion: result.draftVersion,
          restoredPageKeys: result.restoredPageKeys,
        })
      );
      return res.type("html").send(html);
    }
  );

  router.get("/hq/website/publishing-history", rejectApex, gateHq, async (req, res) => {
    const tenant = requireTenant(req, res);
    if (!tenant) return;

    const q = req.query || {};
    const result = await versionSvc.listPublishingHistory(getPool(), {
      organizationId: tenant.organization.id,
      sourceType: q.eventType || q.sourceType || null,
      publishedBy: q.publisher || null,
      themeKey: q.theme || null,
      from: q.from || null,
      to: q.to || null,
    });

    if (!result.ok) {
      return sendControlled(req, res, 503, "Publishing history is temporarily unavailable.");
    }

    const html = await renderHqView(
      "hq/phase3-website-publishing-history.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Publishing History",
        items: result.items,
        total: result.total,
        current: result.current,
        publishers: result.publishers,
        themeKeys: result.themeKeys,
        filters: result.filters,
        statusLabels: result.statusLabels,
        sourceLabels: result.sourceLabels,
        eventTypeLabels: result.eventTypeLabels,
        detailId: String(q.detail || "") || null,
      })
    );
    return res.type("html").send(html);
  });

  router.get("/hq/website/recent-changes", rejectApex, gateHq, async (req, res) => {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    if (!tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const result = await versionSvc.loadGrowthRecentWebsiteChanges(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      organizationKey: (tenant.organization && tenant.organization.key) || null,
      env,
    });
    if (!result.ok) {
      if (result.reason === "plan_not_growth") {
        const entitled = {
          ok: false,
          status: planEntitlementSvc.STATUS.NOT_ENTITLED,
          planKey: result.planKey || "foundation",
          requiredPlanKey: "growth",
          lockKind: "growth",
        };
        return renderWebsiteFeatureLocked(req, res, shellLocals, entitled, {
          featureTitle: "Recent Website Changes",
          returnHref: "/hq/website",
        });
      }
      return sendControlled(req, res, 503, "Recent website changes are temporarily unavailable.");
    }

    const html = await renderHqView(
      "hq/phase4-recent-website-changes.ejs",
      await shellLocals(req, res, {
        pageTitle: "Recent Website Changes",
        recent: result,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/hq/website/recent-changes/:publicationId/preview",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      if (!tenant.church || !tenant.church.id) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }

      const result = await versionSvc.loadGrowthPreviousWebsitePreview(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        publicationId: req.params.publicationId,
        organizationKey: (tenant.organization && tenant.organization.key) || null,
        env,
      });
      if (!result.ok) {
        if (result.reason === "plan_not_growth") {
          return sendControlled(
            req,
            res,
            404,
            "Previous Website Preview is available on the Growth plan."
          );
        }
        if (result.reason === "is_current") {
          return res.redirect(303, result.redirectTo || "/hq/website/recent-changes");
        }
        if (result.status === versionSvc.STATUS.NOT_FOUND) {
          return sendControlled(req, res, 404, "Previous website not found.");
        }
        return sendControlled(req, res, 400, "Unable to preview this website.");
      }

      const html = await renderHqView(
        "hq/phase4-previous-website-preview.ejs",
        await shellLocals(req, res, {
          pageTitle: "Previous Website Preview",
          preview: result,
          robotsNoIndex: true,
        })
      );
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      return res.status(200).type("html").send(html);
    }
  );

  router.get(
    "/hq/website/recent-changes/:publicationId/restore",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      if (!tenant.church || !tenant.church.id) {
        return sendControlled(req, res, 403, "You do not have access to this site.");
      }

      const result = await versionSvc.prepareGrowthRestorePreviousWebsite(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        publicationId: req.params.publicationId,
        organizationKey: (tenant.organization && tenant.organization.key) || null,
        env,
      });
      if (!result.ok) {
        if (result.reason === "plan_not_growth" || result.reason === "not_eligible_backup") {
          return sendControlled(req, res, 404, "This website cannot be restored.");
        }
        if (result.status === versionSvc.STATUS.NOT_FOUND || result.reason === "is_current") {
          return sendControlled(req, res, 404, "Previous website not found.");
        }
        return sendControlled(req, res, 400, "Unable to open restoration.");
      }

      if (result.existingRestoredDraft) {
        return res.redirect(303, "/hq/website/restored-draft");
      }

      const formError = String((req.query && req.query.error) || "") || null;
      const html = await renderHqView(
        "hq/phase4-restore-previous-website.ejs",
        await shellLocals(req, res, {
          pageTitle: "Restore Previous Website",
          restore: result,
          formError,
          publicationId: req.params.publicationId,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/hq/website/recent-changes/:publicationId/restore",
    rejectApex,
    gateHq,
    async (req, res) => {
      const tenant = requireTenant(req, res);
      if (!tenant) return;
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
      }
      const userId = actorUserId(req);
      if (!userId) {
        return sendControlled(req, res, 401, "Sign-in is required.");
      }
      if (!tenant.church || !tenant.church.id) {
        return sendControlled(req, res, 403, "Church context is required.");
      }

      const body = req.body || {};
      const themeChoice =
        body.theme_choice === "use_previous" ? "use_previous" : "keep_current";
      const result = await versionSvc.createGrowthRestoredWebsiteDraft(getPool(), {
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        publicationId: req.params.publicationId,
        actorUserId: userId,
        themeChoice,
        restorationNote: body.restoration_note || body.restoration_reason || null,
        confirmed:
          body.confirm_restore === "1" ||
          body.confirm_restore === "on" ||
          body.confirm_draft === "1" ||
          body.confirm_draft === "on",
        organizationKey: (tenant.organization && tenant.organization.key) || null,
        env,
      });

      if (!result.ok) {
        if (result.reason === "draft_conflict") {
          return res.redirect(
            303,
            `/hq/website/recent-changes/${encodeURIComponent(
              req.params.publicationId
            )}/restore?error=${encodeURIComponent(
              result.message ||
                "You already have unpublished website changes. Finish or discard them before restoring a previous website."
            )}`
          );
        }
        if (
          result.reason === "plan_not_growth" ||
          result.reason === "not_eligible_backup" ||
          result.status === versionSvc.STATUS.NOT_FOUND
        ) {
          return sendControlled(req, res, 404, "This website cannot be restored.");
        }
        const reasonMap = {
          confirmation: "Confirm that this will create a draft before continuing.",
          restoration_reason: "Add a short restoration note, or leave the default.",
          snapshot_incomplete: "This saved website cannot be restored safely.",
        };
        const msg = reasonMap[result.reason] || "Unable to create restored draft.";
        return res.redirect(
          303,
          `/hq/website/recent-changes/${encodeURIComponent(
            req.params.publicationId
          )}/restore?error=${encodeURIComponent(msg)}`
        );
      }

      return res.redirect(303, result.redirectTo || "/hq/website/restored-draft");
    }
  );

  router.get("/hq/website/restored-draft", rejectApex, gateHq, async (req, res) => {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    if (!tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const result = await versionSvc.loadGrowthRestoredWebsiteDraftReview(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      organizationKey: (tenant.organization && tenant.organization.key) || null,
      actorUserId: actorUserId(req),
      env,
    });
    if (!result.ok) {
      if (result.reason === "plan_not_growth") {
        return sendControlled(req, res, 404, "Restored drafts are available on the Growth plan.");
      }
      if (result.reason === "no_restored_draft") {
        return res.redirect(303, "/hq/website/recent-changes");
      }
      return sendControlled(req, res, 503, "Restored draft review is temporarily unavailable.");
    }

    const html = await renderHqView(
      "hq/phase4-restored-website-draft-review.ejs",
      await shellLocals(req, res, {
        pageTitle: "Restored Website Draft",
        review: result,
        notice: String((req.query && req.query.notice) || "") || null,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/website/restored-draft/discard", rejectApex, gateHq, async (req, res) => {
    const tenant = requireTenant(req, res);
    if (!tenant) return;
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const userId = actorUserId(req);
    if (!userId) {
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    if (!tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "Church context is required.");
    }

    const result = await versionSvc.discardGrowthRestoredWebsiteDraft(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      actorUserId: userId,
      env,
    });
    if (!result.ok) {
      if (result.reason === "plan_not_growth") {
        return sendControlled(req, res, 404, "Not found.");
      }
      return res.redirect(303, "/hq/website/restored-draft?notice=discard_failed");
    }
    return res.redirect(
      303,
      `${result.redirectTo || "/hq/website/recent-changes"}?notice=draft_discarded`
    );
  });

  return router;
}

module.exports = {
  createWebsitePublicationVersionAdminRouter,
};
