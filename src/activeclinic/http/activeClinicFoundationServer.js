"use strict";

/**
 * Minimal ActiveClinic foundation Express app (no clinical modules).
 * Shares platform session/CSRF/host patterns; enforces explicit product enablement.
 */

const path = require("path");
const express = require("express");
const morgan = require("morgan");

const { getPgPool } = require("../../db/pg");
const { resolveHostname } = require("../../platform/host");
const {
  assignV5RequestId,
} = require("../../platform/http/v5SafeLogging");
const {
  createActiveClinicErrorHandler,
} = require("./createActiveClinicErrorHandler");
const { createV5PrivateNoStoreMiddleware } = require("../../platform/http/v5PrivateNoStore");
const { createLoadV5Session } = require("../../platform/http/loadV5Session");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  resolveDeploymentConfiguration,
  resolveTrustProxy,
  resolveListenHost,
} = require("../../platform/config/deploymentProfiles");
const { getProduct } = require("../../platform/config/productRegistry");
const { issueCsrfToken, setCsrfCookie, getCsrfCookieName } = require("../../platform/http/v5Csrf");
const {
  registerPlatformRoutes,
  resolveRuntimeProductCode,
} = require("../../platform/http/productRouteBootstrap");
const {
  createLoadActiveClinicProductContext,
} = require("./loadActiveClinicProductContext");
const {
  createLoadActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  registerActiveClinicAuthRoutes,
} = require("./activeClinicAuthRoutes");
const {
  registerActiveClinicLifecycleRoutes,
} = require("./activeClinicLifecycleRoutes");
const {
  registerActiveClinicStaffAdminRoutes,
} = require("./activeClinicStaffAdminRoutes");
const {
  registerActiveClinicAppRoutes,
} = require("./activeClinicAppRoutes");
const {
  registerActiveClinicFacilityRoutes,
} = require("./activeClinicFacilityRoutes");
const {
  registerActiveClinicStaffRoutes,
} = require("./activeClinicStaffRoutes");
const {
  registerActiveClinicAccessRoutes,
} = require("./activeClinicAccessRoutes");
const {
  registerActiveClinicSettingsRoutes,
} = require("./activeClinicSettingsRoutes");
const {
  registerActiveClinicPatientRoutes,
} = require("./activeClinicPatientRoutes");
const {
  listOrganizationsByProduct,
} = require("../../platform/services/organizationProductService");
const {
  listFacilitiesByOrganization,
  getFacilityByOrganizationAndKey,
} = require("../services/facilityService");
const {
  listStaffMembersByOrganization,
  getStaffMemberByIdAndOrganization,
} = require("../services/activeClinicStaffService");
const {
  listFacilitiesForStaff,
} = require("../services/activeClinicStaffFacilityService");
const {
  resolveEffectivePermissions,
} = require("../services/activeClinicAuthorizationService");

