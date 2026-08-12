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
  createRequireActiveClinicDepartment,
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
  listMedications,
  listInventoryItems,
  RESULT: PHARM_RESULT,
  PERM,
} = require("../services/activeClinicPharmacyService");
const {
  adjustStock,
  transferStock,
  substitutePrescriptionItem,
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  submitPurchaseOrder,
  getMedicineLabel,
  getPatientMedicineInstructions,
  RESULT: OPS_RESULT,
} = require("../services/activeClinicPharmacyOpsService");
const {
  listFacilitiesByOrganization,
} = require("../services/facilityService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const STITCH_OPS = Object.freeze({
  adjust: "2147643a82af4fb28a8368dcff867a75",
  transfer: "ce22d1c5de5f43ad8a458f57aa217fd3",
  substitution: "e237cd030fb241deb15ed8eb0f4f895e",
  purchaseOrder: "0f1976955fc14d8c97f1f8c728b4e1da",
  labels: "b62126b07af7488094221932b9046193",
  instructions: "7cffba8bdac84abda7a8d31951d1948f",
});

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
    case OPS_RESULT.NEGATIVE_STOCK:
      return "Cannot process: would result in negative stock.";
    case OPS_RESULT.SUBSTITUTION_NOT_ALLOWED:
      return "Substitution is not allowed for this prescription item.";
    case OPS_RESULT.PURCHASE_ORDER_NOT_FOUND:
      return "Purchase order not found.";
    case OPS_RESULT.INVALID_PO_STATUS:
      return "This purchase order cannot be submitted in its current status.";
    case OPS_RESULT.FACILITY_MISMATCH:
      return "Facilities must belong to the same healthcare organization.";
    case PHARM_RESULT.INVALID_INPUT:
    case OPS_RESULT.INVALID_INPUT:
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
  const requireDepartment = createRequireActiveClinicDepartment({ getPool, env });

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
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyDashboardScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          if (loaded.code === "facility_required") {
            return res.redirect(303, "/app/select-facility?return=/app/pharmacy");
          }
          return res.status(403).type("html").send(
            renderSimpleState(
              "Pharmacy dashboard unavailable",
              mapPharmacyError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard", state: "access-denied", stateKey: "access_restricted" }
            )
          );
        }
        return await renderShell(req, res, {
          content: "app/pharmacy-dashboard-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Pharmacy", description: "Prescription queue, inventory, and dispensing.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-catalogue-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Medicine catalogue", description: "Organization medication catalogue.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-medicine-detail-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: loaded.medicineDetail.medication.genericName, description: "Medication detail.", actions: [] },
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
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPharmacyAddMedicineScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        return await renderShell(req, res, {
          content: "app/pharmacy-add-medicine-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Add medicine", description: "Add a medication to the catalogue.", actions: [] },
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
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
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
        return await renderShell(req, res, {
          content: "app/pharmacy-add-medicine-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: "Add medicine", description: "Add a medication to the catalogue.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-inventory-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Medicine inventory", description: "Stock levels for this facility.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-low-stock-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Low stock alerts", description: "Items at or below reorder level.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-expiry-alerts-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Expiry alerts", description: "Batches expiring within 90 days.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-prescription-queue-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Prescription queue", description: "Prescriptions awaiting pharmacy action.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-prescription-detail-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: `Prescription ${loaded.prescriptionDetail.prescription.prescriptionNumber}`, description: "Prescription detail.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-dispense-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: `Dispense ${loaded.dispense.prescription.prescriptionNumber}`, description: "Dispense medications.", actions: [] },
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
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
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
        return await renderShell(req, res, {
          content: "app/pharmacy-dispense-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: `Dispense ${loaded.dispense.prescription.prescriptionNumber}`, description: "Dispense medications.", actions: [] },
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
    requireDepartment("pharmacy"),
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
        return await renderShell(req, res, {
          content: "app/pharmacy-receive-stock-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Receive stock", description: "Record incoming inventory batches.", actions: [] },
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
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
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
        return await renderShell(req, res, {
          content: "app/pharmacy-receive-stock-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: "Receive stock", description: "Record incoming inventory batches.", actions: [] },
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

  // Stock Adjust (GET)
  app.get(
    "/app/pharmacy/inventory/adjust",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        if (!selectedFacility || !selectedFacility.id) {
          return res.redirect(303, "/app/select-facility?return=/app/pharmacy/inventory/adjust");
        }
        const inventory = await listInventoryItems(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          facilityId: selectedFacility.id,
        });
        return await renderShell(req, res, {
          content: "app/pharmacy-stock-adjust-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Adjust stock", description: "Correct inventory quantities with a reason.", actions: [] },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Inventory", href: "/app/pharmacy/inventory" },
            { label: "Adjust stock" },
          ],
          pageData: {
            facility: selectedFacility,
            inventoryItems: (inventory.ok && inventory.inventoryItems) || [],
            values: {},
            error: null,
            stitch: { desktop: STITCH_OPS.adjust },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Stock Adjust (POST)
  app.post(
    "/app/pharmacy/inventory/adjust",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: "/app/pharmacy/inventory/adjust",
              linkLabel: "Try again",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        const result = await adjustStock(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: selectedFacility.id,
          inventoryItemId: req.body.inventoryItemId || null,
          quantityDelta: parseInt(req.body.quantityDelta, 10),
          reason: req.body.reason,
        });

        if (!result.ok) {
          const inventory = await listInventoryItems(getPool(), {
            staffId: auth.staffMember.id,
            organizationId: auth.organization.id,
            facilityId: selectedFacility.id,
          });
          return await renderShell(req, res, {
            content: "app/pharmacy-stock-adjust-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: "Adjust stock", description: "Correct inventory quantities with a reason.", actions: [] },
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Inventory", href: "/app/pharmacy/inventory" },
              { label: "Adjust stock" },
            ],
            pageData: {
              facility: selectedFacility,
              inventoryItems: (inventory.ok && inventory.inventoryItems) || [],
              values: req.body,
              error: mapPharmacyError(result.result),
              stitch: { desktop: STITCH_OPS.adjust },
            },
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

  // Stock Transfer (GET)
  app.get(
    "/app/pharmacy/inventory/transfer",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        if (!selectedFacility || !selectedFacility.id) {
          return res.redirect(303, "/app/select-facility?return=/app/pharmacy/inventory/transfer");
        }
        const [medications, facilities] = await Promise.all([
          listMedications(getPool(), {
            staffId: auth.staffMember.id,
            organizationId: auth.organization.id,
            healthcareOrganizationId: auth.healthcareOrganization.id,
          }),
          listFacilitiesByOrganization(getPool(), {
            organizationId: auth.organization.id,
          }),
        ]);
        const facilityOptions = ((facilities && facilities.facilities) || []).filter(
          (f) =>
            f.healthcareOrganizationId === auth.healthcareOrganization.id &&
            ["active", "planned"].includes(f.status)
        );
        return await renderShell(req, res, {
          content: "app/pharmacy-stock-transfer-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Transfer stock", description: "Move stock between facilities in this organization.", actions: [] },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Inventory", href: "/app/pharmacy/inventory" },
            { label: "Transfer stock" },
          ],
          pageData: {
            facility: selectedFacility,
            medications: (medications.ok && medications.medications) || [],
            facilities: facilityOptions,
            values: { sourceFacilityId: selectedFacility.id },
            error: null,
            stitch: { desktop: STITCH_OPS.transfer },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Stock Transfer (POST)
  app.post(
    "/app/pharmacy/inventory/transfer",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: "/app/pharmacy/inventory/transfer",
              linkLabel: "Try again",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        const result = await transferStock(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          sourceFacilityId: req.body.sourceFacilityId || selectedFacility.id,
          destinationFacilityId: req.body.destinationFacilityId,
          medicationCatalogueItemId: req.body.medicationCatalogueItemId,
          quantity: parseInt(req.body.quantity, 10),
          reason: req.body.reason,
        });

        if (!result.ok) {
          const [medications, facilities] = await Promise.all([
            listMedications(getPool(), {
              staffId: auth.staffMember.id,
              organizationId: auth.organization.id,
              healthcareOrganizationId: auth.healthcareOrganization.id,
            }),
            listFacilitiesByOrganization(getPool(), {
              organizationId: auth.organization.id,
            }),
          ]);
          const facilityOptions = ((facilities && facilities.facilities) || []).filter(
            (f) =>
              f.healthcareOrganizationId === auth.healthcareOrganization.id &&
              ["active", "planned"].includes(f.status)
          );
          return await renderShell(req, res, {
            content: "app/pharmacy-stock-transfer-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: "Transfer stock", description: "Move stock between facilities in this organization.", actions: [] },
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Inventory", href: "/app/pharmacy/inventory" },
              { label: "Transfer stock" },
            ],
            pageData: {
              facility: selectedFacility,
              medications: (medications.ok && medications.medications) || [],
              facilities: facilityOptions,
              values: req.body,
              error: mapPharmacyError(result.result),
              stitch: { desktop: STITCH_OPS.transfer },
            },
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

  // Prescription substitution (GET)
  app.get(
    "/app/pharmacy/prescriptions/:id/substitute",
    requireAuth,
    requirePermission([PERM.PHARMACY_REVIEW, PERM.PHARMACY_DISPENSE]),
    requireDepartment("pharmacy"),
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

        const auth = req.activeClinicAuth;
        const [loaded, medications] = await Promise.all([
          getPrescriptionById(getPool(), {
            staffId: auth.staffMember.id,
            organizationId: auth.organization.id,
            prescriptionId,
          }),
          listMedications(getPool(), {
            staffId: auth.staffMember.id,
            organizationId: auth.organization.id,
            healthcareOrganizationId: auth.healthcareOrganization.id,
          }),
        ]);

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Prescription not found", mapPharmacyError(loaded.result), {
              status: 404,
              linkHref: "/app/pharmacy/queue",
              linkLabel: "Back to queue",
            })
          );
        }

        return await renderShell(req, res, {
          content: "app/pharmacy-substitution-content.ejs",
          activeNav: "pharmacy",
          pageHeader: {
            title: `Substitute ${loaded.prescription.prescriptionNumber}`,
            description: "Record an allowed medication substitution.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
            { label: loaded.prescription.prescriptionNumber, href: `/app/pharmacy/prescriptions/${prescriptionId}` },
            { label: "Substitute" },
          ],
          pageData: {
            prescription: loaded.prescription,
            items: loaded.items || [],
            medications: (medications.ok && medications.medications) || [],
            values: {},
            error: null,
            stitch: { desktop: STITCH_OPS.substitution },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Prescription substitution (POST)
  app.post(
    "/app/pharmacy/prescriptions/:id/substitute",
    requireAuth,
    requirePermission([PERM.PHARMACY_REVIEW, PERM.PHARMACY_DISPENSE]),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: `/app/pharmacy/prescriptions/${req.params.id}/substitute`,
              linkLabel: "Try again",
            })
          );
        }

        const prescriptionId = req.params.id;
        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;

        const result = await substitutePrescriptionItem(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: selectedFacility && selectedFacility.id,
          prescriptionId,
          prescriptionItemId: req.body.prescriptionItemId,
          substitutedWithMedicationId: req.body.substitutedWithMedicationId,
          substitutionReason: req.body.substitutionReason,
        });

        if (!result.ok) {
          const [loaded, medications] = await Promise.all([
            getPrescriptionById(getPool(), {
              staffId: auth.staffMember.id,
              organizationId: auth.organization.id,
              prescriptionId,
            }),
            listMedications(getPool(), {
              staffId: auth.staffMember.id,
              organizationId: auth.organization.id,
              healthcareOrganizationId: auth.healthcareOrganization.id,
            }),
          ]);
          return await renderShell(req, res, {
            content: "app/pharmacy-substitution-content.ejs",
            activeNav: "pharmacy",
            pageHeader: {
              title: `Substitute ${(loaded.prescription && loaded.prescription.prescriptionNumber) || ""}`,
              description: "Record an allowed medication substitution.",
              actions: [],
            },
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Queue", href: "/app/pharmacy/queue" },
              {
                label: (loaded.prescription && loaded.prescription.prescriptionNumber) || "Prescription",
                href: `/app/pharmacy/prescriptions/${prescriptionId}`,
              },
              { label: "Substitute" },
            ],
            pageData: {
              prescription: (loaded.ok && loaded.prescription) || {},
              items: (loaded.ok && loaded.items) || [],
              medications: (medications.ok && medications.medications) || [],
              values: req.body,
              error: mapPharmacyError(result.result),
              stitch: { desktop: STITCH_OPS.substitution },
            },
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

  // Purchase orders list
  app.get(
    "/app/pharmacy/purchase-orders",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        if (!selectedFacility || !selectedFacility.id) {
          return res.redirect(303, "/app/select-facility?return=/app/pharmacy/purchase-orders");
        }
        const listed = await listPurchaseOrders(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: selectedFacility.id,
          status: req.query.status || null,
        });
        if (!listed.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Purchase orders unavailable", mapPharmacyError(listed.result), {
              status: 403,
              linkHref: "/app/pharmacy",
              linkLabel: "Back to pharmacy",
            })
          );
        }
        return await renderShell(req, res, {
          content: "app/pharmacy-purchase-orders-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "Purchase orders", description: "Draft and submitted pharmacy purchase orders.", actions: [] },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Purchase orders", href: "/app/pharmacy/purchase-orders" },
          ],
          pageData: {
            facility: selectedFacility,
            purchaseOrders: listed.purchaseOrders || [],
            canManage: Array.isArray(auth.permissions) && auth.permissions.includes(PERM.INVENTORY_MANAGE),
            stitch: { desktop: STITCH_OPS.purchaseOrder },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // New purchase order (GET)
  app.get(
    "/app/pharmacy/purchase-orders/new",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        if (!selectedFacility || !selectedFacility.id) {
          return res.redirect(303, "/app/select-facility?return=/app/pharmacy/purchase-orders/new");
        }
        const medications = await listMedications(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });
        return await renderShell(req, res, {
          content: "app/pharmacy-purchase-order-form-content.ejs",
          activeNav: "pharmacy",
          pageHeader: { title: "New purchase order", description: "Create a draft purchase order.", actions: [] },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Purchase orders", href: "/app/pharmacy/purchase-orders" },
            { label: "New" },
          ],
          pageData: {
            facility: selectedFacility,
            medications: (medications.ok && medications.medications) || [],
            values: {},
            error: null,
            stitch: { desktop: STITCH_OPS.purchaseOrder },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // New purchase order (POST)
  app.post(
    "/app/pharmacy/purchase-orders/new",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: "/app/pharmacy/purchase-orders/new",
              linkLabel: "Try again",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const selectedFacility = auth.selectedFacility;
        const medIds = [].concat(req.body.medicationCatalogueItemId || []).filter(Boolean);
        const qtys = [].concat(req.body.quantityOrdered || []);
        const costs = [].concat(req.body.unitCost || []);
        const items = medIds.map((id, idx) => ({
          medicationCatalogueItemId: id,
          quantityOrdered: parseInt(qtys[idx], 10),
          unitCost: costs[idx] !== undefined && costs[idx] !== "" ? parseFloat(costs[idx]) : null,
        }));

        const result = await createPurchaseOrder(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: selectedFacility.id,
          supplierName: req.body.supplierName,
          notes: req.body.notes || null,
          items,
        });

        if (!result.ok) {
          const medications = await listMedications(getPool(), {
            staffId: auth.staffMember.id,
            organizationId: auth.organization.id,
            healthcareOrganizationId: auth.healthcareOrganization.id,
          });
          return await renderShell(req, res, {
            content: "app/pharmacy-purchase-order-form-content.ejs",
            activeNav: "pharmacy",
            pageHeader: { title: "New purchase order", description: "Create a draft purchase order.", actions: [] },
            breadcrumbs: [
              { label: "Pharmacy", href: "/app/pharmacy" },
              { label: "Purchase orders", href: "/app/pharmacy/purchase-orders" },
              { label: "New" },
            ],
            pageData: {
              facility: selectedFacility,
              medications: (medications.ok && medications.medications) || [],
              values: req.body,
              error: mapPharmacyError(result.result),
              stitch: { desktop: STITCH_OPS.purchaseOrder },
            },
            flash: { error: mapPharmacyError(result.result) },
            status: 400,
          });
        }

        return res.redirect(303, `/app/pharmacy/purchase-orders/${result.purchaseOrder.id}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // Purchase order detail
  app.get(
    "/app/pharmacy/purchase-orders/:id",
    requireAuth,
    requirePermission(PERM.INVENTORY_VIEW),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const purchaseOrderId = req.params.id;
        if (!UUID_RE.test(purchaseOrderId)) {
          return res.status(404).type("html").send(
            renderSimpleState("Not Found", "Invalid purchase order ID.", {
              status: 404,
              linkHref: "/app/pharmacy/purchase-orders",
              linkLabel: "Back to purchase orders",
            })
          );
        }

        const auth = req.activeClinicAuth;
        const loaded = await getPurchaseOrder(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          purchaseOrderId,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Purchase order not found", mapPharmacyError(loaded.result), {
              status: 404,
              linkHref: "/app/pharmacy/purchase-orders",
              linkLabel: "Back to purchase orders",
            })
          );
        }

        return await renderShell(req, res, {
          content: "app/pharmacy-purchase-order-detail-content.ejs",
          activeNav: "pharmacy",
          pageHeader: {
            title: loaded.purchaseOrder.poNumber,
            description: "Purchase order detail.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Purchase orders", href: "/app/pharmacy/purchase-orders" },
            { label: loaded.purchaseOrder.poNumber },
          ],
          pageData: {
            purchaseOrder: loaded.purchaseOrder,
            items: loaded.items || [],
            canManage: Array.isArray(auth.permissions) && auth.permissions.includes(PERM.INVENTORY_MANAGE),
            stitch: { desktop: STITCH_OPS.purchaseOrder },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Submit purchase order
  app.post(
    "/app/pharmacy/purchase-orders/:id/submit",
    requireAuth,
    requirePermission(PERM.INVENTORY_MANAGE),
    requireDepartment("pharmacy"),
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).type("html").send(
            renderSimpleState("Security Check Failed", "Invalid CSRF token. Refresh and try again.", {
              status: 403,
              linkHref: `/app/pharmacy/purchase-orders/${req.params.id}`,
              linkLabel: "Try again",
            })
          );
        }

        const purchaseOrderId = req.params.id;
        const auth = req.activeClinicAuth;
        const result = await submitPurchaseOrder(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          purchaseOrderId,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Unable to submit", mapPharmacyError(result.result), {
              status: 400,
              linkHref: `/app/pharmacy/purchase-orders/${purchaseOrderId}`,
              linkLabel: "Back to purchase order",
            })
          );
        }

        return res.redirect(303, `/app/pharmacy/purchase-orders/${purchaseOrderId}`);
      } catch (err) {
        next(err);
      }
    }
  );

  // Medicine labels
  app.get(
    "/app/pharmacy/prescriptions/:id/labels",
    requireAuth,
    requirePermission([PERM.PHARMACY_VIEW, PERM.PHARMACY_DISPENSE]),
    requireDepartment("pharmacy"),
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

        const auth = req.activeClinicAuth;
        const loaded = await getMedicineLabel(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          prescriptionId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Labels unavailable", mapPharmacyError(loaded.result), {
              status: 404,
              linkHref: "/app/pharmacy/queue",
              linkLabel: "Back to queue",
            })
          );
        }

        return await renderShell(req, res, {
          content: "app/pharmacy-medicine-labels-content.ejs",
          activeNav: "pharmacy",
          pageHeader: {
            title: `Labels · ${loaded.prescription.prescriptionNumber}`,
            description: "Print-friendly medicine labels.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
            { label: loaded.prescription.prescriptionNumber, href: `/app/pharmacy/prescriptions/${prescriptionId}` },
            { label: "Labels" },
          ],
          pageData: {
            prescription: loaded.prescription,
            labels: loaded.labels || [],
            stitch: { desktop: STITCH_OPS.labels },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // Patient medicine instructions
  app.get(
    "/app/pharmacy/prescriptions/:id/instructions",
    requireAuth,
    requirePermission(PERM.PHARMACY_VIEW),
    requireDepartment("pharmacy"),
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

        const auth = req.activeClinicAuth;
        const loaded = await getPatientMedicineInstructions(getPool(), {
          staffId: auth.staffMember.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          prescriptionId,
        });

        if (!loaded.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Instructions unavailable", mapPharmacyError(loaded.result), {
              status: 404,
              linkHref: "/app/pharmacy/queue",
              linkLabel: "Back to queue",
            })
          );
        }

        return await renderShell(req, res, {
          content: "app/pharmacy-medicine-instructions-content.ejs",
          activeNav: "pharmacy",
          pageHeader: {
            title: `Instructions · ${loaded.prescription.prescriptionNumber}`,
            description: "Patient-facing medicine instructions.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Pharmacy", href: "/app/pharmacy" },
            { label: "Queue", href: "/app/pharmacy/queue" },
            { label: loaded.prescription.prescriptionNumber, href: `/app/pharmacy/prescriptions/${prescriptionId}` },
            { label: "Instructions" },
          ],
          pageData: {
            prescription: loaded.prescription,
            instructions: loaded.instructions || [],
            stitch: { mobile: STITCH_OPS.instructions },
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicPharmacyRoutes,
};
