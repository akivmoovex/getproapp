/**
 * Combobox autocomplete from first character; optional typewriter watermark on empty fields.
 * Service/city lists: GET /data/tenant-search-lists.json (DB-backed per tenant + trending categories).
 */
(function () {
  const LIST_URL = "/data/tenant-search-lists.json?v=20260412a";
  const TYPEAHEAD_URL = "/data/search-suggestions.json";
  const TYPEAHEAD_MIN_LEN = 2;
  const TYPEAHEAD_DEBOUNCE_MS = 200;

  const TYPE_MS = 95;
  const PAUSE_END_MS = 1600;
  const PAUSE_RESTART_MS = 400;

  function norm(s) {
    return String(s || "")
      .trim()
      .toLowerCase();
  }

  function filterPool(pool, q) {
    const n = norm(q);
    if (n.length < 1) return [];
    const out = [];
    for (let i = 0; i < pool.length; i++) {
      if (norm(pool[i]).includes(n)) out.push(pool[i]);
      if (out.length >= 12) break;
    }
    return out;
  }

  function exactMatch(pool, typed) {
    const n = norm(typed);
    if (!n) return null;
    for (let i = 0; i < pool.length; i++) {
      if (norm(pool[i]) === n) return pool[i];
    }
    return null;
  }

  /** Best canonical value from pool for a typed fragment (exact, else first prefix match). */
  function pickFromPool(pool, raw) {
    const t = String(raw || "").trim();
    if (!t) return "";
    const ex = exactMatch(pool, t);
    if (ex) return ex;
    const f = filterPool(pool, t);
    if (f.length >= 1) return f[0];
    return "";
  }

  const RECENT_KEY_PREFIX = "getpro:recentSearch:v1:";

  function recentStorageKey(tenantSlug) {
    return RECENT_KEY_PREFIX + (tenantSlug || "global");
  }

  function loadRecentEntries(tenantSlug) {
    try {
      const raw = localStorage.getItem(recentStorageKey(tenantSlug));
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveRecentEntries(tenantSlug, entries) {
    try {
      localStorage.setItem(recentStorageKey(tenantSlug), JSON.stringify(entries));
    } catch {
      /* quota / private mode */
    }
  }

  function pushRecentEntry(tenantSlug, entry) {
    const q = String(entry.q || "").trim();
    const city = String(entry.city || "").trim();
    const category = String(entry.category || "").trim();
    if (!q && !city && !category) return;
    let list = loadRecentEntries(tenantSlug);
    list = list.filter(
      (x) =>
        !(
          norm(x.q) === norm(q) &&
          norm(x.city) === norm(city) &&
          String(x.category || "").trim() === category
        )
    );
    list.unshift({ q, city, category });
    list = list.slice(0, 5);
    saveRecentEntries(tenantSlug, list);
  }

  function readSearchMeta(form) {
    const raw = form && form.getAttribute("data-search-meta");
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw));
    } catch {
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    }
  }

  function getCategoryFromForm(form) {
    const sel = form.querySelector('select[name="category"]');
    if (sel) return String(sel.value || "").trim();
    const hid = form.querySelector('input[type="hidden"][name="category"]');
    return hid ? String(hid.value || "").trim() : "";
  }

  function saveRecentFromForm(form) {
    const meta = readSearchMeta(form);
    if (!meta) return;
    const tenantSlug = meta.tenantSlug || "global";
    const sWrap = form.querySelector('.pro-ac[data-ac-list="service"]');
    const cWrap = form.querySelector('.pro-ac[data-ac-list="city"]');
    const sIn = sWrap ? sWrap.querySelector(".pro-ac-input") : null;
    const cIn = cWrap ? cWrap.querySelector(".pro-ac-input") : null;
    const q = sIn ? sIn.value.trim() : "";
    const city = cIn ? cIn.value.trim() : "";
    const category = getCategoryFromForm(form);
    pushRecentEntry(tenantSlug, { q, city, category });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Highlight first case-insensitive match of q in text (for typeahead rows). */
  function highlightMatch(text, qRaw) {
    const t = String(text || "");
    const q = String(qRaw || "").trim();
    const nq = norm(q);
    if (!nq) return escapeHtml(t);
    const lower = t.toLowerCase();
    const idx = lower.indexOf(nq);
    if (idx < 0) return escapeHtml(t);
    const len = q.length;
    return (
      escapeHtml(t.slice(0, idx)) +
      '<mark class="pro-ac-mark">' +
      escapeHtml(t.slice(idx, idx + len)) +
      "</mark>" +
      escapeHtml(t.slice(idx + len))
    );
  }

  function initTypewriterWatermark(wrap, input, hidden, phrase, startDelayMs) {
    const text = (phrase || "").trim();
    if (!text) return;

    const span = document.createElement("span");
    span.className = "pro-ac-watermark";
    span.setAttribute("aria-hidden", "true");
    wrap.insertBefore(span, input);

    let idx = 0;
    let timer = null;

    function shouldAnimate() {
      return !input.value.trim() && document.activeElement !== input;
    }

    function setVisible(show) {
      span.classList.toggle("pro-ac-watermark--off", !show);
    }

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(fn, ms) {
      clearTimer();
      timer = setTimeout(fn, ms);
    }

    /** Left-to-right typing, pause, clear, repeat */
    function step() {
      if (!shouldAnimate()) {
        setVisible(false);
        span.textContent = "";
        return;
      }
      setVisible(true);
      idx += 1;
      span.textContent = text.slice(0, idx);
      if (idx < text.length) {
        schedule(step, TYPE_MS);
      } else {
        schedule(() => {
          idx = 0;
          span.textContent = "";
          schedule(step, PAUSE_RESTART_MS);
        }, PAUSE_END_MS);
      }
    }

    function startLoop() {
      if (hidden.value) {
        setVisible(false);
        return;
      }
      clearTimer();
      idx = 0;
      span.textContent = "";
      schedule(() => {
        if (!shouldAnimate()) return;
        step();
      }, startDelayMs);
    }

    function stopLoop() {
      clearTimer();
      span.textContent = "";
      idx = 0;
      setVisible(false);
    }

    input.addEventListener("focus", () => {
      stopLoop();
    });

    input.addEventListener("input", () => {
      if (input.value.trim()) stopLoop();
      else if (document.activeElement !== input) startLoop();
    });

    input.addEventListener("blur", () => {
      if (!input.value.trim()) startLoop();
    });

    wrap.addEventListener("getpro-restart-watermark", () => {
      if (!hidden.value) startLoop();
    });

    if (!hidden.value) {
      startLoop();
    } else {
      setVisible(false);
    }
  }

  /** Rotates through multiple watermark phrases after each full type cycle (e.g. global home). */
  function initRotatingTypewriterWatermark(wrap, input, hidden, phrases, startDelayMs) {
    if (!phrases || phrases.length === 0) return;
    let phraseIndex = 0;
    let text = String(phrases[0] || "").trim();
    if (!text) return;

    const span = document.createElement("span");
    span.className = "pro-ac-watermark";
    span.setAttribute("aria-hidden", "true");
    wrap.insertBefore(span, input);

    let idx = 0;
    let timer = null;

    function shouldAnimate() {
      return !input.value.trim() && document.activeElement !== input;
    }

    function setVisible(show) {
      span.classList.toggle("pro-ac-watermark--off", !show);
    }

    function clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function schedule(fn, ms) {
      clearTimer();
      timer = setTimeout(fn, ms);
    }

    function step() {
      if (!shouldAnimate()) {
        setVisible(false);
        span.textContent = "";
        return;
      }
      setVisible(true);
      idx += 1;
      span.textContent = text.slice(0, idx);
      if (idx < text.length) {
        schedule(step, TYPE_MS);
      } else {
        schedule(() => {
          idx = 0;
          span.textContent = "";
          phraseIndex = (phraseIndex + 1) % phrases.length;
          text = String(phrases[phraseIndex] || "").trim();
          if (!text) {
            phraseIndex = 0;
            text = String(phrases[0] || "").trim();
          }
          schedule(step, PAUSE_RESTART_MS);
        }, PAUSE_END_MS);
      }
    }

    function startLoop() {
      if (hidden.value) {
        setVisible(false);
        return;
      }
      clearTimer();
      idx = 0;
      phraseIndex = 0;
      text = String(phrases[0] || "").trim();
      span.textContent = "";
      schedule(() => {
        if (!shouldAnimate()) return;
        step();
      }, startDelayMs);
    }

    function stopLoop() {
      clearTimer();
      span.textContent = "";
      idx = 0;
      phraseIndex = 0;
      text = String(phrases[0] || "").trim();
      setVisible(false);
    }

    input.addEventListener("focus", () => {
      stopLoop();
    });

    input.addEventListener("input", () => {
      if (input.value.trim()) stopLoop();
      else if (document.activeElement !== input) startLoop();
    });

    input.addEventListener("blur", () => {
      if (!input.value.trim()) startLoop();
    });

    wrap.addEventListener("getpro-restart-watermark", () => {
      if (!hidden.value) startLoop();
    });

    if (!hidden.value) {
      startLoop();
    } else {
      setVisible(false);
    }
  }

  function initAc(wrap, lists, watermarkOpts) {
    const kind = wrap.getAttribute("data-ac-list");
    const pool = lists[kind === "service" ? "services" : "cities"];
    const input = wrap.querySelector(".pro-ac-input");
    const hidden = wrap.querySelector(".pro-ac-hidden");
    const dropdown = wrap.querySelector(".pro-ac-dropdown");
    const msg = wrap.querySelector(".pro-ac-msg");
    if (!input || !hidden || !dropdown) return;

    const useTypeahead = kind === "service" && wrap.getAttribute("data-ac-typeahead") === "1";

    const rotateRaw = wrap.getAttribute("data-watermark-rotate");
    const rotatePhrases = rotateRaw
      ? rotateRaw
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean)
      : null;
    const phrase = wrap.getAttribute("data-watermark-text");
    // Mobile perf: watermark typing is cosmetic and uses timers; skip on small/coarse-pointer viewports.
    const skipWatermark =
      typeof window !== "undefined" &&
      window.matchMedia &&
      (window.matchMedia("(max-width: 720px)").matches || window.matchMedia("(pointer: coarse)").matches);
    if (!skipWatermark) {
      if (rotatePhrases && rotatePhrases.length > 0) {
        initRotatingTypewriterWatermark(wrap, input, hidden, rotatePhrases, watermarkOpts.startDelayMs);
      } else if (phrase) {
        initTypewriterWatermark(wrap, input, hidden, phrase, watermarkOpts.startDelayMs);
      }
    }

    let open = false;
    let items = [];
    let activeIndex = -1;
    /** @type {'pool' | 'typeahead' | 'empty'} */
    let dropdownMode = "pool";
    /** @type {{ url: string }[]} */
    let typeaheadNav = [];
    /** @type {HTMLElement[]} */
    let emptyNavEls = [];
    let typeaheadGen = 0;
    let typeaheadTimer = null;

    function setMsg(text) {
      if (!msg) return;
      msg.textContent = text || "";
      msg.hidden = !text;
    }

    function clearValid() {
      hidden.value = "";
      delete hidden.dataset.valid;
    }

    function setValid(value) {
      hidden.value = value;
      hidden.dataset.valid = "1";
    }

    function closeDropdown() {
      if (typeaheadTimer) {
        clearTimeout(typeaheadTimer);
        typeaheadTimer = null;
      }
      typeaheadGen += 1;
      dropdown.innerHTML = "";
      dropdown.hidden = true;
      open = false;
      activeIndex = -1;
      items = [];
      typeaheadNav = [];
      emptyNavEls = [];
      dropdownMode = "pool";
      input.setAttribute("aria-expanded", "false");
    }

    function renderItems() {
      dropdown.innerHTML = "";
      items.forEach((text, i) => {
        const li = document.createElement("li");
        li.className = "pro-ac-option" + (i === activeIndex ? " is-active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === activeIndex ? "true" : "false");
        li.textContent = text;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
        });
        li.addEventListener("click", () => {
          select(text);
        });
        dropdown.appendChild(li);
      });
      dropdown.hidden = items.length === 0;
      open = items.length > 0;
      dropdownMode = "pool";
      input.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function renderTypeaheadRows(cats, provs, q) {
      dropdown.innerHTML = "";
      typeaheadNav = [];
      let navIdx = 0;

      function appendGroup(label) {
        const g = document.createElement("li");
        g.className = "pro-ac-group";
        g.setAttribute("role", "presentation");
        g.textContent = label;
        dropdown.appendChild(g);
      }

      function appendNavRow(url, htmlInner) {
        const li = document.createElement("li");
        const isActive = navIdx === activeIndex;
        li.className = "pro-ac-option pro-ac-option--nav" + (isActive ? " is-active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", isActive ? "true" : "false");
        li.dataset.navUrl = url;
        li.innerHTML = htmlInner;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
        });
        li.addEventListener("click", () => {
          window.location.assign(url);
        });
        typeaheadNav.push({ url });
        dropdown.appendChild(li);
        navIdx += 1;
      }

      if (cats && cats.length) {
        appendGroup("Categories");
        cats.forEach((c) => {
          const lab = c.label || c.name || "";
          appendNavRow(c.url, highlightMatch(lab, q));
        });
      }
      if (provs && provs.length) {
        appendGroup("Providers");
        provs.forEach((c) => {
          const lab = c.name || "";
          appendNavRow(c.url, highlightMatch(lab, q));
        });
      }

      dropdown.hidden = typeaheadNav.length === 0;
      open = typeaheadNav.length > 0;
      dropdownMode = "typeahead";
      input.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function refreshTypeaheadActive() {
      const opts = dropdown.querySelectorAll(".pro-ac-option--nav");
      opts.forEach((el, i) => {
        const on = i === activeIndex;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function runTypeaheadFetch(q) {
      const myGen = ++typeaheadGen;
      fetch(TYPEAHEAD_URL + "?q=" + encodeURIComponent(q))
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((data) => {
          if (myGen !== typeaheadGen) return;
          const cats = data.categories || [];
          const provs = data.providers || [];
          if (cats.length === 0 && provs.length === 0) {
            items = filterPool(pool, q);
            activeIndex = items.length > 0 ? 0 : -1;
            renderItems();
            return;
          }
          activeIndex = 0;
          renderTypeaheadRows(cats, provs, q);
        })
        .catch(() => {
          if (myGen !== typeaheadGen) return;
          items = filterPool(pool, q);
          activeIndex = items.length > 0 ? 0 : -1;
          renderItems();
        });
    }

    function refreshEmptyActive() {
      emptyNavEls.forEach((el, i) => {
        const on = i === activeIndex;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
    }

    function renderEmptyPanel() {
      if (!useTypeahead) return;
      typeaheadGen += 1;
      if (typeaheadTimer) {
        clearTimeout(typeaheadTimer);
        typeaheadTimer = null;
      }
      const form = wrap.closest("form");
      if (!form) return;
      const meta = readSearchMeta(form) || {
        tenantSlug: "global",
        labels: {
          recent: "Recent searches",
          trending: "Trending categories",
          popular: "Popular searches",
        },
        popular: [],
      };
      const tenantSlug = meta.tenantSlug || "global";
      const recents = loadRecentEntries(tenantSlug).filter(
        (e) =>
          String(e.q || "").trim() || String(e.city || "").trim() || String(e.category || "").trim()
      );
      const trending = Array.isArray(lists.trendingCategories) ? lists.trendingCategories : [];
      const popularFromMeta = Array.isArray(meta.popular) ? meta.popular : [];
      const popular =
        popularFromMeta.length > 0
          ? popularFromMeta
          : Array.isArray(lists.services)
            ? lists.services.slice(0, 5)
            : [];
      const labels = meta.labels || {};

      dropdown.innerHTML = "";
      emptyNavEls = [];
      typeaheadNav = [];
      items = [];
      activeIndex = 0;

      function appendGroup(label) {
        const g = document.createElement("li");
        g.className = "pro-ac-group";
        g.setAttribute("role", "presentation");
        g.textContent = label;
        dropdown.appendChild(g);
      }

      function appendRow(text, onActivate) {
        const li = document.createElement("li");
        const idx = emptyNavEls.length;
        const isActive = idx === activeIndex;
        li.className = "pro-ac-option pro-ac-option--empty" + (isActive ? " is-active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", isActive ? "true" : "false");
        li.textContent = text;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
        });
        li.addEventListener("click", onActivate);
        emptyNavEls.push(li);
        dropdown.appendChild(li);
      }

      function appendTrendingNavRow(name, url) {
        const li = document.createElement("li");
        const idx = emptyNavEls.length;
        const isActive = idx === activeIndex;
        li.className = "pro-ac-option pro-ac-option--nav" + (isActive ? " is-active" : "");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", isActive ? "true" : "false");
        li.textContent = name;
        li.addEventListener("mousedown", (e) => {
          e.preventDefault();
        });
        li.addEventListener("click", () => {
          window.location.assign(url);
        });
        emptyNavEls.push(li);
        dropdown.appendChild(li);
      }

      function applyEntry(entry) {
        const sWrap = form.querySelector('.pro-ac[data-ac-list="service"]');
        const cWrap = form.querySelector('.pro-ac[data-ac-list="city"]');
        const sIn = sWrap ? sWrap.querySelector(".pro-ac-input") : null;
        const sHid = sWrap ? sWrap.querySelector(".pro-ac-hidden") : null;
        const cIn = cWrap ? cWrap.querySelector(".pro-ac-input") : null;
        const cHid = cWrap ? cWrap.querySelector(".pro-ac-hidden") : null;
        const catSel = form.querySelector('select[name="category"]');
        const catHid = form.querySelector('input[type="hidden"][name="category"]');

        const qRaw = String(entry.q || "").trim();
        const cityRaw = String(entry.city || "").trim();
        const catRaw = String(entry.category || "").trim();

        const svcPick = pickFromPool(lists.services, qRaw);
        if (sIn && sHid) {
          if (svcPick) {
            sIn.value = svcPick;
            sHid.value = svcPick;
            sHid.dataset.valid = "1";
          } else if (qRaw) {
            sIn.value = qRaw;
            sHid.value = "";
            delete sHid.dataset.valid;
          } else {
            sIn.value = "";
            sHid.value = "";
            delete sHid.dataset.valid;
          }
        }

        const cityPick = pickFromPool(lists.cities, cityRaw);
        if (cIn && cHid) {
          if (cityPick) {
            cIn.value = cityPick;
            cHid.value = cityPick;
            cHid.dataset.valid = "1";
          } else if (!cityRaw) {
            cIn.value = "";
            cHid.value = "";
            delete cHid.dataset.valid;
          } else {
            cIn.value = cityRaw;
            cHid.value = "";
            delete cHid.dataset.valid;
          }
        }

        if (catSel) catSel.value = catRaw || "";
        if (catHid && !catSel) catHid.value = catRaw || "";

        closeDropdown();
        form.submit();
      }

      if (recents.length) {
        appendGroup(labels.recent || "Recent searches");
        recents.forEach((r) => {
          const parts = [];
          if (String(r.q || "").trim()) parts.push(String(r.q).trim());
          if (String(r.city || "").trim()) parts.push(String(r.city).trim());
          if (String(r.category || "").trim()) parts.push(String(r.category).trim());
          const label = parts.join(" · ") || String(r.q || "").trim();
          appendRow(label, () => applyEntry(r));
        });
      }

      if (trending.length) {
        appendGroup(labels.trending || "Trending categories");
        trending.forEach((t) => {
          const name = String((t && t.name) || "").trim();
          const url = String((t && t.url) || "").trim();
          if (!name || !url) return;
          appendTrendingNavRow(name, url);
        });
      } else if (popular.length) {
        appendGroup(labels.popular || "Popular searches");
        popular.forEach((p) => {
          const lab = String(p || "").trim();
          if (!lab) return;
          appendRow(lab, () => applyEntry({ q: lab, city: "", category: "" }));
        });
      }

      if (emptyNavEls.length === 0) {
        closeDropdown();
        return;
      }

      dropdown.hidden = false;
      open = true;
      dropdownMode = "empty";
      input.setAttribute("aria-expanded", "true");
      refreshEmptyActive();
    }

    function select(text) {
      input.value = text;
      setValid(text);
      setMsg("");
      closeDropdown();
    }

    input.addEventListener("input", () => {
      if (hidden.dataset.valid === "1" && norm(input.value) !== norm(hidden.value)) {
        clearValid();
      }
      setMsg("");
      const q = input.value;
      if (q.length < 1) {
        if (useTypeahead && document.activeElement === input) {
          renderEmptyPanel();
        } else {
          closeDropdown();
        }
        return;
      }
      if (useTypeahead && q.length >= TYPEAHEAD_MIN_LEN) {
        if (typeaheadTimer) clearTimeout(typeaheadTimer);
        typeaheadTimer = setTimeout(() => {
          typeaheadTimer = null;
          runTypeaheadFetch(q);
        }, TYPEAHEAD_DEBOUNCE_MS);
        return;
      }
      items = filterPool(pool, q);
      activeIndex = items.length > 0 ? 0 : -1;
      renderItems();
    });

    input.addEventListener("focus", () => {
      if (useTypeahead && !String(input.value || "").trim()) {
        renderEmptyPanel();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
        return;
      }

      if (useTypeahead && dropdownMode === "typeahead" && typeaheadNav.length > 0 && open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % typeaheadNav.length;
          refreshTypeaheadActive();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          activeIndex = (activeIndex - 1 + typeaheadNav.length) % typeaheadNav.length;
          refreshTypeaheadActive();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const t = typeaheadNav[activeIndex];
          if (t && t.url) window.location.assign(t.url);
          return;
        }
      }

      if (useTypeahead && dropdownMode === "empty" && emptyNavEls.length > 0 && open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          activeIndex = (activeIndex + 1) % emptyNavEls.length;
          refreshEmptyActive();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          activeIndex = (activeIndex - 1 + emptyNavEls.length) % emptyNavEls.length;
          refreshEmptyActive();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const li = emptyNavEls[activeIndex];
          if (li) li.click();
          return;
        }
      }

      if (!open || (dropdownMode === "pool" && items.length === 0)) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (input.value.length >= 1) {
            items = filterPool(pool, input.value);
            activeIndex = items.length > 0 ? 0 : -1;
            renderItems();
          }
        }
        return;
      }
      if (dropdownMode !== "pool") return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        renderItems();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        renderItems();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) select(items[activeIndex]);
      }
    });

    input.addEventListener("blur", () => {
      setTimeout(() => closeDropdown(), 200);
    });

    if (hidden.value) hidden.dataset.valid = "1";
  }

  function resolveForm(form, lists) {
    const wraps = form.querySelectorAll(".pro-ac");
    wraps.forEach((w) => {
      initAc(w, lists, { startDelayMs: 0 });
    });

    form.addEventListener("submit", (e) => {
      const serviceWrap = form.querySelector('.pro-ac[data-ac-list="service"]');
      const cityWrap = form.querySelector('.pro-ac[data-ac-list="city"]');
      const sIn = serviceWrap ? serviceWrap.querySelector(".pro-ac-input") : null;
      const sHid = serviceWrap ? serviceWrap.querySelector(".pro-ac-hidden") : null;
      const cIn = cityWrap ? cityWrap.querySelector(".pro-ac-input") : null;
      const cHid = cityWrap ? cityWrap.querySelector(".pro-ac-hidden") : null;

      function ensure(field, input, hidden, pool) {
        if (!input || !hidden) return true;
        const typed = input.value.trim();
        if (!typed) {
          hidden.value = "";
          delete hidden.dataset.valid;
          return true;
        }
        if (hidden.dataset.valid === "1" && hidden.value && norm(input.value) === norm(hidden.value)) {
          return true;
        }
        const exact = exactMatch(pool, typed);
        if (exact) {
          hidden.value = exact;
          hidden.dataset.valid = "1";
          input.value = exact;
          return true;
        }
        const errEl = field.querySelector(".pro-ac-msg");
        if (errEl) {
          errEl.textContent =
            field.getAttribute("data-ac-list") === "city"
              ? "Choose a town or city from the list."
              : "Choose a professional service from the list.";
          errEl.hidden = false;
        }
        input.focus();
        return false;
      }

      if (!ensure(serviceWrap, sIn, sHid, lists.services)) {
        e.preventDefault();
        return;
      }
      if (!ensure(cityWrap, cIn, cHid, lists.cities)) {
        e.preventDefault();
        return;
      }
      saveRecentFromForm(form);
    });
  }

  function runSearchAutocomplete() {
    if (typeof window !== "undefined" && window.__getproAutocompleteRan) return;
    if (typeof window !== "undefined") window.__getproAutocompleteRan = true;
    fetch(LIST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((lists) => {
        document.querySelectorAll("form.gp-search-bar").forEach((f) => {
          resolveForm(f, lists);
        });
        const joinPanels = document.getElementById("join-panels");
        if (joinPanels) {
          const tc =
            typeof window !== "undefined" && window.__GETPRO_TENANT_CITIES__;
          const listsForJoin = { ...lists };
          if (tc && Array.isArray(tc) && tc.length > 0) {
            listsForJoin.cities = tc
              .map((c) => c.name)
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b, "en"));
          }
          joinPanels.querySelectorAll(".pro-ac").forEach((w) => {
            initAc(w, listsForJoin, { startDelayMs: 120 });
          });
        }
        const faForm = document.getElementById("fa-submit-form");
        if (faForm) {
          const tcFa =
            typeof window !== "undefined" && window.__GETPRO_TENANT_CITIES__;
          const listsForFa = { ...lists };
          if (tcFa && Array.isArray(tcFa) && tcFa.length > 0) {
            listsForFa.cities = tcFa
              .map((c) => c.name)
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b, "en"));
          }
          resolveForm(faForm, listsForFa);
        }
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.error("Failed to load search lists");
      });
  }

  if (typeof window !== "undefined") {
    window.__getproInitSearchAutocomplete = runSearchAutocomplete;
  }

  if (typeof window !== "undefined" && window.__getproAutocompleteSkipAutoInit === true) {
    // Loaded lazily; caller invokes window.__getproInitSearchAutocomplete().
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runSearchAutocomplete);
  } else {
    runSearchAutocomplete();
  }
})();