function parseCookies(req) {
  if (req.cookies) return;
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  const out = {};
  if (header) {
    for (const part of header.split(";")) {
      const idx = part.indexOf("=");
      if (idx <= 0) continue;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  req.cookies = out;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{
 *   getPool?: () => { query: Function },
 *   env?: NodeJS.ProcessEnv,
 *   log?: (line: string) => void,
 * }} [options]
 */
function createActiveClinicFoundationApp(options) {
  const opts = options || {};
  const getPool = typeof opts.getPool === "function" ? opts.getPool : getPgPool;
  const env = opts.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const productCode = resolveRuntimeProductCode(env);
  if (productCode !== "activeclinic") {
    throw new Error(
      `createActiveClinicFoundationApp requires productCode=activeclinic (got ${JSON.stringify(productCode)})`
    );
  }

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", resolveTrustProxy(env));

  app.use(assignV5RequestId);
  app.use(createV5PrivateNoStoreMiddleware());

  if (isProduction) {
    app.use(
      morgan(":method :url :status :res[content-length] - :response-time ms", {
        skip: (req) => req.path === "/healthz",
      })
    );
  } else {
    app.use(morgan(":method :url :status :res[content-length] - :response-time ms"));
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

  app.use(
    createLoadV5Session({
      getPool,
      getDeploymentCode: () => getPlatformDeploymentCode(env),
      log: typeof opts.log === "function" ? opts.log : undefined,
      env,
    })
  );

  app.use(createLoadActiveClinicProductContext({ getPool, env }));
  app.use(createLoadActiveClinicAuth({ getPool, env }));

  registerActiveClinicAuthRoutes(app, { getPool, env, isProduction });
  registerActiveClinicLifecycleRoutes(app, { getPool, env, isProduction });
  registerActiveClinicFacilityRoutes(app, { getPool, env, isProduction });
  registerActiveClinicStaffRoutes(app, { getPool, env, isProduction });
  registerActiveClinicAccessRoutes(app, { getPool, env, isProduction });
  registerActiveClinicSettingsRoutes(app, { getPool, env, isProduction });
  registerActiveClinicPatientRoutes(app, { getPool, env, isProduction });
  registerActiveClinicAppRoutes(app, { getPool, env, isProduction });
  registerActiveClinicStaffAdminRoutes(app, { getPool, env, isProduction });

  app.get("/healthz", (req, res) => {
    const deployment = resolveDeploymentConfiguration(env);
    const body = {
      ok: true,
      mode: "v5-foundation",
      product: "activeclinic",
      environment: deployment.environment || null,
      deploymentCode: deployment.code || null,
      csrfCookie: getCsrfCookieName(env),
      sessionCookie: deployment.sessionCookieName || null,
      requiresProductEnablement: true,
    };
    if (env.DEBUG_HOST === "1") {
      return res.json({
        ...body,
        resolvedHost: resolveHostname(req),
        hostHeader: req.headers.host || null,
      });
    }
    return res.json(body);
  });

  // Deployment landing / foundation stub (honest non-clinical status page).
  // Retained intentionally — not a clinical surface; probes under /__ac/* stay non-production.
  function rejectAcInfraInProduction(res) {
    if (!isProduction) return false;
    res.status(404).json({ ok: false, code: "not_found" });
    return true;
  }

  app.get("/__ac/organization-context", (req, res) => {
    if (rejectAcInfraInProduction(res)) return;
    const ctx = req.activeClinicContext || {};
    if (
      ctx.resolution === "denied" ||
      ctx.resolution === "invalid_product" ||
      ctx.resolution === "healthcare_organization_denied"
    ) {
      return res.status(404).json({
        ok: false,
        code: "organization_product_not_found",
        product: "activeclinic",
      });
    }
    return res.status(200).json({
      ok: true,
      resolution: ctx.resolution,
      deployment: ctx.deployment || null,
      product: ctx.product || null,
      organization: ctx.organization
        ? {
            key: ctx.organization.key,
            displayName: ctx.organization.displayName,
            dataEnvironment: ctx.organization.dataEnvironment,
          }
        : null,
      organizationProduct: ctx.organizationProduct
        ? {
            status: ctx.organizationProduct.status,
            productTenantKey: ctx.organizationProduct.productTenantKey,
            productKey: ctx.organizationProduct.productKey,
          }
        : null,
      healthcareOrganization: ctx.healthcareOrganization || null,
    });
  });

  app.get("/__ac/organizations", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const listed = await listOrganizationsByProduct(getPool(), {
        applicationCode: "activeclinic",
        status: "active",
      });
      if (!listed.ok) {
        return res.status(400).json({ ok: false, code: listed.code });
      }
      return res.status(200).json({
        ok: true,
        product: "activeclinic",
        organizations: listed.organizations.map((row) => ({
          organizationKey: row.organizationKey,
          displayName: row.displayName,
          productTenantKey: row.productTenantKey,
          dataEnvironment: row.dataEnvironment,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/__ac/healthcare-organization-context", (req, res) => {
    if (rejectAcInfraInProduction(res)) return;
    const ctx = req.activeClinicContext || {};
    if (
      !ctx.organization ||
      ctx.resolution === "denied" ||
      ctx.resolution === "invalid_product" ||
      ctx.resolution === "healthcare_organization_denied"
    ) {
      return res.status(404).json({
        ok: false,
        code: "healthcare_organization_not_found",
        product: "activeclinic",
      });
    }
    if (!ctx.healthcareOrganization) {
      return res.status(404).json({
        ok: false,
        code: "healthcare_organization_not_found",
        product: "activeclinic",
        organizationKey: ctx.organization.key,
      });
    }
    return res.status(200).json({
      ok: true,
      resolution: ctx.resolution,
      organizationKey: ctx.organization.key,
      healthcareOrganization: ctx.healthcareOrganization,
    });
  });

  app.get("/__ac/facilities", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({
          ok: false,
          code: "organization_product_not_found",
          product: "activeclinic",
        });
      }
      const listed = await listFacilitiesByOrganization(getPool(), {
        organizationId: ctx.organization.id,
      });
      if (!listed.ok) {
        return res.status(404).json({ ok: false, code: listed.code });
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        facilities: listed.facilities.map((f) => ({
          facilityKey: f.facilityKey,
          displayName: f.displayName,
          facilityType: f.facilityType,
          status: f.status,
          isPrimary: f.isPrimary,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/__ac/facilities/:facilityKey", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({
          ok: false,
          code: "facility_not_found",
          product: "activeclinic",
        });
      }
      const got = await getFacilityByOrganizationAndKey(getPool(), {
        organizationId: ctx.organization.id,
        facilityKey: req.params.facilityKey,
      });
      if (!got.ok) {
        return res.status(404).json({
          ok: false,
          code: "facility_not_found",
          product: "activeclinic",
        });
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        facility: {
          facilityKey: got.facility.facilityKey,
          displayName: got.facility.displayName,
          facilityType: got.facility.facilityType,
          status: got.facility.status,
          isPrimary: got.facility.isPrimary,
          countryCode: got.facility.countryCode,
          timezone: got.facility.timezone,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  // Temporary staff/RBAC probes (AC-V6-06). Remove when authenticated surfaces exist.
  app.get("/__ac/staff", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({
          ok: false,
          code: "organization_product_not_found",
          product: "activeclinic",
        });
      }
      const listed = await listStaffMembersByOrganization(getPool(), {
        organizationId: ctx.organization.id,
      });
      if (!listed.ok) {
        return res.status(404).json({ ok: false, code: listed.code });
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        staff: listed.staffMembers.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          status: s.status,
          employmentType: s.employmentType,
          hasIdentity: Boolean(s.platformIdentityId),
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/__ac/staff/:staffId", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({ ok: false, code: "staff_not_found" });
      }
      const got = await getStaffMemberByIdAndOrganization(getPool(), {
        id: req.params.staffId,
        organizationId: ctx.organization.id,
      });
      if (!got.ok) {
        return res.status(404).json({ ok: false, code: "staff_not_found" });
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        staff: {
          id: got.staffMember.id,
          displayName: got.staffMember.displayName,
          status: got.staffMember.status,
          employmentType: got.staffMember.employmentType,
          jobTitle: got.staffMember.jobTitle,
          hasIdentity: Boolean(got.staffMember.platformIdentityId),
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/__ac/staff/:staffId/facilities", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({ ok: false, code: "staff_not_found" });
      }
      const listed = await listFacilitiesForStaff(getPool(), {
        staffMemberId: req.params.staffId,
        organizationId: ctx.organization.id,
      });
      if (!listed.ok) {
        return res.status(404).json({ ok: false, code: listed.code });
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        assignments: listed.assignments.map((a) => ({
          facilityKey: a.facilityKey,
          facilityDisplayName: a.facilityDisplayName,
          status: a.status,
          isPrimary: a.isPrimary,
        })),
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/__ac/staff/:staffId/permissions", async (req, res, next) => {
    if (rejectAcInfraInProduction(res)) return;
    try {
      const ctx = req.activeClinicContext || {};
      if (!ctx.organization || ctx.resolution === "denied") {
        return res.status(404).json({ ok: false, code: "staff_not_found" });
      }
      const resolved = await resolveEffectivePermissions(getPool(), {
        organizationId: ctx.organization.id,
        staffMemberId: req.params.staffId,
        facilityId: req.query.facilityId || null,
      });
      if (!resolved.ok && resolved.code !== "ok") {
        // Still return empty permissions for non-active staff rather than leaking.
        if (resolved.code === "staff_not_active" || resolved.code === "staff_not_found") {
          return res.status(404).json({ ok: false, code: resolved.code });
        }
      }
      return res.status(200).json({
        ok: true,
        organizationKey: ctx.organization.key,
        staffId: req.params.staffId,
        permissions: resolved.permissions || [],
      });
    } catch (err) {
      return next(err);
    }
  });

  // Issue CSRF cookie on HTML entry so forms can use double-submit later.
  app.use((req, res, next) => {
    if (req.method === "GET" && req.path === "/") {
      const token = issueCsrfToken(env);
      setCsrfCookie(res, token, { secure: isProduction, env });
      res.locals = res.locals || {};
      res.locals.csrfToken = token;
    }
    return next();
  });

  registerPlatformRoutes(app, { env });

  app.get("/", (req, res) => {
    if (req.activeClinicAuth && req.activeClinicAuth.authenticated) {
      if (req.activeClinicAuth.mustChangePassword) {
        return res.redirect(303, "/account/change-password");
      }
      return res.redirect(303, "/app");
    }
    const product = getProduct("activeclinic");
    const ctx = req.activeClinicContext || {};
    const orgLine =
      ctx.resolution === "tenant_resolved" && ctx.organization
        ? `<p data-ac-org="${escapeHtml(ctx.organization.key)}">Organization context: ${escapeHtml(
            ctx.organization.displayName
          )} (${escapeHtml(ctx.organization.key)})</p>`
        : ctx.resolution === "denied"
          ? `<p data-ac-org-denied="1">Organization product access denied.</p>`
          : `<p data-ac-org-none="1">No organization context (deployment-level landing).</p>`;

    res.status(200).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(product.displayName)}</title></head>
<body data-ac-page="foundation-stub" data-ac-product="activeclinic" data-ac-resolution="${escapeHtml(
      ctx.resolution || "unknown"
    )}">
<main>
  <h1>${escapeHtml(product.displayName)}</h1>
  <p>Foundation runtime is active. Explicit product enablement is required for tenant access.</p>
  <p>Clinical modules are not implemented yet.</p>
  ${orgLine}
  <p><a href="/login">Staff sign in</a> · <a href="/healthz">Health check</a></p>
</main>
</body></html>`);
  });

  // Canonical ActiveClinic not-found (after all registered routes).
  app.use((req, res, next) => {
    if (res.headersSent) return next();
    const err = new Error("Not found");
    err.status = 404;
    err.statusCode = 404;
    return next(err);
  });

  app.use(createActiveClinicErrorHandler({ isProduction }));
  return app;
}

/**
 * @param {{ boot?: object }} [opts]
 */
async function startActiveClinicFoundationServer(opts) {
  void opts;
  const {
    assertV5SessionSecretPolicyOrExit,
  } = require("../../platform/config/v5EnvValidation");
  assertV5SessionSecretPolicyOrExit();

  const deployment = resolveDeploymentConfiguration();
  // eslint-disable-next-line no-console
  console.log(
    `[activeclinic] foundation mode: ACTIVE deployment=${deployment.code} ` +
      `product=${deployment.productCode} domain=${deployment.canonicalDomain} ` +
      `sessionCookie=${deployment.sessionCookieName} csrfCookie=${deployment.csrfCookieName} ` +
      `jobsEnabled=${deployment.jobsEnabled}`
  );

  const pool = getPgPool();
  {
    const { verifyFoundationPool } = require("../../platform/http/v5FoundationServer");
    await verifyFoundationPool(pool);
  }
  {
    const {
      assertPlatformDatabaseIdentityOrExit,
    } = require("../../startup/blessBoardOrgDbGate");
    await assertPlatformDatabaseIdentityOrExit(pool);
  }

  const app = createActiveClinicFoundationApp({
    getPool: () => pool,
    env: process.env,
  });
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const host = resolveListenHost(process.env);

  await new Promise((resolve, reject) => {
    try {
      const server = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[activeclinic] foundation listening on ${host}:${port}`);
        resolve(server);
      });
      server.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  createActiveClinicFoundationApp,
  startActiveClinicFoundationServer,
};
