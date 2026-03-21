const express = require("express");
const { israelComingSoonEnabled } = require("../israelComingSoon");

function resolveTenantId(db, body) {
  const slug = String((body && body.tenantSlug) || "")
    .trim()
    .toLowerCase();
  if (!slug) return 1;
  const row = db.prepare("SELECT id FROM tenants WHERE slug = ?").get(slug);
  return row ? row.id : 1;
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
        host: req.get("host"),
        hostname: req.hostname,
        subdomain: req.subdomain != null ? req.subdomain : null,
        baseDomain: process.env.BASE_DOMAIN || null,
      });
    });
  }

  router.post("/callback-interest", (req, res) => {
    const body = req.body || {};
    const phone = String(body.phone || "").trim().slice(0, 40);
    const name = String(body.name || "").trim().slice(0, 120);
    const context = String(body.context || "").trim().slice(0, 120);
    const tenantId = resolveTenantId(db, body);
    if (israelComingSoonEnabled() && tenantId === TENANT_IL_ID) {
      return res.status(403).json({ error: "Israel callbacks are not open yet." });
    }
    db.prepare(
      `
      INSERT INTO callback_interests (phone, name, context, tenant_id)
      VALUES (?, ?, ?, ?)
      `
    ).run(phone, name, context || "join_exit", tenantId);
    return res.json({ ok: true });
  });

  return router;
};
