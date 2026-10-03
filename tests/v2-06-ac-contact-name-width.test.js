"use strict";

/**
 * V2.06 P2 — AC /contact "Your name" input must be full width like email.
 *
 * Root cause: CSS targeted input[type="text"], but name lacked type= → UA size≈20.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.06 AC contact name width", () => {
  it("markup keeps type=text and CSS does not rely on [type=text] alone", () => {
    const ejs = read("views/activeclinic/public/contact.ejs");
    const css = read("public/activeclinic/acw-platform.css");
    const nameInput = ejs.match(/<input[^>]*id="senderName"[\s\S]*?\/>/);
    assert.ok(nameInput, "senderName input");
    assert.match(nameInput[0], /type="text"/);
    assert.match(css, /\.acw-contact-form \.acp-field input:not\(\[type="hidden"\]\)/);
    assert.match(css, /min-width:\s*0/);
    // Must not be the brittle type-only list as the sole width rule.
    assert.doesNotMatch(
      css,
      /\.acw-contact-form input\[type="text"\],\s*\n\.acw-contact-form input\[type="email"\]/
    );
  });

  it("name matches email width at 1440 / 768 / 390 (with and without type=text)", async () => {
    const css =
      read("public/activeclinic/ac-tokens.css") +
      read("public/activeclinic/ac-public.css") +
      read("public/activeclinic/acw-platform.css");
    const browser = await chromium.launch({ headless: true });
    try {
      for (const width of [1440, 768, 390]) {
        for (const withType of [true, false]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          const typeAttr = withType ? ' type="text"' : "";
          await page.setContent(
            `<!doctype html><html><head><style>${css}</style></head><body class="ac-public-body ac-public--platform">
<article class="acw-contact-page"><section class="acw-contact-main"><div class="acw-contact-wrap acw-contact-main__grid">
<div class="acw-contact-form-card"><form class="acw-contact-form">
  <div class="acp-field"><label for="senderName">Your name</label>
    <input id="senderName" name="senderName"${typeAttr} required maxlength="120" autocomplete="name" placeholder="e.g. Dr. Mutale Phiri or Mwansa Banda"/>
  </div>
  <div class="acp-field"><label for="senderEmail">Email address</label>
    <input id="senderEmail" name="senderEmail" type="email" required autocomplete="email" placeholder="name@organization.com"/>
  </div>
  <div class="acp-field"><label for="message">Message</label>
    <textarea id="message" name="message" rows="5"></textarea>
  </div>
</form></div></div></section></article></body></html>`,
            { waitUntil: "load" }
          );
          const m = await page.evaluate(() => {
            const name = document.getElementById("senderName");
            const email = document.getElementById("senderEmail");
            const form = document.querySelector(".acw-contact-form");
            return {
              nameW: name.getBoundingClientRect().width,
              emailW: email.getBoundingClientRect().width,
              formW: form.getBoundingClientRect().width,
              nameCsWidth: getComputedStyle(name).width,
              placeholder: name.placeholder,
            };
          });
          assert.ok(m.formW > 200, `${width} form width`);
          assert.ok(
            Math.abs(m.nameW - m.emailW) <= 1,
            `${width}px type=${withType}: name ${m.nameW} vs email ${m.emailW}`
          );
          assert.ok(
            m.nameW >= m.formW - 2,
            `${width}px type=${withType}: name ${m.nameW} should fill form ${m.formW}`
          );
          // Placeholder must not be clipped to a few characters of field width.
          assert.ok(
            m.nameW > 280 || width <= 390,
            `${width}px name too narrow for placeholder (${m.nameW})`
          );
          await page.close();
        }
      }
    } finally {
      await browser.close();
    }
  });

  it("smoke: other ACW form field rules still use full-width patterns", () => {
    const css = read("public/activeclinic/acw-platform.css");
    assert.match(css, /\.acw-register \.ac-public-form \.ac-form-field input[\s\S]*width:\s*100%/);
    assert.match(css, /\.acw-search input[\s\S]*width:\s*100%/);
  });
});
