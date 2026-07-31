"use strict";

/**
 * BlessBoard V5 HQ / branch manual giving admin (aggregated summaries).
 * No donor PII, no payment processing — NUMERIC amounts as decimal strings.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  createRequireV5AuthenticatedSession,
} = require("../../platform/http/v5SessionAuthGate");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
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
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIST_LIMIT = 50;
const ENTRY_STATUSES = Object.freeze(["draft", "submitted", "approved", "void"]);

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

function formError(reason) {
  if (reason === "amount" || reason === "amount_must_be_decimal_string") {
    return "Enter amount as a decimal string with up to 2 places (for example 25.00).";
  }
  if (reason === "currency") {
    return "Currency must be a 3-letter ISO code.";
  }
  if (reason === "status_locked" || reason === "not_draft") {
    return "This entry cannot be changed in its current status.";
  }
  if (reason === "void_reason") {
    return "A void reason is required.";
  }
  return "Please check the form and try again.";
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

  const rejectApex = createRejectApex({
    isApexHost,
    sendUnavailable,
    // Branch modules must match /branch-admin shell: allow apex when session tenant resolves.
    mode: "unlessTenant",
  });

  const requireSession = createRequireV5AuthenticatedSession({
    loginNext,
  });

  function gate(req, res, next) {
    if (!requireSession(req, res, { loginNext: req.originalUrl || loginNext })) {
      return;
    }
    return requireAccess(req, res, next);
  }

  async function shellLocals(req, res, extra) {
    if (variant === "branch") {
      return buildBranchAdminShellLocals(req, res, {
      getPool,
        env,
        isProduction,
        activeNav: "giving",
        pageTitle: (extra && extra.pageTitle) || "Giving",
        extra: {
          shellKind: "branch",
          ...(extra || {}),
        },
      });
    }
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      getPool,
      activeNav: "giving",
      pageTitle: (extra && extra.pageTitle) || "Giving",
      extra: {
        shellKind: "hq",
        ...(extra || {}),
      },
    });
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
        branchKey: tenant.primaryBranch.key || null,
        branchDisplayName: tenant.primaryBranch.displayName || null,
        basePath: "/branch-admin/giving",
        tenant,
        actorUserId: session.userId,
      };
    }
    const branchKey = req.params && req.params.branchKey ? String(req.params.branchKey) : "";
    if (branchKey) {
      const resolved = await resolveBlessBoardBranchForChurch(
        getPool(),
        tenant.church.id,
        branchKey
      );
      if (!resolved.ok || !resolved.branch) {
        const code = resolved.status === BRANCH_STATUS.LOOKUP_ERROR ? 503 : 404;
        sendControlled(
          req,
          res,
          code,
          code === 503 ? "Branch lookup is temporarily unavailable." : "Branch not found.",
          shellKind
        );
        return null;
      }
      const authz = await authorizeBlessBoardTenantAccess(getPool(), {
        userId: session.userId,
        tenant,
        branchId: resolved.branch.id,
      });
      if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
        sendControlled(req, res, 503, "Access check is temporarily unavailable.", shellKind);
        return null;
      }
      if (!authz.ok) {
        sendControlled(req, res, 403, "You do not have access to this branch.", shellKind);
        return null;
      }
      return {
        churchId: tenant.church.id,
        branchId: resolved.branch.id,
        branchKey: resolved.branch.key,
        branchDisplayName: resolved.branch.displayName,
        basePath: `/hq/giving/b/${resolved.branch.key}`,
        tenant,
        actorUserId: session.userId,
      };
    }
    return {
      churchId: tenant.church.id,
      branchId: null,
      branchKey: null,
      branchDisplayName: null,
      basePath: "/hq/giving",
      tenant,
      actorUserId: session.userId,
    };
  }

  async function loadScopedEntry(req, res, scope, id) {
    if (!UUID_RE.test(id)) {
      sendControlled(req, res, 404, "Giving entry not found.", shellKind);
      return null;
    }
    const loaded = await getGivingEntry(getPool(), {
      id,
      churchId: scope.churchId,
      scopeBranchId: scope.branchId,
      actorUserId: scope.actorUserId,
      tenant: scope.tenant,
    });
    if (!loaded.ok || !loaded.entry) {
      sendControlled(
        req,
        res,
        loaded.status === STATUS.FORBIDDEN ? 403 : 404,
        "Giving entry not found.",
        shellKind
      );
      return null;
    }
    return loaded.entry;
  }

  function registerRoutes(mountPrefix, branchScoped) {
    router.get(mountPrefix, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      if (variant === "branch" && !scope.branchId) {
        return sendControlled(req, res, 403, "Branch scope required.", shellKind);
      }
      const yearMonthRaw = String((req.query && req.query.month) || currentYearMonth());
      const yearMonth = /^\d{4}-\d{2}$/.test(yearMonthRaw) ? yearMonthRaw : currentYearMonth();
      const status = String((req.query && req.query.status) || "").trim().toLowerCase();
      const listed = await listGivingEntries(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
        yearMonth,
        status: ENTRY_STATUSES.includes(status) ? status : null,
        limit: LIST_LIMIT,
      });
      const summary = await getMonthlyGivingSummary(getPool(), {
        churchId: scope.churchId,
        branchId: scope.branchId,
        yearMonth,
        actorUserId: scope.actorUserId,
        tenant: scope.tenant,
      });
      const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
      if (!listed.ok) {
        return sendControlled(
          req,
          res,
          listed.status === STATUS.FORBIDDEN ? 403 : 503,
          "Giving is temporarily unavailable.",
          shellKind
        );
      }
      let branches = [];
      if (variant === "hq" && !scope.branchId) {
        const listResult = await listBlessBoardBranches(getPool(), scope.churchId);
        branches = listResult.ok ? listResult.branches : [];
      }
      const html = renderView(
        "giving/admin-list.ejs",
        await shellLocals(req, res, {
          basePath: scope.basePath,
          entries: listed.entries,
          categories: cats.ok ? cats.categories : [],
          summary: summary.ok ? summary.summary : null,
          yearMonth,
          statusFilter: status,
          branchScoped,
          branchDisplayName: scope.branchDisplayName || null,
          branchKey: scope.branchKey || null,
          branches,
          isHqChurchWide: variant === "hq" && !scope.branchId,
          isHqBranchScoped: variant === "hq" && Boolean(scope.branchId),
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
          await shellLocals(req, res, {
            pageTitle: "Record giving",
            basePath: scope.basePath,
            entry: null,
            categories: cats.ok ? cats.categories : [],
            error: null,
            formMode: "create",
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
            await shellLocals(req, res, {
              pageTitle: "Record giving",
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
              error: formError(created.reason),
              formMode: "create",
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
      const entry = await loadScopedEntry(req, res, scope, id);
      if (!entry) return;
      const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
      const html = renderView(
        "giving/admin-detail.ejs",
        await shellLocals(req, res, {
          pageTitle: entry.categoryLabel || "Giving entry",
          basePath: scope.basePath,
          entry,
          categories: cats.ok ? cats.categories : [],
          isHq: variant === "hq",
          canEdit: entry.status === "draft",
          canVoid:
            entry.status === "draft" ||
            (variant === "hq" && entry.status !== "void"),
          saved: String((req.query && req.query.saved) || ""),
          error: null,
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.get(`${mountPrefix}/:id/edit`, rejectApex, gate, async (req, res) => {
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const entry = await loadScopedEntry(req, res, scope, id);
      if (!entry) return;
      if (entry.status !== "draft") {
        return res.redirect(303, `${scope.basePath}/${id}`);
      }
      const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
      const html = renderView(
        "giving/admin-form.ejs",
        await shellLocals(req, res, {
          pageTitle: "Edit giving entry",
          basePath: scope.basePath,
          entry,
          categories: cats.ok ? cats.categories : [],
          error: null,
          formMode: "edit",
        })
      );
      return res.status(200).type("html").send(html);
    });

    router.post(`${mountPrefix}/:id`, rejectApex, gate, async (req, res) => {
      if (!validateCsrfPost(req, res)) return;
      const scope = await resolveScope(req, res);
      if (!scope) return;
      const id = String(req.params.id || "");
      const existing = await loadScopedEntry(req, res, scope, id);
      if (!existing) return;
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
        const cats = await listGivingCategories(getPool(), { churchId: scope.churchId });
        const html = renderView(
          "giving/admin-form.ejs",
          await shellLocals(req, res, {
            pageTitle: "Edit giving entry",
            basePath: scope.basePath,
            entry: {
              ...existing,
              categoryKey: body.category_key || existing.categoryKey,
              givingDate: body.giving_date || existing.givingDate,
              amount: body.amount || existing.amount,
              currency: body.currency || existing.currency,
              reference: body.reference != null ? body.reference : existing.reference,
              notes: body.notes != null ? body.notes : existing.notes,
            },
            categories: cats.ok ? cats.categories : [],
            error: formError(updated.reason),
            formMode: "edit",
          })
        );
        const code =
          updated.status === STATUS.FORBIDDEN || updated.status === STATUS.POLICY ? 403 : 400;
        return res.status(code).type("html").send(html);
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
        return sendControlled(req, res, 400, formError(submitted.reason), shellKind);
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
          formError(voided.reason),
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
