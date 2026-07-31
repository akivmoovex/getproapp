"use strict";

/**
 * Prompt 7 Stage 2–3 — HQ branch website settings.
 * HTML editor (primary): GET/POST /hq/website/branches/:branchKey/settings
 * JSON API (Accept: application/json or ?format=json): same path
 * No public write endpoints.
 */

const express = require("express");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  resolveWebsiteScope,
  STATUS: WEBSITE_SCOPE_STATUS,
  SCOPE_TYPE,
} = require("../services/resolveWebsiteScope");
const {
  resolveBranchWebsiteSettings,
  SOURCE,
} = require("../services/resolveBranchWebsiteSettings");
const {
  setWebsiteScopeOverride,
  resetWebsiteScopeField,
  hideWebsiteScopeField,
  STATUS: SCOPE_STATUS,
} = require("../services/websiteScopeSettingsService");
const {
  buildEditorViewModel,
} = require("../services/branchWebsiteSettingsEditorView");
const {
  saveHomeServiceTimes,
} = require("../services/homeServiceTimesService");
const {
  publicBranchHomePath,
  publicBranchPagePath,
} = require("../urls/churchUrlHelper");
const registry = require("../services/websiteSettingKeyRegistry");

function wantsJson(req) {
  if (String((req.query && req.query.format) || "").toLowerCase() === "json") return true;
  const accept = String(req.get("accept") || "").toLowerCase();
  if (accept.includes("application/json") && !accept.includes("text/html")) return true;
  if (String(req.get("x-requested-with") || "").toLowerCase() === "xmlhttprequest") return true;
  return false;
}

