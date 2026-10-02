"use strict";

/**
 * Minimal BlessBoard V5 member portal shell + profile (tenant hosts only).
 * Access is membership-gated — admin roles alone never grant entry.
 */

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
  logoutAuthenticatedBrowserSession,
} = require("../../platform/session/sharedSessionSecurity");
const {
  getMemberPortalProfile,
  updateMemberPortalProfile,
  startMemberPhoneVerification,
  completeMemberPhoneVerification,
  STATUS: PORTAL_STATUS,
  MARITAL_STATUS,
} = require("../services/memberPortalService");
const {
  getMemberPortalJourneySummary,
} = require("../services/memberJourneyWorkflowService");
const { listPublishedGivingMethods } = require("../services/publicContentReadService");
const { mapGiving } = require("./loadTenantPublicPageModel");
const { listMemberAnnouncements } = require("../services/announcementsService");
const {
  listMemberEvents,
  listMemberMinistries,
} = require("../services/participationService");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  buildMemberShellLocals,
  PORTAL_MODULES,
  PORTAL_NAV,
  PORTAL_MOBILE_TABS,
} = require("./memberShellLocals");
const {
  resolveBlessBoardFormPhone,
  blessBoardPhoneFieldLocals,
} = require("../services/resolveBlessBoardFormPhone");
const { createRejectApex } = require("./rejectApex");

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
    listMemberAnnouncements(pool, {
      ...scope,
      limit: DASHBOARD_PREVIEW_LIMIT,
      offset: 0,
      includeAttachments: false,
    }),
    listMemberEvents(pool, {
      ...scope,
      includeRegistrationStats: false,
      upcomingOnly: true,
      limit: DASHBOARD_PREVIEW_LIMIT,
    }),
    listMemberMinistries(pool, scope),
  ]);

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
  if (t.includes("online") || t.includes("card") || t.includes("pay") || t.includes("link")) {
    return "link";
  }
  return "payments";
}

/**
 * Member-facing method type label — derived from published method_type only.
 * @param {string|null|undefined} methodType
 */
function givingMethodTypeLabel(methodType) {
  const t = String(methodType || "").toLowerCase();
  if (t.includes("bank") || t.includes("transfer") || t.includes("wire")) return "Bank transfer";
  if (t.includes("mobile") || t.includes("momo") || t.includes("airtel") || t.includes("mtn")) {
    return "Mobile money";
  }
  if (t.includes("cash") || t.includes("offering") || t.includes("person")) return "In person";
  if (t.includes("online") || t.includes("card") || t.includes("pay") || t.includes("link")) {
    return "External link";
  }
  return "Giving method";
}

/**
 * Published giving methods for member info screen — no payment processing fields.
 * Omits ids, church/branch UUIDs, and any admin-only metadata.
 * @param {object[]} items
 */
function mapMemberGivingMethods(items) {
  return (items || []).map((row) => {
    const mapped = mapGiving(row);
    return {
      methodType: mapped.methodType,
      typeLabel: givingMethodTypeLabel(mapped.methodType),
      label: mapped.label,
      description: mapped.description,
      accountDetails: mapped.accountDetails,
      instructions: mapped.instructions,
      externalUrl: mapped.externalUrl,
      buttonLabel: mapped.buttonLabel,
      qrImageUrl: mapped.qrImageUrl,
      icon: mapped.icon || givingMethodIcon(mapped.methodType),
    };
  });
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
    email_display: "Enter a valid email address.",
    email_in_use: "That email is already used by another account. Choose a different email.",
    phone: "Enter a valid phone number, or leave it blank.",
    contact_required: "Keep at least one contact method: email or phone.",
    validation: "Please check your profile details and try again.",
    no_pending_phone: "No phone change is waiting for verification.",
    otp_failed: "Verification failed. Check the code and try again.",
    rate_limited: "Too many attempts. Try again later.",
  };
  const msg = messages[code] || "Please check your profile details and try again.";
  if (code === "preferred_name") fieldErrors.preferredName = msg;
  else if (code === "email_display" || code === "email_in_use") fieldErrors.emailDisplay = msg;
  else if (code === "phone") fieldErrors.phone = msg;
  else if (code === "contact_required") {
    fieldErrors.phone = msg;
    fieldErrors.emailDisplay = msg;
  }
  summaryItems.push(msg);
  return { fieldErrors, summaryItems };
}

/**
 * Build domain update payload from member profile edit form.
 * @param {object} body
 * @param {{ e164: string|null, fields: object }} phoneResolved
 */
