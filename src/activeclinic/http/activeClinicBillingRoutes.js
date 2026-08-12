"use strict";

/**
 * ActiveClinic P07 — Billing routes
 * Billing dashboard, charge catalog, patient charges, invoices
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
  listChargeCatalogItems,
  createChargeCatalogItem,
  createPatientCharge,
  createInvoice,
  postInvoice,
  recordPayment,
  refundPayment,
  reversePayment,
  voidInvoice,
  amendPostedInvoice,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
  PERM: BILLING_PERM,
} = require("../services/activeClinicBillingService");
const billingOps = require("../services/activeClinicBillingOpsService");
const { formatMoney, parseMoneyInput } = require("../services/formatMoney");
const {
  financeIdsFromAuth,
  hasFinancePermission,
} = require("../services/activeClinicFinanceAuthz");

function registerActiveClinicBillingRoutes(app, deps) {
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
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  // ========================================================================
  // BILLING DASHBOARD
  // ========================================================================

  app.get(
    "/app/billing",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing");
        }

        const pool = getPool();
        const today = new Date().toISOString().split("T")[0];

        // Simple KPIs for dashboard
        const unpaidInvoicesResult = await pool.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(total_amount_minor), 0) as total
           FROM activeclinic.invoices
           WHERE tenant_id = $1 AND facility_id = $2 AND status = 'posted'
             AND id NOT IN (
               SELECT DISTINCT invoice_id FROM activeclinic.payment_allocations
             )`,
          [auth.tenantId, facility.id]
        );

        const todayPaymentsResult = await pool.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(amount_minor), 0) as total
           FROM activeclinic.payments
           WHERE tenant_id = $1 AND facility_id = $2 AND payment_date = $3`,
          [auth.tenantId, facility.id, today]
        );

        const dashboard = {
          unpaidInvoices: {
            count: parseInt(unpaidInvoicesResult.rows[0].count, 10),
            totalMinor: parseInt(unpaidInvoicesResult.rows[0].total, 10),
            totalFormatted: formatMoney(
              parseInt(unpaidInvoicesResult.rows[0].total, 10)
            ),
          },
          todayPayments: {
            count: parseInt(todayPaymentsResult.rows[0].count, 10),
            totalMinor: parseInt(todayPaymentsResult.rows[0].total, 10),
            totalFormatted: formatMoney(
              parseInt(todayPaymentsResult.rows[0].total, 10)
            ),
          },
        };

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-dashboard-content.ejs",
          pageHeader: {
            title: "Billing dashboard",
            description: "Overview of billing operations and financials.",
            actions: [
              { label: "Charge catalog", href: "/app/billing/catalog" },
            ],
          },
          breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Billing" }],
          pageData: {
            dashboard,
            stitch: {
              desktop: "ece0b9d1d9384f5d8c1e3b944f122e47",
              mobile: "649bd7649ebf4c6eb787612f844a637e",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // CHARGE CATALOG
  // ========================================================================

  app.get(
    "/app/billing/catalog",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/catalog");
        }

        const result = await listChargeCatalogItems({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
        });

        if (result.result !== BILLING_RESULT.OK) {
          return await renderShell(req, res, {
            activeNav: "billing",
            content: "app/access-state.ejs",
            pageHeader: { title: "Access denied", description: "", actions: [] },
            breadcrumbs: [{ label: "Billing", href: "/app/billing" }, { label: "Catalog" }],
            pageData: { reason: result.reason || "access_denied" },
          });
        }

        const items = (result.items || []).map((item) => ({
          ...item,
          amountFormatted: formatMoney(item.amountMinor, item.currencyCode),
        }));

        const canManageCatalog = hasFinancePermission(
          auth.permissions,
          BILLING_PERM.CATALOG_MANAGE
        );

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-catalog-content.ejs",
          pageHeader: {
            title: "Charge catalog",
            description: "Service and procedure price list.",
            actions: canManageCatalog
              ? [{ label: "Add charge item", href: "/app/billing/catalog/new" }]
              : [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Catalog" },
          ],
          pageData: {
            items,
            capabilities: { canManageCatalog },
            stitch: {
              desktop: "4ca894f70d6646eca246847cd8c39d6a",
              mobile: "1ab29b0691c04233a1c972ea99f24351",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/catalog/new",
    requireAuth,
    requirePermission("activeclinic.billing.catalog.manage"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-catalog-form-content.ejs",
          pageHeader: {
            title: "Add charge item",
            description: "Create a new catalog item for billing.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Catalog", href: "/app/billing/catalog" },
            { label: "Add item" },
          ],
          pageData: {
            stitch: { desktop: "d5eb57a8319c4130be473f8dd23851d6" },
            mode: "create",
            item: {},
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/catalog",
    requireAuth,
    requirePermission("activeclinic.billing.catalog.manage"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }

        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const amountMinor = parseMoneyInput(req.body.amount || "0");
        if (amountMinor === null || amountMinor < 0) {
          return res.redirect(303, "/app/billing/catalog/new?error=invalid_amount");
        }

        const result = await createChargeCatalogItem({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          code: String(req.body.code || "").trim().toUpperCase(),
          name: String(req.body.name || "").trim(),
          description: String(req.body.description || "").trim() || null,
          category: String(req.body.category || "").trim() || null,
          amountMinor,
          currencyCode: "ZMW",
        });

        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(303, `/app/billing/catalog/new?error=${result.result}`);
        }

        return res.redirect(303, "/app/billing/catalog");
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // PATIENT ACCOUNT / CHARGES
  // ========================================================================

  app.get(
    "/app/billing/patients/:patientNumber",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const pool = getPool();
        const patientResult = await pool.query(
          `SELECT p.*, pr.patient_number
           FROM activeclinic.patients p
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
           WHERE p.tenant_id = $1 AND pr.patient_number = $2
           LIMIT 1`,
          [auth.tenantId, req.params.patientNumber]
        );

        if (patientResult.rows.length === 0) {
          return res.status(404).send("Patient not found");
        }

        const patient = patientResult.rows[0];

        const chargesResult = await pool.query(
          `SELECT * FROM activeclinic.patient_charges
           WHERE tenant_id = $1 AND patient_id = $2
           ORDER BY charged_at DESC`,
          [auth.tenantId, patient.id]
        );

        const invoicesResult = await pool.query(
          `SELECT * FROM activeclinic.invoices
           WHERE tenant_id = $1 AND patient_id = $2
           ORDER BY invoice_date DESC`,
          [auth.tenantId, patient.id]
        );

        const charges = chargesResult.rows.map((c) => ({
          ...c,
          totalAmountFormatted: formatMoney(
            parseInt(c.total_amount_minor, 10),
            c.currency_code
          ),
        }));

        const invoices = invoicesResult.rows.map((inv) => ({
          ...inv,
          totalAmountFormatted: formatMoney(
            parseInt(inv.total_amount_minor, 10),
            inv.currency_code
          ),
        }));

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-patient-account-content.ejs",
          pageHeader: {
            title: `Patient account: ${patient.first_name} ${patient.last_name}`,
            description: `Billing account for patient ${req.params.patientNumber}`,
            actions: [
              { label: "Create charge", href: `/app/billing/patients/${req.params.patientNumber}/charges/new` },
              { label: "Create invoice", href: `/app/billing/invoices/new?patient=${req.params.patientNumber}` },
            ],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Patient account" },
          ],
          pageData: {
            patient: {
              patientNumber: req.params.patientNumber,
              displayName: `${patient.first_name} ${patient.last_name}`,
            },
            charges,
            invoices,
            stitch: {
              desktop: "a84263ac97b8484698dc36d00b498ffa",
              mobile: "c15d892b327848a6a2897ae3a08a5803",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // INVOICE CREATE
  // ========================================================================

  app.get(
    "/app/billing/invoices/new",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.create"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const patientNumber = req.query.patient || null;
        let patient = null;
        let pendingCharges = [];

        if (patientNumber) {
          const pool = getPool();
          const patientResult = await pool.query(
            `SELECT p.*, pr.patient_number
             FROM activeclinic.patients p
             JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
             WHERE p.tenant_id = $1 AND pr.patient_number = $2
             LIMIT 1`,
            [auth.tenantId, patientNumber]
          );

          if (patientResult.rows.length > 0) {
            patient = patientResult.rows[0];

            const chargesResult = await pool.query(
              `SELECT * FROM activeclinic.patient_charges
               WHERE tenant_id = $1 AND patient_id = $2 AND status = 'pending'
               ORDER BY charged_at DESC`,
              [auth.tenantId, patient.id]
            );

            pendingCharges = chargesResult.rows.map((c) => ({
              ...c,
              totalAmountFormatted: formatMoney(
                parseInt(c.total_amount_minor, 10),
                c.currency_code
              ),
            }));
          }
        }

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-create-content.ejs",
          pageHeader: {
            title: "Create invoice",
            description: "Create a new patient invoice from charges.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Invoices", href: "/app/billing/invoices" },
            { label: "Create" },
          ],
          pageData: {
            patient: patient
              ? {
                  patientNumber,
                  displayName: `${patient.first_name} ${patient.last_name}`,
                  id: patient.id,
                }
              : null,
            pendingCharges,
            stitch: { desktop: "08ed6ee0d02447bca5e94698080bca4f" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/invoices",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.create"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }

        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const patientNumber = String(req.body.patient_number || "").trim();
        const chargeIds = Array.isArray(req.body.charge_ids)
          ? req.body.charge_ids
          : [req.body.charge_ids].filter(Boolean);

        if (!patientNumber || chargeIds.length === 0) {
          return res.redirect(303, "/app/billing/invoices/new?error=invalid_input");
        }

        const pool = getPool();
        const patientResult = await pool.query(
          `SELECT p.id FROM activeclinic.patients p
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
           WHERE p.tenant_id = $1 AND pr.patient_number = $2
           LIMIT 1`,
          [auth.tenantId, patientNumber]
        );

        if (patientResult.rows.length === 0) {
          return res.redirect(303, "/app/billing/invoices/new?error=patient_not_found");
        }

        const patientId = patientResult.rows[0].id;

        const result = await createInvoice({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          patientId,
          chargeIds,
        });

        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(303, `/app/billing/invoices/new?error=${result.result}`);
        }

        return res.redirect(303, `/app/billing/invoices/${result.invoice.id}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // INVOICE DETAIL
  // ========================================================================

  app.get(
    "/app/billing/invoices/:invoiceId",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const pool = getPool();

        const invoiceResult = await pool.query(
          `SELECT i.*, p.first_name, p.last_name, pr.patient_number
           FROM activeclinic.invoices i
           JOIN activeclinic.patients p ON i.patient_id = p.id
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
           WHERE i.id = $1 AND i.tenant_id = $2
           LIMIT 1`,
          [req.params.invoiceId, auth.tenantId]
        );

        if (invoiceResult.rows.length === 0) {
          return res.status(404).send("Invoice not found");
        }

        const invoice = invoiceResult.rows[0];

        const linesResult = await pool.query(
          `SELECT * FROM activeclinic.invoice_lines
           WHERE invoice_id = $1
           ORDER BY line_number`,
          [invoice.id]
        );

        const lines = linesResult.rows.map((line) => ({
          ...line,
          unitAmountFormatted: formatMoney(
            parseInt(line.unit_amount_minor, 10),
            line.currency_code
          ),
          lineTotalFormatted: formatMoney(
            parseInt(line.line_total_minor, 10),
            line.currency_code
          ),
        }));

        const actions = [];
        const perms = auth.permissions || [];
        if (
          (invoice.status === "draft" || invoice.status === "pending") &&
          hasFinancePermission(perms, BILLING_PERM.INVOICE_POST)
        ) {
          actions.push({
            label: "Post invoice",
            href: `/app/billing/invoices/${invoice.id}/post`,
          });
        }
        if (
          invoice.status === "posted" &&
          hasFinancePermission(perms, BILLING_PERM.PAYMENT_COLLECT)
        ) {
          actions.push({
            label: "Record payment",
            href: `/app/cashier/payment?invoice=${invoice.id}`,
          });
        }
        if (
          invoice.status === "posted" &&
          hasFinancePermission(perms, BILLING_PERM.INVOICE_VOID)
        ) {
          actions.push({
            label: "Void invoice",
            href: `/app/billing/invoices/${invoice.id}/void`,
          });
        }
        if (
          invoice.status === "posted" &&
          hasFinancePermission(perms, BILLING_PERM.INVOICE_AMEND)
        ) {
          actions.push({
            label: "Amend invoice",
            href: `/app/billing/invoices/${invoice.id}/amend`,
          });
        }

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-detail-content.ejs",
          pageHeader: {
            title: `Invoice ${invoice.invoice_number}`,
            description: `Status: ${invoice.status}`,
            actions,
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Invoices", href: "/app/billing/invoices" },
            { label: invoice.invoice_number },
          ],
          pageData: {
            invoice: {
              ...invoice,
              totalAmountFormatted: formatMoney(
                parseInt(invoice.total_amount_minor, 10),
                invoice.currency_code
              ),
              subtotalFormatted: formatMoney(
                parseInt(invoice.subtotal_minor, 10),
                invoice.currency_code
              ),
              taxAmountFormatted: formatMoney(
                parseInt(invoice.tax_amount_minor, 10),
                invoice.currency_code
              ),
              patientName: `${invoice.first_name} ${invoice.last_name}`,
              patientNumber: invoice.patient_number,
            },
            lines,
            stitch: {
              desktop: "9f422c33e30c450e9502126ba4012585",
              mobile: "3735516f4ecb4624ac715c6f77e7810b",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // POST INVOICE (Finalize)
  // ========================================================================

  app.get(
    "/app/billing/invoices/:invoiceId/post",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.post"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const pool = getPool();

        const invoiceResult = await pool.query(
          `SELECT * FROM activeclinic.invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.params.invoiceId, auth.tenantId]
        );

        if (invoiceResult.rows.length === 0) {
          return res.status(404).send("Invoice not found");
        }

        const invoice = invoiceResult.rows[0];

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-post-content.ejs",
          pageHeader: {
            title: "Post invoice",
            description: "Finalize this invoice (makes it immutable).",
            actions: [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Invoices", href: "/app/billing/invoices" },
            { label: invoice.invoice_number, href: `/app/billing/invoices/${invoice.id}` },
            { label: "Post" },
          ],
          pageData: {
            invoice: {
              ...invoice,
              totalAmountFormatted: formatMoney(
                parseInt(invoice.total_amount_minor, 10),
                invoice.currency_code
              ),
            },
            stitch: { desktop: "319d7fca2acb45a38432aa40a2e7cf30" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/invoices/:invoiceId/post",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.post"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }

        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const result = await postInvoice({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          invoiceId: req.params.invoiceId,
        });

        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(303, `/app/billing/invoices/${req.params.invoiceId}?error=${result.result}`);
        }

        return res.redirect(303, `/app/billing/invoices/${req.params.invoiceId}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // INVOICE LIST
  // ========================================================================

  app.get(
    "/app/billing/invoices",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const pool = getPool();
        const invoicesResult = await pool.query(
          `SELECT i.*, p.first_name, p.last_name, pr.patient_number
           FROM activeclinic.invoices i
           JOIN activeclinic.patients p ON i.patient_id = p.id
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
           WHERE i.tenant_id = $1 AND i.facility_id = $2
           ORDER BY i.invoice_date DESC, i.created_at DESC
           LIMIT 100`,
          [auth.tenantId, facility.id]
        );

        const invoices = invoicesResult.rows.map((inv) => ({
          ...inv,
          totalAmountFormatted: formatMoney(
            parseInt(inv.total_amount_minor, 10),
            inv.currency_code
          ),
          patientName: `${inv.first_name} ${inv.last_name}`,
        }));

        const canCreateInvoice = hasFinancePermission(
          auth.permissions,
          BILLING_PERM.INVOICE_CREATE
        );

        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-list-content.ejs",
          pageHeader: {
            title: "Invoices",
            description: "Patient invoices and billing records.",
            actions: canCreateInvoice
              ? [{ label: "Create invoice", href: "/app/billing/invoices/new" }]
              : [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Invoices" },
          ],
          pageData: {
            invoices,
            capabilities: { canCreateInvoice },
            stitch: {
              desktop: "c479c86234b840419e821c2c48329f4e",
              mobile: "40fcc3c9e03e42a68e2cadbd5c1a7685",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // ELEVATED: VOID / AMEND POSTED INVOICE
  // ========================================================================

  app.get(
    "/app/billing/invoices/:invoiceId/void",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.void"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const { tenantId } = financeIdsFromAuth(auth);
        const inv = await getPool().query(
          `SELECT id, invoice_number, status FROM activeclinic.invoices
            WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.params.invoiceId, tenantId]
        );
        if (!inv.rows.length) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Invoice not found", { status: 404 })
          );
        }
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-void-content.ejs",
          pageHeader: { title: "Void invoice" },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: inv.rows[0].invoice_number, href: `/app/billing/invoices/${inv.rows[0].id}` },
            { label: "Void" },
          ],
          pageData: { invoice: inv.rows[0] },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/invoices/:invoiceId/void",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.void"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await voidInvoice({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          invoiceId: req.params.invoiceId,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/invoices/${req.params.invoiceId}/void?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/billing/invoices/${req.params.invoiceId}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/invoices/:invoiceId/amend",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.amend"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const { tenantId } = financeIdsFromAuth(auth);
        const inv = await getPool().query(
          `SELECT id, invoice_number, status, notes, adjustment_minor
             FROM activeclinic.invoices
            WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
          [req.params.invoiceId, tenantId]
        );
        if (!inv.rows.length) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Invoice not found", { status: 404 })
          );
        }
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-invoice-amend-content.ejs",
          pageHeader: { title: "Amend invoice" },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: inv.rows[0].invoice_number, href: `/app/billing/invoices/${inv.rows[0].id}` },
            { label: "Amend" },
          ],
          pageData: { invoice: inv.rows[0] },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/invoices/:invoiceId/amend",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.amend"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const adj = parseMoneyInput(req.body.adjustment || "0");
        const result = await amendPostedInvoice({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          invoiceId: req.params.invoiceId,
          notes: String(req.body.notes || "").trim() || null,
          adjustmentMinor: adj,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/invoices/${req.params.invoiceId}/amend?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/billing/invoices/${req.params.invoiceId}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // PHASE 4: AR / COLLECTIONS / CHARGE REVIEW / CREDIT NOTES / CORRECTIONS
  // ========================================================================

  function billingIds(auth, facility) {
    const ids = financeIdsFromAuth(auth);
    return {
      tenantId: ids.tenantId,
      facilityId: facility.id,
      staffId: ids.staffId,
      platformIdentityId: ids.platformIdentityId,
    };
  }

  app.get(
    "/app/billing/ar",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/ar");
        }
        const result = await billingOps.listAccountsReceivable(getPool(), billingIds(auth, facility));
        if (result.result === billingOps.RESULT.ACCESS_DENIED) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Billing view permission required.", { status: 403 })
          );
        }
        const items = (result.items || []).map((row) => ({
          ...row,
          totalFormatted: formatMoney(row.totalAmountMinor, row.currencyCode),
          balanceFormatted: formatMoney(row.balanceMinor, row.currencyCode),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-ar-content.ejs",
          pageHeader: {
            title: "Accounts receivable",
            description: "Posted invoices with outstanding balances.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Accounts receivable" },
          ],
          pageData: {
            items,
            stitch: { desktop: "1829edeb5d1741be9b6ae68a219ef7cc" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/collections",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/collections");
        }
        const result = await billingOps.listCollectionsQueue(getPool(), {
          ...billingIds(auth, facility),
          minDaysOutstanding: toIntQuery(req.query.minDays, 0),
        });
        if (result.result === billingOps.RESULT.ACCESS_DENIED) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Billing view permission required.", { status: 403 })
          );
        }
        const items = (result.items || []).map((row) => ({
          ...row,
          balanceFormatted: formatMoney(row.balanceMinor, row.currencyCode),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-collections-content.ejs",
          pageHeader: {
            title: "Collections queue",
            description: "Outstanding balances for follow-up.",
            actions: [
              { label: "Log contact", href: "/app/billing/collections/contact" },
            ],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Collections" },
          ],
          pageData: {
            items,
            stitch: { desktop: "16318693e2874e79a8463d91c6ba63ad" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/collections/contact",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-collections-contact-content.ejs",
          pageHeader: {
            title: "Record collections contact",
            description: "Log patient outreach for outstanding balances.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Collections", href: "/app/billing/collections" },
            { label: "Contact" },
          ],
          pageData: {
            prefill: {
              patientId: req.query.patientId || "",
              invoiceId: req.query.invoiceId || "",
            },
            stitch: { desktop: "513301ae28e1423ab7431e299cf45eee" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/collections/contact",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.recordCollectionsContact(getPool(), {
          ...billingIds(auth, facility),
          patientId: String(req.body.patientId || "").trim(),
          invoiceId: String(req.body.invoiceId || "").trim() || null,
          contactMethod: String(req.body.contactMethod || "").trim(),
          outcome: String(req.body.outcome || "attempted").trim(),
          notes: String(req.body.notes || "").trim() || null,
        });
        if (result.result !== billingOps.RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/billing/collections/contact?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/billing/collections?contacted=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/charges/review",
    requireAuth,
    requirePermission("activeclinic.billing.charge.review"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/charges/review");
        }
        const result = await billingOps.listPendingChargeReviews(getPool(), billingIds(auth, facility));
        if (result.result === billingOps.RESULT.ACCESS_DENIED) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Charge review permission required.", { status: 403 })
          );
        }
        const items = (result.items || []).map((row) => ({
          ...row,
          totalFormatted: formatMoney(row.totalAmountMinor, row.currencyCode),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-charge-review-content.ejs",
          pageHeader: {
            title: "Charge review",
            description: "Approve or reject charges pending review.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Charge review" },
          ],
          pageData: {
            items,
            stitch: { desktop: "954a9269255245dd9c6e375f8cbdd93b" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/charges/:id/review",
    requireAuth,
    requirePermission("activeclinic.billing.charge.review"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.reviewPatientCharge(getPool(), {
          ...billingIds(auth, facility),
          chargeId: req.params.id,
          decision: String(req.body.decision || "").trim(),
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/charges/review?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/billing/charges/review?reviewed=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/credit-notes",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/credit-notes");
        }
        const result = await billingOps.listCreditNotes(getPool(), billingIds(auth, facility));
        const canCreate = hasFinancePermission(
          auth.permissions,
          "activeclinic.billing.invoice.amend"
        );
        const items = (result.items || []).map((row) => ({
          ...row,
          amountFormatted: formatMoney(row.amountMinor, row.currencyCode),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-credit-notes-content.ejs",
          pageHeader: {
            title: "Credit notes",
            description: "Posted credit notes against patient accounts.",
            actions: canCreate
              ? [{ label: "New credit note", href: "/app/billing/credit-notes/new" }]
              : [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Credit notes" },
          ],
          pageData: {
            items,
            capabilities: { canCreate },
            stitch: { desktop: "92b97e715c6f4c308e61d3b39d66a1e9" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/credit-notes/new",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.amend"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-credit-note-form-content.ejs",
          pageHeader: {
            title: "Create credit note",
            description: "Issue an explicit credit without silently editing invoices.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Credit notes", href: "/app/billing/credit-notes" },
            { label: "New" },
          ],
          pageData: {
            prefill: {
              patientId: req.query.patientId || "",
              invoiceId: req.query.invoiceId || "",
            },
            stitch: { desktop: "92b97e715c6f4c308e61d3b39d66a1e9" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/credit-notes/new",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.amend"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const amountMinor = parseMoneyInput(req.body.amount || "0");
        const result = await billingOps.createCreditNote(getPool(), {
          ...billingIds(auth, facility),
          patientId: String(req.body.patientId || "").trim(),
          invoiceId: String(req.body.invoiceId || "").trim() || null,
          amountMinor,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== billingOps.RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/billing/credit-notes/new?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/billing/credit-notes/${result.creditNote.id}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/credit-notes/:id",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }
        const result = await billingOps.getCreditNote(getPool(), {
          ...billingIds(auth, facility),
          creditNoteId: req.params.id,
        });
        if (result.result === billingOps.RESULT.NOT_FOUND) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Credit note not found.", { status: 404 })
          );
        }
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Unable to load credit note.", { status: 403 })
          );
        }
        const cn = result.creditNote;
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-credit-note-detail-content.ejs",
          pageHeader: {
            title: `Credit note ${cn.creditNoteNumber}`,
            description: "Credit note detail.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Credit notes", href: "/app/billing/credit-notes" },
            { label: cn.creditNoteNumber },
          ],
          pageData: {
            creditNote: {
              ...cn,
              amountFormatted: formatMoney(cn.amountMinor, cn.currencyCode),
            },
            stitch: { desktop: "92b97e715c6f4c308e61d3b39d66a1e9" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/corrections",
    requireAuth,
    requirePermission("activeclinic.billing.corrections.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/corrections");
        }
        const result = await billingOps.listFinancialCorrections(
          getPool(),
          billingIds(auth, facility)
        );
        if (result.result === billingOps.RESULT.ACCESS_DENIED) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Corrections view permission required.", {
              status: 403,
            })
          );
        }
        const items = (result.items || []).map((row) => ({
          ...row,
          amountFormatted:
            row.amountMinor != null
              ? formatMoney(row.amountMinor, row.currencyCode || "ZMW")
              : "—",
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-corrections-content.ejs",
          pageHeader: {
            title: "Financial corrections",
            description: "Refunds, reversals, and credit notes.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Corrections" },
          ],
          pageData: {
            items,
            stitch: {
              desktop: "54163d0beee74c29990bd83b77480af5",
              mobile: "a21d364d62f04c78ac8477971377eca9",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/arrangements",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/arrangements");
        }
        const result = await billingOps.listPaymentArrangements(
          getPool(),
          billingIds(auth, facility)
        );
        const canCreate = hasFinancePermission(auth.permissions, BILLING_PERM.BILLING_VIEW);
        const canReview = hasFinancePermission(
          auth.permissions,
          "activeclinic.billing.invoice.amend"
        );
        const items = (result.items || []).map((row) => ({
          ...row,
          totalFormatted: formatMoney(row.totalAmountMinor, row.currencyCode),
          installmentFormatted: formatMoney(
            row.installmentAmountMinor,
            row.currencyCode
          ),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-arrangements-content.ejs",
          pageHeader: {
            title: "Payment arrangements",
            description: "Payment plans and installment agreements.",
            actions: canCreate
              ? [{ label: "New arrangement", href: "/app/billing/arrangements/new" }]
              : [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Arrangements" },
          ],
          pageData: {
            items,
            capabilities: { canCreate, canReview },
            stitch: { desktop: "02e1c1976d844c2cac63682e1853fa46" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/arrangements/new",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-arrangement-form-content.ejs",
          pageHeader: {
            title: "New payment arrangement",
            description: "Request a payment plan for a patient balance.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Arrangements", href: "/app/billing/arrangements" },
            { label: "New" },
          ],
          pageData: {
            prefill: { patientId: req.query.patientId || "" },
            stitch: { desktop: "02e1c1976d844c2cac63682e1853fa46" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/arrangements",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.createPaymentArrangement(getPool(), {
          ...billingIds(auth, facility),
          patientId: String(req.body.patientId || "").trim(),
          totalAmountMinor: parseMoneyInput(req.body.totalAmount || "0"),
          numberOfInstallments: toIntQuery(req.body.numberOfInstallments, 0),
          installmentAmountMinor: parseMoneyInput(req.body.installmentAmount || "0"),
          installmentFrequency: String(req.body.installmentFrequency || "monthly").trim(),
          startDate: String(req.body.startDate || "").trim() || undefined,
          notes: String(req.body.notes || "").trim() || null,
        });
        if (result.result !== billingOps.RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/billing/arrangements/new?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/billing/arrangements/${result.arrangement.id}`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/arrangements/:id",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.getPaymentArrangement(getPool(), {
          ...billingIds(auth, facility),
          arrangementId: req.params.id,
        });
        if (result.result === billingOps.RESULT.NOT_FOUND) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Arrangement not found.", { status: 404 })
          );
        }
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Unable to load arrangement.", { status: 403 })
          );
        }
        const arr = result.arrangement;
        const canReview =
          arr.status === "pending" &&
          hasFinancePermission(auth.permissions, "activeclinic.billing.invoice.amend");
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-arrangement-review-content.ejs",
          pageHeader: {
            title: `Arrangement ${arr.arrangementNumber}`,
            description: "Payment arrangement detail and review.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Arrangements", href: "/app/billing/arrangements" },
            { label: arr.arrangementNumber },
          ],
          pageData: {
            arrangement: {
              ...arr,
              totalFormatted: formatMoney(arr.totalAmountMinor, arr.currencyCode),
              installmentFormatted: formatMoney(
                arr.installmentAmountMinor,
                arr.currencyCode
              ),
            },
            capabilities: { canReview },
            stitch: { desktop: "2a0ae995f3e140da863e5aede4b2e71f" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/arrangements/:id/review",
    requireAuth,
    requirePermission("activeclinic.billing.invoice.amend"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.reviewPaymentArrangement(getPool(), {
          ...billingIds(auth, facility),
          arrangementId: req.params.id,
          action: String(req.body.action || "").trim(),
          reviewNotes: String(req.body.reviewNotes || "").trim() || null,
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/arrangements/${req.params.id}?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/billing/arrangements/${req.params.id}?reviewed=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/price-overrides",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/price-overrides");
        }
        const result = await billingOps.listPriceOverrideRequests(getPool(), {
          ...billingIds(auth, facility),
          status: req.query.status || undefined,
        });
        const canApprove = hasFinancePermission(
          auth.permissions,
          BILLING_PERM.PRICE_OVERRIDE
        );
        const canRequest = hasFinancePermission(
          auth.permissions,
          BILLING_PERM.BILLING_CHARGE
        );
        const items = (result.items || []).map((row) => ({
          ...row,
          originalFormatted: formatMoney(row.originalAmountMinor, row.currencyCode),
          requestedFormatted: formatMoney(row.requestedAmountMinor, row.currencyCode),
        }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-price-overrides-content.ejs",
          pageHeader: {
            title: "Price override requests",
            description: "Review requested catalogue price changes.",
            actions: canRequest
              ? [
                  {
                    label: "Request override",
                    href: "/app/billing/price-overrides/new",
                    primary: true,
                  },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Price overrides" },
          ],
          pageData: {
            items,
            capabilities: { canApprove, canRequest },
            stitch: { desktop: "a953a043598945fdab38285c7dab7206" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/price-overrides/new",
    requireAuth,
    requirePermission("activeclinic.billing.charge"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-price-override-form-content.ejs",
          pageHeader: {
            title: "Request price override",
            description:
              "Submit original and requested amounts with a reason for approval.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Price overrides", href: "/app/billing/price-overrides" },
            { label: "New" },
          ],
          pageData: {
            prefill: {
              patientId: req.query.patientId || "",
              patientChargeId: req.query.patientChargeId || "",
            },
            stitch: { desktop: "a953a043598945fdab38285c7dab7206" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/price-overrides",
    requireAuth,
    requirePermission("activeclinic.billing.charge"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.createPriceOverrideRequest(getPool(), {
          ...billingIds(auth, facility),
          patientId: String(req.body.patientId || "").trim() || null,
          patientChargeId: String(req.body.patientChargeId || "").trim() || null,
          originalAmountMinor: parseMoneyInput(req.body.originalAmount || "0"),
          requestedAmountMinor: parseMoneyInput(req.body.requestedAmount || "0"),
          currencyCode: String(req.body.currencyCode || "ZMW").trim() || "ZMW",
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== billingOps.RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/billing/price-overrides/new?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/billing/price-overrides?created=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/price-overrides/:id/approve",
    requireAuth,
    requirePermission("activeclinic.billing.price.override"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.reviewPriceOverrideRequest(getPool(), {
          ...billingIds(auth, facility),
          requestId: req.params.id,
          action: "approve",
          reviewNotes: String(req.body.reviewNotes || "").trim() || null,
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/price-overrides?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/billing/price-overrides?approved=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/billing/price-overrides/:id/reject",
    requireAuth,
    requirePermission("activeclinic.billing.price.override"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const result = await billingOps.reviewPriceOverrideRequest(getPool(), {
          ...billingIds(auth, facility),
          requestId: req.params.id,
          action: "reject",
          reviewNotes: String(req.body.reviewNotes || "").trim() || null,
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.redirect(
            303,
            `/app/billing/price-overrides?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/billing/price-overrides?rejected=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/patients/:patientNumber/statement",
    requireAuth,
    requirePermission("activeclinic.billing.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }
        const result = await billingOps.getPatientAccountStatement(getPool(), {
          ...billingIds(auth, facility),
          patientNumber: req.params.patientNumber,
        });
        if (result.result === billingOps.RESULT.NOT_FOUND) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Patient not found.", { status: 404 })
          );
        }
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Unable to load statement.", { status: 403 })
          );
        }
        const st = result.statement;
        const formatRows = (rows, amountKey) =>
          rows.map((row) => ({
            ...row,
            amountFormatted: formatMoney(row[amountKey], row.currencyCode || "ZMW"),
          }));
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-statement-content.ejs",
          pageHeader: {
            title: `Account statement · ${st.patient.patientNumber}`,
            description: "Printable patient account statement.",
            actions: [{ label: "Print", href: "javascript:window.print()" }],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Statement" },
          ],
          pageData: {
            statement: {
              ...st,
              charges: formatRows(st.charges, "totalAmountMinor"),
              invoices: st.invoices.map((row) => ({
                ...row,
                totalFormatted: formatMoney(row.totalAmountMinor, row.currencyCode),
                balanceFormatted: formatMoney(row.balanceMinor, row.currencyCode),
              })),
              payments: formatRows(st.payments, "amountMinor"),
              creditNotes: formatRows(st.creditNotes, "amountMinor"),
              summary: {
                ...st.summary,
                chargesTotalFormatted: formatMoney(st.summary.chargesTotalMinor),
                paymentsTotalFormatted: formatMoney(st.summary.paymentsTotalMinor),
                creditsTotalFormatted: formatMoney(st.summary.creditsTotalMinor),
                openBalanceFormatted: formatMoney(st.summary.openBalanceMinor),
              },
            },
            stitch: { desktop: "666806c4ea194d478e3baf2b7876950c" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/reports/revenue",
    requireAuth,
    requirePermission("activeclinic.billing.reports.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/billing/reports/revenue");
        }
        const today = new Date().toISOString().slice(0, 10);
        const dateFrom = String(req.query.from || today).slice(0, 10);
        const dateTo = String(req.query.to || today).slice(0, 10);
        const result = await billingOps.getRevenueReportSummary(getPool(), {
          ...billingIds(auth, facility),
          dateFrom,
          dateTo,
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Reports view permission required.", {
              status: 403,
            })
          );
        }
        const s = result.summary;
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-revenue-report-content.ejs",
          pageHeader: {
            title: "Revenue report",
            description: "Posted invoices and payments summary.",
            actions: [
              {
                label: "Detailed",
                href: `/app/billing/reports/revenue/detailed?from=${dateFrom}&to=${dateTo}`,
              },
            ],
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Revenue report" },
          ],
          pageData: {
            dateFrom,
            dateTo,
            summary: {
              ...s,
              postedInvoicesFormatted: formatMoney(s.postedInvoices.totalMinor),
              paymentsFormatted: formatMoney(s.payments.totalMinor),
              refundsFormatted: formatMoney(s.refunds.totalMinor),
              creditNotesFormatted: formatMoney(s.creditNotes.totalMinor),
              netCollectionsFormatted: formatMoney(s.netCollectionsMinor),
            },
            stitch: { desktop: "08921cb100ab462d8ec08c007f1bd895" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/billing/reports/revenue/detailed",
    requireAuth,
    requirePermission("activeclinic.billing.reports.view"),
    requireDepartment("billing"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(
            303,
            "/app/select-facility?return=/app/billing/reports/revenue/detailed"
          );
        }
        const today = new Date().toISOString().slice(0, 10);
        const dateFrom = String(req.query.from || today).slice(0, 10);
        const dateTo = String(req.query.to || today).slice(0, 10);
        const result = await billingOps.getRevenueReportDetailed(getPool(), {
          ...billingIds(auth, facility),
          dateFrom,
          dateTo,
        });
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Reports view permission required.", {
              status: 403,
            })
          );
        }
        return await renderShell(req, res, {
          activeNav: "billing",
          content: "app/billing-revenue-report-detailed-content.ejs",
          pageHeader: {
            title: "Revenue report (detailed)",
            description: "Invoice and payment line detail for the selected range.",
          },
          breadcrumbs: [
            { label: "Billing", href: "/app/billing" },
            { label: "Revenue", href: "/app/billing/reports/revenue" },
            { label: "Detailed" },
          ],
          pageData: {
            dateFrom,
            dateTo,
            summary: result.summary,
            invoices: (result.invoices || []).map((row) => ({
              ...row,
              totalFormatted: formatMoney(row.totalAmountMinor, row.currencyCode),
            })),
            payments: (result.payments || []).map((row) => ({
              ...row,
              amountFormatted: formatMoney(row.amountMinor, row.currencyCode),
            })),
            stitch: { desktop: "550a52476c254e258d58737fc1184bb6" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );
}

function toIntQuery(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = {
  registerActiveClinicBillingRoutes,
};
