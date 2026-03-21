const express = require("express");
const { resolveHostname } = require("../host");
const { israelComingSoonEnabled } = require("../israelComingSoon");

/**
 * Resolves tenant for join/callback APIs. Never defaults to Zambia — wrong defaults
 * caused all regions to store data under tenant_id 1.
 * Prefer server-rendered `tenantId` (must match DB); optional `tenantSlug` must match that row.
 */
function resolveTenantIdStrict(db, body) {
  const rawId = body && body.tenantId != null ? Number(body.tenantId) : NaN;
  if (Number.isFinite(rawId) && rawId > 0) {
    const row = db.prepare("SELECT id, slug FROM tenants WHERE id = ?").get(rawId);
    if (!row) return { error: "Invalid tenant id." };
    const slugFromBody = String((body && body.tenantSlug) || "")
      .trim()
      .toLowerCase();
    if (slugFromBody && row.slug !== slugFromBody) {
      return { error: "Tenant id and slug do not match." };
    }
    return { tenantId: row.id };
  }

  const slug = String((body && body.tenantSlug) || "")
    .trim()
    .toLowerCase();
  if (!slug) return { error: "tenantId or tenantSlug is required." };
  const row = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slug);
  if (!row) return { error: "Unknown tenant slug." };
  return { tenantId: row.id };
}

const TENANT_IL_ID = 2;

module.exports = function apiRoutes({ db }) {
  const router = express.Router();

  router.post("/leads", async (req, res) => {
    const {
      company_id,
      name = "",
      phone = "",
      email = "",
      message = "",
    } = req.body || {};

    const companyIdNum = Number(company_id);
    if (!companyIdNum || Number.isNaN(companyIdNum)) {
      return res.status(400).json({ error: "company_id is required" });
    }

    const company = db.prepare("SELECT id, tenant_id FROM companies WHERE id = ?").get(companyIdNum);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    if (israelComingSoonEnabled() && company.tenant_id === TENANT_IL_ID) {
      return res.status(403).json({ error: "This region is not accepting leads yet." });
    }

    db.prepare(
      `
      INSERT INTO leads (company_id, name, phone, email, message, status, tenant_id)
      VALUES (?, ?, ?, ?, ?, 'new', ?)
      `
    ).run(
      companyIdNum,
      String(name).slice(0, 120),
      String(phone).slice(0, 30),
      String(email).slice(0, 120),
      String(message).slice(0, 2000),
      company.tenant_id
    );

    return res.json({ ok: true });
  });

  router.post("/professional-signups", (req, res) => {
    const body = req.body || {};
    const profession = String(body.profession || "").trim().slice(0, 120);
    const city = String(body.city || "").trim().slice(0, 120);
    const name = String(body.name || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const vatOrPacra = String(body.vat_or_pacra || "").trim().slice(0, 200);
    const tenantId = resolveTenantId(db, body);

    if (israelComingSoonEnabled() && tenantId === TENANT_IL_ID) {
      return res.status(403).json({ error: "Israel sign-ups are not open yet." });
    }

    if (!profession || !city || !name || !phone) {
      return res.status(400).json({ error: "Profession, city, name, and phone are required." });
    }

    db.prepare(
      `
      INSERT INTO professional_signups (profession, city, name, phone, vat_or_pacra, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `
    ).run(profession, city, name, phone, vatOrPacra, tenantId);

    return res.json({ ok: true });
  });

  if (process.env.DEBUG_HOST === "1") {
    router.get("/debug/host", (req, res) => {
      res.json({
        resolvedHost: resolveHostname(req),
        hostHeader: req.get("host"),
        xForwardedHost: req.headers["x-forwarded-host"] || null,
        hostname: req.hostname,
        subdomain: req.subdomain != null ? req.subdomain : null,
        baseDomain: (process.env.BASE_DOMAIN || "").trim() || null,
        trustProxy: req.app && req.app.get("trust proxy"),
      });
    });
  }

  router.post("/callback-interest", (req, res) => {
    const body = req.body || {};
    const phone = String(body.phone || "").trim().slice(0, 40);
    const name = String(body.name || "").trim().slice(0, 120);
    const context = String(body.context || "").trim().slice(0, 120);
    const resolved = resolveTenantIdStrict(db, body);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    const tenantId = resolved.tenantId;
    if (israelComingSoonEnabled() && tenantId === TENANT_IL_ID) {
      return res.status(403).json({ error: "Israel callbacks are not open yet." });
    }
    const interestLabel = String(body.interest_label || body.label || "Potential Partner")
      .trim()
      .slice(0, 120);
    db.prepare(
      `
      INSERT INTO callback_interests (phone, name, context, tenant_id, interest_label)
      VALUES (?, ?, ?, ?, ?)
      `
    ).run(phone, name, context || "join_exit", tenantId, interestLabel || "Potential Partner");
    return res.json({ ok: true });
  });

  return router;
};