function buildSelfProfileUpdateFromBody(body, phoneResolved) {
  const b = body || {};
  const childrenRaw = b.number_of_children != null ? String(b.number_of_children).trim() : "";
  return {
    firstName: b.first_name,
    lastName: b.last_name,
    preferredName: b.preferred_name,
    dateOfBirth: b.date_of_birth || null,
    occupation: b.occupation,
    maritalStatus: b.marital_status || null,
    numberOfChildren: childrenRaw === "" ? null : Number(childrenRaw),
    address: {
      line1: b.address_line_1,
      line2: b.address_line_2,
      city: b.address_city,
      district: b.address_district,
      province: b.address_province,
      countryCode: b.address_country_code,
      postalCode: b.address_postal_code,
    },
    nextOfKin: {
      name: b.next_of_kin_name,
      relationship: b.next_of_kin_relationship,
      phone: b.next_of_kin_phone,
      phoneDisplay: b.next_of_kin_phone,
    },
    emailDisplay: b.email_display,
    phone: phoneResolved && phoneResolved.e164,
    phoneNormalized: phoneResolved && phoneResolved.e164,
    phoneDisplay:
      phoneResolved && phoneResolved.fields
        ? [phoneResolved.fields.phoneCountry, phoneResolved.fields.phoneNational]
            .filter(Boolean)
            .join(" ")
        : null,
  };
}

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderMemberView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
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

  const router = express.Router({ mergeParams: true });
  const requireMember = createRequireActiveMember({ getPool });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable:
      typeof sendUnavailable === "function"
        ? sendUnavailable
        : (req, res) => res.status(503).type("text").send("Unavailable"),
  });

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

  router.get("/member/journey", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const access = req.blessBoardMemberAccess;
    const summary = await getMemberPortalJourneySummary(getPool(), {
      churchId: tenant.church.id,
      memberId: access.member.id,
    });
    const html = renderMemberView(
      "member/journey.ejs",
      shellLocals(req, res, "journey", {
        journey: summary.ok ? summary.summary : { cellName: null, classes: [], departments: [] },
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
      branchDisplayName:
        tenant.primaryBranch.displayName || tenant.primaryBranch.name || null,
    });
    if (!loaded.ok || !loaded.profile) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    if (String((req.query && req.query.edit) || "") === "1") {
      return res.redirect(303, "/member/profile/edit");
    }
    const html = renderMemberView(
      "member/profile.ejs",
      shellLocals(req, res, "profile", {
        pageTitle: "My Profile",
        stitchScreen: "BB-M21",
        profile: loaded.profile,
        error: null,
        saved: String((req.query && req.query.saved) || "") === "1",
        phoneVerified: String((req.query && req.query.phone) || "") === "verified",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/member/profile/edit", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const loaded = await getMemberPortalProfile(getPool(), {
      userId: req.v5Session.session.userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      branchDisplayName:
        tenant.primaryBranch.displayName || tenant.primaryBranch.name || null,
    });
    if (!loaded.ok || !loaded.profile) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    const phoneLocals = blessBoardPhoneFieldLocals({
      env,
      e164Value: loaded.profile.phonePendingNormalized || loaded.profile.phoneNormalized,
    });
    const html = renderMemberView(
      "member/profile-edit.ejs",
      shellLocals(req, res, "profile", {
        pageTitle: "Edit My Profile",
        stitchScreen: "BB-M22",
        loadPhoneField: true,
        profile: loaded.profile,
        maritalOptions: MARITAL_STATUS,
        ...phoneLocals,
        error: null,
        fieldErrors: {},
        errorSummaryItems: [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/member/profile/edit", rejectApex, requireMember, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const tenant = resolveTenantForAuthorization(req);
    const body = req.body || {};
    const phoneResolved = resolveBlessBoardFormPhone(body, {
      required: false,
      env,
      allowLegacyPhone: false,
    });
    if (body.phone_national && String(body.phone_national).trim() && !phoneResolved.result.ok) {
      const loaded = await getMemberPortalProfile(getPool(), {
        userId: req.v5Session.session.userId,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
      });
      const phoneLocals = blessBoardPhoneFieldLocals({
        env,
        selectedCountry: phoneResolved.fields.phoneCountry,
        nationalValue: phoneResolved.fields.phoneNational,
      });
      const html = renderMemberView(
        "member/profile-edit.ejs",
        shellLocals(req, res, "profile", {
          pageTitle: "Edit My Profile",
          stitchScreen: "BB-M22",
          loadPhoneField: true,
          profile: loaded.profile || {},
          maritalOptions: MARITAL_STATUS,
          ...phoneLocals,
          error: "Enter a valid phone number, or leave it blank.",
          fieldErrors: { phone: "Enter a valid phone number, or leave it blank." },
          errorSummaryItems: ["Enter a valid phone number, or leave it blank."],
        })
      );
      return res.status(400).type("html").send(html);
    }

    const patch = buildSelfProfileUpdateFromBody(body, phoneResolved);
    const updated = await updateMemberPortalProfile(getPool(), {
      userId: req.v5Session.session.userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
      organizationId: tenant.organization && tenant.organization.id,
      ...patch,
    });

    if (!updated.ok) {
      if (
        updated.status === PORTAL_STATUS.INVALID_INPUT ||
        updated.status === PORTAL_STATUS.CONFLICT
      ) {
        const loaded = await getMemberPortalProfile(getPool(), {
          userId: req.v5Session.session.userId,
          churchId: tenant.church.id,
          branchId: tenant.primaryBranch.id,
        });
        const mapped = mapMemberProfileFieldErrors(updated.detail || updated.reason);
        const phoneLocals = blessBoardPhoneFieldLocals({
          env,
          selectedCountry: phoneResolved.fields.phoneCountry,
          nationalValue: phoneResolved.fields.phoneNational,
          e164Value: phoneResolved.e164,
        });
        const html = renderMemberView(
          "member/profile-edit.ejs",
          shellLocals(req, res, "profile", {
            pageTitle: "Edit My Profile",
            stitchScreen: "BB-M22",
            loadPhoneField: true,
            profile: Object.assign({}, loaded.profile || {}, patch),
            maritalOptions: MARITAL_STATUS,
            ...phoneLocals,
            error: mapped.summaryItems[0] || "Please check your profile details.",
            fieldErrors: mapped.fieldErrors,
            errorSummaryItems: mapped.summaryItems,
          })
        );
        return res.status(updated.status === PORTAL_STATUS.CONFLICT ? 409 : 400).type("html").send(html);
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

    if (updated.phoneVerificationRequired) {
      return res.redirect(303, "/member/profile/phone-verify?started=1");
    }
    return res.redirect(303, "/member/profile?saved=1");
  });

  router.post("/member/profile", rejectApex, requireMember, (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    // Legacy alias: do not 307-preserve POST (would bypass clear CSRF failure mode).
    return res.redirect(303, "/member/profile/edit");
  });

  router.get("/member/profile/phone-verify", rejectApex, requireMember, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const loaded = await getMemberPortalProfile(getPool(), {
      userId: req.v5Session.session.userId,
      churchId: tenant.church.id,
      branchId: tenant.primaryBranch.id,
    });
    if (!loaded.ok || !loaded.profile) {
      return res.status(403).type("text").send("You do not have member access to this site.");
    }
    if (!loaded.profile.phonePendingNormalized) {
      return res.redirect(303, "/member/profile/edit");
    }

    let challengeId = null;
    let testCode = null;
    let error = null;
    const shouldSend =
      String((req.query && req.query.started) || "") === "1" ||
      String((req.query && req.query.send) || "") === "1";
    if (shouldSend) {
      const started = await startMemberPhoneVerification(
        getPool(),
        {
          userId: req.v5Session.session.userId,
          churchId: tenant.church.id,
          branchId: tenant.primaryBranch.id,
          organizationId: tenant.organization && tenant.organization.id,
          requestIp: req.ip,
        },
        env
      );
      if (started.ok) {
        challengeId =
          started.challenge && (started.challenge.id || started.challenge.verificationId);
        testCode = started.testCode || null;
      } else {
        error =
          started.status === PORTAL_STATUS.RATE_LIMITED
            ? "Too many attempts. Try again later."
            : "Could not send a verification code. Try again.";
      }
    }

    const html = renderMemberView(
      "member/profile-phone-verify.ejs",
      shellLocals(req, res, "profile", {
        pageTitle: "Verify New Phone",
        stitchScreen: "BB-M23",
        profile: loaded.profile,
        challengeId,
        testCode,
        error,
        saved: false,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/member/profile/phone-verify", rejectApex, requireMember, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const tenant = resolveTenantForAuthorization(req);
    const body = req.body || {};

    if (String(body.action || "") === "resend") {
      return res.redirect(303, "/member/profile/phone-verify?send=1");
    }

    const completed = await completeMemberPhoneVerification(
      getPool(),
      {
        userId: req.v5Session.session.userId,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
        organizationId: tenant.organization && tenant.organization.id,
        verificationId: body.verification_id,
        code: body.code,
      },
      env
    );

    if (!completed.ok) {
      const loaded = await getMemberPortalProfile(getPool(), {
        userId: req.v5Session.session.userId,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch.id,
      });
      const html = renderMemberView(
        "member/profile-phone-verify.ejs",
        shellLocals(req, res, "profile", {
          pageTitle: "Verify New Phone",
          stitchScreen: "BB-M23",
          profile: loaded.profile || {},
          challengeId: body.verification_id || null,
          testCode: null,
          error:
            completed.status === PORTAL_STATUS.RATE_LIMITED
              ? "Too many attempts. Try again later."
              : "Verification failed. Check the code and try again.",
          saved: false,
        })
      );
      return res.status(400).type("html").send(html);
    }

    return res.redirect(303, "/member/profile?saved=1&phone=verified");
  });

  router.post("/member/logout", rejectApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    await logoutAuthenticatedBrowserSession(req, res, {
      env,
      isProduction,
      getPool,
    });
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
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
