"use strict";

/**
 * Platform-admin mobile burger / drawer — markup + shell-nav behavior.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, beforeEach, afterEach } = require("node:test");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function loadShellNav(sandbox) {
  const code = read("public/blessboard/v5/shell-nav.js");
  vm.runInNewContext(code, sandbox, { filename: "shell-nav.js" });
  return sandbox.BlessBoardShellNav;
}

/**
 * Minimal DOM sufficient for bindShellDrawer coverage.
 */
function createDrawerDom() {
  const listeners = new Map();

  function makeEl(tag, attrs) {
    const el = {
      tagName: String(tag).toUpperCase(),
      attrs: Object.assign({}, attrs || {}),
      children: [],
      parentNode: null,
      style: {},
      hidden: Boolean(attrs && attrs.hidden != null),
      classList: {
        _set: new Set(),
        add(name) {
          this._set.add(name);
        },
        remove(name) {
          this._set.delete(name);
        },
        toggle(name, force) {
          if (force === true) this._set.add(name);
          else if (force === false) this._set.delete(name);
          else if (this._set.has(name)) this._set.delete(name);
          else this._set.add(name);
          return this._set.has(name);
        },
        contains(name) {
          return this._set.has(name);
        },
      },
      getAttribute(name) {
        if (name === "hidden") return this.hidden ? "" : null;
        return Object.prototype.hasOwnProperty.call(this.attrs, name)
          ? this.attrs[name]
          : null;
      },
      setAttribute(name, value) {
        if (name === "hidden") {
          this.hidden = true;
          return;
        }
        this.attrs[name] = String(value);
      },
      removeAttribute(name) {
        if (name === "hidden") {
          this.hidden = false;
          return;
        }
        if (name === "inert") {
          delete this.attrs.inert;
          return;
        }
        delete this.attrs[name];
      },
      hasAttribute(name) {
        if (name === "hidden") return this.hidden;
        return Object.prototype.hasOwnProperty.call(this.attrs, name);
      },
      focus() {
        document.activeElement = this;
      },
      addEventListener(type, fn) {
        const key = type;
        if (!listeners.has(this)) listeners.set(this, new Map());
        const map = listeners.get(this);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(fn);
      },
      querySelector(sel) {
        return queryAll(this, sel)[0] || null;
      },
      querySelectorAll(sel) {
        return queryAll(this, sel);
      },
      closest(sel) {
        let node = this;
        while (node) {
          if (matches(node, sel)) return node;
          node = node.parentNode;
        }
        return null;
      },
      contains(other) {
        let node = other;
        while (node) {
          if (node === this) return true;
          node = node.parentNode;
        }
        return false;
      },
    };
    return el;
  }

  function matches(el, sel) {
    if (sel === "a[href]") return el.tagName === "A" && el.attrs.href;
    if (sel.startsWith("#")) return el.attrs.id === sel.slice(1);
    if (sel.startsWith(".")) return el.classList.contains(sel.slice(1));
    if (sel.includes("[data-bb-nav=")) {
      const m = sel.match(/\[data-bb-nav="([^"]+)"\]/);
      if (m && el.attrs["data-bb-nav"] === m[1]) {
        if (sel.includes("[aria-label]") && !el.attrs["aria-label"]) return false;
        if (sel.startsWith("a")) return el.tagName === "A";
        if (sel.startsWith("button") || sel.includes("button")) {
          return el.tagName === "BUTTON" || el.attrs["data-bb-nav"] === m[1];
        }
        return true;
      }
    }
    if (sel === "a, button") return el.tagName === "A" || el.tagName === "BUTTON";
    if (sel === 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])') {
      if (el.tagName === "A" && el.attrs.href) return true;
      if (el.tagName === "BUTTON" && !el.hasAttribute("disabled")) return true;
      if (el.attrs.tabindex != null && el.attrs.tabindex !== "-1") return true;
      return false;
    }
    if (sel === ".bb-pa-drawer__close") return el.classList.contains("bb-pa-drawer__close");
    return false;
  }

  function walk(node, out) {
    out.push(node);
    (node.children || []).forEach((c) => walk(c, out));
  }

  function queryAll(rootEl, sel) {
    const parts = sel.split(",").map((s) => s.trim());
    const all = [];
    walk(rootEl, all);
    return all.filter((el) => parts.some((p) => matches(el, p)));
  }

  function append(parent, child) {
    child.parentNode = parent;
    parent.children.push(child);
    return child;
  }

  const document = {
    activeElement: null,
    body: makeEl("body"),
    getElementById(id) {
      const all = [];
      walk(document.body, all);
      return all.find((el) => el.attrs.id === id) || null;
    },
    querySelector(sel) {
      return document.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      return queryAll(document.body, sel);
    },
    addEventListener(type, fn) {
      if (!listeners.has(document)) listeners.set(document, new Map());
      const map = listeners.get(document);
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(fn);
    },
  };

  const toggle = makeEl("button", {
    id: "bb-pa-menu-btn",
    "data-bb-nav": "mobile-toggle",
    "aria-controls": "bb-pa-drawer",
    "aria-expanded": "false",
    "aria-label": "Open navigation",
  });
  const drawer = makeEl("div", {
    id: "bb-pa-drawer",
    "data-bb-nav": "mobile-drawer",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Platform admin navigation",
    inert: "",
    hidden: "",
  });
  drawer.hidden = true;
  const scrim = makeEl("div", { "data-bb-nav": "drawer-close" });
  const closeBtn = makeEl("button", {
    "data-bb-nav": "drawer-close",
    "aria-label": "Close navigation",
  });
  closeBtn.classList.add("bb-pa-drawer__close");
  const link = makeEl("a", { href: "/admin/organizations" });
  const live = makeEl("div", { id: "bb-shell-nav-live" });
  live.textContent = "";

  append(document.body, live);
  append(document.body, toggle);
  append(document.body, drawer);
  append(drawer, scrim);
  append(drawer, closeBtn);
  append(drawer, link);

  function emit(target, type, event) {
    const map = listeners.get(target);
    if (!map || !map.has(type)) return;
    map.get(type).forEach((fn) => fn(event || { key: null, target, preventDefault() {} }));
  }

  return {
    document,
    toggle,
    drawer,
    scrim,
    closeBtn,
    link,
    live,
    emit,
    listeners,
  };
}

