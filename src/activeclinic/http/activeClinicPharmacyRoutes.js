"use strict";

/**
 * ActiveClinic pharmacy routes (P05).
 * Stitch screens.
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  loadActiveClinicPharmacyDashboardScreen,
  loadActiveClinicPharmacyCatalogueScreen,
  loadActiveClinicPharmacyMedicineDetailScreen,
  loadActiveClinicPharmacyAddMedicineScreen,
  loadActiveClinicPharmacyInventoryScreen,
  loadActiveClinicPharmacyLowStockScreen,
  loadActiveClinicPharmacyExpiryAlertsScreen,
  loadActiveClinicPharmacyPrescriptionQueueScreen,
  loadActiveClinicPharmacyPrescriptionDetailScreen,
  loadActiveClinicPharmacyDispenseScreen,
  loadActiveClinicPharmacyReceiveStockScreen,
  actorFromAuth,
} = require("../services/loadActiveClinicPharmacyScreens");
const {
  addMedication,
  receiveStock,
  dispensePrescription,
  getPrescriptionById,
  RESULT: PHARM_RESULT,
  PERM,
} = require("../services/activeClinicPharmacyService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPharmacyError(code) {
  switch (code) {
    case PHARM_RESULT.ACCESS_DENIED:
      return "You do not have permission for this pharmacy action.";
    case PHARM_RESULT.MEDICATION_NOT_FOUND:
      return "Medication not found.";
    case PHARM_RESULT.INVENTORY_ITEM_NOT_FOUND:
      return "Inventory item not found.";
    case PHARM_RESULT.BATCH_NOT_FOUND:
      return "Batch not found.";
    case PHARM_RESULT.PRESCRIPTION_NOT_FOUND:
      return "Prescription not found.";
    case PHARM_RESULT.PRESCRIPTION_ITEM_NOT_FOUND:
      return "Prescription item not found.";
    case PHARM_RESULT.INSUFFICIENT_STOCK:
      return "Insufficient stock to complete this dispense.";
    case PHARM_RESULT.EXPIRED_BATCH:
      return "Cannot dispense from expired batch.";
    case PHARM_RESULT.INVALID_STATUS:
      return "Invalid status for this action.";
    case PHARM_RESULT.INVALID_TRANSITION:
      return "That status change is not allowed.";
    case PHARM_RESULT.STALE_VERSION:
      return "This prescription was updated by someone else. Refresh and try again.";
    case PHARM_RESULT.DUPLICATE_MEDICATION:
      return "A medication with these details already exists in the catalogue.";
    case PHARM_RESULT.DUPLICATE_BATCH:
      return "A batch with this number already exists for this medication.";
    case PHARM_RESULT.NEGATIVE_STOCK:
      return "Cannot process: would result in negative stock.";
    case PHARM_RESULT.INVALID_INPUT:
      return "Check the submitted details and try again.";
    default:
      return "Unable to complete the pharmacy request.";
  }
}

function registerActiveClinicPharmacyRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: options.pageData || {},
      assetVersion: "p05-1",
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function actor(auth) {
    return actorFromAuth(auth);
  }

  // Pharmacy Dashboard
  app.get(
    "/app/pharmacy",
    requireAuth,
    requirePermission(PERM.PHARMACY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyDashboardScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Pharmacy dashboard unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-dashboard-content",
          { pageData: loaded.dashboard }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Pharmacy",
          breadcrumbs: [{ label: "Pharmacy", href: "/app/pharmacy" }],
          pageData: loaded.dashboard,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Medicine Catalogue List
  app.get(
    "/app/pharmacy/catalogue",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyCatalogueScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Medicine catalogue unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-catalogue-content",
          { pageData: loaded.catalogue }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Medicine Catalogue",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Catalogue", href: "/app/pharmacy/catalogue" },
          ],
          pageData: loaded.catalogue,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Medicine Detail
  app.get(
    "/app/pharmacy/catalogue/:id",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    async (req, res, next) => {
      try {
        const medicationId = req.params.id;
        if (!UUID_RE.test(medicationId)) {
          return res.status(404).type("html").send(
            renderSimpleState("Not Found", "Invalid medication ID.", {
              status: 404,
              linkHref: "/app/pharmacy/catalogue",
              linkLabel: "Back to catalogue",
            })
          );
        }

        const loaded = await loadActiveClinicPharmacyMedicineDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          medicationId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Medication not found",
              mapPharmacyError(loaded.code),
              { status: 404, linkHref: "/app/pharmacy/catalogue", linkLabel: "Back to catalogue" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-medicine-detail-content",
          { pageData: loaded.medicineDetail }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: loaded.medicineDetail.medication.genericName,
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Catalogue", href: "/app/pharmacy/catalogue" },
            { label: loaded.medicineDetail.medication.genericName },
          ],
          pageData: loaded.medicineDetail,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add Medicine (GET)
  app.get(
    "/app/pharmacy/catalogue/new",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyAddMedicineScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-add-medicine-content",
          { pageData: loaded.addMedicine }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Add Medicine",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Catalogue", href: "/app/pharmacy/catalogue" },
            { label: "Add Medicine" },
          ],
          pageData: loaded.addMedicine,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Add Medicine (POST)
  app.post(
    "/app/pharmacy/catalogue/new",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(
          env,
          req.body[CSRF_FIELD] || "",
          req.cookies.csrf || ""
        );
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: "/app/pharmacy/catalogue/new",
              linkLabel: "Try again",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const result = await addMedication(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          genericName: req.body.genericName,
          brandNames: req.body.brandNames ? req.body.brandNames.split(",").map((s) => s.trim()) : null,
          strength: req.body.strength,
          dosageForm: req.body.dosageForm,
          unitOfMeasure: req.body.unitOfMeasure,
          standardCost: req.body.standardCost ? parseFloat(req.body.standardCost) : null,
          reorderLevel: req.body.reorderLevel ? parseInt(req.body.reorderLevel, 10) : null,
          storageConditions: req.body.storageConditions || null,
          notes: req.body.notes || null,
        });

        if (!result.ok) {
          const loaded = await loadActiveClinicPharmacyAddMedicineScreen(getPool(), {
            auth,
            values: req.body,
            error: mapPharmacyError(result.result),
          });

          const contentHtml = require("../../templateRenderers").renderTemplate(
            "activeclinic/app/pharmacy-add-medicine-content",
            { pageData: loaded.addMedicine }
          );

          return await renderShell(req, res, {
            content: contentHtml,
            activeNav: "pharmacy",
            pageHeader: "Add Medicine",
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Catalogue", href: "/app/pharmacy/catalogue" },
              { label: "Add Medicine" },
            ],
            pageData: loaded.addMedicine,
            status: 400,
          });
        }

        return res.redirect(303, `/app/pharmacy/catalogue/${result.medication.id}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // Inventory List
  app.get(
    "/app/pharmacy/inventory",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyInventoryScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Inventory unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-inventory-content",
          { pageData: loaded.inventory }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Medicine Inventory",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Inventory", href: "/app/pharmacy/inventory" },
          ],
          pageData: loaded.inventory,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Low Stock Alerts
  app.get(
    "/app/pharmacy/alerts/low-stock",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyLowStockScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Low stock alerts unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-low-stock-content",
          { pageData: loaded.lowStock }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Low Stock Alerts",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Low Stock", href: "/app/pharmacy/alerts/low-stock" },
          ],
          pageData: loaded.lowStock,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Expiry Alerts
  app.get(
    "/app/pharmacy/alerts/expiry",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyExpiryAlertsScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Expiry alerts unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-expiry-alerts-content",
          { pageData: loaded.expiryAlerts }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Expiry Alerts",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Expiry Alerts", href: "/app/pharmacy/alerts/expiry" },
          ],
          pageData: loaded.expiryAlerts,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Prescription Queue
  app.get(
    "/app/pharmacy/queue",
    requireAuth,
    requirePermission(PERM.PHARMACY_VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyPrescriptionQueueScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Prescription queue unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-prescription-queue-content",
          { pageData: loaded.prescriptionQueue }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Prescription Queue",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
          ],
          pageData: loaded.prescriptionQueue,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Prescription Detail
  app.get(
    "/app/pharmacy/prescriptions/:id",
    requireAuth,
    requirePermission(PERM.PHARMACY_VIEW),
    async (req, res, next) => {
      try {
        const prescriptionId = req.params.id;
        if (!UUID_RE.test(prescriptionId)) {
          return res.status(404).type("html").send(
            renderSimpleState("Not Found", "Invalid prescription ID.", {
              status: 404,
              linkHref: "/app/pharmacy/queue",
              linkLabel: "Back to queue",
            })
          );
        }

        const loaded = await loadActiveClinicPharmacyPrescriptionDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          prescriptionId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Prescription not found",
              mapPharmacyError(loaded.code),
              { status: 404, linkHref: "/app/pharmacy/queue", linkLabel: "Back to queue" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-prescription-detail-content",
          { pageData: loaded.prescriptionDetail }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: `Prescription ${loaded.prescriptionDetail.prescription.prescriptionNumber}`,
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
            { label: loaded.prescriptionDetail.prescription.prescriptionNumber },
          ],
          pageData: loaded.prescriptionDetail,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Dispense Prescription (GET)
  app.get(
    "/app/pharmacy/prescriptions/:id/dispense",
    requireAuth,
    requirePermission(PERM.PHARMACY_DISPENSE),
    async (req, res, next) => {
      try {
        const prescriptionId = req.params.id;
        if (!UUID_RE.test(prescriptionId)) {
          return res.status(404).type("html").send(
            renderSimpleState("Not Found", "Invalid prescription ID.", {
              status: 404,
              linkHref: "/app/pharmacy/queue",
              linkLabel: "Back to queue",
            })
          );
        }

        const loaded = await loadActiveClinicPharmacyDispenseScreen(getPool(), {
          auth: req.activeClinicAuth,
          prescriptionId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Cannot load dispense screen",
              mapPharmacyError(loaded.code),
              { status: 404, linkHref: "/app/pharmacy/queue", linkLabel: "Back to queue" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-dispense-content",
          { pageData: loaded.dispense }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: `Dispense ${loaded.dispense.prescription.prescriptionNumber}`,
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
            { label: loaded.dispense.prescription.prescriptionNumber, href: `/app/pharmacy/prescriptions/${prescriptionId}` },
            { label: "Dispense" },
          ],
          pageData: loaded.dispense,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Dispense Prescription (POST)
  app.post(
    "/app/pharmacy/prescriptions/:id/dispense",
    requireAuth,
    requirePermission(PERM.PHARMACY_DISPENSE),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(
          env,
          req.body[CSRF_FIELD] || "",
          req.cookies.csrf || ""
        );
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: `/app/pharmacy/prescriptions/${req.params.id}/dispense`,
              linkLabel: "Try again",
            })
          );
        }

        const prescriptionId = req.params.id;
        const auth = req.activeClinicAuth;

        const itemDispenses = [];
        const itemKeys = Object.keys(req.body).filter((k) => k.startsWith("item_"));
        for (const key of itemKeys) {
          const itemId = key.replace("item_", "");
          const quantity = parseInt(req.body[`quantity_${itemId}`], 10);
          const batchId = req.body[`batch_${itemId}`];
          if (quantity > 0 && batchId) {
            itemDispenses.push({
              prescriptionItemId: itemId,
              quantityToDispense: quantity,
              batchId,
            });
          }
        }

        const result = await dispensePrescription(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          prescriptionId,
          itemDispenses,
          dispenseType: req.body.dispenseType || "full",
          patientAcknowledged: req.body.patientAcknowledged === "true",
          counselingProvided: req.body.counselingProvided === "true",
          counselingNotes: req.body.counselingNotes || null,
        });

        if (!result.ok) {
          const loaded = await loadActiveClinicPharmacyDispenseScreen(getPool(), {
            auth,
            prescriptionId,
            error: mapPharmacyError(result.result),
          });

          const contentHtml = require("../../templateRenderers").renderTemplate(
            "activeclinic/app/pharmacy-dispense-content",
            { pageData: loaded.dispense }
          );

          return await renderShell(req, res, {
            content: contentHtml,
            activeNav: "pharmacy",
            pageHeader: `Dispense ${loaded.dispense.prescription.prescriptionNumber}`,
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Queue", href: "/app/pharmacy/queue" },
              { label: loaded.dispense.prescription.prescriptionNumber, href: `/app/pharmacy/prescriptions/${prescriptionId}` },
              { label: "Dispense" },
            ],
            pageData: loaded.dispense,
            flash: { error: mapPharmacyError(result.result) },
            status: 400,
          });
        }

        return res.redirect(303, `/app/pharmacy/prescriptions/${prescriptionId}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // Receive Stock (GET)
  app.get(
    "/app/pharmacy/inventory/receive",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyReceiveStockScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Receive stock unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app/pharmacy", linkLabel: "Back to pharmacy" }
            )
          );
        }

        const contentHtml = require("../../templateRenderers").renderTemplate(
          "activeclinic/app/pharmacy-receive-stock-content",
          { pageData: loaded.receiveStock }
        );

        return await renderShell(req, res, {
          content: contentHtml,
          activeNav: "pharmacy",
          pageHeader: "Receive Stock",
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Inventory", href: "/app/pharmacy/inventory" },
            { label: "Receive Stock" },
          ],
          pageData: loaded.receiveStock,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Receive Stock (POST)
  app.post(
    "/app/pharmacy/inventory/receive",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(
          env,
          req.body[CSRF_FIELD] || "",
          req.cookies.csrf || ""
        );
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: "/app/pharmacy/inventory/receive",
              linkLabel: "Try again",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;

        const result = await receiveStock(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: selectedFacility.id,
          medicationCatalogueItemId: req.body.medicationCatalogueItemId,
          batchNumber: req.body.batchNumber,
          quantity: parseInt(req.body.quantity, 10),
          expiryDate: req.body.expiryDate,
          manufactureDate: req.body.manufactureDate || null,
          supplierName: req.body.supplierName || null,
          costPerUnit: req.body.costPerUnit ? parseFloat(req.body.costPerUnit) : null,
        });

        if (!result.ok) {
          const loaded = await loadActiveClinicPharmacyReceiveStockScreen(getPool(), {
            auth,
            values: req.body,
            error: mapPharmacyError(result.result),
          });

          const contentHtml = require("../../templateRenderers").renderTemplate(
            "activeclinic/app/pharmacy-receive-stock-content",
            { pageData: loaded.receiveStock }
          );

          return await renderShell(req, res, {
            content: contentHtml,
            activeNav: "pharmacy",
            pageHeader: "Receive Stock",
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Inventory", href: "/app/pharmacy/inventory" },
              { label: "Receive Stock" },
            ],
            pageData: loaded.receiveStock,
            flash: { error: mapPharmacyError(result.result) },
            status: 400,
          });
        }

        return res.redirect(303, "/app/pharmacy/inventory");
      } catch (err) {
        next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicPharmacyRoutes,
};
