// Footer year
document.getElementById("footerYear").textContent = new Date().getFullYear();

// Mobile nav toggle
const nav = document.querySelector(".nav");
const menuToggle = document.getElementById("menuToggle");
menuToggle?.addEventListener("click", () => {
  const open = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(open));
});

// Close mobile nav when a link is clicked
document.querySelectorAll(".nav-link").forEach((link) => {
  link.addEventListener("click", () => {
    if (nav.classList.contains("is-open")) {
      nav.classList.remove("is-open");
      menuToggle?.setAttribute("aria-expanded", "false");
    }
  });
});

// Scroll-spy: highlight nav link for the section in view
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".nav-link[data-nav]");

const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach((link) => {
          link.classList.toggle("nav-link--active", link.dataset.nav === id);
        });
      }
    });
  },
  { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
);
sections.forEach((s) => spy.observe(s));

// Reveal-on-scroll: add .reveal to anything that should animate in
const revealTargets = document.querySelectorAll(
  ".hero-card, .panel, .project-card, .toolkit-card, .interest-card, .contact-form, .quick-stats"
);
revealTargets.forEach((el) => el.classList.add("reveal"));

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);
revealTargets.forEach((el) => revealObserver.observe(el));

// Contact form — client-side placeholder.
// TODO: Wire to a real backend (Formspree, Resend, your own API) before launch.
const form = document.getElementById("contactForm");
const status = document.getElementById("formStatus");
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  if (!data.name || !data.email || !data.message) {
    status.textContent = "Please fill in all fields.";
    status.dataset.state = "error";
    return;
  }
  status.textContent = "[Stub] Message captured locally. Wire up a real handler.";
  status.dataset.state = "success";
  form.reset();
});