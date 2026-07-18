"use strict";

/**
 * BlessBoard V5 HQ / branch manual giving admin (aggregated summaries).
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  createGivingEntry,
  updateGivingEntry,
  submitGivingEntry,
  approveGivingEntry,
  voidGivingEntry,
  getGivingEntry,
  listGivingEntries,
  listGivingCategories,
  getMonthlyGivingSummary,
} = require("../services/givingService");
const {
  resolveBlessBoardBranchForChurch,
} = require("../services/listBlessBoardBranches");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message, shellKind) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  const css = shellKind === "hq" ? "hq-admin.css" : "branch-admin.css";
  const bodyClass = shellKind === "hq" ? "bb-hq-body" : "bb-ba-body";
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Giving</title>
<link rel="stylesheet" href="/blessboard/v5/${css}"/></head>
<body class="${bodyClass}"><main><h1>Unavailable</h1><p>${safe}</p>
<p><a href="/">Church homepage</a></p></main></body></html>`);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 *   variant: 'hq' | 'branch',
 * }} deps
 */
function createGivingAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const variant = deps.variant === "branch" ? "branch" : "hq";
  const isProduction = String(env.NODE_ENV || "") === "production";
  const shellKind = variant === "hq" ? "hq" : "branch";
  const loginNext = variant === "hq" ? "/hq/giving" : "/branch-admin/giving";

  const allowedRoles =
    variant === "hq"
      ? ["church_hq_admin", "platform_admin"]
      : ["platform_admin", "church_hq_admin", "branch_admin"];

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({ getPool, allowedRoles });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || loginNext)}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.", shellKind);
    }
    return requireAccess(req, res, next);
  }

  function primaryRoleLabel(req) {
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const order =
      variant === "hq"
        ? ["church_hq_admin", "platform_admin", "branch_admin"]
        : ["branch_admin", "church_hq_admin", "platform_admin"];
    for (const key of order) {
      const hit = roles.find((r) => r.roleKey === key);
      if (hit) return formatRoleLabel(hit.roleKey);
    }
    return roles[0] ? formatRoleLabel(roles[0].roleKey) : variant === "hq" ? "HQ admin" : "Branch admin";
  }

  function shellLocals(req, res, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const base = {
      pageTitle: "Giving",
      activeNav: "giving",
      shellKind,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      roleLabel: primaryRoleLabel(req),
      displayName:
        req.v5Session && req.v5Session.session && req.v5Session.session.user
          ? req.v5Session.session.user.displayName
          : "",
      ...(extra || {}),
    };
    if (variant === "hq") {
      base.hqBranchDisplayName = tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "";
    } else {
      base.branchDisplayName =
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "";
    }
    return base;
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      sendControlled(req, res, 403, "Invalid or missing CSRF token.", shellKind);
      return false;
    }
    return true;
  }

  async function resolveScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
      return null;
    }
    const session = req.v5Session && req.v5Session.session;
    if (!session || !session.userId) {
      sendControlled(req, res, 401, "Sign-in is required.", shellKind);
      return null;
    }
    if (variant === "branch") {
      if (!tenant.primaryBranch || !tenant.primaryBranch.id) {
        sendControlled(req, res, 403, "You do not have access to this site.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        basePath: "/branch-admin/giving",
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(getPool(), {
        churchId: tenant.church.id,
        branchKey,
      });
      if (!resolved.ok || !resolved.branch) {
        sendControlled(req, res, 404, "Branch not found.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        basePath: `/hq/giving/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      basePath: "/hq/giving",
      tenant,
      actorUserId: session.userId,
    };
  }

  function registerRoutes(mountPrefix, branchScoped) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (variant === "branch" && !scope.branchId) {
        return sendControlled(req, res, 403, "Branch scope required.", shellKind);
      }
      const yearMonth = String((req.query && req.query.month) || currentYearMonth());
      const listed = await listGivingEntries(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        yearMonth: /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : null,
      });
      const summary = await getMonthlyGivingSummary(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        yearMonth: /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : currentYearMonth(),
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === STATUS.FORBIDDEN ? 403 : 503,
          "Giving is temporarily unavailable.",
          shellKind
        );
      }
      const html = renderView(
        "giving/admin-list.ejs",
        shellLocals(req, res, {
          basePath: scope.basePath,
          entries: listed.entries,
          summary: summary.ok ? summary.summary : null,
          yearMonth,
          branchScoped,
          canCreate: Boolean(scope.branchId),
          saved: String((req.query && req.query.saved) || ""),
        })
      );
      return res.status(200).type("html").send(html);
    });

    if (branchScoped || variant === "branch") {
      router.get(`${mountPrefix}/new`, rejectApex, gate, async (req, res) => {
        const scope = await resolveScope(req, res);
        if (!scope || !scope.branchId) {
          return sendControlled(req, res, 403, "Branch scope required to record giving.", shellKind);
        }
        const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
        const html = renderView(
          "giving/admin-form.ejs",
          shellLocals(req, res, {
            basePath: scope.basePath,
            entry: null,
            categories: cats.ok ? cats.categories : [],
            error: null,
          })
        );
        return res.status(200).type("html").send(html);
      });

      router.post(mountPrefix, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res);
        if (!scope || !scope.branchId) {
          return sendControlled(req, res, 403, "Branch scope required.", shellKind);
        }
        const body = req.body || {};
        const created = await createGivingEntry(getPool(), {
          churchId: scope.churchId,
          branchId: scope.branchId,
          scopeBranchId: scope.branchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
          categoryKey: body.category_key,
          givingDate: body.giving_date,
          amount: body.amount,
          currency: body.currency,
          reference: body.reference,
          notes: body.notes,
        });
        if (!created.ok) {
          const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
          const html = renderView(
            "giving/admin-form.ejs",
            shellLocals(req, res, {
              basePath: scope.basePath,
              entry: {
                categoryKey: body.category_key || "",
                givingDate: body.giving_date || "",
                amount: body.amount || "",
                currency: body.currency || "USD",
                reference: body.reference || "",
                notes: body.notes || "",
              },
              categories: cats.ok ? cats.categories : [],
              error: "Please check the form and try again.",
            })
          );
          return res.status(400).type("html").send(html);
        }
        return res.redirect(303, `${scope.basePath}/${created.entry.id}?saved=1`);
      });
    }

    router.get(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Giving entry not found.", shellKind);
      }
      const loaded = await getGivingEntry(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!loaded.ok || !loaded.entry) {
        return sendControlled(
          req,
          res,
          loaded.status === STATUS.FORBIDDEN ? 403 : 404,
          "Giving entry not found.",
          shellKind
        );
      }
      const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
      const html = renderView(
        "giving/admin-detail.ejs",
        shellLocals(req, res, {
          basePath: scope.basePath,
          entry: loaded.entry,
          categories: cats.ok ? cats.categories : [],
          isHq: variant === "hq",
          canEdit: loaded.entry.status === "draft",
          canVoid:
            loaded.entry.status === "draft" ||
            (variant === "hq" && loaded.entry.status !== "void"),
          saved: String((req.query && req.query.saved) || ""),
          error: null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Giving entry not found.", shellKind);
      }
      const body = req.body || {};
      const updated = await updateGivingEntry(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        categoryKey: body.category_key,
        givingDate: body.giving_date,
        amount: body.amount,
        currency: body.currency,
        reference: body.reference,
        notes: body.notes,
      });
      if (!updated.ok) {
        return sendControlled(
          req,
          res,
          updated.status === STATUS.FORBIDDEN || updated.status === STATUS.POLICY ? 403 : 400,
          "Could not update giving entry.",
          shellKind
        );
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=updated`);
    });

    router.post(`${mountPrefix}/:id/submit`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Giving entry not found.", shellKind);
      }
      const submitted = await submitGivingEntry(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      if (!submitted.ok) {
        return sendControlled(req, res, 400, "Could not submit giving entry.", shellKind);
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=submitted`);
    });

    router.post(`${mountPrefix}/:id/void`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return sendControlled(req, res, 404, "Giving entry not found.", shellKind);
      }
      const body = req.body || {};
      const voided = await voidGivingEntry(getPool(), {
        id,
        churchId: scope.churchId,
        scopeBranchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        voidReason: body.void_reason,
      });
      if (!voided.ok) {
        return sendControlled(
          req,
          res,
          voided.status === STATUS.FORBIDDEN || voided.status === STATUS.POLICY ? 403 : 400,
          "Could not void giving entry.",
          shellKind
        );
      }
      return res.redirect(303, `${scope.basePath}/${id}?saved=voided`);
    });

    if (variant === "hq") {
      router.post(`${mountPrefix}/:id/approve`, rejectApex, gate, async (req, res) => {
        if (!validateCsrfPost(req, res)) return;
        const scope = await resolveScope(req, res);
        if (!scope) return;
        const id = String(req.params.id || "");
        if (!UUID_RE.test(id)) {
          return sendControlled(req, res, 404, "Giving entry not found.", shellKind);
        }
        const approved = await approveGivingEntry(getPool(), {
          id,
          churchId: scope.churchId,
          actorUserId: scope.actorUserId,
          tenant: scope.tenant,
        });
        if (!approved.ok) {
          return sendControlled(req, res, 400, "Could not approve giving entry.", shellKind);
        }
        return res.redirect(303, `${scope.basePath}/${id}?saved=approved`);
      });
    }
  }

  if (variant === "hq") {
    registerRoutes("/hq/giving", false);
    registerRoutes("/hq/giving/b/:branchKey", true);
  } else {
    registerRoutes("/branch-admin/giving", true);
  }

  return router;
}

module.exports = {
  createGivingAdminRouter,
};
