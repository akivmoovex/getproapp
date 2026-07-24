"use strict";

/**
 * Phase2 Prompt 037 — pure registration email-verification message builder tests.
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  PUBLIC_VERIFY_PATH_PREFIX,
  escapeHtml,
  buildVerificationUrl,
  buildRegistrationVerificationEmailMessage,
} = require("../src/blessboard/services/registrationEmailVerificationMessage");

const BASE = "https://blessboard.com";
const TOKEN = "tok_plain_abc+/=xyz";
const EXPIRES = "2026-07-25T12:00:00.000Z";

function baseInput(overrides = {}) {
  return {
    churchName: "Grace Community Church",
    applicantEmail: "admin@example.com",
    plaintextToken: TOKEN,
    expiresAt: EXPIRES,
    publicBaseUrl: BASE,
    ...overrides,
  };
}

describe("registrationEmailVerificationMessage (Prompt 037)", () => {
  it("uses the approved public verify path from audit 033", () => {
    assert.equal(PUBLIC_VERIFY_PATH_PREFIX, "/register/email-verification");
    const url = buildVerificationUrl(BASE, "abc");
    assert.equal(url, `${BASE}/register/email-verification/abc`);
  });

  it("returns recipient, subject, plain text, HTML, and verification URL", () => {
    const msg = buildRegistrationVerificationEmailMessage(baseInput());
    assert.equal(msg.recipient, "admin@example.com");
    assert.match(msg.subject, /Grace Community Church/);
    assert.match(msg.plainTextBody, /Grace Community Church/);
    assert.match(msg.plainTextBody, /admin@example\.com/);
    assert.match(msg.plainTextBody, /expires at/i);
    assert.match(msg.plainTextBody, /never ask for your password/i);
    assert.match(msg.plainTextBody, /ignore this message/i);
    assert.match(msg.htmlBody, /Verify email address/);
    assert.equal(
      msg.verificationUrl,
      `${BASE}/register/email-verification/${encodeURIComponent(TOKEN)}`
    );
    assert.ok(msg.plainTextBody.includes(msg.verificationUrl));
  });

  it("accepts applicationName as church/application name", () => {
    const msg = buildRegistrationVerificationEmailMessage(
      baseInput({ churchName: undefined, applicationName: "Hope Chapel" })
    );
    assert.match(msg.subject, /Hope Chapel/);
    assert.match(msg.plainTextBody, /Hope Chapel/);
  });

  it("URL-encodes the plaintext token in the verification URL", () => {
    const special = "a/b?c=d&e=f#g";
    const msg = buildRegistrationVerificationEmailMessage(
      baseInput({ plaintextToken: special })
    );
    assert.equal(
      msg.verificationUrl,
      `${BASE}/register/email-verification/${encodeURIComponent(special)}`
    );
    assert.doesNotMatch(msg.verificationUrl, /\/a\/b\?/);
    assert.match(msg.verificationUrl, /a%2Fb/);
  });

  it("strips trailing slashes from publicBaseUrl", () => {
    const msg = buildRegistrationVerificationEmailMessage(
      baseInput({ publicBaseUrl: "https://blessboard.com/" })
    );
    assert.equal(
      msg.verificationUrl,
      `https://blessboard.com/register/email-verification/${encodeURIComponent(TOKEN)}`
    );
  });

  it("escapes HTML values in the HTML body", () => {
    const church = `Grace <script>alert(1)</script> & "Co"`;
    const email = `a<b>@example.com`;
    const msg = buildRegistrationVerificationEmailMessage(
      baseInput({ churchName: church, applicantEmail: email })
    );
    assert.doesNotMatch(msg.htmlBody, /<script>alert\(1\)<\/script>/);
    assert.match(msg.htmlBody, /Grace &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Co&quot;/);
    assert.match(msg.htmlBody, /a&lt;b&gt;@example\.com/);
    assert.equal(escapeHtml(`<x>&"`), "&lt;x&gt;&amp;&quot;");
  });

  it("does not include passwords or sensitive application details", () => {
    const msg = buildRegistrationVerificationEmailMessage(
      baseInput({
        churchName: "Grace",
        // Extra fields must be ignored even if passed by mistake.
        password: "hunter2",
        applicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        contactPhone: "+260971000001",
        riskDecision: "review",
      })
    );
    assert.doesNotMatch(msg.plainTextBody, /hunter2|aaaaaaaa-bbbb|260971000001|riskDecision/i);
    assert.doesNotMatch(msg.htmlBody, /hunter2|aaaaaaaa-bbbb|260971000001|riskDecision/i);
    assert.doesNotMatch(msg.subject, /hunter2|aaaaaaaa-bbbb/i);
  });

  it("rejects missing required fields", () => {
    assert.throws(() => buildRegistrationVerificationEmailMessage({}), /churchName/);
    assert.throws(
      () => buildRegistrationVerificationEmailMessage(baseInput({ applicantEmail: "" })),
      /applicantEmail/
    );
    assert.throws(
      () => buildRegistrationVerificationEmailMessage(baseInput({ plaintextToken: " " })),
      /plaintextToken/
    );
    assert.throws(
      () => buildRegistrationVerificationEmailMessage(baseInput({ publicBaseUrl: "not-a-url" })),
      /publicBaseUrl/
    );
  });
});
