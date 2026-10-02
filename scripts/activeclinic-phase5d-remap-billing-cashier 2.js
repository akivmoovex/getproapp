"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/activeclinic/stitch");
const FILES = {
  implJson: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.json"),
  implCsv: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.csv"),
  implMd: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.md"),
  mapJson: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.json"),
  mapCsv: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.csv"),
  mapMd: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.md"),
};
const NOW = new Date().toISOString();
const FULL = new Set([
  "EXACT_IMPLEMENTATION_MATCH",
  "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
  "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
]);

const SCREENS = [
  ["BILLING", "/app/billing/invoices/:invoiceId/items/new", "views/activeclinic/app/billing-invoice-add-item-content.ejs", "activeclinic.billing.invoice.create", "billing"],
  ["BILLING", "/app/billing/invoices/:invoiceId/error", "views/activeclinic/app/billing-invoice-error-content.ejs", "activeclinic.billing.view", "billing"],
  ["BILLING", "/app/billing/catalog/:catalogItemId", "views/activeclinic/app/billing-catalog-detail-content.ejs", "activeclinic.billing.view", "billing"],
  ["BILLING", "/app/billing/payments/history", "views/activeclinic/app/billing-payment-history-content.ejs", "activeclinic.payment.view", "billing"],
  ["CASHIER", "/app/cashier/payment/completed", "views/activeclinic/app/cashier-payment-completed-content.ejs", "activeclinic.payment.collect", "cashier"],
  ["CASHIER", "/app/cashier/refunds/request", "views/activeclinic/app/cashier-refund-request-content.ejs", "activeclinic.payment.collect", "cashier"],
  ["CASHIER", "/app/cashier/refunds/:refundId/review", "views/activeclinic/app/cashier-refund-review-content.ejs", "activeclinic.payment.view", "cashier"],
  ["CASHIER", "/app/cashier/refunds/:refundId/completed", "views/activeclinic/app/cashier-refund-completed-content.ejs", "activeclinic.payment.view", "cashier"],
  ["CASHIER", "/app/cashier/refunds/:refundId/rejected", "views/activeclinic/app/cashier-refund-rejected-content.ejs", "activeclinic.payment.view", "cashier"],
  ["CASHIER", "/app/cashier/reversals/request", "views/activeclinic/app/cashier-reversal-request-content.ejs", "activeclinic.payment.collect", "cashier"],
  ["CASHIER", "/app/cashier/reversals/:reversalId/review", "views/activeclinic/app/cashier-reversal-review-content.ejs", "activeclinic.payment.view", "cashier"],
  ["CASHIER", "/app/cashier/close/cash-count", "views/activeclinic/app/cashier-close-cash-count-content.ejs", "activeclinic.cashier.close_session", "cashier"],
  ["CASHIER", "/app/cashier/close/review", "views/activeclinic/app/cashier-close-review-content.ejs", "activeclinic.cashier.close_session", "cashier"],
  ["CASHIER", "/app/cashier/close/variance", "views/activeclinic/app/cashier-close-variance-content.ejs", "activeclinic.cashier.close_session", "cashier"],
];

const REMAP = {
  be4481e8f31b459facf2294f73311181: [
    "/app/billing/invoices/:invoiceId/items/new",
    "views/activeclinic/app/billing-invoice-add-item-content.ejs",
  ],
  b1a8b1855b9b4e268cd42359707d292e: [
    "/app/billing/invoices/:invoiceId/error",
    "views/activeclinic/app/billing-invoice-error-content.ejs",
  ],
  d5eb57a8319c4130be473f8dd23851d6: [
    "/app/billing/catalog/:catalogItemId",
    "views/activeclinic/app/billing-catalog-detail-content.ejs",
  ],
  "45929cd32480420aaa5788be86e183f9": [
    "/app/billing/payments/history",
    "views/activeclinic/app/billing-payment-history-content.ejs",
  ],
  bda1fbd1f6f441dba26719f451ee53de: [
    "/app/cashier/payment/completed",
    "views/activeclinic/app/cashier-payment-completed-content.ejs",
  ],
  "2665942082b4428dbcabf3ff3a40ec60": [
    "/app/cashier/reversals/request",
    "views/activeclinic/app/cashier-reversal-request-content.ejs",
  ],
  "027b12b482934ef1a6f5dee02c888d26": [
    "/app/cashier/reversals/:reversalId/review",
    "views/activeclinic/app/cashier-reversal-review-content.ejs",
  ],
  d8f3108dfcda4ab9bf58472786d0484c: [
    "/app/cashier/refunds/:refundId/review",
    "views/activeclinic/app/cashier-refund-review-content.ejs",
    "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
  ],
  e52271b7be804e0ea95c825be9f977bd: [
    "/app/cashier/refunds/:refundId/completed",
    "views/activeclinic/app/cashier-refund-completed-content.ejs",
  ],
  b76f80fb0d164501b8108bea91813385: [
    "/app/cashier/refunds/:refundId/rejected",
    "views/activeclinic/app/cashier-refund-rejected-content.ejs",
  ],
  "685fb829c50a45af995772909fb49fb7": [
    "/app/cashier/refunds/request",
    "views/activeclinic/app/cashier-refund-request-content.ejs",
  ],
  "8461f1792a7a41209ae2abfe44db7b6a": [
    "/app/cashier/refunds/request",
    "views/activeclinic/app/cashier-refund-request-content.ejs",
    "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
  ],
  "438b1bb01f534492850ee8cb1253fcfe": [
    "/app/cashier/refunds/:refundId/review",
    "views/activeclinic/app/cashier-refund-review-content.ejs",
  ],
  "02e8083e943d40deb9429b95a294ae30": [
    "/app/cashier/close/cash-count",
    "views/activeclinic/app/cashier-close-cash-count-content.ejs",
  ],
  d3e2ff001f694720b57371ef1a60d517: [
    "/app/cashier/close/review",
    "views/activeclinic/app/cashier-close-review-content.ejs",
  ],
  "7dd49983c4a840b9980fb4a92d486b3c": [
    "/app/cashier/close/variance",
    "views/activeclinic/app/cashier-close-variance-content.ejs",
  ],
};

