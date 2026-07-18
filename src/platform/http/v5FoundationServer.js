"use strict";

/**
 * Minimal Express app for BlessBoard V5 foundation + apex/tenant authentication
 * + feature-flagged tenant-host landing (BLESSBOARD_TENANT_ROUTING_MODE).
 * No legacy public tables, connect-pg-simple, or Domain=.blessboard.org cookies.
 */

const path = require("path");
const express = require("express");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { getPgPool } = require("../../db/pg");
const { resolveHostname } = require("../host");
const { createLoadPlatformHostContext } = require("./loadPlatformHostContext");
const {
  createLoadBlessBoardCatalogueContext,
} = require("../../blessboard/http/loadBlessBoardCatalogueContext");
const {
  createBlessBoardTenantRoutingDecision,
} = require("../../blessboard/http/loadBlessBoardTenantRouting");
const {
  createLoadBlessBoardAuthorizationContext,
} = require("../../blessboard/http/loadBlessBoardAuthorizationContext");
const {
  createRequireBlessBoardTenantRole,
  renderTenantAccessCheckPage,
} = require("../../blessboard/http/requireBlessBoardTenantRole");
const { createBranchAdminRouter } = require("../../blessboard/http/branchAdminRoutes");
const { createBranchRegistrationAdminRouter } = require("../../blessboard/http/branchRegistrationAdminRoutes");
const { createHqMembersAdminRouter } = require("../../blessboard/http/hqMembersAdminRoutes");
const { createHqAdminRouter } = require("../../blessboard/http/hqAdminRoutes");
const { createContentAdminRouter } = require("../../blessboard/http/contentAdminRoutes");
const { createPublicMediaRouter } = require("../../blessboard/http/publicMediaRoutes");
const { createMediaUploadService } = require("../../blessboard/media/mediaUploadService");
const { createTenantRegistrationRouter } = require("../../blessboard/http/tenantRegistrationRoutes");
const { createMemberPortalRouter } = require("../../blessboard/http/memberPortalRoutes");
const { createAnnouncementAdminRouter } = require("../../blessboard/http/announcementAdminRoutes");
const { createAnnouncementMemberRouter } = require("../../blessboard/http/announcementMemberRoutes");
const { createParticipationMemberRouter } = require("../../blessboard/http/participationMemberRoutes");
const { createParticipationAdminRouter } = require("../../blessboard/http/participationAdminRoutes");
const { createAttendanceAdminRouter } = require("../../blessboard/http/attendanceAdminRoutes");
const { createGivingAdminRouter } = require("../../blessboard/http/givingAdminRoutes");
const { createFormsRequestsAdminRouter } = require("../../blessboard/http/formsRequestsAdminRoutes");
const { createFormsRequestsMemberRouter } = require("../../blessboard/http/formsRequestsMemberRoutes");
const { createHqReportsRouter } = require("../../blessboard/http/hqReportsRoutes");
const { createTenantPublicRouter } = require("../../blessboard/http/tenantPublicRoutes");
const { createApexMarketingRouter } = require("../../blessboard/http/apexMarketingRoutes");
const { createPlatformAdminRouter } = require("./platformAdminRoutes");
const { createLoadV5Session } = require("./loadV5Session");
const {
  getPlatformHostContextMode,
  MODE_DIAGNOSTIC,
} = require("../config/platformHostContextMode");
const {
  getPlatformDeploymentCode,
  warnOnceIfDiagnosticDeploymentUnavailable,
} = require("../config/platformDeploymentCode");
const { logV5FoundationModeActive } = require("../config/v5FoundationMode");
const {
  getBlessBoardTenantRoutingMode,
  MODE_OFF,
  MODE_SHADOW,
  MODE_AUTHORITATIVE,
} = require("../../blessboard/config/tenantRoutingMode");
const { OUTCOME } = require("../../blessboard/http/evaluateTenantRoute");
const {
  renderFoundationHome,
  renderLoginPage,
  renderAuthErrorPage,
  renderAccountPage,
  renderControlledErrorPage,
} = require("../../blessboard/http/renderTenantLandingPage");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("./v5Csrf");
const {
  setV5SessionCookie,
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../session/v5SessionCookie");
const { revokeV5Session } = require("../session/revokeV5Session");
const { authenticateBlessBoardUser } = require("../../blessboard/services/authenticateBlessBoardUser");
const {
  listActiveRolesForUser,
} = require("../../blessboard/repositories/blessBoardAuthRepository");
const {
  resolveTenantForLogin,
  safeTenantNextPath,
  getApexOrigin,
  tenantAbsoluteUrl,
  redactAuthTransferQuery,
} = require("../../blessboard/http/tenantLoginHelpers");
const {
  createTenantLoginTransferRequest,
  loadAuthTransferByRawToken,
  issueTenantLoginRedeemCode,
  redeemTenantLoginTransfer,
  tenantFromTransfer,
  STATUS: TRANSFER_STATUS,
} = require("../services/authTransferService");
const { sha256Hex } = require("../session/sessionToken");

const UNAVAILABLE_STATUS = 503;
const UNAVAILABLE_MESSAGE =
  "BlessBoard V5 foundation mode: this surface is not available yet. Tenant portals and legacy routes have not been migrated.";

const APEX_HOSTS = new Set(["blessboard.org", "www.blessboard.org"]);

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function sendUnavailable(req, res) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (wantsHtml) {
    return res.status(UNAVAILABLE_STATUS).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Unavailable</title></head>
<body><p>${UNAVAILABLE_MESSAGE}</p></body></html>`);
  }
  return res.status(UNAVAILABLE_STATUS).type("text").send(UNAVAILABLE_MESSAGE);
}

/**
 * @param {string} p
 */
function isUnavailableAppPath(p) {
  const pathOnly = String(p || "").split("?")[0] || "/";
  if (pathOnly === "/getpro-admin") return true;
  // V5 platform-admin shell is registered explicitly; other legacy /admin* stay blocked.
  if (pathOnly === "/admin" || pathOnly.startsWith("/admin/")) return false;
  // V5 member portal is registered explicitly; other /member* legacy paths stay blocked.
  if (pathOnly === "/member" || pathOnly.startsWith("/member/")) return false;
  // V5 HQ shell is registered explicitly; legacy /hq-admin and other /hq* remain blocked.
  if (pathOnly === "/hq" || pathOnly.startsWith("/hq/")) return false;
  if (pathOnly.startsWith("/hq-admin")) return true;
  // V5 branch-admin shell is registered explicitly; only other /branch* legacy paths are blocked here.
  if (pathOnly === "/branch-admin" || pathOnly.startsWith("/branch-admin/")) return false;
  if (pathOnly === "/auth/callback") return false;
  if (pathOnly.startsWith("/branch")) return true;
  if (pathOnly.startsWith("/client") || pathOnly.startsWith("/company") || pathOnly.startsWith("/provider")) {
    return true;
  }
  if (pathOnly.startsWith("/field-agent") || pathOnly.startsWith("/api")) return true;
  if (
    pathOnly.startsWith("/global") ||
    pathOnly.startsWith("/demo") ||
    pathOnly.startsWith("/il") ||
    pathOnly.startsWith("/zm") ||
    pathOnly.startsWith("/bw") ||
    pathOnly.startsWith("/zw") ||
    pathOnly.startsWith("/za") ||
    pathOnly.startsWith("/na")
  ) {
    return true;
  }
  if (pathOnly.startsWith("/church")) return true;
  return false;
}

/**
 * @param {import('express').Request} req
 */
function parseCookies(req) {
  if (req.cookies && typeof req.cookies === "object") return;
  req.cookies = {};
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  if (!header) return;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      req.cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      req.cookies[key] = part.slice(idx + 1).trim();
    }
  }
}

/**
 * @param {import('express').Request} req
 * @param {{ apexHosts?: Set<string> }} [opts]
 */
function isApexHost(req, opts) {
  const hosts = (opts && opts.apexHosts) || APEX_HOSTS;
  const host = String(resolveHostname(req) || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (hosts.has(host)) return true;
  // Local/test apex aliases
  if (host === "localhost" || host === "127.0.0.1") return true;
  return false;
}

/**
 * @param {import('express').Request} req
 */
function clientIp(req) {
  const xf = req.headers && req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return String((req.socket && req.socket.remoteAddress) || req.ip || "");
}

/**
 * @param {{
 *   getPool?: () => { query: Function },
 *   enableDiagnosticHostContext?: boolean,
 *   apexHosts?: Set<string>,
 *   env?: NodeJS.ProcessEnv,
 *   log?: (line: string) => void,
 * }} [options]
 */
function createV5FoundationApp(options) {
  const opts = options || {};
  const getPool = typeof opts.getPool === "function" ? opts.getPool : getPgPool;
  const env = opts.env || process.env;
  const tenantRoutingMode = getBlessBoardTenantRoutingMode(env);
  const hostContextMode = getPlatformHostContextMode(env);
  // Shadow/authoritative always need platform + catalogue resolution.
  // enableDiagnosticHostContext forces loaders on; it cannot force them off when routing needs them.
  const enableHostResolution =
    hostContextMode === MODE_DIAGNOSTIC ||
    tenantRoutingMode === MODE_SHADOW ||
    tenantRoutingMode === MODE_AUTHORITATIVE ||
    Boolean(opts.enableDiagnosticHostContext);

  const app = express();
  const isProduction = String(env.NODE_ENV || "") === "production";

  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "0" || env.TRUST_PROXY === "false") {
    app.set("trust proxy", false);
  } else if (env.TRUST_PROXY) {
    const n = Number(env.TRUST_PROXY);
    app.set("trust proxy", Number.isFinite(n) && n >= 0 ? n : 1);
  } else {
    app.set("trust proxy", 1);
  }

  morgan.token("url-redacted", (req) => redactAuthTransferQuery(req.originalUrl || req.url || ""));
  if (isProduction) {
    app.use(
      morgan(":method :url-redacted :status :res[content-length] - :response-time ms", {
        skip: (req) => req.path === "/healthz",
      })
    );
  } else {
    app.use(morgan(":method :url-redacted :status :res[content-length] - :response-time ms"));
  }

  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    parseCookies(req);
    next();
  });

  const publicDir = path.join(__dirname, "..", "..", "..", "public");
  app.use(
    express.static(publicDir, {
      maxAge: isProduction ? "1d" : 0,
      immutable: false,
    })
  );

  // 1–2. Platform host + BlessBoard catalogue (diagnostic and/or tenant routing)
  if (enableHostResolution) {
    const platformDeploymentIdentity = getPlatformDeploymentCode(env);
    warnOnceIfDiagnosticDeploymentUnavailable(MODE_DIAGNOSTIC, platformDeploymentIdentity);
    app.use(
      createLoadPlatformHostContext({
        getPool,
        // Tenant shadow/authoritative need resolution even if PLATFORM_HOST_CONTEXT_MODE=off.
        getMode: () => MODE_DIAGNOSTIC,
        getDeploymentIdentity: () => getPlatformDeploymentCode(env),
      })
    );
    app.use(createLoadBlessBoardCatalogueContext({ getPool }));
  }

  // 3. Tenant-routing decision (attach + shadow/authoritative logs; no response)
  app.use(
    createBlessBoardTenantRoutingDecision({
      getMode: () => getBlessBoardTenantRoutingMode(env),
      isApexHost: (req) => isApexHost(req, opts),
      log: opts.log,
    })
  );

  // 4. V5 session loader
  app.use(
    createLoadV5Session({
      getPool,
      getDeploymentCode: () => getPlatformDeploymentCode(env),
    })
  );

  // 5. Tenant authorization context (attach only; never blocks public routes)
  app.use(
    createLoadBlessBoardAuthorizationContext({
      getPool,
    })
  );

  const requireTenantAccess = createRequireBlessBoardTenantRole({ getPool });
  const mediaService =
    opts.mediaService ||
    createMediaUploadService(env, opts.mediaStorageOverrides || {});

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const email = String((req.body && req.body.email) || "")
        .trim()
        .toLowerCase();
      const ip = clientIp(req);
      return sha256Hex(`${email}|${ip}`);
    },
    handler: (req, res) => {
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(429)
        .type("html")
        .send(
          renderLoginPage({
            csrfToken,
            error: "Too many sign-in attempts. Please wait a few minutes and try again.",
          })
        );
    },
  });

  const registrationLimit = Number(env.BLESSBOARD_REGISTER_RATE_LIMIT);
  const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit:
      Number.isFinite(registrationLimit) && registrationLimit > 0
        ? registrationLimit
        : String(env.NODE_ENV || "") === "test"
          ? 1000
          : 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const host = String(req.headers.host || "")
        .toLowerCase()
        .split(":")[0];
      return sha256Hex(`${clientIp(req)}|${host}|register`);
    },
    handler: (req, res) => {
      return res
        .status(429)
        .type("html")
        .send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Too many requests</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet"/>
<link rel="stylesheet" href="/blessboard/v5/tenant-auth.css?v=1"/></head>
<body class="bb-auth-body" data-bb-page="register-rate-limited">
<main class="bb-auth-main__body">
<div class="bb-auth-card" role="alert">
<h1 class="bb-auth-card__title">Too many submissions</h1>
<p class="bb-auth-card__lead">Please wait a few minutes and try again.</p>
<p><a class="bb-auth-btn bb-auth-btn--primary" href="/register">Back to registration</a></p>
</div>
</main>
</body></html>`);
    },
  });

  // Health is independent of tenant DB state.
  app.get("/healthz", (req, res) => {
    if (env.DEBUG_HOST === "1") {
      return res.json({
        ok: true,
        mode: "v5-foundation",
        resolvedHost: resolveHostname(req),
        xForwardedHost: req.headers["x-forwarded-host"] || null,
        hostHeader: req.headers.host || null,
      });
    }
    return res.json({ ok: true, mode: "v5-foundation" });
  });

  // 6. Temporary protected diagnostic (tenant hosts only; not linked from nav)
  app.get(
    "/tenant-access-check",
    (req, res, next) => {
      if (isApexHost(req, opts)) {
        return sendUnavailable(req, res);
      }
      return next();
    },
    requireTenantAccess,
    (req, res) => {
      const tenant =
        req.blessBoardTenantContext && req.blessBoardTenantContext.resolved
          ? req.blessBoardTenantContext
          : req.blessBoardTenantRoute && req.blessBoardTenantRoute.proposedTenant;
      const authz = req.blessBoardAuthorizationContext || {
        authenticated: false,
        authorized: false,
        effectiveRoles: [],
      };
      return res.status(200).type("html").send(
        renderTenantAccessCheckPage({
          authz,
          churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
          branchDisplayName:
            tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
        })
      );
    }
  );

  // 7. Apex-only platform-admin shell (read-only organization directory)
  app.use(
    createPlatformAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );

  // 8. Minimal HQ + branch-admin portal shells (tenant hosts; host-only session)
  app.use(
    createHqAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createBranchAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createMemberPortalRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createAnnouncementMemberRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createParticipationMemberRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createFormsRequestsMemberRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      mediaService,
    })
  );
  app.use(
    createAnnouncementAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
    })
  );
  app.use(
    createAnnouncementAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
    })
  );
  app.use(
    createParticipationAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
    })
  );
  app.use(
    createParticipationAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
    })
  );
  app.use(
    createAttendanceAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
    })
  );
  app.use(
    createAttendanceAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
    })
  );
  app.use(
    createGivingAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
    })
  );
  app.use(
    createGivingAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
    })
  );
  app.use(
    createFormsRequestsAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
    })
  );
  app.use(
    createFormsRequestsAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
    })
  );
  app.use(
    createHqReportsRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createBranchRegistrationAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createHqMembersAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
    })
  );
  app.use(
    createContentAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "hq",
      mediaService,
    })
  );
  app.use(
    createContentAdminRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      sendUnavailable,
      variant: "branch",
      mediaService,
    })
  );

  // 8b. Public media delivery (tenant-scoped; public assets only)
  app.use(
    createPublicMediaRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      env,
      mediaService,
    })
  );

  // 8c. Public member registration (host-derived church + primary branch)
  app.use(
    createTenantRegistrationRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      getTenantRoutingMode: () => getBlessBoardTenantRoutingMode(env),
      env,
      registrationLimiter,
    })
  );

  // 8d. Tenant public website (authoritative mode; published content only)
  app.use(
    createTenantPublicRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      getTenantRoutingMode: () => getBlessBoardTenantRoutingMode(env),
    })
  );

  // 8e. Apex marketing pages (Batch 2b — GET only; no provisioning/billing)
  app.use(
    createApexMarketingRouter({
      getPool,
      isApexHost: (req) => isApexHost(req, opts),
      issueCsrfToken,
      setCsrfCookie,
      env,
      isProduction,
    })
  );

  // 9. Auth — tenant initiates transfer; apex authenticates; tenant callback redeems
  function sendAuthError(req, res, status, message) {
    const wantsHtml = String(req.get("accept") || "").includes("text/html");
    if (!wantsHtml) {
      return res.status(status).type("text").send(message);
    }
    return res.status(status).type("html").send(renderAuthErrorPage(message));
  }

  app.get("/login", async (req, res) => {
    const apex = isApexHost(req, opts);
    if (apex) {
      const rawTr = String((req.query && req.query.tr) || "").trim();
      let transferHostname = null;
      if (rawTr) {
        res.setHeader("Referrer-Policy", "no-referrer");
        const deployment = getPlatformDeploymentCode(env);
        if (!deployment.ok || !deployment.code) {
          return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
        }
        try {
          const loaded = await loadAuthTransferByRawToken(getPool(), {
            rawToken: rawTr,
            deploymentCode: deployment.code,
          });
          if (!loaded.ok || !loaded.transfer || loaded.transfer.userId) {
            const consumed =
              loaded &&
              (loaded.status === TRANSFER_STATUS.CONSUMED ||
                (loaded.transfer && loaded.transfer.userId));
            return sendAuthError(
              req,
              res,
              400,
              consumed
                ? "This sign-in link has already been used."
                : "This sign-in link is invalid or has expired."
            );
          }
          // Hostname only after authoritative transfer resolution (never from client input alone).
          transferHostname = loaded.transfer.requestedHostname;
        } catch {
          return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
        }
      }
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res.status(200).type("html").send(
        renderLoginPage({
          csrfToken,
          hostKind: "apex",
          transferHostname,
          loggedOut: String((req.query && req.query.logged_out) || "") === "1",
        })
      );
    }

    // Tenant host: initiate transfer and redirect to apex (no password on tenant).
    const tenant = resolveTenantForLogin(req);
    if (!tenant) {
      return sendAuthError(req, res, 400, "This BlessBoard site could not start sign-in.");
    }
    const deployment = getPlatformDeploymentCode(env);
    if (!deployment.ok || !deployment.code) {
      return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
    }
    const hostname = resolveHostname(req);
    const returnPath = safeTenantNextPath(req.query && req.query.next);
    try {
      const created = await createTenantLoginTransferRequest(getPool(), {
        deploymentCode: deployment.code,
        hostname,
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch && tenant.primaryBranch.id,
        returnPath,
      });
      if (!created.ok || !created.rawToken) {
        const status = created.status === TRANSFER_STATUS.INVALID_INPUT ? 400 : 503;
        return sendAuthError(
          req,
          res,
          status,
          status === 400 ? "This BlessBoard site could not start sign-in." : "Sign-in is temporarily unavailable."
        );
      }
      const apexOrigin = getApexOrigin(env, "blessboard.org");
      return res.redirect(303, `${apexOrigin}/login?tr=${encodeURIComponent(created.rawToken)}`);
    } catch {
      return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
    }
  });

  app.post("/login", loginLimiter, async (req, res) => {
    if (!isApexHost(req, opts)) {
      // Credentials are never accepted on tenant hosts.
      return sendAuthError(req, res, 400, "Sign-in must continue on the BlessBoard home site.");
    }
    const csrfToken = issueCsrfToken(env);
    const submitted = req.body && req.body[CSRF_FIELD];
    const rawTr = String((req.body && req.body.tr) || (req.query && req.query.tr) || "").trim();
    let transferHostname = null;
    const loginPageOpts = {
      csrfToken,
      hostKind: "apex",
      transferHostname,
    };
    if (!validateCsrf(req, submitted, env)) {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(403)
        .type("html")
        .send(
          renderLoginPage({
            ...loginPageOpts,
            error: "Invalid or missing CSRF token. Please try again.",
          })
        );
    }

    const deployment = getPlatformDeploymentCode(env);
    if (!deployment.ok || !deployment.code) {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(503)
        .type("html")
        .send(renderLoginPage({ ...loginPageOpts, error: "Sign-in is temporarily unavailable." }));
    }

    let pendingTransfer = null;
    if (rawTr) {
      res.setHeader("Referrer-Policy", "no-referrer");
      try {
        const loaded = await loadAuthTransferByRawToken(getPool(), {
          rawToken: rawTr,
          deploymentCode: deployment.code,
        });
        if (!loaded.ok || !loaded.transfer || loaded.transfer.userId) {
          setCsrfCookie(res, csrfToken, { secure: isProduction });
          const consumed =
            loaded &&
            (loaded.status === TRANSFER_STATUS.CONSUMED ||
              (loaded.transfer && loaded.transfer.userId));
          return sendAuthError(
            req,
            res,
            400,
            consumed
              ? "This sign-in link has already been used."
              : "This sign-in link is invalid or has expired."
          );
        }
        pendingTransfer = loaded.transfer;
        loginPageOpts.transferHostname = pendingTransfer.requestedHostname;
      } catch {
        setCsrfCookie(res, csrfToken, { secure: isProduction });
        return res
          .status(503)
          .type("html")
          .send(renderLoginPage({ ...loginPageOpts, error: "Sign-in is temporarily unavailable." }));
      }
    }

    try {
      const result = await authenticateBlessBoardUser(getPool(), {
        email: req.body && req.body.email,
        password: req.body && req.body.password,
        deploymentCode: deployment.code,
        requireOrganizationId: pendingTransfer ? pendingTransfer.organizationId : null,
        ip: clientIp(req),
        userAgent: req.get("user-agent") || null,
      });

      if (!result.ok) {
        setCsrfCookie(res, csrfToken, { secure: isProduction });
        const message =
          result.status === "no_active_role"
            ? "Sign-in is not available for this account."
            : "Invalid email or password.";
        return res.status(401).type("html").send(renderLoginPage({ ...loginPageOpts, error: message }));
      }

      setV5SessionCookie(res, result.rawToken, { secure: isProduction, env });
      setCsrfCookie(res, csrfToken, { secure: isProduction });

      if (!pendingTransfer) {
        return res.redirect(303, "/account");
      }

      const issued = await issueTenantLoginRedeemCode(getPool(), {
        rawRequestToken: rawTr,
        deploymentCode: deployment.code,
        userId: result.user.id,
        tenant: tenantFromTransfer(pendingTransfer),
      });
      if (!issued.ok || !issued.rawToken) {
        if (issued.status === TRANSFER_STATUS.UNAUTHORIZED) {
          return sendAuthError(req, res, 403, "You do not have access to that church site.");
        }
        if (issued.status === TRANSFER_STATUS.CONSUMED) {
          return sendAuthError(req, res, 400, "This sign-in link has already been used.");
        }
        if (
          issued.status === TRANSFER_STATUS.EXPIRED ||
          issued.status === TRANSFER_STATUS.INVALID_TRANSFER
        ) {
          return sendAuthError(req, res, 400, "This sign-in link is invalid or has expired.");
        }
        return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
      }

      const callbackUrl = tenantAbsoluteUrl(
        pendingTransfer.requestedHostname,
        `/auth/callback?code=${encodeURIComponent(issued.rawToken)}`,
        env
      );
      if (!callbackUrl) {
        return sendAuthError(req, res, 400, "This sign-in link is invalid or has expired.");
      }
      res.setHeader("Referrer-Policy", "no-referrer");
      return res.redirect(303, callbackUrl);
    } catch {
      setCsrfCookie(res, csrfToken, { secure: isProduction });
      return res
        .status(503)
        .type("html")
        .send(renderLoginPage({ ...loginPageOpts, error: "Sign-in is temporarily unavailable." }));
    }
  });

  app.get("/auth/callback", async (req, res) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    if (isApexHost(req, opts)) {
      return sendAuthError(req, res, 400, "This sign-in callback is only valid on a church site.");
    }
    const tenant = resolveTenantForLogin(req);
    if (!tenant) {
      return sendAuthError(req, res, 400, "This sign-in callback could not be completed.");
    }
    const deployment = getPlatformDeploymentCode(env);
    if (!deployment.ok || !deployment.code) {
      return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
    }
    const rawCode = String((req.query && req.query.code) || "").trim();
    if (!rawCode) {
      return sendAuthError(req, res, 400, "This sign-in link is invalid or has expired.");
    }
    try {
      const redeemed = await redeemTenantLoginTransfer(getPool(), {
        rawToken: rawCode,
        deploymentCode: deployment.code,
        hostname: resolveHostname(req),
        organizationId: tenant.organization.id,
        churchId: tenant.church.id,
        branchId: tenant.primaryBranch && tenant.primaryBranch.id,
        ip: clientIp(req),
        userAgent: req.get("user-agent") || null,
      });
      if (!redeemed.ok || !redeemed.rawSessionToken) {
        const status =
          redeemed.status === TRANSFER_STATUS.LOOKUP_ERROR
            ? 503
            : redeemed.status === TRANSFER_STATUS.UNAUTHORIZED
              ? 403
              : 400;
        let message = "This sign-in link is invalid or has expired.";
        if (status === 503) message = "Sign-in is temporarily unavailable.";
        else if (redeemed.status === TRANSFER_STATUS.UNAUTHORIZED) {
          message = "You do not have access to that church site.";
        } else if (redeemed.status === TRANSFER_STATUS.CONSUMED) {
          message = "This sign-in link has already been used.";
        }
        return sendAuthError(req, res, status, message);
      }
      setV5SessionCookie(res, redeemed.rawSessionToken, { secure: isProduction, env });
      const dest = safeTenantNextPath(redeemed.returnPath) || "/branch-admin";
      return res.redirect(303, dest);
    } catch {
      return sendAuthError(req, res, 503, "Sign-in is temporarily unavailable.");
    }
  });

  app.post("/logout", async (req, res) => {
    const apex = isApexHost(req, opts);
    const tenant = apex ? null : resolveTenantForLogin(req);
    if (!apex && !tenant) {
      return sendUnavailable(req, res);
    }
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
    return res.redirect(303, "/login");
  });

  app.get("/account", async (req, res) => {
    const apex = isApexHost(req, opts);
    const tenant = apex ? null : resolveTenantForLogin(req);
    if (!apex && !tenant) {
      return sendUnavailable(req, res);
    }
    if (!req.v5Session || !req.v5Session.authenticated || !req.v5Session.session) {
      return res.redirect(303, "/login");
    }
    const session = req.v5Session.session;
    let roleKeys = [];
    try {
      const roles = await listActiveRolesForUser(getPool(), session.userId);
      roleKeys = roles.map((r) => r.role_key);
    } catch {
      roleKeys = [];
    }
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.status(200).type("html").send(
      renderAccountPage({
        displayName: session.user.displayName,
        userId: session.userId,
        deploymentCode: session.deploymentCode,
        organizationId: session.organizationId,
        roles: roleKeys,
        csrfToken,
        hostKind: apex ? "apex" : "tenant",
        churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
        branchDisplayName:
          tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
      })
    );
  });

  // 10. Apex home (tenant public `/` is handled by createTenantPublicRouter)
  app.get("/", (req, res) => {
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });

    if (isApexHost(req, opts)) {
      return res.status(200).type("html").send(
        renderFoundationHome({
          authenticated,
          csrfToken: authenticated ? csrfToken : null,
        })
      );
    }

    // Tenant hosts: public router should have handled `/`. Fail closed if not.
    const route = req.blessBoardTenantRoute || {};
    const mode = route.mode || tenantRoutingMode;
    if (mode === MODE_OFF || mode === MODE_SHADOW) {
      return res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
    }
    if (mode === MODE_AUTHORITATIVE) {
      if (route.outcome === OUTCOME.NOT_FOUND || route.httpStatus === 404) {
        return res
          .status(404)
          .type("html")
          .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
      }
      return res
        .status(503)
        .type("html")
        .send(
          renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
        );
    }

    return res.status(200).type("html").send(
      renderFoundationHome({
        authenticated: false,
        csrfToken: null,
      })
    );
  });

  // 11. Controlled unavailable fallback
  // Note: /admin*, /hq*, /branch-admin* are registered above; other legacy paths stay unavailable.
  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "POST") {
      if (isUnavailableAppPath(req.path)) {
        return sendUnavailable(req, res);
      }
    }
    return next();
  });

  app.use((req, res) => {
    if (/\.(?:css|js|mjs|map|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(req.path)) {
      return res.status(404).type("text").send("Not found");
    }
    return sendUnavailable(req, res);
  });

  return app;
}

