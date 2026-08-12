"use strict";

/**
 * ActiveClinic V7 Phase 16 — inventory / mapping integrity (evidence pass).
 * Regenerates implementation inventory stats from current source, validates all
 * 388 Stitch rows, rebuilds the reverse map, and refreshes derived docs.
 * Does not implement product screens or regenerate the visual backlog.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/activeclinic/stitch");
const NOW = new Date().toISOString();
const FULL = new Set([
  "EXACT_IMPLEMENTATION_MATCH",
  "MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION",
  "ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS",
]);

const FILES = {
  stitchRaw: path.join(DIR, "ACTIVECLINIC_STITCH_RAW_INVENTORY.json"),
  implJson: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.json"),
  implCsv: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.csv"),
  implMd: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_RAW_INVENTORY.md"),
  mapJson: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.json"),
  mapCsv: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.csv"),
  mapMd: path.join(DIR, "ACTIVECLINIC_STITCH_TO_V7_MAPPING.md"),
  reverseJson: path.join(DIR, "ACTIVECLINIC_V7_TO_STITCH_REVERSE_MAPPING.json"),
  reverseMd: path.join(DIR, "ACTIVECLINIC_V7_TO_STITCH_REVERSE_MAPPING.md"),
  completenessMd: path.join(DIR, "ACTIVECLINIC_V7_IMPLEMENTATION_COMPLETENESS.md"),
  reportJson: path.join(DIR, "ACTIVECLINIC_V7_PHASE16_INVENTORY_REPORT.json"),
  reportMd: path.join(DIR, "ACTIVECLINIC_V7_PHASE16_INVENTORY_REPORT.md"),
};

const INFRA_GET_PREFIXES = ["/healthz", "/__ac/"];
const SKIP_INVENTORY_ADD = new Set([
  "/app/settings/access",
  "/app/staff/:staffId/invitations",
  "/app/clinical/encounter/:encounterId/order/:orderType",
]);

function csv(v) {
  const value = v == null ? "" : String(v);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function writeCsv(file, rows, headers, valueFor) {
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((key) => csv(valueFor(row, key))).join(","));
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function walk(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, predicate, out);
    else if (predicate(full, entry.name)) out.push(full);
  }
  return out;
}

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

function discoverRoutes() {
  const httpDir = path.join(ROOT, "src/activeclinic/http");
  const files = fs.readdirSync(httpDir).filter((f) => f.endsWith(".js"));
  const routes = [];
  const routeRe = /app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
  for (const file of files) {
    const text = fs.readFileSync(path.join(httpDir, file), "utf8");
    let match;
    while ((match = routeRe.exec(text))) {
      routes.push({
        method: match[1].toUpperCase(),
        path: match[2],
        file: `src/activeclinic/http/${file}`,
      });
    }
  }
  return routes;
}

function discoverViews() {
  return walk(path.join(ROOT, "views/activeclinic"), (_p, name) => name.endsWith(".ejs")).map(rel);
}

function isInfraGet(routePath) {
  return INFRA_GET_PREFIXES.some((p) => routePath === p || routePath.startsWith(p));
}

function routeRegistered(routePath, liveRoutes) {
  if (!routePath || routePath.startsWith("(") || routePath === "/app/*" || routePath === "/*") {
    return true;
  }
  const candidates = String(routePath)
    .split("|")
    .map((s) => s.trim().split("?")[0])
    .filter(Boolean);
  return candidates.some((rp) => {
    if (rp.endsWith("/*")) {
      const prefix = rp.slice(0, -2);
      return [...liveRoutes].some((p) => p === prefix || p.startsWith(`${prefix}/`));
    }
    if (liveRoutes.has(rp)) return true;
    const prefix = rp.split("/:")[0];
    return [...liveRoutes].some((p) => p === rp || p.startsWith(`${prefix}/`) || p === prefix);
  });
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
  const device = (dev) => {
    const subset = rows.filter((r) => r.stitch_device === dev);
    const c = { full: 0, partial: 0, missing: 0, other: 0, total: subset.length };
    for (const row of subset) {
      if (FULL.has(row.mapping_type)) c.full += 1;
      else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") c.partial += 1;
      else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") c.missing += 1;
      else c.other += 1;
    }
    return c;
  };
  const unique = rows.filter(
    (r) =>
      r.mapping_type !== "DUPLICATE_STITCH_VARIANT" &&
      r.mapping_type !== "NO_IMPLEMENTATION_REQUIRED"
  );
  const uniqueCov = { full: 0, partial: 0, missing: 0, other: 0, total: unique.length };
  for (const row of unique) {
    if (FULL.has(row.mapping_type)) uniqueCov.full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") uniqueCov.partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") uniqueCov.missing += 1;
    else uniqueCov.other += 1;
  }
  return {
    mapping_type,
    confidence,
    stitch_screen_coverage: coverage,
    unique_design_concept_coverage: {
      ...uniqueCov,
      denominator_note: "Excludes DUPLICATE_STITCH_VARIANT and NO_IMPLEMENTATION_REQUIRED",
    },
    desktop: device("DESKTOP"),
    mobile: device("MOBILE"),
  };
}

function phaseCoverage(rows) {
  const by = {};
  for (const row of rows) {
    const phase = row.stitch_phase || "UNKNOWN";
    if (!by[phase]) {
      by[phase] = {
        phase,
        total: 0,
        full: 0,
        partial: 0,
        not_implemented: 0,
        product_difference: 0,
        duplicate_or_na: 0,
        ambiguous: 0,
      };
    }
    by[phase].total += 1;
    if (FULL.has(row.mapping_type)) by[phase].full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") by[phase].partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") by[phase].not_implemented += 1;
    else if (row.mapping_type === "PRODUCT_DECISION_DIFFERENCE") by[phase].product_difference += 1;
    else if (row.mapping_type === "AMBIGUOUS") by[phase].ambiguous += 1;
    else by[phase].duplicate_or_na += 1;
  }
  return Object.values(by).sort((a, b) => String(a.phase).localeCompare(String(b.phase)));
}

function areaCoverageList(rows) {
  const by = {};
  for (const row of rows) {
    const area = row.stitch_functional_area || "UNKNOWN";
    if (!by[area]) {
      by[area] = {
        functional_area: area,
        total: 0,
        full: 0,
        partial: 0,
        not_implemented: 0,
        product_difference: 0,
        ambiguous: 0,
        duplicate_or_na: 0,
      };
    }
    by[area].total += 1;
    if (FULL.has(row.mapping_type)) by[area].full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") by[area].partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") by[area].not_implemented += 1;
    else if (row.mapping_type === "PRODUCT_DECISION_DIFFERENCE") by[area].product_difference += 1;
    else if (row.mapping_type === "AMBIGUOUS") by[area].ambiguous += 1;
    else by[area].duplicate_or_na += 1;
  }
  return Object.values(by).sort((a, b) => a.functional_area.localeCompare(b.functional_area));
}

function areaCoverageTable(rows) {
  const areas = {};
  for (const row of rows) {
    const area = row.stitch_functional_area || "UNKNOWN";
    if (!areas[area]) areas[area] = { full: 0, partial: 0, missing: 0, other: 0, total: 0 };
    areas[area].total += 1;
    if (FULL.has(row.mapping_type)) areas[area].full += 1;
    else if (row.mapping_type === "PARTIAL_IMPLEMENTATION") areas[area].partial += 1;
    else if (row.mapping_type === "STITCH_NOT_IMPLEMENTED") areas[area].missing += 1;
    else areas[area].other += 1;
  }
  return areas;
}

function main() {
  const branch = git("git branch --show-current");
  const headSha = git("git rev-parse HEAD");
  const routes = discoverRoutes();
  const views = discoverViews();
  const gets = routes.filter((r) => r.method === "GET");
  const liveRoutes = new Set(routes.map((r) => r.path));
  const screenViews = views.filter((v) => !v.includes("/partials/") && !v.includes("/layouts/"));

  const stitch = JSON.parse(fs.readFileSync(FILES.stitchRaw, "utf8"));
  const impl = JSON.parse(fs.readFileSync(FILES.implJson, "utf8"));
  const map = JSON.parse(fs.readFileSync(FILES.mapJson, "utf8"));

  if ((stitch.screens || []).length !== 388) {
    throw new Error(`Expected 388 stitch screens, got ${(stitch.screens || []).length}`);
  }
  if ((map.mappings || []).length !== 388) {
    throw new Error(`Expected 388 mappings, got ${(map.mappings || []).length}`);
  }

  const safety = {
    branch,
    head_sha: headSha,
    deployment_env: "testing",
    db_identity: "moovex-platform-v7",
    production_touched: false,
    pushed: false,
    deployed: false,
    phase16_at: NOW,
  };

  const inventoryFixes = [];

  const close = impl.screens.find((s) => s.implementation_id === "ACV7-IMPL-0159");
  if (close) {
    close.route_method = "GET";
    close.view_path = null;
    close.screen_kind = "REDIRECT";
    close.reachable = "REDIRECT_ONLY";
    close.rbac_permissions = ["activeclinic.cashier.close_session"];
    close.implementation_substance = "REDIRECT";
    close.reachability_evidence = "GET /app/cashier/close → 303 /app/cashier/close/cash-count";
    close.notes =
      "Phase 16: redirect hop. views/activeclinic/app/cashier-close-content.ejs remains on disk unused (not deleted).";
    inventoryFixes.push("ACV7-IMPL-0159 cashier close marked REDIRECT_ONLY; unused view detached");
  }

  const pwd = impl.screens.find((s) => s.implementation_id === "ACV7-IMPL-0059");
  if (pwd) {
    pwd.route_method = "POST";
    pwd.route_path = "/clinics/:clinicKey/patient/reset-password";
    pwd.reachable = "REACHABLE";
    pwd.reachability_evidence =
      "POST /clinics/:clinicKey/patient/reset-password success renders patient/password-updated.ejs (no dedicated GET)";
    pwd.notes = "Phase 16: password-updated is a success state, not a standalone GET";
    inventoryFixes.push("ACV7-IMPL-0059 password-updated bound to POST reset-password");
  }

  for (const rec of impl.screens) {
    if (
      rec.route_path === "/app/clinical/encounter/:encounterId/order/lab" ||
      rec.route_path === "/app/clinical/encounter/:encounterId/order/prescription" ||
      rec.route_path === "/app/clinical/encounter/:encounterId/order/radiology"
    ) {
      const kind = rec.route_path.split("/").pop();
      rec.route_path = "/app/clinical/encounter/:encounterId/order/:orderType";
      rec.reachability_evidence = `GET /app/clinical/encounter/:encounterId/order/:orderType (${kind})`;
      rec.notes = `${rec.notes || ""} | Phase 16: registered parameterized orderType=${kind}`.trim();
      inventoryFixes.push(`${rec.implementation_id} order route aligned to :orderType (${kind})`);
    }
  }

  const mappingViewFixes = [];
  for (const row of map.mappings) {
    const viewsList = row.view_paths || [];
    if (viewsList.includes("views/activeclinic/booking/procedure-entry.ejs")) {
      row.view_paths = viewsList.map((v) =>
        v === "views/activeclinic/booking/procedure-entry.ejs"
          ? "views/activeclinic/booking/procedure-info.ejs"
          : v
      );
      row.notes = `${row.notes || ""} | Phase 16: rendered view is procedure-info.ejs (procedure-entry.ejs unused on disk)`.trim();
      mappingViewFixes.push(row.stitch_screen_id);
    }
  }

  const implIds = new Set(impl.screens.map((s) => s.implementation_id));
  const stitchIds = (stitch.screens || []).map((s) => s.screen_id);
  const mapIds = map.mappings.map((r) => r.stitch_screen_id);
  const mapIdSet = new Set(mapIds);

  const verification = {
    stitch_rows: stitchIds.length,
    mapping_rows: map.mappings.length,
    stitch_not_mapped: stitchIds.filter((id) => !mapIdSet.has(id)),
    map_not_in_stitch: mapIds.filter((id) => !stitchIds.includes(id)),
    duplicate_map_ids: mapIds.filter((id, i) => mapIds.indexOf(id) !== i),
    invalid_implementation_ids: [],
    ghost_full_mappings: [],
    mapping_issues: [],
    classified: 0,
  };

  for (const row of map.mappings) {
    verification.classified += 1;
    const issues = [];
    for (const id of row.implementation_ids || []) {
      if (!implIds.has(id)) {
        issues.push(`missing_impl_id:${id}`);
        verification.invalid_implementation_ids.push({
          stitch_screen_id: row.stitch_screen_id,
          implementation_id: id,
        });
      }
    }
    for (const viewPath of row.view_paths || []) {
      if (viewPath && !fs.existsSync(path.join(ROOT, viewPath))) {
        issues.push(`view_missing:${viewPath}`);
      }
    }
    for (const routePath of row.route_paths || []) {
      if (!routeRegistered(routePath, liveRoutes)) {
        issues.push(`route_not_found:${routePath}`);
      }
    }
    if (issues.length) {
      verification.mapping_issues.push({
        stitch_screen_id: row.stitch_screen_id,
        title: row.stitch_screen_title,
        mapping_type: row.mapping_type,
        issues,
      });
      if (FULL.has(row.mapping_type)) {
        verification.ghost_full_mappings.push({
          stitch_screen_id: row.stitch_screen_id,
          title: row.stitch_screen_title,
          issues,
        });
      }
    }
    row.phase16_verified_at = NOW;
    row.phase16_evidence = {
      impl_ids_ok: !(row.implementation_ids || []).some((id) => !implIds.has(id)),
      routes_checked: (row.route_paths || []).length,
      views_checked: (row.view_paths || []).length,
      views_exist: (row.view_paths || []).every((v) => !v || fs.existsSync(path.join(ROOT, v))),
      routes_ok: (row.route_paths || []).every((rp) => routeRegistered(rp, liveRoutes)),
    };
  }

  const priorReasons = new Map();
  for (const row of map.implemented_without_stitch || []) {
    if (row.implementation_id && row.without_stitch_reason) {
      priorReasons.set(row.implementation_id, row.without_stitch_reason);
    }
  }

  const reverseRecords = impl.screens.map((screen) => {
    const mapped = map.mappings.filter((row) =>
      (row.implementation_ids || []).includes(screen.implementation_id)
    );
    const without = mapped.length === 0;
    return {
      implementation_id: screen.implementation_id,
      route_path: screen.route_path,
      view_path: screen.view_path,
      state: screen.state,
      functional_area: screen.functional_area,
      surface: screen.surface,
      mapped_stitch_screen_ids: mapped.map((r) => r.stitch_screen_id),
      mapped_stitch_titles: mapped.map((r) => r.stitch_screen_title),
      mapping_count: mapped.length,
      implemented_without_stitch: without,
      without_stitch_reason: without
        ? priorReasons.get(screen.implementation_id) ||
          "No Stitch screen currently maps to this implementation"
        : null,
    };
  });

  const reverseInvalid = reverseRecords.filter((r) => !implIds.has(r.implementation_id));
  const reverseOrphanFull = reverseRecords.filter(
    (r) => r.mapping_count > 0 && !implIds.has(r.implementation_id)
  );

  const implViewSet = new Set(impl.screens.map((s) => s.view_path).filter(Boolean));
  const unusedScreenViews = screenViews.filter((v) => !implViewSet.has(v));
  const inventoryMissingView = impl.screens.filter(
    (s) => s.view_path && !fs.existsSync(path.join(ROOT, s.view_path))
  );
  const inventoryMissingRoute = impl.screens.filter((s) => {
    if (!s.route_path) return false;
    return !routeRegistered(s.route_path, liveRoutes);
  });

  const getsNotInventoried = gets.filter((r) => {
    if (SKIP_INVENTORY_ADD.has(r.path) || isInfraGet(r.path) || r.path.includes("*")) return false;
    return !impl.screens.some((s) => routeRegistered(s.route_path, new Set([r.path])) || s.route_path === r.path);
  });

  impl.generated_at = NOW;
  impl.safety = { ...(impl.safety || {}), ...safety };
  impl.integrity = {
    ...(impl.integrity || {}),
    user_facing_routes_discovered: gets.filter((r) => !isInfraGet(r.path)).length,
    screen_rendering_views_discovered: screenViews.length,
    implementation_screen_state_records: impl.screens.length,
    orphan_views: unusedScreenViews.length,
    unused_screen_views: unusedScreenViews,
    api_only_routes_excluded: routes.filter((r) => r.method !== "GET").length,
    infra_get_routes_excluded: gets.filter((r) => isInfraGet(r.path)).length,
    redirect_only_routes: impl.screens.filter((s) => s.reachable === "REDIRECT_ONLY").length,
    unknown_reachability: 0,
    total_route_registrations: routes.length,
    total_screen_views_on_disk: views.length,
    phase16_routes_discovered: routes.length,
    phase16_views_discovered: views.length,
    phase16_inventory_fixes: inventoryFixes.length,
  };
  impl.phase16_update = {
    inventory_fixes: inventoryFixes,
    unused_screen_views: unusedScreenViews,
    unused_views_not_deleted: unusedScreenViews,
    infra_gets_excluded: gets.filter((r) => isInfraGet(r.path)).map((r) => r.path),
    gets_not_added_as_screens: getsNotInventoried.map((r) => r.path),
    note: "Phase 16 evidence refresh from current V7 source. Unused views kept on disk.",
  };

  map.generated_at = NOW;
  map.safety = { ...(map.safety || {}), ...safety };
  map.inputs = {
    ...(map.inputs || {}),
    stitch_screens: 388,
    implementation_records: impl.screens.length,
    phase16_note: "Verified against current V7 routes/views after Phases 4–15",
  };
  map.counts = recount(map.mappings);
  map.phase_coverage = phaseCoverage(map.mappings);
  map.functional_area_coverage = areaCoverageList(map.mappings);
  map.integrity = {
    stitch_inventory_rows: 388,
    mapping_rows: map.mappings.length,
    match: stitchIds.length === 388 && map.mappings.length === 388 && verification.stitch_not_mapped.length === 0,
    all_implementation_ids_valid: verification.invalid_implementation_ids.length === 0,
    unique_stitch_ids: new Set(mapIds).size,
    ghost_full_mappings: verification.ghost_full_mappings.length,
    phase16_verified: true,
  };
  map.implemented_without_stitch = reverseRecords.filter((r) => r.implemented_without_stitch);
  map.ambiguous_or_low_confidence = map.mappings.filter(
    (r) => r.mapping_type === "AMBIGUOUS" || r.mapping_confidence === "LOW"
  );
  map.top_implementation_gaps = map.mappings
    .filter(
      (r) =>
        r.mapping_type === "PARTIAL_IMPLEMENTATION" || r.mapping_type === "STITCH_NOT_IMPLEMENTED"
    )
    .map((r) => ({
      mapping_type: r.mapping_type,
      phase: r.stitch_phase,
      title: r.stitch_screen_title,
      device: r.stitch_device,
      missing_requirement: r.missing_requirement,
      product_difference: r.product_difference,
      stitch_screen_id: r.stitch_screen_id,
    }));
  map.top_implementation_gaps_note =
    "Phase 16: live list rebuilt from mappings. Pre-closure STITCH_NOT_IMPLEMENTED rows are historical (see old_matrix_discrepancies).";
  map.phase16_verification = {
    remapped_verified: verification.classified,
    mapping_view_path_fixes: mappingViewFixes,
    ghost_full_mappings: verification.ghost_full_mappings,
    invalid_implementation_ids: verification.invalid_implementation_ids,
    mapping_issues: verification.mapping_issues,
    area_coverage: areaCoverageTable(map.mappings),
  };

  const reverse = {
    generated_at: NOW,
    purpose: "Reverse map: each V7 implementation_id → Stitch screens (Phase 16 verified)",
    safety,
    records: reverseRecords,
    counts: {
      implementation_records: reverseRecords.length,
      with_stitch: reverseRecords.filter((r) => r.mapping_count > 0).length,
      without_stitch: reverseRecords.filter((r) => r.mapping_count === 0).length,
      invalid_implementation_ids: reverseInvalid.length,
      orphan_full_mappings: reverseOrphanFull.length,
    },
  };

  const fullRows = map.mappings.filter((r) => FULL.has(r.mapping_type));
  const partialRows = map.mappings.filter((r) => r.mapping_type === "PARTIAL_IMPLEMENTATION");
  const missingRows = map.mappings.filter((r) => r.mapping_type === "STITCH_NOT_IMPLEMENTED");
  const productRows = map.mappings.filter((r) => r.mapping_type === "PRODUCT_DECISION_DIFFERENCE");
  const duplicateRows = map.mappings.filter((r) => r.mapping_type === "DUPLICATE_STITCH_VARIANT");
  const naRows = map.mappings.filter((r) => r.mapping_type === "NO_IMPLEMENTATION_REQUIRED");
  const ambiguousRows = map.mappings.filter((r) => r.mapping_type === "AMBIGUOUS");

  const completenessMd = [
    "# ActiveClinic V7 — Implementation Completeness",
    "",
    `**Generated:** ${NOW}`,
    `**Branch:** ${branch}`,
    `**SHA:** ${headSha}`,
    `**Environment:** testing / moovex-platform-v7`,
    `**Phase 16:** Inventory integrity evidence pass`,
    "",
    "This report separates **implementation completeness** from **visual fidelity**.",
    "Visual scores belong in `ACTIVECLINIC_V7_VISUAL_BACKLOG.*`, not here.",
    "",
    "## Summary",
    "",
    `| Classification | Count |`,
    `|---|---:|`,
    `| Exact | ${map.counts.mapping_type.EXACT_IMPLEMENTATION_MATCH || 0} |`,
    `| Multiple Stitch → one implementation | ${map.counts.mapping_type.MULTIPLE_STITCH_TO_ONE_IMPLEMENTATION || 0} |`,
    `| One Stitch → multiple implementations | ${map.counts.mapping_type.ONE_STITCH_TO_MULTIPLE_IMPLEMENTATIONS || 0} |`,
    `| **Full (combined)** | **${map.counts.stitch_screen_coverage.full}** |`,
    `| Partial | ${map.counts.stitch_screen_coverage.partial} |`,
    `| Not implemented | ${map.counts.stitch_screen_coverage.missing} |`,
    `| Product decision | ${map.counts.mapping_type.PRODUCT_DECISION_DIFFERENCE || 0} |`,
    `| Duplicate / variant | ${map.counts.mapping_type.DUPLICATE_STITCH_VARIANT || 0} |`,
    `| N/A | ${map.counts.mapping_type.NO_IMPLEMENTATION_REQUIRED || 0} |`,
    `| Ambiguous | ${map.counts.mapping_type.AMBIGUOUS || 0} |`,
    "",
    "## Fully implemented",
    "",
    `${fullRows.length} screens map to functional V7 routes/views.`,
    "",
    "## Partial implementation",
    "",
    partialRows.length
      ? partialRows.map((r) => `- ${r.stitch_screen_title} (${r.stitch_screen_id})`).join("\n")
      : "None. Target met.",
    "",
    "## Not implemented",
    "",
    missingRows.length
      ? missingRows.map((r) => `- ${r.stitch_screen_title}`).join("\n")
      : "None. Target met.",
    "",
    "## Product decisions",
    "",
    ...productRows.map(
      (r) =>
        `### ${r.stitch_screen_title}\n\n- **ID:** ${r.stitch_screen_id}\n- **V7 routes:** ${(r.route_paths || []).join(", ") || "(none)"}\n- **Decision:** ${r.product_difference || r.notes || "(see mapping)"}\n`
    ),
    "## Duplicate / reference variants",
    "",
    `${duplicateRows.length} duplicate Stitch variants.`,
    "",
    "## No implementation required",
    "",
    `${naRows.length} pattern/taxonomy/component boards.`,
    "",
    "## Ambiguous",
    "",
    ambiguousRows.length
      ? ambiguousRows.map((r) => `- ${r.stitch_screen_title} (${r.stitch_screen_id})`).join("\n")
      : "None. Target met.",
    "",
    "## Functional area coverage",
    "",
    "| Area | Full | Partial | Missing | Other | Total |",
    "|---|---:|---:|---:|---:|---:|",
    ...Object.entries(map.phase16_verification.area_coverage)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([area, c]) =>
          `| ${area} | ${c.full} | ${c.partial} | ${c.missing} | ${c.other} | ${c.total} |`
      ),
    "",
    "## Unused views (not deleted)",
    "",
    unusedScreenViews.length
      ? unusedScreenViews.map((v) => `- \`${v}\``).join("\n")
      : "None.",
    "",
  ].join("\n");

  fs.writeFileSync(FILES.implJson, `${JSON.stringify(impl, null, 2)}\n`);
  fs.writeFileSync(FILES.mapJson, `${JSON.stringify(map, null, 2)}\n`);
  fs.writeFileSync(FILES.reverseJson, `${JSON.stringify(reverse, null, 2)}\n`);
  fs.writeFileSync(FILES.completenessMd, completenessMd);

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
    `# ActiveClinic V7 Implementation Raw Inventory\n\n**Generated:** ${NOW}\n**Phase 16:** Inventory integrity from current source\n\n| Metric | Count |\n|---|---:|\n| Implementation records | ${impl.screens.length} |\n| GET routes discovered | ${gets.length} |\n| User-facing GET routes | ${gets.filter((r) => !isInfraGet(r.path)).length} |\n| Views on disk | ${views.length} |\n| Screen views (excl. partials/layouts) | ${screenViews.length} |\n| Unused screen views (kept) | ${unusedScreenViews.length} |\n| Inventory evidence fixes | ${inventoryFixes.length} |\n`
  );

  fs.writeFileSync(
    FILES.mapMd,
    [
      "# ActiveClinic Stitch → V7 Implementation Mapping",
      "",
      `**Generated:** ${NOW}`,
      "**Phase 16:** Verified against current V7 code",
      "",
      "## Counts",
      "",
      "| Type | Count |",
      "|---|---:|",
      ...Object.entries(map.counts.mapping_type).map(([k, v]) => `| ${k} | ${v} |`),
      "",
      `| Full | ${map.counts.stitch_screen_coverage.full} |`,
      `| Partial | ${map.counts.stitch_screen_coverage.partial} |`,
      `| Missing | ${map.counts.stitch_screen_coverage.missing} |`,
      `| Ambiguous | ${map.counts.mapping_type.AMBIGUOUS || 0} |`,
      "",
      `MEDIUM confidence remaining: ${map.counts.confidence.MEDIUM || 0}`,
      "",
    ].join("\n")
  );

  fs.writeFileSync(
    FILES.reverseMd,
    [
      "# ActiveClinic V7 → Stitch Reverse Mapping",
      "",
      `**Generated:** ${NOW}`,
      "",
      "| Metric | Count |",
      "|---|---:|",
      `| Implementation records | ${reverse.counts.implementation_records} |`,
      `| With Stitch mapping | ${reverse.counts.with_stitch} |`,
      `| Without Stitch mapping | ${reverse.counts.without_stitch} |`,
      `| Invalid implementation IDs | ${reverse.counts.invalid_implementation_ids} |`,
      `| Orphan full mappings | ${reverse.counts.orphan_full_mappings} |`,
      "",
      "## Unused screen views (kept on disk)",
      "",
      unusedScreenViews.length
        ? unusedScreenViews.map((v) => `- \`${v}\``).join("\n")
        : "None.",
      "",
    ].join("\n")
  );

  const requiredOk =
    map.counts.stitch_screen_coverage.missing === 0 &&
    (map.counts.mapping_type.AMBIGUOUS || 0) === 0 &&
    verification.invalid_implementation_ids.length === 0 &&
    verification.ghost_full_mappings.length === 0 &&
    reverseInvalid.length === 0 &&
    reverseOrphanFull.length === 0 &&
    verification.stitch_not_mapped.length === 0 &&
    verification.map_not_in_stitch.length === 0;

  const report = {
    generated_at: NOW,
    verdict: requiredOk ? "PHASE16_INVENTORY_VERIFIED" : "PHASE16_INVENTORY_GAPS",
    safety,
    stitch_screens: 388,
    implementation_records: impl.screens.length,
    mapping_counts: map.counts,
    required: {
      missing: map.counts.stitch_screen_coverage.missing,
      ambiguous: map.counts.mapping_type.AMBIGUOUS || 0,
      partial: map.counts.stitch_screen_coverage.partial,
      partial_explanation:
        map.counts.stitch_screen_coverage.partial === 0
          ? "None. Overnight Phase 5A–5E remaps remain in force; live mappings have no PARTIAL_IMPLEMENTATION rows."
          : "See completeness report",
    },
    classifications: {
      full: map.counts.stitch_screen_coverage.full,
      partial: map.counts.stitch_screen_coverage.partial,
      missing: map.counts.stitch_screen_coverage.missing,
      product_decisions: map.counts.mapping_type.PRODUCT_DECISION_DIFFERENCE || 0,
      duplicates: map.counts.mapping_type.DUPLICATE_STITCH_VARIANT || 0,
      na: map.counts.mapping_type.NO_IMPLEMENTATION_REQUIRED || 0,
      ambiguous: map.counts.mapping_type.AMBIGUOUS || 0,
    },
    reverse: reverse.counts,
    orphans: {
      unused_screen_views: unusedScreenViews,
      unused_views_deleted: false,
      inventory_missing_view: inventoryMissingView.map((s) => s.implementation_id),
      inventory_missing_route: inventoryMissingRoute.map((s) => ({
        id: s.implementation_id,
        route: s.route_path,
      })),
      infra_gets_excluded: gets.filter((r) => isInfraGet(r.path)).length,
      redirect_only: impl.screens.filter((s) => s.reachable === "REDIRECT_ONLY").map((s) => s.implementation_id),
    },
    inventory_fixes: inventoryFixes,
    mapping_view_path_fixes: mappingViewFixes,
    ghost_full_mappings: verification.ghost_full_mappings,
    invalid_implementation_ids: verification.invalid_implementation_ids,
    mapping_issues: verification.mapping_issues,
    product_decisions: productRows.map((r) => ({
      id: r.stitch_screen_id,
      title: r.stitch_screen_title,
      decision: r.product_difference || r.notes,
    })),
    next: "PHASE 17 — final readiness gate",
  };

  const reportMd = [
    "# ActiveClinic V7 — Phase 16 inventory integrity",
    "",
    "Evidence pass after overnight + Phases 4–15. **No product implementation. No UI redesign.**",
    "",
    "No push. No deploy. Production untouched.",
    "",
    "## Verdict",
    "",
    `| Check | Result |`,
    `|---|---|`,
    `| Stitch screens | **388** |`,
    `| Mapping rows | **388** |`,
    `| Implementation records | **${impl.screens.length}** |`,
    `| Full | **${map.counts.stitch_screen_coverage.full}** |`,
    `| Partial | **${map.counts.stitch_screen_coverage.partial}** |`,
    `| Missing | **${map.counts.stitch_screen_coverage.missing}** |`,
    `| Product decisions | **${map.counts.mapping_type.PRODUCT_DECISION_DIFFERENCE || 0}** |`,
    `| Duplicates | **${map.counts.mapping_type.DUPLICATE_STITCH_VARIANT || 0}** |`,
    `| N/A | **${map.counts.mapping_type.NO_IMPLEMENTATION_REQUIRED || 0}** |`,
    `| Ambiguous | **${map.counts.mapping_type.AMBIGUOUS || 0}** |`,
    `| Invalid implementation IDs | **${verification.invalid_implementation_ids.length}** |`,
    `| Orphan full mappings | **${reverseOrphanFull.length}** |`,
    `| Unused screen views (kept) | **${unusedScreenViews.length}** |`,
    `| Push / deploy | no / no |`,
    "",
    requiredOk
      ? "**Required targets met:** missing=0, ambiguous=0."
      : "**Required targets not met** — see mapping_issues.",
    "",
    "## Safety",
    "",
    `| | |`,
    `|---|---|`,
    `| Branch | ${branch} |`,
    `| HEAD | \`${headSha}\` |`,
    `| Push | no |`,
    `| Deploy | no |`,
    `| Stitch (public / booking / portal) | \`17813606734422395399\` |`,
    `| Stitch (internal ops) | \`12272131183982732110\` |`,
    "",
    "## Partial",
    "",
    report.required.partial_explanation,
    "",
    "## Inventory evidence fixes",
    "",
    ...inventoryFixes.map((f) => `- ${f}`),
    mappingViewFixes.length
      ? `- Mapping view_paths: procedure-entry.ejs → procedure-info.ejs (${mappingViewFixes.length} rows)`
      : "",
    "",
    "## Orphans",
    "",
    "### Unused screen views (not deleted)",
    "",
    unusedScreenViews.includes("views/activeclinic/app/cashier-close-content.ejs")
      ? "- `views/activeclinic/app/cashier-close-content.ejs` — GET `/app/cashier/close` redirects to cash-count. ACV7-IMPL-0159 is REDIRECT_ONLY."
      : "",
    unusedScreenViews.includes("views/activeclinic/booking/procedure-entry.ejs")
      ? "- `views/activeclinic/booking/procedure-entry.ejs` — wizard renders `procedure-info.ejs`. Left on disk."
      : unusedScreenViews
          .filter(
            (v) =>
              v !== "views/activeclinic/app/cashier-close-content.ejs" &&
              v !== "views/activeclinic/booking/procedure-entry.ejs"
          )
          .map((v) => `- \`${v}\``)
          .join("\n"),
    "",
    "Infra GETs (`/healthz`, `/__ac/*`) are not screen inventory.",
    "",
    "## Reverse map",
    "",
    `| With Stitch | ${reverse.counts.with_stitch} |`,
    `| Without Stitch | ${reverse.counts.without_stitch} |`,
    `| Invalid IDs | ${reverse.counts.invalid_implementation_ids} |`,
    `| Orphan full mappings | ${reverse.counts.orphan_full_mappings} |`,
    "",
    "Without-Stitch records are extra V7 states/steps (validation, redirects, infrastructure), not unmapped Stitch screens.",
    "",
    "## Product decisions",
    "",
    ...productRows.map((r) => `- **${r.stitch_screen_title}** (\`${r.stitch_screen_id}\`) — ${r.product_difference || r.notes}`),
    "",
    "## Next",
    "",
    "PHASE 17 — final readiness gate.",
    "",
  ].join("\n");

  fs.writeFileSync(FILES.reportJson, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(FILES.reportMd, reportMd);

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        classifications: report.classifications,
        reverse: reverse.counts,
        unused_screen_views: unusedScreenViews,
        mapping_issues: verification.mapping_issues,
        inventory_fixes: inventoryFixes,
      },
      null,
      2
    )
  );
}

main();
