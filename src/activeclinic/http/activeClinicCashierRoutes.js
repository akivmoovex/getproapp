"use strict";

/**
 * ActiveClinic P07 — Cashier routes
 * Cashier dashboard, sessions, payment collection, receipts
 */

const { randomUUID } = require("crypto");
const {
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
  createActiveClinicAppRenderer,
} = require("./renderActiveClinicShell");
const {
  openCashierSession,
  getCurrentCashierSession,
  closeCashierSession,
  listCashierSessions,
  reconcileCashierSession,
  RESULT: CASHIER_RESULT,
  PERM: CASHIER_PERM,
} = require("../services/activeClinicCashierSessionService");
const {
  recordPayment,
  refundPayment,
  requestRefund,
  approveRefund,
  rejectRefund,
  getRefundById,
  reversePayment,
  requestPaymentReversal,
  approvePaymentReversal,
  rejectPaymentReversal,
  getPaymentReversalById,
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

function registerActiveClinicCashierRoutes(app, deps) {
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
  const { renderShell } = createActiveClinicAppRenderer({ getPool, env, isProduction });

  // ========================================================================
  // CASHIER DASHBOARD
  // ========================================================================

  app.get(
    "/app/cashier",
    requireAuth,
    requirePermission("activeclinic.cashier.open_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility?return=/app/cashier");
        }

        const sessionResult = await getCurrentCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
        });

        let currentSession = null;
        if (sessionResult.result === CASHIER_RESULT.OK && sessionResult.session) {
          const sess = sessionResult.session;
          currentSession = {
            ...sess,
            openingCashFormatted: formatMoney(sess.openingCashMinor),
            expectedCashFormatted: formatMoney(sess.expectedCashMinor || 0),
            totalPaymentsFormatted: formatMoney(sess.totalPaymentsMinor || 0),
          };
        }

        const pool = getPool();
        const todayPaymentsResult = await pool.query(
          `SELECT COUNT(*) as count, COALESCE(SUM(amount_minor), 0) as total
           FROM activeclinic.payments
           WHERE tenant_id = $1 AND facility_id = $2 AND payment_date = CURRENT_DATE`,
          [auth.tenantId, facility.id]
        );

        const dashboard = {
          currentSession,
          todayPayments: {
            count: parseInt(todayPaymentsResult.rows[0].count, 10),
            totalMinor: parseInt(todayPaymentsResult.rows[0].total, 10),
            totalFormatted: formatMoney(
              parseInt(todayPaymentsResult.rows[0].total, 10)
            ),
          },
        };

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-dashboard-content.ejs",
          pageHeader: {
            title: "Cashier dashboard",
            description: "Manage cashier operations and payment collection.",
            actions: currentSession
              ? [{ label: "Record payment", href: "/app/cashier/payment" }]
              : [{ label: "Open session", href: "/app/cashier/open" }],
          },
          breadcrumbs: [{ label: "Home", href: "/app" }, { label: "Cashier" }],
          pageData: {
            dashboard,
            capabilities: {
              canCollect: hasFinancePermission(auth.permissions, BILLING_PERM.PAYMENT_COLLECT),
              canClose: hasFinancePermission(auth.permissions, CASHIER_PERM.CLOSE_SESSION),
              canManage: hasFinancePermission(auth.permissions, CASHIER_PERM.MANAGE),
              canReconcile: hasFinancePermission(auth.permissions, CASHIER_PERM.RECONCILE),
            },
            stitch: { desktop: "792d5cbb6f234332a088399e4ccdd545" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // OPEN CASHIER SESSION
  // ========================================================================

  app.get(
    "/app/cashier/open",
    requireAuth,
    requirePermission("activeclinic.cashier.open_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-open-content.ejs",
          pageHeader: {
            title: "Open cashier session",
            description: "Start a new cashier shift.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Open session" },
          ],
          pageData: {
            stitch: { desktop: "c2f068812d0b45809a214d6ba8399ae5" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/open",
    requireAuth,
    requirePermission("activeclinic.cashier.open_session"),
    requireDepartment("cashier"),
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

        const openingCashMinor = parseMoneyInput(req.body.opening_cash || "0");
        if (openingCashMinor === null || openingCashMinor < 0) {
          return res.redirect(303, "/app/cashier/open?error=invalid_amount");
        }

        const result = await openCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          openingCashMinor,
          notes: String(req.body.notes || "").trim() || null,
        });

        if (result.result === CASHIER_RESULT.SESSION_ALREADY_OPEN) {
          return res.redirect(303, "/app/cashier");
        }

        if (result.result !== CASHIER_RESULT.CREATED) {
          return res.redirect(303, `/app/cashier/open?error=${result.result}`);
        }

        return res.redirect(303, "/app/cashier");
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // CURRENT SESSION DETAIL
  // ========================================================================

  app.get(
    "/app/cashier/session",
    requireAuth,
    requirePermission("activeclinic.cashier.open_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const sessionResult = await getCurrentCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
        });

        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier");
        }

        const sess = sessionResult.session;
        const session = {
          ...sess,
          openingCashFormatted: formatMoney(sess.openingCashMinor),
          expectedCashFormatted: formatMoney(sess.expectedCashMinor || 0),
          totalPaymentsFormatted: formatMoney(sess.totalPaymentsMinor || 0),
        };

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-session-content.ejs",
          pageHeader: {
            title: "Current session",
            description: `Session ${sess.sessionNumber}`,
            actions: [
              { label: "Record payment", href: "/app/cashier/payment" },
              { label: "Close session", href: "/app/cashier/close/cash-count" },
            ],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Current session" },
          ],
          pageData: {
            session,
            stitch: {
              desktop: "1c02fc47e49c4c9990646d94a9876986",
              mobile: "0d8cd08aba454a2f971d6cc4389d98d2",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // CLOSE SESSION (multi-step: cash count → review → variance)
  // ========================================================================

  async function loadOpenSession(auth, facility) {
    return getCurrentCashierSession({
      pool: getPool(),
      tenantId: auth.tenantId,
      facilityId: facility.id,
      staffId: auth.staff.id,
    });
  }

  function mapSessionForView(sess) {
    return {
      ...sess,
      openingCashFormatted: formatMoney(sess.openingCashMinor),
      expectedCashFormatted: formatMoney(sess.expectedCashMinor || 0),
      totalPaymentsFormatted: formatMoney(sess.totalPaymentsMinor || 0),
    };
  }

  app.get(
    "/app/cashier/close",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res) => {
      return res.redirect(303, "/app/cashier/close/cash-count");
    }
  );

  app.get(
    "/app/cashier/close/cash-count",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");

        const sessionResult = await loadOpenSession(auth, facility);
        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier");
        }

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-close-cash-count-content.ejs",
          pageHeader: {
            title: "Cash count",
            description: "Count drawer cash before closing.",
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Close session", href: "/app/cashier/close/cash-count" },
            { label: "Cash count" },
          ],
          pageData: {
            session: mapSessionForView(sessionResult.session),
            stitch: { desktop: "02e8083e943d40deb9429b95a294ae30" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/close/cash-count",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const actualCashRaw = String(req.body.actual_cash || "").trim();
        const notes = encodeURIComponent(String(req.body.notes || "").trim());
        return res.redirect(
          303,
          `/app/cashier/close/review?actual_cash=${encodeURIComponent(actualCashRaw)}&notes=${notes}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/close/review",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");

        const sessionResult = await loadOpenSession(auth, facility);
        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier");
        }

        const actualCashMinor = parseMoneyInput(req.query.actual_cash || "0");
        if (actualCashMinor === null || actualCashMinor < 0) {
          return res.redirect(303, "/app/cashier/close/cash-count?error=invalid_amount");
        }
        const sess = sessionResult.session;
        const expected = parseInt(sess.expectedCashMinor || 0, 10);
        const varianceMinor = actualCashMinor - expected;
        const notes = decodeURIComponent(String(req.query.notes || ""));

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-close-review-content.ejs",
          pageHeader: {
            title: "Closing review",
            description: "Confirm session closing and variance.",
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Close session", href: "/app/cashier/close/cash-count" },
            { label: "Review" },
          ],
          pageData: {
            session: mapSessionForView(sess),
            review: {
              actualCashMinor,
              actualCashRaw: String(req.query.actual_cash || ""),
              actualCashFormatted: formatMoney(actualCashMinor),
              varianceMinor,
              varianceFormatted: formatMoney(varianceMinor),
              notes,
            },
            stitch: { desktop: "d3e2ff001f694720b57371ef1a60d517" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/close/review",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }

        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");

        const sessionResult = await loadOpenSession(auth, facility);
        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier");
        }

        const actualCashMinor = parseMoneyInput(req.body.actual_cash || "0");
        if (actualCashMinor === null || actualCashMinor < 0) {
          return res.redirect(303, "/app/cashier/close/cash-count?error=invalid_amount");
        }

        const result = await closeCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          sessionId: sessionResult.session.id,
          actualCashMinor,
          notes: String(req.body.notes || "").trim() || null,
        });

        if (result.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, `/app/cashier/close/cash-count?error=${result.result}`);
        }

        if (result.hasVariance && result.varianceMinor !== 0) {
          return res.redirect(
            303,
            `/app/cashier/close/variance?variance=${result.varianceMinor}&session=${encodeURIComponent(sessionResult.session.sessionNumber || "")}`
          );
        }

        return res.redirect(303, "/app/cashier");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/close/variance",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const varianceMinor = parseInt(req.query.variance || "0", 10) || 0;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-close-variance-content.ejs",
          pageHeader: { title: "Cash variance" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Variance" },
          ],
          pageData: {
            closed: {
              varianceMinor,
              varianceFormatted: formatMoney(varianceMinor),
              sessionNumber: req.query.session || null,
            },
            stitch: { desktop: "7dd49983c4a840b9980fb4a92d486b3c" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // RECORD PAYMENT (Cash)
  // ========================================================================

  app.get(
    "/app/cashier/payment",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const sessionResult = await getCurrentCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
        });

        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier/open");
        }

        const invoiceId = req.query.invoice || null;
        let invoice = null;

        if (invoiceId) {
          const pool = getPool();
          const invoiceResult = await pool.query(
            `SELECT i.*, p.first_name, p.last_name, p.patient_number
             FROM activeclinic.invoices i
             JOIN activeclinic.patients p ON i.patient_id = p.id
             WHERE i.id = $1 AND i.tenant_id = $2
             LIMIT 1`,
            [invoiceId, auth.tenantId]
          );

          if (invoiceResult.rows.length > 0) {
            const inv = invoiceResult.rows[0];
            const remainingResult = await pool.query(
              `SELECT (i.total_amount_minor
                        - COALESCE(alloc.paid_minor, 0)
                        - COALESCE(cn.credit_minor, 0))::bigint AS remaining_minor
                 FROM activeclinic.invoices i
                 LEFT JOIN (
                   SELECT invoice_id, SUM(allocated_amount_minor)::bigint AS paid_minor
                     FROM activeclinic.payment_allocations
                    GROUP BY invoice_id
                 ) alloc ON alloc.invoice_id = i.id
                 LEFT JOIN (
                   SELECT invoice_id, SUM(amount_minor)::bigint AS credit_minor
                     FROM activeclinic.credit_notes
                    WHERE status = 'posted'
                    GROUP BY invoice_id
                 ) cn ON cn.invoice_id = i.id
                WHERE i.id = $1`,
              [inv.id]
            );
            const remainingMinor = parseInt(
              (remainingResult.rows[0] && remainingResult.rows[0].remaining_minor) ||
                inv.total_amount_minor,
              10
            );
            invoice = {
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              patientNumber: inv.patient_number,
              patientName: `${inv.first_name} ${inv.last_name}`,
              totalAmountMinor: parseInt(inv.total_amount_minor, 10),
              remainingMinor,
              totalAmountFormatted: formatMoney(
                remainingMinor,
                inv.currency_code
              ),
            };
          }
        }

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-payment-content.ejs",
          pageHeader: {
            title: "Record payment",
            description: "Collect cash payment from patient.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Record payment" },
          ],
          pageData: {
            session: sessionResult.session,
            invoice,
            idempotencyKey: randomUUID(),
            stitch: {
              desktop: "2d81fb326b6644bbb11cabd7a8156e6e",
              mobile: "3c8ce685b0d14b74a04e1127e341f004",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/payment",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
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

        const sessionResult = await getCurrentCashierSession({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
        });

        if (sessionResult.result !== CASHIER_RESULT.OK) {
          return res.redirect(303, "/app/cashier/open");
        }

        const patientNumber = String(req.body.patient_number || "").trim();
        const amountMinor = parseMoneyInput(req.body.amount || "0");

        if (!patientNumber || amountMinor === null || amountMinor <= 0) {
          return res.redirect(303, "/app/cashier/payment?error=invalid_input");
        }

        const pool = getPool();
        const patientResult = await pool.query(
          `SELECT p.id FROM activeclinic.patients p
           WHERE p.organization_id = $1 AND p.patient_number = $2
           LIMIT 1`,
          [auth.tenantId, patientNumber]
        );

        if (patientResult.rows.length === 0) {
          return res.redirect(303, "/app/cashier/payment?error=patient_not_found");
        }

        const patientId = patientResult.rows[0].id;

        const invoiceAllocations = [];
        const invoiceId = req.body.invoice_id || null;
        if (invoiceId) {
          invoiceAllocations.push({
            invoiceId,
            amountMinor,
          });
        }

        const result = await recordPayment({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          patientId,
          amountMinor,
          paymentMethod: PAYMENT_METHOD.CASH,
          referenceNumber: null,
          notes: String(req.body.notes || "").trim() || null,
          cashierSessionId: sessionResult.session.id,
          invoiceAllocations,
          idempotencyKey: String(req.body.idempotency_key || "").trim() || null,
        });

        if (result.result === BILLING_RESULT.DUPLICATE_SUBMISSION && result.receiptNumber) {
          return res.redirect(
            303,
            `/app/cashier/payment/completed?receipt=${encodeURIComponent(result.receiptNumber)}&amount=${result.payment.amountMinor}`
          );
        }

        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(303, `/app/cashier/payment?error=${result.result}`);
        }

        return res.redirect(
          303,
          `/app/cashier/payment/completed?receipt=${encodeURIComponent(result.receiptNumber)}&amount=${result.payment.amountMinor}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // RECEIPT VIEW
  // ========================================================================

  app.get(
    "/app/cashier/receipt/:receiptNumber",
    requireAuth,
    requirePermission("activeclinic.payment.view"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const pool = getPool();

        const receiptResult = await pool.query(
          `SELECT r.*, py.payment_number, py.amount_minor as payment_amount_minor,
                  py.payment_method, py.payment_date, p.first_name, p.last_name,
                  p.patient_number
           FROM activeclinic.receipts r
           JOIN activeclinic.payments py ON r.payment_id = py.id
           JOIN activeclinic.patients p ON py.patient_id = p.id
           WHERE r.receipt_number = $1 AND r.tenant_id = $2
           LIMIT 1`,
          [req.params.receiptNumber, auth.tenantId]
        );

        if (receiptResult.rows.length === 0) {
          return res.status(404).send("Receipt not found");
        }

        const rec = receiptResult.rows[0];

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-receipt-content.ejs",
          pageHeader: {
            title: `Receipt ${rec.receipt_number}`,
            description: "Payment receipt",
            actions: [],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Receipt" },
          ],
          pageData: {
            receipt: {
              receiptNumber: rec.receipt_number,
              receiptDate: rec.receipt_date,
              amountMinor: parseInt(rec.amount_minor, 10),
              amountFormatted: formatMoney(
                parseInt(rec.amount_minor, 10),
                rec.currency_code
              ),
              issuedToPatientName: rec.issued_to_patient_name,
              paymentNumber: rec.payment_number,
              paymentMethod: rec.payment_method,
              patientNumber: rec.patient_number,
              patientName: `${rec.first_name} ${rec.last_name}`,
            },
            stitch: { desktop: "914eee2a18f64fac81d2f0f69adc0cc8" },
            success: req.query.success === "1",
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // SESSION HISTORY
  // ========================================================================

  app.get(
    "/app/cashier/history",
    requireAuth,
    requirePermission("activeclinic.cashier.manage"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }

        const result = await listCashierSessions({
          pool: getPool(),
          tenantId: auth.tenantId,
          facilityId: facility.id,
          staffId: auth.staff.id,
          limit: 50,
          offset: 0,
        });

        const sessions =
          result.result === CASHIER_RESULT.OK
            ? (result.sessions || []).map((sess) => ({
                ...sess,
                openingCashFormatted: formatMoney(sess.openingCashMinor),
                expectedCashFormatted: formatMoney(sess.expectedCashMinor || 0),
                actualCashFormatted: formatMoney(sess.actualCashMinor || 0),
                varianceFormatted: formatMoney(sess.varianceMinor || 0),
              }))
            : [];

        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-history-content.ejs",
          pageHeader: {
            title: "Session history",
            description: "Past cashier sessions.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "History" },
          ],
          pageData: {
            sessions,
            stitch: { desktop: "1cd25ed2bb7a4504a63095a015bd823b" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // SESSION CLOSED (variance landing)
  // ========================================================================

  app.get(
    "/app/cashier/session/closed",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const varianceMinor = parseInt(req.query.variance || "0", 10) || 0;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-session-closed-content.ejs",
          pageHeader: { title: "Session closed" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Closed" },
          ],
          pageData: {
            closed: {
              varianceMinor,
              varianceFormatted: formatMoney(varianceMinor),
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // ELEVATED: REFUND / REVERSE / RECONCILE
  // ========================================================================

  app.post(
    "/app/cashier/payments/:paymentId/refund",
    requireAuth,
    requirePermission("activeclinic.payment.refund"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const amountMinor = parseMoneyInput(req.body.amount || "0");
        const result = await refundPayment({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          paymentId: req.params.paymentId,
          amountMinor,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Refund denied",
              `Unable to refund (${result.result}).`,
              { status: 403, linkHref: "/app/cashier", linkLabel: "Back to cashier" }
            )
          );
        }
        return res.redirect(303, "/app/cashier?refunded=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/payments/:paymentId/reverse",
    requireAuth,
    requirePermission("activeclinic.payment.reverse"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await reversePayment({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          paymentId: req.params.paymentId,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Reversal denied",
              `Unable to reverse (${result.result}).`,
              { status: 403, linkHref: "/app/cashier", linkLabel: "Back to cashier" }
            )
          );
        }
        return res.redirect(303, "/app/cashier?reversed=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/sessions/:sessionId/reconcile",
    requireAuth,
    requirePermission("activeclinic.cashier.reconcile"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await reconcileCashierSession({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          sessionId: req.params.sessionId,
          approvalNotes: String(req.body.notes || "").trim() || null,
        });
        if (result.result !== CASHIER_RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Reconcile denied",
              `Unable to reconcile (${result.result}).`,
              { status: 403, linkHref: "/app/cashier/history", linkLabel: "Session history" }
            )
          );
        }
        return res.redirect(303, "/app/cashier/history?reconciled=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // PHASE 4: REFUND RECEIPT (PRINT)
  // ========================================================================

  app.get(
    "/app/cashier/refunds/:refundId/receipt",
    requireAuth,
    requirePermission(["activeclinic.payment.refund", "activeclinic.payment.view"]),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) {
          return res.redirect(303, "/app/select-facility");
        }
        const ids = financeIdsFromAuth(auth);
        const result = await billingOps.getRefundReceipt(getPool(), {
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          platformIdentityId: ids.platformIdentityId,
          refundId: req.params.refundId,
        });
        if (result.result === billingOps.RESULT.NOT_FOUND) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Refund receipt not found.", { status: 404 })
          );
        }
        if (result.result !== billingOps.RESULT.OK) {
          return res.status(403).type("html").send(
            renderSimpleState("Access denied", "Unable to load refund receipt.", {
              status: 403,
            })
          );
        }
        const receipt = result.receipt;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-refund-receipt-content.ejs",
          pageHeader: {
            title: "Refund receipt",
            description: "Printable refund record.",
            actions: [{ label: "Print", href: "javascript:window.print()" }],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Refund receipt" },
          ],
          pageData: {
            receipt: {
              ...receipt,
              refundAmountFormatted: formatMoney(
                receipt.refundAmountMinor,
                receipt.currencyCode
              ),
              originalAmountFormatted: formatMoney(
                receipt.originalPayment.amountMinor,
                receipt.currencyCode
              ),
            },
            stitch: { desktop: "244dc0c45a23434bb2747468a699167b" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // PAYMENT COMPLETED
  // ========================================================================

  app.get(
    "/app/cashier/payment/completed",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const receiptNumber = String(req.query.receipt || "").trim();
        const amountMinor = parseInt(req.query.amount || "0", 10) || 0;
        let patientName = null;
        if (receiptNumber) {
          const auth = req.activeClinicAuth;
          const rec = await getPool().query(
            `SELECT r.issued_to_patient_name FROM activeclinic.receipts r
              WHERE r.receipt_number = $1 AND r.tenant_id = $2 LIMIT 1`,
            [receiptNumber, auth.tenantId]
          );
          if (rec.rows.length) patientName = rec.rows[0].issued_to_patient_name;
        }
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-payment-completed-content.ejs",
          pageHeader: { title: "Payment completed" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Payment completed" },
          ],
          pageData: {
            payment: {
              receiptNumber,
              amountFormatted: formatMoney(amountMinor),
              patientName,
            },
            stitch: {
              desktop: "bda1fbd1f6f441dba26719f451ee53de",
              mobile: "bda1fbd1f6f441dba26719f451ee53de",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ========================================================================
  // PHASE 5D: REFUND / REVERSAL WORKFLOWS
  // ========================================================================

  async function loadPaymentContext(auth, facility, paymentId) {
    const result = await getPool().query(
      `SELECT py.*, p.patient_number, p.first_name, p.last_name
         FROM activeclinic.payments py
         JOIN activeclinic.patients p ON py.patient_id = p.id
        WHERE py.id = $1 AND py.tenant_id = $2 AND py.facility_id = $3
        LIMIT 1`,
      [paymentId, auth.tenantId, facility.id]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
      id: row.id,
      paymentNumber: row.payment_number,
      amountMinor: parseInt(row.amount_minor, 10),
      amountFormatted: formatMoney(parseInt(row.amount_minor, 10), row.currency_code),
      patientNumber: row.patient_number,
      patientName: `${row.first_name} ${row.last_name}`.trim(),
    };
  }

  app.get(
    "/app/cashier/refunds/request",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const paymentId = String(req.query.paymentId || req.query.payment_id || "").trim();
        if (!paymentId) {
          return res.redirect(303, "/app/cashier/session?error=payment_required");
        }
        const payment = await loadPaymentContext(auth, facility, paymentId);
        if (!payment) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Payment not found.", { status: 404 })
          );
        }
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-refund-request-content.ejs",
          pageHeader: { title: "Refund request" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Refund request" },
          ],
          pageData: {
            payment,
            error: req.query.error || null,
            stitch: {
              desktop: "685fb829c50a45af995772909fb49fb7",
              mobile: "8461f1792a7a41209ae2abfe44db7b6a",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/refunds/request",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const paymentId = String(req.body.payment_id || "").trim();
        const amountMinor = parseMoneyInput(String(req.body.amount || ""));
        const result = await requestRefund({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          paymentId,
          amountMinor,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/cashier/refunds/request?paymentId=${paymentId}&error=${result.result}`
          );
        }
        return res.redirect(303, `/app/cashier/refunds/${result.refund.id}/review`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/refunds/:refundId/review",
    requireAuth,
    requirePermission("activeclinic.payment.view"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await getRefundById({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          refundId: req.params.refundId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Refund request not found.", { status: 404 })
          );
        }
        const refund = result.refund;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-refund-review-content.ejs",
          pageHeader: { title: "Refund review" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Refund review" },
          ],
          pageData: {
            refund: {
              ...refund,
              refundAmountFormatted: formatMoney(refund.refundAmountMinor, refund.currencyCode),
            },
            canApprove: hasFinancePermission(auth.permissions, BILLING_PERM.PAYMENT_REFUND),
            error: req.query.error || null,
            stitch: {
              desktop: "438b1bb01f534492850ee8cb1253fcfe",
              approval: "d8f3108dfcda4ab9bf58472786d0484c",
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/refunds/:refundId/approve",
    requireAuth,
    requirePermission("activeclinic.payment.refund"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await approveRefund({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          refundId: req.params.refundId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/cashier/refunds/${req.params.refundId}/review?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/cashier/refunds/${req.params.refundId}/completed`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/refunds/:refundId/reject",
    requireAuth,
    requirePermission("activeclinic.payment.refund"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await rejectRefund({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          refundId: req.params.refundId,
          rejectionReason: String(req.body.rejection_reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/cashier/refunds/${req.params.refundId}/review?error=${result.result}`
          );
        }
        return res.redirect(303, `/app/cashier/refunds/${req.params.refundId}/rejected`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/refunds/:refundId/completed",
    requireAuth,
    requirePermission("activeclinic.payment.view"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await getRefundById({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          refundId: req.params.refundId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Refund not found.", { status: 404 })
          );
        }
        const refund = result.refund;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-refund-completed-content.ejs",
          pageHeader: { title: "Refund completed" },
          breadcrumbs: [{ label: "Cashier", href: "/app/cashier" }, { label: "Completed" }],
          pageData: {
            refund: {
              ...refund,
              refundAmountFormatted: formatMoney(refund.refundAmountMinor, refund.currencyCode),
            },
            stitch: { desktop: "e52271b7be804e0ea95c825be9f977bd" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/refunds/:refundId/rejected",
    requireAuth,
    requirePermission("activeclinic.payment.view"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await getRefundById({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          refundId: req.params.refundId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Refund not found.", { status: 404 })
          );
        }
        const refund = result.refund;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-refund-rejected-content.ejs",
          pageHeader: { title: "Refund rejected" },
          breadcrumbs: [{ label: "Cashier", href: "/app/cashier" }, { label: "Rejected" }],
          pageData: {
            refund: {
              ...refund,
              refundAmountFormatted: formatMoney(refund.refundAmountMinor, refund.currencyCode),
            },
            stitch: { desktop: "b76f80fb0d164501b8108bea91813385" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/reversals/request",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const paymentId = String(req.query.paymentId || "").trim();
        if (!paymentId) return res.redirect(303, "/app/cashier/session?error=payment_required");
        const payment = await loadPaymentContext(auth, facility, paymentId);
        if (!payment) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Payment not found.", { status: 404 })
          );
        }
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-reversal-request-content.ejs",
          pageHeader: { title: "Payment reversal request" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Reversal request" },
          ],
          pageData: {
            payment,
            error: req.query.error || null,
            stitch: { desktop: "2665942082b4428dbcabf3ff3a40ec60" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/reversals/request",
    requireAuth,
    requirePermission("activeclinic.payment.collect"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const paymentId = String(req.body.payment_id || "").trim();
        const result = await requestPaymentReversal({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          paymentId,
          reason: String(req.body.reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(
            303,
            `/app/cashier/reversals/request?paymentId=${paymentId}&error=${result.result}`
          );
        }
        return res.redirect(303, `/app/cashier/reversals/${result.reversal.id}/review`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/cashier/reversals/:reversalId/review",
    requireAuth,
    requirePermission("activeclinic.payment.view"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await getPaymentReversalById({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          reversalId: req.params.reversalId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "Reversal request not found.", { status: 404 })
          );
        }
        const reversal = result.reversal;
        return await renderShell(req, res, {
          activeNav: "cashier",
          content: "app/cashier-reversal-review-content.ejs",
          pageHeader: { title: "Reversal review" },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Reversal review" },
          ],
          pageData: {
            reversal: {
              ...reversal,
              originalAmountFormatted: formatMoney(
                reversal.originalAmountMinor,
                reversal.currencyCode || "ZMW"
              ),
            },
            canApprove: hasFinancePermission(auth.permissions, BILLING_PERM.PAYMENT_REVERSE),
            error: req.query.error || null,
            stitch: { desktop: "027b12b482934ef1a6f5dee02c888d26" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/reversals/:reversalId/approve",
    requireAuth,
    requirePermission("activeclinic.payment.reverse"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await approvePaymentReversal({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          reversalId: req.params.reversalId,
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/cashier/reversals/${req.params.reversalId}/review?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/cashier?reversed=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/reversals/:reversalId/reject",
    requireAuth,
    requirePermission("activeclinic.payment.reverse"),
    requireDepartment("cashier"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).send("Forbidden");
        }
        const auth = req.activeClinicAuth;
        const facility = auth.selectedFacility;
        if (!facility) return res.redirect(303, "/app/select-facility");
        const ids = financeIdsFromAuth(auth);
        const result = await rejectPaymentReversal({
          pool: getPool(),
          tenantId: ids.tenantId,
          facilityId: facility.id,
          staffId: ids.staffId,
          reversalId: req.params.reversalId,
          rejectionReason: String(req.body.rejection_reason || "").trim(),
        });
        if (result.result !== BILLING_RESULT.OK) {
          return res.redirect(
            303,
            `/app/cashier/reversals/${req.params.reversalId}/review?error=${result.result}`
          );
        }
        return res.redirect(303, "/app/cashier/session");
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicCashierRoutes,
};
