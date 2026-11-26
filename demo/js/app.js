/*
 * E-POCH interactive demo.
 * Everything runs in the browser; state is kept in localStorage and can be reset.
 * All patients, staff and stock are fictional.
 */
(function () {
  "use strict";

  var CFG = window.EPOCH_DEMO || {};
  var FEE = CFG.consultationFee || 1500;
  var CLINIC = CFG.clinicName || "Demo Clinic";
  var KEY = "epoch-demo-v1";
  var app = document.getElementById("app");

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rs(n) { return "Rs " + Math.round(n).toLocaleString("en-LK"); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return dayKey(d); }
  function daysUntil(key) { var a = new Date(key + "T00:00:00"), b = new Date(dayKey() + "T00:00:00"); return Math.round((a - b) / 864e5); }
  function fmtTime(ts) { return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  function fmtDate(key) { return new Date(key + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
  function minsAgo(ts) { var m = Math.max(0, Math.round((Date.now() - ts) / 60000)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60) + " min"; }
  function initials(name) { return name.split(/\s+/).map(function (p) { return p[0]; }).slice(0, 2).join("").toUpperCase(); }
  function greeting() { var h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; }

  var ICONS = {
    grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
    userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    steth: '<path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    log: '<path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>'
  };
  function icon(name, size) {
    return '<svg class="i" width="' + (size || 18) + '" height="' + (size || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  // ---------- seed data ----------
  var TIMINGS = [
    { code: "OD", label: "OD – once daily", perDay: 1, words: "once a day" },
    { code: "BD", label: "BD – twice daily", perDay: 2, words: "twice a day" },
    { code: "TDS", label: "TDS – three times daily", perDay: 3, words: "three times a day" },
    { code: "QID", label: "QID – four times daily", perDay: 4, words: "four times a day" },
    { code: "Mane", label: "Mane – in the morning", perDay: 1, words: "every morning" },
    { code: "Nocte", label: "Nocte – at night", perDay: 1, words: "every night" },
    { code: "SOS", label: "SOS – when needed", perDay: 0, words: "only when needed" }
  ];
  function timing(code) { return TIMINGS.filter(function (t) { return t.code === code; })[0] || TIMINGS[0]; }

  var DIAGNOSES = ["Viral fever", "Upper respiratory tract infection", "Acute gastritis", "Hypertension – review", "Type 2 diabetes – review", "Allergic rhinitis", "Acute bronchitis", "Bronchial asthma – exacerbation", "Urinary tract infection", "Dengue fever – suspected", "Lower back pain", "Acute gastroenteritis", "Tension headache"];

  function seed() {
    var now = Date.now();
    var meds = [
      { id: "M01", name: "Paracetamol 500 mg", generic: "Paracetamol", unit: "tab", price: 5, reorder: 200, batches: [{ no: "PA-2301", expiry: addDays(40), qty: 120 }, { no: "PA-2402", expiry: addDays(300), qty: 800 }] },
      { id: "M02", name: "Amoxicillin 500 mg", generic: "Amoxicillin", unit: "cap", cls: "penicillin", price: 18, reorder: 150, batches: [{ no: "AM-118", expiry: addDays(200), qty: 300 }] },
      { id: "M03", name: "Cetirizine 10 mg", generic: "Cetirizine", unit: "tab", price: 8, reorder: 100, batches: [{ no: "CE-077", expiry: addDays(20), qty: 60 }, { no: "CE-090", expiry: addDays(400), qty: 400 }] },
      { id: "M04", name: "Omeprazole 20 mg", generic: "Omeprazole", unit: "cap", price: 15, reorder: 100, batches: [{ no: "OM-012", expiry: addDays(250), qty: 350 }] },
      { id: "M05", name: "Metformin 500 mg", generic: "Metformin", unit: "tab", price: 6, reorder: 300, batches: [{ no: "MF-031", expiry: addDays(500), qty: 900 }] },
      { id: "M06", name: "Amlodipine 5 mg", generic: "Amlodipine", unit: "tab", price: 10, reorder: 100, batches: [{ no: "AL-009", expiry: addDays(180), qty: 45 }] },
      { id: "M07", name: "Salbutamol inhaler 100 mcg", generic: "Salbutamol", unit: "inhaler", price: 950, reorder: 5, batches: [{ no: "SB-004", expiry: addDays(365), qty: 12 }] },
      { id: "M08", name: "Azithromycin 500 mg", generic: "Azithromycin", unit: "tab", cls: "macrolide", price: 75, reorder: 30, batches: [{ no: "AZ-005", expiry: addDays(150), qty: 90 }] },
      { id: "M09", name: "Losartan 50 mg", generic: "Losartan", unit: "tab", price: 14, reorder: 150, batches: [{ no: "LS-002", expiry: addDays(330), qty: 500 }] },
      { id: "M10", name: "Cough syrup 100 ml", generic: "Diphenhydramine", unit: "bottle", price: 450, reorder: 10, batches: [{ no: "CS-001", expiry: addDays(25), qty: 30 }] },
      { id: "M11", name: "Diclofenac 50 mg", generic: "Diclofenac", unit: "tab", cls: "nsaid", price: 7, reorder: 100, batches: [{ no: "DC-008", expiry: addDays(-5), qty: 40 }, { no: "DC-009", expiry: addDays(210), qty: 300 }] },
      { id: "M12", name: "ORS sachet", generic: "Oral rehydration salts", unit: "sachet", price: 60, reorder: 50, batches: [{ no: "OR-003", expiry: addDays(700), qty: 150 }] },
      { id: "M13", name: "Ibuprofen 400 mg", generic: "Ibuprofen", unit: "tab", cls: "nsaid", price: 9, reorder: 100, batches: [{ no: "IB-044", expiry: addDays(12), qty: 70 }] },
      { id: "M14", name: "Prednisolone 5 mg", generic: "Prednisolone", unit: "tab", price: 4, reorder: 100, batches: [{ no: "PR-021", expiry: addDays(280), qty: 250 }] }
    ];
    var patients = [
      { id: "PT-0001", name: "Kasun Jayawardena", gender: "Male", age: 34, phone: "071 234 5501", nic: "199012345678", address: "Kandy Road, Kadawatha", allergies: [], conditions: [] },
      { id: "PT-0002", name: "Nimali Perera", gender: "Female", age: 41, phone: "077 234 5502", nic: "198534567890", address: "Temple Road, Maharagama", allergies: [{ name: "Amoxicillin (penicillin-class)", cls: "penicillin" }], conditions: ["Hypertension"] },
      { id: "PT-0003", name: "Ruwan Fernando", gender: "Male", age: 58, phone: "076 234 5503", nic: "196745678901", address: "Galle Road, Moratuwa", allergies: [], conditions: ["Type 2 diabetes"] },
      { id: "PT-0004", name: "Sanduni Wickramasinghe", gender: "Female", age: 27, phone: "070 234 5504", nic: "199856789012", address: "Station Road, Gampaha", allergies: [], conditions: [] },
      { id: "PT-0005", name: "Mohamed Rizwan", gender: "Male", age: 45, phone: "075 234 5505", nic: "197967890123", address: "Main Street, Negombo", allergies: [{ name: "Diclofenac (NSAID)", cls: "nsaid" }], conditions: [] },
      { id: "PT-0006", name: "Tharushi Senanayake", gender: "Female", age: 8, phone: "072 234 5506", nic: "", address: "Lake Drive, Kurunegala", allergies: [], conditions: [], guardian: "Chamari Senanayake" },
      { id: "PT-0007", name: "Anura Bandara", gender: "Male", age: 67, phone: "078 234 5507", nic: "195878901234", address: "Hill Street, Matale", allergies: [], conditions: ["Hypertension", "Asthma"] },
      { id: "PT-0008", name: "Priya Rajendran", gender: "Female", age: 36, phone: "077 234 5508", nic: "198889012345", address: "Sea View Road, Trincomalee", allergies: [], conditions: [] }
    ];
    var visits = [
      // earlier visits (history)
      pastVisit("V-0901", "PT-0002", -30, "Hypertension – review", [rx("M06", "1 tab", "OD", 30)]),
      pastVisit("V-0902", "PT-0003", -28, "Type 2 diabetes – review", [rx("M05", "1 tab", "BD", 30)]),
      pastVisit("V-0903", "PT-0007", -14, "Bronchial asthma – exacerbation", [rx("M07", "2 puffs", "SOS", 0, 1), rx("M14", "2 tab", "OD", 5)]),
      pastVisit("V-0904", "PT-0001", -60, "Acute gastritis", [rx("M04", "1 cap", "BD", 14)]),
      // today
      todayVisit("V-1001", "T-001", "PT-0001", now - 140 * 60000, "done", "Fever and body aches for 2 days", "Viral fever", [rx("M01", "1 tab", "TDS", 3)], { temp: "38.2", bp: "122/80", pulse: "92", spo2: "98", weight: "71", height: "172" }, "Cash"),
      todayVisit("V-1002", "T-002", "PT-0005", now - 110 * 60000, "done", "Burning upper abdominal pain after meals", "Acute gastritis", [rx("M04", "1 cap", "BD", 14)], { temp: "36.8", bp: "130/84", pulse: "78", spo2: "99", weight: "82", height: "175" }, "Card"),
      todayVisit("V-1003", "T-003", "PT-0003", now - 55 * 60000, "pharmacy", "Routine diabetes review. Sugar control fair.", "Type 2 diabetes – review", [rx("M05", "1 tab", "BD", 30), rx("M09", "1 tab", "OD", 30)], { temp: "36.6", bp: "138/88", pulse: "76", spo2: "98", weight: "79", height: "168" }),
      todayVisit("V-1004", "T-004", "PT-0002", now - 24 * 60000, "waiting"),
      todayVisit("V-1005", "T-005", "PT-0007", now - 9 * 60000, "waiting")
    ];
    // apply stock for already-dispensed visits
    var s = { day: dayKey(), meds: meds, patients: patients, visits: visits, nextPatient: 9, nextToken: 6, nextVisit: 1006,
      revenueHistory: [9800, 12400, 7600, 13900, 11200, 14600], log: [], tour: {} };
    visits.forEach(function (v) {
      if (v.status === "done" && v.rx.length) v.dispensed = allocate(s, v, true);
    });
    s.log = [
      { ts: now - 140 * 60000, who: "Reception", text: "Added Kasun Jayawardena to the queue (T-001)" },
      { ts: now - 118 * 60000, who: "Pharmacy", text: "Dispensed T-001 – Paracetamol 500 mg ×9" },
      { ts: now - 112 * 60000, who: "Reception", text: "Payment " + rs(FEE + 45) + " (Cash) for T-001" },
      { ts: now - 40 * 60000, who: "Doctor", text: "Completed consultation for Ruwan Fernando (T-003)" }
    ];
    return s;

    function rx(medId, dose, t, days, qty) {
      var m = meds.filter(function (x) { return x.id === medId; })[0];
      var r = { medId: medId, name: m.name, dose: dose, timing: t, days: days, startDate: dayKey() };
      r.qty = qty != null ? qty : calcQty(m, dose, t, days);
      return r;
    }
    function pastVisit(id, pid, offset, diag, items) {
      return { id: id, token: "", patientId: pid, day: addDays(offset), arrivedAt: now + offset * 864e5, status: "done", complaint: "", diagnosis: diag, notes: "", vitals: {}, rx: items, fee: FEE, dispensed: [], paid: { total: FEE, method: "Cash", at: now + offset * 864e5 } };
    }
    function todayVisit(id, token, pid, at, status, complaint, diag, items, vitals, method) {
      var v = { id: id, token: token, patientId: pid, day: dayKey(), arrivedAt: at, status: status, complaint: complaint || "", findings: "", diagnosis: diag || "", notes: "", vitals: vitals || {}, rx: items || [], fee: FEE, dispensed: [], paid: null, followUp: "" };
      if (status === "done") v.paidPending = method;
      return v;
    }
  }

  function calcQty(med, dose, t, days) {
    if (!med) return 0;
    if (["tab", "cap"].indexOf(med.unit) === -1) return 1;
    var per = parseFloat(dose) || 1;
    var tm = timing(t);
    if (!tm.perDay) return Math.max(1, Math.ceil(per * 6));
    return Math.max(1, Math.ceil(per * tm.perDay * (parseInt(days, 10) || 1)));
  }

  // ---------- state ----------
  var S;
  function load() {
    try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
    if (!S || S.day !== dayKey() || !S.meds) {
      S = seed();
      // settle the seeded "done" visits' payments
      S.visits.forEach(function (v) {
        if (v.paidPending) { v.paid = { total: bill(v).total, method: v.paidPending, at: v.arrivedAt + 25 * 60000 }; delete v.paidPending; }
      });
      save();
    }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  function log(who, text) { S.log.unshift({ ts: Date.now(), who: who, text: text }); S.log = S.log.slice(0, 60); }

  function patient(id) { return S.patients.filter(function (p) { return p.id === id; })[0]; }
  function visit(id) { return S.visits.filter(function (v) { return v.id === id; })[0]; }
  function med(id) { return S.meds.filter(function (m) { return m.id === id; })[0]; }
  function today() { return S.visits.filter(function (v) { return v.day === dayKey(); }).sort(function (a, b) { return a.arrivedAt - b.arrivedAt; }); }
  function byStatus(st) { return today().filter(function (v) { return v.status === st; }); }
  function stock(m) { return m.batches.filter(function (b) { return daysUntil(b.expiry) >= 0; }).reduce(function (a, b) { return a + b.qty; }, 0); }
  function usableBatches(m) { return m.batches.filter(function (b) { return b.qty > 0 && daysUntil(b.expiry) >= 0; }).sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; }); }

  // FEFO allocation: earliest-expiring valid batch first. commit=true deducts stock.
  function allocate(state, v, commit) {
    return v.rx.map(function (r) {
      var m = state.meds.filter(function (x) { return x.id === r.medId; })[0];
      var need = r.qty, picks = [];
      if (m) {
        m.batches.filter(function (b) { return b.qty > 0 && daysUntil(b.expiry) >= 0; })
          .sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; })
          .forEach(function (b) {
            if (need <= 0) return;
            var take = Math.min(need, b.qty);
            picks.push({ no: b.no, expiry: b.expiry, qty: take });
            if (commit) b.qty -= take;
            need -= take;
          });
      }
      return { medId: r.medId, name: r.name, qty: r.qty - need, short: need, price: m ? m.price : 0, picks: picks };
    });
  }
  function bill(v) {
    var items = [{ label: "Consultation fee", qty: 1, price: v.fee, total: v.fee }];
    (v.dispensed || []).forEach(function (d) { if (d.qty > 0) items.push({ label: d.name, qty: d.qty, price: d.price, total: d.qty * d.price }); });
    var total = items.reduce(function (a, i) { return a + i.total; }, 0);
    return { items: items, total: total };
  }
  function allergyConflict(p, m) {
    if (!m || !m.cls) return null;
    return p.allergies.filter(function (a) { return a.cls === m.cls; })[0] || null;
  }

  // ---------- roles ----------
  var ROLES = {
    reception: { label: "Reception", user: "Dilani", title: "Front desk", color: "#2563eb", home: "dashboard",
      nav: [["Front desk", [["dashboard", "Today's queue", "grid"], ["register", "Register patient", "userplus"], ["patients", "Patients", "users"], ["billing", "Billing", "card"]]]] },
    doctor: { label: "Doctor", user: "Dr. A. Silva", title: "Doctor", color: "#059669", home: "today",
      nav: [["Clinical day", [["today", "Today", "grid"], ["history", "Prescriptions", "file"]]], ["Records", [["patients", "Patient search", "search"]]]] },
    pharmacy: { label: "Pharmacy", user: "Kamal", title: "Pharmacist", color: "#7c3aed", home: "queue",
      nav: [["Dispensary", [["queue", "Dispensing queue", "pill"], ["inventory", "Inventory", "box"]]]] },
    admin: { label: "Administration", user: "Admin", title: "Clinic owner", color: "#0f172a", home: "dashboard",
      nav: [["Overview", [["dashboard", "Dashboard", "chart"], ["activity", "Audit trail", "log"], ["users", "Users & roles", "shield"]]], ["Stock", [["inventory", "Inventory", "box"]]]] }
  };
  function badge(role, page) {
    if (role === "reception" && page === "billing") return byStatus("billing").length;
    if (role === "reception" && page === "dashboard") return byStatus("waiting").length;
    if (role === "doctor" && page === "today") return byStatus("waiting").length;
    if (role === "pharmacy" && page === "queue") return byStatus("pharmacy").length;
    return 0;
  }

  // ---------- router ----------
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    return { role: parts[0] || "", page: parts[1] || "", id: parts[2] || "" };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  window.addEventListener("hashchange", render);

  // ---------- tour ----------
  var TOUR = [
    { key: "registered", text: "Register a new patient", role: "reception", page: "register" },
    { key: "queued", text: "Add them to today's queue", role: "reception", page: "dashboard" },
    { key: "consulted", text: "Consult and prescribe as the doctor", role: "doctor", page: "today" },
    { key: "dispensed", text: "Dispense the medicines", role: "pharmacy", page: "queue" },
    { key: "paid", text: "Take the payment", role: "reception", page: "billing" }
  ];
  function tourHtml() {
    if (S.tour.hidden) return '<button class="tour-pill" data-act="tour-show">' + icon("flag", 16) + " Demo guide</button>";
    var next = TOUR.filter(function (t) { return !S.tour[t.key]; })[0];
    var done = TOUR.length - TOUR.filter(function (t) { return !S.tour[t.key]; }).length;
    return '<aside class="tour"><div class="tour-h"><b>' + icon("flag", 16) + " Try a full visit</b><span>" + done + "/" + TOUR.length + '</span><button class="icon-btn" data-act="tour-hide" aria-label="Hide guide">' + icon("x", 16) + "</button></div>" +
      '<div class="tour-bar"><i style="width:' + (done / TOUR.length * 100) + '%"></i></div><ol>' +
      TOUR.map(function (t) {
        var cls = S.tour[t.key] ? "done" : t === next ? "next" : "";
        return '<li class="' + cls + '"><span class="tick">' + (S.tour[t.key] ? icon("check", 12) : "") + "</span><span>" + t.text + ' <em class="role-tag r-' + t.role + '">' + ROLES[t.role].label + "</em></span>" +
          (t === next ? '<button class="btn btn-xs btn-primary" data-go="#/' + t.role + "/" + t.page + '">Go</button>' : "") + "</li>";
      }).join("") + "</ol>" +
      (next ? "" : '<p class="tour-done">That is the whole visit — one record from front desk to payment. Open <a href="#/admin/dashboard">Administration</a> to see it in the reports.</p>') +
      "</aside>";
  }
  function tourMark(key) { if (!S.tour[key]) { S.tour[key] = true; save(); } }

  // ---------- render ----------
  function render() {
    var r = route();
    closeSearch();
    if (!ROLES[r.role]) { app.innerHTML = loginView(); return; }
    var role = ROLES[r.role];
    var page = r.page || role.home;
    var body;
    try { body = PAGES[r.role][page] ? PAGES[r.role][page](r.id) : PAGES[r.role][role.home](); }
    catch (e) { console.error(e); body = '<div class="empty">Something went wrong. <button class="btn btn-sm" data-act="reset">Reset demo</button></div>'; }
    app.innerHTML =
      '<div class="shell" style="--role:' + role.color + '">' +
      '<aside class="side"><a class="brand" href="index.html"><img src="assets/logo.svg" alt="" width="38" height="38"><span><b>E-POCH</b><small>Medical System</small></span></a>' +
      '<div class="clinic">' + esc(CLINIC) + "</div>" +
      role.nav.map(function (g) {
        return '<div class="nav-group"><div class="nav-h">' + g[0] + "</div>" + g[1].map(function (n) {
          var b = badge(r.role, n[0]);
          return '<a class="nav-item' + (n[0] === page || (page === "consult" && n[0] === "today") || (page === "dispense" && n[0] === "queue") ? " active" : "") + '" href="#/' + r.role + "/" + n[0] + '">' + icon(n[2]) + "<span>" + n[1] + "</span>" + (b ? '<em class="nb">' + b + "</em>" : "") + "</a>";
        }).join("") + "</div>";
      }).join("") +
      '<div class="side-tour">' + tourHtml() + "</div>" +
      '<div class="side-foot"><a class="nav-item" href="index.html">' + icon("home") + "<span>Back to website</span></a></div></aside>" +
      '<div class="main"><header class="top">' +
      '<div class="gsearch">' + icon("search") + '<input id="gsearch" type="search" placeholder="Search patients by name, number, phone or NIC…" autocomplete="off"><div class="gresults" id="gresults"></div></div>' +
      '<div class="top-r">' +
      '<label class="switch"><span>Demo role</span><select id="roleSwitch">' + Object.keys(ROLES).map(function (k) { return '<option value="' + k + '"' + (k === r.role ? " selected" : "") + ">" + ROLES[k].label + "</option>"; }).join("") + "</select></label>" +
      '<button class="icon-btn" data-act="reset" title="Reset the demo data">' + icon("reset") + "</button>" +
      '<div class="me"><span class="av" style="background:' + role.color + '">' + initials(role.user) + "</span><span><b>" + esc(role.user) + "</b><small>" + role.title + "</small></span></div>" +
      "</div></header>" +
      '<main class="content"><div class="top-tour">' + tourHtml() + "</div>" + body + "</main></div></div>";
    if (AFTER[r.role + "/" + page]) AFTER[r.role + "/" + page](r.id);
    window.scrollTo(0, 0);
  }

  function loginView() {
    var cards = [
      ["reception", "Register patients, run the queue and take payments.", "userplus"],
      ["doctor", "See the waiting room, consult and prescribe.", "steth"],
      ["pharmacy", "Dispense prescriptions and manage stock.", "pill"],
      ["admin", "Revenue, stock alerts, audit trail and users.", "chart"]
    ];
    return '<div class="login"><div class="login-card">' +
      '<a class="brand big" href="index.html"><img src="assets/logo.svg" alt="" width="52" height="52"><span><b>E-POCH</b><small>Medical System</small></span></a>' +
      "<h1>Live demo</h1><p class=\"muted\">Choose a role to sign in. In a real clinic each person signs in with their own account and sees only their workspace.</p>" +
      '<div class="roles">' + cards.map(function (c) {
        var r = ROLES[c[0]];
        return '<a class="role-card" href="#/' + c[0] + "/" + r.home + '" style="--role:' + r.color + '"><span class="role-ic">' + icon(c[2], 22) + "</span><b>" + r.label + "</b><span>" + c[1] + "</span></a>";
      }).join("") + "</div>" +
      '<p class="hint">' + icon("flag", 14) + " New here? Start with <a href=\"#/reception/register\">Reception</a> and follow the demo guide.</p>" +
      '<p class="fine">All patients and data are fictional. Everything stays in your browser.</p></div></div>';
  }

  function pageHead(title, sub, actions) {
    return '<div class="ph"><div><h1>' + title + "</h1>" + (sub ? '<p class="muted">' + sub + "</p>" : "") + "</div>" + (actions ? '<div class="ph-a">' + actions + "</div>" : "") + "</div>";
  }
  function statusPill(st) {
    var map = { waiting: ["Waiting", "amber"], consulting: ["With doctor", "green"], pharmacy: ["At pharmacy", "violet"], billing: ["To pay", "orange"], done: ["Completed", "gray"] };
    var m = map[st] || [st, "gray"];
    return '<span class="pill ' + m[1] + '">' + m[0] + "</span>";
  }
  function patientChip(p, extra) {
    return '<div class="pchip"><span class="av sm">' + initials(p.name) + '</span><div><a class="link" href="javascript:void 0" data-profile="' + p.id + '">' + esc(p.name) + "</a><small>" + p.id + " · " + p.age + " Y · " + p.gender + (extra ? " · " + extra : "") + "</small></div></div>";
  }
  function allergyChips(p) {
    if (!p.allergies.length) return '<span class="pill gray">No known allergies</span>';
    return p.allergies.map(function (a) { return '<span class="pill red">' + icon("alert", 13) + " Allergy: " + esc(a.name) + "</span>"; }).join(" ");
  }
  function stat(n, label, tone) { return '<div class="stat ' + (tone || "") + '"><b>' + n + "</b><span>" + label + "</span></div>"; }

  var PAGES = { reception: {}, doctor: {}, pharmacy: {}, admin: {} };
  var AFTER = {};

  // ===== Reception =====
  PAGES.reception.dashboard = function () {
    var t = today();
    var rows = t.map(function (v) {
      var p = patient(v.patientId);
      var action = v.status === "billing" ? '<button class="btn btn-sm btn-primary" data-go="#/reception/billing/' + v.id + '">Take payment</button>' : "";
      return "<tr><td><b class=\"tok-sm\">" + v.token + "</b></td><td>" + patientChip(p) + "</td><td>" + fmtTime(v.arrivedAt) + '<small class="muted block">' + (v.status === "done" ? "" : minsAgo(v.arrivedAt) + " ago") + "</small></td><td>" + statusPill(v.status) + '</td><td class="r">' + action + "</td></tr>";
    }).join("");
    return pageHead(greeting() + ", " + ROLES.reception.user, new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
      '<a class="btn btn-primary" href="#/reception/register">' + icon("userplus") + " Register patient</a>") +
      '<div class="stats">' + stat(byStatus("waiting").length, "Waiting") + stat(byStatus("consulting").length, "With doctor") + stat(byStatus("pharmacy").length, "At pharmacy") + stat(byStatus("billing").length, "Waiting to pay", byStatus("billing").length ? "hl" : "") + stat(byStatus("done").length, "Completed") + "</div>" +
      '<div class="card"><div class="card-h"><h2>Add a returning patient to the queue</h2></div><div class="card-b"><div class="qadd">' + icon("search") + '<input id="qsearch" placeholder="Type a name, phone number, patient number or NIC" autocomplete="off"><div class="qresults" id="qresults"></div></div></div></div>' +
      '<div class="card"><div class="card-h"><h2>Today\'s queue</h2><span class="muted">' + t.length + " visits</span></div>" +
      (t.length ? '<div class="tw"><table class="tbl"><thead><tr><th>Token</th><th>Patient</th><th>Arrived</th><th>Status</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<div class="empty">No visits yet today.</div>') + "</div>";
  };
  AFTER["reception/dashboard"] = function () {
    var input = document.getElementById("qsearch"), box = document.getElementById("qresults");
    input.addEventListener("input", function () {
      var res = searchPatients(input.value);
      box.innerHTML = res.length ? res.map(function (p) {
        var inQ = today().some(function (v) { return v.patientId === p.id && v.status !== "done"; });
        return '<div class="qr">' + patientChip(p, esc(p.phone)) + (inQ ? '<span class="pill gray">Already in queue</span>' : '<button class="btn btn-sm btn-primary" data-act="enqueue" data-id="' + p.id + '">' + icon("plus", 14) + " Add to queue</button>") + "</div>";
      }).join("") : input.value.trim() ? '<div class="qr muted">No match. <a class="link" href="#/reception/register">Register a new patient</a></div>' : "";
    });
  };

  function searchPatients(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) return [];
    var digits = q.replace(/\s/g, "");
    return S.patients.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) > -1 || p.id.toLowerCase().indexOf(q) > -1 || (p.nic && p.nic.indexOf(digits) > -1) || p.phone.replace(/\s/g, "").indexOf(digits) > -1;
    }).slice(0, 6);
  }

  function enqueue(pid) {
    var p = patient(pid);
    var v = { id: "V-" + S.nextVisit++, token: "T-" + String(S.nextToken++).padStart(3, "0"), patientId: pid, day: dayKey(), arrivedAt: Date.now(), status: "waiting", complaint: "", findings: "", diagnosis: "", notes: "", vitals: {}, rx: [], fee: FEE, dispensed: [], paid: null, followUp: "" };
    S.visits.push(v);
    log("Reception", "Added " + p.name + " to the queue (" + v.token + ")");
    if (S.tour.registered && S.tour.newPatient === pid) tourMark("queued");
    save();
    toast(p.name + " added to the queue as " + v.token, "ok");
    return v;
  }

  PAGES.reception.register = function () {
    return pageHead("Register patient", "Only the name, gender and age or date of birth are required.") +
      '<form class="card form" data-form="register"><div class="card-b grid2">' +
      field("Full name *", '<input name="name" required placeholder="e.g. Chathura Dissanayake">') +
      field("Gender *", '<select name="gender" required><option value="">Select</option><option>Female</option><option>Male</option><option>Other</option></select>') +
      field("Age (years) *", '<input name="age" type="number" min="0" max="120" required placeholder="e.g. 32">') +
      field("Mobile number", '<input name="phone" inputmode="tel" placeholder="07X XXX XXXX">') +
      field("NIC", '<input name="nic" placeholder="Old or new NIC">') +
      field("Address", '<input name="address" placeholder="Town or street">') +
      field("Known allergies", '<input name="allergies" placeholder="e.g. Penicillin, Diclofenac — separate with commas">', "The doctor is warned before prescribing a matching medicine.") +
      field("Long-term conditions", '<input name="conditions" placeholder="e.g. Diabetes, Hypertension">') +
      '<div class="dup span2" id="dupWarn"></div>' +
      '<label class="check span2"><input type="checkbox" name="enqueue" checked> Add to today\'s queue after registering</label>' +
      '</div><div class="card-f"><button type="button" class="btn" data-act="fill-sample">Fill with a sample patient</button><button class="btn btn-primary" type="submit">' + icon("check") + " Register</button></div></form>";
  };
  AFTER["reception/register"] = function () {
    var f = document.querySelector('[data-form="register"]');
    function check() {
      var ph = f.phone.value.replace(/\s/g, ""), nic = f.nic.value.trim();
      var d = S.patients.filter(function (p) { return (ph.length >= 9 && p.phone.replace(/\s/g, "") === ph) || (nic.length >= 9 && p.nic === nic); })[0];
      document.getElementById("dupWarn").innerHTML = d ? '<div class="alert warn">' + icon("alert") + " A patient with this " + (d.nic === nic ? "NIC" : "phone number") + " already exists: <a class=\"link\" href=\"javascript:void 0\" data-profile=\"" + d.id + "\">" + esc(d.name) + " (" + d.id + ")</a>. Check before creating a duplicate.</div>" : "";
    }
    f.phone.addEventListener("input", check);
    f.nic.addEventListener("input", check);
  };
  function field(label, control, hint) {
    return '<label class="fld"><span>' + label + "</span>" + control + (hint ? "<small>" + hint + "</small>" : "") + "</label>";
  }
  var ALLERGY_CLASSES = { penicillin: /penic|amox|ampic|augmentin/i, nsaid: /nsaid|diclo|ibupro|aspirin|mefenamic/i, macrolide: /macrolide|azith|erythro|clarith/i };
  function parseAllergies(txt) {
    return txt.split(",").map(function (s) { return s.trim(); }).filter(Boolean).map(function (n) {
      var cls = null;
      Object.keys(ALLERGY_CLASSES).forEach(function (k) { if (ALLERGY_CLASSES[k].test(n)) cls = k; });
      return { name: n, cls: cls };
    });
  }

  PAGES.reception.patients = PAGES.doctor.patients = function () {
    var role = route().role;
    var rows = S.patients.slice().reverse().map(function (p) {
      var last = S.visits.filter(function (v) { return v.patientId === p.id; }).sort(function (a, b) { return b.arrivedAt - a.arrivedAt; })[0];
      return '<tr data-row="' + esc((p.name + " " + p.id + " " + p.phone + " " + p.nic).toLowerCase()) + '"><td>' + patientChip(p) + "</td><td>" + esc(p.phone) + "</td><td>" + (p.allergies.length ? '<span class="pill red">' + p.allergies.length + " allerg" + (p.allergies.length > 1 ? "ies" : "y") + "</span>" : '<span class="muted">—</span>') + "</td><td>" + (last ? fmtDate(last.day) : "—") + '</td><td class="r">' +
        (role === "reception" ? '<button class="btn btn-sm" data-act="enqueue" data-id="' + p.id + '">Add to queue</button>' : '<button class="btn btn-sm" data-profile="' + p.id + '">Open</button>') + "</td></tr>";
    }).join("");
    return pageHead("Patients", S.patients.length + " registered patients", role === "reception" ? '<a class="btn btn-primary" href="#/reception/register">' + icon("userplus") + " Register patient</a>" : "") +
      '<div class="card"><div class="card-b"><input class="filter" id="pfilter" placeholder="Filter by name, number, phone or NIC"></div><div class="tw"><table class="tbl"><thead><tr><th>Patient</th><th>Phone</th><th>Allergies</th><th>Last visit</th><th></th></tr></thead><tbody id="ptbody">' + rows + "</tbody></table></div></div>";
  };
  AFTER["reception/patients"] = AFTER["doctor/patients"] = function () {
    var inp = document.getElementById("pfilter");
    inp.addEventListener("input", function () {
      var q = inp.value.toLowerCase().replace(/\s/g, "");
      document.querySelectorAll("#ptbody tr").forEach(function (tr) { tr.style.display = tr.dataset.row.replace(/\s/g, "").indexOf(q) > -1 ? "" : "none"; });
    });
  };

  PAGES.reception.billing = function (id) {
    var list = byStatus("billing");
    var sel = id ? visit(id) : list[0];
    if (sel && sel.status !== "billing" && !(sel.paid && id)) sel = list[0];
    var left = list.length ? list.map(function (v) {
      var p = patient(v.patientId);
      return '<a class="bill-item' + (sel && sel.id === v.id ? " active" : "") + '" href="#/reception/billing/' + v.id + '"><b class="tok-sm">' + v.token + "</b><span>" + esc(p.name) + "</span><em>" + rs(bill(v).total) + "</em></a>";
    }).join("") : '<div class="empty sm">No one is waiting to pay.</div>';
    var paidToday = today().filter(function (v) { return v.paid; });
    var right = sel ? invoiceHtml(sel) : '<div class="empty">Patients appear here after the pharmacy hands over their medicines, or straight after the doctor if nothing was prescribed.</div>';
    return pageHead("Billing", "Consultation and dispensed medicines on one invoice.") +
      '<div class="bill-grid"><div class="card"><div class="card-h"><h2>Waiting to pay</h2></div><div class="bill-list">' + left + "</div>" +
      '<div class="card-h top-b"><h2>Paid today</h2><span class="muted">' + rs(paidToday.reduce(function (a, v) { return a + v.paid.total; }, 0)) + '</span></div><div class="bill-list">' +
      paidToday.map(function (v) { return '<a class="bill-item paid" href="#/reception/billing/' + v.id + '"><b class="tok-sm">' + v.token + "</b><span>" + esc(patient(v.patientId).name) + "</span><em>" + v.paid.method + "</em></a>"; }).join("") +
      "</div></div>" + right + "</div>";
  };
  function invoiceHtml(v) {
    var p = patient(v.patientId), b = bill(v);
    var short = (v.dispensed || []).filter(function (d) { return d.short > 0; });
    return '<div class="card invoice" id="printArea"><div class="inv-h"><div><small class="muted">Invoice</small><h2>' + v.id.replace("V", "INV") + '</h2></div><div class="r"><b>' + esc(CLINIC) + '</b><small class="muted block">' + fmtDate(v.day) + " · " + v.token + "</small></div></div>" +
      '<div class="card-b">' + patientChip(p) +
      '<table class="tbl inv"><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>' +
      b.items.map(function (i) { return "<tr><td>" + esc(i.label) + '</td><td class="r">' + i.qty + '</td><td class="r">' + rs(i.price) + '</td><td class="r">' + rs(i.total) + "</td></tr>"; }).join("") +
      '</tbody><tfoot><tr><td colspan="3">Total</td><td class="r">' + rs(b.total) + "</td></tr></tfoot></table>" +
      (short.length ? '<div class="alert warn">' + icon("alert") + " Not enough stock for: " + short.map(function (d) { return esc(d.name) + " (" + d.short + " short)"; }).join(", ") + ". Only what was handed over is charged.</div>" : "") +
      (v.paid ? '<div class="alert ok">' + icon("check") + " Paid " + rs(v.paid.total) + " by " + v.paid.method + " at " + fmtTime(v.paid.at) + '.</div><div class="card-f np"><button class="btn" data-act="print">' + icon("print") + " Print receipt</button></div>" :
        '<form data-form="pay" data-id="' + v.id + '" class="pay"><div class="seg">' + ["Cash", "Card", "Mobile"].map(function (m, i) { return '<label><input type="radio" name="method" value="' + m + '"' + (i === 0 ? " checked" : "") + "><span>" + m + "</span></label>"; }).join("") + "</div>" +
        '<div class="cash" id="cashRow">' + field("Cash received", '<input name="tendered" type="number" min="0" step="10" placeholder="' + b.total + '">') + '<div class="change"><small>Change</small><b id="change">—</b></div></div>' +
        '<button class="btn btn-primary btn-lg w100" type="submit">' + icon("check") + " Record payment of " + rs(b.total) + "</button></form>") +
      "</div></div>";
  }
  AFTER["reception/billing"] = function () {
    var f = document.querySelector('[data-form="pay"]');
    if (!f) return;
    var total = bill(visit(f.dataset.id)).total;
    function upd() {
      var cash = f.method.value === "Cash";
      document.getElementById("cashRow").style.display = cash ? "" : "none";
      var t = parseFloat(f.tendered.value);
      document.getElementById("change").textContent = t >= total ? rs(t - total) : "—";
    }
    f.addEventListener("change", upd);
    f.tendered.addEventListener("input", upd);
  };

  // ===== Doctor =====
  PAGES.doctor.today = function () {
    var cur = byStatus("consulting")[0];
    var waiting = byStatus("waiting");
    var hero = cur ? (function () {
      var p = patient(cur.patientId);
      return '<div class="live"><div><small><i class="dot"></i> Consultation in progress</small><div class="live-row"><b class="tok">' + cur.token + '</b><span class="av lg">' + initials(p.name) + "</span><div><b>" + esc(p.name) + "</b><em>" + p.id + " · " + p.age + " Y · " + p.gender + "</em></div></div><em>" + minsAgo(cur.arrivedAt) + ' since arrival</em></div><a class="btn btn-white btn-lg" href="#/doctor/consult/' + cur.id + '">' + icon("steth") + " Continue consultation</a></div>";
    })() : waiting.length ? '<div class="live idle"><div><small>Next patient</small><div class="live-row"><b class="tok">' + waiting[0].token + "</b><div><b>" + esc(patient(waiting[0].patientId).name) + "</b><em>waiting " + minsAgo(waiting[0].arrivedAt) + '</em></div></div></div><button class="btn btn-white btn-lg" data-act="call-next">' + icon("arrow") + " Call next patient</button></div>"
      : '<div class="live idle"><div><small>Waiting room</small><div class="live-row"><b>No one is waiting.</b></div><em>Add a patient from Reception to see them appear here.</em></div><a class="btn btn-white btn-lg" href="#/reception/dashboard">Go to Reception</a></div>';
    var rows = waiting.map(function (v) {
      var p = patient(v.patientId);
      return "<tr><td><b class=\"tok-sm\">" + v.token + "</b></td><td>" + patientChip(p) + "</td><td>" + (p.allergies.length ? '<span class="pill red">' + icon("alert", 12) + " Allergy</span>" : "") + " " + p.conditions.map(function (c) { return '<span class="pill gray">' + esc(c) + "</span>"; }).join(" ") + "</td><td>" + minsAgo(v.arrivedAt) + '</td><td class="r"><button class="btn btn-sm' + (cur ? "" : " btn-primary") + '" data-act="start" data-id="' + v.id + '"' + (cur ? " disabled title=\"Finish the current consultation first\"" : "") + ">Start</button></td></tr>";
    }).join("");
    var rxToday = today().filter(function (v) { return v.rx.length && ["pharmacy", "billing", "done"].indexOf(v.status) > -1; }).length;
    return pageHead(greeting() + ", " + ROLES.doctor.user, new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })) + hero +
      '<div class="stats">' + stat(waiting.length, "Waiting now") + stat(byStatus("done").length + byStatus("billing").length + byStatus("pharmacy").length, "Seen today") + stat(rxToday, "Prescriptions today") + "</div>" +
      '<div class="card"><div class="card-h"><h2>Waiting room</h2></div>' + (waiting.length ? '<div class="tw"><table class="tbl"><thead><tr><th>Token</th><th>Patient</th><th>Flags</th><th>Waiting</th><th></th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<div class="empty">No patients are waiting.</div>') + "</div>";
  };

  PAGES.doctor.consult = function (id) {
    var v = visit(id);
    if (!v) return '<div class="empty">Consultation not found. <a class="link" href="#/doctor/today">Back to today</a></div>';
    var p = patient(v.patientId);
    var hist = S.visits.filter(function (x) { return x.patientId === p.id && x.id !== v.id && x.status === "done"; }).sort(function (a, b) { return b.arrivedAt - a.arrivedAt; });
    var vt = v.vitals || {};
    var bmi = vt.weight && vt.height ? (vt.weight / Math.pow(vt.height / 100, 2)).toFixed(1) : "";
    var locked = v.status !== "consulting";
    return pageHead("Consultation · " + v.token, locked ? "This visit is closed. Shown read-only." : "Changes are saved as you type.", '<a class="btn" href="#/doctor/today">← Back to queue</a>') +
      '<div class="card phead"><div class="card-b ph-grid"><span class="av xl">' + initials(p.name) + '</span><div><h2>' + esc(p.name) + ' <span class="pill blue">' + v.token + '</span></h2><p class="muted">' + p.id + " · " + p.age + " Y / " + p.gender + " · " + esc(p.phone) + (p.guardian ? " · Guardian: " + esc(p.guardian) : "") + '</p><div class="chips">' + allergyChips(p) + " " + p.conditions.map(function (c) { return '<span class="pill gray">' + esc(c) + "</span>"; }).join(" ") + '</div></div><div class="meta"><div><small>Arrived</small><b>' + fmtTime(v.arrivedAt) + "</b></div><div><small>Last visit</small><b>" + (hist[0] ? fmtDate(hist[0].day) : "First visit") + "</b></div><div><small>Status</small>" + statusPill(v.status) + "</div></div></div></div>" +
      '<div class="consult-grid"><div>' +
      '<fieldset class="card" ' + (locked ? "disabled" : "") + ' data-form="consult" data-id="' + v.id + '"><div class="card-h"><h2>Vital signs</h2></div><div class="card-b vitals">' +
      vit("temp", "Temp °C", vt.temp) + vit("bp", "BP mmHg", vt.bp) + vit("pulse", "Pulse /min", vt.pulse) + vit("spo2", "SpO₂ %", vt.spo2) + vit("weight", "Weight kg", vt.weight) + vit("height", "Height cm", vt.height) +
      '<div class="vit ro"><span>BMI</span><b id="bmi">' + (bmi || "—") + "</b></div></div>" +
      '<div class="card-h top-b"><h2>Assessment</h2></div><div class="card-b grid1">' +
      field("Presenting complaint", '<textarea name="complaint" rows="2" placeholder="e.g. Fever and cough for 3 days">' + esc(v.complaint) + "</textarea>") +
      field("Examination findings", '<textarea name="findings" rows="2" placeholder="e.g. Throat congested, chest clear">' + esc(v.findings || "") + "</textarea>") +
      field("Diagnosis", '<input name="diagnosis" list="dxlist" value="' + esc(v.diagnosis) + '" placeholder="Start typing…"><datalist id="dxlist">' + DIAGNOSES.map(function (d) { return "<option>" + d + "</option>"; }).join("") + "</datalist>") +
      "</div>" +
      '<div class="card-h top-b"><h2>Prescription</h2><span class="muted">From the clinic\'s own stock</span></div><div class="card-b">' +
      (locked ? "" : '<div class="medsearch">' + icon("search") + '<input id="medq" placeholder="Search medicine by name or generic — e.g. para, amox, cetir" autocomplete="off"><div class="medresults" id="medresults"></div></div>') +
      '<div id="rxlist">' + rxTable(v, p, locked) + "</div>" +
      field("Follow-up", '<select name="followUp"><option value="">No follow-up</option>' + [["3 days", 3], ["1 week", 7], ["2 weeks", 14], ["1 month", 30]].map(function (o) { var d = addDays(o[1]); return '<option value="' + d + '"' + (v.followUp === d ? " selected" : "") + ">" + o[0] + " (" + fmtDate(d) + ")</option>"; }).join("") + "</select>") +
      "</div>" +
      (locked ? "" : '<div class="card-f"><span class="muted sm">Saved automatically</span><button class="btn btn-primary btn-lg" data-act="finish" data-id="' + v.id + '">' + icon("check") + " Finish visit &amp; send " + (v.rx.length ? "to pharmacy" : "to billing") + "</button></div>") +
      "</fieldset></div>" +
      '<aside class="card hist"><div class="card-h"><h2>Patient history</h2></div><div class="card-b">' +
      (hist.length ? hist.map(function (h) {
        return '<div class="hi"><div class="hi-d">' + fmtDate(h.day) + "</div><b>" + esc(h.diagnosis || "Consultation") + "</b>" + (h.rx.length ? "<ul>" + h.rx.map(function (r) { return "<li>" + esc(r.name) + " · " + r.timing + (r.days ? " × " + r.days + "d" : "") + "</li>"; }).join("") + "</ul>" : "") + "</div>";
      }).join("") : '<p class="muted">No earlier visits.</p>') + "</div></aside></div>";
  };
  function vit(name, label, val) { return '<label class="vit"><span>' + label + '</span><input name="' + name + '" value="' + esc(val || "") + '" inputmode="decimal" placeholder="—"></label>'; }
  function rxTable(v, p, locked) {
    if (!v.rx.length) return '<div class="empty sm">No medicines added. Search above to add one.</div>';
    return '<div class="tw"><table class="tbl rx"><thead><tr><th>Medicine</th><th>Dose</th><th>Timing</th><th>Days</th><th class="r">Qty</th><th></th></tr></thead><tbody>' +
      v.rx.map(function (r, i) {
        var m = med(r.medId), conf = allergyConflict(p, m), st = m ? stock(m) : 0;
        return '<tr class="' + (conf ? "conf" : "") + '"><td><b>' + esc(r.name) + "</b>" + (conf ? '<small class="red block">' + icon("alert", 12) + " Patient is allergic: " + esc(conf.name) + "</small>" : "") + (st < r.qty ? '<small class="amber block">Only ' + st + " in stock</small>" : "") + "</td>" +
          '<td><input class="sm-in" data-rx="' + i + '" data-k="dose" value="' + esc(r.dose) + '"' + (locked ? " disabled" : "") + "></td>" +
          '<td><select class="sm-in" data-rx="' + i + '" data-k="timing"' + (locked ? " disabled" : "") + ">" + TIMINGS.map(function (t) { return '<option value="' + t.code + '"' + (t.code === r.timing ? " selected" : "") + ">" + t.label + "</option>"; }).join("") + "</select></td>" +
          '<td><input class="sm-in num" type="number" min="0" data-rx="' + i + '" data-k="days" value="' + r.days + '"' + (locked ? " disabled" : "") + "></td>" +
          '<td class="r"><b>' + r.qty + "</b> <small class=\"muted\">" + (m ? m.unit : "") + "</small></td>" +
          '<td class="r">' + (locked ? "" : '<button class="icon-btn" data-act="rx-del" data-i="' + i + '" aria-label="Remove">' + icon("x", 16) + "</button>") + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }
  AFTER["doctor/consult"] = function (id) {
    var v = visit(id);
    if (!v || v.status !== "consulting") return;
    var p = patient(v.patientId);
    var fs = document.querySelector('[data-form="consult"]');
    fs.addEventListener("input", function (e) {
      var t = e.target;
      if (t.dataset.rx != null) return;
      if (["temp", "bp", "pulse", "spo2", "weight", "height"].indexOf(t.name) > -1) {
        v.vitals[t.name] = t.value;
        var vt = v.vitals;
        document.getElementById("bmi").textContent = vt.weight && vt.height ? (vt.weight / Math.pow(vt.height / 100, 2)).toFixed(1) : "—";
      } else if (t.name) v[t.name] = t.value;
      save();
    });
    fs.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "followUp") { v.followUp = t.value; save(); return; }
      if (t.dataset.rx == null) return;
      var r = v.rx[+t.dataset.rx];
      r[t.dataset.k] = t.dataset.k === "days" ? Math.max(0, parseInt(t.value, 10) || 0) : t.value;
      r.qty = calcQty(med(r.medId), r.dose, r.timing, r.days);
      save();
      document.getElementById("rxlist").innerHTML = rxTable(v, p, false);
    });
    var q = document.getElementById("medq"), box = document.getElementById("medresults");
    q.addEventListener("input", function () {
      var s = q.value.trim().toLowerCase();
      if (!s) { box.innerHTML = ""; return; }
      var res = S.meds.filter(function (m) { return (m.name + " " + m.generic).toLowerCase().indexOf(s) > -1; }).slice(0, 6);
      box.innerHTML = res.length ? res.map(function (m) {
        var conf = allergyConflict(p, m), st = stock(m);
        return '<button type="button" class="mr' + (conf ? " conf" : "") + '" data-act="rx-add" data-id="' + m.id + '"><span><b>' + esc(m.name) + "</b><small>" + esc(m.generic) + " · " + rs(m.price) + " / " + m.unit + "</small></span>" +
          (conf ? '<span class="pill red">' + icon("alert", 12) + " Allergy</span>" : '<span class="pill ' + (st ? "green" : "gray") + '">' + (st ? st + " in stock" : "Out of stock") + "</span>") + "</button>";
      }).join("") : '<div class="mr muted">No medicine matches “' + esc(q.value) + "”.</div>";
    });
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var b = box.querySelector("[data-act=rx-add]"); if (b) b.click(); } });
  };
  function addRx(v, m, force) {
    var p = patient(v.patientId), conf = allergyConflict(p, m);
    if (conf && !force) {
      modal('<div class="modal-ic red">' + icon("alert", 28) + "</div><h2>Allergy warning</h2><p><b>" + esc(p.name) + "</b> has a recorded allergy to <b>" + esc(conf.name) + "</b>.</p><p>" + esc(m.name) + " is in the same drug class. Choose another medicine, or continue only if you have confirmed it is safe.</p>",
        [["Choose another medicine", "btn-primary", null], ["Prescribe anyway", "btn-danger", function () { addRx(v, m, true); log("Doctor", "Overrode allergy warning: " + m.name + " for " + p.name); save(); }]]);
      return;
    }
    var r = { medId: m.id, name: m.name, dose: ["tab", "cap"].indexOf(m.unit) > -1 ? "1 " + m.unit : "As directed", timing: m.unit === "inhaler" ? "SOS" : "TDS", days: ["tab", "cap"].indexOf(m.unit) > -1 ? 5 : 0, startDate: dayKey() };
    r.qty = calcQty(m, r.dose, r.timing, r.days);
    v.rx.push(r);
    save();
    document.getElementById("rxlist").innerHTML = rxTable(v, p, false);
    var q = document.getElementById("medq"); q.value = ""; document.getElementById("medresults").innerHTML = ""; q.focus();
    var btn = document.querySelector('[data-act="finish"]');
    if (btn) btn.innerHTML = icon("check") + " Finish visit &amp; send to pharmacy";
  }

  PAGES.doctor.history = function () {
    var list = S.visits.filter(function (v) { return v.rx.length && v.status !== "consulting" && v.status !== "waiting"; }).sort(function (a, b) { return b.arrivedAt - a.arrivedAt; });
    return pageHead("Prescriptions", "Everything you have prescribed, newest first.") + '<div class="card"><div class="tw"><table class="tbl"><thead><tr><th>Date</th><th>Patient</th><th>Diagnosis</th><th>Medicines</th><th>Status</th></tr></thead><tbody>' +
      list.map(function (v) {
        var p = patient(v.patientId);
        return "<tr><td>" + fmtDate(v.day) + "</td><td>" + patientChip(p) + "</td><td>" + esc(v.diagnosis || "—") + "</td><td>" + v.rx.map(function (r) { return esc(r.name) + ' <small class="muted">' + r.timing + "</small>"; }).join("<br>") + "</td><td>" + statusPill(v.status) + "</td></tr>";
      }).join("") + "</tbody></table></div></div>";
  };

  // ===== Pharmacy =====
  PAGES.pharmacy.queue = function () {
    var list = byStatus("pharmacy");
    var handed = today().filter(function (v) { return v.rx.length && (v.status === "billing" || v.status === "done"); });
    return pageHead("Dispensing queue", "Prescriptions arrive here as soon as the doctor finishes the visit.") +
      '<div class="stats">' + stat(list.length, "To prepare", list.length ? "hl" : "") + stat(handed.length, "Handed over today") + stat(S.meds.filter(function (m) { return stock(m) < m.reorder; }).length, "Low stock items") + stat(S.meds.filter(function (m) { return m.batches.some(function (b) { var d = daysUntil(b.expiry); return b.qty > 0 && d >= 0 && d <= 30; }); }).length, "Batches expiring ≤30 days") + "</div>" +
      (list.length ? '<div class="rx-cards">' + list.map(function (v) {
        var p = patient(v.patientId);
        return '<div class="card rxc"><div class="card-b"><div class="rxc-h"><b class="tok">' + v.token + "</b>" + statusPill(v.status) + "</div>" + patientChip(p) + "<ul>" + v.rx.map(function (r) { return "<li><span>" + esc(r.name) + "</span><em>× " + r.qty + "</em></li>"; }).join("") + '</ul><small class="muted">Prescribed by ' + ROLES.doctor.user + " · " + esc(v.diagnosis || "") + '</small></div><div class="card-f"><a class="btn btn-primary w100" href="#/pharmacy/dispense/' + v.id + '">' + icon("pill") + " Prepare &amp; dispense</a></div></div>";
      }).join("") + "</div>" : '<div class="card"><div class="empty">Nothing to prepare. New prescriptions from the doctor appear here automatically.</div></div>');
  };

  PAGES.pharmacy.dispense = function (id) {
    var v = visit(id);
    if (!v || v.status !== "pharmacy") return '<div class="empty">This prescription has already been handed over. <a class="link" href="#/pharmacy/queue">Back to queue</a></div>';
    var p = patient(v.patientId);
    var plan = allocate(S, v, false);
    return pageHead("Dispense · " + v.token, "Batches are picked by earliest expiry first (FEFO). Expired batches are never used.", '<a class="btn" href="#/pharmacy/queue">← Back</a>') +
      '<div class="card"><div class="card-b">' + patientChip(p) + '<div class="chips mt8">' + allergyChips(p) + "</div></div></div>" +
      plan.map(function (d, i) {
        var r = v.rx[i], m = med(r.medId), tm = timing(r.timing);
        var expired = m.batches.filter(function (b) { return b.qty > 0 && daysUntil(b.expiry) < 0; });
        return '<div class="card disp"><div class="card-b disp-grid"><div><h3>' + esc(r.name) + '</h3><p class="muted">' + esc(r.dose) + " · " + r.timing + (r.days ? " · " + r.days + " days" : "") + '</p><div class="label-prev"><small>Label</small><b>' + esc(p.name) + "</b><span>" + esc(r.name) + "</span><span>Take " + esc(r.dose) + " " + tm.words + (r.days ? " for " + r.days + " days" : "") + "</span><em>" + esc(CLINIC) + " · " + fmtDate(dayKey()) + "</em></div></div>" +
          '<div><table class="tbl sm"><thead><tr><th>Batch</th><th>Expiry</th><th class="r">Pick</th></tr></thead><tbody>' +
          d.picks.map(function (b) { var dd = daysUntil(b.expiry); return "<tr><td>" + b.no + "</td><td>" + fmtDate(b.expiry) + (dd <= 30 ? ' <span class="pill amber">' + dd + "d left</span>" : "") + '</td><td class="r"><b>' + b.qty + "</b></td></tr>"; }).join("") +
          expired.map(function (b) { return '<tr class="strike"><td>' + b.no + "</td><td>" + fmtDate(b.expiry) + ' <span class="pill red">Expired</span></td><td class="r">skipped</td></tr>'; }).join("") +
          "</tbody></table>" + (d.short ? '<div class="alert warn">' + icon("alert") + " Short by " + d.short + ". The patient will be charged only for " + d.qty + ".</div>" : '<div class="alert ok sm">' + icon("check") + " " + d.qty + " " + m.unit + " ready</div>") + "</div></div></div>";
      }).join("") +
      '<div class="sticky-f"><span class="muted">Stock is deducted when you confirm.</span><button class="btn btn-primary btn-lg" data-act="dispense" data-id="' + v.id + '">' + icon("check") + " Confirm handover &amp; send to billing</button></div>";
  };

  PAGES.pharmacy.inventory = PAGES.admin.inventory = function () {
    var role = route().role;
    var rows = S.meds.map(function (m) {
      var st = stock(m), low = st < m.reorder;
      var exp = m.batches.some(function (b) { var d = daysUntil(b.expiry); return b.qty > 0 && d >= 0 && d <= 30; });
      var dead = m.batches.some(function (b) { return b.qty > 0 && daysUntil(b.expiry) < 0; });
      return "<tr><td><b>" + esc(m.name) + '</b><small class="muted block">' + esc(m.generic) + "</small></td><td>" + m.batches.filter(function (b) { return b.qty > 0; }).sort(function (a, b) { return a.expiry < b.expiry ? -1 : 1; }).map(function (b) {
        var d = daysUntil(b.expiry);
        return '<span class="batch ' + (d < 0 ? "red" : d <= 30 ? "amber" : "") + '" title="Expires ' + fmtDate(b.expiry) + '">' + b.no + " · " + b.qty + " · " + (d < 0 ? "expired" : fmtDate(b.expiry)) + "</span>";
      }).join(" ") + '</td><td class="r"><b>' + st + '</b> <small class="muted">' + m.unit + '</small></td><td class="r">' + m.reorder + '</td><td class="r">' + rs(m.price) + "</td><td>" +
        (low ? '<span class="pill red">Low stock</span> ' : "") + (exp ? '<span class="pill amber">Expiring soon</span> ' : "") + (dead ? '<span class="pill gray">Has expired stock</span>' : "") + (!low && !exp && !dead ? '<span class="pill green">OK</span>' : "") + "</td></tr>";
    }).join("");
    return pageHead("Inventory", "Stock is tracked per batch with its own expiry date.", role === "pharmacy" ? '<button class="btn btn-primary" data-act="add-batch">' + icon("plus") + " Receive stock</button>" : "") +
      '<div class="card"><div class="tw"><table class="tbl"><thead><tr><th>Medicine</th><th>Batches (earliest expiry first)</th><th class="r">Usable stock</th><th class="r">Reorder at</th><th class="r">Price</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
  };

  // ===== Admin =====
  PAGES.admin.dashboard = function () {
    var t = today();
    var revToday = t.filter(function (v) { return v.paid; }).reduce(function (a, v) { return a + v.paid.total; }, 0);
    var days = S.revenueHistory.concat([revToday]);
    var max = Math.max.apply(null, days) || 1;
    var labels = days.map(function (_, i) { var d = new Date(); d.setDate(d.getDate() - (6 - i)); return i === 6 ? "Today" : d.toLocaleDateString("en-GB", { weekday: "short" }); });
    var low = S.meds.filter(function (m) { return stock(m) < m.reorder; });
    var exp = [];
    S.meds.forEach(function (m) { m.batches.forEach(function (b) { var d = daysUntil(b.expiry); if (b.qty > 0 && d <= 30) exp.push({ m: m, b: b, d: d }); }); });
    exp.sort(function (a, b) { return a.d - b.d; });
    var top = {};
    S.visits.forEach(function (v) { (v.dispensed || []).forEach(function (d) { top[d.name] = (top[d.name] || 0) + d.qty; }); });
    var topList = Object.keys(top).map(function (k) { return [k, top[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
    var topMax = topList.length ? topList[0][1] : 1;
    return pageHead("Clinic dashboard", esc(CLINIC) + " · " + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })) +
      '<div class="stats">' + stat(t.length, "Visits today") + stat(rs(revToday), "Revenue today") + stat(byStatus("waiting").length + byStatus("consulting").length + byStatus("pharmacy").length + byStatus("billing").length, "In the clinic now") + stat(low.length, "Low stock", low.length ? "hl" : "") + stat(exp.length, "Expiring / expired batches", exp.length ? "hl" : "") + "</div>" +
      '<div class="dash-grid"><div class="card"><div class="card-h"><h2>Revenue — last 7 days</h2><span class="muted">' + rs(days.reduce(function (a, b) { return a + b; }, 0)) + '</span></div><div class="card-b"><div class="bars">' +
      days.map(function (d, i) { return '<div class="bar' + (i === 6 ? " now" : "") + '"><em>' + (d >= 1000 ? Math.round(d / 1000) + "k" : d) + '</em><i style="height:' + Math.max(2, d / max * 100) + '%" title="' + rs(d) + '"></i><span>' + labels[i] + "</span></div>"; }).join("") +
      "</div></div></div>" +
      '<div class="card"><div class="card-h"><h2>Top medicines dispensed</h2></div><div class="card-b">' + (topList.length ? topList.map(function (x) { return '<div class="hbar"><span>' + esc(x[0]) + "</span><i style=\"width:" + (x[1] / topMax * 100) + '%"></i><b>' + x[1] + "</b></div>"; }).join("") : '<p class="muted">No dispensing yet.</p>') + "</div></div>" +
      '<div class="card"><div class="card-h"><h2>Stock alerts</h2><a class="link" href="#/admin/inventory">Inventory →</a></div><div class="card-b alerts">' +
      low.map(function (m) { return '<div class="al"><span class="pill red">Low</span><b>' + esc(m.name) + "</b><em>" + stock(m) + " left (reorder at " + m.reorder + ")</em></div>"; }).join("") +
      exp.map(function (x) { return '<div class="al"><span class="pill ' + (x.d < 0 ? "gray" : "amber") + '">' + (x.d < 0 ? "Expired" : x.d + " days") + "</span><b>" + esc(x.m.name) + "</b><em>Batch " + x.b.no + " · " + x.b.qty + " units</em></div>"; }).join("") +
      "</div></div>" +
      '<div class="card"><div class="card-h"><h2>Recent activity</h2><a class="link" href="#/admin/activity">Audit trail →</a></div><div class="card-b">' + logList(6) + "</div></div></div>";
  };
  function logList(n) {
    var l = n ? S.log.slice(0, n) : S.log;
    return l.length ? '<ul class="log">' + l.map(function (e) { return '<li><time>' + fmtTime(e.ts) + '</time><span class="role-tag r-' + e.who.toLowerCase() + '">' + e.who + "</span><span>" + esc(e.text) + "</span></li>"; }).join("") + "</ul>" : '<p class="muted">Nothing yet.</p>';
  }
  PAGES.admin.activity = function () {
    return pageHead("Audit trail", "Every action is recorded with who did it and when.") + '<div class="card"><div class="card-b">' + logList() + "</div></div>";
  };
  PAGES.admin.users = function () {
    var users = [["Dr. A. Silva", "Doctor", "Consultations, prescriptions, lab requests"], ["Dilani", "Front Desk", "Reception and pharmacy, without prescribing"], ["Kamal", "Pharmacist", "Dispensing, inventory, suppliers"], ["Nadeesha", "Receptionist", "Registration, queue, billing"], ["Admin", "Administrator", "Everything, including users and settings"]];
    return pageHead("Users & roles", "Each person signs in with their own account. What they can do follows their role.") +
      '<div class="card"><div class="tw"><table class="tbl"><thead><tr><th>User</th><th>Role</th><th>Can do</th><th>Status</th></tr></thead><tbody>' +
      users.map(function (u) { return '<tr><td><div class="pchip"><span class="av sm">' + initials(u[0]) + "</span><b>" + u[0] + '</b></div></td><td><span class="pill blue">' + u[1] + '</span></td><td class="muted">' + u[2] + '</td><td><span class="pill green">Active</span></td></tr>'; }).join("") +
      "</tbody></table></div></div>";
  };

  // ---------- profile modal ----------
  function openProfile(pid) {
    var p = patient(pid);
    if (!p) return;
    var vs = S.visits.filter(function (v) { return v.patientId === pid; }).sort(function (a, b) { return b.arrivedAt - a.arrivedAt; });
    var role = route().role;
    var inQ = today().some(function (v) { return v.patientId === pid && v.status !== "done"; });
    modal('<div class="prof"><span class="av xl">' + initials(p.name) + "</span><div><h2>" + esc(p.name) + '</h2><p class="muted">' + p.id + " · " + p.age + " Y · " + p.gender + "</p></div></div>" +
      '<dl class="dl"><dt>Phone</dt><dd>' + esc(p.phone || "—") + "</dd><dt>NIC</dt><dd>" + esc(p.nic || "—") + "</dd><dt>Address</dt><dd>" + esc(p.address || "—") + "</dd>" + (p.guardian ? "<dt>Guardian</dt><dd>" + esc(p.guardian) + "</dd>" : "") + "<dt>Conditions</dt><dd>" + (p.conditions.map(esc).join(", ") || "—") + "</dd></dl>" +
      '<div class="chips">' + allergyChips(p) + "</div>" +
      '<h3 class="mt16">Visits</h3>' + (vs.length ? '<ul class="vlist">' + vs.map(function (v) { return "<li><span>" + fmtDate(v.day) + "</span><b>" + esc(v.diagnosis || (v.status === "waiting" ? "Waiting" : "Consultation")) + "</b>" + statusPill(v.status) + "</li>"; }).join("") + "</ul>" : '<p class="muted">No visits yet.</p>'),
      role === "reception" && !inQ ? [["Close", "", null], ["Add to today's queue", "btn-primary", function () { enqueue(pid); render(); }]] : [["Close", "btn-primary", null]], true);
  }

  // ---------- global search ----------
  function closeSearch() { var r = document.getElementById("gresults"); if (r) r.innerHTML = ""; }
  document.addEventListener("input", function (e) {
    if (e.target.id !== "gsearch") return;
    var res = searchPatients(e.target.value);
    document.getElementById("gresults").innerHTML = res.length ? res.map(function (p) {
      return '<button class="gr" data-profile="' + p.id + '"><span class="av sm">' + initials(p.name) + "</span><span><b>" + esc(p.name) + "</b><small>" + p.id + " · " + esc(p.phone) + "</small></span></button>";
    }).join("") : e.target.value.trim() ? '<div class="gr muted">No patients found</div>' : "";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { var g = document.getElementById("gsearch"); if (g) { e.preventDefault(); g.focus(); } }
    if (e.key === "Escape") { closeModal(); closeSearch(); }
  });

  // ---------- events ----------
  document.addEventListener("change", function (e) {
    if (e.target.id === "roleSwitch") { var r = e.target.value; go("#/" + r + "/" + ROLES[r].home); }
  });

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-profile],[data-go],[data-act]");
    if (!e.target.closest(".gsearch")) closeSearch();
    if (!el) return;
    if (el.dataset.profile) { e.preventDefault(); closeModal(); openProfile(el.dataset.profile); return; }
    if (el.dataset.go) { closeModal(); go(el.dataset.go); return; }
    var act = el.dataset.act, id = el.dataset.id;
    var v;
    switch (act) {
      case "enqueue": enqueue(id); render(); break;
      case "call-next":
        v = byStatus("waiting")[0];
        if (v) { startConsult(v); }
        break;
      case "start": v = visit(id); if (v) startConsult(v); break;
      case "rx-add": v = visit(route().id); addRx(v, med(id)); break;
      case "rx-del":
        v = visit(route().id); v.rx.splice(+el.dataset.i, 1); save();
        document.getElementById("rxlist").innerHTML = rxTable(v, patient(v.patientId), false);
        break;
      case "finish": finishVisit(visit(id)); break;
      case "dispense": dispense(visit(id)); break;
      case "add-batch": addBatchModal(); break;
      case "fill-sample": fillSample(); break;
      case "print": window.print(); break;
      case "tour-hide": S.tour.hidden = true; save(); render(); break;
      case "tour-show": S.tour.hidden = false; save(); render(); break;
      case "reset":
        modal("<h2>Reset the demo?</h2><p>This puts back the original sample patients, queue and stock. Anything you added will be removed.</p>",
          [["Cancel", "", null], ["Reset demo", "btn-danger", function () { localStorage.removeItem(KEY); load(); go("#/"); toast("Demo data reset", "ok"); }]]);
        break;
    }
  });

  function startConsult(v) {
    if (byStatus("consulting").length) { go("#/doctor/consult/" + byStatus("consulting")[0].id); return; }
    v.status = "consulting";
    log("Doctor", "Called " + v.token + " – " + patient(v.patientId).name);
    save();
    go("#/doctor/consult/" + v.id);
  }

  function finishVisit(v) {
    var p = patient(v.patientId);
    if (!v.diagnosis.trim()) {
      modal("<h2>Add a diagnosis</h2><p>Every visit needs a diagnosis before it can be finished, so the record is complete.</p>", [["OK", "btn-primary", function () { var d = document.querySelector('[name="diagnosis"]'); if (d) d.focus(); }]]);
      return;
    }
    v.status = v.rx.length ? "pharmacy" : "billing";
    log("Doctor", "Completed consultation for " + p.name + " (" + v.token + ")" + (v.rx.length ? " – " + v.rx.length + " medicine(s) sent to pharmacy" : ""));
    if (S.tour.queued && S.tour.newPatient === p.id) tourMark("consulted");
    save();
    toast(v.rx.length ? "Prescription sent to the pharmacy" : "Sent to billing", "ok");
    go("#/doctor/today");
  }

  function dispense(v) {
    if (!v || v.status !== "pharmacy") return;
    v.dispensed = allocate(S, v, true);
    v.status = "billing";
    log("Pharmacy", "Dispensed " + v.token + " – " + v.dispensed.map(function (d) { return d.name + " ×" + d.qty; }).join(", "));
    if (S.tour.consulted && S.tour.newPatient === v.patientId) tourMark("dispensed");
    save();
    toast("Handed over. " + patient(v.patientId).name + " can now pay at reception.", "ok");
    go("#/pharmacy/queue");
  }

  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (f.dataset.form === "register") {
      e.preventDefault();
      var p = {
        id: "PT-" + String(S.nextPatient++).padStart(4, "0"), name: f.name.value.trim().replace(/\s+/g, " "), gender: f.gender.value, age: parseInt(f.age.value, 10),
        phone: f.phone.value.trim(), nic: f.nic.value.trim(), address: f.address.value.trim(),
        allergies: parseAllergies(f.allergies.value), conditions: f.conditions.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean)
      };
      S.patients.push(p);
      log("Reception", "Registered " + p.name + " (" + p.id + ")");
      if (!S.tour.registered) { S.tour.registered = true; S.tour.newPatient = p.id; }
      save();
      toast(p.name + " registered as " + p.id, "ok");
      if (f.enqueue.checked) enqueue(p.id);
      go("#/reception/dashboard");
    }
    if (f.dataset.form === "pay") {
      e.preventDefault();
      var v = visit(f.dataset.id), b = bill(v), method = f.method.value;
      if (method === "Cash" && f.tendered.value && parseFloat(f.tendered.value) < b.total) { toast("Cash received is less than the total", "err"); return; }
      v.paid = { total: b.total, method: method, at: Date.now() };
      v.status = "done";
      log("Reception", "Payment " + rs(b.total) + " (" + method + ") for " + v.token);
      if (S.tour.dispensed && S.tour.newPatient === v.patientId) tourMark("paid");
      // a visit with nothing prescribed skips the pharmacy step
      if (!S.tour.dispensed && S.tour.consulted && S.tour.newPatient === v.patientId) { tourMark("dispensed"); tourMark("paid"); }
      save();
      toast("Payment recorded", "ok");
      go("#/reception/billing/" + v.id);
    }
    if (f.dataset.form === "batch") {
      e.preventDefault();
      var m = med(f.med.value), qty = parseInt(f.qty.value, 10);
      m.batches.push({ no: f.no.value.trim(), expiry: f.expiry.value, qty: qty });
      log("Pharmacy", "Received " + qty + " × " + m.name + " (batch " + f.no.value.trim() + ")");
      save(); closeModal(); render();
      toast("Stock received", "ok");
    }
  });

  function fillSample() {
    var f = document.querySelector('[data-form="register"]');
    var samples = [["Chathura Dissanayake", "Male", 32, "071 555 0142", "199323456781", "Kandy", "Penicillin", ""], ["Hiruni Gunasekara", "Female", 29, "077 555 0178", "199667812345", "Panadura", "", "Asthma"], ["Sajith Ekanayake", "Male", 51, "076 555 0190", "197412398765", "Kegalle", "Diclofenac", "Hypertension"]];
    var s = samples[S.nextPatient % samples.length];
    ["name", "gender", "age", "phone", "nic", "address", "allergies", "conditions"].forEach(function (k, i) { f[k].value = s[i]; });
    f.phone.dispatchEvent(new Event("input"));
  }

  function addBatchModal() {
    modal('<h2>Receive stock</h2><form data-form="batch" class="grid1" id="batchForm">' +
      field("Medicine", "<select name=\"med\">" + S.meds.map(function (m) { return '<option value="' + m.id + '">' + esc(m.name) + "</option>"; }).join("") + "</select>") +
      field("Batch number", '<input name="no" required placeholder="e.g. PA-2510">') +
      field("Expiry date", '<input name="expiry" type="date" required min="' + addDays(1) + '" value="' + addDays(365) + '">') +
      field("Quantity", '<input name="qty" type="number" min="1" required value="100">') +
      '<div class="modal-f"><button type="button" class="btn" data-act="close-modal">Cancel</button><button class="btn btn-primary" type="submit">Add batch</button></div></form>', []);
  }

  // ---------- modal & toast ----------
  var modalRoot = document.getElementById("modalRoot");
  function modal(html, buttons, wide) {
    modalRoot.innerHTML = '<div class="overlay"><div class="modal' + (wide ? " wide" : "") + '" role="dialog" aria-modal="true"><button class="icon-btn mclose" data-act="close-modal" aria-label="Close">' + icon("x") + "</button>" + html +
      (buttons.length ? '<div class="modal-f">' + buttons.map(function (b, i) { return '<button class="btn ' + b[1] + '" data-mb="' + i + '">' + b[0] + "</button>"; }).join("") + "</div>" : "") + "</div></div>";
    modalRoot.querySelectorAll("[data-mb]").forEach(function (btn) {
      btn.addEventListener("click", function () { var cb = buttons[+btn.dataset.mb][2]; closeModal(); if (cb) cb(); });
    });
    var first = modalRoot.querySelector("input,select,[data-mb]");
    if (first) first.focus();
  }
  function closeModal() { modalRoot.innerHTML = ""; }
  modalRoot.addEventListener("click", function (e) {
    if (e.target.classList.contains("overlay") || e.target.closest('[data-act="close-modal"]')) { e.stopPropagation(); closeModal(); }
  }, true);

  function toast(msg, kind) {
    var root = document.getElementById("toastRoot");
    var t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML = icon(kind === "err" ? "alert" : "check", 16) + "<span>" + esc(msg) + "</span>";
    root.appendChild(t);
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove(); }, 300); }, 3200);
  }

  // keep "minutes waiting" fresh
  setInterval(function () {
    var r = route();
    if (document.querySelector(".overlay") || /consult|register|billing/.test(r.page) || document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (ROLES[r.role]) render();
  }, 60000);

  load();
  render();
})();
