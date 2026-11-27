"use strict";

/**
 * V2.04 member portal auth routes (BB-M13–M19).
 * Tenant hosts only. Preserves /login for staff; member Church ID login is separate.
 */

const express = require("express");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const {
  issueAuthenticatedSessionCookie,
} = require("../../platform/session/sharedSessionSecurity");
const { setV5PrivateNoStore } = require("../../platform/http/v5PrivateNoStore");
const { establishBlessBoardSession } = require("../services/establishBlessBoardSession");
const {
  OTP_CODE_LENGTH,
  memberLoginOtpActive,
  resolveServerLoginBinding,
  readPendingLogin,
  writePendingCookie,
  clearPendingCookie,
  beginMemberLoginChallenge,
  completeMemberLoginChallenge,
  verificationMessage,
  maskDestination,
} = require("../services/blessBoardMemberLoginOtp");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  RESULT,
  NEUTRAL_VERIFY,
  NEUTRAL_LOGIN,
  NEUTRAL_RECOVERY,
  LOST_CHURCH_ID,
  getPasswordRuleLabels,
  verifyFirstTimeMembership,
  completeFirstTimeActivation,
  authenticateMemberByChurchId,
  beginMemberPasswordRecovery,
  completeMemberPasswordRecovery,
  lostChurchIdGuidance,
} = require("../services/blessBoardMemberPortalAuthService");
const {
  blessBoardPhoneFieldLocals,
  resolveBlessBoardFormPhone,
} = require("../services/resolveBlessBoardFormPhone");

function createMemberPortalAuthRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const authenticate =
    typeof deps.authenticateMemberByChurchId === "function"
      ? deps.authenticateMemberByChurchId
      : authenticateMemberByChurchId;
  const establishSession =
    typeof deps.establishBlessBoardSession === "function"
      ? deps.establishBlessBoardSession
      : establishBlessBoardSession;

  const router = express.Router({ mergeParams: true });

  // V8 / testing: product host is also churchHostDomain — allow session-scoped
  // tenant (dual-role) and unauthenticated path-mounted /c/:org/member/* flows.
  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    notFoundMessage: "Not found.",
  });

  function portalBase(req) {
    const base = String(req.baseUrl || "").replace(/\/+$/, "");
    return base.startsWith("/c/") ? base : "";
  }

  function memberHref(req, path) {
    const suffix = String(path || "").startsWith("/") ? String(path) : `/${path}`;
    return `${portalBase(req)}${suffix}`;
  }

  function csrfLocals(req, res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { env, req });
    return { csrfToken: token, csrfField: CSRF_FIELD, portalBase: portalBase(req) };
  }

  function tenantScope(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.organization) {
      res.status(403).type("text").send("Church context is required.");
      return null;
    }
    return {
      tenant,
      churchId: tenant.church.id,
      organizationId: tenant.organization.id,
      churchName:
        (tenant.church.displayName || tenant.church.name || "Church").toString(),
    };
  }

  function authPage(res, template, locals, status) {
    setV5PrivateNoStore(res);
    const html = renderV5Ejs(`member-auth/${template}`, locals);
    return res.status(status || 200).type("html").send(html);
  }

  function verifyPage(req, res, pending, error, reason, status) {
    return authPage(
      res,
      "verify.ejs",
      {
        ...csrfLocals(req, res),
        pageTitle: "Verification code",
        stitchScreen: "BB-M13-OTP",
        churchName: pending.churchName || "",
        error,
        reason: reason || "",
        errorState: reason || null,
        codeLength: OTP_CODE_LENGTH,
        attemptId: pending.attemptId,
        maskedDestination: maskDestination(pending.destination),
      },
      status || (error ? 401 : 200)
    );
  }

  function validateCsrfPost(req, res) {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      res.status(403).type("text").send("Invalid security token. Refresh and try again.");
      return false;
    }
    return true;
  }

  // —— M13 Member Login ——
  router.get("/member/login", rejectApex, (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    return authPage(res, "login.ejs", {
      ...csrfLocals(req, res),
      pageTitle: "Member Login",
      stitchScreen: "BB-M13",
      churchName: scope.churchName,
      error: null,
      memberNumberValue: "",
      activateHref: memberHref(req, "/member/activate"),
      forgotHref: memberHref(req, "/member/forgot-password"),
      lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
    });
  });

  router.post("/member/login", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const deployment = getPlatformDeploymentCode(env);
    if (!deployment.ok) {
      return authPage(
        res,
        "login.ejs",
        {
          ...csrfLocals(req, res),
          pageTitle: "Member Login",
          stitchScreen: "BB-M13",
          churchName: scope.churchName,
          error: "Sign-in is temporarily unavailable.",
          memberNumberValue: (req.body && req.body.member_number) || "",
          activateHref: memberHref(req, "/member/activate"),
          forgotHref: memberHref(req, "/member/forgot-password"),
          lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
        },
        503
      );
    }

    const otpActive = memberLoginOtpActive(env);
    const result = await authenticate(
      getPool(),
      {
        churchId: scope.churchId,
        organizationId: scope.organizationId,
        memberNumber: req.body && (req.body.member_number || req.body.church_id),
        password: req.body && req.body.password,
        deploymentCode: deployment.code,
        requestIp: req.ip,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        establishSession: !otpActive,
      },
      {}
    );

    if (result.ok && otpActive && result.sessionDeferred) {
      const binding = resolveServerLoginBinding({
        organizationId: scope.organizationId,
        accountId: result.accountId,
        churchId: scope.churchId,
        memberId: result.memberId,
        verifiedEmail: result.verifiedEmail,
      });
      if (!binding.ok) {
        return authPage(
          res,
          "login.ejs",
          {
            ...csrfLocals(req, res),
            pageTitle: "Member Login",
            stitchScreen: "BB-M13",
            churchName: scope.churchName,
            error: "Sign-in is temporarily unavailable.",
            errorState: "otp_unavailable",
            memberNumberValue: (req.body && req.body.member_number) || "",
            activateHref: memberHref(req, "/member/activate"),
            forgotHref: memberHref(req, "/member/forgot-password"),
            lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
          },
          503
        );
      }
      const started = await beginMemberLoginChallenge(binding, env, deps.otpService);
      if (started.sessionAllowed || started.sessionComplete || !started.attemptId || started.deliveryAccepted !== true) {
        return authPage(
          res,
          "login.ejs",
          {
            ...csrfLocals(req, res),
            pageTitle: "Member Login",
            stitchScreen: "BB-M13",
            churchName: scope.churchName,
            error: verificationMessage(started.reason || "delivery_not_activated"),
            errorState: "otp_unavailable",
            memberNumberValue: (req.body && req.body.member_number) || "",
            activateHref: memberHref(req, "/member/activate"),
            forgotHref: memberHref(req, "/member/forgot-password"),
            lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
          },
          503
        );
      }
      const sealed = writePendingCookie(
        res,
        {
          ...binding,
          attemptId: started.attemptId,
          churchName: scope.churchName,
          deliveryAccepted: true,
        },
        env
      );
      if (!sealed) {
        return authPage(
          res,
          "login.ejs",
          {
            ...csrfLocals(req, res),
            pageTitle: "Member Login",
            stitchScreen: "BB-M13",
            churchName: scope.churchName,
            error: "Sign-in is temporarily unavailable.",
            errorState: "otp_unavailable",
            memberNumberValue: (req.body && req.body.member_number) || "",
            activateHref: memberHref(req, "/member/activate"),
            forgotHref: memberHref(req, "/member/forgot-password"),
            lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
          },
          503
        );
      }
      return verifyPage(req, res, { ...binding, attemptId: started.attemptId }, null, null, 200);
    }

    if (result.ok && result.session && result.rawToken) {
      const isProduction = String(env.NODE_ENV || "") === "production";
      const issued = await issueAuthenticatedSessionCookie(req, res, {
        rawToken: result.rawToken,
        env,
        isProduction,
        getPool,
        otpWorkflow: "blessboard.member_login",
        organizationId: scope.organizationId,
        accountId: result.accountId,
        otpIdentifier: result.verifiedEmail,
        accountResolved: true,
      });
      if (!issued.ok) {
        return authPage(
          res,
          "login.ejs",
          {
            ...csrfLocals(req, res),
            pageTitle: "Member Login",
            stitchScreen: "BB-M13",
            churchName: scope.churchName,
            error: "Sign-in is temporarily unavailable.",
            errorState: "otp_unavailable",
            memberNumberValue: (req.body && req.body.member_number) || "",
            activateHref: memberHref(req, "/member/activate"),
            forgotHref: memberHref(req, "/member/forgot-password"),
            lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
          },
          503
        );
      }
      return res.redirect(303, memberHref(req, "/member"));
    }

    const blocked = result.code === RESULT.PORTAL_BLOCKED;
    return authPage(
      res,
      "login.ejs",
      {
        ...csrfLocals(req, res),
        pageTitle: "Member Login",
        stitchScreen: "BB-M13",
        churchName: scope.churchName,
        error: result.message || NEUTRAL_LOGIN,
        errorState: blocked ? "portal_blocked" : "invalid_credentials",
        memberNumberValue: (req.body && req.body.member_number) || "",
        activateHref: memberHref(req, "/member/activate"),
        forgotHref: memberHref(req, "/member/forgot-password"),
        lostChurchIdHref: memberHref(req, "/member/forgot-password?lost=1"),
      },
      blocked ? 403 : 401
    );
  });

  router.get("/member/login/verify", rejectApex, (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    const pending = readPendingLogin(req, env);
    if (!pending || pending.organizationId !== scope.organizationId || pending.churchId !== scope.churchId) {
      clearPendingCookie(res);
      return res.redirect(303, memberHref(req, "/member/login"));
    }
    return verifyPage(req, res, pending, null, null, 200);
  });

  router.post("/member/login/verify", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const pending = readPendingLogin(req, env);
    if (!pending || pending.organizationId !== scope.organizationId || pending.churchId !== scope.churchId) {
      clearPendingCookie(res);
      return res.redirect(303, memberHref(req, "/member/login"));
    }
    if (pending.deliveryAccepted !== true) {
      clearPendingCookie(res);
      return verifyPage(req, res, pending, verificationMessage("delivery_not_activated"), "delivery_not_activated", 503);
    }
    const completed = await completeMemberLoginChallenge(
      pending,
      req.body && req.body.otp_code,
      env,
      deps.otpService
    );
    if (!completed.sessionComplete) {
      if (completed.reason === "expired" || completed.reason === "exhausted" || completed.reason === "replay") {
        clearPendingCookie(res);
      }
      return verifyPage(req, res, pending, verificationMessage(completed.reason), completed.reason);
    }
    const deployment = getPlatformDeploymentCode(env);
    const established = deployment.ok
      ? await establishSession(getPool(), {
          userId: pending.accountId,
          deploymentCode: deployment.code,
          requireOrganizationId: pending.organizationId,
          ip: req.ip,
          userAgent: req.get("user-agent"),
        })
      : { ok: false };
    if (!established || !established.ok || !established.rawToken) {
      clearPendingCookie(res);
      return verifyPage(req, res, pending, "Sign-in is temporarily unavailable.", "session_unavailable", 503);
    }
    clearPendingCookie(res);
    const issued = await issueAuthenticatedSessionCookie(req, res, {
      rawToken: established.rawToken,
      env,
      isProduction: String(env.NODE_ENV || "") === "production",
      getPool,
      otpWorkflow: "blessboard.member_login",
      protectedActionCompleted: true,
    });
    if (!issued.ok) {
      return verifyPage(req, res, pending, "Sign-in is temporarily unavailable.", "session_unavailable", 503);
    }
    return res.redirect(303, memberHref(req, "/member"));
  });

  router.post("/member/login/verify/resend", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const pending = readPendingLogin(req, env);
    if (!pending || pending.organizationId !== scope.organizationId || pending.churchId !== scope.churchId) {
      clearPendingCookie(res);
      return res.redirect(303, memberHref(req, "/member/login"));
    }
    const started = await beginMemberLoginChallenge(pending, env, deps.otpService);
    if (!started.attemptId || started.deliveryAccepted !== true || started.sessionAllowed) {
      return verifyPage(
        req,
        res,
        pending,
        verificationMessage(started.reason || "delivery_not_activated"),
        started.reason || "delivery_not_activated",
        503
      );
    }
    writePendingCookie(res, { ...pending, attemptId: started.attemptId, deliveryAccepted: true }, env);
    return verifyPage(req, res, pending, null, null, 200);
  });

  // —— M14 First-Time Verification ——
  router.get("/member/activate", rejectApex, (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    return authPage(res, "activate.ejs", {
      ...csrfLocals(req, res),
      ...blessBoardPhoneFieldLocals({}),
      pageTitle: "First-Time Verification",
      stitchScreen: "BB-M14",
      churchName: scope.churchName,
      error: null,
      values: {},
      loginHref: memberHref(req, "/member/login"),
    });
  });

  router.post("/member/activate", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const body = req.body || {};
    const phoneResolved = resolveBlessBoardFormPhone(body, {
      defaultCountry: body.phone_country || "ZM",
      required: true,
      allowLegacyPhone: true,
      env,
    });
    const phone =
      phoneResolved.e164 ||
      body.phone_e164 ||
      body.phone ||
      [body.phone_country, body.phone_national].filter(Boolean).join(" ");

    const verified = await verifyFirstTimeMembership(getPool(), {
      churchId: scope.churchId,
      organizationId: scope.organizationId,
      memberNumber: body.member_number || body.church_id,
      fullName: body.full_name,
      phone,
      phoneNormalized: phoneResolved.e164 || null,
      phoneCountry: body.phone_country || "ZM",
      email: body.email,
      requestIp: req.ip,
      env,
    });

    if (verified.ok) {
      return authPage(res, "create-password.ejs", {
        ...csrfLocals(req, res),
        pageTitle: "Create Password",
        stitchScreen: "BB-M15",
        churchName: scope.churchName,
        draftToken: verified.draftToken,
        memberHint: verified.memberHint,
        passwordRules: getPasswordRuleLabels(),
        error: null,
      });
    }

    return authPage(
      res,
      "activate.ejs",
      {
        ...csrfLocals(req, res),
        ...blessBoardPhoneFieldLocals({
          selectedCountry: body.phone_country,
          nationalValue: body.phone_national,
        }),
        pageTitle: "First-Time Verification",
        stitchScreen: "BB-M14",
        churchName: scope.churchName,
        error: verified.message || NEUTRAL_VERIFY,
        errorState: verified.code,
        values: {
          memberNumber: body.member_number,
          fullName: body.full_name,
          email: body.email,
        },
        loginHref: memberHref(req, "/member/login"),
      },
      verified.code === RESULT.RATE_LIMITED ? 429 : 400
    );
  });

  // —— M15 Create Password ——
  router.post("/member/activate/password", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const body = req.body || {};
    const completed = await completeFirstTimeActivation(
      getPool(),
      {
        churchId: scope.churchId,
        draftToken: body.draft_token,
        password: body.password,
        passwordConfirm: body.password_confirm,
        env,
      },
      {}
    );

    if (completed.ok) {
      return authPage(res, "activated.ejs", {
        ...csrfLocals(req, res),
        pageTitle: "Portal Activated",
        stitchScreen: "BB-M16",
        churchName: scope.churchName,
        memberNumber: completed.memberNumber,
        loginHref: memberHref(req, "/member/login"),
      });
    }

    return authPage(
      res,
      "create-password.ejs",
      {
        ...csrfLocals(req, res),
        pageTitle: "Create Password",
        stitchScreen: "BB-M15",
        churchName: scope.churchName,
        draftToken: body.draft_token,
        memberHint: null,
        passwordRules: getPasswordRuleLabels(),
        error: completed.message || "Unable to activate portal.",
      },
      400
    );
  });

  // —— M17 Forgot Password ——
  router.get("/member/forgot-password", rejectApex, (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    const lost = String((req.query && req.query.lost) || "") === "1";
    if (lost) {
      const guidance = lostChurchIdGuidance();
      return authPage(res, "recovery-failure.ejs", {
        ...csrfLocals(req, res),
        pageTitle: "Church ID Recovery",
        stitchScreen: "BB-M19",
        churchName: scope.churchName,
        title: "Lost Church ID",
        message: guidance.message || LOST_CHURCH_ID,
        loginHref: memberHref(req, "/member/login"),
        activateHref: memberHref(req, "/member/activate"),
      });
    }
    return authPage(res, "forgot-password.ejs", {
      ...csrfLocals(req, res),
      pageTitle: "Forgot Password",
      stitchScreen: "BB-M17",
      churchName: scope.churchName,
      error: null,
      message: null,
      memberNumberValue: "",
      loginHref: memberHref(req, "/member/login"),
      lostHref: memberHref(req, "/member/forgot-password?lost=1"),
    });
  });

  router.post("/member/forgot-password", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const started = await beginMemberPasswordRecovery(
      getPool(),
      {
        churchId: scope.churchId,
        organizationId: scope.organizationId,
        memberNumber: req.body && (req.body.member_number || req.body.church_id),
        requestIp: req.ip,
      },
      env
    );

    if (!started.ok && started.code === RESULT.RATE_LIMITED) {
      return authPage(
        res,
        "forgot-password.ejs",
        {
          ...csrfLocals(req, res),
          pageTitle: "Forgot Password",
          stitchScreen: "BB-M17",
          churchName: scope.churchName,
          error: started.message,
          message: null,
          memberNumberValue: (req.body && req.body.member_number) || "",
          loginHref: memberHref(req, "/member/login"),
          lostHref: memberHref(req, "/member/forgot-password?lost=1"),
        },
        429
      );
    }

    if (started.draftToken) {
      return authPage(res, "recovery-verify.ejs", {
        ...csrfLocals(req, res),
        pageTitle: "Recovery Verification",
        stitchScreen: "BB-M18",
        churchName: scope.churchName,
        draftToken: started.draftToken,
        verificationId:
          started.challenge && (started.challenge.id || started.challenge.verificationId),
        passwordRules: getPasswordRuleLabels(),
        error: null,
        message: started.message || NEUTRAL_RECOVERY,
      });
    }

    return authPage(res, "forgot-password.ejs", {
      ...csrfLocals(req, res),
      pageTitle: "Forgot Password",
      stitchScreen: "BB-M17",
      churchName: scope.churchName,
      error: null,
      message: started.message || NEUTRAL_RECOVERY,
      memberNumberValue: (req.body && req.body.member_number) || "",
      loginHref: memberHref(req, "/member/login"),
      lostHref: memberHref(req, "/member/forgot-password?lost=1"),
    });
  });

  // —— M18 Recovery Verification ——
  router.post("/member/forgot-password/verify", rejectApex, async (req, res) => {
    const scope = tenantScope(req, res);
    if (!scope) return;
    if (!validateCsrfPost(req, res)) return;
    const body = req.body || {};
    const completed = await completeMemberPasswordRecovery(
      getPool(),
      {
        churchId: scope.churchId,
        draftToken: body.draft_token,
        verificationId: body.verification_id,
        code: body.code,
        password: body.password,
        passwordConfirm: body.password_confirm,
      },
      env
    );

    if (completed.ok) {
      return authPage(res, "activated.ejs", {
        ...csrfLocals(req, res),
        pageTitle: "Password Updated",
        stitchScreen: "BB-M16",
        churchName: scope.churchName,
        memberNumber: completed.memberNumber,
        loginHref: memberHref(req, "/member/login"),
        successTitle: "Password updated",
        successBody: "Sign in with your Church ID and new password.",
      });
    }

    if (completed.code === RESULT.OTP_FAILED || completed.code === RESULT.INVALID_DRAFT) {
      return authPage(
        res,
        "recovery-failure.ejs",
        {
          ...csrfLocals(req, res),
          pageTitle: "Recovery Failure",
          stitchScreen: "BB-M19",
          churchName: scope.churchName,
          title: "Recovery unsuccessful",
          message:
            completed.message ||
            "We could not complete password recovery. Contact your church administration if you need help.",
          loginHref: memberHref(req, "/member/login"),
          activateHref: memberHref(req, "/member/activate"),
          retryHref: memberHref(req, "/member/forgot-password"),
        },
        400
      );
    }

    return authPage(
      res,
      "recovery-verify.ejs",
      {
        ...csrfLocals(req, res),
        pageTitle: "Recovery Verification",
        stitchScreen: "BB-M18",
        churchName: scope.churchName,
        draftToken: body.draft_token,
        verificationId: body.verification_id,
        passwordRules: getPasswordRuleLabels(),
        error: completed.message || "Unable to reset password.",
        message: null,
      },
      400
    );
  });

  return router;
}

module.exports = {
  createMemberPortalAuthRouter,
};
