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
  buildIntakeProjectStatusList,
  summarizeAssignmentStatuses,
  sortToggleHref,
  buildProjectStatusHref,
} = require("../../intake/adminIntakeProjectStatus");
const { assignmentStatusLabelForPortal } = require("../../intake/intakeProjectCompanyViewModel");
const { getTenantCitiesForClient } = require("../../tenants/tenantCities");
const clientIntake = require("../../intake/clientProjectIntake");
const {
  validateIntakeProjectForPublish,
  INTAKE_PROJECT_PUBLISHABLE_STATUSES,
  getCategoryResponseWindowHours,
} = require("../../intake/intakeProjectPublishValidation");
const intakeProjectAllocation = require("../../intake/intakeProjectAllocation");
const { isValidPhoneForTenant } = require("../../tenants");
const { redirectWithEmbed, getAdminTenantId } = require("./adminShared");

module.exports = function registerAdminIntakeRoutes(router, deps) {
  const { db, projectIntakeUpload } = deps;
  // —— Client / project intake (“New Project”) ——
  function intakeCityAllowed(dbConn, tenantId, cityName) {
    const names = getTenantCitiesForClient(dbConn, tenantId).map((c) => String(c.name).trim());
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

  router.get("/project-intake", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const phone = String((req.query && req.query.phone) || "").trim();
    const nrz = String((req.query && req.query.nrz) || "").trim();
    let foundClient = null;
    let searched = false;
    if (phone || nrz) {
      searched = true;
      foundClient = clientIntake.findClientBySearch(db, tid, { phone, nrz });
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
  router.post("/project-intake/search", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const b = req.body || {};
    const phone = String(b.phone || "").trim();
    const nrz = String(b.nrz || "").trim();
    let foundClient = null;
    const searched = !!(phone || nrz);
    if (searched) {
      foundClient = clientIntake.findClientBySearch(db, tid, { phone, nrz });
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

  router.post("/project-intake/clients", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
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
    const pv = clientIntake.validatePhonesForTenant(db, tid, phone, whatsapp_phone);
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

    const duplicateClient = clientIntake.findClientBySearch(db, tid, { phone, nrz: nrzRaw });
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
      client_code = clientIntake.nextSequentialCode(db, tid, "client");
    } catch (e) {
      return res.status(400).send(e.message || "Could not allocate client code.");
    }

    try {
      db.prepare(
        `INSERT INTO intake_clients (
          tenant_id, client_code, external_client_reference, full_name, phone, phone_normalized, whatsapp_phone,
          nrz_number, nrz_normalized, address_street, address_house_number, address_apartment_number,
          updated_by_admin_user_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        tid,
        client_code,
        external_client_reference,
        full_name,
        phone,
        phoneNorm,
        whatsapp_phone,
        nrzRaw,
        nrzNorm,
        address_street,
        address_house_number,
        address_apartment_number,
        uid
      );
    } catch (e) {
      const msg = String(e.message || "");
      if (msg.includes("UNIQUE")) {
        const again = clientIntake.findClientBySearch(db, tid, { phone, nrz: nrzRaw });
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
          const extDup = db
            .prepare(
              "SELECT client_code FROM intake_clients WHERE tenant_id = ? AND external_client_reference = ? LIMIT 1"
            )
            .get(tid, external_client_reference);
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

    const row = db
      .prepare("SELECT id FROM intake_clients WHERE tenant_id = ? AND client_code = ?")
      .get(tid, client_code);

    if (send_otp_after && phoneNorm) {
      const recent = clientIntake.countRecentOtpSends(db, tid, phoneNorm);
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
          const exp = db.prepare(`SELECT datetime('now', '+10 minutes') AS e`).get().e;
          db.prepare(
            `INSERT INTO intake_phone_otp (tenant_id, client_id, phone_normalized, code_hash, purpose, expires_at, max_attempts)
             VALUES (?, ?, ?, ?, 'phone_verify', ?, 5)`
          ).run(tid, row.id, phoneNorm, clientIntake.hashOtpCode(code, tid, phoneNorm), exp);
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
      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${row.id}${otpQ}`));
    }

    if (send_otp_after && !phoneNorm) {
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${row.id}&otp_notice=` +
            encodeURIComponent(
              "We could not send an OTP: the phone number could not be normalized. The client was saved — fix the number and use Send OTP on the project page."
            ) +
            "&otp_ok=0"
        )
      );
    }

    return res.redirect(redirectWithEmbed(req, `/admin/project-intake/project/new?clientId=${row.id}`));
  });

  router.get("/project-intake/project/new", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const clientId = Number(req.query.clientId);
    if (!clientId || clientId < 1) {
      return res.redirect(redirectWithEmbed(req, "/admin/project-intake?error=" + encodeURIComponent("Missing client.")));
    }
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const cities = getTenantCitiesForClient(db, tid);
    const intakeCategories = db
      .prepare(`SELECT id, name FROM categories WHERE tenant_id = ? ORDER BY name COLLATE NOCASE ASC`)
      .all(tid);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    return res.render("admin/project_intake_project", {
      activeNav: "project_intake",
      navTitle: "New project",
      client,
      cities,
      intakeCategories,
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
      const b = req.body || {};
      const clientId = Number(b.client_id);
      const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
      if (!client) return res.status(404).send("Client not found.");

      const city = String(b.city || "").trim();
      if (!city || !intakeCityAllowed(db, tid, city)) {
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
      const budgetRaw = String(b.estimated_budget || "").trim();
      const budgetVal = budgetRaw === "" ? null : Number(budgetRaw);
      if (budgetRaw !== "" && (Number.isNaN(budgetVal) || budgetVal < 0)) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Budget must be a non-negative number.")
          )
        );
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
      const catOk = db.prepare(`SELECT id FROM categories WHERE id = ? AND tenant_id = ?`).get(intakeCategoryId, tid);
      if (!catOk) {
        return res.redirect(
          redirectWithEmbed(
            req,
            `/admin/project-intake/project/new?clientId=${clientId}&error=` + encodeURIComponent("Invalid category for this region.")
          )
        );
      }
      const budgetMeta = clientIntake.getBudgetMetaForTenant(db, tid);
      const uid = req.session.adminUser.id;

      let project_code;
      try {
        project_code = clientIntake.nextSequentialCode(db, tid, "project");
      } catch (e) {
        return res.status(400).send(e.message || "Could not allocate project code.");
      }

      let projectId;
      try {
        const info = db
          .prepare(
            `INSERT INTO intake_client_projects (
              tenant_id, client_id, project_code,
              client_full_name_snapshot, client_phone_snapshot,
              city, neighborhood, street_name, house_number, apartment_number,
              client_address_street, client_address_house_number, client_address_apartment_number,
              estimated_budget_value, estimated_budget_currency, intake_category_id, status,
              created_by_admin_user_id, updated_by_admin_user_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, datetime('now'))`
          )
          .run(
            tid,
            clientId,
            project_code,
            String(client.full_name || ""),
            String(client.phone || ""),
            city,
            neighborhood,
            street_name,
            house_number,
            apartment_number,
            client_address_street,
            client_address_house_number,
            client_address_apartment_number,
            budgetVal,
            budgetMeta.code,
            intakeCategoryId,
            uid,
            uid
          );
        projectId = Number(info.lastInsertRowid);
      } catch (e) {
        return res.status(400).send(e.message || "Could not save project.");
      }

      try {
        db.prepare(
          `UPDATE intake_clients SET
            address_street = ?, address_house_number = ?, address_apartment_number = ?,
            updated_by_admin_user_id = ?, updated_at = datetime('now')
           WHERE id = ? AND tenant_id = ?`
        ).run(
          client_address_street,
          client_address_house_number,
          client_address_apartment_number,
          uid,
          clientId,
          tid
        );
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
        const ins = db.prepare(
          `INSERT INTO intake_project_images (tenant_id, project_id, image_path, sort_order) VALUES (?, ?, ?, ?)`
        );
        let ord = 0;
        for (const rel of relPaths) {
          ins.run(tid, projectId, rel, ord++);
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

      const imgCountRow = db
        .prepare(`SELECT COUNT(*) AS c FROM intake_project_images WHERE tenant_id = ? AND project_id = ?`)
        .get(tid, projectId);
      const imageCount = Number(imgCountRow && imgCountRow.c) || 0;
      const savedProject = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(projectId, tid);
      const pubVal = validateIntakeProjectForPublish(db, tid, savedProject, imageCount);
      const nextLifecycle = pubVal.ok ? "ready_to_publish" : "needs_review";
      db.prepare(
        `UPDATE intake_client_projects SET status = ?, updated_by_admin_user_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).run(nextLifecycle, uid, projectId, tid);

      return res.redirect(redirectWithEmbed(req, `/admin/project-intake/success?projectId=${projectId}`));
    }
  );

  router.post(
    "/projects/:id/intake-quick-edit",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      const b = req.body || {};
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const project = db.prepare(`SELECT id, status FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
      if (!project) return res.status(404).send("Project not found.");
      const st = String(project.status || "").trim().toLowerCase();
      if (!INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(st)) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Quick edit is only allowed before publish."))
        );
      }
      const neighborhood = String(b.neighborhood || "").trim().slice(0, 120);
      const street_name = String(b.street_name || "").trim().slice(0, 200);
      const house_number = String(b.house_number || "").trim().slice(0, 40);
      const budgetRaw = String(b.estimated_budget || "").trim();
      const budgetVal = budgetRaw === "" ? null : Number(budgetRaw);
      if (budgetRaw !== "" && (Number.isNaN(budgetVal) || budgetVal < 0)) {
        return res.redirect(
          redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent("Budget must be a non-negative number."))
        );
      }
      db.prepare(
        `UPDATE intake_client_projects SET
          neighborhood = ?, street_name = ?, house_number = ?,
          estimated_budget_value = ?,
          updated_by_admin_user_id = ?, updated_at = datetime('now')
         WHERE id = ? AND tenant_id = ?`
      ).run(neighborhood, street_name, house_number, budgetVal, uid, pid, tid);
      const full = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
      const imgCountRow = db
        .prepare(`SELECT COUNT(*) AS c FROM intake_project_images WHERE tenant_id = ? AND project_id = ?`)
        .get(tid, pid);
      const imageCount = Number(imgCountRow && imgCountRow.c) || 0;
      const pubVal = validateIntakeProjectForPublish(db, tid, full, imageCount);
      const nextLifecycle = pubVal.ok ? "ready_to_publish" : "needs_review";
      db.prepare(
        `UPDATE intake_client_projects SET status = ?, updated_by_admin_user_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
      ).run(nextLifecycle, uid, pid, tid);
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Project details updated."))
      );
    }
  );

  router.post(
    "/project-intake/projects/:id/publish",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1) return res.status(400).send("Invalid project.");
      const project = db.prepare(`SELECT * FROM intake_client_projects WHERE id = ? AND tenant_id = ?`).get(pid, tid);
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
      const imgCountRow = db
        .prepare(`SELECT COUNT(*) AS c FROM intake_project_images WHERE tenant_id = ? AND project_id = ?`)
        .get(tid, pid);
      const imageCount = Number(imgCountRow && imgCountRow.c) || 0;
      const pubVal = validateIntakeProjectForPublish(db, tid, project, imageCount);
      if (!pubVal.ok) {
        const msg = pubVal.errors.map((e) => e.message).join(" ");
        return res.redirect(redirectWithEmbed(req, `/admin/projects/${pid}?error=` + encodeURIComponent(msg || "Project is not ready to publish.")));
      }
      const txn = db.transaction(() => {
        db.prepare(
          `UPDATE intake_client_projects SET status = 'published', updated_by_admin_user_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
        ).run(uid, pid, tid);
        intakeProjectAllocation.onProjectPublished(db, tid, pid, uid);
      });
      txn();
      return res.redirect(
        redirectWithEmbed(req, `/admin/projects/${pid}?notice=` + encodeURIComponent("Project published. Eligible providers are assigned per allocation rules; companies see leads in the portal when assigned."))
      );
    }
  );

  router.get("/project-intake/success", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const projectId = Number(req.query.projectId);
    if (!projectId || projectId < 1) return res.redirect(redirectWithEmbed(req, "/admin/project-intake"));
    const project = db
      .prepare(
        `SELECT p.*, c.client_code,
            COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_name,
            COALESCE(NULLIF(trim(p.client_phone_snapshot), ''), c.phone) AS client_phone,
            c.external_client_reference
         FROM intake_client_projects p
         JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
         WHERE p.id = ? AND p.tenant_id = ?`
      )
      .get(projectId, tid);
    if (!project) return res.status(404).send("Project not found.");
    const images = db
      .prepare(
        `SELECT id, image_path, sort_order FROM intake_project_images WHERE tenant_id = ? AND project_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(tid, projectId);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    const imageCount = images.length;
    const publishValidation = validateIntakeProjectForPublish(db, tid, project, imageCount);
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

  router.get("/project-intake/files/:id", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const id = Number(req.params.id);
    if (!id || id < 1) return res.status(400).send("Invalid id.");
    const row = db.prepare("SELECT * FROM intake_project_images WHERE id = ? AND tenant_id = ?").get(id, tid);
    if (!row) return res.status(404).send("Not found.");
    const abs = clientIntake.safeAbsoluteImagePath(row.image_path);
    if (!abs || !fs.existsSync(abs)) return res.status(404).send("File missing.");
    return res.type("jpeg").sendFile(path.resolve(abs));
  });

  router.post("/project-intake/otp/send", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
    const clientId = Number((req.body && req.body.client_id) || 0);
    if (!clientId || clientId < 1) return res.status(400).send("Invalid client.");
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();
    if (!phoneNorm) return res.status(400).send("Client has no phone on file.");

    const recent = clientIntake.countRecentOtpSends(db, tid, phoneNorm);
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
    const exp = db.prepare(`SELECT datetime('now', '+10 minutes') AS e`).get().e;
    db.prepare(
      `INSERT INTO intake_phone_otp (tenant_id, client_id, phone_normalized, code_hash, purpose, expires_at, max_attempts)
       VALUES (?, ?, ?, ?, 'phone_verify', ?, 5)`
    ).run(tid, clientId, phoneNorm, clientIntake.hashOtpCode(code, tid, phoneNorm), exp);

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

  router.post("/project-intake/otp/verify", requireClientProjectIntakeAccess, requireClientProjectIntakeMutate, (req, res) => {
    const tid = getAdminTenantId(req);
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
    const client = db.prepare("SELECT * FROM intake_clients WHERE id = ? AND tenant_id = ?").get(clientId, tid);
    if (!client) return res.status(404).send("Client not found.");
    const phoneNorm = String(client.phone_normalized || "").trim();

    const row = db
      .prepare(
        `SELECT * FROM intake_phone_otp
         WHERE tenant_id = ? AND client_id = ? AND phone_normalized = ? AND verified_at IS NULL
         AND datetime(expires_at) > datetime('now')
         ORDER BY id DESC LIMIT 1`
      )
      .get(tid, clientId, phoneNorm);
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
      db.prepare(`UPDATE intake_phone_otp SET attempts = ? WHERE id = ? AND tenant_id = ?`).run(attempts, row.id, tid);
      return res.redirect(
        redirectWithEmbed(
          req,
          `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
            encodeURIComponent("Incorrect code. Check the number and try again.") +
            "&otp_ok=0"
        )
      );
    }
    db.prepare(`UPDATE intake_phone_otp SET attempts = ?, verified_at = datetime('now') WHERE id = ? AND tenant_id = ?`).run(
      attempts,
      row.id,
      tid
    );
    db.prepare(
      `UPDATE intake_clients SET phone_verified_at = datetime('now'), updated_by_admin_user_id = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ?`
    ).run(uid, clientId, tid);
    return res.redirect(
      redirectWithEmbed(
        req,
        `/admin/project-intake/project/new?clientId=${clientId}&otp_notice=` +
          encodeURIComponent("Phone verified successfully.") +
          "&otp_ok=1"
      )
    );
  });

  router.get("/projects", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const projects = db
      .prepare(
        `SELECT
          p.id,
          p.project_code,
          p.client_id,
          c.client_code,
          COALESCE(NULLIF(trim(p.client_full_name_snapshot), ''), c.full_name) AS client_display_name,
          COALESCE(NULLIF(trim(p.client_phone_snapshot), ''), c.phone) AS client_display_phone,
          p.city,
          p.neighborhood,
          p.estimated_budget_value,
          p.estimated_budget_currency,
          p.status,
          p.created_at,
          p.updated_at,
          (SELECT COUNT(*) FROM intake_project_assignments a WHERE a.tenant_id = p.tenant_id AND a.project_id = p.id) AS assignment_count
        FROM intake_client_projects p
        INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
        WHERE p.tenant_id = ?
        ORDER BY datetime(p.created_at) DESC
        LIMIT 400`
      )
      .all(tid);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    return res.render("admin/projects_list", {
      activeNav: "projects",
      navTitle: "Intake projects",
      projects,
      budget,
      intakeProjectStatusLabel: clientIntake.intakeProjectStatusLabel,
    });
  });

  router.get("/projects/:id", requireClientProjectIntakeAccess, (req, res) => {
    const tid = getAdminTenantId(req);
    const pid = Number(req.params.id);
    if (!pid || pid < 1) return res.status(400).send("Invalid id.");
    const project = db
      .prepare(
        `SELECT p.*, c.client_code, c.full_name AS client_live_name, c.phone AS client_live_phone, c.external_client_reference,
            cat.name AS intake_category_name
         FROM intake_client_projects p
         INNER JOIN intake_clients c ON c.id = p.client_id AND c.tenant_id = p.tenant_id
         LEFT JOIN categories cat ON cat.id = p.intake_category_id AND cat.tenant_id = p.tenant_id
         WHERE p.id = ? AND p.tenant_id = ?`
      )
      .get(pid, tid);
    if (!project) return res.status(404).send("Project not found.");
    const lifecycle = String(project.status || "").trim().toLowerCase();
    if (lifecycle === "published") {
      intakeProjectAllocation.processPublishedProjectAllocation(db, tid, pid);
    }
    const images = db
      .prepare(
        `SELECT id, image_path, sort_order FROM intake_project_images WHERE tenant_id = ? AND project_id = ? ORDER BY sort_order ASC, id ASC`
      )
      .all(tid, pid);
    const imageCount = images.length;
    const publishValidation = validateIntakeProjectForPublish(db, tid, project, imageCount);
    const showPublishOnDetail = INTAKE_PROJECT_PUBLISHABLE_STATUSES.has(lifecycle);
    const assignments = db
      .prepare(
        `SELECT a.id, a.company_id, a.status, a.created_at, a.responded_at, a.response_note,
            a.response_deadline_at, a.allocation_source, a.allocation_wave,
            c.name AS company_name, c.subdomain AS company_subdomain
         FROM intake_project_assignments a
         INNER JOIN companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
         WHERE a.project_id = ? AND a.tenant_id = ?
         ORDER BY datetime(a.created_at) DESC`
      )
      .all(pid, tid);
    const companies = db
      .prepare(`SELECT id, name, subdomain FROM companies WHERE tenant_id = ? ORDER BY name ASC`)
      .all(tid);
    const assignedIds = new Set(assignments.map((a) => Number(a.company_id)));
    const assignableCompanies = companies.filter((c) => !assignedIds.has(Number(c.id)));
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
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
      projectStatusLabel: clientIntake.intakeProjectStatusLabel(project.status),
      assignmentStatusLabelForPortal,
      error: error || null,
      notice: notice || null,
      intakeFileBase: "/admin/project-intake/files/",
    });
  });

  router.post(
    "/projects/:id/assignments",
    requireClientProjectIntakeAccess,
    requireClientProjectIntakeMutate,
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const companyId = Number((req.body && req.body.company_id) || 0);
      const uid = req.session.adminUser.id;
      if (!pid || pid < 1 || !companyId || companyId < 1) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Choose a company."));
      }
      const project = db.prepare("SELECT id FROM intake_client_projects WHERE id = ? AND tenant_id = ?").get(pid, tid);
      if (!project) return res.status(404).send("Project not found.");
      const company = db.prepare("SELECT id FROM companies WHERE id = ? AND tenant_id = ?").get(companyId, tid);
      if (!company) {
        return res.redirect(`/admin/projects/${pid}?error=` + encodeURIComponent("Company not in this region."));
      }
      const projRow = db
        .prepare(`SELECT status, intake_category_id FROM intake_client_projects WHERE id = ? AND tenant_id = ?`)
        .get(pid, tid);
      const stPub = String((projRow && projRow.status) || "")
        .trim()
        .toLowerCase();
      let responseDeadline = null;
      if (stPub === "published" && projRow && projRow.intake_category_id) {
        const h = getCategoryResponseWindowHours(db, tid, Number(projRow.intake_category_id));
        const drow = db.prepare(`SELECT datetime('now', '+' || ? || ' hours') AS d`).get(String(Math.max(1, Math.floor(Number(h) || 72))));
        responseDeadline = drow && drow.d ? String(drow.d) : null;
      }
      try {
        db.prepare(
          `INSERT INTO intake_project_assignments (
            tenant_id, project_id, company_id, assigned_by_admin_user_id, status,
            response_deadline_at, allocation_source, allocation_wave, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', ?, 'manual', 0, datetime('now'))`
        ).run(tid, pid, companyId, uid, responseDeadline);
      } catch (e) {
        const msg = String(e.message || "");
        if (msg.includes("UNIQUE")) {
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
    (req, res) => {
      const tid = getAdminTenantId(req);
      const pid = Number(req.params.id);
      const aid = Number(req.params.assignmentId);
      const row = db
        .prepare(`SELECT id FROM intake_project_assignments WHERE id = ? AND tenant_id = ? AND project_id = ?`)
        .get(aid, tid, pid);
      if (!row) return res.status(404).send("Assignment not found.");
      db.prepare(`DELETE FROM intake_project_assignments WHERE id = ? AND tenant_id = ?`).run(aid, tid);
      return res.redirect(`/admin/projects/${pid}?notice=` + encodeURIComponent("Assignment removed."));
    }
  );

  router.get("/companies/:id/portal-users", requireDirectoryEditor, (req, res) => {
    const tid = getAdminTenantId(req);
    const cid = Number(req.params.id);
    const company = db.prepare("SELECT id, name, subdomain FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
    if (!company) return res.status(404).send("Company not found.");
    const tenantRow = db.prepare("SELECT slug, name FROM tenants WHERE id = ?").get(tid);
    const users = db
      .prepare(
        `SELECT id, full_name, username, phone_normalized, nrz_number, is_active, created_at FROM company_personnel_users WHERE tenant_id = ? AND company_id = ? ORDER BY id ASC`
      )
      .all(tid, cid);
    const error = String((req.query && req.query.error) || "").trim().slice(0, 400);
    const notice = String((req.query && req.query.notice) || "").trim().slice(0, 400);
    return res.render("admin/company_portal_users", {
      activeNav: "companies",
      navTitle: "Portal users",
      company,
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
    const cid = Number(req.params.id);
    const company = db.prepare("SELECT id FROM companies WHERE id = ? AND tenant_id = ?").get(cid, tid);
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
    const tsRow = db.prepare("SELECT slug FROM tenants WHERE id = ?").get(tid);
    const slug = tsRow ? String(tsRow.slug) : "zm";
    if (!full_name || !password) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Name and password are required."));
    }
    const phoneNorm = phone ? clientIntake.normalizeDigits(phone) : "";
    if (!username && !phoneNorm) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Enter a phone number or a username."));
    }
    if (phoneNorm && !isValidPhoneForTenant(slug, phone)) {
      return res.redirect(`/admin/companies/${cid}/portal-users?error=` + encodeURIComponent("Invalid phone for this region."));
    }
    if (nrzCheck.value) {
      const nrzDup = db
        .prepare(
          `SELECT id FROM company_personnel_users WHERE tenant_id = ? AND length(trim(nrz_number)) > 0 AND upper(trim(nrz_number)) = ? LIMIT 1`
        )
        .get(tid, nrzCheck.value);
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
      db.prepare(
        `INSERT INTO company_personnel_users (tenant_id, company_id, full_name, username, phone_normalized, nrz_number, password_hash, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))`
      ).run(tid, cid, full_name, username || "", phoneNorm, nrzCheck.value || "", passwordHash);
    } catch (e) {
      if (String(e.message || "").includes("UNIQUE")) {
        return res.redirect(
          `/admin/companies/${cid}/portal-users?error=` +
            encodeURIComponent("That phone or username is already registered for portal login in this region.")
        );
      }
      return res.status(400).send(String(e.message || "Could not create user."));
    }
    return res.redirect(`/admin/companies/${cid}/portal-users?notice=` + encodeURIComponent("Portal user created."));
  });

  function renderClientLeadStatus(req, res) {
    const tid = getAdminTenantId(req);
    const q = req.query || {};
    const list = buildIntakeProjectStatusList(db, tid, q);
    const budget = clientIntake.getBudgetMetaForTenant(db, tid);
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