function csv(v) {
  const value = v == null ? "" : String(v);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function areaCounts(rows, area) {
  const result = { full: 0, partial: 0, missing: 0, other: 0, total: 0 };
  for (const row of rows.filter((item) => item.stitch_functional_area === area)) {
    result.total += 1;
    if (FULL.has(row.mapping_type)) result.full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") result.partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") result.missing += 1;
    else result.other += 1;
  }
  return result;
}

function recount(rows) {
  const mapping_type = {};
  const confidence = {};
  const coverage = { full: 0, partial: 0, missing: 0, other: 0, total: rows.length };
  for (const row of rows) {
    mapping_type[row.mapping_type] = (mapping_type[row.mapping_type] || 0) + 1;
    confidence[row.mapping_confidence] = (confidence[row.mapping_confidence] || 0) + 1;
    if (FULL.has(row.mapping_type)) coverage.full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") coverage.partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") coverage.missing += 1;
    else coverage.other += 1;
  }
  return { mapping_type, confidence, stitch_screen_coverage: coverage };
}

function writeCsv(file, rows, headers, valueFor) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((key) => csv(valueFor(row, key))).join(","));
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function updatePhaseCoverage(map, area, after) {
  if (!Array.isArray(map.phase_coverage)) return;
  const entry = map.phase_coverage.find((row) => row.functional_area === area);
  if (entry) {
    entry.full = after.full;
    entry.partial = after.partial;
    entry.not_implemented = after.missing;
  }
}

function routeFileForArea(area) {
  return area === "BILLING"
    ? "src/activeclinic/http/activeClinicBillingRoutes.js"
    : "src/activeclinic/http/activeClinicCashierRoutes.js";
}

