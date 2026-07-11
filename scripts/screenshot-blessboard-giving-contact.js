/**
 * Generate BlessBoard Giving + Contact screenshots for visual QA.
 * Usage: node scripts/screenshot-blessboard-giving-contact.js
 */
"use strict";

const path = require("path");
const fs = require("fs");
const http = require("http");
const express = require("express");
const { chromium } = require("playwright");

const churchRoutes = require("../src/routes/church");
const websiteContentService = require("../src/services/church/websiteContentService");
const givingSettingsService = require("../src/services/church/givingSettingsService");

const OUT_DIR = path.join(__dirname, "../test-results/blessboard-giving-contact-visual");
const PORT = 4184;

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

function makeBranchApp({ mode } = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use("/church", express.static(path.join(__dirname, "../public/church")));
  app.use(express.urlencoded({ extended: false }));

  const branch =
    mode === "empty"
      ? {
          id: 1,
          name: "Main Campus",
          status: "active",
          host_slug: "demo",
          location_text: "",
          contact_phone: "",
          contact_email: "",
          service_times: "",
        }
      : {
          id: 1,
          name: "Main Campus",
          status: "active",
          host_slug: "demo",
          location_text: "12 Faith Avenue, Lusaka",
          contact_phone: "+260 97 123 4567",
          contact_email: "hello@alphagrace.example",
          service_times: "Sunday Worship · 10:00 AM\nMidweek Prayer · Wednesday 18:30",
        };

  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Alpha Grace Church", status: "active" },
      branch,
    };
    next();
  });

  app.use((req, res, next) => {
    const render = res.render.bind(res);
    res.render = (view, locals, cb) => {
      const org = req.churchContext.organization;
      const br = req.churchContext.branch;
      const nextLocals = { ...(locals || {}) };

      if (String(view).includes("church/public/giving")) {
        Object.assign(
          nextLocals,
          websiteContentService.preparePublicViewModel(org, br, {}, { activePage: "giving" }),
          {
            activePage: "giving",
            isVerticalApex: false,
            givingDisplay:
              mode === "populated"
                ? givingSettingsService.prepareGivingDisplay(
                    {
                      bank_name: "Zanaco",
                      account_name: "Alpha Grace Church",
                      account_number: "123456789012",
                      branch_code: "001",
                      swift_code: "ZNCOZMLU",
                      mobile_money_provider_1: "Airtel Money",
                      mobile_money_number_1: "0977123456",
                      mobile_money_name_1: "Alpha Grace Church",
                      giving_categories_json: ["Tithe", "Offering", "Missions"],
                      giving_instructions: "Include your name and giving category in the payment reference.",
                      qr_code_label: "",
                      giving_qr_url: "",
                      finance_contact_name: "Finance Desk",
                      finance_contact_phone: "+260 97 000 1111",
                    },
                    null,
                    { audience: "public", churchName: org.name }
                  )
                : givingSettingsService.prepareGivingDisplay(null, null, {
                    audience: "public",
                    churchName: org.name,
                  }),
          }
        );
      }

      if (String(view).includes("church/public/contact")) {
        Object.assign(
          nextLocals,
          websiteContentService.preparePublicViewModel(
            org,
            br,
            mode === "populated"
              ? {
                  office_hours: "Monday – Friday · 09:00 – 16:00",
                  map_embed_placeholder: "https://maps.example.com/alpha-grace",
                }
              : {},
            { activePage: "contact" }
          ),
          {
            activePage: "contact",
            isVerticalApex: false,
            contactSubmitted: mode === "success",
            contactError: mode === "error" ? "Please enter your name." : null,
            contactForm:
              mode === "error"
                ? { full_name: "", email: "bad@", phone: "", message: "Hi" }
                : {},
          }
        );
      }

      return render(view, nextLocals, cb);
    };
    next();
  });

  app.use(churchRoutes());
  return app;
}

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  await page.screenshot({ path: file, fullPage: true });
  return overflow;
}

async function runMode(mode) {
  const app = makeBranchApp({ mode });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      page.on("pageerror", (err) => {
        results.push({ mode, vp: vp.name, error: String(err) });
      });

      if (mode === "populated" || mode === "empty") {
        for (const route of ["giving", "contact"]) {
          const file = path.join(OUT_DIR, `${mode}-${route}-${vp.name}.png`);
          const overflow = await shot(page, `http://127.0.0.1:${PORT}/${route}`, file);
          results.push({ mode, route, vp: vp.name, ...overflow });
        }
      } else if (mode === "success" || mode === "error") {
        const file = path.join(OUT_DIR, `${mode}-contact-${vp.name}.png`);
        const overflow = await shot(page, `http://127.0.0.1:${PORT}/contact`, file);
        results.push({ mode, route: "contact", vp: vp.name, ...overflow });
      }

      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  return results;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = [];
  for (const mode of ["populated", "empty", "success", "error"]) {
    all.push(...(await runMode(mode)));
  }

  const overflows = all.filter((r) => r.scrollWidth > r.innerWidth);
  const errors = all.filter((r) => r.error);
  const summary = {
    outDir: OUT_DIR,
    checked: all.length,
    overflows,
    errors,
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (overflows.length || errors.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
