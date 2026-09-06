#!/usr/bin/env node
"use strict";

/**
 * Download self-hosted latin text fonts + a Material Symbols ligature subset.
 * Run from repo root: node scripts/vendor-web-fonts.js
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "fonts");
const CSS_PATH = path.join(ROOT, "public", "platform", "gp-fonts.css");
const UA =
  "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

function walk(dir, acc) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (name.name.startsWith(".") || name.name === "node_modules" || name.name === "design-reference") {
      continue;
    }
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function collectIconNames() {
  const names = new Set();
  const files = [];
  const roots = [
    path.join(ROOT, "views", "blessboard", "v5", "apex"),
    path.join(ROOT, "views", "blessboard", "v5", "public"),
    path.join(ROOT, "views", "blessboard", "v5", "partials"),
    path.join(ROOT, "views", "activeclinic", "public"),
    path.join(ROOT, "views", "activeclinic", "layouts"),
    path.join(ROOT, "views", "activeclinic", "partials"),
    path.join(ROOT, "views", "activeclinic", "auth"),
    path.join(ROOT, "views", "activeclinic", "patient"),
    path.join(ROOT, "views", "activeclinic", "tenant"),
    path.join(ROOT, "views", "activeclinic", "booking"),
    path.join(ROOT, "views", "platform", "auth"),
    path.join(ROOT, "views", "church", "partials"),
    path.join(ROOT, "views", "church", "public"),
  ];
  for (const dir of roots) {
    if (fs.existsSync(dir)) walk(dir, files);
  }
  const reClassSpan =
    /class="[^"]*(?:material-symbols-outlined|bb-ds-icon)[^"]*"[^>]*>\s*([a-z][a-z0-9_]{1,48})\s*</gi;
  const reClassSpanRev =
    /<(?:span|i)[^>]*>\s*([a-z][a-z0-9_]{1,48})\s*<\/(?:span|i)>/gi;
  const reIncludeIcon = /include\([^)]*icon\.ejs['"][\s\S]{0,200}?name:\s*['"]([a-z][a-z0-9_]{1,48})['"]/gi;
  for (const file of files) {
    if (!file.endsWith(".ejs")) continue;
    if (file.includes(" 2.")) continue;
    const src = fs.readFileSync(file, "utf8");
    let m;
    while ((m = reClassSpan.exec(src))) names.add(m[1]);
    if (src.includes("material-symbols-outlined") || src.includes("bb-ds-icon")) {
      const blocks = src.split(/material-symbols-outlined|bb-ds-icon/);
      for (const block of blocks.slice(1)) {
        const inner = block.match(/^[^>]*>\s*([a-z][a-z0-9_]{1,48})\s*</);
        if (inner) names.add(inner[1]);
      }
    }
    while ((m = reIncludeIcon.exec(src))) names.add(m[1]);
    void reClassSpanRev;
  }
  for (const extra of [
    "close",
    "menu",
    "search",
    "church",
    "health_and_safety",
    "auto_awesome",
    "domain",
    "error",
    "check_circle",
    "info",
    "arrow_forward",
    "person_add",
    "favorite",
    "auto_graph",
    "account_tree",
    "calendar_month",
    "event_available",
    "hub",
    "add_business",
    "sync",
    "health_metrics",
    "forum",
    "devices",
    "analytics",
    "patient_list",
    "arrow_back",
    "logout",
    "mail",
    "call",
    "location_on",
    "phone",
    "schedule",
    "play_arrow",
    "verified",
    "filter_list",
    "visibility",
    "chevron_right",
    "chevron_left",
    "expand_more",
    "home",
    "settings",
    "notifications",
    "campaign",
    "event",
    "groups",
    "language",
    "payments",
    "person",
    "edit",
    "add",
    "done",
    "warning",
    "check",
    "star",
    "favorite",
  ]) {
    names.add(extra);
  }
  return [...names].sort();
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": UA } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchText(new URL(res.headers.location, url).toString()).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GET ${url} -> ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      })
      .on("error", reject);
  });
}

function fetchBin(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": UA } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBin(new URL(res.headers.location, url).toString()).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`GET ${url} -> ${res.statusCode}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      })
      .on("error", reject);
  });
}

function allFontUrls(css) {
  return [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
}

function isLatinRange(cssBlock) {
  return /unicode-range:\s*U\+0000-00FF/i.test(cssBlock);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(OUT_DIR)) {
    if (name.endsWith(".woff2")) fs.unlinkSync(path.join(OUT_DIR, name));
  }
  const icons = collectIconNames();
  fs.writeFileSync(path.join(OUT_DIR, "material-symbols-icon-names.txt"), icons.join("\n") + "\n");
  console.log(`Collected ${icons.length} material icon names`);

  const hankenCss = await fetchText(
    "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..700&display=swap"
  );
  const interCss = await fetchText(
    "https://fonts.googleapis.com/css2?family=Inter:wght@400..700&display=swap"
  );
  const publicSansCss = await fetchText(
    "https://fonts.googleapis.com/css2?family=Public+Sans:wght@400..700&display=swap"
  );

  async function symbolsCssFor(list) {
    const url =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0..1,0&display=swap&icon_names=" +
      encodeURIComponent(list.join(","));
    return fetchText(url);
  }

  async function acceptedIcons(list) {
    if (!list.length) return [];
    try {
      await symbolsCssFor(list);
      return list;
    } catch {
      if (list.length === 1) {
        console.warn("Dropping unknown icon", list[0]);
        return [];
      }
      const mid = Math.floor(list.length / 2);
      const left = await acceptedIcons(list.slice(0, mid));
      const right = await acceptedIcons(list.slice(mid));
      return left.concat(right);
    }
  }

  const validIcons = await acceptedIcons(icons);
  console.log(`Valid material icons: ${validIcons.length}/${icons.length}`);
  fs.writeFileSync(path.join(OUT_DIR, "material-symbols-icon-names.txt"), validIcons.join("\n") + "\n");
  const symbolsCss = await symbolsCssFor(validIcons);

  async function localizeFontCss(familySlug, googleCss) {
    let out = googleCss;
    const urls = allFontUrls(googleCss);
    const latinFiles = [];
    const seen = new Map();
    let i = 0;
    for (const url of urls) {
      if (seen.has(url)) {
        out = out.replace(url, seen.get(url));
        continue;
      }
      i += 1;
      const name = `${familySlug}-${i}.woff2`;
      const buf = await fetchBin(url);
      fs.writeFileSync(path.join(OUT_DIR, name), buf);
      console.log(`Wrote ${name} (${buf.length} bytes)`);
      const local = `/fonts/${name}`;
      seen.set(url, local);
      out = out.replaceAll(url, local);
      const parts = googleCss.split(url);
      const around = (parts[0] || "").slice(-280) + (parts[1] || "").slice(0, 240);
      if (isLatinRange(around)) latinFiles.push(name);
    }
    return { css: out, latinFiles };
  }

  const hanken = await localizeFontCss("hanken-grotesk", hankenCss);
  const inter = await localizeFontCss("inter", interCss);
  const publicSans = await localizeFontCss("public-sans", publicSansCss);

  const symbolsUrl = allFontUrls(symbolsCss)[0];
  if (!symbolsUrl) throw new Error("No Material Symbols file URL");
  const symbolsBuf = await fetchBin(symbolsUrl);
  fs.writeFileSync(path.join(OUT_DIR, "material-symbols-outlined.woff2"), symbolsBuf);
  console.log(`Wrote material-symbols-outlined.woff2 (${symbolsBuf.length} bytes)`);

  const manifest = {
    hankenLatin: hanken.latinFiles[0] || "hanken-grotesk-1.woff2",
    interLatin: inter.latinFiles[0] || "inter-1.woff2",
    publicSansLatin: publicSans.latinFiles[0] || "public-sans-1.woff2",
  };
  fs.writeFileSync(path.join(OUT_DIR, "preload-manifest.json"), JSON.stringify(manifest, null, 2));

  const css = `/**
 * Self-hosted product fonts. Generated by scripts/vendor-web-fonts.js.
 * Do not load fonts.googleapis.com on public/auth shells.
 */
${hanken.css}

${inter.css}

${publicSans.css}
`;
  fs.writeFileSync(CSS_PATH, css);
  const iconCss = `/**
 * Subset Material Symbols for public/auth pages. Generated by scripts/vendor-web-fonts.js.
 */
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url("/fonts/material-symbols-outlined.woff2") format("woff2");
}
.material-symbols-outlined {
  font-family: "Material Symbols Outlined", sans-serif;
  font-weight: normal;
  font-style: normal;
  font-size: 1.25em;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  font-feature-settings: "liga";
  -webkit-font-smoothing: antialiased;
}
`;
  fs.writeFileSync(path.join(ROOT, "public", "platform", "gp-icon-font.css"), iconCss);
  console.log("Wrote", path.relative(ROOT, CSS_PATH));
  console.log("Wrote public/platform/gp-icon-font.css");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