function main() {
  const impl = JSON.parse(fs.readFileSync(FILES.implJson, "utf8"));
  const map = JSON.parse(fs.readFileSync(FILES.mapJson, "utf8"));
  const before = {
    BILLING: areaCounts(map.mappings, "BILLING"),
    CASHIER: areaCounts(map.mappings, "CASHIER"),
  };

  let max = Math.max(...impl.screens.map((row) => Number(String(row.implementation_id).replace(/\D/g, "")) || 0));
  const added = [];
  for (const [area, route, view, permission, department] of SCREENS) {
    let record = impl.screens.find((row) => row.route_path === route && row.view_path === view);
    if (!record) {
      record = {
        implementation_id: `ACV7-IMPL-${String(++max).padStart(4, "0")}`,
        surface: "INTERNAL",
        functional_area: area,
        route_method: "GET",
        route_path: route,
        route_file: routeFileForArea(area),
        handler: "Phase5D billing/cashier partial closure",
        view_path: view,
        layout: "layouts/app-shell.ejs",
        device_support: ["DESKTOP", "MOBILE"],
        screen_kind: "PRIMARY_SCREEN",
        state: "DEFAULT",
        auth_required: true,
        rbac_permissions: [permission],
        facility_scope: true,
        department_scope: department,
        reachable: "REACHABLE",
        reachability_evidence: "Phase 5D GET route and regression suite",
        partials: [],
        client_js: ["public/activeclinic/ac-shell-nav.js"],
        implementation_substance: "FUNCTIONAL",
        notes: "ActiveClinic V7 Phase 5D",
      };
      impl.screens.push(record);
      added.push(record);
    }
  }

  const byRouteView = new Map(
    impl.screens.map((row) => [`${row.route_path}::${row.view_path}`, row.implementation_id])
  );
  let remapped = 0;
  for (const row of map.mappings) {
    const spec = REMAP[row.stitch_screen_id];
    if (!spec) continue;
    if (row.mapping_type !== "PARTIAL_IMPLEMENTATION") {
      throw new Error(`Refusing to update non-PARTIAL row ${row.stitch_screen_id}`);
    }
    const [route, view, type = "EXACT_IMPLEMENTATION_MATCH"] = spec;
    const implementationId = byRouteView.get(`${route}::${view}`);
    if (!implementationId) throw new Error(`Missing implementation record for ${route} / ${view}`);
    row.mapping_type = type;
    row.mapping_confidence = "HIGH";
    row.implementation_ids = [implementationId];
    row.route_paths = [route];
    row.view_paths = [view];
    row.implementation_states =
      row.stitch_state === "SUCCESS"
        ? ["SUCCESS"]
        : row.stitch_state === "ERROR"
          ? ["ERROR"]
          : ["DEFAULT"];
    row.device_support = row.stitch_device === "MOBILE" ? ["MOBILE"] : ["DESKTOP", "MOBILE"];
    row.product_difference = null;
    row.missing_requirement = null;
    row.evidence = `Phase 5D: ${route} / ${view}`;
    row.notes = "Billing/Cashier partial closure";
    remapped += 1;
  }
  if (remapped !== 16) throw new Error(`Expected 16 PARTIAL rows, updated ${remapped}`);

  const after = {
    BILLING: areaCounts(map.mappings, "BILLING"),
    CASHIER: areaCounts(map.mappings, "CASHIER"),
  };
  impl.generated_at = NOW;
  impl.phase5d_update = { added_count: added.length, note: "Billing/Cashier partial closure" };
  if (impl.integrity) impl.integrity.implementation_screen_state_records = impl.screens.length;
  map.generated_at = NOW;
  map.counts = { ...map.counts, ...recount(map.mappings) };
  map.phase5d_remap = { remapped_former_partials: remapped, before, after };
  if (map.inputs) map.inputs.implementation_records = impl.screens.length;
  updatePhaseCoverage(map, "BILLING", after.BILLING);
  updatePhaseCoverage(map, "CASHIER", after.CASHIER);

  fs.writeFileSync(FILES.implJson, `${JSON.stringify(impl, null, 2)}\n`);
  fs.writeFileSync(FILES.mapJson, `${JSON.stringify(map, null, 2)}\n`);

  const implHeaders = [
    "implementation_id","surface","functional_area","route_method","route_path","route_file","handler","view_path","layout","device_support","screen_kind","state","auth_required","rbac_permissions","facility_scope","department_scope","reachable","reachability_evidence","partials","client_js","implementation_substance","notes",
  ];
  writeCsv(FILES.implCsv, impl.screens, implHeaders, (row, key) =>
    Array.isArray(row[key]) ? row[key].join("|") : row[key]
  );
  const mapHeaders = [
    "stitch_project_id","stitch_screen_id","stitch_screen_title","stitch_phase","stitch_functional_area","stitch_device","stitch_state","mapping_type","mapping_confidence","implementation_ids","route_paths","view_paths","implementation_states","device_support","canonical_stitch_screen_id","product_difference","missing_requirement","evidence","notes",
  ];
  writeCsv(FILES.mapCsv, map.mappings, mapHeaders, (row, key) =>
    Array.isArray(row[key]) ? row[key].join("|") : row[key]
  );

  fs.writeFileSync(
    FILES.implMd,
    `# ActiveClinic V7 Implementation Raw Inventory\n\n**Generated:** ${NOW}\n**Phase 5D:** Billing/Cashier partial closure\n\n| Metric | Count |\n|---|---:|\n| Implementation records | ${impl.screens.length} |\n| Phase 5D added | ${added.length} |\n`
  );
  const lines = [
    "# ActiveClinic Stitch → V7 Implementation Mapping",
    "",
    `**Generated:** ${NOW}`,
    "**Phase 5D:** 16 Billing/Cashier PARTIAL rows closed",
    "",
  ];
  for (const area of ["BILLING", "CASHIER"]) {
    lines.push(`## ${area}`, "", "| Bucket | Before | After |", "|---|---:|---:|");
    for (const key of ["full", "partial", "missing", "other", "total"]) {
      lines.push(`| ${key} | ${before[area][key]} | ${after[area][key]} |`);
    }
    lines.push("");
  }
  if (lines[lines.length - 1] === "") lines.pop();
  fs.writeFileSync(FILES.mapMd, `${lines.join("\n")}\n`);
  console.log(JSON.stringify({ added: added.length, remapped, before, after }, null, 2));
}

main();
