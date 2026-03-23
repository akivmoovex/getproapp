const express = require("express");
const { resolveHostname } = require("../host");
const { israelComingSoonEnabled } = require("../israelComingSoon");
const { TENANT_IL } = require("../tenantIds");
const { isValidPhoneForTenant } = require("../tenants");
const { createCrmTaskFromEvent } = require("../crmAutoTasks");

/**
 * Resolves tenant for join/callback APIs. Never defaults to Zambia — wrong defaults
 * caused all regions to store data under the wrong tenant.
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

const TENANT_IL_ID = TENANT_IL;

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

    const tenantSlug = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(company.tenant_id);
    const phoneStr = String(phone || "").trim();
    if (tenantSlug && tenantSlug.slug === "zm" && phoneStr && !isValidPhoneForTenant("zm", phoneStr)) {
      return res.status(400).json({ error: "Invalid phone number for this region." });
    }

    const lr = db
      .prepare(
        `
      INSERT INTO leads (company_id, name, phone, email, message, status, tenant_id)
      VALUES (?, ?, ?, ?, ?, 'open', ?)
      `
      )
      .run(
        companyIdNum,
        String(name).slice(0, 120),
        String(phone).slice(0, 30),
        String(email).slice(0, 120),
        String(message).slice(0, 2000),
        company.tenant_id
      );
    const leadId = Number(lr.lastInsertRowid);
    const cname = db.prepare("SELECT name FROM companies WHERE id = ?").get(companyIdNum);
    createCrmTaskFromEvent(db, {
      tenantId: company.tenant_id,
      title: `Company lead · ${cname && cname.name ? cname.name : "Listing"}`,
      description: `Contact: ${String(name).trim() || "—"}\nPhone: ${String(phone).trim() || "—"}\nEmail: ${String(email).trim() || "—"}\n\n${String(message).trim().slice(0, 4000)}`,
      sourceType: "company_lead",
      sourceRefId: leadId,
    });

    return res.json({ ok: true });
  });

  router.post("/professional-signups", (req, res) => {
    const body = req.body || {};
    const profession = String(body.profession || "").trim().slice(0, 120);
    const city = String(body.city || "").trim().slice(0, 120);
    const name = String(body.name || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const vatOrPacra = String(body.vat_or_pacra || "").trim().slice(0, 200);
    const resolved = resolveTenantIdStrict(db, body);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    const tenantId = resolved.tenantId;

    if (israelComingSoonEnabled() && tenantId === TENANT_IL_ID) {
      return res.status(403).json({ error: "Israel sign-ups are not open yet." });
    }

    if (!profession || !city || !name || !phone) {
      return res.status(400).json({ error: "Profession, city, name, and phone are required." });
    }

    const tenantSlugRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tenantId);
    if (tenantSlugRow && tenantSlugRow.slug === "zm" && !isValidPhoneForTenant("zm", phone)) {
      return res.status(400).json({ error: "Invalid phone number for this region." });
    }

    const ins = db
      .prepare(
        `
      INSERT INTO professional_signups (profession, city, name, phone, vat_or_pacra, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(profession, city, name, phone, vatOrPacra, tenantId);
    const signupId = Number(ins.lastInsertRowid);
    createCrmTaskFromEvent(db, {
      tenantId,
      title: `Join signup · ${name}`,
      description: `Profession: ${profession}\nCity: ${city}\nPhone: ${phone}\nVAT / PACRA: ${vatOrPacra || "—"}`,
      sourceType: "join_signup",
      sourceRefId: signupId,
    });

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
    let context = String(body.context || "").trim().slice(0, 120);
    const cityName = String(body.cityName || "").trim().slice(0, 120);
    const resolved = resolveTenantIdStrict(db, body);
    if (resolved.error) {
      return res.status(400).json({ error: resolved.error });
    }
    const tenantId = resolved.tenantId;
    if (israelComingSoonEnabled() && tenantId === TENANT_IL_ID) {
      return res.status(403).json({ error: "Israel callbacks are not open yet." });
    }
    let interestLabel = String(body.interest_label || body.label || "Potential Partner")
      .trim()
      .slice(0, 120);
    if (cityName) {
      if (!context) context = "disabled_city_waitlist";
      interestLabel = `City waitlist — ${cityName}`.slice(0, 120);
    }
    const tenantSlugCb = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tenantId);
    if (tenantSlugCb && tenantSlugCb.slug === "zm" && phone && !isValidPhoneForTenant("zm", phone)) {
      return res.status(400).json({ error: "Invalid phone number for this region." });
    }
    const cb = db
      .prepare(
        `
      INSERT INTO callback_interests (phone, name, context, tenant_id, interest_label)
      VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(phone, name, context || "join_exit", tenantId, interestLabel || "Potential Partner");
    const cbId = Number(cb.lastInsertRowid);
    createCrmTaskFromEvent(db, {
      tenantId,
      title: `Callback · ${name || phone || "request"}`,
      description: `Phone: ${phone || "—"}\nLabel: ${interestLabel || "—"}\nContext: ${context || "join_exit"}`,
      sourceType: "callback_interest",
      sourceRefId: cbId,
    });
    return res.json({ ok: true });
  });

  return router;
};
