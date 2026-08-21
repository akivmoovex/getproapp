"use strict";

/**
 * Authenticated ActiveClinic application shell routes (AC-V6-10).
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  listSelectableFacilities,
  selectFacilityForSession,
} = require("../services/activeClinicFacilityContextService");
const {
  listEligibleActiveClinicOrganizations,
} = require("../services/activeClinicLoginEligibility");
const {
  loadActiveClinicDashboardHome,
} = require("../services/loadActiveClinicDashboardHome");
const {
  PRODUCT,
  evaluateOrganizationOnboarding,
  skipOnboardingStep,
  completeOrganizationOnboarding,
} = require("../../platform/onboarding");
const {
  createPlatformIdentitySession,
} = require("../../platform/session/createDeploymentSession");
const {
  setV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const {
  renderAccessStatePage,
  STATE,
} = require("./renderActiveClinicAccessState");


/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicAppRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  // Shared offline presentation (testable; not a fake outage injector)
  app.get("/app/offline", (req, res) => {
    const csrfToken = issuePageCsrf(res, req);
    return res
      .status(503)
      .type("html")
      .send(
        renderAccessStatePage({
          stateKey: STATE.OFFLINE,
          pageId: "offline",
          csrfField: CSRF_FIELD,
          csrfToken,
          primaryHref: "/app",
          primaryLabel: "Retry",
        })
      );
  });

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res, req);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: options.pageData || {},
    });
    // Sync selected facility onto auth for permission checks within same request pages
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function onboardingActor(auth) {
    return {
      permissions: (auth && auth.permissions) || [],
      userId: auth && auth.platformIdentity && auth.platformIdentity.id,
    };
  }

  function onboardingScope(auth, extra) {
    const deployment = getPlatformDeploymentCode(env);
    return {
      productCode: PRODUCT.ACTIVECLINIC,
      organizationId: auth && auth.organization && auth.organization.id,
      actor: onboardingActor(auth),
      deploymentCode: deployment && deployment.ok ? deployment.code : "",
      ...extra,
    };
  }

  app.get("/app/onboarding", requireAuth, requirePermission("activeclinic.access"), async (req, res, next) => {
    try {
      const evaluation = await evaluateOrganizationOnboarding(
        getPool(),
        onboardingScope(req.activeClinicAuth, { persist: true, markResumed: true })
      );
      if (!evaluation.ok || evaluation.canManage !== true) {
        return res.redirect(303, "/app");
      }
      return await renderShell(req, res, {
        activeNav: "home",
        content: "app/onboarding-content.ejs",
        pageHeader: {
          title: "Welcome to ActiveClinic",
          description: "Finish clinic setup. Required items come from live configuration, not a separate checklist.",
          actions: evaluation.onboardingRequired
            ? []
            : [{ href: "/app", label: "Go to dashboard", ghost: true }],
        },
        breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Setup" }],
        pageData: {
          onboarding: evaluation,
          viewerPermissions: (req.activeClinicAuth && req.activeClinicAuth.permissions) || [],
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/onboarding/skip", requireAuth, requirePermission("activeclinic.access"), async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/app/onboarding");
      }
      await skipOnboardingStep(
        getPool(),
        onboardingScope(req.activeClinicAuth, { stepKey: req.body && req.body.step_key })
      );
      return res.redirect(303, "/app/onboarding");
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/onboarding/continue", requireAuth, requirePermission("activeclinic.access"), async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/app/onboarding");
      }
      const evaluation = await evaluateOrganizationOnboarding(
        getPool(),
        onboardingScope(req.activeClinicAuth, { persist: true, markResumed: true })
      );
      const href =
        evaluation && evaluation.resumeStep && evaluation.resumeStep.destinationUrl
          ? evaluation.resumeStep.destinationUrl
          : "/app/onboarding";
      return res.redirect(303, href);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/onboarding/complete", requireAuth, requirePermission("activeclinic.access"), async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/app/onboarding");
      }
      const completed = await completeOrganizationOnboarding(
        getPool(),
        onboardingScope(req.activeClinicAuth)
      );
      if (!completed.ok) {
        return res.redirect(303, "/app/onboarding");
      }
      return res.redirect(303, "/app");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/app", requireAuth, requirePermission("activeclinic.access"), async (req, res, next) => {
    try {
      let gate = { ok: false };
      try {
        gate = await evaluateOrganizationOnboarding(
          getPool(),
          onboardingScope(req.activeClinicAuth, { persist: true })
        );
      } catch {
        gate = { ok: false };
      }
      if (gate.ok && gate.onboardingRequired === true) {
        return res.redirect(303, "/app/onboarding");
      }
      const csrfToken = issuePageCsrf(res, req);
      const shellBase = await buildActiveClinicShellViewModel(getPool(), {
        req,
        auth: req.activeClinicAuth,
        csrfToken,
        activeNav: "home",
        pageHeader: {
          title: "Home",
          description: "Infrastructure workspace for your healthcare organization.",
          actions: [],
        },
        breadcrumbs: [{ label: "Home" }],
      });
      if (shellBase.selectedFacility) {
        req.activeClinicAuth.selectedFacility = shellBase.selectedFacility;
      }
      const dashboard = await loadActiveClinicDashboardHome(getPool(), {
        auth: req.activeClinicAuth,
        shell: shellBase,
      });
      const actions = [];
      if (dashboard.quickActions && dashboard.quickActions[0]) {
        const first = dashboard.quickActions.find((a) => a.primary) || dashboard.quickActions[0];
        if (first && first.href) {
          actions.push({ label: first.label, href: first.href });
        }
      }
      shellBase.pageHeader.actions = actions;
      shellBase.pageData = { dashboard };
      const html = renderActiveClinicAppPage("app/home-content.ejs", shellBase);
      return res.status(200).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/app/select-facility", requireAuth, async (req, res, next) => {
    try {
      const listed = await listSelectableFacilities(getPool(), req.activeClinicAuth);
      return await renderShell(req, res, {
        activeNav: "home",
        content: "app/select-facility-content.ejs",
        pageHeader: {
          title: "Select facility",
          description: "Choose the facility context for your session.",
          actions: [],
        },
        breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Select facility" }],
        pageData: { facilities: listed.facilities || [] },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/select-facility", requireAuth, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).send("Forbidden");
      }
      const session = req.v5Session && req.v5Session.session;
      if (!session || !session.id) {
        return res.redirect(303, "/login");
      }
      const selected = await selectFacilityForSession(getPool(), {
        auth: req.activeClinicAuth,
        sessionId: session.id,
        facilityId: req.body && req.body.facility_id,
      });
      if (!selected.ok) {
        return res.redirect(303, "/app/select-facility");
      }
      issuePageCsrf(res, req);
      return res.redirect(303, "/app");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/app/select-organization", requireAuth, async (req, res, next) => {
    try {
      const listed = await listEligibleActiveClinicOrganizations(getPool(), {
        platformIdentityId: req.activeClinicAuth.platformIdentity.id,
      });
      const organizations = (listed.organizations || []).map((o) => ({
        organizationId: o.organization.id,
        displayName:
          (o.healthcareOrganization && o.healthcareOrganization.publicName) ||
          o.organization.displayName,
        staffDisplayName: o.staffMember && o.staffMember.displayName,
      }));
      return await renderShell(req, res, {
        activeNav: "home",
        content: "app/select-organization-content.ejs",
        pageHeader: {
          title: "Switch organization",
          description: "Choose an eligible healthcare organization.",
          actions: [],
        },
        breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Switch organization" }],
        pageData: { organizations },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.post("/app/select-organization", requireAuth, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).send("Forbidden");
      }
      const organizationId = String((req.body && req.body.organization_id) || "").trim();
      const deployment = getPlatformDeploymentCode(env);
      if (!deployment.ok || !organizationId) {
        return res.redirect(303, "/app/select-organization");
      }

      const listed = await listEligibleActiveClinicOrganizations(getPool(), {
        platformIdentityId: req.activeClinicAuth.platformIdentity.id,
      });
      const match = (listed.organizations || []).find(
        (o) => String(o.organization.id) === organizationId
      );
      if (!match) {
        return res.redirect(303, "/app/select-organization");
      }

      const rawToken = readV5SessionCookie(req, env);
      const identityId = req.activeClinicAuth.platformIdentity.id;
      const fresh = await createPlatformIdentitySession(getPool(), {
        deploymentCode: deployment.code,
        platformIdentityId: identityId,
        organizationId,
        ip: String(
          (req.headers && req.headers["x-forwarded-for"]) ||
            req.ip ||
            ""
        )
          .split(",")[0]
          .trim(),
        userAgent: req.headers["user-agent"] || null,
        contextJson: {},
      });
      if (!fresh.ok) {
        return res.redirect(303, "/app/select-organization");
      }
      if (rawToken) {
        try {
          await revokeV5Session(getPool(), {
            rawToken,
            deploymentCode: deployment.code,
          });
        } catch {
          /* new session already issued */
        }
      }
      setV5SessionCookie(res, fresh.rawToken, { secure: isProduction, env, req });
      issuePageCsrf(res, req);
      return res.redirect(303, "/app");
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicAppRoutes,
};
