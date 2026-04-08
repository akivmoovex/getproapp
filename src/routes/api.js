const express = require("express");
const { resolveHostname } = require("../platform/host");
const { israelComingSoonEnabled } = require("../tenants/israelComingSoon");
const { TENANT_IL } = require("../tenants/tenantIds");
const phoneRulesService = require("../phone/phoneRulesService");
const { createCrmTaskFromEvent } = require("../crm/crmAutoTasks");
const { getPgPool, isPgConfigured } = require("../db/pg");
const callbacksRepo = require("../db/pg/callbacksRepo");
const companiesRepo = require("../db/pg/companiesRepo");
const leadsRepo = require("../db/pg/leadsRepo");
const professionalSignupsRepo = require("../db/pg/professionalSignupsRepo");
const tenantsRepo = require("../db/pg/tenantsRepo");
const { resolveTenantIdStrict } = require("../api/resolveTenantStrict");

const TENANT_IL_ID = TENANT_IL;

module.exports = function apiRoutes() {
  const router = express.Router();

  /**
   * Company contact lead: `company_id` must be explicit (profile form hidden field or API body).
   * Do not infer the listing from category, city, or search heuristics — wrong assignment would
   * route customer PII to the wrong business.
   */
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

    const pool = getPgPool();
    const row = await companiesRepo.getById(pool, companyIdNum);
    const company = row ? { id: row.id, tenant_id: row.tenant_id, name: row.name } : null;
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }
    if (israelComingSoonEnabled() && company.tenant_id === TENANT_IL_ID) {
      return res.status(403).json({ error: "This region is not accepting leads yet." });
    }

    const phoneStr = String(phone || "").trim();
    if (phoneStr) {
      const v = await phoneRulesService.validatePhoneForTenant(pool, company.tenant_id, phoneStr, "phone");
      if (!v.ok) {
        return res.status(400).json({ error: v.error || "Invalid phone number for this region." });
      }
    }

    const leadId = await leadsRepo.insertPublicLead(pool, {
      companyId: companyIdNum,
      tenantId: company.tenant_id,
      name,
      phone,
      email,
      message,
    });

    const cname = company.name;
    await createCrmTaskFromEvent({
      tenantId: company.tenant_id,
      title: `Company lead · ${cname ? cname : "Listing"}`,
      description: `Contact: ${String(name).trim() || "—"}\nPhone: ${String(phone).trim() || "—"}\nEmail: ${String(email).trim() || "—"}\n\n${String(message).trim().slice(0, 4000)}`,
      sourceType: "company_lead",
      sourceRefId: leadId,
    });

    return res.json({ ok: true });
  });

  router.post("/professional-signups", async (req, res) => {
    const body = req.body || {};
    const profession = String(body.profession || "").trim().slice(0, 120);
    const city = String(body.city || "").trim().slice(0, 120);
    const name = String(body.name || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 40);
    const vatOrPacra = String(body.vat_or_pacra || "").trim().slice(0, 200);
    const resolved = await resolveTenantIdStrict(body);
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

    const pool = getPgPool();
    const v = await phoneRulesService.validatePhoneForTenant(pool, tenantId, phone, "phone");
    if (!v.ok) {
      return res.status(400).json({ error: v.error || "Invalid phone number for this region." });
    }

    const signupId = await professionalSignupsRepo.insertSignup(pool, {
      profession,
      city,
      name,
      phone,
      vatOrPacra,
      tenantId,
    });

    await createCrmTaskFromEvent({
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

  /** Opt-in PostgreSQL connectivity check (Supabase). Off by default. */
  if (process.env.GETPRO_PG_HEALTH_ROUTE === "1") {
    router.get("/debug/pg-ping", async (req, res) => {
      if (!isPgConfigured()) {
        return res.status(503).json({
          ok: false,
          error: "PostgreSQL not configured (set DATABASE_URL or GETPRO_DATABASE_URL).",
        });
      }
      try {
        const pool = getPgPool();
        const r = await pool.query(
          "SELECT current_database() AS database, current_schema() AS schema, 1 AS ok"
        );
        return res.json({ ok: true, ...r.rows[0] });
      } catch (err) {
        return res.status(503).json({ ok: false, error: err.message });
      }
    });
  }

  router.post("/callback-interest", async (req, res) => {
    const body = req.body || {};
    const phone = String(body.phone || "").trim().slice(0, 40);
    const name = String(body.name || "").trim().slice(0, 120);
    let context = String(body.context || "").trim().slice(0, 120);
    const cityName = String(body.cityName || "").trim().slice(0, 120);
    const resolved = await resolveTenantIdStrict(body);
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
    const interestLabelFinal = interestLabel || "Potential Partner";
    const contextFinal = context || "join_exit";

    const pool = getPgPool();
    if (phone) {
      const v = await phoneRulesService.validatePhoneForTenant(pool, tenantId, phone, "phone");
      if (!v.ok) {
        return res.status(400).json({ error: v.error || "Invalid phone number for this region." });
      }
    }

    let cbId;
    try {
      cbId = await callbacksRepo.insertCallbackInterest(pool, {
        phone,
        name,
        context: contextFinal,
        tenantId,
        interestLabel: interestLabelFinal,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[getpro] PostgreSQL callback_interests insert failed:", err.message);
      return res.status(503).json({ error: "Could not save your request. Please try again later." });
    }

    await createCrmTaskFromEvent({
      tenantId,
      title: `Callback · ${name || phone || "request"}`,
      description: `Phone: ${phone || "—"}\nLabel: ${interestLabelFinal || "—"}\nContext: ${contextFinal}`,
      sourceType: "callback_interest",
      sourceRefId: cbId,
    });

    return res.json({ ok: true });
  });

  return router;
};
