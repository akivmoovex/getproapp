"use strict";

/**
 * Phase 5A — update implementation inventory for P25 wizard steps and remap
 * former P25 PARTIAL_IMPLEMENTATION rows only.
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
const HEAD = require("child_process")
  .execSync("git rev-parse HEAD", { cwd: ROOT })
  .toString()
  .trim();

function nextImplId(screens) {
  let max = 0;
  for (const s of screens) {
    const m = String(s.implementation_id || "").match(/ACV7-IMPL-(\d+)/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return (n) => `ACV7-IMPL-${String(max + n).padStart(4, "0")}`;
}

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
    stitch_screen_coverage: { full, partial, missing, other, total: mappings.length },
    unique_design_concept_coverage: {
      full,
      partial,
      missing,
      other:
        other -
        (mapping_type.DUPLICATE_STITCH_VARIANT || 0) -
        (mapping_type.NO_IMPLEMENTATION_REQUIRED || 0),
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

function p25Counts(mappings) {
  const rows = mappings.filter((r) => r.stitch_phase === "P25");
  const out = { total: rows.length, full: 0, partial: 0, missing: 0, product: 0, other: 0 };
  const FULL = new Set([
    "EXACT_IMPLEMENTATION_MATCH",
    "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
  ]);
  for (const r of rows) {
    if (FULL.has(r.mapping_type)) out.full += 1;
    else if (r.mapping_type === "PARTIAL_IMPLEMENTATION") out.partial += 1;
    else if (r.mapping_type === "STITCH_NOT_IMPLEMENTED") out.missing += 1;
    else if (r.mapping_type === "PRODUCT_DECISION_DIFFERENCE") out.product += 1;
    else out.other += 1;
  }
  return out;
}

const NEW_SCREENS = [
  {
    surface: "BOOKING",
    functional_area: "PROCEDURE_BOOKING",
    route_method: "GET",
    route_path: "/clinics/:clinicKey/book/procedures/:procedureKey/referral",
    route_file: "src/activeclinic/http/activeClinicPublicBookingRoutes.js",
    handler: "procedureReferralStep",
    view_path: "views/activeclinic/booking/procedure-referral.ejs",
    layout: "layouts/public-shell.ejs",
    device_support: ["DESKTOP", "MOBILE"],
    screen_kind: "PRIMARY_SCREEN",
    state: "DEFAULT",
    auth_required: false,
    rbac_permissions: [],
    facility_scope: false,
    department_scope: null,
    reachable: "REACHABLE",
    reachability_evidence: "GET/POST referral step; honesty no-upload; Phase 5A tests",
    partials: [
      "partials/booking-wizard-progress.ejs",
      "partials/booking-summary.ejs",
      "partials/sms-honesty-note.ejs",
    ],
    client_js: ["public/activeclinic/ac-public.js"],
    implementation_substance: "FUNCTIONAL",
    notes: "Phase 5A referral step — upload not available",
  },
  {
    surface: "BOOKING",
    functional_area: "PROCEDURE_BOOKING",
    route_method: "GET",
    route_path: "/clinics/:clinicKey/book/procedures/:procedureKey/time",
    route_file: "src/activeclinic/http/activeClinicPublicBookingRoutes.js",
    handler: "procedureTimeStep",
    view_path: "views/activeclinic/booking/procedure-time.ejs",
    layout: "layouts/public-shell.ejs",
    device_support: ["DESKTOP", "MOBILE"],
    screen_kind: "PRIMARY_SCREEN",
    state: "DEFAULT",
    auth_required: false,
    rbac_permissions: [],
    facility_scope: false,
    department_scope: null,
    reachable: "REACHABLE",
    reachability_evidence: "GET/POST preferred datetime; no_slots_published honesty",
    partials: ["partials/booking-wizard-progress.ejs", "partials/booking-summary.ejs"],
    client_js: ["public/activeclinic/ac-public.js"],
    implementation_substance: "FUNCTIONAL",
    notes: "Phase 5A preferred-time step (not live slots)",
  },
  {
    surface: "BOOKING",
    functional_area: "PROCEDURE_BOOKING",
    route_method: "GET",
    route_path: "/clinics/:clinicKey/book/procedures/:procedureKey/patient",
    route_file: "src/activeclinic/http/activeClinicPublicBookingRoutes.js",
    handler: "procedurePatientStep",
    view_path: "views/activeclinic/booking/procedure-patient.ejs",
    layout: "layouts/public-shell.ejs",
    device_support: ["DESKTOP", "MOBILE"],
    screen_kind: "PRIMARY_SCREEN",
    state: "DEFAULT",
    auth_required: false,
    rbac_permissions: [],
    facility_scope: false,
    department_scope: null,
    reachable: "REACHABLE",
    reachability_evidence: "GET/POST patient step; shared phone-field",
    partials: [
      "partials/booking-wizard-progress.ejs",
      "partials/booking-summary.ejs",
      "partials/phone-field.ejs",
      "partials/sms-honesty-note.ejs",
    ],
    client_js: ["public/activeclinic/ac-public.js", "public/activeclinic/ac-phone-field.js"],
    implementation_substance: "FUNCTIONAL",
    notes: "Phase 5A patient details step",
  },
  {
    surface: "BOOKING",
    functional_area: "PROCEDURE_BOOKING",
    route_method: "GET",
    route_path: "/clinics/:clinicKey/book/procedures/:procedureKey/review",
    route_file: "src/activeclinic/http/activeClinicPublicBookingRoutes.js",
    handler: "procedureReviewStep",
    view_path: "views/activeclinic/booking/procedure-review.ejs",
    layout: "layouts/public-shell.ejs",
    device_support: ["DESKTOP", "MOBILE"],
    screen_kind: "PRIMARY_SCREEN",
    state: "DEFAULT",
    auth_required: false,
    rbac_permissions: [],
    facility_scope: false,
    department_scope: null,
    reachable: "REACHABLE",
    reachability_evidence: "GET review + POST submit; pending confirmation wording",
    partials: ["partials/booking-wizard-progress.ejs", "partials/sms-honesty-note.ejs"],
    client_js: ["public/activeclinic/ac-public.js"],
    implementation_substance: "FUNCTIONAL",
    notes: "Phase 5A review before submit",
  },
];

// Former 16 PARTIAL rows — remap after wizard
const REMAP = {
  // Preparation states → info prep section + progress
  bb4906f130374a72a21596d427c2af9d: {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-info.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A: preparation configured/empty states on info step",
  },
  // Form states → patient/time validation across wizard
  "2d5d9db651e046eabb65fdbc89b676e2": {
    mapping_type: "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
    views: [
      "views/activeclinic/booking/procedure-patient.ejs",
      "views/activeclinic/booking/procedure-time.ejs",
    ],
    routes: [
      "/clinics/:clinicKey/book/procedures/:procedureKey/patient",
      "/clinics/:clinicKey/book/procedures/:procedureKey/time",
    ],
    notes: "Phase 5A: form validation states on patient/time steps",
  },
  // Procedure information desktop
  ea6f77fad9444fa3b3f04cf5178f9c72: {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    views: ["views/activeclinic/booking/procedure-info.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A dedicated procedure information step",
  },
  // Procedure information mobile
  d033da337b5740f29b4681042ab4a99c: {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-info.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A mobile info shares procedure-info route",
  },
  // Mobile summary pattern
  ffc4c24bcadd4b919bdb573d7d06681c: {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/partials/booking-summary.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A shared booking-summary on procedure wizard steps",
  },
  // Patient details desktop
  "2a64a22146ed4b2ca704d01d9cb18383": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    views: ["views/activeclinic/booking/procedure-patient.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/patient"],
    notes: "Phase 5A dedicated patient step",
  },
  // Patient details mobile
  d2c8f78719484d7ca4d443f844f83929: {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-patient.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/patient"],
    notes: "Phase 5A mobile patient shares procedure-patient",
  },
  // Progress patterns
  "82a454047e064592b763896f815aa721": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/partials/booking-wizard-progress.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A PROCEDURE_WIZARD_STEPS progress partial",
  },
  // Review desktop
  e04f78111c6a43eb851a0db24cc2f001: {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    views: ["views/activeclinic/booking/procedure-review.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/review"],
    notes: "Phase 5A dedicated review step",
  },
  // Review mobile
  "6da5390fcac44722a37ae34f2ae82a11": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-review.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/review"],
    notes: "Phase 5A mobile review shares procedure-review",
  },
  // SMS states
  "9a4b08f02d2b4cc990eab7b16b4202aa": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/partials/sms-honesty-note.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey"],
    notes: "Phase 5A SMS honesty note on wizard steps",
  },
  // Referral upload states — honest gap, no fake upload
  ef1d0961e88e43549af5361a5fb9320c: {
    mapping_type: "PRODUCT_DECISION_DIFFERENCE",
    views: ["views/activeclinic/booking/procedure-referral.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/referral"],
    product_difference:
      "Stitch shows referral upload UI states; V7 has no secure public upload storage — honesty banner only",
    notes: "Phase 5A: referral step exists; upload remains product/backend gap",
  },
  // Referral clarification mobile
  "72428671e0fa4317bad44d3ccf367ea8": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-referral.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/referral"],
    notes: "Phase 5A referral clarification/honesty messaging",
  },
  // Referral requirements desktop
  "7377b7ca51e049048c10e34af2950bac": {
    mapping_type: "EXACT_IMPLEMENTATION_MATCH",
    views: ["views/activeclinic/booking/procedure-referral.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/referral"],
    notes: "Phase 5A dedicated referral requirements step",
  },
  // Referral requirements mobile
  "28dd3dae170e43f88902aa3a1f26cdfe": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-referral.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/referral"],
    notes: "Phase 5A mobile referral shares procedure-referral",
  },
  // Resource availability — request-based on time step (not live grid)
  "95f3a0fc88f7490fbd7d46e649e6b61e": {
    mapping_type: "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
    views: ["views/activeclinic/booking/procedure-time.ejs"],
    routes: ["/clinics/:clinicKey/book/procedures/:procedureKey/time"],
    notes:
      "Phase 5A: request-based availability banner on time step; live slot PRODUCT_DECISION remains separate",
  },
};

function main() {
  const beforeMap = JSON.parse(fs.readFileSync(MAP_JSON, "utf8"));
  const beforeP25 = p25Counts(beforeMap.mappings);
  const beforeOverall = beforeMap.counts.stitch_screen_coverage;

  const impl = JSON.parse(fs.readFileSync(IMPL_JSON, "utf8"));

  // Retarget combined entry → info
  for (const s of impl.screens) {
    if (
      s.view_path === "views/activeclinic/booking/procedure-entry.ejs" &&
      s.route_path === "/clinics/:clinicKey/book/procedures/:procedureKey"
    ) {
      if (s.state === "DEFAULT" || s.implementation_id === "ACV7-IMPL-0043") {
        s.view_path = "views/activeclinic/booking/procedure-info.ejs";
        s.handler = "procedureInfoStep";
        s.notes = "Phase 5A: procedure information wizard step (was combined entry)";
        s.partials = [
          "partials/booking-wizard-progress.ejs",
          "partials/booking-summary.ejs",
          "partials/sms-honesty-note.ejs",
        ];
        s.reachability_evidence = "GET/POST info step; preparation ack; Phase 5A tests";
      } else if (s.state === "VALIDATION_ERROR" || s.implementation_id === "ACV7-IMPL-0045") {
        s.view_path = "views/activeclinic/booking/procedure-patient.ejs";
        s.route_path = "/clinics/:clinicKey/book/procedures/:procedureKey/patient";
        s.handler = "procedurePatientStep";
        s.notes = "Phase 5A: validation errors re-render step views (patient representative)";
        s.reachability_evidence = "POST patient with errors; data-ac-form-state=validation_error";
      }
    }
    if (
      s.implementation_id === "ACV7-IMPL-0046" &&
      String(s.route_path || "").includes("book/procedures")
    ) {
      s.route_path = "/clinics/:clinicKey/book/procedures/:procedureKey/submit";
      s.handler = "procedureSubmit";
      s.notes = "Phase 5A: submit from review; request-submitted confirmation";
      s.reachability_evidence = "POST submit clears draft; pending confirmation status";
    }
  }

  const existing = new Set(impl.screens.map((s) => `${s.route_path}::${s.view_path}`));
  const idFor = nextImplId(impl.screens);
  let n = 1;
  const added = [];
  for (const screen of NEW_SCREENS) {
    const key = `${screen.route_path}::${screen.view_path}`;
    if (existing.has(key)) continue;
    const record = { implementation_id: idFor(n++), ...screen };
    impl.screens.push(record);
    added.push(record);
    existing.add(key);
  }

  impl.generated_at = NOW;
  impl.phase5a_update = {
    added_count: added.length,
    note: "P25 procedure booking multi-step wizard",
  };
  if (impl.integrity) {
    impl.integrity.implementation_screen_state_records = impl.screens.length;
  }

  const byView = {};
  for (const s of impl.screens) {
    if (!byView[s.view_path]) byView[s.view_path] = [];
    byView[s.view_path].push(s.implementation_id);
  }

  const map = beforeMap;
  let remapped = 0;
  for (const row of map.mappings) {
    const spec = REMAP[row.stitch_screen_id];
    if (!spec) continue;
    const implIds = [];
    for (const vp of spec.views) {
      for (const id of byView[vp] || []) implIds.push(id);
    }
    row.mapping_type = spec.mapping_type;
    row.mapping_confidence = "HIGH";
    row.implementation_ids = [...new Set(implIds)];
    row.route_paths = spec.routes;
    row.view_paths = spec.views;
    row.implementation_states = ["DEFAULT"];
    row.device_support = ["DESKTOP", "MOBILE"];
    row.missing_requirement = null;
    row.product_difference = spec.product_difference || null;
    row.evidence = `Phase 5A: ${spec.routes.join(" | ")} / ${spec.views.join(" | ")}`;
    row.notes = spec.notes;
    remapped += 1;
  }

  const counts = recount(map.mappings);
  const afterP25 = p25Counts(map.mappings);
  map.generated_at = NOW;
  map.counts = counts;
  map.phase5a_remap = {
    remapped_former_p25_partials: remapped,
    expected: 16,
    p25_before: beforeP25,
    p25_after: afterP25,
    overall_before: beforeOverall,
    overall_after: counts.stitch_screen_coverage,
  };
  if (map.inputs) {
    map.inputs.implementation_records = impl.screens.length;
  }

  fs.writeFileSync(IMPL_JSON, JSON.stringify(impl, null, 2) + "\n");
  fs.writeFileSync(MAP_JSON, JSON.stringify(map, null, 2) + "\n");
  writeImplCsv(impl.screens);
  writeMapCsv(map.mappings);

  const area = {};
  for (const s of impl.screens) area[s.functional_area] = (area[s.functional_area] || 0) + 1;
  fs.writeFileSync(
    IMPL_MD,
    `# ActiveClinic V7 Implementation Raw Inventory

**Generated:** ${NOW}  
**Phase 5A:** P25 procedure booking wizard steps added

| Metric | Count |
|--------|------:|
| Implementation records | ${impl.screens.length} |
| Phase 5A added | ${added.length} |

HEAD \`${HEAD}\`
`
  );

  const typeRows = Object.entries(counts.mapping_type)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| ${k} | ${v} |`)
    .join("\n");
  fs.writeFileSync(
    MAP_MD,
    `# ActiveClinic Stitch → V7 Implementation Mapping

**Generated:** ${NOW}  
**Phase 5A:** remapped former P25 PARTIAL_IMPLEMENTATION rows

## Overall coverage

| Bucket | Before | After |
|--------|-------:|------:|
| Full | ${beforeOverall.full} | ${counts.stitch_screen_coverage.full} |
| Partial | ${beforeOverall.partial} | ${counts.stitch_screen_coverage.partial} |
| Missing | ${beforeOverall.missing} | ${counts.stitch_screen_coverage.missing} |

## P25 coverage

| Bucket | Before | After |
|--------|-------:|------:|
| Full | ${beforeP25.full} | ${afterP25.full} |
| Partial | ${beforeP25.partial} | ${afterP25.partial} |
| Product differences | ${beforeP25.product} | ${afterP25.product} |
| Missing | ${beforeP25.missing} | ${afterP25.missing} |

## mapping_type

| mapping_type | Count |
|--------------|------:|
${typeRows}

HEAD \`${HEAD}\`
`
  );

  console.log(
    JSON.stringify(
      {
        added,
        impl_total: impl.screens.length,
        remapped,
        p25_before: beforeP25,
        p25_after: afterP25,
        overall_before: beforeOverall,
        overall_after: counts.stitch_screen_coverage,
        still_partial_p25: map.mappings
          .filter(
            (r) =>
              r.stitch_phase === "P25" && r.mapping_type === "PARTIAL_IMPLEMENTATION"
          )
          .map((r) => ({ id: r.stitch_screen_id, title: r.stitch_screen_title })),
        p25_product: map.mappings
          .filter(
            (r) =>
              r.stitch_phase === "P25" &&
              r.mapping_type === "PRODUCT_DECISION_DIFFERENCE"
          )
          .map((r) => ({ id: r.stitch_screen_id, title: r.stitch_screen_title })),
      },
      null,
      2
    )
  );
}

main();