describe("platform-admin mobile burger markup", () => {
  const start = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
  const end = read("views/blessboard/v5/partials/platform-admin-shell-end.ejs");
  const css = read("public/blessboard/v5/platform-admin.css");
  const nav = read("src/platform/http/platformAdminNav.js");
  const locals = read("src/platform/http/platformAdminShellLocals.js");

  it("keeps desktop sidebar markup and hides it only below 900px via CSS", () => {
    assert.match(start, /data-bb-nav="desktop-sidebar"/);
    assert.match(start, /data-bb-nav="desktop"/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*?\.bb-pa-sidebar\s*\{[^}]*display:\s*flex/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*?\.bb-pa-top,\s*\n\s*\.bb-pa-drawer/);
  });

  it("renders burger button with accessibility attributes", () => {
    assert.match(start, /data-bb-nav="mobile-toggle"/);
    assert.match(start, /id="bb-pa-menu-btn"/);
    assert.match(start, /aria-controls="bb-pa-drawer"/);
    assert.match(start, /aria-expanded="false"/);
    assert.match(start, /aria-label="Open navigation"/);
    assert.match(start, /bb-pa-nav-toggle__bar/);
  });

  it("drawer renders canonical PLATFORM_ADMIN_NAV hrefs from server locals", () => {
    assert.match(start, /paNav\.forEach/);
    assert.match(start, /data-bb-nav="mobile-links"/);
    assert.match(nav, /href: "\/admin"/);
    assert.match(nav, /href: "\/admin\/organizations"/);
    assert.match(nav, /href: "\/admin\/registration-applications"/);
    assert.match(nav, /href: "\/admin\/subscriptions"/);
    assert.match(nav, /href: "\/admin\/maintenance"/);
    assert.match(locals, /PLATFORM_ADMIN_NAV\.filter/);
    assert.match(locals, /testingMaintenance \|\| !item\.testingOnly/);
    assert.doesNotMatch(start, /href="\/admin\/tenants"/);
    assert.doesNotMatch(start, /href="\/admin\/tickets"/);
  });

  it("active route uses aria-current=page in desktop and drawer loops", () => {
    const current = start.match(/aria-current="page"/g) || [];
    assert.ok(current.length >= 2, "desktop + drawer active markers");
  });

  it("does not duplicate mobile bottom tabs beside the burger", () => {
    assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
    assert.doesNotMatch(end, /bb-pa-bottom/);
    assert.match(css, /\.bb-pa-bottom\s*\{[^}]*display:\s*none\s*!important/);
  });

  it("logout remains POST with CSRF in sidebar and drawer", () => {
    const logoutForms = start.match(/method="post" action="\/admin\/logout"/g) || [];
    assert.equal(logoutForms.length, 2);
    assert.match(start, /name="_csrf"/);
    assert.doesNotMatch(start, /method="get" action="\/admin\/logout"/i);
  });

  it("cache-busts platform-admin CSS and shell-nav JS together", () => {
    assert.match(start, /platform-admin\.css\?v=30/);
    assert.match(end, /shell-nav\.js\?v=2"/);
  });
});

describe("shell-nav drawer behavior (isolated DOM)", () => {
  let dom;
  let api;
  let matchMediaState;
  let timers;

  beforeEach(() => {
    timers = [];
    dom = createDrawerDom();
    matchMediaState = { matches: false, listeners: [] };
    const sandbox = {
      window: {},
      globalThis: {},
      document: dom.document,
      setTimeout(fn) {
        timers.push(fn);
        return timers.length;
      },
      matchMedia() {
        return {
          matches: matchMediaState.matches,
          addEventListener(_type, fn) {
            matchMediaState.listeners.push(fn);
          },
          addListener(fn) {
            matchMediaState.listeners.push(fn);
          },
        };
      },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const ShellNav = loadShellNav(sandbox);
    api = ShellNav.bindShellDrawer({
      drawerId: "bb-pa-drawer",
      bodyOpenClass: "bb-pa-drawer-open",
      desktopMediaQuery: "(min-width: 900px)",
      openLabel: "Open navigation",
      closeLabel: "Close navigation",
      closeOnNavigate: true,
    });
  });

  afterEach(() => {
    api = null;
    dom = null;
  });

  it("opens and closes via toggle, updating aria-expanded and focus", () => {
    assert.equal(api.isOpen(), false);
    dom.emit(dom.toggle, "click");
    assert.equal(api.isOpen(), true);
    assert.equal(dom.toggle.getAttribute("aria-expanded"), "true");
    assert.equal(dom.toggle.getAttribute("aria-label"), "Close navigation");
    assert.equal(dom.document.activeElement, dom.closeBtn);

    dom.emit(dom.toggle, "click");
    assert.equal(api.isOpen(), false);
    assert.equal(dom.toggle.getAttribute("aria-expanded"), "false");
    assert.equal(dom.document.activeElement, dom.toggle);
  });

  it("closes on Escape and restores focus to burger", () => {
    api.setOpen(true);
    dom.emit(dom.document, "keydown", {
      key: "Escape",
      preventDefault() {},
    });
    assert.equal(api.isOpen(), false);
    assert.equal(dom.document.activeElement, dom.toggle);
  });

  it("closes on backdrop / close button", () => {
    api.setOpen(true);
    dom.emit(dom.scrim, "click");
    assert.equal(api.isOpen(), false);

    api.setOpen(true);
    dom.emit(dom.closeBtn, "click");
    assert.equal(api.isOpen(), false);
  });

  it("closes when a navigation link is selected", () => {
    api.setOpen(true);
    dom.emit(dom.drawer, "click", {
      target: dom.link,
      defaultPrevented: false,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {},
    });
    assert.equal(api.isOpen(), false);
  });

  it("closes when viewport matches desktop breakpoint", () => {
    api.setOpen(true);
    matchMediaState.matches = true;
    matchMediaState.listeners.forEach((fn) => fn({ matches: true }));
    assert.equal(api.isOpen(), false);
  });

  it("is a no-op on pages without drawer elements", () => {
    const sandbox = {
      window: {},
      globalThis: {},
      document: {
        querySelector() {
          return null;
        },
        getElementById() {
          return null;
        },
      },
      matchMedia() {
        return { matches: false, addEventListener() {} };
      },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    const ShellNav = loadShellNav(sandbox);
    assert.equal(
      ShellNav.bindShellDrawer({
        drawerId: "missing",
        bodyOpenClass: "x",
      }),
      null
    );
  });
});
