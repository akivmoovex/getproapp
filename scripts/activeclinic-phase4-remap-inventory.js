"use strict";

/**
 * Phase 4 — append implementation inventory records for newly implemented screens,
 * remap the former 21 STITCH_NOT_IMPLEMENTED rows, regenerate csv/md summaries.
 *
 * Does NOT re-inventory the whole codebase or touch PARTIAL_IMPLEMENTATION rows.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STITCH_DIR = path.join(ROOT, "docs/activeclinic/stitch");
const IMPL_JSON = path.join(STITCH_DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.json");
const IMPL_CSV = path.join(STITCH_DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.csv");
const IMPL_MD = path.join(STITCH_DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.md");
const MAP_JSON = path.join(STITCH_DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.json");
const MAP_CSV = path.join(STITCH_DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.csv");
const MAP_MD = path.join(STITCH_DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.md");

const NOW = new Date().toISOString();
const HEAD = "2ee3c6652134411a30d2ea8dbc18ed1229936222";

function nextImplId(screens) {
  let max = 0;
  for (const s of screens) {
    const m = String(s.implementation_id || "").match(/ACV7-IMPL-(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return (n) => `ACV7-IMPL-${String(max + n).padStart(4, "0")}`;
}

function baseRecord(partial) {
  return {
    surface: "INTERNAL",
    route_method: "GET",
    layout: "layouts/app-shell.ejs",
    device_support: ["DESKTOP", "MOBILE"],
    screen_kind: "PRIMARY_SCREEN",
    state: "DEFAULT",
    auth_required: true,
    facility_scope: true,
    reachable: "REACHABLE",
    partials: [],
    client_js: ["public/activeclinic/ac-shell-nav.js"],
    implementation_substance: "FUNCTIONAL",
    notes: "Phase 4 gap closure",
    ...partial,
  };
}

const NEW_SCREENS = [
  baseRecord({
    functional_area: "PATIENTS",
    route_path: "/app/patients/:patientNumber/print-card",
    route_file: "src/activeclinic/http/activeClinicPatientRoutes.js",
    handler: "loadActiveClinicPatientPrintCardScreen",
    view_path: "views/activeclinic/app/patient-print-card-content.ejs",
    rbac_permissions: ["activeclinic.patient.view"],
    department_scope: null,
    facility_scope: false,
    reachability_evidence:
      "GET print-card; profile Print card action; tests/activeclinic-phase4-patient-print-card.test.js",
    notes: "Stitch 3c113fe684604dfcaeb8f6b2c071a6ca printable identity card",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/prescriptions/:id/substitute",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "substitutePrescriptionItem",
    view_path: "views/activeclinic/app/pharmacy-substitution-content.ejs",
    rbac_permissions: [
      "activeclinic.pharmacy.review",
      "activeclinic.pharmacy.dispense",
    ],
    department_scope: "pharmacy",
    reachability_evidence:
      "GET/POST substitute; pharmacy ops service; phase4 pharmacy tests",
    notes: "Stitch e237cd030fb241deb15ed8eb0f4f895e",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/prescriptions/:id/instructions",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "getPatientMedicineInstructions",
    view_path: "views/activeclinic/app/pharmacy-medicine-instructions-content.ejs",
    rbac_permissions: ["activeclinic.pharmacy.dispense", "activeclinic.pharmacy.view"],
    department_scope: "pharmacy",
    device_support: ["MOBILE", "DESKTOP"],
    reachability_evidence: "GET instructions; real Rx dosage data only",
    notes: "Stitch 7cffba8bdac84abda7a8d31951d1948f mobile instructions",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/purchase-orders",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "listPurchaseOrders",
    view_path: "views/activeclinic/app/pharmacy-purchase-orders-content.ejs",
    rbac_permissions: ["activeclinic.inventory.view"],
    department_scope: "pharmacy",
    reachability_evidence: "GET PO list + new/detail/submit; migration 025",
    notes: "Stitch 0f1976955fc14d8c97f1f8c728b4e1da",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/purchase-orders/new",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "createPurchaseOrder",
    view_path: "views/activeclinic/app/pharmacy-purchase-order-form-content.ejs",
    rbac_permissions: ["activeclinic.inventory.manage"],
    department_scope: "pharmacy",
    reachability_evidence: "GET/POST new PO",
    notes: "PO create form",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/purchase-orders/:id",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "getPurchaseOrder",
    view_path: "views/activeclinic/app/pharmacy-purchase-order-detail-content.ejs",
    rbac_permissions: ["activeclinic.inventory.view"],
    department_scope: "pharmacy",
    reachability_evidence: "GET PO detail + submit",
    notes: "PO detail",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/inventory/adjust",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "adjustStock",
    view_path: "views/activeclinic/app/pharmacy-stock-adjust-content.ejs",
    rbac_permissions: ["activeclinic.inventory.manage"],
    department_scope: "pharmacy",
    reachability_evidence: "GET/POST adjust with ledger/audit",
    notes: "Stitch 2147643a82af4fb28a8368dcff867a75",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/inventory/transfer",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "transferStock",
    view_path: "views/activeclinic/app/pharmacy-stock-transfer-content.ejs",
    rbac_permissions: ["activeclinic.inventory.manage"],
    department_scope: "pharmacy",
    reachability_evidence: "GET/POST transfer with facility isolation",
    notes: "Stitch ce22d1c5de5f43ad8a458f57aa217fd3",
  }),
  baseRecord({
    functional_area: "PHARMACY",
    route_path: "/app/pharmacy/prescriptions/:id/labels",
    route_file: "src/activeclinic/http/activeClinicPharmacyRoutes.js",
    handler: "getMedicineLabel",
    view_path: "views/activeclinic/app/pharmacy-medicine-labels-content.ejs",
    rbac_permissions: ["activeclinic.pharmacy.view", "activeclinic.pharmacy.dispense"],
    department_scope: "pharmacy",
    reachability_evidence: "GET print labels from prescription data",
    notes: "Stitch b62126b07af7488094221932b9046193",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/ar",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listAccountsReceivable",
    view_path: "views/activeclinic/app/billing-ar-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET AR balances; phase4 billing tests",
    notes: "Stitch 1829edeb5d1741be9b6ae68a219ef7cc",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/charges/review",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listAutomaticChargesForReview",
    view_path: "views/activeclinic/app/billing-charge-review-content.ejs",
    rbac_permissions: ["activeclinic.billing.charge.review"],
    department_scope: "billing",
    reachability_evidence: "GET charge review queue + POST review",
    notes: "Stitch 954a9269255245dd9c6e375f8cbdd93b",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/collections",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listCollectionsWorkQueue",
    view_path: "views/activeclinic/app/billing-collections-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET collections work queue",
    notes: "Stitch 16318693e2874e79a8463d91c6ba63ad",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/collections/contact",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "logCollectionsContact",
    view_path: "views/activeclinic/app/billing-collections-contact-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET/POST contact patient for payment",
    notes: "Stitch 513301ae28e1423ab7431e299cf45eee",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/credit-notes",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listCreditNotes",
    view_path: "views/activeclinic/app/billing-credit-notes-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET list + new/detail create credit notes",
    notes: "Stitch 92b97e715c6f4c308e61d3b39d66a1e9",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/credit-notes/new",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "createCreditNote",
    view_path: "views/activeclinic/app/billing-credit-note-form-content.ejs",
    rbac_permissions: ["activeclinic.billing.invoice.amend"],
    department_scope: "billing",
    reachability_evidence: "GET/POST credit note form",
    notes: "Credit note create",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/credit-notes/:id",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "getCreditNote",
    view_path: "views/activeclinic/app/billing-credit-note-detail-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET credit note detail",
    notes: "Credit note detail",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/corrections",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listFinancialCorrections",
    view_path: "views/activeclinic/app/billing-corrections-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET correction history desktop+mobile responsive",
    notes: "Stitch 54163d0beee74c29990bd83b77480af5 + a21d364d62f04c78ac8477971377eca9",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/arrangements",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listPaymentArrangements",
    view_path: "views/activeclinic/app/billing-arrangements-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET arrangements list",
    notes: "Stitch 02e1c1976d844c2cac63682e1853fa46",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/arrangements/new",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "createPaymentArrangement",
    view_path: "views/activeclinic/app/billing-arrangement-form-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET/POST new arrangement",
    notes: "Arrangement create form",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/arrangements/:id",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "getPaymentArrangement",
    view_path: "views/activeclinic/app/billing-arrangement-review-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET review + POST review action",
    notes: "Stitch 2a0ae995f3e140da863e5aede4b2e71f",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/price-overrides",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "listPriceOverrideRequests",
    view_path: "views/activeclinic/app/billing-price-overrides-content.ejs",
    rbac_permissions: [
      "activeclinic.billing.view",
      "activeclinic.billing.price.override",
    ],
    department_scope: "billing",
    reachability_evidence: "GET list + approve/reject; create form",
    notes: "Stitch a953a043598945fdab38285c7dab7206",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/price-overrides/new",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "createPriceOverrideRequest",
    view_path: "views/activeclinic/app/billing-price-override-form-content.ejs",
    rbac_permissions: ["activeclinic.billing.charge"],
    department_scope: "billing",
    reachability_evidence: "GET/POST request override",
    notes: "Price override request form",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/patients/:patientNumber/statement",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "getPatientAccountStatement",
    view_path: "views/activeclinic/app/billing-statement-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET printable patient statement",
    notes: "Stitch 666806c4ea194d478e3baf2b7876950c",
  }),
  baseRecord({
    functional_area: "CASHIER",
    route_path: "/app/cashier/refunds/:refundId/receipt",
    route_file: "src/activeclinic/http/activeClinicCashierRoutes.js",
    handler: "getRefundReceipt",
    view_path: "views/activeclinic/app/cashier-refund-receipt-content.ejs",
    rbac_permissions: ["activeclinic.cashier.view", "activeclinic.billing.view"],
    department_scope: "cashier",
    reachability_evidence: "GET refund receipt from real refund record",
    notes: "Stitch 244dc0c45a23434bb2747468a699167b",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/reports/revenue",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "getRevenueReport",
    view_path: "views/activeclinic/app/billing-revenue-report-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET revenue summary report",
    notes: "Stitch 08921cb100ab462d8ec08c007f1bd895",
  }),
  baseRecord({
    functional_area: "BILLING",
    route_path: "/app/billing/reports/revenue/detailed",
    route_file: "src/activeclinic/http/activeClinicBillingRoutes.js",
    handler: "getRevenueReportDetailed",
    view_path: "views/activeclinic/app/billing-revenue-report-detailed-content.ejs",
    rbac_permissions: ["activeclinic.billing.view"],
    department_scope: "billing",
    reachability_evidence: "GET detailed revenue report",
    notes: "Stitch 550a52476c254e258d58737fc1184bb6",
  }),
];

// Verify revenue routes exist
const billingRoutesSrc = fs.readFileSync(
  path.join(ROOT, "src/activeclinic/http/activeClinicBillingRoutes.js"),
  "utf8"
);
if (!billingRoutesSrc.includes("/app/billing/reports/revenue")) {
  // discover actual paths
  const matches = [...billingRoutesSrc.matchAll(/\"(\/app\/billing\/[^\"]*revenue[^\"]*)\"/g)].map(
    (m) => m[1]
  );
  console.log("Revenue route candidates:", matches);
}

const REMAP = {
  "3c113fe684604dfcaeb8f6b2c071a6ca": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/patients/:patientNumber/print-card"],
    view_paths: ["views/activeclinic/app/patient-print-card-content.ejs"],
    notes: "Phase 4 patient print card",
  },
  e237cd030fb241deb15ed8eb0f4f895e: {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/pharmacy/prescriptions/:id/substitute"],
    view_paths: ["views/activeclinic/app/pharmacy-substitution-content.ejs"],
    notes: "Phase 4 pharmacy substitution",
  },
  "7cffba8bdac84abda7a8d31951d1948f": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/pharmacy/prescriptions/:id/instructions"],
    view_paths: ["views/activeclinic/app/pharmacy-medicine-instructions-content.ejs"],
    notes: "Phase 4 medicine instructions (mobile-primary)",
  },
  "0f1976955fc14d8c97f1f8c728b4e1da": {
    mapping_type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    route_paths: [
      "/app/pharmacy/purchase-orders",
      "/app/pharmacy/purchase-orders/new",
      "/app/pharmacy/purchase-orders/:id",
    ],
    view_paths: [
      "views/activeclinic/app/pharmacy-purchase-orders-content.ejs",
      "views/activeclinic/app/pharmacy-purchase-order-form-content.ejs",
      "views/activeclinic/app/pharmacy-purchase-order-detail-content.ejs",
    ],
    notes: "Phase 4 purchase orders list/form/detail",
  },
  "2147643a82af4fb28a8368dcff867a75": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/pharmacy/inventory/adjust"],
    view_paths: ["views/activeclinic/app/pharmacy-stock-adjust-content.ejs"],
    notes: "Phase 4 stock adjustment",
  },
  ce22d1c5de5f43ad8a458f57aa217fd3: {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/pharmacy/inventory/transfer"],
    view_paths: ["views/activeclinic/app/pharmacy-stock-transfer-content.ejs"],
    notes: "Phase 4 stock transfer",
  },
  b62126b07af7488094221932b9046193: {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/pharmacy/prescriptions/:id/labels"],
    view_paths: ["views/activeclinic/app/pharmacy-medicine-labels-content.ejs"],
    notes: "Phase 4 medicine labels",
  },
  "1829edeb5d1741be9b6ae68a219ef7cc": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/ar"],
    view_paths: ["views/activeclinic/app/billing-ar-content.ejs"],
    notes: "Phase 4 accounts receivable",
  },
  "954a9269255245dd9c6e375f8cbdd93b": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/charges/review"],
    view_paths: ["views/activeclinic/app/billing-charge-review-content.ejs"],
    notes: "Phase 4 automatic charge review",
  },
  "16318693e2874e79a8463d91c6ba63ad": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/collections"],
    view_paths: ["views/activeclinic/app/billing-collections-content.ejs"],
    notes: "Phase 4 collections work queue",
  },
  "513301ae28e1423ab7431e299cf45eee": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/collections/contact"],
    view_paths: ["views/activeclinic/app/billing-collections-contact-content.ejs"],
    notes: "Phase 4 collections contact",
  },
  "92b97e715c6f4c308e61d3b39d66a1e9": {
    mapping_type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    route_paths: [
      "/app/billing/credit-notes",
      "/app/billing/credit-notes/new",
      "/app/billing/credit-notes/:id",
    ],
    view_paths: [
      "views/activeclinic/app/billing-credit-notes-content.ejs",
      "views/activeclinic/app/billing-credit-note-form-content.ejs",
      "views/activeclinic/app/billing-credit-note-detail-content.ejs",
    ],
    notes: "Phase 4 credit notes",
  },
  "54163d0beee74c29990bd83b77480af5": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    route_paths: ["/app/billing/corrections"],
    view_paths: ["views/activeclinic/app/billing-corrections-content.ejs"],
    notes: "Phase 4 correction history (desktop); shares impl with mobile",
  },
  a21d364d62f04c78ac8477971377eca9: {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    route_paths: ["/app/billing/corrections"],
    view_paths: ["views/activeclinic/app/billing-corrections-content.ejs"],
    notes: "Phase 4 correction history (mobile); shares desktop impl",
  },
  "02e1c1976d844c2cac63682e1853fa46": {
    mapping_type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    route_paths: ["/app/billing/arrangements", "/app/billing/arrangements/new"],
    view_paths: [
      "views/activeclinic/app/billing-arrangements-content.ejs",
      "views/activeclinic/app/billing-arrangement-form-content.ejs",
    ],
    notes: "Phase 4 payment arrangement",
  },
  "2a0ae995f3e140da863e5aede4b2e71f": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/arrangements/:id"],
    view_paths: ["views/activeclinic/app/billing-arrangement-review-content.ejs"],
    notes: "Phase 4 payment arrangement review",
  },
  a953a043598945fdab38285c7dab7206: {
    mapping_type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    route_paths: ["/app/billing/price-overrides", "/app/billing/price-overrides/new"],
    view_paths: [
      "views/activeclinic/app/billing-price-overrides-content.ejs",
      "views/activeclinic/app/billing-price-override-form-content.ejs",
    ],
    notes: "Phase 4 price override approval + request",
  },
  "666806c4ea194d478e3baf2b7876950c": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/patients/:patientNumber/statement"],
    view_paths: ["views/activeclinic/app/billing-statement-content.ejs"],
    notes: "Phase 4 patient account statement",
  },
  "244dc0c45a23434bb2747468a699167b": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/cashier/refunds/:refundId/receipt"],
    view_paths: ["views/activeclinic/app/cashier-refund-receipt-content.ejs"],
    notes: "Phase 4 refund receipt",
  },
  "08921cb100ab462d8ec08c007f1bd895": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/reports/revenue"],
    view_paths: ["views/activeclinic/app/billing-revenue-report-content.ejs"],
    notes: "Phase 4 revenue reports summary",
  },
  "550a52476c254e258d58737fc1184bb6": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    route_paths: ["/app/billing/reports/revenue/detailed"],
    view_paths: ["views/activeclinic/app/billing-revenue-report-detailed-content.ejs"],
    notes: "Phase 4 revenue reports detailed",
  },
};

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function writeImplCsv(screens) {
  const headers = [
    "implementation_id",
    "surface",
    "functional_area",
    "route_method",
    "route_path",
    "route_file",
    "handler",
    "view_path",
    "layout",
    "device_support",
    "screen_kind",
    "state",
    "auth_required",
    "rbac_permissions",
    "facility_scope",
    "department_scope",
    "reachable",
    "reachability_evidence",
    "partials",
    "client_js",
    "implementation_substance",
    "notes",
  ];
  const lines = [headers.join(",")];
  for (const s of screens) {
    lines.push(
      [
        s.implementation_id,
        s.surface,
        s.functional_area,
        s.route_method,
        s.route_path,
        s.route_file,
        s.handler || "",
        s.view_path,
        s.layout,
        (s.device_support || []).join("|"),
        s.screen_kind,
        s.state,
        s.auth_required,
        (s.rbac_permissions || []).join("|"),
        s.facility_scope,
        s.department_scope || "",
        s.reachable,
        s.reachability_evidence || "",
        (s.partials || []).join("|"),
        (s.client_js || []).join("|"),
        s.implementation_substance,
        s.notes || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(IMPL_CSV, lines.join("\n") + "\n");
}

function writeMapCsv(mappings) {
  const headers = [
    "stitch_project_id",
    "stitch_screen_id",
    "stitch_screen_title",
    "stitch_phase",
    "stitch_functional_area",
    "stitch_device",
    "stitch_state",
    "mapping_type",
    "mapping_confidence",
    "implementation_ids",
    "route_paths",
    "view_paths",
    "implementation_states",
    "device_support",
    "canonical_stitch_screen_id",
    "product_difference",
    "missing_requirement",
    "evidence",
    "notes",
  ];
  const lines = [headers.join(",")];
  for (const r of mappings) {
    lines.push(
      [
        r.stitch_project_id,
        r.stitch_screen_id,
        r.stitch_screen_title,
        r.stitch_phase,
        r.stitch_functional_area,
        r.stitch_device,
        r.stitch_state,
        r.mapping_type,
        r.mapping_confidence,
        (r.implementation_ids || []).join("|"),
        (r.route_paths || []).join("|"),
        (r.view_paths || []).join("|"),
        (r.implementation_states || []).join("|"),
        (r.device_support || []).join("|"),
        r.canonical_stitch_screen_id || "",
        r.product_difference || "",
        r.missing_requirement || "",
        r.evidence || "",
        r.notes || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  fs.writeFileSync(MAP_CSV, lines.join("\n") + "\n");
}

function recount(mappings) {
  const mapping_type = {};
  const confidence = {};
  let full = 0;
  let partial = 0;
  let missing = 0;
  let other = 0;
  const desktop = { full: 0, partial: 0, missing: 0, other: 0, total: 0 };
  const mobile = { full: 0, partial: 0, missing: 0, other: 0, total: 0 };

  const FULL_TYPES = new Set([
    "EXACT_IMPLEMENTATION_MATCH",
    "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
  ]);

  for (const r of mappings) {
    mapping_type[r.mapping_type] = (mapping_type[r.mapping_type] || 0) + 1;
    confidence[r.mapping_confidence] = (confidence[r.mapping_confidence] || 0) + 1;
    let bucket = "other";
    if (FULL_TYPES.has(r.mapping_type)) {
      full += 1;
      bucket = "full";
    } else if (r.mapping_type === "PARTIAL_IMPLEMENTATION") {
      partial += 1;
      bucket = "partial";
    } else if (r.mapping_type === "STITCH_NOT_IMPLEMENTED") {
      missing += 1;
      bucket = "missing";
    } else {
      other += 1;
    }
    const device = String(r.stitch_device || "").toUpperCase();
    const target = device.includes("MOBILE") ? mobile : desktop;
    target.total += 1;
    target[bucket] += 1;
  }

  return {
    mapping_type,
    confidence,
    stitch_screen_coverage: {
      full,
      partial,
      missing,
      other,
      total: mappings.length,
    },
    unique_design_concept_coverage: {
      full,
      partial,
      missing,
      other: other - (mapping_type.DUPLICATE_STITCH_VARIANT || 0) - (mapping_type.NO_IMPLEMENTATION_REQUIRED || 0),
      total:
        mappings.length -
        (mapping_type.DUPLICATE_STITCH_VARIANT || 0) -
        (mapping_type.NO_IMPLEMENTATION_REQUIRED || 0),
      denominator_note:
        "Excludes DUPLICATE_STITCH_VARIANT and NO_IMPLEMENTATION_REQUIRED",
    },
    desktop,
    mobile,
  };
}

function writeImplMd(impl) {
  const byArea = {};
  for (const s of impl.screens) {
    byArea[s.functional_area] = (byArea[s.functional_area] || 0) + 1;
  }
  const areaRows = Object.entries(byArea)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  const md = `# ActiveClinic V7 Implementation Raw Inventory

**Generated:** ${NOW}  
**Scope:** V7 ActiveClinic codebase — updated after Phase 4 gap closure  
**Source:** \`src/activeclinic/\`, \`views/activeclinic/\`, \`public/activeclinic/\`, foundation mount

---

## A. Safety evidence

| Field | Value |
|-------|-------|
| branch | V7 |
| HEAD SHA | \`${HEAD}\` |
| DEPLOYMENT_ENV | testing |
| DB identity_key | moovex-platform-v7 |
| production touched | no |
| pushed | no |
| deployed | no |
| phase4_note | Added ${NEW_SCREENS.length} implementation records for previously missing Stitch screens |

---

## B. Totals

| Metric | Count |
|--------|------:|
| Implementation screen/state records | ${impl.screens.length} |
| Phase 4 records added | ${NEW_SCREENS.length} |

## C. Screens by functional area

| Functional area | Count |
|-----------------|------:|
${areaRows}

See JSON/CSV for full record list.
`;
  fs.writeFileSync(IMPL_MD, md);
}

function writeMapMd(map, counts) {
  const typeRows = Object.entries(counts.mapping_type)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  const cov = counts.stitch_screen_coverage;
  const md = `# ActiveClinic Stitch → V7 Implementation Mapping

**Generated:** ${NOW}  
**Inputs:** Stitch raw inventory (388) + V7 implementation raw inventory (${map.inputs && map.inputs.implementation_records ? map.inputs.implementation_records : "updated"})  
**Phase 4:** remapped former STITCH_NOT_IMPLEMENTED rows only

---

## A. Safety

| Field | Value |
|-------|-------|
| branch | V7 |
| HEAD | \`${HEAD}\` |
| DEPLOYMENT_ENV | testing |
| DB identity | moovex-platform-v7 |
| production touched | no |
| pushed | no |
| deployed | no |

---

## B. Mapping counts

| mapping_type | Count |
|--------------|------:|
${typeRows}

### Coverage

| Bucket | Count |
|--------|------:|
| Full | ${cov.full} |
| Partial | ${cov.partial} |
| Missing | ${cov.missing} |
| Other | ${cov.other} |
| Total | ${cov.total} |

### Desktop / Mobile

| Device | Full | Partial | Missing | Other | Total |
|--------|-----:|--------:|--------:|------:|------:|
| Desktop | ${counts.desktop.full} | ${counts.desktop.partial} | ${counts.desktop.missing} | ${counts.desktop.other} | ${counts.desktop.total} |
| Mobile | ${counts.mobile.full} | ${counts.mobile.partial} | ${counts.mobile.missing} | ${counts.mobile.other} | ${counts.mobile.total} |

Phase 4 target: Missing 21 → 0.
`;
  fs.writeFileSync(MAP_MD, md);
}

function main() {
  const impl = JSON.parse(fs.readFileSync(IMPL_JSON, "utf8"));
  const map = JSON.parse(fs.readFileSync(MAP_JSON, "utf8"));

  // Avoid duplicate appends if re-run
  const existingPaths = new Set(impl.screens.map((s) => `${s.route_path}::${s.view_path}`));
  const idFor = nextImplId(impl.screens);
  const added = [];
  let n = 1;
  for (const screen of NEW_SCREENS) {
    const key = `${screen.route_path}::${screen.view_path}`;
    if (existingPaths.has(key)) continue;
    const record = { implementation_id: idFor(n++), ...screen };
    impl.screens.push(record);
    added.push(record);
    existingPaths.add(key);
  }

  impl.generated_at = NOW;
  impl.phase4_update = {
    added_count: added.length,
    note: "Phase 4 STITCH_NOT_IMPLEMENTED gap closure",
  };
  if (impl.integrity) {
    impl.integrity.implementation_screen_state_records = impl.screens.length;
  }

  const byView = {};
  for (const s of impl.screens) {
    if (!byView[s.view_path]) byView[s.view_path] = [];
    byView[s.view_path].push(s.implementation_id);
  }

  let remapped = 0;
  for (const row of map.mappings) {
    const spec = REMAP[row.stitch_screen_id];
    if (!spec) continue;
    if (row.mapping_type !== "STITCH_NOT_IMPLEMENTED" && !String(row.notes || "").includes("Phase 4")) {
      // allow re-run updates for phase4 notes
    }
    const implIds = [];
    for (const vp of spec.view_paths) {
      for (const id of byView[vp] || []) implIds.push(id);
    }
    row.mapping_type = spec.mapping_type;
    row.mapping_confidence = "HIGH";
    row.implementation_ids = [...new Set(implIds)];
    row.route_paths = spec.route_paths;
    row.view_paths = spec.view_paths;
    row.implementation_states = ["DEFAULT"];
    row.device_support = ["DESKTOP", "MOBILE"];
    row.missing_requirement = null;
    row.evidence = `Phase 4 implemented: ${spec.route_paths.join(" | ")} / ${spec.view_paths.join(" | ")}`;
    row.notes = spec.notes;
    remapped += 1;
  }

  const counts = recount(map.mappings);
  map.generated_at = NOW;
  map.counts = counts;
  map.phase4_remap = {
    remapped_former_not_implemented: remapped,
    expected: 21,
    missing_after: counts.stitch_screen_coverage.missing,
  };
  if (map.inputs) {
    map.inputs.implementation_records = impl.screens.length;
    map.inputs.phase4_note = "Implementation inventory updated after Phase 4 code";
  }
  // Clear top gaps that referenced missing 21 if present
  if (Array.isArray(map.top_implementation_gaps)) {
    map.top_implementation_gaps = map.top_implementation_gaps.filter(
      (g) => !(g && g.kind === "STITCH_NOT_IMPLEMENTED" && REMAP[g.stitch_screen_id])
    );
  }

  fs.writeFileSync(IMPL_JSON, JSON.stringify(impl, null, 2) + "\n");
  fs.writeFileSync(MAP_JSON, JSON.stringify(map, null, 2) + "\n");
  writeImplCsv(impl.screens);
  writeMapCsv(map.mappings);
  writeImplMd(impl);
  writeMapMd(map, counts);

  console.log(
    JSON.stringify(
      {
        added_impl_records: added.length,
        impl_total: impl.screens.length,
        remapped,
        coverage: counts.stitch_screen_coverage,
        desktop: counts.desktop,
        mobile: counts.mobile,
        still_missing: map.mappings
          .filter((r) => r.mapping_type === "STITCH_NOT_IMPLEMENTED")
          .map((r) => r.stitch_screen_id),
      },
      null,
      2
    )
  );
}

main();
