const express = require("express");
const multer = require("multer");
const clientIntake = require("../intake/clientProjectIntake");
const { getPgPool } = require("../db/pg");
const categoriesRepo = require("../db/pg/categoriesRepo");
const intakeClientsRepo = require("../db/pg/intakeClientsRepo");
const intakeClientProjectsRepo = require("../db/pg/intakeClientProjectsRepo");
const intakeProjectImagesRepo = require("../db/pg/intakeProjectImagesRepo");
const { getTenantCitiesForClientAsync } = require("../tenants/tenantCities");
const { normalizeUrgency, listUrgencySelectOptions } = require("../intake/dealUrgency");
const { validateIntakeProjectForPublishAsync } = require("../intake/intakeProjectPublishValidation");
const { getCtaVoiceProfile } = require("../seo/ctaVoice");
const intakeDealReviewsRepo = require("../db/pg/intakeDealReviewsRepo");

function requirePublicTenant(req, res, next) {
  if (!req.tenant || !req.tenant.id) {
    return res.status(404).type("text").send("Region not found.");
  }
  return next();
}

function clientBasePath(req) {
  const b = req.baseUrl != null && String(req.baseUrl).length > 0 ? String(req.baseUrl) : "/client";
  return b.replace(/\/$/, "") || "/client";
}

async function intakeCityAllowed(pool, tenantId, cityName) {
  const names = (await getTenantCitiesForClientAsync(pool, tenantId)).map((c) => String(c.name).trim());
  return names.includes(String(cityName || "").trim());
}

/**
 * End-client portal: public tenant-scoped routes (separate session model from admin / provider).
 */
