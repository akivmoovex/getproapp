"use strict";

const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { getPgPool } = require("../db/pg");
const fieldAgentsRepo = require("../db/pg/fieldAgentsRepo");
const fieldAgentSubmissionsRepo = require("../db/pg/fieldAgentSubmissionsRepo");
const fieldAgentCallbackLeadsRepo = require("../db/pg/fieldAgentCallbackLeadsRepo");
const {
  getFieldAgentSession,
  setFieldAgentSession,
  clearFieldAgentSession,
  authenticateFieldAgent,
  requireFieldAgent,
} = require("../auth/fieldAgentAuth");
const phoneRulesService = require("../phone/phoneRulesService");
const { saveJpegImages, MAX_IMAGE_BYTES } = require("../fieldAgent/fieldAgentUploads");
const { notifyProviderSubmissionToCrm, notifyCallbackLeadToCrm } = require("../fieldAgent/fieldAgentCrm");
const { fieldAgentLoginLimiter } = require("../middleware/authRateLimit");
const { getTenantCitiesForClientAsync, getJoinCityWatermarkRotateAsync } = require("../tenants/tenantCities");

function tenantPrefix(req) {
  return req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
}

function tenantHomeHrefFromPrefix(prefix) {
  if (prefix === "" || prefix == null) return "/";
  const ps = String(prefix);
  if (ps.startsWith("http")) return `${ps.replace(/\/$/, "")}/`;
  return `${ps}/`;
}

function renderLocals(req, res, extra) {
  const prefix = tenantPrefix(req);
  const tenant = req.tenant;
  const showRegionPickerUi = !!req.isApexHost || (!!tenant && tenant.slug === "global");
  return {
    tenant,
    tenantUrlPrefix: prefix,
    tenantHomeHref: tenantHomeHrefFromPrefix(prefix),
    asset: res.locals.asset,
    brandProductName: res.locals.brandProductName,
    brandPublicTagline: res.locals.brandPublicTagline,
    regionChoices: req.regionChoices || [],
    regionZmUrl: req.regionZmUrl || "",
    regionIlUrl: req.regionIlUrl || "",
    isApexHost: !!req.isApexHost,
    showRegionPickerUi,
    renderRegionPickerTrigger: false,
    ...extra,
  };
}

