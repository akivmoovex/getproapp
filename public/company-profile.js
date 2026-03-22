(function () {
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

    function setDots() {
      if (!dotsRoot) return;
      dotsRoot.querySelectorAll("button").forEach(function (b, idx) {
        b.setAttribute("aria-current", idx === i ? "true" : "false");
      });
    }

    function go(delta) {
      if (slides.length < 1) return;
      i = (i + delta + slides.length) % slides.length;
      const dur = prefersReducedMotion() ? "0ms" : "";
      track.style.transitionDuration = dur;
      track.style.transform = "translateX(" + -i * 100 + "%)";
      setDots();
    }

    if (dotsRoot && n > 1) {
      slides.forEach(function (_, idx) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "pro-company-carousel__dot";
        b.setAttribute("aria-label", "Go to slide " + (idx + 1));
        b.addEventListener("click", function () {
          i = idx;
          track.style.transform = "translateX(" + -i * 100 + "%)";
          setDots();
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

    btn.addEventListener("click", function () {
      setStatus("");
      const src = img.currentSrc || img.src;

      function tryClipboardBlob(blob) {
        if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") {
          return Promise.reject(new Error("clipboard"));
        }
        return navigator.clipboard.write([
          new ClipboardItem(
            Object.freeze({
              [blob.type || "image/png"]: blob,
            })
          ),
        ]);
      }

      function fallbackCopyText() {
        const text = src || "";
        if (text && navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(function () {
              setStatus("Copied (image data as text).", true);
            })
            .catch(function () {
              setStatus("Could not copy. Long-press the QR image to save.", false);
            });
        } else {
          setStatus("Could not copy. Long-press the QR image to save.", false);
        }
      }

      if (src && src.indexOf("data:") === 0) {
        fetch(src)
          .then(function (r) {
            return r.blob();
          })
          .then(function (blob) {
            return tryClipboardBlob(blob);
          })
          .then(function () {
            setStatus("Copied to clipboard.", true);
          })
          .catch(function () {
            if (img.complete && img.naturalWidth) {
              try {
                const c = document.createElement("canvas");
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                c.getContext("2d").drawImage(img, 0, 0);
                c.toBlob(function (blob) {
                  if (!blob) {
                    fallbackCopyText();
                    return;
                  }
                  tryClipboardBlob(blob)
                    .then(function () {
                      setStatus("Copied to clipboard.", true);
                    })
                    .catch(fallbackCopyText);
                });
              } catch (e) {
                fallbackCopyText();
              }
            } else {
              fallbackCopyText();
            }
          });
        return;
      }

      if (img.complete && img.naturalWidth) {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext("2d").drawImage(img, 0, 0);
          c.toBlob(function (blob) {
            if (!blob) {
              fallbackCopyText();
              return;
            }
            tryClipboardBlob(blob)
              .then(function () {
                setStatus("Copied to clipboard.", true);
              })
              .catch(fallbackCopyText);
          });
        } catch (e) {
          fallbackCopyText();
        }
      } else {
        img.addEventListener(
          "load",
          function once() {
            img.removeEventListener("load", once);
            btn.click();
          },
          { once: true }
        );
      }
    });
  }

  initQrCopy();
})();
