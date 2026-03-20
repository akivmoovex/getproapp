const express = require("express");

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

    const company = db.prepare("SELECT id FROM companies WHERE id = ?").get(companyIdNum);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    db.prepare(
      `
      INSERT INTO leads (company_id, name, phone, email, message, status)
      VALUES (?, ?, ?, ?, ?, 'new')
      `
    ).run(companyIdNum, String(name).slice(0, 120), String(phone).slice(0, 30), String(email).slice(0, 120), String(message).slice(0, 2000));

    return res.json({ ok: true });
  });

  return router;
};

