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
const { listMemberAnnouncements } = require("../services/announcementsService");
const {
  listMemberEvents,
  listMemberMinistries,
} = require("../services/participationService");
const { safeExternalUrl } = require("./tenantPublicSafe");
const {
  buildMemberShellLocals,
  PORTAL_MODULES,
  PORTAL_NAV,
  PORTAL_MOBILE_TABS,
} = require("./memberShellLocals");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const DASHBOARD_PREVIEW_LIMIT = 3;

/**
 * Quick actions for the member dashboard — implemented routes only.
 * Prayer remains visible but disabled (no V5 route). Check-in / directory omitted.
 */
const DASHBOARD_QUICK_ACTIONS = Object.freeze([
  {
    key: "giving",
    label: "Giving",
    href: "/member/giving",
    icon: "volunteer_activism",
    enabled: true,
  },
  {
    key: "ministries",
    label: "Ministries",
    href: "/member/ministries",
    icon: "groups",
    enabled: true,
  },
  {
    key: "events",
    label: "Events",
    href: "/member/events",
    icon: "event_available",
    enabled: true,
  },
  {
    key: "prayer",
    label: "Prayer request",
    href: null,
    icon: "favorite",
    enabled: false,
  },
]);

/**
 * @param {unknown} value
 * @param {number} maxLen
 */
function excerptText(value, maxLen) {
  const raw = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1).trim()}…`;
}

/**
 * @param {unknown} value
 */
function formatDashDateParts(value) {
  if (!value) return null;
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return {
      day: String(d.getDate()),
      month: d.toLocaleDateString("en-GB", { month: "short" }),
      time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch (_err) {
    return null;
  }
}

/**
 * Soft-fail dashboard previews from existing member list services (no new query shapes).
 * @param {{ query: Function, connect?: Function }} pool
 * @param {{ churchId: string, branchId: string, memberId: string }} scope
 */
async function loadMemberDashboardPreviews(pool, scope) {
  const [announcementsListed, eventsListed, ministriesListed] = await Promise.all([
    listMemberAnnouncements(pool, { ...scope, limit: DASHBOARD_PREVIEW_LIMIT, offset: 0 }),
    listMemberEvents(pool, scope),
    listMemberMinistries(pool, scope),
  ]);

  const now = Date.now();
  const announcements = (announcementsListed.ok ? announcementsListed.items || [] : [])
    .slice(0, DASHBOARD_PREVIEW_LIMIT)
    .map((item) => ({
      id: item.id,
      title: item.title,
      excerpt: excerptText(item.body, 120),
      href: `/member/announcements/${item.id}`,
      isFeatured: Boolean(item.isFeatured),
    }));

  const events = (eventsListed.ok ? eventsListed.items || [] : [])
    .filter((item) => {
      if (!item || !item.startsAt) return false;
      const t = new Date(item.startsAt).getTime();
      return !Number.isNaN(t) && t >= now;
    })
    .slice(0, DASHBOARD_PREVIEW_LIMIT)
    .map((item) => {
      const when = formatDashDateParts(item.startsAt);
      return {
        id: item.id,
        title: item.title,
        summary: excerptText(item.summary, 100),
        href: `/member/events/${item.id}`,
        when,
        location: item.location ? String(item.location) : "",
      };
    });

  const ministries = (ministriesListed.ok ? ministriesListed.items || [] : [])
    .slice()
    .sort((a, b) => {
      const aActive = a && a.membership ? 0 : 1;
      const bActive = b && b.membership ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return String((a && a.name) || "").localeCompare(String((b && b.name) || ""));
    })
    .slice(0, DASHBOARD_PREVIEW_LIMIT)
    .map((item) => ({
      id: item.id,
      name: item.name,
      summary: excerptText(item.summary, 100),
      href: `/member/ministries/${item.id}`,
      isMember: Boolean(item.membership && item.membership.status === "active"),
      isPending: Boolean(item.membership && item.membership.status === "pending"),
    }));

  return { announcements, events, ministries };
}

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

  router.get("/member", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    let announcements = [];
    let events = [];
    let ministries = [];
    if (tenant && tenant.church && tenant.primaryBranch && access && access.member) {
      const previews = await loadMemberDashboardPreviews(getPool(), {
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        memberId: access.member.id,
      });
      announcements = previews.announcements;
      events = previews.events;
      ministries = previews.ministries;
    }
    const html = renderMemberView(
      "member/dashboard.ejs",
      shellLocals(req, res, "home", {
        quickActions: DASHBOARD_QUICK_ACTIONS,
        previewAnnouncements: announcements,
        previewEvents: events,
        previewMinistries: ministries,
      })
    );
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
