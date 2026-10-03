"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

test("V2.06 BB apex inner pages hide desktop header actions on mobile", () => {
  const css = fs.readFileSync(path.join(ROOT, "public/blessboard/v5/apex.css"), "utf8");
  const shell = fs.readFileSync(
    path.join(ROOT, "views/blessboard/v5/partials/apex-shell-start.ejs"),
    "utf8"
  );

  assert.match(shell, /class="bb-apex-header__actions"/);
  assert.match(shell, /class="bb-apex-btn bb-apex-btn--ghost bb-apex-btn--header"[^>]*>Sign In/);
  assert.match(shell, /class="bb-apex-menu-btn bb-shell-burger"/);
  assert.match(
    css,
    /@media \(max-width: 899px\)[\s\S]*?\.bb-apex-header__actions \.bb-apex-btn--header,[\s\S]*?display:\s*none\s*!important/
  );
});
