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
})();
