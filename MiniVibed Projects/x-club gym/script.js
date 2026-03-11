(function () {
  "use strict";

  /* ==================================================
     Helpers & Utilities
     ================================================== */
  const qs = (sel, ctx = document) => ctx.querySelector(sel);
  const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const on = (el, evt, selOrHandler, handler) => {
    if (typeof selOrHandler === "function")
      return el.addEventListener(evt, selOrHandler);
    el.addEventListener(evt, (e) => {
      const t = e.target.closest(selOrHandler);
      if (t) handler.call(t, e, t);
    });
  };

  const rAF =
    window.requestAnimationFrame ||
    function (cb) {
      return setTimeout(cb, 16);
    };
  const cAF = window.cancelAnimationFrame || clearTimeout;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Simple debounce
  const debounce = (fn, wait = 120) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  };

  /* ==================================================
     Accessibility focus trap (simple)
     ================================================== */
  function trapFocus(container) {
    if (!container) return () => {};
    const focusable =
      'a[href], area[href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const nodes = Array.from(container.querySelectorAll(focusable)).filter(
      (n) => n.offsetParent !== null,
    );
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const prevActive = document.activeElement;

    function keyHandler(e) {
      if (e.key === "Tab") {
        if (nodes.length === 0) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (e.key === "Escape") {
        // let owner close modal/nav via Escape - handler outside
      }
    }

    document.addEventListener("keydown", keyHandler);
    if (first) first.focus();

    return function release() {
      document.removeEventListener("keydown", keyHandler);
      try {
        if (prevActive && prevActive.focus) prevActive.focus();
      } catch (e) {}
    };
  }

  /* ==================================================
     Smooth scrolling helper (respects reduced motion)
     ================================================== */
  function smoothScrollTo(element) {
    if (!element) return;
    if (prefersReducedMotion) {
      element.scrollIntoView();
      return;
    }

    // Use native smooth where available
    try {
      element.scrollIntoView({behavior: "smooth", block: "start"});
    } catch (e) {
      // fallback - instant
      element.scrollIntoView();
    }
  }

  /* ==================================================
     Numeric animation helper: animateNumber
     - el: DOM element whose textContent is numeric
     - from, to: numbers
     - duration: ms
     - formatter: optional (number -> string)
     - onUpdate: optional callback
     ================================================== */
  function animateNumber(
    el,
    from,
    to,
    duration = 600,
    formatter = (n) => Math.round(n).toString(),
    onUpdate,
  ) {
    if (!el) return Promise.resolve();
    if (prefersReducedMotion || duration <= 0) {
      el.textContent = formatter(to);
      if (onUpdate) onUpdate(to);
      return Promise.resolve();
    }

    const start = performance.now();
    return new Promise((resolve) => {
      let rafId;
      function loop(now) {
        const t = clamp((now - start) / duration, 0, 1);
        const eased = easeOutCubic(t);
        const value = from + (to - from) * eased;
        el.textContent = formatter(value);
        if (onUpdate) onUpdate(value);
        if (t < 1) {
          rafId = rAF(loop);
        } else {
          resolve();
        }
      }
      rafId = rAF(loop);
    });
  }

  /* ==================================================
     Modal (plan comparison) - lightweight
     ================================================== */
  const modal = qs("#modal");
  const modalBody = qs("#modal-body");
  const modalCloseBtns = qsa("[data-modal-close]");
  let releaseModalFocus = null;

  function openModal(content) {
    if (!modal) return;
    modalBody.innerHTML = content || "<p>No details available.</p>";
    modal.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("modal-open");
    releaseModalFocus = trapFocus(qs(".modal-panel"));
  }
  function closeModal() {
    if (!modal) return;
    modal.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("modal-open");
    if (typeof releaseModalFocus === "function") releaseModalFocus();
  }

  modalCloseBtns.forEach((btn) => btn.addEventListener("click", closeModal));
  if (qs(".modal-overlay"))
    qs(".modal-overlay").addEventListener("click", closeModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  /* ==================================================
     Main features initialization
     ================================================== */
  function init() {
    cacheAndBind();
    setupSmoothAnchors();
    setupMobileNav();
    setupPricingToggle();
    setupObservers();
    setupTrainerCards();
    setupBackToTop();
    setupForm();
    setupPlanCompareLinks();
    // set year in footer if present
    const yearEl = qs("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ==================================================
     Cached selectors & event wiring
     ================================================== */
  let selectors = {};
  function cacheAndBind() {
    selectors = {
      mobileToggle: qs("#mobile-toggle"),
      mobileNav: qs("#mobile-nav"),
      primaryNav: qs("#primary-nav"),
      pricingToggle: qs("[data-pricing-toggle]"),
      pricingBtns: qsa(".segmented-btn"),
      planCards: qsa(".plan-card"),
      trainerCards: qsa(".trainer-card"),
      backToTop: qs("#back-to-top"),
      hero: qs("#home"),
      contactForm: qs("#contact-form"),
      toast: qs("#toast"),
      liveRegion: qs("#live-region"),
      planCompareLinks: qsa("[data-plan-compare]"),
      planCompareAll: qs("[data-plan-compare-all]"),
    };

    // aria hookups for buttons to support Enter/Space
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const tg = e.target;
        if (tg && tg.classList && tg.classList.contains("segmented-btn")) {
          e.preventDefault();
          tg.click();
        }
      }
    });
  }

  /* ==================================================
     Smooth anchor links
     ================================================== */
  function setupSmoothAnchors() {
    on(document, "click", 'a[href^="#"]', (e, a) => {
      // allow modals or JS-handled anchors to bypass
      const href = a.getAttribute("href");
      if (!href || href === "#" || a.hasAttribute("data-no-scroll")) return;
      // If it's a modal trigger (data-plan-compare) we let other handler do it
      if (
        a.hasAttribute("data-plan-compare") ||
        a.hasAttribute("data-plan-compare-all")
      )
        return;

      const targetId = href.slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        e.preventDefault();
        smoothScrollTo(target);
        // close mobile nav if open
        if (
          selectors.mobileNav &&
          selectors.mobileNav.getAttribute("aria-hidden") === "false"
        ) {
          toggleMobileNav(false);
        }
      }
    });
  }

  /* ==================================================
     Mobile nav toggle
     ================================================== */
  let releaseNavFocus = null;
  function toggleMobileNav(open) {
    if (!selectors.mobileToggle || !selectors.mobileNav) return;
    const btn = selectors.mobileToggle;
    const panel = selectors.mobileNav;
    const isOpen = panel.getAttribute("aria-hidden") === "false";
    const willOpen = typeof open === "boolean" ? open : !isOpen;

    btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    panel.setAttribute("aria-hidden", willOpen ? "false" : "true");
    if (willOpen) {
      releaseNavFocus = trapFocus(panel);
      // prevent body scrolling lightly
      document.documentElement.classList.add("nav-open");
      btn.setAttribute("aria-label", "Close navigation");
    } else {
      if (typeof releaseNavFocus === "function") releaseNavFocus();
      document.documentElement.classList.remove("nav-open");
      btn.setAttribute("aria-label", "Open navigation");
    }
  }

  function setupMobileNav() {
    const btn = selectors.mobileToggle;
    if (!btn) return;
    btn.addEventListener("click", () => toggleMobileNav());
    // close nav on Escape
    window.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        selectors.mobileNav &&
        selectors.mobileNav.getAttribute("aria-hidden") === "false"
      )
        toggleMobileNav(false);
    });

    // close when links inside mobile nav clicked
    on(document, "click", "#mobile-nav a", (e, a) => {
      toggleMobileNav(false);
    });
  }

  /* ==================================================
     Pricing toggle & animated price updates
     ================================================== */
  function setupPricingToggle() {
    const wrapper = selectors.pricingToggle;
    if (!wrapper) return;

    const buttons = Array.from(wrapper.querySelectorAll(".segmented-btn"));
    const defaultPeriod = buttons.find(
      (b) => b.getAttribute("aria-pressed") === "true",
    )
      ? "monthly"
      : "monthly";
    let currentPeriod = defaultPeriod;

    function setPeriod(period, opts = {}) {
      if (!period || period === currentPeriod) return;
      currentPeriod = period;
      buttons.forEach((b) => {
        const p = b.dataset.period;
        const pressed = p === period;
        b.setAttribute("aria-pressed", pressed ? "true" : "false");
      });

      // Update plan prices
      selectors.planCards.forEach((card) => {
        const priceEl = card.querySelector(".price-value");
        if (!priceEl) return;
        const from =
          parseFloat(priceEl.textContent.replace(/[^0-9\.]/g, "")) || 0;
        const target =
          parseFloat(
            period === "monthly"
              ? card.dataset.priceMonth
              : card.dataset.priceYear,
          ) || 0;

        // make visual change: short bump
        card.classList.add("price-changing");
        priceEl.classList.add("price-bump");
        // update per text
        const perEl = card.querySelector(".per");
        if (perEl) perEl.textContent = period === "monthly" ? "/mo" : "/yr";

        // animate number
        animateNumber(priceEl, from, target, 700, (n) =>
          Math.round(n).toString(),
        ).then(() => {
          card.classList.remove("price-changing");
          priceEl.classList.remove("price-bump");
        });
      });

      // announce change for assistive tech
      if (selectors.liveRegion)
        selectors.liveRegion.textContent = `Showing ${period} pricing`;
    }

    // click handlers
    buttons.forEach((btn) =>
      btn.addEventListener("click", (e) => {
        const period = btn.dataset.period;
        setPeriod(period);
      }),
    );

    // keyboard support included globally (Enter/Space mapping to click)
  }

  /* ==================================================
     IntersectionObserver reveals for performance
     ================================================== */
  let io = null;
  function setupObservers() {
    if (typeof IntersectionObserver === "undefined") {
      // reveal all immediately
      selectors.trainerCards.forEach((c, i) => (c.style.opacity = "1"));
      return;
    }

    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          // trainers: set delay via data-index
          if (el.classList.contains("trainer-card")) {
            const idx = Number(el.dataset.index) || 0;
            el.style.setProperty("--delay", `${idx * 0.08}s`);
            el.classList.remove("hidden");
            // unobserve to avoid repeated work
            io.unobserve(el);
          }
          // plan cards: simple reveal hook
          if (el.classList.contains("plan-card")) {
            el.classList.add("revealed");
            io.unobserve(el);
          }
        });
      },
      {root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.05},
    );

    // observe trainers and plan cards
    selectors.trainerCards.forEach((el) => io.observe(el));
    selectors.planCards.forEach((el) => io.observe(el));
  }

  /* ==================================================
     Trainer cards interactions (expand / collapse)
     ================================================== */
  function setupTrainerCards() {
    selectors.trainerCards.forEach((card) => {
      // keyboard accessibility - Enter/Space toggles
      card.addEventListener("click", (e) => toggleTrainer(card));
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTrainer(card);
        }
      });
    });

    function toggleTrainer(card) {
      const expanded = card.getAttribute("aria-expanded") === "true";
      const willExpand = !expanded;
      // use rAF to coordinate DOM changes with CSS
      rAF(() => {
        card.setAttribute("aria-expanded", willExpand ? "true" : "false");
        if (willExpand) card.classList.add("expanded");
        else card.classList.remove("expanded");
      });

      // simple analytics hook
      if (willExpand)
        console.log(
          "Trainer expanded:",
          (
            card.querySelector(".trainer-name") || {textContent: "unknown"}
          ).textContent.trim(),
        );
    }
  }

  /* ==================================================
     Back to top visibility & handler
     ================================================== */
  function setupBackToTop() {
    const btn = selectors.backToTop;
    const hero = selectors.hero;
    if (!btn) return;

    if ("IntersectionObserver" in window && hero) {
      const sentinel = new IntersectionObserver(
        (entries) => {
          entries.forEach((ent) => {
            if (ent.isIntersecting) {
              btn.setAttribute("aria-hidden", "true");
            } else {
              btn.setAttribute("aria-hidden", "false");
            }
          });
        },
        {root: null, threshold: 0, rootMargin: "-10% 0px 0px 0px"},
      );
      sentinel.observe(hero);
    } else {
      // fallback: show always after scrollY > 200
      const check = () => {
        btn.setAttribute(
          "aria-hidden",
          window.scrollY < 200 ? "true" : "false",
        );
      };
      window.addEventListener("scroll", debounce(check, 80));
      check();
    }

    btn.addEventListener("click", () => {
      if (prefersReducedMotion) window.scrollTo(0, 0);
      else window.scrollTo({top: 0, behavior: "smooth"});
    });
  }

  /* ==================================================
     Form validation & lightweight submission
     ================================================== */
  function setupForm() {
    const form = selectors.contactForm;
    if (!form) return;

    const hp = qs("#hp-field", form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const statusEl = qs("#form-status", form);

    function setError(input, message) {
      input.classList.add("input-error");
      input.setAttribute("aria-invalid", "true");
      // attach error node
      let error =
        input.nextElementSibling &&
        input.nextElementSibling.classList &&
        input.nextElementSibling.classList.contains("error-text")
          ? input.nextElementSibling
          : null;
      if (!error) {
        error = document.createElement("div");
        error.className = "error-text";
        input.parentNode.insertBefore(error, input.nextSibling);
      }
      error.id = `${input.id || "field"}-error`;
      error.textContent = message;
      // link via aria-describedby
      const described = (input.getAttribute("aria-describedby") || "")
        .split(" ")
        .filter(Boolean);
      if (!described.includes(error.id)) described.push(error.id);
      input.setAttribute("aria-describedby", described.join(" "));
    }

    function clearError(input) {
      input.classList.remove("input-error");
      input.removeAttribute("aria-invalid");
      const err =
        input.nextElementSibling &&
        input.nextElementSibling.classList &&
        input.nextElementSibling.classList.contains("error-text")
          ? input.nextElementSibling
          : null;
      if (err) err.remove();
      // remove id from aria-describedby if present
      const desc = (input.getAttribute("aria-describedby") || "")
        .split(" ")
        .filter((id) => id && !id.endsWith("-error"));
      if (desc.length) input.setAttribute("aria-describedby", desc.join(" "));
      else input.removeAttribute("aria-describedby");
    }

    function validate() {
      const name = qs("#name", form);
      const email = qs("#email", form);
      const phone = qs("#phone", form);
      const message = qs("#message", form);
      let valid = true;
      const firstInvalid = null;

      // clear previous errors
      [name, email, phone, message].forEach((i) => i && clearError(i));

      if (hp && hp.value.trim().length > 0) {
        // honeypot filled - probable bot
        return {ok: false, spam: true};
      }

      if (!name || name.value.trim().length < 2) {
        setError(name, "Please enter your full name.");
        valid = false;
      }
      const emailVal = email && email.value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRe.test(emailVal)) {
        setError(email, "Please enter a valid email.");
        valid = false;
      }

      const phoneVal = phone && phone.value.trim();
      if (phoneVal) {
        const phoneRe = /^[0-9\+\-\s\(\)]+$/;
        if (
          !phoneRe.test(phoneVal) ||
          phoneVal.replace(/[^0-9]/g, "").length < 7
        ) {
          setError(phone, "Please enter a valid phone number.");
          valid = false;
        }
      }

      if (!message || message.value.trim().length < 10) {
        setError(message, "Please enter a brief message (10+ characters).");
        valid = false;
      }

      // focus first invalid
      const first = form.querySelector(".input-error");
      if (first) first.focus();

      return {ok: valid, spam: false};
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!form) return;
      submitBtn.disabled = true;
      statusEl.textContent = "";

      const result = validate();
      if (result.spam) {
        showToast("Your submission looks like spam and was not sent.");
        submitBtn.disabled = false;
        return;
      }
      if (!result.ok) {
        submitBtn.disabled = false;
        return;
      }

      // demo: fake async submission
      setTimeout(() => {
        // clear form
        form.reset();
        // remove any remaining error indicators
        qsa(".input-error", form).forEach((i) =>
          i.classList.remove("input-error"),
        );
        showToast(
          "Thanks! Your message has been sent. We will reply within 24 hours.",
        );
        if (statusEl)
          statusEl.textContent = "Message sent — we will contact you soon.";
        submitBtn.disabled = false;
        // optional: here you could send data using fetch to your backend
        // fetch('/api/contact', { method: 'POST', body: new FormData(form) }) ...
      }, 700);
    });
  }

  /* ==================================================
     Toast helper
     ================================================== */
  let toastTimeout = null;
  function showToast(msg, duration = 4000) {
    const t = selectors.toast || qs("#toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("show");
    if (selectors.liveRegion) selectors.liveRegion.textContent = msg;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      t.classList.remove("show");
    }, duration);
  }

  /* ==================================================
     Plan comparison links -> modal
     ================================================== */
  function setupPlanCompareLinks() {
    // individual compare links
    selectors.planCompareLinks.forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        const plan = link.dataset.plan || "Plan";
        const content = buildPlanComparisonContent(plan);
        openModal(content);
      });
    });

    if (selectors.planCompareAll) {
      selectors.planCompareAll.addEventListener("click", (e) => {
        e.preventDefault();
        const content = buildPlanComparisonContent("all");
        openModal(content);
      });
    }
  }

  function buildPlanComparisonContent(planKey) {
    // lightweight content - can be expanded or loaded via fetch
    if (planKey === "all") {
      return `
        <p><strong>X-Club Plan Comparison</strong></p>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr><th style="text-align:left;padding:8px">Plan</th><th style="text-align:left;padding:8px">Monthly</th><th style="text-align:left;padding:8px">Yearly</th><th style="text-align:left;padding:8px">Key Perks</th></tr></thead>
          <tbody>
            <tr><td style="padding:8px">Basic</td><td style="padding:8px">$19</td><td style="padding:8px">$190</td><td style="padding:8px">Gym access, group classes</td></tr>
            <tr><td style="padding:8px">Pro</td><td style="padding:8px">$49</td><td style="padding:8px">$490</td><td style="padding:8px">24/7, PT sessions</td></tr>
            <tr><td style="padding:8px">Elite</td><td style="padding:8px">$89</td><td style="padding:8px">$890</td><td style="padding:8px">Unlimited PT, nutrition, spa</td></tr>
          </tbody>
        </table>
        <p class="small muted">Close this dialog with the Esc key or the close button.</p>
      `;
    }

    // specific plan
    const card = qsa(".plan-card").find(
      (c) =>
        (c.querySelector(".plan-name") || {textContent: ""}).textContent
          .trim()
          .toLowerCase() === planKey.toLowerCase(),
    );
    if (!card) return `<p>Details for ${planKey} are not available.</p>`;
    const name =
      (card.querySelector(".plan-name") || {}).textContent || planKey;
    const perks = Array.from(card.querySelectorAll(".plan-perks li"))
      .map((li) => `<li>${li.textContent}</li>`)
      .join("");
    const monthly = card.dataset.priceMonth;
    const yearly = card.dataset.priceYear;
    return `
      <h4>${name} — Plan details</h4>
      <p><strong>Monthly:</strong> $${monthly} — <strong>Yearly:</strong> $${yearly}</p>
      <ul>${perks}</ul>
      <p class="small muted">Click a plan's "Choose" button to start signup or contact us below.</p>
    `;
  }

  /* ==================================================
     Cleanup on unload
     ================================================== */
  window.addEventListener("unload", () => {
    if (io) io.disconnect();
  });

  /* ==================================================
     Kick off when DOM ready
     ================================================== */
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
