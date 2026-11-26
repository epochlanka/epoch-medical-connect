(function () {
  // Mobile menu
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  toggle.addEventListener("click", function () {
    var open = links.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  links.addEventListener("click", function (e) {
    if (e.target.tagName === "A") links.classList.remove("open");
  });

  // Feature tabs
  var tabs = document.querySelectorAll(".tab");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.toggle("active", t === tab); });
      document.querySelectorAll(".panel").forEach(function (p) {
        p.classList.toggle("active", p.dataset.panel === tab.dataset.tab);
      });
    });
  });

  // Contact cards from config.js
  var c = (window.EPOCH_DEMO && window.EPOCH_DEMO.contact) || {};
  var cards = [];
  function esc(s) { return String(s).replace(/[&<>"']/g, function (ch) { return "&#" + ch.charCodeAt(0) + ";"; }); }
  if (c.phone) cards.push({ ic: "📞", label: "Call us", value: c.phone, href: "tel:" + c.phone.replace(/\s/g, "") });
  if (c.whatsapp) cards.push({ ic: "💬", label: "WhatsApp", value: "Message us", href: "https://wa.me/" + c.whatsapp.replace(/\D/g, "") });
  if (c.email) cards.push({ ic: "✉️", label: "Email", value: c.email, href: "mailto:" + c.email });
  var box = document.getElementById("contactCards");
  if (cards.length) {
    box.innerHTML = cards.map(function (k) {
      return '<a class="contact-card" href="' + esc(k.href) + '" target="_blank" rel="noopener"><span class="ic">' + k.ic +
        '</span><span><small>' + esc(k.label) + "</small><b>" + esc(k.value) + "</b></span></a>";
    }).join("");
  } else {
    document.getElementById("contact").style.display = "none";
    document.querySelectorAll('a[href="#contact"]').forEach(function (a) { a.style.display = "none"; });
  }

  document.getElementById("year").textContent = new Date().getFullYear();
})();
