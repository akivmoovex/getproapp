"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  renderPublicPage,
} = require("../src/activeclinic/http/renderActiveClinicPublic");

describe("ActiveClinic Pass 7 mobile patterns", () => {
  it("renders tenant bottom nav on browsing pages and hides on booking", () => {
    const home = renderPublicPage({
      pageId: "tenant-home",
      pageTitle: "Home",
      contentTemplate: "tenant/home",
      shellVariant: "tenant",
      locals: {
        csrfToken: "x",
        clinic: {
          clinicKey: "julflona-clinic",
          publicName: "Julflona Clinic",
          publicBookingEnabled: true,
          facilities: [],
        },
      },
    });
    assert.match(home, /acp-mobile-bottom-nav/);
    assert.match(home, /v7-parity-7/);

    const book = renderPublicPage({
      pageId: "booking-choose-doctor",
      pageTitle: "Choose doctor",
      contentTemplate: "booking/consultation-doctor",
      shellVariant: "tenant",
      locals: {
        csrfToken: "x",
        clinic: {
          clinicKey: "julflona-clinic",
          publicName: "Julflona Clinic",
          publicBookingEnabled: true,
        },
        profiles: [],
        draft: {},
        wizardSteps: [{ id: 1, label: "Type" }, { id: 2, label: "Doctor" }],
        wizardStep: 2,
      },
    });
    assert.doesNotMatch(book, /data-ac-mobile-bottom-nav="tenant"/);
  });

  it("ships Pass 7 mobile CSS tokens and bottom-nav rules", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "ac-public.css"),
      "utf8"
    );
    assert.match(css, /--acp-bottom-nav-h/);
    assert.match(css, /\.acp-mobile-bottom-nav/);
    assert.match(css, /Pass 7/);
    assert.match(css, /acp-booking-actions[\s\S]*position:\s*fixed/);

    const app = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "ac-app.css"),
      "utf8"
    );
    assert.match(app, /Pass 7 — authenticated mobile shell/);

    const phone = fs.readFileSync(
      path.join(__dirname, "..", "public", "activeclinic", "ac-phone-field.css"),
      "utf8"
    );
    assert.match(phone, /max-width:\s*430px/);
  });
});