module.exports = function fieldAgentRoutes() {
  const router = express.Router();

  router.use((req, res, next) => {
    if (!req.tenant || !req.tenant.id) {
      return res.status(404).type("text").send("Region not found.");
    }
    next();
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 12 },
  });

  router.get("/field-agent/signup", (req, res) => {
    if (getFieldAgentSession(req)) {
      return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`);
    }
    return res.render("field_agent/signup", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/signup", fieldAgentLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const username = String((req.body && req.body.username) || "")
      .trim()
      .toLowerCase();
    const password = String((req.body && req.body.password) || "");
    const displayName = String((req.body && req.body.display_name) || "").trim().slice(0, 120);
    if (!username || username.length < 2) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Username is required." }));
    }
    if (!password || password.length < 8) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Password must be at least 8 characters." }));
    }
    const existing = await fieldAgentsRepo.getByUsernameAndTenant(pool, username, tid);
    if (existing) {
      return res.status(400).render("field_agent/signup", renderLocals(req, res, { error: "Username already registered." }));
    }
    const hash = await bcrypt.hash(password, 12);
    const id = await fieldAgentsRepo.insertAgent(pool, {
      tenantId: tid,
      username,
      passwordHash: hash,
      displayName,
      phone: "",
    });
    setFieldAgentSession(req, { id, tenantId: tid, username, displayName });
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`));
  });

  router.get("/field-agent/login", (req, res) => {
    if (getFieldAgentSession(req)) {
      return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`);
    }
    return res.render("field_agent/login", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/login", fieldAgentLoginLimiter, async (req, res) => {
    const pool = getPgPool();
    const tid = req.tenant.id;
    const username = String((req.body && req.body.username) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const user = await authenticateFieldAgent(pool, username, password, tid);
    if (!user) {
      return res.status(400).render("field_agent/login", renderLocals(req, res, { error: "Invalid username or password." }));
    }
    setFieldAgentSession(req, {
      id: user.id,
      tenantId: tid,
      username: user.username,
      displayName: user.display_name || "",
    });
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard`));
  });

  router.post("/field-agent/logout", (req, res) => {
    clearFieldAgentSession(req);
    req.session.save(() => res.redirect(302, `${tenantPrefix(req)}/`));
  });

  router.get("/field-agent/dashboard", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const created = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "pending");
    const approved = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "approved");
    const rejected = await fieldAgentSubmissionsRepo.countByAgentAndStatus(pool, s.id, "rejected");
    const revenue30 = await fieldAgentSubmissionsRepo.sumCommissionLastDays(pool, s.id, 30);
    const rejectedRows = await fieldAgentSubmissionsRepo.listRejectedWithReason(pool, s.id, 20);
    return res.render("field_agent/dashboard", renderLocals(req, res, {
      fieldAgent: s,
      metricPending: created,
      metricApproved: approved,
      metricRejected: rejected,
      metricTotal: created + approved + rejected,
      revenue30,
      rejectedRows,
      submitted: req.query && req.query.submitted === "1",
      callback: req.query && req.query.callback === "1",
    }));
  });

  router.get("/field-agent/add-contact", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const joinTenantCities = await getTenantCitiesForClientAsync(pool, req.tenant.id);
    const joinCityWatermarkRotate = await getJoinCityWatermarkRotateAsync(pool, req.tenant.id);
    const phoneRulesPublic = await phoneRulesService.getPublicPhoneRulesForTenant(pool, req.tenant.id);
    return res.render("field_agent/add_contact", renderLocals(req, res, {
      joinTenantCities,
      joinCityWatermarkRotate,
      phoneRulesPublic,
    }));
  });

  router.post(
    "/field-agent/api/check-phone",
    requireFieldAgent,
    async (req, res) => {
      const pool = getPgPool();
      const tid = req.tenant.id;
      const phone = String((req.body && req.body.phone) || "").trim();
      const v = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
      if (!v.ok) {
        return res.status(400).json({ ok: false, error: v.error || "Invalid phone." });
      }
      const pNorm = await phoneRulesService.normalizePhoneForTenant(pool, tid, phone);
      const dupNorms = await phoneRulesService.expandDuplicateNormsForTenant(pool, tid, pNorm, "");
      const d1 = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(pool, tid, pNorm, "");
      if (d1.duplicate) {
        return res.json({ ok: true, duplicate: true, message: "Service provider exists in system." });
      }
      const d2 = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(pool, tid, dupNorms);
      if (d2.duplicate) {
        return res.json({ ok: true, duplicate: true, message: "Service provider exists in system." });
      }
      return res.json({ ok: true, duplicate: false });
    }
  );

  router.post(
    "/field-agent/add-contact/submit",
    requireFieldAgent,
    upload.fields([
      { name: "profile", maxCount: 1 },
      { name: "works", maxCount: 10 },
    ]),
    async (req, res) => {
      const pool = getPgPool();
      const s = getFieldAgentSession(req);
      const tid = req.tenant.id;
      const b = req.body || {};
      const phoneRaw = String(b.phone || "").trim();
      const whatsappRaw = String(b.whatsapp || "").trim();
      const firstName = String(b.first_name || "").trim().slice(0, 120);
      const lastName = String(b.last_name || "").trim().slice(0, 120);
      const profession = String(b.profession || "").trim().slice(0, 200);
      const city = String(b.city || "").trim().slice(0, 120);
      const pacra = String(b.pacra || "").trim().slice(0, 200);
      const addressStreet = String(b.address_street || "").trim().slice(0, 300);
      const addressLandmarks = String(b.address_landmarks || "").trim().slice(0, 300);
      const addressNeighbourhood = String(b.address_neighbourhood || "").trim().slice(0, 200);
      const addressCity = String(b.address_city || "").trim().slice(0, 120);
      const nrcNumber = String(b.nrc_number || "").trim().slice(0, 80);

      const vPhone = await phoneRulesService.validatePhoneForTenant(pool, tid, phoneRaw, "phone");
      if (!vPhone.ok) {
        return res.status(400).type("text").send(vPhone.error || "Invalid phone.");
      }
      if (whatsappRaw) {
        const vWa = await phoneRulesService.validatePhoneForTenant(pool, tid, whatsappRaw, "whatsapp");
        if (!vWa.ok) {
          return res.status(400).type("text").send(vWa.error || "Invalid WhatsApp number.");
        }
      }

      const pNorm = await phoneRulesService.normalizePhoneForTenant(pool, tid, phoneRaw);
      const wNorm = whatsappRaw ? await phoneRulesService.normalizePhoneForTenant(pool, tid, whatsappRaw) : "";

      if (!pNorm || !firstName || !lastName || !profession || !city || !nrcNumber) {
        return res.status(400).type("text").send("Missing required fields.");
      }
      const profileFiles = (req.files && req.files.profile) || [];
      const workFiles = (req.files && req.files.works) || [];
      if (profileFiles.length < 1) {
        return res.status(400).type("text").send("Profile photo is required.");
      }
      if (workFiles.length < 2 || workFiles.length > 10) {
        return res.status(400).type("text").send("Please upload between 2 and 10 work photos.");
      }

      const dupS = await fieldAgentSubmissionsRepo.duplicateExistsAgainstSubmissions(pool, tid, pNorm, wNorm, null);
      if (dupS.duplicate) {
        return res.status(400).type("text").send("Service provider exists in system.");
      }
      const dupCandidates = await phoneRulesService.expandDuplicateNormsForTenant(pool, tid, pNorm, wNorm);
      const dupC = await fieldAgentSubmissionsRepo.duplicateExistsCompaniesOrSignups(pool, tid, dupCandidates);
      if (dupC.duplicate) {
        return res.status(400).type("text").send("Service provider exists in system.");
      }

      const client = await pool.connect();
      let submissionId;
      try {
        await client.query("BEGIN");
        submissionId = await fieldAgentSubmissionsRepo.insertSubmission(pool, client, {
          tenantId: tid,
          fieldAgentId: s.id,
          phoneRaw,
          phoneNorm: pNorm,
          whatsappRaw,
          whatsappNorm: wNorm,
          firstName,
          lastName,
          profession,
          city,
          pacra,
          addressStreet,
          addressLandmarks,
          addressNeighbourhood,
          addressCity,
          nrcNumber,
          photoProfileUrl: "",
          workPhotosJson: "[]",
        });

        const profileUrls = await saveJpegImages(tid, submissionId, profileFiles, { maxFiles: 1 });
        const workUrls = await saveJpegImages(tid, submissionId, workFiles, { maxFiles: 10 });
        const profileUrl = profileUrls[0] || "";
        await fieldAgentSubmissionsRepo.updatePhotosAfterUpload(pool, client, {
          submissionId,
          tenantId: tid,
          photoProfileUrl: profileUrl,
          workPhotosJson: JSON.stringify(workUrls),
        });

        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        // eslint-disable-next-line no-console
        console.error("[getpro] field-agent submit:", e.message);
        return res.status(500).type("text").send("Could not save submission.");
      } finally {
        client.release();
      }

      const title = `Field agent provider · ${firstName} ${lastName}`.trim().slice(0, 200);
      const description = [
        `Phone: ${phoneRaw}`,
        `WhatsApp: ${whatsappRaw}`,
        `Profession: ${profession}`,
        `City: ${city}`,
        `PACRA: ${pacra}`,
        `Address: ${addressStreet}, ${addressLandmarks}, ${addressNeighbourhood}, ${addressCity}`,
        `NRC: ${nrcNumber}`,
        `Submission #${submissionId}`,
      ].join("\n");

      try {
        await notifyProviderSubmissionToCrm({
          tenantId: tid,
          submissionId,
          title,
          description,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[getpro] field-agent CRM notify:", e.message);
      }

      return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard?submitted=1`);
    }
  );

  router.get("/field-agent/call-me-back", requireFieldAgent, (req, res) => {
    return res.render("field_agent/callback", renderLocals(req, res, { error: null }));
  });

  router.post("/field-agent/call-me-back", requireFieldAgent, async (req, res) => {
    const pool = getPgPool();
    const s = getFieldAgentSession(req);
    const tid = req.tenant.id;
    const b = req.body || {};
    const firstName = String(b.first_name || "").trim().slice(0, 120);
    const lastName = String(b.last_name || "").trim().slice(0, 120);
    const phone = String(b.phone || "").trim().slice(0, 40);
    const email = String(b.email || "").trim().slice(0, 200);
    const locationCity = String(b.location_city || "").trim().slice(0, 120);
    if (!firstName || !lastName || !phone || !email || !locationCity) {
      return res.status(400).render("field_agent/callback", renderLocals(req, res, { error: "All fields are required." }));
    }
    const vPh = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
    if (!vPh.ok) {
      return res.status(400).render("field_agent/callback", renderLocals(req, res, { error: vPh.error || "Invalid phone." }));
    }
    const leadId = await fieldAgentCallbackLeadsRepo.insertCallbackLead(pool, null, {
      tenantId: tid,
      fieldAgentId: s.id,
      firstName,
      lastName,
      phone,
      email,
      locationCity,
    });
    try {
      await notifyCallbackLeadToCrm({
        tenantId: tid,
        leadId,
        title: `Field agent callback · ${firstName} ${lastName}`,
        description: `Phone: ${phone}\nEmail: ${email}\nLocation: ${locationCity}\nLead #${leadId}`,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[getpro] field-agent callback CRM:", e.message);
    }
    return res.redirect(302, `${tenantPrefix(req)}/field-agent/dashboard?callback=1`);
  });

  router.get("/field-agent/faq", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_faq", renderLocals(req, res, {}));
  });

  router.get("/field-agent/support", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_support", renderLocals(req, res, {}));
  });

  router.get("/field-agent/about", requireFieldAgent, (req, res) => {
    return res.render("field_agent/static_about", renderLocals(req, res, {}));
  });

  return router;
};
