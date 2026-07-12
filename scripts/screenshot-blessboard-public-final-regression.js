/**
 * Final public visual regression: all 8 tenant routes across key viewports.
 * Checks overflow, H1 count, powered-by duplication, drawer (mobile only), console errors.
 * Usage: node scripts/screenshot-blessboard-public-final-regression.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const websiteContentService = require("../src/services/church/websiteContentService");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-public-final-regression");
const PORT = 4196;

const ROUTES = [
  { path: "/", name: "home" },
  { path: "/about", name: "about" },
  { path: "/leadership", name: "leadership" },
  { path: "/ministries", name: "ministries" },
  { path: "/events", name: "events" },
  { path: "/sermons", name: "sermons" },
  { path: "/giving", name: "giving" },
  { path: "/contact", name: "contact" },
];

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1024", width: 1024, height: 768 },
  { name: "900", width: 900, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "430", width: 430, height: 932 },
  { name: "390", width: 390, height: 844 },
  { name: "360", width: 360, height: 800 },
];

function makeApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Kafue Baptist Church", status: "active" },
      branch: {
        id: 1,
        name: "Main Campus",
        status: "active",
        host_slug: "demo",
        welcome_message: "Connecting the community through faith, fellowship, and purposeful action.",
        service_times:
          "Sunday Morning · 09:00 AM — 11:30 AM\nMid-Week Bible Study · Wed 05:30 PM\nOpen 9:00 AM daily",
        location_text: "Plot 1245, Great North Road, Kafue, Zambia",
        address: "Plot 1245, Great North Road, Kafue, Zambia",
        contact_phone: "+260 97 123 4567",
        contact_email: "hello@example.com",
        office_hours: "Mon - Fri: 08:00 - 17:00\nSaturday: 09:00 - 12:00\nOpen 9:00 AM walk-ins",
      },
    };
    next();
  });
  app.use((req, res, next) => {
    const render = res.render.bind(res);
    res.render = (view, locals, cb) => {
      const org = req.churchContext.organization;
      const branch = req.churchContext.branch;
      const activePage =
        String(view).includes("about")
          ? "about"
          : String(view).includes("leadership")
            ? "leadership"
            : String(view).includes("ministries")
              ? "ministries"
              : String(view).includes("events")
                ? "events"
                : String(view).includes("sermons")
                  ? "sermons"
                  : String(view).includes("giving")
                    ? "giving"
                    : String(view).includes("contact")
                      ? "contact"
                      : "home";
      const base = websiteContentService.preparePublicViewModel(org, branch, {}, { activePage });
      render(view, { ...base, ...(locals || {}), isVerticalApex: false }, cb);
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

async function auditPage(page, routeName, width) {
  const issues = [];
  const metrics = await page.evaluate(() => {
    const h1s = [...document.querySelectorAll("h1")].map((el) =>
      el.textContent.trim().replace(/\s+/g, " ").slice(0, 80)
    );
    const powered = document.querySelectorAll(".bb-powered-by").length;
    const drawer = document.getElementById("church-mobile-drawer");
    const drawerPowered = drawer ? drawer.querySelectorAll(".bb-powered-by").length : 0;
    const footerPowered = document.querySelectorAll(".church-footer--branch .bb-powered-by").length;
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
    const scrollCheck = document.documentElement.scrollWidth <= window.innerWidth;
    const community = document.querySelector(".bb-tenant-community");
    const communityVisible = community
      ? window.getComputedStyle(community).display !== "none"
      : null;
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
    const emptyLinks = [...document.querySelectorAll("a")].filter(
      (a) => !(a.getAttribute("aria-label") || "").trim() && !(a.textContent || "").trim()
    ).length;
    const unsafeHrefs = [...document.querySelectorAll("a[href]")].filter((a) =>
      /^(javascript:|data:)/i.test(a.getAttribute("href") || "")
    ).length;
    return {
      h1s,
      powered,
      drawerPowered,
      footerPowered,
      overflow,
      scrollCheck,
      communityVisible,
      dupIds: [...new Set(dupIds)],
      emptyLinks,
      unsafeHrefs,
      cssHref: (document.querySelector('link[href*="church.css"]') || {}).href || "",
    };
  });

  if (metrics.h1s.length !== 1) issues.push(`h1 count=${metrics.h1s.length}`);
  if (metrics.powered !== 1) issues.push(`powered-by count=${metrics.powered}`);
  if (metrics.drawerPowered !== 0) issues.push(`drawer powered-by=${metrics.drawerPowered}`);
  if (metrics.footerPowered !== 1) issues.push(`footer powered-by=${metrics.footerPowered}`);
  if (metrics.overflow || !metrics.scrollCheck) issues.push("horizontal overflow");
  if (routeName === "home" && width >= 900 && metrics.communityVisible === true) {
    issues.push("Connected Community visible on desktop");
  }
  if (routeName === "home" && width < 900 && metrics.communityVisible === false) {
    issues.push("Connected Community hidden on mobile");
  }
  if (metrics.dupIds.length) issues.push(`duplicate ids: ${metrics.dupIds.join(",")}`);
  if (metrics.emptyLinks) issues.push(`empty links=${metrics.emptyLinks}`);
  if (metrics.unsafeHrefs) issues.push(`unsafe hrefs=${metrics.unsafeHrefs}`);
  if (!/church\.css\?v=58/.test(metrics.cssHref)) issues.push(`css cache ${metrics.cssHref}`);

  if (width < 900) {
    const btn = page.locator("#church-mobile-menu-btn");
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(200);
      const openPowered = await page.evaluate(() => {
        const drawer = document.getElementById("church-mobile-drawer");
        return drawer ? drawer.querySelectorAll(".bb-powered-by").length : -1;
      });
      if (openPowered !== 0) issues.push(`open drawer powered-by=${openPowered}`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(150);
    }
  }

  return { metrics, issues };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const app = makeApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const summary = [];
  const consoleErrors = [];

  try {
    for (const route of ROUTES) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        page.on("pageerror", (err) => consoleErrors.push({ route: route.name, vp: vp.name, err: String(err) }));
        page.on("console", (msg) => {
          if (msg.type() === "error") {
            consoleErrors.push({ route: route.name, vp: vp.name, err: msg.text() });
          }
        });
        const failedCss = [];
        page.on("response", (res) => {
          if (res.url().includes("church.css") && !res.ok()) failedCss.push(res.status());
        });
        await page.goto(`http://127.0.0.1:${PORT}${route.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await page.waitForTimeout(400);
        const file = path.join(OUT_DIR, `${route.name}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const { metrics, issues } = await auditPage(page, route.name, vp.width);
        if (failedCss.length) issues.push(`css failed ${failedCss.join(",")}`);
        summary.push({
          route: route.name,
          viewport: vp.name,
          ok: issues.length === 0,
          issues,
          h1: metrics.h1s[0] || null,
          overflow: metrics.overflow,
          powered: metrics.powered,
          communityVisible: metrics.communityVisible,
          file,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  const failed = summary.filter((s) => !s.ok);
  const report = {
    outDir: OUT_DIR,
    checked: summary.length,
    failed: failed.length,
    consoleErrors: consoleErrors.filter(
      (e) => !/Failed to load resource|favicon|fonts\.googleapis|fonts\.gstatic/i.test(e.err)
    ),
    failures: failed,
    sample: summary.filter((s) => ["1440", "390"].includes(s.viewport)),
  };
  fs.writeFileSync(path.join(OUT_DIR, "audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
