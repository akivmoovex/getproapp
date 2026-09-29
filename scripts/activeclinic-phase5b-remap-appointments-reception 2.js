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
  ["APPOINTMENTS", "/app/appointments/:appointmentId/confirmed", "views/activeclinic/app/appointment-success-content.ejs", "activeclinic.appointment.view"],
  ["APPOINTMENTS", "/app/appointments/:appointmentId/cancel", "views/activeclinic/app/appointment-cancel-content.ejs", "activeclinic.appointment.cancel"],
  ["APPOINTMENTS", "/app/appointments/:appointmentId/reschedule", "views/activeclinic/app/appointment-form-content.ejs", "activeclinic.appointment.update"],
  ["APPOINTMENTS", "/app/appointments/missed", "views/activeclinic/app/appointments-missed-content.ejs", "activeclinic.appointment.view"],
  ["APPOINTMENTS", "/app/appointments/schedule", "views/activeclinic/app/appointments-schedule-content.ejs", "activeclinic.appointment.view"],
  ["RECEPTION", "/app/reception/queue/:entryId/called", "views/activeclinic/app/reception-queue-called-content.ejs", "activeclinic.reception.view"],
  ["RECEPTION", "/app/reception/queue/:entryId/did-not-respond", "views/activeclinic/app/reception-queue-did-not-respond-content.ejs", "activeclinic.reception.manage_queue"],
  ["RECEPTION", "/app/reception/queue/:entryId/assign", "views/activeclinic/app/reception-queue-assign-content.ejs", "activeclinic.reception.manage_queue"],
  ["RECEPTION", "/app/reception/queue/:entryId/transfer", "views/activeclinic/app/reception-queue-transfer-content.ejs", "activeclinic.reception.transfer"],
];

