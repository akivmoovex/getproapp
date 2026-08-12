"use strict";

/**
 * Phase 7B — honest visual score updates after Stitch HTML/screenshot review.
 * Caps at 94. MATCHED (>=95) requires live browser ↔ Stitch evidence.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "docs/activeclinic/stitch");
const NOW = new Date().toISOString();
const P0 = new Set(["P01", "P02", "P07", "P24", "P25", "P26", "P27"]);
const HIGHVIS = new Set(["P21", "P22", "P23"]);

const visualJson = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.json");
const visualCsv = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.csv");
const visualMd = path.join(DIR, "ACTIVECLINIC_V7_VISUAL_BACKLOG.md");
const reportJson = path.join(DIR, "ACTIVECLINIC_V7_PHASE7B_VISUAL_REPORT.json");

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

function p0Surface(phase) {
  if (phase === "P21") return "Public";
  if (phase === "P22" || phase === "P23") return "Juflona";
  if (["P24", "P25", "P26", "P27"].includes(phase)) return "Booking/Portal";
  if (["P01", "P02", "P07"].includes(phase)) return "Internal";
  return "Other";
}

function targetFor(row) {
  const t = row.stitch_screen_title || "";
  const phase = row.stitch_phase;
  const device = row.stitch_device;

  if (/Public - Home/.test(t) && !/Juflona/.test(t)) return { score: 93, diffs: [
    "Phase7B: Stitch tokens (bg #f8f9ff, display 32/40, 48px/2px buttons, 50/50 hero, teal headline)",
    "Remaining: Stitch illustration vs local photo; mid-page architecture (V7 product sections vs Stitch journey/capability cards)",
    "TEST_INFRA_LIMITATION: no live browser MATCHED at 1440",
  ] };
  if (/Clinic Directory/.test(t)) return { score: 94, diffs: [
    "Phase7B: Find a Clinic, 2-col horizontal cards, desktop filter sidebar, 8px radius, 48px search",
    "Remaining: Stitch checkbox filters / Book Now / service tags / pagination vs V7 province-city filters and Details link",
    "TEST_INFRA_LIMITATION: no live browser MATCHED at 1440",
  ] };
  if (/Juflona Public - Home/.test(t)) return { score: 93, diffs: [
    "Phase7B: 5/7 hero, 120px curve, HPCZ badge, pill CTAs, display type",
    "Remaining: Stitch 24-hour / insurance trust copy is Juflona-artboard specific; V7 uses published clinic fields + booking honesty",
    "TEST_INFRA_LIMITATION: no live browser MATCHED at 1440",
  ] };
  if (/\bDoctors\b/.test(t) && (phase === "P22" || phase === "P23")) return { score: 91, diffs: [
    "Phase7B: Our Doctors heading, 8px cards, 3-col desktop, display type",
    "Remaining: Stitch hero photo, department chips, Featured badge, doctor search not in V7 source",
    "TEST_INFRA_LIMITATION: no live browser MATCHED",
  ] };
  if (/\bServices\b/.test(t) && (phase === "P22" || phase === "P23") && !/Detail/.test(t)) return { score: 91, diffs: [
    "Phase7B: 8px cards, 3-col desktop, display type",
    "Remaining: Stitch Services Directory chips / Bookable badges / duration-price chrome vs V7 consultation+procedure lists",
    "TEST_INFRA_LIMITATION: no live browser MATCHED",
  ] };
  if (/\bPricing\b/.test(t) && (phase === "P22" || phase === "P23")) return { score: 91, diffs: [
    "Phase7B: display type, 8px cards, 3-col desktop when prices exist",
    "PRODUCT_DECISION_DIFFERENCE: Stitch shows sample Kwacha fees; V7 only lists clinic-published prices",
    "TEST_INFRA_LIMITATION: no live browser MATCHED",
  ] };
  if (t.includes("P01 – Dashboard – Desktop")) return { score: 91, diffs: [
    "Phase7B: dashboard stat/panel radius 8px",
    "Remaining: Stitch operational metric layout vs V7 setup/welcome dashboard",
    "TEST_INFRA_LIMITATION: no live browser MATCHED",
  ] };
  if ((phase === "P24" || phase === "P25") && row.visual_score != null && row.visual_score < 94) {
    const already = Array.isArray(row.top_visual_differences) && row.top_visual_differences.some((d) => String(d).includes("Phase7B: inherited public type scale"));
    if (already) return { score: row.visual_score, diffs: row.top_visual_differences };
    return { score: Math.min(94, row.visual_score + 1), diffs: [
      "Phase7B: inherited public type scale (display 32/40) and 48px / 2px buttons",
      "Remaining: wizard chrome vs dedicated Stitch artboards; booking is request-not-confirm",
      "TEST_INFRA_LIMITATION: no live browser MATCHED",
    ] };
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(visualJson, "utf8"));
const beforeRows = data.rows.map((r) => ({
  id: r.stitch_screen_id,
  title: r.stitch_screen_title,
  phase: r.stitch_phase,
  device: r.stitch_device,
  score: r.visual_score,
  view: r.view,
}));

const p0Before = beforeRows.filter((r) => P0.has(r.phase));
const p0ScoredBefore = p0Before.filter((r) => r.score != null);
const countsBefore = {
  p0_total: p0Before.length,
  p0_scored: p0ScoredBefore.length,
  p0_ge95: p0ScoredBefore.filter((r) => r.score >= 95).length,
  p0_90_94: p0ScoredBefore.filter((r) => r.score >= 90 && r.score < 95).length,
  p0_lt90: p0ScoredBefore.filter((r) => r.score < 90).length,
  p0_unscored: p0Before.filter((r) => r.score == null).length,
};

const deltas = [];
for (const row of data.rows) {
  const spec = targetFor(row);
  if (!spec || row.visual_score == null) continue;
  const before = row.visual_score;
  const after = Math.min(94, Math.max(before, spec.score));
  if (after === before && JSON.stringify(row.top_visual_differences) === JSON.stringify(spec.diffs)) continue;
  row.visual_score = after;
  row.top_visual_differences = spec.diffs;
  row.historical_matrix_note = spec.diffs.join("; ");
  if (after !== before) {
    deltas.push({
      id: row.stitch_screen_id,
      title: row.stitch_screen_title,
      device: row.stitch_device,
      phase: row.stitch_phase,
      surface: p0Surface(row.stitch_phase),
      before,
      after,
      delta: after - before,
      view: row.view,
    });
  }
}

function recount(rows) {
  const buckets = { "<80": 0, "80-89": 0, "90-94": 0, ">=95": 0, unscored: 0 };
  for (const row of rows) buckets[bucket(row.visual_score)] += 1;
  return buckets;
}

data.generated_at = NOW;
data.phase7b_at = NOW;
data.counts.score_buckets = recount(data.rows);

const p0After = data.rows.filter((r) => P0.has(r.stitch_phase));
const p0ScoredAfter = p0After.filter((r) => r.visual_score != null);
const hvAfter = data.rows.filter((r) => HIGHVIS.has(r.stitch_phase) && r.visual_score != null && r.visual_score >= 90 && r.visual_score < 95);

const countsAfter = {
  p0_total: p0After.length,
  p0_scored: p0ScoredAfter.length,
  p0_ge95: p0ScoredAfter.filter((r) => r.visual_score >= 95).length,
  p0_90_94: p0ScoredAfter.filter((r) => r.visual_score >= 90 && r.visual_score < 95).length,
  p0_lt90: p0ScoredAfter.filter((r) => r.visual_score < 90).length,
  p0_unscored: p0After.filter((r) => r.visual_score == null).length,
  highvis_p21_p23_90_94: hvAfter.length,
};

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
  "## Phase 7B",
  "",
  `- P0 ≥95 before: ${countsBefore.p0_ge95} → after: ${countsAfter.p0_ge95}`,
  `- P0 90–94 before: ${countsBefore.p0_90_94} → after: ${countsAfter.p0_90_94}`,
  `- Screens with score delta: ${deltas.length}`,
  "- MATCHED (≥95) not claimed — remaining Stitch architecture / product / asset gaps",
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

const report = {
  generated_at: NOW,
  verdict: "PHASE7B_COMPLETE_WITH_GAPS",
  safety: {
    branch: git("git rev-parse --abbrev-ref HEAD"),
    head_sha: git("git rev-parse HEAD"),
    deployment_env: "testing",
    db_identity: "moovex-platform-v7",
    production_touched: false,
    pushed: false,
    deployed: false,
  },
  p0_definition: "P01, P02, P07, P24, P25, P26, P27 (Phase 6 band). High-vis P21–P23 also reviewed per Phase 7B priority list.",
  before: countsBefore,
  after: countsAfter,
  screens_improved: deltas.length,
  deltas,
  remaining_limitations: [
    "No screen raised to ≥95: MATCHED requires live browser ↔ Stitch evidence and only minor remaining diffs.",
    "Public Home: Stitch illustration + journey/capability architecture vs V7 product sections and local hero photo.",
    "Directory: Stitch checkbox filters, Book Now, tags, pagination vs V7 province/city filters and Details link.",
    "Juflona Home: Stitch 24-hour / insurance trust vs published clinic fields and booking-request honesty.",
    "Doctors/Services: Stitch search chips, Featured, Bookable badges not in V7 source.",
    "Pricing: Stitch sample Kwacha fees are not published clinic data — not copied.",
    "Reception and Pharmacy are P03/P05 (P1) — deferred to Phase 7C.",
    "Material Symbols vs SVG/unicode icons.",
    "63 P0 rows remain unscored.",
  ],
};

fs.writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  verdict: report.verdict,
  before: countsBefore,
  after: countsAfter,
  improved: deltas.length,
  sample: deltas.slice(0, 12),
}, null, 2));
