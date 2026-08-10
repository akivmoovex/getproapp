"use strict";

/**
 * ActiveClinic P07 — Cashier routes
 * Cashier dashboard, sessions, payment collection, receipts
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
  reversePayment,
  RESULT: BILLING_RESULT,
  PAYMENT_METHOD,
  PERM: BILLING_PERM,
} = require("../services/activeClinicBillingService");
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
  // CASHIER DASHBOARD
  // ========================================================================

  app.get(
    "/app/cashier",
    requireAuth,
    requirePermission("activeclinic.cashier.open_session"),
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
              { label: "Close session", href: "/app/cashier/close" },
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
  // CLOSE SESSION
  // ========================================================================

  app.get(
    "/app/cashier/close",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
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
          content: "app/cashier-close-content.ejs",
          pageHeader: {
            title: "Close session",
            description: "Perform cash count and close this cashier shift.",
            actions: [],
          },
          breadcrumbs: [
            { label: "Cashier", href: "/app/cashier" },
            { label: "Close session" },
          ],
          pageData: {
            session,
            stitch: { desktop: "d3e2ff001f694720b57371ef1a60d517" },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/cashier/close",
    requireAuth,
    requirePermission("activeclinic.cashier.close_session"),
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
          return res.redirect(303, "/app/cashier");
        }

        const actualCashMinor = parseMoneyInput(req.body.actual_cash || "0");
        if (actualCashMinor === null || actualCashMinor < 0) {
          return res.redirect(303, "/app/cashier/close?error=invalid_amount");
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
          return res.redirect(303, `/app/cashier/close?error=${result.result}`);
        }

        if (result.hasVariance && result.varianceMinor !== 0) {
          return res.redirect(
            303,
            `/app/cashier/session/closed?variance=${result.varianceMinor}`
          );
        }

        return res.redirect(303, "/app/cashier");
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
            `SELECT i.*, p.first_name, p.last_name, pr.patient_number
             FROM activeclinic.invoices i
             JOIN activeclinic.patients p ON i.patient_id = p.id
             JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
             WHERE i.id = $1 AND i.tenant_id = $2
             LIMIT 1`,
            [invoiceId, auth.tenantId]
          );

          if (invoiceResult.rows.length > 0) {
            const inv = invoiceResult.rows[0];
            invoice = {
              id: inv.id,
              invoiceNumber: inv.invoice_number,
              patientNumber: inv.patient_number,
              patientName: `${inv.first_name} ${inv.last_name}`,
              totalAmountMinor: parseInt(inv.total_amount_minor, 10),
              totalAmountFormatted: formatMoney(
                parseInt(inv.total_amount_minor, 10),
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
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
           WHERE p.tenant_id = $1 AND pr.patient_number = $2
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
        });

        if (result.result !== BILLING_RESULT.CREATED) {
          return res.redirect(303, `/app/cashier/payment?error=${result.result}`);
        }

        return res.redirect(
          303,
          `/app/cashier/receipt/${result.receiptNumber}?success=1`
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
    async (req, res, next) => {
      try {
        const auth = req.activeClinicAuth;
        const pool = getPool();

        const receiptResult = await pool.query(
          `SELECT r.*, py.payment_number, py.amount_minor as payment_amount_minor,
                  py.payment_method, py.payment_date, p.first_name, p.last_name,
                  pr.patient_number
           FROM activeclinic.receipts r
           JOIN activeclinic.payments py ON r.payment_id = py.id
           JOIN activeclinic.patients p ON py.patient_id = p.id
           JOIN activeclinic.patient_registrations pr ON p.id = pr.patient_id
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
}

module.exports = {
  registerActiveClinicCashierRoutes,
};
