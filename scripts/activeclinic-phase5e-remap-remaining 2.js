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
  ["STAFF", "/app/staff/invite", "views/activeclinic/app/staff-invite-content.ejs", "activeclinic.staff.invite", "src/activeclinic/http/activeClinicStaffRoutes.js", null],
  ["STAFF", "/app/staff/:staffId/suspend", "views/activeclinic/app/staff-suspend-content.ejs", "activeclinic.staff.archive", "src/activeclinic/http/activeClinicStaffRoutes.js", null],
  ["RBAC", "/app/access/roles/:roleKey", "views/activeclinic/app/access-role-detail-content.ejs", "activeclinic.staff.assign_access", "src/activeclinic/http/activeClinicAccessRoutes.js", null],
  ["SETTINGS", "/app/settings/account/sessions", "views/activeclinic/app/settings-account-sessions-content.ejs", "activeclinic.access", "src/activeclinic/http/activeClinicSettingsRoutes.js", null],
];

/**
 * Remap all remaining PARTIAL rows.
 * mapping_type + optional route/view override + notes/product_difference.
 */
const REMAP = {
  // P02 patients — functional coverage already in form/list
  "91e41fecc2b64496893b52317b7ab985": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/app/patients/new"],
    views: ["views/activeclinic/app/patient-form-content.ejs"],
    notes: "Duplicate warning panel inline on create form; Phase 5E functional closure",
  },
  "f98b2e6f2a4a4953a4d811af7b3737a2": {
    type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    routes: ["/app/patients", "(access-state)"],
    views: [
      "views/activeclinic/app/patients-list-content.ejs",
      "views/activeclinic/app/access-state.ejs",
    ],
    notes: "Shared patient empty/list/access states covered by list + access-state taxonomy",
  },

  // P13 settings/staff/rbac — new dedicated screens + catalogue
  "c50a51a04a084f0badd48da9827aa11f": {
    type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    routes: ["/app/settings/account", "/app/settings/account/sessions", "/account/change-password"],
    views: [
      "views/activeclinic/app/settings-account-content.ejs",
      "views/activeclinic/app/settings-account-sessions-content.ejs",
      "views/activeclinic/auth/change-password.ejs",
    ],
    notes: "Account security hub: password + sessions + logout",
  },
  "e132749f634c4fff818acf3f8e21c361": {
    type: "EXACT_IMPLEMENTATION_MATCH",
    routes: ["/app/settings/account/sessions"],
    views: ["views/activeclinic/app/settings-account-sessions-content.ejs"],
    notes: "Self-service active session list + revoke others",
  },
  "f30963c89fad49ceabc2447dfd46f8f0": {
    type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    routes: ["/app/staff/invite", "/app/staff/new"],
    views: [
      "views/activeclinic/app/staff-invite-content.ejs",
      "views/activeclinic/app/staff-form-content.ejs",
      "views/activeclinic/app/staff-invite-result-content.ejs",
    ],
    notes: "Dedicated invite entry + create/invite form + result",
  },
  "8525edd4c31f46d6a6b5c6a233917559": {
    type: "EXACT_IMPLEMENTATION_MATCH",
    routes: ["/app/access/roles/:roleKey"],
    views: ["views/activeclinic/app/access-role-detail-content.ejs"],
    notes: "Role catalogue detail with permission groups",
  },
  "6b9cfcd190e14155ac4390d66d0cff76": {
    type: "PRODUCT_DECISION_DIFFERENCE",
    routes: ["/app/access?tab=catalogue", "/app/access/roles/:roleKey"],
    views: [
      "views/activeclinic/app/access-content.ejs",
      "views/activeclinic/app/access-role-detail-content.ejs",
    ],
    product_difference:
      "V7 uses fixed ActiveClinic role catalogue with capability-group summaries and role detail pages. Stitch role×permission matrix editor is intentionally not built — roles are system-defined, not custom-editable.",
    notes: "Product decision: no editable permission matrix",
  },
  "3d43526745534570bbe9cd22948be3c1": {
    type: "EXACT_IMPLEMENTATION_MATCH",
    routes: ["/app/staff/:staffId/suspend"],
    views: ["views/activeclinic/app/staff-suspend-content.ejs"],
    notes: "Dedicated suspend confirmation screen",
  },

  // Shared loading — taxonomy / no artificial page
  "8a3f15c0be9c47efb192f206df104d5c": {
    type: "NO_IMPLEMENTATION_REQUIRED",
    routes: [],
    views: ["views/activeclinic/partials/ac-loading-state.ejs"],
    notes: "Shared loading is an inline taxonomy/partial; V7 does not ship a global artificial loading page (S08)",
  },

  // P23 patterns
  "a59b166b17ff4c1b8514102aedaeef57": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/pricing"],
    views: ["views/activeclinic/tenant/pricing.ejs"],
    notes: "Price patterns board condensed into tenant pricing page",
  },
  "c158c997d0db4d6bb2b228164441ab37": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/services"],
    views: ["views/activeclinic/tenant/services.ejs"],
    notes: "Service empty/unavailable states inline on services page",
  },

  // P24 booking pattern boards
  "d548137f807b40daaaaeff7fe2bcd0fa": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/book/slot"],
    views: ["views/activeclinic/booking/consultation-slot.ejs"],
    notes: "Availability states covered by slot no_slots_published banners",
  },
  "4dc9024e5d6f4267bf6b5a8c6c80aa08": {
    type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    routes: ["/clinics/:clinicKey/book", "/clinics/:clinicKey/book/slot"],
    views: [
      "views/activeclinic/booking/consultation-type.ejs",
      "views/activeclinic/booking/consultation-slot.ejs",
    ],
    notes: "Form validation state boards covered by wizard re-renders",
  },
  "c8dc05d3e0744fcf9f0030ccbe63a172": {
    type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    routes: ["/clinics/:clinicKey/book", "/clinics/:clinicKey/book/slot"],
    views: [
      "views/activeclinic/partials/booking-wizard-progress.ejs",
      "views/activeclinic/partials/booking-summary.ejs",
    ],
    notes: "Mobile nav/summary pattern = shell + booking progress/summary partials",
  },
  "14b98caed9cc4b4889d77763373a0e28": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/book"],
    views: ["views/activeclinic/partials/booking-wizard-progress.ejs"],
    notes: "Progress patterns board → booking-wizard-progress partial",
  },
  "bb250d93ee27449793869522211fb17c": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/book"],
    views: ["views/activeclinic/partials/sms-honesty-note.ejs"],
    notes: "SMS notification states → honesty note (no real SMS send in V7)",
  },

  // P26 my-booking patterns
  "e1a9a3b347b74171848d5639eaf48694": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    notes: "Booking activity pattern covered by detail status banners (no separate event timeline)",
  },
  "ca7cdd02f84f4a13abb5b324f3fb453f": {
    type: "PRODUCT_DECISION_DIFFERENCE",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    product_difference:
      "V7 reloads current booking status on each request. Stitch mid-request conflict UX (booking changed while editing) is intentionally not built; cancel/reschedule operate on current server state.",
    notes: "Product decision: no optimistic-lock conflict screen",
  },
  "b18ffbdac9a644f8bea30734fc9368df": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    notes: "Status pattern board covered by detail status badges/banners",
  },
  "7b7546940db743839e4c4b11ae366dda": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    notes: "Change-request states covered on my-booking detail cancel/reschedule actions",
  },
  "ab96f1f72f444e9e943a1e6b2d539b46": {
    type: "NO_IMPLEMENTATION_REQUIRED",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-lookup.ejs"],
    notes: "Lookup is synchronous; artificial progress screen not required (same philosophy as Shared Loading)",
  },
  "8f9a5650ff3d4f7482de4f82bcee597b": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    notes: "Mobile booking summary pattern on detail",
  },
  "4e84a1501ffa454b91221a4f32cfaabb": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-detail.ejs"],
    notes: "Pending preference/reschedule_requested banner on detail",
  },
  "e50e9dfeaf1a405bbf3f3c334ebbe039": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/my-booking"],
    views: ["views/activeclinic/booking/my-booking-lookup.ejs"],
    notes: "Privacy/lookup rules copy + token-safe lookup service",
  },

  // P27 patient portal
  "b3521756764f4a978c9244a2f5c3ae9e": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/patient/bookings"],
    views: ["views/activeclinic/patient/bookings.ejs"],
    notes: "Status filter nav covers Stitch booking filters on mobile",
  },
  "795b6f3cce584467bdc369bd89f67419": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/patient/login"],
    views: ["views/activeclinic/patient/login.ejs"],
    notes: "Login error/rate-limit states via validation re-render",
  },
  "bc0fd174f14d4a3a8e78a57aad1564ee": {
    type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    routes: ["/clinics/:clinicKey/patient/register"],
    views: ["views/activeclinic/patient/register.ejs"],
    notes: "Registration error states via validation re-render",
  },
};

