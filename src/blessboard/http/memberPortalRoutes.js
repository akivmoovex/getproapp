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
const { listPublishedGivingMethods } = require("../services/publicContentReadService");
const { safeExternalUrl } = require("./tenantPublicSafe");
const {
  buildMemberShellLocals,
  PORTAL_MODULES,
  PORTAL_NAV,
  PORTAL_MOBILE_TABS,
} = require("./memberShellLocals");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

function givingMethodIcon(methodType) {
  const t = String(methodType || "").toLowerCase();
  if (t.includes("bank") || t.includes("transfer") || t.includes("wire")) {
    return "account_balance";
  }
  if (t.includes("mobile") || t.includes("momo") || t.includes("airtel") || t.includes("mtn")) {
    return "smartphone";
  }
  if (t.includes("person") || t.includes("cash") || t.includes("offering")) {
    return "volunteer_activism";
  }
  return "payments";
}

/**
 * Published giving methods for member info screen — no payment processing fields.
 * @param {object[]} items
 */
function mapMemberGivingMethods(items) {
  return (items || []).map((row) => ({
    methodType: row.methodType,
    label: row.label,
    instructions: row.instructions,
    externalUrl: safeExternalUrl(row.externalUrl),
    icon: givingMethodIcon(row.methodType),
  }));
}

/**
 * Presentation-only mapping of profile update reasons → field errors.
 * Does not change validation rules in memberPortalService.
 * @param {string|null|undefined} reason
 * @returns {{ fieldErrors: Record<string, string>, summaryItems: string[] }}
 */
function mapMemberProfileFieldErrors(reason) {
  const fieldErrors = {};
  const summaryItems = [];
  const code = String(reason || "").trim();
  if (!code) {
    return { fieldErrors, summaryItems };
  }
  if (code.startsWith("immutable:")) {
    summaryItems.push("That field cannot be changed from your member profile.");
    return { fieldErrors, summaryItems };
  }
  const messages = {
    preferred_name: "Enter a preferred name without special markup (max 100 characters).",
    email_display: "Enter a valid display email, or leave blank to use your sign-in email.",
    phone: "Enter a valid phone number, or leave it blank.",
    contact_required: "Keep at least one contact method: your sign-in email or a phone number.",
  };
  const msg = messages[code] || "Please check your profile details and try again.";
  if (code === "preferred_name") fieldErrors.preferredName = msg;
  else if (code === "email_display") fieldErrors.emailDisplay = msg;
  else if (code === "phone") fieldErrors.phone = msg;
  else if (code === "contact_required") {
    fieldErrors.phone = msg;
    fieldErrors.emailDisplay = msg;
  }
  summaryItems.push(msg);
  return { fieldErrors, summaryItems };
}

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
   * @param {string} activeNav
   * @param {object} [extra]
   */
  function shellLocals(req, res, activeNav, extra) {
    return buildMemberShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  router.get("/member", rejectApex, requireMember, (req, res) => {
    const html = renderMemberView("member/dashboard.ejs", shellLocals(req, res, "home"));
    return res.status(200).type("html").send(html);
  });

  router.get("/member/giving", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.primaryBranch) {
      return res.status(403).type("text").send("Forbidden");
    }
    const listed = await listPublishedGivingMethods(getPool(), {
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
    });
    const html = renderMemberView(
      "member/giving.ejs",
      shellLocals(req, res, "giving", {
        givingMethods: listed.ok ? mapMemberGivingMethods(listed.items) : [],
      })
    );
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
        fieldErrors: {},
        errorSummaryItems: [],
        saved: String((req.query && req.query.saved) || "") === "1",
        editMode: String((req.query && req.query.edit) || "") === "1",
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
        const mapped = mapMemberProfileFieldErrors(updated.reason);
        const html = renderMemberView(
          "member/profile.ejs",
          shellLocals(req, res, "profile", {
            profile: loaded.profile
              ? {
                  ...loaded.profile,
                  preferredName:
                    body.preferredName !== undefined
                      ? String(body.preferredName || "")
                      : loaded.profile.preferredName,
                  emailDisplay:
                    body.emailDisplay !== undefined
                      ? String(body.emailDisplay || "")
                      : loaded.profile.emailDisplay,
                  phoneDisplay:
                    body.phone !== undefined
                      ? String(body.phone || "")
                      : loaded.profile.phoneDisplay,
                }
              : {
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
            error: mapped.summaryItems[0] || "Please check your profile details and try again.",
            fieldErrors: mapped.fieldErrors,
            errorSummaryItems: mapped.summaryItems,
            saved: false,
            editMode: true,
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
  mapMemberProfileFieldErrors,
  PORTAL_MODULES,
  PORTAL_NAV,
  PORTAL_MOBILE_TABS,
};
