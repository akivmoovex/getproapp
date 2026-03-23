(function () {
  var AUTO_MS = 5000;

  function prefersReducedMotion() {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }

  function initCarousel(root) {
    const track = root.querySelector("[data-carousel-track]");
    const viewport = root.querySelector("[data-carousel-viewport]") || root;
    const slides = root.querySelectorAll("[data-carousel-slide]");
    const prev = root.querySelector("[data-carousel-prev]");
    const next = root.querySelector("[data-carousel-next]");
    const dotsRoot = root.querySelector("[data-carousel-dots]");
    if (!track || slides.length < 1) return;

    const n = slides.length;
    let i = 0;
    let autoPaused = false;
    let autoTimer = null;

    function setDots() {
      if (!dotsRoot) return;
      dotsRoot.querySelectorAll("button").forEach(function (b, idx) {
        b.setAttribute("aria-current", idx === i ? "true" : "false");
      });
    }

    function applyTransform() {
      const dur = prefersReducedMotion() ? "0ms" : "";
      track.style.transitionDuration = dur;
      track.style.transform = "translateX(" + -i * 100 + "%)";
      setDots();
    }

    function go(delta) {
      if (slides.length < 1) return;
      i = (i + delta + slides.length) % slides.length;
      applyTransform();
    }

    function goTo(idx) {
      if (slides.length < 1) return;
      i = ((idx % slides.length) + slides.length) % slides.length;
      applyTransform();
    }

    function startAuto() {
      if (prefersReducedMotion() || n < 2) return;
      stopAuto();
      autoTimer = window.setInterval(function () {
        if (autoPaused) return;
        go(1);
      }, AUTO_MS);
    }

    function stopAuto() {
      if (autoTimer) window.clearInterval(autoTimer);
      autoTimer = null;
    }

    function pause() {
      autoPaused = true;
    }

    function resume() {
      autoPaused = false;
    }

    root.addEventListener("mouseenter", pause);
    root.addEventListener("mouseleave", resume);
    root.addEventListener("focusin", pause);
    root.addEventListener("focusout", resume);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
      else resume();
    });

    if (dotsRoot && n > 1) {
      slides.forEach(function (_, idx) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pro-company-carousel__dot";
        b.setAttribute("aria-label", "Go to slide " + (idx + 1));
        b.addEventListener("click", function () {
          goTo(idx);
        });
        dotsRoot.appendChild(b);
      });
      setDots();
    }

    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });

    root.addEventListener("keydown", function (e) {
      if (n < 2) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    });

    let startX = 0;
    let dx = 0;
    let active = false;

    root.addEventListener(
      "touchstart",
      function (e) {
        if (n < 2 || !e.touches || !e.touches[0]) return;
        active = true;
        startX = e.touches[0].clientX;
        dx = 0;
      },
      { passive: true }
    );

    root.addEventListener(
      "touchmove",
      function (e) {
        if (!active || n < 2 || !e.touches || !e.touches[0]) return;
        dx = e.touches[0].clientX - startX;
      },
      { passive: true }
    );

    root.addEventListener("touchend", function () {
      if (!active || n < 2) return;
      active = false;
      if (dx > 50) go(-1);
      else if (dx < -50) go(1);
      dx = 0;
    });

    let ptrActive = false;
    let ptrStart = 0;
    let ptrDx = 0;

    viewport.addEventListener("mousedown", function (e) {
      if (n < 2 || e.button !== 0) return;
      ptrActive = true;
      ptrStart = e.clientX;
      ptrDx = 0;
      viewport.classList.add("is-dragging");
    });

    window.addEventListener("mousemove", function (e) {
      if (!ptrActive || n < 2) return;
      ptrDx = e.clientX - ptrStart;
    });

    window.addEventListener("mouseup", function () {
      if (!ptrActive || n < 2) return;
      ptrActive = false;
      viewport.classList.remove("is-dragging");
      if (ptrDx > 50) go(-1);
      else if (ptrDx < -50) go(1);
      ptrDx = 0;
    });

    startAuto();
  }

  document.querySelectorAll("[data-company-carousel]").forEach(initCarousel);

  function initQrCopy() {
    const btn = document.querySelector("[data-copy-qr-image]");
    const img = document.querySelector("[data-qr-image]");
    const statusEl = document.querySelector("[data-qr-copy-status]");
    if (!btn || !img) return;

    function setStatus(msg, ok) {
      if (!statusEl) return;
      statusEl.hidden = !msg;
      statusEl.textContent = msg || "";
      statusEl.style.color = ok ? "" : "var(--danger, #b91c1c)";
    }

    function pngBlobFromImage(imageEl) {
      return new Promise(function (resolve, reject) {
        function draw() {
          try {
            const w = imageEl.naturalWidth || imageEl.width;
            const h = imageEl.naturalHeight || imageEl.height;
            if (!w || !h) {
              reject(new Error("no-size"));
              return;
            }
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            ctx.drawImage(imageEl, 0, 0);
            c.toBlob(function (blob) {
              if (blob && blob.size) resolve(blob);
              else reject(new Error("no-blob"));
            }, "image/png");
          } catch (e) {
            reject(e);
          }
        }
        if (imageEl.complete && imageEl.naturalWidth) {
          draw();
        } else {
          imageEl.addEventListener(
            "load",
            function once() {
              imageEl.removeEventListener("load", once);
              draw();
            },
            { once: true }
          );
        }
      });
    }

    function writePngToClipboard(blob) {
      if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
        return Promise.reject(new Error("no-clipboard"));
      }
      if (!window.isSecureContext) {
        return Promise.reject(new Error("insecure"));
      }
      const pngPromise = Promise.resolve(blob);
      try {
        return navigator.clipboard.write([
          new ClipboardItem({
            "image/png": pngPromise,
          }),
        ]);
      } catch (e) {
        try {
          return navigator.clipboard.write([
            new ClipboardItem({
              "image/png": blob,
            }),
          ]);
        } catch (e2) {
          return Promise.reject(e2);
        }
      }
    }

    function downloadBlob(blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "qr-code.png";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 600);
    }

    btn.addEventListener("click", function () {
      setStatus("");
      btn.disabled = true;
      pngBlobFromImage(img)
        .then(function (blob) {
          return writePngToClipboard(blob).then(
            function () {
              return { mode: "clip" };
            },
            function () {
              downloadBlob(blob);
              return { mode: "download" };
            }
          );
        })
        .then(function (result) {
          if (result.mode === "download") {
            setStatus("PNG download started — use this if your browser cannot copy images to the clipboard.", true);
          } else {
            setStatus("QR image copied — paste into email, chat, or documents.", true);
          }
        })
        .catch(function () {
          setStatus("Could not copy. Try long-press the QR image to save on mobile.", false);
        })
        .finally(function () {
          btn.disabled = false;
        });
    });
  }

  document.querySelectorAll(".pro-company-profile__dist-fill[data-width-pct]").forEach(function (el) {
    var w = el.getAttribute("data-width-pct");
    if (w != null && w !== "") el.style.width = w + "%";
  });

  initQrCopy();
})();
