"use strict";

/**
 * Neutral setup / coming-soon page for unpublished BlessBoard public sites.
 * No draft CMS content. Always noindex.
 */

const { escapeAttr } = require("./tenantPublicSafe");

/**
 * @param {{
 *   publicName?: string|null,
 *   message?: string|null,
 * }} input
 */
function renderWebsiteSetupPage(input) {
  const name = String((input && input.publicName) || "This church").trim() || "This church";
  const message =
    String((input && input.message) || "").trim() ||
    "This website is being prepared and is not public yet.";
  const safeName = escapeAttr(name);
  const safeMessage = escapeAttr(message);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${safeName} · Coming soon</title>
  <link rel="stylesheet" href="/blessboard/v5/tenant-public.css?v=29" />
</head>
<body class="bb-tp-body" data-bb-product="blessboard-v5" data-bb-shell="tenant-public-setup">
  <main class="bb-tp-main" style="max-width:40rem;margin:4rem auto;padding:1.5rem;">
    <p class="bb-tp-brand">${safeName}</p>
    <h1>Website coming soon</h1>
    <p>${safeMessage}</p>
    <p><a href="https://blessboard.org/">BlessBoard</a></p>
  </main>
</body>
</html>`;
}

module.exports = {
  renderWebsiteSetupPage,
};
