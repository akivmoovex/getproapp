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
}

module.exports = {
  registerActiveClinicBillingRoutes,
};
