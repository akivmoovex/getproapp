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
const {
  issueAuthenticatedSessionCookie,
} = require("../../platform/session/sharedSessionSecurity");
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

  const router = express.Router();

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      return res.status(404).type("text").send("Not found.");
    }
    return next();
  }

  function csrfLocals(req, res) {
    const token = issueCsrfToken(req, res, env);
    setCsrfCookie(res, token, env);
    return { csrfToken: token, csrfField: CSRF_FIELD };
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
    const html = renderV5Ejs(`member-auth/${template}`, locals);
    return res.status(status || 200).type("html").send(html);
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
      activateHref: "/member/activate",
      forgotHref: "/member/forgot-password",
      lostChurchIdHref: "/member/forgot-password?lost=1",
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
          activateHref: "/member/activate",
          forgotHref: "/member/forgot-password",
          lostChurchIdHref: "/member/forgot-password?lost=1",
        },
        503
      );
    }

    const result = await authenticateMemberByChurchId(
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
      },
      {}
    );

    if (result.ok && result.session && result.rawToken) {
      const isProduction = String(env.NODE_ENV || "") === "production";
      await issueAuthenticatedSessionCookie(req, res, {
        rawToken: result.rawToken,
        env,
        isProduction,
        getPool,
      });
      return res.redirect(303, "/member");
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
        activateHref: "/member/activate",
        forgotHref: "/member/forgot-password",
        lostChurchIdHref: "/member/forgot-password?lost=1",
      },
      blocked ? 403 : 401
    );
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
      loginHref: "/member/login",
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
        loginHref: "/member/login",
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
        loginHref: "/member/login",
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
        loginHref: "/member/login",
        activateHref: "/member/activate",
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
      loginHref: "/member/login",
      lostHref: "/member/forgot-password?lost=1",
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
          loginHref: "/member/login",
          lostHref: "/member/forgot-password?lost=1",
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
        testCode: started.testCode || null,
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
      loginHref: "/member/login",
      lostHref: "/member/forgot-password?lost=1",
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
        loginHref: "/member/login",
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
          loginHref: "/member/login",
          activateHref: "/member/activate",
          retryHref: "/member/forgot-password",
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
        testCode: null,
      },
      400
    );
  });

  return router;
}

module.exports = {
  createMemberPortalAuthRouter,
};
