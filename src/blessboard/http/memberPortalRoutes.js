"use strict";

/**
 * Minimal BlessBoard V5 member portal shell + profile (tenant hosts only).
 * Access is membership-gated — admin roles alone never grant entry.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const { createRequireActiveMember } = require("./requireActiveMember");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  getMemberPortalProfile,
  updateMemberPortalProfile,
  STATUS: PORTAL_STATUS,
} = require("../services/memberPortalService");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

const PORTAL_MODULES = Object.freeze([
  { key: "announcements", label: "Announcements" },
  { key: "events", label: "Events" },
  { key: "ministries", label: "Ministries" },
  { key: "resources", label: "Resources" },
  { key: "forms", label: "Forms" },
  { key: "requests", label: "Requests" },
  { key: "giving", label: "Giving" },
]);

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderMemberView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createMemberPortalRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireMember = createRequireActiveMember({ getPool });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") {
        return sendUnavailable(req, res);
      }
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {'home'|'profile'} activeNav
   * @param {object} [extra]
   */
  function shellLocals(req, res, activeNav, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
    const access = req.blessBoardMemberAccess || null;
    const preferred =
      access && access.member && access.member.preferredName
        ? access.member.preferredName
        : session && session.user
          ? session.user.displayName
          : "";
    return {
      pageTitle: activeNav === "profile" ? "Profile" : "Member home",
      activeNav,
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      branchDisplayName:
        tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
      displayName: preferred || "",
      portalModules: PORTAL_MODULES,
      ...(extra || {}),
    };
  }

  router.get("/member", rejectApex, requireMember, (req, res) => {
    const html = renderMemberView("member/dashboard.ejs", shellLocals(req, res, "home"));
    return res.status(200).type("html").send(html);
  });

  router.get("/member/profile", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const loaded = await getMemberPortalProfile(getPool(), {
      userId: req.v5Session.session.userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
    });
    if (!loaded.ok || !loaded.profile) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const html = renderMemberView(
      "member/profile.ejs",
      shellLocals(req, res, "profile", {
        profile: loaded.profile,
        error: null,
        saved: String((req.query && req.query.saved) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/member/profile", rejectApex, requireMember, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }

    const tenant = resolveTenantForAuthorization(req);
    const body = req.body || {};
    const updateInput = {
      userId: req.v5Session.session.userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      preferredName: body.preferredName,
      phone: body.phone,
      emailDisplay: body.emailDisplay,
    };
    // Forward privileged form fields only when present so the service can reject them.
    for (const key of [
      "status",
      "membershipStatus",
      "firstName",
      "lastName",
      "emailNormalized",
      "email",
      "role",
      "roles",
    ]) {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        updateInput[key] = body[key];
      }
    }
    const updated = await updateMemberPortalProfile(getPool(), updateInput);

    if (!updated.ok) {
      if (updated.status === PORTAL_STATUS.INVALID_INPUT) {
        const loaded = await getMemberPortalProfile(getPool(), {
          userId: req.v5Session.session.userId,
          churchId: tenant.church.id,
          branchId: tenant.primaryBranch.id,
        });
        const html = renderMemberView(
          "member/profile.ejs",
          shellLocals(req, res, "profile", {
            profile: loaded.profile || {
              preferredName: String(body.preferredName || ""),
              emailDisplay: String(body.emailDisplay || ""),
              phoneDisplay: String(body.phone || ""),
              firstName: "",
              lastName: "",
              emailNormalized: "",
              phoneNormalized: null,
              membershipStatus: "active",
              isPrimaryBranch: true,
            },
            error: "Please check your profile details and try again.",
            saved: false,
          })
        );
        return res.status(400).type("html").send(html);
      }
      if (
        updated.status === PORTAL_STATUS.FORBIDDEN ||
        updated.status === PORTAL_STATUS.NO_MEMBERSHIP ||
        updated.status === PORTAL_STATUS.WRONG_BRANCH
      ) {
        return res.status(403).type("text").send("You do not have member access to this site.");
      }
      return res.status(503).type("text").send("Profile could not be saved.");
    }

    return res.redirect(303, "/member/profile?saved=1");
  });

  router.post("/member/logout", rejectApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.redirect(303, "/");
  });

  return router;
}

module.exports = {
  createMemberPortalRouter,
  PORTAL_MODULES,
};
