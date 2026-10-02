"use strict";

/**
 * Phase2 Prompt 038 — registration email delivery adapter audit + safe stub tests.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const {
  DELIVERY_CODE,
  UNAVAILABLE_MESSAGE,
  createUnavailableRegistrationEmailAdapter,
  sendRegistrationVerificationEmail,
} = require("../src/blessboard/services/registrationEmailVerificationDelivery");
const {
  buildRegistrationVerificationEmailMessage,
} = require("../src/blessboard/services/registrationEmailVerificationMessage");

const TOKEN = "super-secret-verification-token-do-not-log";
const PACKAGE_JSON = path.join(__dirname, "../package.json");
const DELIVERY_SRC = path.join(
  __dirname,
  "../src/blessboard/services/registrationEmailVerificationDelivery.js"
);

function baseInput(overrides = {}) {
  return {
    churchName: "Grace Community Church",
    applicantEmail: "admin@example.com",
    plaintextToken: TOKEN,
    expiresAt: "2026-07-25T12:00:00.000Z",
    publicBaseUrl: "https://blessboard.com",
    ...overrides,
  };
}

describe("registration email delivery (Prompt 038)", () => {
  it("documents that no third-party mail provider dependency is present", () => {
    const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
    const all = {
      ...(pkg.dependencies || {}),
      ...(pkg.devDependencies || {}),
    };
    for (const name of [
      "nodemailer",
      "@sendgrid/mail",
      "sendgrid",
      "@aws-sdk/client-ses",
      "postmark",
      "resend",
      "mailgun.js",
      "mailgun-js",
    ]) {
      assert.equal(all[name], undefined, `unexpected dependency ${name}`);
    }
    const src = fs.readFileSync(DELIVERY_SRC, "utf8");
    assert.match(src, /no nodemailer|No nodemailer|not configured/i);
  });

  it("unavailable adapter does not claim delivery and returns accepted_for_processing false", async () => {
    const adapter = createUnavailableRegistrationEmailAdapter();
    assert.equal(adapter.sendingAvailable, false);
    const result = await adapter.send({
      recipient: "admin@example.com",
      subject: "test",
    });
    assert.equal(result.accepted_for_processing, false);
    assert.equal(result.delivered, false);
    assert.equal(result.sendingAvailable, false);
    assert.equal(result.code, DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE);
    assert.match(result.message, /not configured|not sent/i);
  });

  it("sendRegistrationVerificationEmail uses the Prompt 037 message builder", async () => {
    let built = null;
    const result = await sendRegistrationVerificationEmail(baseInput(), {
      buildMessage: (input) => {
        built = buildRegistrationVerificationEmailMessage(input);
        return built;
      },
    });
    assert.ok(built);
    assert.equal(built.recipient, "admin@example.com");
    assert.match(built.verificationUrl, /\/register\/email-verification\//);
    assert.equal(result.ok, false);
    assert.equal(result.accepted_for_processing, false);
    assert.equal(result.sendingAvailable, false);
    assert.equal(result.delivered, false);
    assert.equal(result.code, DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE);
    assert.equal(result.message, UNAVAILABLE_MESSAGE);
    assert.equal(result.recipient, "admin@example.com");
    assert.equal(result.adapterId, "registration_email_unavailable");
  });

  it("does not pass plaintext token or verification URL to the unavailable adapter", async () => {
    let received = null;
    const result = await sendRegistrationVerificationEmail(baseInput(), {
      adapter: {
        id: "spy-unavailable",
        sendingAvailable: false,
        async send(envelope) {
          received = envelope;
          return {
            accepted_for_processing: false,
            sendingAvailable: false,
            delivered: false,
            code: DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
            message: UNAVAILABLE_MESSAGE,
          };
        },
      },
    });
    assert.equal(result.accepted_for_processing, false);
    assert.ok(received);
    assert.equal(received.recipient, "admin@example.com");
    assert.ok(received.subject);
    assert.equal(received.plainTextBody, undefined);
    assert.equal(received.htmlBody, undefined);
    assert.equal(received.verificationUrl, undefined);
    assert.doesNotMatch(JSON.stringify(received), new RegExp(TOKEN));
  });

  it("does not log the plaintext verification token", async () => {
    const lines = [];
    const original = {
      log: console.log,
      info: console.info,
      warn: console.warn,
      error: console.error,
      debug: console.debug,
    };
    const capture = (...args) => {
      lines.push(args.map((a) => String(a)).join(" "));
    };
    console.log = capture;
    console.info = capture;
    console.warn = capture;
    console.error = capture;
    console.debug = capture;
    try {
      await sendRegistrationVerificationEmail(baseInput());
    } finally {
      console.log = original.log;
      console.info = original.info;
      console.warn = original.warn;
      console.error = original.error;
      console.debug = original.debug;
    }
    const joined = lines.join("\n");
    assert.doesNotMatch(joined, new RegExp(TOKEN));
    assert.doesNotMatch(joined, /email-verification\/super-secret/);
  });

  it("returns invalid_input without claiming delivery when the builder fails", async () => {
    const result = await sendRegistrationVerificationEmail({
      applicantEmail: "admin@example.com",
    });
    assert.equal(result.ok, false);
    assert.equal(result.accepted_for_processing, false);
    assert.equal(result.delivered, false);
    assert.equal(result.code, DELIVERY_CODE.INVALID_INPUT);
    assert.equal(result.recipient, null);
  });

  it("can exercise a future sendingAvailable adapter without changing the default stub", async () => {
    const result = await sendRegistrationVerificationEmail(baseInput(), {
      adapter: {
        id: "fake-future",
        sendingAvailable: true,
        async send(envelope) {
          assert.match(envelope.verificationUrl, new RegExp(encodeURIComponent(TOKEN)));
          return {
            accepted_for_processing: true,
            sendingAvailable: true,
            delivered: true,
            code: "sent",
            message: "accepted",
          };
        },
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.accepted_for_processing, true);
    assert.equal(result.delivered, true);
    assert.equal(result.adapterId, "fake-future");
  });
});

describe("resendRegistrationVerificationEmail orchestration (Prompt 039)", () => {
  const {
    resendRegistrationVerificationEmail,
    RESEND_STATUS,
  } = require("../src/blessboard/services/registrationEmailVerificationDelivery");

  it("creates a token, sends via adapter, and never returns the plaintext token", async () => {
    let createInput = null;
    let sendInput = null;
    const result = await resendRegistrationVerificationEmail(
      {
        applicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        publicBaseUrl: "https://blessboard.com",
      },
      {
        client: {},
        findRegistrationApplicationById: async () => ({
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          contact_email: "admin@example.com",
          church_name: "Grace",
        }),
        createVerificationToken: async (input) => {
          createInput = input;
          return {
            ok: true,
            rawToken: TOKEN,
            expiresAt: "2026-07-25T12:00:00.000Z",
            token: { expiresAt: "2026-07-25T12:00:00.000Z" },
          };
        },
        sendRegistrationVerificationEmail: async (input) => {
          sendInput = input;
          return {
            ok: true,
            accepted_for_processing: true,
            delivered: true,
            sendingAvailable: true,
            code: "sent",
            message: "ok",
            recipient: input.applicantEmail,
          };
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(result.code, RESEND_STATUS.SENT);
    assert.equal(createInput.email, "admin@example.com");
    assert.equal(createInput.createdByUserId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    assert.equal(sendInput.plaintextToken, TOKEN);
    assert.equal(result.rawToken, undefined);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  });

  it("maps cooldown and sending unavailable without approval-side effects", async () => {
    const cooldown = await resendRegistrationVerificationEmail(
      {
        applicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        publicBaseUrl: "https://blessboard.com",
      },
      {
        client: {},
        findRegistrationApplicationById: async () => ({
          contact_email: "admin@example.com",
          church_name: "Grace",
        }),
        createVerificationToken: async () => {
          const err = new Error("resend_cooldown");
          err.code = "resend_cooldown";
          err.retryAfterMs = 12000;
          throw err;
        },
      }
    );
    assert.equal(cooldown.ok, false);
    assert.equal(cooldown.code, RESEND_STATUS.COOLDOWN);

    const unavailable = await resendRegistrationVerificationEmail(
      {
        applicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        publicBaseUrl: "https://blessboard.com",
      },
      {
        client: {},
        findRegistrationApplicationById: async () => ({
          contact_email: "admin@example.com",
          church_name: "Grace",
        }),
        createVerificationToken: async () => ({
          ok: true,
          rawToken: TOKEN,
          expiresAt: "2026-07-25T12:00:00.000Z",
        }),
        sendRegistrationVerificationEmail: async () => ({
          ok: false,
          accepted_for_processing: false,
          delivered: false,
          sendingAvailable: false,
          code: DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE,
          message: UNAVAILABLE_MESSAGE,
          recipient: "admin@example.com",
        }),
      }
    );
    assert.equal(unavailable.ok, false);
    assert.equal(unavailable.code, RESEND_STATUS.SENDING_UNAVAILABLE);
    assert.equal(JSON.stringify(unavailable).includes(TOKEN), false);
  });
});