/**
 * @param {{ query: Function }} pool
 */
async function verifyFoundationPool(pool) {
  await pool.query("SELECT 1 AS ok");
  const platform = await pool.query(
    `SELECT 1 AS ok
       FROM information_schema.schemata
      WHERE schema_name = 'platform'
      LIMIT 1`
  );
  if (!platform.rows.length) {
    // eslint-disable-next-line no-console
    console.warn(
      "[blessboard] V5 foundation mode: platform schema not found — continue serving health/apex; run db:migrate against DATABASE_URL"
    );
  }
}

/**
 * @param {{ boot?: object }} [opts]
 */
async function startV5FoundationServer(opts) {
  void opts;
  logV5FoundationModeActive();

  // eslint-disable-next-line no-console
  console.log(
    "[blessboard] V5 foundation mode: scheduled jobs remain disabled in this process (no job workers started)"
  );

  const routingMode = getBlessBoardTenantRoutingMode();
  // eslint-disable-next-line no-console
  console.log(
    `[blessboard] BLESSBOARD_TENANT_ROUTING_MODE=${routingMode}`
  );

  const pool = getPgPool();
  await verifyFoundationPool(pool);

  const app = createV5FoundationApp({ getPool: () => pool });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = process.env.HOST || "0.0.0.0";

  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[blessboard] V5 foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  UNAVAILABLE_STATUS,
  UNAVAILABLE_MESSAGE,
  APEX_HOSTS,
  isUnavailableAppPath,
  isApexHost,
  createV5FoundationApp,
  verifyFoundationPool,
  startV5FoundationServer,
};