function wantsHtmlForm(req) {
  const ct = String(req.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return false;
  if (String((req.body && req.body.format) || "").toLowerCase() === "json") return false;
  return true;
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsiteScopeSettingsAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => {
      if (wantsJson(req)) return res.status(404).json({ ok: false, error: "not_found" });
      return res.status(404).type("text").send("Not found");
    },
  });

  const requireHq = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  function requireSession(req, res, next) {
    if (!(req.v5Session && req.v5Session.authenticated)) {
      if (wantsJson(req) || String(req.method || "").toUpperCase() !== "GET") {
        return res.status(401).json({ ok: false, error: "unauthenticated" });
      }
      return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || "/hq")}`);
    }
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || tenant.resolved !== true) {
      if (wantsJson(req) || String(req.method || "").toUpperCase() !== "GET") {
        return res.status(403).json({ ok: false, error: "forbidden" });
      }
      return res.status(403).type("text").send("Forbidden");
    }
    req.blessBoardTenant = tenant;
    return next();
  }

  async function resolveHqBranchScope(req, res) {
    const tenant = req.blessBoardTenant || resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    const resolved = await resolveWebsiteScope(getPool(), {
      tenant,
      authenticatedUser: session && session.userId,
      requestedBranchKey: req.params.branchKey,
      organizationId: tenant && tenant.organization ? tenant.organization.id : null,
      churchId: tenant && tenant.church ? tenant.church.id : null,
    });
    if (!resolved.ok || resolved.scopeType !== SCOPE_TYPE.BRANCH || !resolved.branchId) {
      const status =
        resolved.status === WEBSITE_SCOPE_STATUS.NOT_FOUND
          ? 404
          : resolved.status === WEBSITE_SCOPE_STATUS.FORBIDDEN
            ? 403
            : 400;
      if (wantsJson(req) || !wantsHtmlForm(req)) {
        res.status(status).json({ ok: false, error: resolved.status || "scope" });
        return null;
      }
      res.status(status).type("text").send(status === 404 ? "Not found" : "Forbidden");
      return null;
    }
    return resolved;
  }

  function settingsPath(branchKey, query) {
    const base = `/hq/website/branches/${encodeURIComponent(branchKey)}/settings`;
    if (!query) return base;
    return `${base}?${query}`;
  }

  async function loadResolved(scope, tenant) {
    return resolveBranchWebsiteSettings(getPool(), {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      churchDisplayName: (tenant.church && tenant.church.displayName) || null,
    });
  }

  async function renderHtmlEditor(req, res, scope, extras) {
    const tenant = req.blessBoardTenant;
    const resolved = await loadResolved(scope, tenant);
    if (!resolved.ok) {
      return res.status(404).type("text").send("Not found");
    }
    const editor = buildEditorViewModel(resolved, { allowGovernanceControlled: true });
    const orgKey = tenant.organization && tenant.organization.key ? tenant.organization.key : null;
    const branchKey = scope.branchKey;
    const previewHref = orgKey
      ? publicBranchHomePath(orgKey, branchKey)
      : `/branches/${encodeURIComponent(branchKey)}`;
    const previewAboutHref = orgKey
      ? publicBranchPagePath(orgKey, branchKey, "about")
      : `/branches/${encodeURIComponent(branchKey)}/about`;

    const shell = await buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: `Branch website settings · ${branchKey}`,
      getPool,
    });

    const fieldErrors = (extras && extras.fieldErrors) || {};
    const formValues = (extras && extras.formValues) || {};
    const errorSummary = (extras && extras.errorSummary) || null;
    const notice = (extras && extras.notice) || String((req.query && req.query.notice) || "");
    const error = (extras && extras.error) || String((req.query && req.query.error) || "");
    const focusSection = (extras && extras.section) || String((req.query && req.query.section) || "identity");

    const html = renderV5Ejs("hq/branch-website-settings.ejs", {
      ...shell,
      pageTitle: `Branch website settings · ${
        (scope.branch && scope.branch.displayName) || branchKey
      }`,
      branchKey,
      branchLabel: (scope.branch && scope.branch.displayName) || branchKey,
      parentChurchLabel: resolved.parentChurchLabel,
      editor,
      governance: resolved.governance,
      previewHref,
      previewAboutHref,
      serviceTimesHref: `/hq/website/branches/${encodeURIComponent(branchKey)}/service-times`,
      branchDetailsHref: `/hq/branches/${encodeURIComponent(branchKey)}`,
      approvalSettingsHref: "/hq/website/approval-settings",
      websiteHomeHref: `/hq/website/branches/${encodeURIComponent(branchKey)}`,
      formAction: settingsPath(branchKey),
      csrfField: CSRF_FIELD,
      notice,
      error,
      errorSummary,
      fieldErrors,
      formValues,
      focusSection,
      socialPlatforms: registry.SOCIAL_PLATFORMS,
      SOURCE,
    });
    return res.type("html").send(html);
  }

  router.get(
    "/hq/website/branches/:branchKey/settings",
    rejectApex,
    requireSession,
    requireHq,
    async (req, res) => {
      try {
        const scope = await resolveHqBranchScope(req, res);
        if (!scope) return undefined;
        if (wantsJson(req)) {
          const resolved = await loadResolved(scope, req.blessBoardTenant);
          if (!resolved.ok) {
            return res.status(404).json({ ok: false, error: resolved.status });
          }
          return res.json({
            ok: true,
            branchId: resolved.branchId,
            branchKey: resolved.branchKey,
            values: resolved.values,
            serviceTimes: resolved.serviceTimes,
            parentChurchLabel: resolved.parentChurchLabel,
          });
        }
        return renderHtmlEditor(req, res, scope, {});
      } catch {
        if (wantsJson(req)) return res.status(500).json({ ok: false, error: "lookup_error" });
        return res.status(500).type("text").send("Unavailable");
      }
    }
  );

  async function applyAction(req, scope) {
    const body = req.body || {};
    const action = String(body.action || "")
      .trim()
      .toLowerCase();
    const settingKey = String(body.settingKey || "").trim();
    const actorUserId =
      req.v5Session && req.v5Session.session && req.v5Session.session.userId
        ? req.v5Session.session.userId
        : null;
    const section = String(body.section || "identity").trim() || "identity";

    // Ignore any client-supplied organization/church/branch IDs.
    const base = {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      branchId: scope.branchId,
      settingKey,
      actorUserId,
      updatedBy: actorUserId,
      allowGovernanceControlled: true,
    };

    if (action === "clear_service_times") {
      const cleared = await saveHomeServiceTimes(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        organizationId: scope.organizationId,
        actorUserId,
        action: "save_publish",
        entries: [],
      });
      return {
        ok: cleared.ok,
        status: cleared.ok ? SCOPE_STATUS.OK : SCOPE_STATUS.INVALID_INPUT,
        message: cleared.ok
          ? "Branch-local service times cleared. Church fallback will show when available."
          : cleared.message || "Could not clear service times.",
        section: "service-times",
        notice: cleared.ok ? "service_times_cleared" : null,
      };
    }

    if (action === "override") {
      let value = body.value;
      if (settingKey === "social.links") {
        const links = [];
        for (const platform of registry.SOCIAL_PLATFORMS) {
          const href = String(body[`social_${platform}`] || "").trim();
          if (!href) continue;
          links.push({ platform, href, label: platform });
        }
        value = links;
      }
      if (settingKey === "seo.noindex") {
        value = body.value === "true" || body.value === "1" || body.value === true;
      }
      // Empty override intent → treat as reset (do not create blank rows).
      if (
        settingKey !== "social.links" &&
        settingKey !== "seo.noindex" &&
        (value == null || String(value).trim() === "")
      ) {
        return {
          ok: false,
          status: SCOPE_STATUS.INVALID_INPUT,
          message: "Enter a value to override, or use Reset to inherit.",
          section,
          fieldErrors: { [settingKey]: "Enter a value to override this field." },
          formValues: { [settingKey]: value },
        };
      }
      const result = await setWebsiteScopeOverride(getPool(), {
        ...base,
        value,
      });
      return {
        ...result,
        section,
        notice: result.ok ? "override_saved" : null,
        message: result.message || null,
        fieldErrors: result.ok
          ? {}
          : { [settingKey]: result.message || "Could not save override." },
        formValues: { [settingKey]: value },
      };
    }

    if (action === "reset" || action === "restore") {
      const result = await resetWebsiteScopeField(getPool(), base);
      return {
        ...result,
        section,
        notice: result.ok ? (action === "restore" ? "restored" : "reset") : null,
        message: result.message || null,
      };
    }

    if (action === "hide") {
      const result = await hideWebsiteScopeField(getPool(), base);
      return {
        ...result,
        section,
        notice: result.ok ? "hidden" : null,
        message: result.message || null,
      };
    }

    return {
      ok: false,
      status: SCOPE_STATUS.INVALID_INPUT,
      message: "Unknown action.",
      section,
    };
  }

  router.post(
    "/hq/website/branches/:branchKey/settings",
    rejectApex,
    requireSession,
    requireHq,
    async (req, res) => {
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        if (wantsJson(req) || !wantsHtmlForm(req)) {
          return res.status(403).json({ ok: false, error: "csrf" });
        }
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      try {
        const scope = await resolveHqBranchScope(req, res);
        if (!scope) return undefined;

        const result = await applyAction(req, scope);

        if (!wantsHtmlForm(req) || wantsJson(req)) {
          if (!result.ok) {
            const status =
              result.status === SCOPE_STATUS.UNKNOWN_KEY ||
              result.status === SCOPE_STATUS.INVALID_INPUT
                ? 400
                : result.status === SCOPE_STATUS.LOCKED ||
                    result.status === SCOPE_STATUS.FORBIDDEN
                  ? 403
                  : result.status === SCOPE_STATUS.NOT_FOUND
                    ? 404
                    : 400;
            return res.status(status).json({
              ok: false,
              error: result.status,
              message: result.message || null,
            });
          }
          return res.json({ ok: true, result });
        }

        const section = result.section || "identity";
        if (!result.ok) {
          return renderHtmlEditor(req, res, scope, {
            error: result.message || "Could not save changes.",
            errorSummary: result.message || "Could not save changes.",
            fieldErrors: result.fieldErrors || {},
            formValues: result.formValues || {},
            section,
          });
        }
        return res.redirect(
          303,
          `${settingsPath(scope.branchKey, `notice=${encodeURIComponent(result.notice || "saved")}&section=${encodeURIComponent(section)}`)}#${encodeURIComponent(section)}`
        );
      } catch {
        if (wantsJson(req) || !wantsHtmlForm(req)) {
          return res.status(500).json({ ok: false, error: "lookup_error" });
        }
        return res.status(500).type("text").send("Unavailable");
      }
    }
  );

  router.post("/public/website/settings", (_req, res) => {
    return res.status(404).json({ ok: false, error: "not_found" });
  });

  return router;
}

module.exports = {
  createWebsiteScopeSettingsAdminRouter,
  CSRF_FIELD,
  wantsJson,
};
