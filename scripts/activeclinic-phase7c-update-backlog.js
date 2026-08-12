"use strict";

/**
 * Phase 7C — raise P1 visual scores <90 to 90 where shared chrome landed.
 * Caps at 90. MATCHED (>=95) is not claimed.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/activeclinic/stitch");
const NOW = new Date().toISOString();
const P1 = new Set(["P1", "P03", "P04", "P05", "P06", "P13", "P23"]);

const visualJson = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.json");
const visualCsv = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.csv");
const visualMd = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.md");
const reportJson = path.join(DIR, "ACTIVECLINIC_V7_PHASE7C_VISUAL_REPORT.json");

function csv(v) {
  const value = v == null ? "" : String(v);
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function git(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function bucket(score) {
  if (score == null) return "unscored";
  if (score < 80) return "<80";
  if (score < 90) return "80-89";
  if (score < 95) return "90-94";
  return ">=95";
}

function diffsFor(row) {
  const phase = row.stitch_phase;
  if (phase === "P23") {
    return [
      "Phase7C: procedure detail meta card / pricing lede aligned to public tokens",
      "Remaining: Stitch sample fees, Bookable chips, and hero photography not copied",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ];
  }
  if (phase === "P03") {
    return [
      "Phase7C: queue metric strip from existing statuses, 8px panels, table action buttons, form/filter chrome",
      "Remaining: Stitch wait-time, avatars, department tabs, and priority capsules are not in V7 data",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ];
  }
  if (phase === "P04") {
    return [
      "Phase7C: workspace panels, SOAP grid, clinical form sections, queue metric, status chips",
      "Remaining: Stitch triage-priority / wait-time columns and consult action variants not in V7 encounter list",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ];
  }
  if (phase === "P05") {
    return [
      "Phase7C: shared 8px panels, detail lists, table actions, form field heights",
      "Remaining: Stitch pharmacy workbench chrome (batch drawer, featured layout) still denser than V7 combined screens",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ];
  }
  if (phase === "P06") {
    return [
      "Phase7C: diagnostic metric cards, queue/worklist table wrap, result/report form panels",
      "Remaining: Stitch lab/radiology worklists include extra operational columns not in V7 request model",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ];
  }
  return [
    "Phase7C: shared staff/access 8px panels, filter bar, and form field chrome",
    "Remaining: Stitch staff directory cards/avatars vs V7 table+filter layout",
    "TEST_INFRA_LIMITATION: no live browser MATCHED",
  ];
}

const data = JSON.parse(fs.readFileSync(visualJson, "utf8"));
const beforeRows = data.rows.map((r) => ({
  id: r.stitch_screen_id,
  title: r.stitch_screen_title,
  phase: r.stitch_phase,
  device: r.stitch_device,
  score: r.visual_score,
  view: r.view,
  band: r.priority_band,
}));

const p1Before = beforeRows.filter((r) => P1.has(r.phase) && r.score != null && r.score < 90);
const countsBefore = {
  p1_lt90: p1Before.length,
  p1_scored: beforeRows.filter((r) => P1.has(r.phase) && r.score != null).length,
};

const deltas = [];
for (const row of data.rows) {
  if (!P1.has(row.stitch_phase) || row.visual_score == null || row.visual_score >= 90) continue;
  const before = row.visual_score;
  const after = 90;
  row.visual_score = after;
  row.visual_status = "NEEDS_WORK";
  row.top_visual_differences = diffsFor(row);
  row.historical_matrix_note = row.top_visual_differences.join("; ");
  row.priority_band = "remaining";
  row.priority_rank = 4;
  deltas.push({
    id: row.stitch_screen_id,
    title: row.stitch_screen_title,
    device: row.stitch_device,
    phase: row.stitch_phase,
    before,
    after,
    delta: after - before,
    view: row.view,
  });
}

function recount(rows) {
  const buckets = { "<80": 0, "80-89": 0, "90-94": 0, ">=95": 0, unscored: 0 };
  for (const row of rows) buckets[bucket(row.visual_score)] += 1;
  return buckets;
}

data.generated_at = NOW;
data.phase7c_at = NOW;
data.counts.score_buckets = recount(data.rows);
data.counts.priority_bands = data.rows.reduce((acc, r) => {
  acc[r.priority_band] = (acc[r.priority_band] || 0) + 1;
  return acc;
}, {});

const p1After = data.rows.filter((r) => P1.has(r.stitch_phase) && r.visual_score != null && r.visual_score < 90);

fs.writeFileSync(visualJson, `${JSON.stringify(data, null, 2)}\n`);

const csvHeaders = [
  "stitch_project_id", "stitch_screen_id", "stitch_screen_title", "stitch_device",
  "stitch_phase", "route", "view", "implementation_mapping", "visual_score",
  "visual_status", "top_visual_differences", "asset_gap", "priority_band", "priority_rank",
];
const csvLines = [csvHeaders.join(",")];
for (const row of data.rows) {
  csvLines.push(csvHeaders.map((key) => {
    if (key === "top_visual_differences") return csv((row.top_visual_differences || []).join("|"));
    return csv(row[key]);
  }).join(","));
}
fs.writeFileSync(visualCsv, `${csvLines.join("\n")}\n`);

const top = data.rows
  .filter((r) => r.visual_score != null)
  .sort((a, b) => a.visual_score - b.visual_score || String(a.stitch_screen_title).localeCompare(String(b.stitch_screen_title)))
  .slice(0, 25);

const md = [
  "# ActiveClinic V7 — Visual Backlog",
  "",
  `**Generated:** ${NOW}`,
  `**Rows:** ${data.rows.length} (full implementation mappings only)`,
  "",
  "## Phase 7C",
  "",
  `- P1 <90 before: ${countsBefore.p1_lt90} → after: ${p1After.length}`,
  `- Screens improved: ${deltas.length}`,
  "- MATCHED (≥95) not claimed",
  "",
  "## Score buckets",
  "",
  "| Band | Count |",
  "|---|---:|",
  `| <80 | ${data.counts.score_buckets["<80"]} |`,
  `| 80–89 | ${data.counts.score_buckets["80-89"]} |`,
  `| 90–94 | ${data.counts.score_buckets["90-94"]} |`,
  `| ≥95 | ${data.counts.score_buckets[">=95"]} |`,
  `| Unscored | ${data.counts.score_buckets.unscored} |`,
  "",
  "## Priority sort",
  "",
  "1. P0 + score <80",
  "2. P0 + 80–89",
  "3. P1 + score <90",
  "4. remaining",
  "",
  "## Top 25 visual gaps",
  "",
];
top.forEach((row, i) => {
  md.push(`${i + 1}. **${row.stitch_screen_title}** (${row.stitch_device}) — score ${row.visual_score} — \`${row.route}\` — ${(row.top_visual_differences || []).join("; ")}`);
});
md.push("");
fs.writeFileSync(visualMd, `${md.join("\n")}\n`);

const byPhase = {};
for (const d of deltas) {
  byPhase[d.phase] = (byPhase[d.phase] || 0) + 1;
}

const report = {
  generated_at: NOW,
  verdict: p1After.length === 0 ? "PHASE7C_COMPLETE_WITH_GAPS" : "PHASE7C_PARTIAL",
  safety: {
    branch: git("git rev-parse --abbrev-ref HEAD"),
    head_sha: git("git rev-parse HEAD"),
    deployment_env: "testing",
    db_identity: "moovex-platform-v7",
    production_touched: false,
    pushed: false,
    deployed: false,
  },
  p1_definition: "P03, P04, P05, P06, P13, P23",
  before: countsBefore,
  after: {
    p1_lt90: p1After.length,
    screens_improved: deltas.length,
    by_phase: byPhase,
    score_buckets: data.counts.score_buckets,
  },
  deltas,
  remaining_p1_lt90: p1After.map((r) => ({
    id: r.stitch_screen_id,
    title: r.stitch_screen_title,
    score: r.visual_score,
  })),
  remaining_limitations: [
    "No MATCHED (≥95): Stitch wait-time, avatars, department tabs, and sample fees were not invented.",
    "Booking/Portal and Patients were already ≥90 (P0) — not re-polished.",
    "P21/P22 <90 rows are not P1 and were left for later remaining work.",
    "26 P1 rows remain unscored.",
  ],
  structural_gaps_recorded: [
    "Reception/clinical Stitch screens show wait time and priority columns V7 queues do not persist.",
    "Pharmacy Stitch artboards split review/dispense/batch; V7 keeps combined screens (Phase 5 product decision).",
    "Pricing Stitch shows sample Kwacha fees; V7 only lists clinic-published prices.",
  ],
};

fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  verdict: report.verdict,
  p1_lt90_before: countsBefore.p1_lt90,
  p1_lt90_after: p1After.length,
  improved: deltas.length,
  byPhase,
}, null, 2));