module.exports = function clientPortalRoutes() {
  const router = express.Router();
  const projectUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: clientIntake.MAX_IMAGE_BYTES, files: 5 },
  });

  router.use((req, res, next) => {
    res.locals.clientPortalBasePath = clientBasePath(req);
    next();
  });

  function dealUpload(req, res, next) {
    projectUpload.array("images", 5)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const base = clientBasePath(req);
        return res.redirect(
          `${base}/deals/new?error=` + encodeURIComponent("Upload check failed. Use up to 5 images, 5 MB each.")
        );
      }
      return next(err);
    });
  }

  router.get("/login", requirePublicTenant, (req, res) => {
    const cb = clientBasePath(req);
    return res.render("client_login", {
      tenant: req.tenant,
      tenantUrlPrefix: req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "",
      clientPortalBasePath: cb,
      notice: String((req.query && req.query.notice) || "").trim().slice(0, 400) || null,
    });
  });

  router.get("/", requirePublicTenant, (req, res) => {
    return res.redirect(`${clientBasePath(req)}/login`);
  });

  router.get("/deals/new", requirePublicTenant, async (req, res) => {
    const tid = req.tenant.id;
    const pool = getPgPool();
    const cities = await getTenantCitiesForClientAsync(pool, tid);
    const catRows = await categoriesRepo.listByTenantId(pool, tid);
    const intakeCategories = catRows
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
    return res.render("client_deal_new", {
      tenant: req.tenant,
      clientPortalBasePath: clientBasePath(req),
      cities,
      intakeCategories,
      urgencyOptions: listUrgencySelectOptions(),
      form: {},
      error: String((req.query && req.query.error) || "").trim().slice(0, 500) || null,
      ctaVoice: getCtaVoiceProfile(req),
    });
  });

  router.post("/deals", requirePublicTenant, dealUpload, async (req, res) => {
    const tid = req.tenant.id;
    const pool = getPgPool();
    const b = req.body || {};
    const base = clientBasePath(req);
    const redirectErr = (msg) => res.redirect(`${base}/deals/new?error=` + encodeURIComponent(msg));

    const full_name = String(b.full_name || "").trim().slice(0, 200);
    let phone = String(b.phone || "").trim();
    if (!full_name) return redirectErr("Name is required.");
    const pv = await clientIntake.validatePhonesForTenantWithStore(pool, tid, phone, "");
    if (!pv.ok) return redirectErr(pv.error);
    phone = pv.phone;

    const city = String(b.city || "").trim();
    if (!city || !(await intakeCityAllowed(pool, tid, city))) {
      return redirectErr("Choose a valid city from the list.");
    }
    const intakeCategoryId = Number(b.intake_category_id);
    if (!intakeCategoryId || intakeCategoryId < 1) {
      return redirectErr("Choose a profession / category.");
    }
    const catOk = await categoriesRepo.getByIdAndTenantId(pool, intakeCategoryId, tid);
    if (!catOk) return redirectErr("Invalid category for this region.");

    const urgency = normalizeUrgency(b.urgency);
    const neighborhood = String(b.neighborhood || "").trim().slice(0, 120);
    const street_name = String(b.street_name || "").trim().slice(0, 200);
    const house_number = String(b.house_number || "").trim().slice(0, 40);
    const apartment_number = String(b.apartment_number || "").trim().slice(0, 40);
    const client_address_street = String(b.client_address_street || "").trim().slice(0, 200);
    const client_address_house_number = String(b.client_address_house_number || "").trim().slice(0, 40);
    const client_address_apartment_number = String(b.client_address_apartment_number || "").trim().slice(0, 40);

    let budgetVal = null;
    const budgetRaw = String(b.estimated_budget || "").trim();
    if (budgetRaw !== "") {
      budgetVal = Number(budgetRaw);
      if (Number.isNaN(budgetVal) || budgetVal < 0) {
        return redirectErr("Rough budget must be empty or a non-negative number.");
      }
    }

    const phoneNorm = clientIntake.normalizeDigits(phone);
    let client = await clientIntake.findClientBySearchWithStore(pool, tid, { phone, nrz: "" });
    if (!client) {
      let client_code;
      try {
        client_code = await clientIntake.nextSequentialCodeWithStore(pool, tid, "client");
      } catch (e) {
        return res.status(400).send(e.message || "Could not allocate client code.");
      }
      const newId = await intakeClientsRepo.insertClient(pool, {
        tenantId: tid,
        clientCode: client_code,
        externalClientReference: "",
        fullName: full_name,
        phone,
        phoneNormalized: phoneNorm,
        whatsappPhone: "",
        nrzNumber: "",
        nrzNormalized: "",
        addressStreet: "",
        addressHouseNumber: "",
        addressApartmentNumber: "",
        updatedByAdminUserId: null,
      });
      client = await intakeClientsRepo.getByIdAndTenant(pool, newId, tid);
    }

    if (!client) return res.status(400).send("Could not resolve client.");

    const budgetMeta = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    let project_code;
    try {
      project_code = await clientIntake.nextSequentialCodeWithStore(pool, tid, "project");
    } catch (e) {
      return res.status(400).send(e.message || "Could not allocate project code.");
    }

    let projectId;
    try {
      projectId = await intakeClientProjectsRepo.insertDraftProject(pool, {
        tenantId: tid,
        clientId: client.id,
        projectCode: project_code,
        clientFullNameSnapshot: String(client.full_name || full_name),
        clientPhoneSnapshot: String(client.phone || phone),
        city,
        neighborhood,
        streetName: street_name,
        houseNumber: house_number,
        apartmentNumber: apartment_number,
        clientAddressStreet: client_address_street,
        clientAddressHouseNumber: client_address_house_number,
        clientAddressApartmentNumber: client_address_apartment_number,
        estimatedBudgetValue: budgetVal,
        estimatedBudgetCurrency: budgetMeta.code,
        intakeCategoryId,
        urgency,
        adminUserId: null,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not save project.");
    }

    try {
      await intakeClientsRepo.updateAddressFromProjectForm(pool, {
        street: client_address_street,
        houseNumber: client_address_house_number,
        apartmentNumber: client_address_apartment_number,
        updatedByAdminUserId: null,
        clientId: client.id,
        tenantId: tid,
      });
    } catch (e) {
      return res.status(400).send(e.message || "Could not update client address.");
    }

    const files = req.files && Array.isArray(req.files) ? req.files : [];
    if (files.length > 5) {
      return redirectErr("Maximum 5 images.");
    }
    try {
      const relPaths = await clientIntake.processAndSaveProjectImages(tid, projectId, files);
      let ord = 0;
      for (const rel of relPaths) {
        await intakeProjectImagesRepo.insertImage(pool, tid, projectId, rel, ord++);
      }
    } catch (e) {
      return redirectErr(e.message || "Image processing failed.");
    }

    const imageCount = await intakeProjectImagesRepo.countByProject(pool, tid, projectId);
    const savedProject = await intakeClientProjectsRepo.getByIdAndTenant(pool, projectId, tid);
    const pubVal = await validateIntakeProjectForPublishAsync(pool, tid, savedProject, imageCount);
    const nextLifecycle = pubVal.ok ? "ready_to_publish" : "needs_review";
    await intakeClientProjectsRepo.updateStatus(pool, {
      status: nextLifecycle,
      adminUserId: null,
      projectId,
      tenantId: tid,
    });

    return res.render("client_deal_success", {
      tenant: req.tenant,
      clientPortalBasePath: base,
      projectCode: project_code,
    });
  });

  router.get("/review", requirePublicTenant, async (req, res) => {
    const base = clientBasePath(req);
    const err = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    const project_code = String((req.query && req.query.project_code) || "").trim();
    return res.render("client_deal_review", {
      tenant: req.tenant,
      clientPortalBasePath: base,
      error: err || null,
      notice: notice || null,
      project_code,
      phone: "",
      body: "",
      rating: "",
      interestedRows: null,
      assignment_id: "",
    });
  });

  router.post("/review", requirePublicTenant, async (req, res) => {
    const tid = req.tenant.id;
    const pool = getPgPool();
    const base = clientBasePath(req);
    const b = req.body || {};
    const project_code = String(b.project_code || "").trim();
    const phoneRaw = String(b.phone || "").trim();
    const rating = Number(b.rating);
    const body = String(b.body || "").trim().slice(0, 4000);
    const assignment_id = Number(b.assignment_id);

    const renderForm = (payload) =>
      res.render("client_deal_review", {
        tenant: req.tenant,
        clientPortalBasePath: base,
        error: payload.error || null,
        notice: payload.notice || null,
        project_code: payload.project_code != null ? payload.project_code : project_code,
        phone: payload.phone != null ? payload.phone : phoneRaw,
        body: payload.body != null ? payload.body : body,
        rating: payload.rating != null ? payload.rating : rating,
        interestedRows: payload.interestedRows != null ? payload.interestedRows : null,
        assignment_id: payload.assignment_id != null ? payload.assignment_id : "",
      });

    const pv = await clientIntake.validatePhonesForTenantWithStore(pool, tid, phoneRaw, "");
    if (!pv.ok) {
      return renderForm({
        error: pv.error || "Invalid phone.",
        phone: phoneRaw,
        body,
        rating,
      });
    }
    const phoneNorm = clientIntake.normalizeDigits(pv.phone);

    const ctx = await intakeDealReviewsRepo.resolveClientReviewContext(pool, {
      tenantId: tid,
      projectCode: project_code,
      phoneNormalized: phoneNorm,
      assignmentId: Number.isFinite(assignment_id) && assignment_id > 0 ? assignment_id : null,
    });

    if (!ctx.ok) {
      if (ctx.code === "pick_provider") {
        return renderForm({
          error: "Multiple providers were interested — choose which one you are rating.",
          phone: pv.phone,
          body,
          rating,
          interestedRows: ctx.interestedRows,
        });
      }
      const msg =
        ctx.code === "not_found"
          ? "Project not found. Check the project code."
          : ctx.code === "not_eligible"
            ? "Reviews are only available after the job is marked closed."
            : ctx.code === "phone_mismatch"
              ? "Phone number does not match the client on file for this project."
              : ctx.code === "no_interested"
                ? "There is no interested provider on file for this project."
                : ctx.code === "bad_assignment"
                  ? "Invalid provider selection."
                  : "Could not submit review.";
      return res.redirect(`${base}/review?error=` + encodeURIComponent(msg) + `&project_code=` + encodeURIComponent(project_code));
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return renderForm({
        error: "Choose a rating from 1 to 5.",
        phone: pv.phone,
        body,
        rating: "",
      });
    }

    const ins = await intakeDealReviewsRepo.insertClientReview(pool, {
      tenantId: tid,
      assignmentId: ctx.assignmentId,
      clientId: ctx.clientId,
      clientFullName: ctx.clientFullName,
      rating,
      body,
    });

    if (!ins.ok) {
      const msg = ins.code === "duplicate" ? "You already submitted a review for this job." : "Could not save your review.";
      return res.redirect(`${base}/review?error=` + encodeURIComponent(msg) + `&project_code=` + encodeURIComponent(project_code));
    }

    return res.redirect(
      `${base}/review?notice=` +
        encodeURIComponent("Thank you — your review was published on the provider's public listing.") +
        `&project_code=` +
        encodeURIComponent(project_code)
    );
  });

  return router;
};