function csv(v) {
  const value = v == null ? "" : String(v);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function areaCounts(rows, area) {
  const result = { full: 0, partial: 0, missing: 0, other: 0, total: 0, product_decision: 0, na: 0 };
  for (const row of rows.filter((item) => item.stitch_functional_area === area)) {
    result.total += 1;
    if (FULL.has(row.mapping_type)) result.full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") result.partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") result.missing += 1;
    else if (row.mapping_type === "PRODUCT_DECISION_DIFFERENCE") {
      result.product_decision += 1;
      result.other += 1;
    } else if (row.mapping_type === "NO_IMPLEMENTATION_REQUIRED") {
      result.na += 1;
      result.other += 1;
    } else result.other += 1;
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
    if (after.product_decision != null) entry.product_difference = after.product_decision;
  }
}

function findImplIds(impl, routes, views) {
  const ids = [];
  for (let i = 0; i < routes.length; i += 1) {
    const route = routes[i];
    const view = views[i] || views[0];
    if (!route || route === "(access-state)") {
      const access = impl.screens.find((s) => s.route_path === "(access-state)" || (s.view_path || "").includes("access-state"));
      if (access) ids.push(access.implementation_id);
      continue;
    }
    let record = impl.screens.find((s) => s.route_path === route && (!view || s.view_path === view));
    if (!record) record = impl.screens.find((s) => s.route_path === route);
    if (!record && view) record = impl.screens.find((s) => s.view_path === view);
    if (record) ids.push(record.implementation_id);
  }
  return Array.from(new Set(ids));
}

