/**
 * Intake, projects, portal-users, client lead status (same registration order as legacy).
 */
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const {
  requireDirectoryEditor,
  requireNotViewer,
  requireClientProjectIntakeAccess,
  requireClientProjectIntakeMutate,
} = require("../../auth");
const {
  buildIntakeProjectStatusListWithStore,
  summarizeAssignmentStatuses,
  sortToggleHref,
  buildProjectStatusHref,
} = require("../../intake/adminIntakeProjectStatus");
const { assignmentStatusLabelForPortal } = require("../../intake/intakeProjectCompanyViewModel");
const { getTenantCitiesForClientAsync } = require("../../tenants/tenantCities");
const clientIntake = require("../../intake/clientProjectIntake");
const {
  validateIntakeProjectForPublishAsync,
  INTAKE_PROJECT_PUBLISHABLE_STATUSES,
  getCategoryResponseWindowHoursAsync,
} = require("../../intake/intakeProjectPublishValidation");
const intakeProjectAllocation = require("../../intake/intakeProjectAllocation");
const phoneRulesService = require("../../phone/phoneRulesService");
const { redirectWithEmbed, getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const categoriesRepo = require("../../db/pg/categoriesRepo");
const companiesRepo = require("../../db/pg/companiesRepo");
const companyPersonnelUsersRepo = require("../../db/pg/companyPersonnelUsersRepo");
const tenantsRepo = require("../../db/pg/tenantsRepo");
const intakeClientsRepo = require("../../db/pg/intakeClientsRepo");
const intakeClientProjectsRepo = require("../../db/pg/intakeClientProjectsRepo");
const intakeProjectImagesRepo = require("../../db/pg/intakeProjectImagesRepo");
const intakePhoneOtpRepo = require("../../db/pg/intakePhoneOtpRepo");
const intakeAssignmentsRepo = require("../../db/pg/intakeAssignmentsRepo");
const intakeDealReviewsRepo = require("../../db/pg/intakeDealReviewsRepo");
const { canViewIntakePriceEstimation, canValidateDeals, canMutateClientProjectIntake } = require("../../auth/roles");
const { normalizeUrgency, listUrgencySelectOptions, urgencyLabel } = require("../../intake/dealUrgency");
const { computeDealPriceFromEstimation } = require("../../intake/dealPricing");
const { runDealValidatedOfferAllocation } = require("../../intake/intakeDealValidatedAllocation");
const { getCommerceSettingsForTenant } = require("../../tenants/tenantCommerceSettings");

module.exports = function registerAdminIntakeRoutes(router, deps) {
  const { projectIntakeUpload } = deps;
  // —— Client / project intake (“New Project”) ——
  async function intakeCityAllowed(pool, tenantId, cityName) {
    const names = (await getTenantCitiesForClientAsync(pool, tenantId)).map((c) => String(c.name).trim());
    const c = String(cityName || "").trim();
    return names.includes(c);
  }

  function intakeOtpBannerLocals() {
    const b = clientIntake.getIntakeOtpOperationalBanner();
    return b ? { intakeOtpBanner: b } : {};
  }

  function redirectProjectIntakeUploadError(req, res, err) {
    const clientId = Number((req.body && req.body.client_id) || 0);
    const base =
      clientId > 0
        ? `/admin/project-intake/project/new?clientId=${clientId}&error=`
        : "/admin/project-intake?error=";
    let msg = "Upload could not be processed. Use JPEG, PNG, WebP, or GIF and try again.";
    if (err.code === "LIMIT_FILE_SIZE") {
      msg = "Each image must be 5 MB or smaller. Choose smaller files or fewer images and try again.";
    } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
      msg = "You can attach up to 5 images. Remove extra files and try again.";
    } else if (err instanceof multer.MulterError) {
      msg = "Upload was rejected. Check image type and size, then try again.";
    }
    return res.redirect(redirectWithEmbed(req, base + encodeURIComponent(msg)));
  }

  function intakeMulterProjectImages(req, res, next) {
    projectIntakeUpload.array("images", 5)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        return redirectProjectIntakeUploadError(req, res, err);
      }
      return next(err);
    });
  }

  function renderProjectIntakeSearch(req, res, { phone, nrz, searched, foundClient, notice, error }) {
    const tid = getAdminTenantId(req);
    return res.render("admin/project_intake_search", {
      activeNav: "project_intake",
      navTitle: "New project",
      phone,
      nrz,
      searched,
      foundClient,
      notice: String(notice || "").trim().slice(0, 500),
      error: String(error || "").trim().slice(0, 500),
      tenantId: tid,
      ...intakeOtpBannerLocals(),
    });
  }

  router.get("/project-intake", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const phone = String((req.query && req.query.phone) || "").trim();
    const nrz = String((req.query && req.query.nrz) || "").trim();
    let foundClient = null;
    let searched = false;
    if (phone || nrz) {
      searched = true;
      foundClient = await clientIntake.findClientBySearchWithStore(pool, tid, { phone, nrz });
    }
    return renderProjectIntakeSearch(req, res, {
      phone,
      nrz,
      searched,
      foundClient,
      notice: (req.query && req.query.notice) || "",
      error: (req.query && req.query.error) || "",
    });
  });

  /** POST search: same tenant-scoped lookup as GET; does not require mutation (viewers may search). */
  router.post("/project-intake/search", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const b = req.body || {};
    const phone = String(b.phone || "").trim();
    const nrz = String(b.nrz || "").trim();
    let foundClient = null;
    const searched = !!(phone || nrz);
    if (searched) {
      foundClient = await clientIntake.findClientBySearchWithStore(pool, tid, { phone, nrz });
    }
    return renderProjectIntakeSearch(req, res, {
      phone,
      nrz,
      searched,
      foundClient,
      notice: "",
      error: "",
    });
  });

  router.get("/project-intake/clients/new", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const phone = String((req.query && req.query.phone) || "").trim();
    const nrz = String((req.query && req.query.nrz) || "").trim();
    return res.render("admin/project_intake_client_new", {
      activeNav: "project_intake",
      navTitle: "New client",
      tenantId: tid,
      form: {
        full_name: "",
        phone: phone || "",
        whatsapp_phone: "",
        nrz_number: nrz || "",
        address_street: "",
        address_house_number: "",
        address_apartment_number: "",
      },
      error: String((req.query && req.query.error) || "").trim().slice(0, 500),
      otpNotice: String((req.query && req.query.otp_notice) || "").trim().slice(0, 500),
    });
  });

  router.post("/project-intake/clients", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const uid = req.session.adminUser.id;
    const b = req.body || {};
    const external_client_reference = String(b.external_client_reference || "").trim().slice(0, 120);
    const full_name = String(b.full_name || "").trim().slice(0, 200);
    let phone = String(b.phone || "").trim();
    let whatsapp_phone = String(b.whatsapp_phone || "").trim();
    const whatsapp_same = b.whatsapp_same === "1" || b.whatsapp_same === "on" || b.whatsapp_same === true;
    if (whatsapp_same) whatsapp_phone = phone;
    const nrzRaw = String(b.nrz_number || "").trim();
    const address_street = String(b.address_street || "").trim().slice(0, 200);
    const address_house_number = String(b.address_house_number || "").trim().slice(0, 40);
    const address_apartment_number = String(b.address_apartment_number || "").trim().slice(0, 40);
    const send_otp_after = b.send_otp_after === "1" || b.send_otp_after === "on";

    if (!full_name) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent("Name is required.")));
    }
    const pv = await clientIntake.validatePhonesForTenantWithStore(pool, tid, phone, whatsapp_phone);
    if (!pv.ok) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(pv.error)));
    }
    phone = pv.phone;
    whatsapp_phone = pv.whatsapp || "";
    const nrzCheck = clientIntake.validateNrz(nrzRaw);
    if (!nrzCheck.ok) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(nrzCheck.error)));
    }
    const phoneNorm = clientIntake.normalizeDigits(phone);
    const nrzNorm = nrzCheck.value;

    const duplicateClient = await clientIntake.findClientBySearchWithStore(pool, tid, { phone, nrz: nrzRaw });
    if (duplicateClient) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${duplicateClient.id}&notice=` +
            encodeURIComponent(
              `Existing client reused — no duplicate was created. Client code ${duplicateClient.client_code} (${duplicateClient.full_name}). Continue with the project form below.`
            )
        )
      );
    }

    let client_code;
    try {
      client_code = await clientIntake.nextSequentialCodeWithStore(pool, tid, "client");
    } catch (e) {
      return res.status(400).send(e.message || "Could not allocate client code.");
    }

    let newClientId;
    try {
      newClientId = await intakeClientsRepo.insertClient(pool, {
        tenantId: tid,
        clientCode: client_code,
        externalClientReference: external_client_reference || null,
        fullName: full_name,
        phone,
        phoneNormalized: phoneNorm,
        whatsappPhone: whatsapp_phone,
        nrzNumber: nrzRaw,
        nrzNormalized: nrzNorm,
        addressStreet: address_street,
        addressHouseNumber: address_house_number,
        addressApartmentNumber: address_apartment_number,
        updatedByAdminUserId: uid,
      });
    } catch (e) {
      const msg = String(e.message || "");
      const uniquePg = e.code === "23505";
      if (msg.includes("UNIQUE") || uniquePg) {
        const again = await clientIntake.findClientBySearchWithStore(pool, tid, { phone, nrz: nrzRaw });
        if (again) {
          return res.redirect(
            redirectWithEmbed(
              req,
              `/admin/project-intake/project/new?clientId=${again.id}&notice=` +
                encodeURIComponent(
                  `Existing client reused (${again.client_code}). Another request may have created this record first—we opened their profile instead of duplicating.`
                )
            )
          );
        }
        if (external_client_reference) {
          const extDup = await intakeClientsRepo.findClientCodeByExtRef(pool, tid, external_client_reference);
          const dupMsg = extDup
            ? `That external reference is already used by client ${extDup.client_code} in this region. Enter a different reference or search by phone/NRZ to open that client.`
            : "That external client reference is already in use in this region. Use a different reference or search for the existing client.";
          return res.redirect(
            redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent(dupMsg))
          );
        }
        return res.redirect(
          redirectWithEmbed(req, "/admin/project-intake/clients/new?error=" + encodeURIComponent("Could not create client. Try again or search for an existing client."))
        );
      }
      return res.status(400).send(msg || "Could not create client.");
    }

    if (!newClientId) return res.status(400).send("Could not create client.");

    if (send_otp_after && phoneNorm) {
      const recent = await clientIntake.countRecentOtpSendsWithStore(pool, tid, phoneNorm);
      let otpNotice = "";
      let otpOk = "0";
      if (recent >= 5) {
        otpNotice =
          "Send OTP: rate limit reached (max 5 sends per phone per hour). The client was saved — try again later.";
        otpOk = "0";
      } else {
        const code = clientIntake.generateOtpDigits();
        const send = clientIntake.sendOtpPlaceholder({ phoneDisplay: phone, code });
        if (send.sent) {
          await intakePhoneOtpRepo.insertOtp(pool, {
            tenantId: tid,
            clientId: newClientId,
            phoneNormalized: phoneNorm,
            codeHash: clientIntake.hashOtpCode(code, tid, phoneNorm),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          });
          if (send.devMode) {
            otpNotice =
              "OTP issued successfully. This environment does not send SMS — check the server log for the verification code, then enter it below.";
            otpOk = "1";
          } else {
            otpNotice =
              "OTP sent by SMS. The client should receive the verification code shortly — ask them to enter it below.";
            otpOk = "1";
          }
        } else {
          otpNotice =
            "We could not send an OTP: " + (send.error || "SMS is not available in this environment.");
          otpOk = "0";
        }
      }
      const otpQ = "&otp_notice=" + encodeURIComponent(otpNotice) + "&otp_ok=" + otpOk;
      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${newClientId}${otpQ}`));
    }

    if (send_otp_after && !phoneNorm) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${newClientId}&otp_notice=` +
            encodeURIComponent(
              "We could not send an OTP: the phone number could not be normalized. The client was saved — fix the number and use Send OTP on the project page."
            ) +
            "&otp_ok=0"
        )
      );
    }

    return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${newClientId}`));
  });

  router.get("/project-intake/project/new", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const clientId = Number(req.query.clientId);
    if (!clientId || clientId < 1) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake?error=" + encodeURIComponent("Missing client.")));
    }
    const client = await intakeClientsRepo.getByIdAndTenant(pool, clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const cities = await getTenantCitiesForClientAsync(pool, tid);
    const catRows = await categoriesRepo.listByTenantId(pool, tid);
    const intakeCategories = catRows
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    return res.render("admin/project_intake_project", {
      activeNav: "project_intake",
      navTitle: "New project",
      client,
      cities,
      intakeCategories,
      urgencyOptions: listUrgencySelectOptions(),
      budget,
      error: String((req.query && req.query.error) || "").trim().slice(0, 500),
      otp_notice: String((req.query && req.query.otp_notice) || "").trim().slice(0, 500),
      otp_notice_ok:
        req.query && req.query.otp_ok === "1" ? true : req.query && req.query.otp_ok === "0" ? false : null,
      notice: String((req.query && req.query.notice) || "").trim().slice(0, 500),
      ...intakeOtpBannerLocals(),
    });
  });

  router.post(
    "/project-intake/projects",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    intakeMulterProjectImages,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const b = req.body || {};
      const clientId = Number(b.client_id);
      const client = await intakeClientsRepo.getByIdAndTenant(pool, clientId, tid);
      if (!client) return res.status(404).send("Client not found.");

      const city = String(b.city || "").trim();
      if (!city || !(await intakeCityAllowed(pool, tid, city))) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Choose a valid city from the list.")
          )
        );
      }
      const neighborhood = String(b.neighborhood || "").trim().slice(0, 120);
      const street_name = String(b.street_name || "").trim().slice(0, 200);
      const house_number = String(b.house_number || "").trim().slice(0, 40);
      const apartment_number = String(b.apartment_number || "").trim().slice(0, 40);
      const client_address_street = String(b.client_address_street || "").trim().slice(0, 200);
      const client_address_house_number = String(b.client_address_house_number || "").trim().slice(0, 40);
      const client_address_apartment_number = String(b.client_address_apartment_number || "").trim().slice(0, 40);
      const adminRole = req.session.adminUser && req.session.adminUser.role;
      let budgetVal = null;
      if (canViewIntakePriceEstimation(adminRole)) {
        const budgetRaw = String(b.estimated_budget || "").trim();
        budgetVal = budgetRaw === "" ? null : Number(budgetRaw);
        if (budgetRaw !== "" && (Number.isNaN(budgetVal) || budgetVal < 0)) {
          return res.redirect(
            redirectWithEmbed(
              req,
              `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Budget must be a non-negative number.")
            )
          );
        }
      }
      const intakeCategoryId = Number(b.intake_category_id);
      if (!intakeCategoryId || intakeCategoryId < 1) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Choose a profession / category for this project.")
          )
        );
      }
      const catOk = await categoriesRepo.getByIdAndTenantId(pool, intakeCategoryId, tid);
      if (!catOk) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Invalid category for this region.")
          )
        );
      }
      const urgency = normalizeUrgency(b.urgency);
      const budgetMeta = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
      const uid = req.session.adminUser.id;

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
          clientId,
          projectCode: project_code,
          clientFullNameSnapshot: String(client.full_name || ""),
          clientPhoneSnapshot: String(client.phone || ""),
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
          adminUserId: uid,
        });
      } catch (e) {
        return res.status(400).send(e.message || "Could not save project.");
      }

      try {
        await intakeClientsRepo.updateAddressFromProjectForm(pool, {
          street: client_address_street,
          houseNumber: client_address_house_number,
          apartmentNumber: client_address_apartment_number,
          updatedByAdminUserId: uid,
          clientId,
          tenantId: tid,
        });
      } catch (e) {
        return res.status(400).send(e.message || "Could not update client address.");
      }

      const files = req.files && Array.isArray(req.files) ? req.files : [];
      if (files.length > 5) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Maximum 5 images.")
          )
        );
      }

      try {
        const relPaths = await clientIntake.processAndSaveProjectImages(tid, projectId, files);
        let ord = 0;
        for (const rel of relPaths) {
          await intakeProjectImagesRepo.insertImage(pool, tid, projectId, rel, ord++);
        }
      } catch (e) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` +
              encodeURIComponent(e.message || "Image processing failed.")
          )
        );
      }

      const imageCount = await intakeProjectImagesRepo.countByProject(pool, tid, projectId);
      const savedProject = await intakeClientProjectsRepo.getByIdAndTenant(pool, projectId, tid);
      const pubVal = await validateIntakeProjectForPublishAsync(pool, tid, savedProject, imageCount);
      const nextLifecycle = pubVal.ok ? "ready_to_publish" : "needs_review";
      await intakeClientProjectsRepo.updateStatus(pool, { status: nextLifecycle, adminUserId: uid, projectId, tenantId: tid });

      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/success?projectId=${projectId}`));
    }
  );

  router.post(
    "/projects/:id/intake-quick-edit",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      const b = req.body || {};
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const fullRow = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
      if (!fullRow) return res.status(404).send("Project not found.");
      const st = String(fullRow.status || "").trim().toLowerCase();
      if (!INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(st)) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Quick edit is only allowed before publish."))
        );
      }
      const neighborhood = String(b.neighborhood || "").trim().slice(0, 120);
      const street_name = String(b.street_name || "").trim().slice(0, 200);
      const house_number = String(b.house_number || "").trim().slice(0, 40);
      const adminRole = req.session.adminUser && req.session.adminUser.role;
      let budgetVal = fullRow.estimated_budget_value;
      if (canViewIntakePriceEstimation(adminRole)) {
        const budgetRaw = String(b.estimated_budget || "").trim();
        const parsed = budgetRaw === "" ? null : Number(budgetRaw);
        if (budgetRaw !== "" && (Number.isNaN(parsed) || parsed < 0)) {
          return res.redirect(
            redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Budget must be a non-negative number."))
          );
        }
        budgetVal = parsed;
      }
      const urgency = normalizeUrgency(b.urgency != null && b.urgency !== "" ? b.urgency : fullRow.urgency);
      await intakeClientProjectsRepo.updateQuickEdit(pool, {
        neighborhood,
        streetName: street_name,
        houseNumber: house_number,
        budgetVal,
        urgency,
        adminUserId: uid,
        projectId: pid,
        tenantId: tid,
      });
      const full = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
      const imageCount = await intakeProjectImagesRepo.countByProject(pool, tid, pid);
      const pubVal = await validateIntakeProjectForPublishAsync(pool, tid, full, imageCount);
      const nextLifecycle = pubVal.ok ? "ready_to_publish" : "needs_review";
      await intakeClientProjectsRepo.updateStatus(pool, { status: nextLifecycle, adminUserId: uid, projectId: pid, tenantId: tid });
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Project details updated."))
      );
    }
  );

  router.post(
    "/projects/:id/deal-pricing",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const adminRole = req.session.adminUser && req.session.adminUser.role;
      if (!canViewIntakePriceEstimation(adminRole)) {
        return res.status(403).send("Forbidden.");
      }
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const b = req.body || {};
      const raw = String(b.price_estimation || "").trim();
      let priceEst = null;
      if (raw !== "") {
        priceEst = Number(raw);
        if (Number.isNaN(priceEst) || priceEst < 0) {
          return res.redirect(
            redirectWithEmbed(
              req,
              `/admin/projects/${pid}?error=` + encodeURIComponent("Price estimation must be empty or a non-negative number.")
            )
          );
        }
      }
      const commerce = await getCommerceSettingsForTenant(pool, tid);
      const dealPrice = computeDealPriceFromEstimation(priceEst, commerce.deal_price_percentage);
      await intakeClientProjectsRepo.updatePriceEstimationInternal(pool, {
        priceEstimation: priceEst,
        dealPrice,
        adminUserId: uid,
        projectId: pid,
        tenantId: tid,
      });
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Internal pricing updated."))
      );
    }
  );

  router.post(
    "/projects/:id/deal-validation",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const adminRole = req.session.adminUser && req.session.adminUser.role;
      if (!canValidateDeals(adminRole)) {
        return res.status(403).send("Forbidden.");
      }
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const action = String((req.body && req.body.validation_action) || "")
        .trim()
        .toLowerCase();
      let st = "pending";
      if (action === "validate" || action === "validated") st = "validated";
      else if (action === "reject" || action === "rejected") st = "rejected";
      else if (action === "pending" || action === "reset") st = "pending";
      else {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Invalid validation action."))
        );
      }
      await intakeClientProjectsRepo.updateDealValidationStatus(pool, {
        status: st,
        adminUserId: uid,
        projectId: pid,
        tenantId: tid,
      });
      if (st === "validated") {
        try {
          await runDealValidatedOfferAllocation(pool, tid, pid);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error("[getpro] deal validated offer allocation:", e && e.message ? e.message : e);
        }
      }
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Deal validation updated."))
      );
    }
  );

  router.post(
    "/project-intake/projects/:id/publish",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const project = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
      if (!project) return res.status(404).send("Project not found.");
      const st = String(project.status || "").trim().toLowerCase();
      if (st === "published" || st === "closed") {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Project is already published or closed."))
        );
      }
      if (!INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(st)) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("This project cannot be published from its current state."))
        );
      }
      const imageCount = await intakeProjectImagesRepo.countByProject(pool, tid, pid);
      const pubVal = await validateIntakeProjectForPublishAsync(pool, tid, project, imageCount);
      if (!pubVal.ok) {
        const msg = pubVal.errors.map((e) => e.message).join(" ");
        return res.redirect(redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent(msg || "Project is not ready to publish.")));
      }
      await intakeClientProjectsRepo.updatePublished(pool, uid, pid, tid);
      await intakeProjectAllocation.onProjectPublished(pool, tid, pid, uid);
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Project published. Eligible providers are assigned per allocation rules; companies see leads in the portal when assigned."))
      );
    }
  );

  router.get("/project-intake/success", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const projectId = Number(req.query.projectId);
    if (!projectId || projectId < 1) return res.redirect(redirectWithEmbed(req, "/admin/project-intake"));
    const project = await intakeClientProjectsRepo.getSuccessView(pool, projectId, tid);
    const images = await intakeProjectImagesRepo.listByProject(pool, tid, projectId);
    if (!project) return res.status(404).send("Project not found.");
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    const imageCount = images.length;
    const publishValidation = await validateIntakeProjectForPublishAsync(pool, tid, project, imageCount);
    const lifecycle = String(project.status || "").trim().toLowerCase();
    const showPublishOnSuccess = INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(lifecycle);
    return res.render("admin/project_intake_success", {
      activeNav: "project_intake",
      navTitle: "Project saved",
      project,
      images,
      budget,
      imageCount,
      publishValidation,
      showPublishOnSuccess,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(project.status),
    });
  });

  router.get("/project-intake/files/:id", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const row = await intakeProjectImagesRepo.getByIdAndTenant(pool, id, tid);
    if (!row) return res.status(404).send("Not found.");
    const abs = clientIntake.safeAbsoluteImagePath(row.image_path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).send("File missing.");
    return res.type("jpeg").sendFile(path.resolve(abs));
  });

  router.post("/project-intake/otp/send", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const clientId = Number((req.body && req.body.client_id) || 0);
    if (!clientId || clientId < 1) return res.status(400).send("Invalid client.");
    const client = await intakeClientsRepo.getByIdAndTenant(pool, clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();
    if (!phoneNorm) return res.status(400).send("Client has no phone on file.");

    const recent = await clientIntake.countRecentOtpSendsWithStore(pool, tid, phoneNorm);
    if (recent >= 5) {
      return res.redirect(
        redirectWithEmbed(
          req,
          "/admin/project-intake/project/new?clientId=" +
            clientId +
            "&otp_notice=" +
            encodeURIComponent(
              "Send OTP: rate limit reached (max 5 sends per phone per hour). Try again later."
            ) +
            "&otp_ok=0"
        )
      );
    }

    const code = clientIntake.generateOtpDigits();
    const send = clientIntake.sendOtpPlaceholder({ phoneDisplay: client.phone, code });
    if (!send.sent) {
      const next =
        "/admin/project-intake/project/new?clientId=" +
        clientId +
        "&otp_notice=" +
        encodeURIComponent(
          "We could not send an OTP: " + (send.error || "No verification code was created.")
        ) +
        "&otp_ok=0";
      return res.redirect(redirectWithEmbed(req, next));
    }
    await intakePhoneOtpRepo.insertOtp(pool, {
      tenantId: tid,
      clientId,
      phoneNormalized: phoneNorm,
      codeHash: clientIntake.hashOtpCode(code, tid, phoneNorm),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const okMsg = send.devMode
      ? "OTP issued successfully. This environment does not send SMS — check the server log for the code, then enter it below."
      : "OTP sent by SMS. The client should receive the code shortly — enter it below to verify.";
    const next =
      "/admin/project-intake/project/new?clientId=" +
      clientId +
      "&otp_notice=" +
      encodeURIComponent(okMsg) +
      "&otp_ok=1";
    return res.redirect(redirectWithEmbed(req, next));
  });

  router.post("/project-intake/otp/verify", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const uid = req.session.adminUser.id;
    const clientId = Number((req.body && req.body.client_id) || 0);
    const code = String((req.body && req.body.otp_code) || "").trim();
    if (!clientId || clientId < 1) return res.status(400).send("Invalid client.");
    if (!/^\d{6}$/.test(code)) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Enter the 6-digit code from the SMS or server log, then try again.")
        )
      );
    }
    const client = await intakeClientsRepo.getByIdAndTenant(pool, clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();

    const row = await intakePhoneOtpRepo.getActiveOtpForClientPhone(pool, tid, clientId, phoneNorm);
    if (!row) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("No active OTP for this client’s current phone. Send a code first.") +
            "&otp_ok=0"
        )
      );
    }
    if (String(row.phone_normalized || "") !== phoneNorm) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("OTP does not match this client’s phone on file.") +
            "&otp_ok=0"
        )
      );
    }
    const attempts = Number(row.attempts) + 1;
    if (attempts > Number(row.max_attempts)) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Too many failed attempts. Request a new code.") +
            "&otp_ok=0"
        )
      );
    }
    const ok = clientIntake.verifyOtpCodeHash(code, row.code_hash, tid, row.phone_normalized);
    if (!ok) {
      await intakePhoneOtpRepo.updateAttempts(pool, attempts, row.id, tid);
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Incorrect code. Check the number and try again.") +
            "&otp_ok=0"
        )
      );
    }
    await intakePhoneOtpRepo.markVerified(pool, attempts, row.id, tid);
    await intakeClientsRepo.setPhoneVerified(pool, uid, clientId, tid);
    return res.redirect(
      redirectWithEmbed(
        req,
        `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
          encodeURIComponent("Phone verified successfully.") +
          "&otp_ok=1"
      )
    );
  });

  router.get("/projects", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const projects = await intakeClientProjectsRepo.listForAdminProjectsPage(pool, tid, 400);
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    return res.render("admin/projects_list", {
      activeNav: "projects",
      navTitle: "Intake projects",
      projects,
      budget,
      intakeProjectStatusLabel: clientIntake.intakeProjectStatusLabel,
      urgencyLabel,
    });
  });

  router.get("/projects/:id", requireClientProjectIntakeAccess, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const pid = Number(req.params.id);
    if (!pid || pid < 1) return res.status(400).send("Invalid id.");
    const project = await intakeClientProjectsRepo.getDetailWithJoins(pool, pid, tid);
    if (!project) return res.status(404).send("Project not found.");
    const lifecycle = String(project.status || "").trim().toLowerCase();
    if (lifecycle === "published") {
      await intakeProjectAllocation.processPublishedProjectAllocation(pool, tid, pid);
    }
    const images = await intakeProjectImagesRepo.listByProject(pool, tid, pid);
    const imageCount = images.length;
    const publishValidation = await validateIntakeProjectForPublishAsync(pool, tid, project, imageCount);
    const showPublishOnDetail = INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(lifecycle);
    const assignments = await intakeAssignmentsRepo.listDetailForProject(pool, pid, tid);
    const companies = await companiesRepo.listIdNameSubdomainForTenant(pool, tid);
    const assignedIds = new Set(assignments.map((a) => Number(a.company_id)));
    const assignableCompanies = companies.filter((c) => !assignedIds.has(Number(c.id)));
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    const commerce = await getCommerceSettingsForTenant(pool, tid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    const dealReviews = await intakeDealReviewsRepo.listForProject(pool, tid, pid);
    const adminRole = req.session.adminUser && req.session.adminUser.role;
    const showCloseProject = lifecycle === "published" && canMutateClientProjectIntake(adminRole);
    return res.render("admin/intake_project_detail", {
      activeNav: "projects",
      navTitle: `Project ${project.project_code}`,
      project,
      images,
      imageCount,
      publishValidation,
      showPublishOnDetail,
      assignments,
      assignableCompanies,
      budget,
      commerce,
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(project.status),
      assignmentStatusLabelForPortal,
      dealReviews,
      showCloseProject,
      error: error || null,
      notice: notice || null,
      intakeFileBase: "/admin/project-intake/files/",
      urgencyLabel,
      urgencyOptions: listUrgencySelectOptions(),
    });
  });

  router.post(
    "/projects/:id/close",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const project = await intakeClientProjectsRepo.getByIdAndTenant(pool, pid, tid);
      if (!project) return res.status(404).send("Project not found.");
      const st = String(project.status || "").trim().toLowerCase();
      if (st !== "published") {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Only published projects can be marked closed."))
        );
      }
      await intakeClientProjectsRepo.updateStatus(pool, {
        status: "closed",
        adminUserId: uid,
        projectId: pid,
        tenantId: tid,
      });
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/projects/${pid}?notice=` + encodeURIComponent("Project marked closed. Eligible parties can submit post-completion reviews.")
        )
      );
    }
  );

  router.post(
    "/projects/:id/assignments",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const companyId = Number((req.body && req.body.company_id) || 0);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1 || !companyId || companyId < 1) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Choose a company."));
      }
      const projectOk = await intakeClientProjectsRepo.existsByIdAndTenant(pool, pid, tid);
      if (!projectOk) return res.status(404).send("Project not found.");
      const company = await companiesRepo.getByIdAndTenantId(pool, companyId, tid);
      if (!company) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Company not in this region."));
      }
      const projRow = await intakeClientProjectsRepo.getStatusAndCategory(pool, pid, tid);
      const stPub = String((projRow && projRow.status) || "")
        .trim()
        .toLowerCase();
      let responseDeadline = null;
      if (stPub === "published" && projRow && projRow.intake_category_id) {
        const h = await getCategoryResponseWindowHoursAsync(pool, tid, Number(projRow.intake_category_id));
        const hrs = Math.max(1, Math.floor(Number(h) || 72));
        const dr = await pool.query(`SELECT (now() + ($1::int * interval '1 hour')) AS d`, [hrs]);
        const d = dr.rows[0].d;
        responseDeadline =
          d instanceof Date ? d.toISOString().replace("T", " ").slice(0, 19) : d != null ? String(d) : null;
      }
      try {
        await intakeAssignmentsRepo.insertPendingManual(pool, {
          tenantId: tid,
          projectId: pid,
          companyId,
          adminUserId: uid,
          responseDeadlineAt: responseDeadline,
        });
      } catch (e) {
        const msg = String(e.message || "");
        const uniquePg = e.code === "23505";
        if (msg.includes("UNIQUE") || uniquePg) {
          return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("That company is already assigned."));
        }
        return res.status(400).send(msg || "Could not assign.");
      }
      return res.redirect(`/admin/projects/${pid}?notice=` + encodeURIComponent("Assignment added."));
    }
  );

  router.post(
    "/projects/:id/assignments/:assignmentId/delete",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    async (req, res) => {
      const tid = getAdminTenantId(req);
      const pool = getPgPool();
      const pid = Number(req.params.id);
      const aid = Number(req.params.assignmentId);
      const row = await intakeAssignmentsRepo.getByIdProjectTenant(pool, aid, tid, pid);
      if (!row) return res.status(404).send("Assignment not found.");
      await intakeAssignmentsRepo.deleteById(pool, aid, tid);
      return res.redirect(`/admin/projects/${pid}?notice=` + encodeURIComponent("Assignment removed."));
    }
  );

  router.get("/companies/:id/portal-users", requireDirectoryEditor, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const cid = Number(req.params.id);
    const company = await companiesRepo.getByIdAndTenantId(pool, cid, tid);
    if (!company) return res.status(404).send("Company not found.");
    const tenantRow = await tenantsRepo.getById(pool, tid);
    const users = await companyPersonnelUsersRepo.listForAdminByTenantAndCompany(pool, tid, cid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    return res.render("admin/company_portal_users", {
      activeNav: "companies",
      navTitle: "Portal users",
      company: { id: company.id, name: company.name, subdomain: company.subdomain },
      tenantRegionLabel: tenantRow
        ? `${String(tenantRow.name || "").trim() || "Region"} (${String(tenantRow.slug || "").trim()})`
        : "",
      users,
      error: error || null,
      notice: notice || null,
    });
  });

  router.post("/companies/:id/portal-users", requireDirectoryEditor, requireNotViewer, async (req, res) => {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const cid = Number(req.params.id);
    const company = await companiesRepo.getByIdAndTenantId(pool, cid, tid);
    if (!company) return res.status(404).send("Company not found.");
    const full_name = String((req.body && req.body.full_name) || "").trim().slice(0, 200);
    let username = String((req.body && req.body.username) || "").trim().toLowerCase().slice(0, 60);
    if (username && !/^[a-z0-9_]+$/.test(username)) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Username may contain letters, digits, and underscores only."));
    }
    const phone = String((req.body && req.body.phone) || "").trim();
    const password = String((req.body && req.body.password) || "");
    const nrzRaw = String((req.body && req.body.nrz_number) || "").trim();
    const nrzCheck = clientIntake.validateNrz(nrzRaw);
    if (!nrzCheck.ok) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent(nrzCheck.error));
    }
    if (!full_name || !password) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Name and password are required."));
    }
    const phoneNorm = phone ? clientIntake.normalizeDigits(phone) : "";
    if (!username && !phoneNorm) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Enter a phone number or a username."));
    }
    if (phoneNorm) {
      const vp = await phoneRulesService.validatePhoneForTenant(pool, tid, phone, "phone");
      if (!vp.ok) {
        return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent(vp.error || "Invalid phone for this region."));
      }
    }
    if (nrzCheck.value) {
      const nrzDup = await companyPersonnelUsersRepo.findIdByTenantAndNrzUpper(pool, tid, nrzCheck.value);
      if (nrzDup) {
        return res.redirect(
          `/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("That NRZ number is already used by another portal user in this region.")
        );
      }
    }
    let passwordHash;
    try {
      passwordHash = await bcrypt.hash(password, 11);
    } catch (e) {
      return res.status(500).send("Could not hash password.");
    }
    try {
      await companyPersonnelUsersRepo.insertPortalUserAdmin(pool, {
        tenantId: tid,
        companyId: cid,
        fullName: full_name,
        username: username || "",
        phoneNormalized: phoneNorm,
        nrzNumber: nrzCheck.value || "",
        passwordHash: passwordHash,
      });
    } catch (e) {
      if (e.code === "23505" || String(e.message || "").includes("UNIQUE")) {
        return res.redirect(
          `/admin/companies/${cid}/portal-users?error=` +
            encodeURIComponent("That phone or username is already registered for portal login in this region.")
        );
      }
      return res.status(400).send(String(e.message || "Could not create user."));
    }
    return res.redirect(`/admin/companies/${cid}/portal-users?notice=` + encodeURIComponent("Portal user created."));
  });

  async function renderClientLeadStatus(req, res) {
    const tid = getAdminTenantId(req);
    const pool = getPgPool();
    const q = req.query || {};
    const list = await buildIntakeProjectStatusListWithStore(pool, tid, q);
    const budget = await clientIntake.getBudgetMetaForTenantWithStore(pool, tid);
    const rowsView = list.rows.map((r) => ({
      ...r,
      assign_summary: summarizeAssignmentStatuses(r.assign_statuses_raw),
    }));
    const { companies, cities, sort, dir, filters, total, page, maxPage, pageSize } = list;
    return res.render("admin/intake_project_status", {
      activeNav: "client_lead_status",
      navTitle: "Client Lead Status",
      rows: rowsView,
      companies,
      cities,
      sort,
      dir,
      filters,
      total,
      page,
      maxPage,
      pageSize,
      budget,
      intakeProjectStatusLabel: clientIntake.intakeProjectStatusLabel,
      sortToggleHref: (col) => sortToggleHref(filters, col, sort, dir),
      resetHref: buildProjectStatusHref({}, "created_at", "desc"),
      projectStatusPageHref: (p) => buildProjectStatusHref({ ...filters, page: p > 1 ? String(p) : "" }, sort, dir),
    });
  }

  router.get("/client-lead-status", requireClientProjectIntakeAccess, renderClientLeadStatus);
  router.get("/project-status", requireClientProjectIntakeAccess, renderClientLeadStatus);
};