const REMAP = {
  "327422c1b36747039e4026a17c5a2f33": ["/app/appointments/:appointmentId/confirmed", "views/activeclinic/app/appointment-success-content.ejs"],
  "089aa8f266664446a8b38cb69d1fda48": ["/app/appointments", "views/activeclinic/app/appointments-list-content.ejs"],
  "b27eafc25bad4006868f3932d08bfed5": ["/app/appointments/:appointmentId/cancel", "views/activeclinic/app/appointment-cancel-content.ejs"],
  "fd009ceba70f40b2ae1755b94220c64b": ["/app/appointments/schedule", "views/activeclinic/app/appointments-schedule-content.ejs"],
  "7d37e069c7644e7cb4c9b72349a0ccf7": ["/app/appointments/missed", "views/activeclinic/app/appointments-missed-content.ejs"],
  "da39a3945ace4fac85cb12bd86f0cdc2": ["/app/appointments/:appointmentId/reschedule", "views/activeclinic/app/appointment-form-content.ejs"],
  "9429b14e9ea243ad93aec4a486db93e9": ["/app/appointments/:appointmentId/reschedule", "views/activeclinic/app/appointment-form-content.ejs", "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION"],
  "8dca6dbd36b840928e73d6674bbcb3ea": ["/app/reception/queue/:entryId/called", "views/activeclinic/app/reception-queue-called-content.ejs"],
  "f7841548662446cfa8d70d0772d3fa9f": ["/app/reception/queue/:entryId/did-not-respond", "views/activeclinic/app/reception-queue-did-not-respond-content.ejs"],
  "1fa99f4a358c47ffb858addae7095fe8": ["/app/reception/queue/:entryId/assign", "views/activeclinic/app/reception-queue-assign-content.ejs"],
  "bf9b846da6174bf995793b09e869cd30": ["/app/reception/queue/:entryId", "views/activeclinic/app/reception-queue-detail-content.ejs"],
  "e807a1354fdd418391496e69e5ac5f3e": ["/app/reception/queue/:entryId/transfer", "views/activeclinic/app/reception-queue-transfer-content.ejs"],
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

function main() {
  const impl = JSON.parse(fs.readFileSync(FILES.implJson, "utf8"));
  const map = JSON.parse(fs.readFileSync(FILES.mapJson, "utf8"));
  const before = {
    APPOINTMENTS: areaCounts(map.mappings, "APPOINTMENTS"),
    RECEPTION: areaCounts(map.mappings, "RECEPTION"),
  };

  let max = Math.max(...impl.screens.map((row) => Number(String(row.implementation_id).replace(/\D/g, "")) || 0));
  const added = [];
  for (const [area, route, view, permission] of SCREENS) {
    let record = impl.screens.find((row) => row.route_path === route && row.view_path === view);
    if (!record) {
      record = {
        implementation_id: `ACV7-IMPL-${String(++max).padStart(4, "0")}`,
        surface: "INTERNAL",
        functional_area: area,
        route_method: "GET",
        route_path: route,
        route_file: area === "APPOINTMENTS"
          ? "src/activeclinic/http/activeClinicAppointmentRoutes.js"
          : "src/activeclinic/http/activeClinicReceptionRoutes.js",
        handler: "Phase5B dedicated screen",
        view_path: view,
        layout: "layouts/app-shell.ejs",
        device_support: ["DESKTOP", "MOBILE"],
        screen_kind: "PRIMARY_SCREEN",
        state: "DEFAULT",
        auth_required: true,
        rbac_permissions: [permission],
        facility_scope: true,
        department_scope: area.toLowerCase(),
        reachable: "REACHABLE",
        reachability_evidence: "Phase 5B GET route and regression suite",
        partials: [],
        client_js: ["public/activeclinic/ac-shell-nav.js"],
        implementation_substance: "FUNCTIONAL",
        notes: "ActiveClinic V7 Phase 5B",
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
    row.implementation_states = ["DEFAULT"];
    row.device_support = ["DESKTOP", "MOBILE"];
    row.product_difference = null;
    row.missing_requirement = null;
    row.evidence = `Phase 5B: ${route} / ${view}`;
    row.notes = "Appointments + Reception partial closure";
    remapped += 1;
  }
  if (remapped !== 12) throw new Error(`Expected 12 PARTIAL rows, updated ${remapped}`);

  const after = {
    APPOINTMENTS: areaCounts(map.mappings, "APPOINTMENTS"),
    RECEPTION: areaCounts(map.mappings, "RECEPTION"),
  };
  impl.generated_at = NOW;
  impl.phase5b_update = { added_count: added.length, note: "Appointments + Reception partial closure" };
  if (impl.integrity) impl.integrity.implementation_screen_state_records = impl.screens.length;
  map.generated_at = NOW;
  map.counts = { ...map.counts, ...recount(map.mappings) };
  map.phase5b_remap = { remapped_former_partials: remapped, before, after };
  if (map.inputs) map.inputs.implementation_records = impl.screens.length;

  fs.writeFileSync(FILES.implJson, `${JSON.stringify(impl, null, 2)}\n`);
  fs.writeFileSync(FILES.mapJson, `${JSON.stringify(map, null, 2)}\n`);

  const implHeaders = ["implementation_id","surface","functional_area","route_method","route_path","route_file","handler","view_path","layout","device_support","screen_kind","state","auth_required","rbac_permissions","facility_scope","department_scope","reachable","reachability_evidence","partials","client_js","implementation_substance","notes"];
  writeCsv(FILES.implCsv, impl.screens, implHeaders, (row, key) =>
    Array.isArray(row[key]) ? row[key].join("|") : row[key]
  );
  const mapHeaders = ["stitch_project_id","stitch_screen_id","stitch_screen_title","stitch_phase","stitch_functional_area","stitch_device","stitch_state","mapping_type","mapping_confidence","implementation_ids","route_paths","view_paths","implementation_states","device_support","canonical_stitch_screen_id","product_difference","missing_requirement","evidence","notes"];
  writeCsv(FILES.mapCsv, map.mappings, mapHeaders, (row, key) =>
    Array.isArray(row[key]) ? row[key].join("|") : row[key]
  );

  fs.writeFileSync(FILES.implMd, `# ActiveClinic V7 Implementation Raw Inventory\n\n**Generated:** ${NOW}\n**Phase 5B:** Appointments + Reception partial closure\n\n| Metric | Count |\n|---|---:|\n| Implementation records | ${impl.screens.length} |\n| Phase 5B added | ${added.length} |\n`);
  const lines = ["# ActiveClinic Stitch → V7 Implementation Mapping", "", `**Generated:** ${NOW}`, "**Phase 5B:** 12 Appointments + Reception PARTIAL rows closed", ""];
  for (const area of ["APPOINTMENTS", "RECEPTION"]) {
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
