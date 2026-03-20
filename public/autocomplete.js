/**
 * Combobox autocomplete from first character; optional typewriter watermark on empty fields.
 * Values must match search-lists.json on submit.
 */
(function () {
  const LIST_URL = "/data/search-lists.json?v=20260320j";

  const TYPE_MS = 95;
  const PAUSE_END_MS = 1600;
  const PAUSE_RESTART_MS = 400;
  const CITY_STAGGER_MS = 500;

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

    const phrase = wrap.getAttribute("data-watermark-text");
    if (phrase) {
      initTypewriterWatermark(wrap, input, hidden, phrase, watermarkOpts.startDelayMs);
    }

    let open = false;
    let items = [];
    let activeIndex = -1;

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
      dropdown.innerHTML = "";
      dropdown.hidden = true;
      open = false;
      activeIndex = -1;
      items = [];
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
      input.setAttribute("aria-expanded", open ? "true" : "false");
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
        closeDropdown();
        return;
      }
      items = filterPool(pool, q);
      activeIndex = items.length > 0 ? 0 : -1;
      renderItems();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeDropdown();
        return;
      }
      if (!open || items.length === 0) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          if (input.value.length >= 1) {
            items = filterPool(pool, input.value);
            activeIndex = items.length > 0 ? 0 : -1;
            renderItems();
          }
        }
        return;
      }
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
    wraps.forEach((w, i) => {
      const isCity = w.getAttribute("data-ac-list") === "city";
      initAc(w, lists, {
        startDelayMs: isCity ? CITY_STAGGER_MS : 0,
      });
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
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    fetch(LIST_URL)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((lists) => {
        document.querySelectorAll("form.pro-home-dual-search, form.pro-search--directory").forEach((f) => {
          resolveForm(f, lists);
        });
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.error("Failed to load search lists");
      });
  });
})();