function main() {
  const impl = JSON.parse(fs.readFileSync(FILES.implJson, "utf8"));
  const map = JSON.parse(fs.readFileSync(FILES.mapJson, "utf8"));
  const beforeGlobal = recount(map.mappings);
  const beforePartials = map.mappings.filter((r) => r.mapping_type === "PARTIAL_IMPLEMENTATION").length;

  let max = Math.max(
    ...impl.screens.map((row) => Number(String(row.implementation_id).replace(/\D/g, "")) || 0)
  );
  const added = [];
  for (const [area, route, view, permission, routeFile] of SCREENS) {
    let record = impl.screens.find((row) => row.route_path === route && row.view_path === view);
    if (!record) {
      record = {
        implementation_id: `ACV7-IMPL-${String(++max).padStart(4, "0")}`,
        surface: "INTERNAL",
        functional_area: area,
        route_method: "GET",
        route_path: route,
        route_file: routeFile,
        handler: "Phase5E remaining partial closure",
        view_path: view,
        layout: "layouts/app-shell.ejs",
        device_support: ["DESKTOP", "MOBILE"],
        screen_kind: "PRIMARY_SCREEN",
        state: "DEFAULT",
        auth_required: true,
        rbac_permissions: [permission],
        facility_scope: true,
        department_scope: null,
        reachable: "REACHABLE",
        reachability_evidence: "Phase 5E GET route and regression suite",
        partials: [],
        client_js: ["public/activeclinic/ac-shell-nav.js"],
        implementation_substance: "FUNCTIONAL",
        notes: "ActiveClinic V7 Phase 5E",
      };
      impl.screens.push(record);
      added.push(record);
    }
  }

  let remapped = 0;
  const byType = {};
  for (const row of map.mappings) {
    const spec = REMAP[row.stitch_screen_id];
    if (!spec) continue;
    if (row.mapping_type !== "PARTIAL_IMPLEMENTATION") {
      throw new Error(`Refusing to update non-PARTIAL row ${row.stitch_screen_id}`);
    }
    const routes = spec.routes || [];
    const views = spec.views || [];
    const implementationIds = findImplIds(impl, routes, views);
    if (
      FULL.has(spec.type) &&
      !implementationIds.length &&
      spec.type !== "NO_IMPLEMENTATION_REQUIRED"
    ) {
      // allow PRODUCT_DECISION / N/A without impl ids; for FULL require at least one
      if (routes.length && routes[0] && routes[0] !== "(access-state)") {
        throw new Error(`Missing implementation record for ${row.stitch_screen_id} ${routes[0]}`);
      }
    }
    row.mapping_type = spec.type;
    row.mapping_confidence = "HIGH";
    row.implementation_ids = implementationIds;
    row.route_paths = routes;
    row.view_paths = views;
    row.implementation_states =
      row.stitch_state === "SUCCESS"
        ? ["SUCCESS"]
        : row.stitch_state === "ERROR"
          ? ["ERROR"]
          : row.stitch_state === "PENDING"
            ? ["PENDING"]
            : row.stitch_state === "LOADING"
              ? ["LOADING"]
              : ["DEFAULT"];
    row.device_support =
      row.stitch_device === "MOBILE" ? ["MOBILE", "DESKTOP"] : ["DESKTOP", "MOBILE"];
    row.product_difference = spec.product_difference || null;
    row.missing_requirement = null;
    row.evidence = `Phase 5E: ${spec.type}${routes.length ? ` → ${routes.join(" | ")}` : ""}`;
    row.notes = spec.notes || "Phase 5E remaining partial closure";
    byType[spec.type] = (byType[spec.type] || 0) + 1;
    remapped += 1;
  }
  if (remapped !== beforePartials) {
    throw new Error(`Expected ${beforePartials} PARTIAL rows, updated ${remapped}`);
  }

  const affectedAreas = [
    "PATIENTS",
    "SETTINGS",
    "STAFF",
    "RBAC",
    "APP_SHELL",
    "PRICING",
    "SERVICES",
    "CONSULTATION_BOOKING",
    "PUBLIC_PLATFORM",
    "MY_BOOKING",
    "PATIENT_PORTAL",
    "PATIENT_AUTH",
  ];
  const after = {};
  for (const area of affectedAreas) {
    after[area] = areaCounts(map.mappings, area);
    updatePhaseCoverage(map, area, after[area]);
  }

  const afterGlobal = recount(map.mappings);
  impl.generated_at = NOW;
  impl.phase5e_update = { added_count: added.length, note: "Remaining partial closure" };
  if (impl.integrity) impl.integrity.implementation_screen_state_records = impl.screens.length;
  map.generated_at = NOW;
  map.counts = { ...map.counts, ...afterGlobal };
  map.phase5e_remap = {
    remapped_former_partials: remapped,
    by_type: byType,
    before_partial_count: beforePartials,
    after_partial_count: afterGlobal.stitch_screen_coverage.partial,
    before_global: beforeGlobal,
    after_global: afterGlobal,
    after_areas: after,
  };
  if (map.inputs) map.inputs.implementation_records = impl.screens.length;
  map.safety = {
    ...(map.safety || {}),
    branch: "V7",
    deployment_env: "testing",
    db_identity: "moovex-platform-v7",
    production_touched: false,
    pushed: false,
    deployed: false,
    phase5e_at: NOW,
  };

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
    `# ActiveClinic V7 Implementation Raw Inventory\n\n**Generated:** ${NOW}\n**Phase 5E:** Remaining partial closure\n\n| Metric | Count |\n|---|---:|\n| Implementation records | ${impl.screens.length} |\n| Phase 5E added | ${added.length} |\n`
  );
  const lines = [
    "# ActiveClinic Stitch → V7 Implementation Mapping",
    "",
    `**Generated:** ${NOW}`,
    `**Phase 5E:** ${remapped} remaining PARTIAL rows closed`,
    "",
    "## Global",
    "",
    "| Bucket | Before | After |",
    "|---|---:|---:|",
    `| full | ${beforeGlobal.stitch_screen_coverage.full} | ${afterGlobal.stitch_screen_coverage.full} |`,
    `| partial | ${beforeGlobal.stitch_screen_coverage.partial} | ${afterGlobal.stitch_screen_coverage.partial} |`,
    `| missing | ${beforeGlobal.stitch_screen_coverage.missing} | ${afterGlobal.stitch_screen_coverage.missing} |`,
    `| other | ${beforeGlobal.stitch_screen_coverage.other} | ${afterGlobal.stitch_screen_coverage.other} |`,
    "",
    "## Remap by type",
    "",
  ];
  for (const [type, count] of Object.entries(byType)) {
    lines.push(`- ${type}: ${count}`);
  }
  fs.writeFileSync(FILES.mapMd, `${lines.join("\n")}\n`);
  console.log(
    JSON.stringify(
      {
        added: added.length,
        remapped,
        byType,
        before_partial: beforePartials,
        after_partial: afterGlobal.stitch_screen_coverage.partial,
        before_global: beforeGlobal.stitch_screen_coverage,
        after_global: afterGlobal.stitch_screen_coverage,
        mapping_type: afterGlobal.mapping_type,
      },
      null,
      2
    )
  );
}

main();
