/* ── GGPlay Wizard — wizard.js (v2 — Autopilot) ── */

// ─── State ───────────────────────────────────────────────────
const state = {
  step: 1,
  company: {},
  details: {},
  branding: {},
  domain: "",
  email: "",
  supportEmail: "",
  duns: { number: "", status: "" },
};

// ─── SIC → Archetype ────────────────────────────────────────
const SIC_ARCHETYPE = {
  "78200": "shift", "88100": "shift", "87100": "shift",
  "53202": "shift", "49410": "shift", "98000": "shift",
};
const DEFAULT_ARCHETYPE = "shift";

// ─── Smart Short Name Generation ─────────────────────────────
const STRIP_SUFFIXES = /\s+(LTD|LIMITED|LLP|PLC|INC|CORP|CO|COMPANY)\.?\s*$/i;
const FILLER_WORDS = new Set([
  "management","services","solutions","group","holdings",
  "international","personnel","consulting","associates",
  "partners","enterprises","agency","properties","trading",
  "recruitment","staffing","resources","global","uk",
  "consultants","advisors","advisory","professional",
  "facilities","operations","logistics","industries",
  "commercial","ventures","capital","investments",
  "developments","construction","contractors","maintenance",
  "care","healthcare","health","medical","nursing",
  "education","training","academy","institute","foundation",
  "technology","technologies","tech","digital","systems",
  "network","networks","communications","media","road",
]);

function generateShortName(companyName) {
  let name = companyName.trim();
  name = name.replace(STRIP_SUFFIXES, "");
  name = name.replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
  name = name.replace(/^\d+\s+/, "");
  name = name.replace(/^(ST|SAINT)\s+/i, "St ");
  let words = name.split(/\s+/);
  let meaningful = words.filter(w => !FILLER_WORDS.has(w.toLowerCase()));
  if (meaningful.length === 0) meaningful = words.slice(0, 2);
  let result = "";
  for (let i = 0; i < Math.min(meaningful.length, 3); i++) {
    const candidate = result ? result + " " + meaningful[i] : meaningful[i];
    if (candidate.length > 20 && result) break;
    result = candidate;
  }
  result = result.toLowerCase().replace(/(?:^|\s|-)\S/g, c => c.toUpperCase());
  result = result.replace(/^-+|-+$/g, "").trim();
  return result.substring(0, 30).trimEnd() || "App";
}

// ─── Palette Generation (mirrors brand_synth.py) ─────────────
function hashToHue(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 360) / 360;
}
function hlsToRgb(h, l, s) {
  if (s === 0) return [l, l, l];
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)];
}
function rgbHex(r, g, b) {
  const x = v => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + x(r) + x(g) + x(b);
}
function paletteFor(name) {
  const h = hashToHue(name.toUpperCase().trim());
  const [pr, pg, pb] = hlsToRgb(h, 0.32, 0.65);
  const [dr, dg, db] = hlsToRgb(h, 0.22, 0.70);
  const [ar, ag, ab] = hlsToRgb((h + 30/360) % 1.0, 0.48, 0.72);
  return { primary: rgbHex(pr, pg, pb), primary_dark: rgbHex(dr, dg, db), accent: rgbHex(ar, ag, ab) };
}

// ─── Helpers ─────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const show = (el, cls = "") => {
  el.classList.remove("hidden");
  if (cls) el.className = el.className.replace(/\b(info|success|error|warning)\b/g, "").trim() + " " + cls;
};
const hide = el => el.classList.add("hidden");

function initials(name) {
  const parts = name.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "").substring(0, 30);
}

// ─── Navigation ──────────────────────────────────────────────
function goStep(n) {
  state.step = n;
  $$(".panel").forEach(p => p.classList.remove("active"));
  const target = $(`#panel-${n}`);
  if (target) target.classList.add("active");
  $$(".stepper .step").forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove("active", "done");
    if (sn === n) s.classList.add("active");
    else if (sn < n) s.classList.add("done");
  });
  if (n === 3) populateBranding();
  if (n === 4) populateDomain();
  if (n === 5) populateDuns();
  if (n === 6) populateReview();
}
window.goStep = goStep;

// ═══════════════════════════════════════════════════════════════
// AUTOPILOT ENGINE
// ═══════════════════════════════════════════════════════════════
const apLog = $("#autopilotLog");
const apSection = $("#autopilotSection");

function logAP(icon, text, status) {
  const entry = document.createElement("div");
  entry.className = "ap-entry " + (status || "ok");
  entry.innerHTML = '<span class="ap-icon">' + icon + '</span><span class="ap-text">' + text + '</span>';
  apLog.appendChild(entry);
  apLog.scrollTop = apLog.scrollHeight;
}

function updateAPEntry(icon, text, status) {
  const entries = apLog.querySelectorAll(".ap-entry");
  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    last.className = "ap-entry " + (status || "ok");
    last.innerHTML = '<span class="ap-icon">' + icon + '</span><span class="ap-text">' + text + '</span>';
  }
}

async function autopilot(companyData) {
  show(apSection);
  apLog.innerHTML = "";
  hide($("#searchResults"));

  logAP("\u23F3", "Fetching company details from Companies House\u2026", "pending");
  let profile = companyData;
  let officers = { items: [] };
  try {
    const [pRes, oRes] = await Promise.all([
      fetch("/api/company/" + companyData.company_number).then(function(r){return r.json();}),
      fetch("/api/company/" + companyData.company_number + "/officers").then(function(r){return r.json();}),
    ]);
    profile = Object.assign({}, companyData, pRes);
    officers = oRes;
    updateAPEntry("\u2705", "Company details loaded: <strong>" + profile.company_name + "</strong>", "ok");
  } catch(e) {
    updateAPEntry("\u26A0\uFE0F", "Couldn\u2019t enrich from API \u2014 using search data", "warn");
  }
  state.details = profile;
  state.details._officers = officers;
  populateDetailsFields();

  logAP("\u23F3", "Generating app name & branding\u2026", "pending");
  var companyName = profile.company_name || companyData.company_name || "";
  var shortName = generateShortName(companyName);
  $("#bShortName").value = shortName;
  state.branding.short_name = shortName;
  var pal = paletteFor(companyName);
  state.branding.palette = pal;
  state.branding.display_name = shortName;
  var cn = profile.company_number || companyData.company_number || "";
  var sic = ((profile.sic_codes || [])[0] || "").toString();
  $("#bAppId").value = "uk.c" + cn + ".shift";
  $("#bArchetype").value = SIC_ARCHETYPE[sic] || DEFAULT_ARCHETYPE;
  $("#bAutoName").value = autoDisplayName(companyName);
  updateBrandPreview();
  updateAPEntry("\u2705", "App name: <strong>" + shortName + '</strong> \u00B7 Palette: <span class="dot" style="background:' + pal.primary + '"></span> <span class="dot" style="background:' + pal.accent + '"></span>', "ok");

  logAP("\u23F3", "Generating & checking domain\u2026", "pending");
  var slug = slugify(shortName);
  var domainCandidates = [
    slug+".co.uk", slug+".uk", slug+"app.co.uk",
    slug+"hq.co.uk", "get"+slug+".co.uk", slug+"app.uk",
  ];
  var chosenDomain = domainCandidates[0];
  try {
    var checkRes = await fetch("/api/domains/check?domains=" + encodeURIComponent(domainCandidates.join(","))).then(function(r){return r.json();});
    var results = Array.isArray(checkRes) ? checkRes : (checkRes.results || []);
    var available = results.find(function(r){return r.available;});
    if (available) {
      chosenDomain = available.domain;
      updateAPEntry("\u2705", "Domain: <strong>" + chosenDomain + "</strong> (available)", "ok");
    } else {
      updateAPEntry("\u26A0\uFE0F", "Domain: <strong>" + chosenDomain + "</strong> (couldn\u2019t verify)", "warn");
    }
  } catch(e) {
    updateAPEntry("\u26A0\uFE0F", "Domain: <strong>" + chosenDomain + "</strong> (API unavailable)", "warn");
  }
  domainInput.value = chosenDomain;
  supportField.value = "support@" + chosenDomain;
  state.domain = chosenDomain;

  logAP("\u23F3", "Assigning developer email from pool\u2026", "pending");
  try {
    var poolRes = await fetch("/api/email-pool/status").then(function(r){return r.json();});
    if (poolRes.available_emails && poolRes.available_emails.length > 0) {
      var assignedEmail = poolRes.available_emails[0];
      emailSelect.innerHTML = '<option value="">Select (' + poolRes.available + ' available)</option>';
      poolRes.available_emails.forEach(function(e) {
        var opt = document.createElement("option"); opt.value = e; opt.textContent = e;
        emailSelect.appendChild(opt);
      });
      emailSelect.value = assignedEmail;
      state.email = assignedEmail;
      updateAPEntry("\u2705", "Email: <strong>" + assignedEmail + "</strong> (" + (poolRes.available - 1) + " remaining)", "ok");
    } else {
      updateAPEntry("\u26A0\uFE0F", "No emails in pool \u2014 enter manually", "warn");
    }
  } catch(e) {
    updateAPEntry("\u26A0\uFE0F", "Email pool unavailable \u2014 enter manually", "warn");
  }

  logAP("\u23F3", "Looking up DUNS number\u2026", "pending");
  var activeOfficers = (officers.items || []).filter(function(o){return !o.resigned_on;});
  if (activeOfficers.length > 0) {
    var dirName = activeOfficers[0].name || "";
    var parts = dirName.split(",").map(function(s){return s.trim();});
    if (parts.length >= 2) {
      var firstNames = parts[1].split(/\s+/);
      $("#dunsFirst").value = firstNames[0] || "";
      $("#dunsLast").value = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
    } else {
      var words = dirName.split(/\s+/);
      $("#dunsFirst").value = words[0] || "";
      $("#dunsLast").value = words.slice(1).join(" ") || "";
    }
  }
  var dunsEmailVal = state.email || emailManual.value || "";
  if (dunsEmailVal) $("#dunsEmail").value = dunsEmailVal;

  try {
    var dunsRes = await fetch("/api/duns/lookup?company_number=" + cn).then(function(r){return r.json();});
    if (dunsRes.duns_number) {
      $("#dunsNumber").value = dunsRes.duns_number;
      state.duns.number = dunsRes.duns_number;
      state.duns.status = "found";
      updateAPEntry("\u2705", "DUNS: <strong>" + dunsRes.duns_number + "</strong>", "ok");
    } else {
      state.duns.status = "not_found";
      updateAPEntry("\u26A0\uFE0F", "DUNS not found \u2014 can request after review", "warn");
    }
  } catch(e) {
    updateAPEntry("\u26A0\uFE0F", "DUNS lookup unavailable", "warn");
  }

  logAP("\uD83C\uDF89", "<strong>All fields auto-populated! Review and submit.</strong>", "ok");
  show($("#apReviewBtn"));
}

// ─── STEP 1: SEARCH ─────────────────────────────────────────
var btnSearch   = $("#btnSearch");
var searchInput = $("#searchQuery");
var searchNat   = $("#searchNat");
var statusEl    = $("#searchStatus");
var table       = $("#searchResults");
var tbody       = table.querySelector("tbody");

btnSearch.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", function(e) { if (e.key === "Enter") doSearch(); });

function doSearch() {
  var q = searchInput.value.trim();
  var nat = searchNat.value;
  if (!q && !nat) return;

  show(statusEl, "info");
  statusEl.textContent = "Searching Companies House\u2026";
  hide(table); hide(apSection);
  tbody.innerHTML = "";

  var params = new URLSearchParams();
  if (q) params.set("q", q);
  if (nat) params.set("nationality", nat);

  var es = new EventSource("/api/search/stream?" + params);
  var count = 0;

  es.onmessage = function(e) {
    var d = JSON.parse(e.data);
    if (d.status) statusEl.textContent = d.status;

    if (d.company_number && !d._skip) {
      count++;
      show(table);
      var addr = d.registered_office_address || {};
      var addrStr = [addr.address_line_1, addr.locality, addr.postal_code].filter(Boolean).join(", ");
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><code>' + d.company_number + '</code></td>' +
        '<td><strong>' + (d.company_name || d.title || "") + '</strong></td>' +
        '<td>' + (d.company_status || "") + '</td>' +
        '<td>' + (d.date_of_creation || "").substring(0, 10) + '</td>' +
        '<td class="addr-cell">' + addrStr + '</td>' +
        '<td><button class="btn primary sm">\u26A1 Onboard</button></td>';
      tr.querySelector("button").addEventListener("click", function(ev) {
        ev.stopPropagation();
        state.company = d;
        tbody.querySelectorAll("button").forEach(function(b) { b.disabled = true; b.textContent = "\u2026"; });
        ev.target.textContent = "\u2713 Selected";
        ev.target.className = "btn success sm";
        statusEl.textContent = "Onboarding " + (d.company_name || d.company_number) + "\u2026";
        show(statusEl, "info");
        autopilot(d);
      });
      tbody.appendChild(tr);
      statusEl.textContent = "Found " + count + " companies\u2026";
    }

    if (d.done) {
      es.close();
      statusEl.textContent = count > 0
        ? count + " companies found \u2014 click \u26A1 Onboard to auto-populate everything."
        : "No companies found. Try a different search.";
      show(statusEl, count > 0 ? "success" : "warning");
    }
  };

  es.onerror = function() {
    es.close();
    statusEl.textContent = "Connection lost. Try again.";
    show(statusEl, "error");
  };
}

// ─── STEP 2: DETAILS ────────────────────────────────────────
function populateDetailsFields() {
  var d = state.details;
  var addr = d.registered_office_address || {};
  var addrStr = typeof addr === "string" ? addr
    : [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
        .filter(Boolean).join(", ");
  $("#dCompanyNumber").value = d.company_number || state.company.company_number || "";
  $("#dCompanyName").value   = d.company_name || "";
  $("#dStatus").value        = d.company_status || "";
  $("#dType").value          = d.type || d.company_type || "";
  $("#dCreated").value       = d.date_of_creation || "";
  $("#dSIC").value           = (d.sic_codes || []).join(", ");
  $("#dAddress").value       = addrStr;
  var items = (d._officers || {}).items || [];
  var active = items.filter(function(o){return !o.resigned_on;});
  $("#dDirectors").value     = active.map(function(o){return o.name;}).join("\n");
  $("#dNationalities").value = active.map(function(o){return (o.nationality||"").trim();}).filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i;}).join(", ");
}

// ─── STEP 3: BRANDING ───────────────────────────────────────
var shortNameInput = $("#bShortName");
var nameCount      = $("#bNameCount");

shortNameInput.addEventListener("input", function() {
  nameCount.textContent = shortNameInput.value.length + " / 30";
  updateBrandPreview();
});

function autoDisplayName(companyName) {
  var name = companyName.trim().replace(STRIP_SUFFIXES, "");
  return name.split(/\s+/).map(function(w){return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();}).join(" ").substring(0, 30).trimEnd();
}

function populateBranding() {
  var companyName = $("#dCompanyName").value || "";
  var cn = $("#dCompanyNumber").value || "";
  var sic = ($("#dSIC").value || "").split(",")[0].trim();
  if (!shortNameInput.value) shortNameInput.value = generateShortName(companyName);
  nameCount.textContent = shortNameInput.value.length + " / 30";
  $("#bAutoName").value  = autoDisplayName(companyName);
  $("#bAppId").value     = "uk.c" + cn + ".shift";
  $("#bArchetype").value = SIC_ARCHETYPE[sic] || DEFAULT_ARCHETYPE;
  updateBrandPreview();
}

function updateBrandPreview() {
  var companyName = $("#dCompanyName").value || "";
  var displayName = shortNameInput.value || generateShortName(companyName);
  var pal = paletteFor(companyName);
  state.branding = { short_name: shortNameInput.value, palette: pal, display_name: displayName };
  $("#swPrimary").style.background     = pal.primary;
  $("#swPrimaryDark").style.background = pal.primary_dark;
  $("#swAccent").style.background      = pal.accent;
  $("#fakeIcon").style.background = pal.primary;
  $("#iconInitials").textContent = initials(displayName);
  $("#iconLabel").textContent    = displayName;
}

// ─── STEP 4: DOMAIN & EMAIL ─────────────────────────────────
var domainInput   = $("#domainInput");
var btnCheckDom   = $("#btnCheckDomain");
var domainStatus  = $("#domainStatus");
var domSuggDiv    = $("#domainSuggestions");
var domChips      = $("#domainChips");
var emailSelect   = $("#emailSelect");
var emailManual   = $("#emailManual");
var supportField  = $("#supportEmail");

btnCheckDom.addEventListener("click", checkDomain);
domainInput.addEventListener("input", function() {
  supportField.value = domainInput.value.trim() ? "support@" + domainInput.value.trim() : "";
});

function populateDomain() {
  var shortName = shortNameInput.value || generateShortName($("#dCompanyName").value || "");
  var slug = slugify(shortName);
  if (!domainInput.value) {
    domainInput.value = slug ? slug + ".co.uk" : "";
    supportField.value = domainInput.value ? "support@" + domainInput.value : "";
  }
  domChips.innerHTML = "";
  [slug+".co.uk",slug+".uk",slug+"app.co.uk",slug+"hq.co.uk","get"+slug+".co.uk"]
    .filter(function(v,i,a){return a.indexOf(v)===i;}).forEach(function(s) {
    var chip = document.createElement("span");
    chip.className = "chip"; chip.textContent = s;
    chip.addEventListener("click", function() { domainInput.value = s; supportField.value = "support@"+s; });
    domChips.appendChild(chip);
  });
  show(domSuggDiv);
  loadEmailPool();
}

function checkDomain() {
  var d = domainInput.value.trim(); if (!d) return;
  show(domainStatus, "info"); domainStatus.textContent = "Checking " + d + "\u2026";
  fetch("/api/domains/check?domains=" + encodeURIComponent(d)).then(function(r){return r.json();}).then(function(data) {
    if (data.error) { domainStatus.textContent = "Error: " + data.error; show(domainStatus,"error"); return; }
    var results = Array.isArray(data) ? data : (data.results||[data]);
    var avail = results.find(function(r){return r.domain && r.domain.toLowerCase()===d.toLowerCase() && r.available;});
    if (avail) { domainStatus.textContent = "\u2705 " + d + " is available!"; show(domainStatus,"success"); }
    else { domainStatus.textContent = "\u274C " + d + " is not available."; show(domainStatus,"warning"); }
  }).catch(function() { domainStatus.textContent = "Couldn\u2019t check."; show(domainStatus,"error"); });
}

function loadEmailPool() {
  fetch("/api/email-pool/status").then(function(r){return r.json();}).then(function(data) {
    if (data.available_emails) {
      emailSelect.innerHTML = '<option value="">\u2014 Select (' + data.available + ' available) \u2014</option>';
      data.available_emails.forEach(function(e) {
        var opt = document.createElement("option"); opt.value = e; opt.textContent = e;
        emailSelect.appendChild(opt);
      });
      if (!emailSelect.value && data.available_emails.length > 0) emailSelect.value = data.available_emails[0];
    }
  }).catch(function() { emailSelect.innerHTML = '<option value="">\u2014 Pool unavailable \u2014</option>'; });
}

// ─── STEP 5: DUNS ────────────────────────────────────────────
var btnDunsLookup  = $("#btnDunsLookup");
var btnDunsRequest = $("#btnDunsRequest");
var dunsStatus     = $("#dunsStatus");
btnDunsLookup.addEventListener("click", lookupDuns);
btnDunsRequest.addEventListener("click", requestDuns);

function populateDuns() {
  var email = emailSelect.value || emailManual.value || "";
  if (!$("#dunsEmail").value && email) $("#dunsEmail").value = email;
  if (!$("#dunsFirst").value) {
    var directors = ($("#dDirectors").value||"").split("\n").filter(Boolean);
    if (directors.length > 0) {
      var parts = directors[0].split(",").map(function(s){return s.trim();});
      if (parts.length >= 2) {
        var firstNames = parts[1].split(/\s+/);
        $("#dunsFirst").value = firstNames[0]||"";
        $("#dunsLast").value = parts[0].charAt(0)+parts[0].slice(1).toLowerCase();
      }
    }
  }
}

function lookupDuns() {
  var cn = $("#dCompanyNumber").value; if (!cn) return;
  show(dunsStatus,"info"); dunsStatus.textContent = "Looking up DUNS\u2026";
  fetch("/api/duns/lookup?company_number=" + cn).then(function(r){return r.json();}).then(function(data) {
    if (data.duns_number) { $("#dunsNumber").value = data.duns_number; dunsStatus.textContent = "\u2705 Found: " + data.duns_number; show(dunsStatus,"success"); }
    else { dunsStatus.textContent = "Not found. You can request one."; show(dunsStatus,"warning"); }
  }).catch(function() { dunsStatus.textContent = "Lookup failed."; show(dunsStatus,"error"); });
}

function requestDuns() {
  var cn = $("#dCompanyNumber").value, email = $("#dunsEmail").value;
  var first = $("#dunsFirst").value, last = $("#dunsLast").value;
  if (!cn||!email) { show(dunsStatus,"warning"); dunsStatus.textContent = "Company # and email required."; return; }
  show(dunsStatus,"info"); dunsStatus.textContent = "Submitting DUNS request\u2026";
  fetch("/api/duns/request",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({company_number:cn,email:email,first_name:first,last_name:last})})
  .then(function(r){return r.json();}).then(function(data) {
    if (data.duns_number) { $("#dunsNumber").value = data.duns_number; dunsStatus.textContent = "\u2705 DUNS: " + data.duns_number; show(dunsStatus,"success"); }
    else { dunsStatus.textContent = data.message||"Submitted \u2014 D&B will email."; show(dunsStatus,"success"); }
  }).catch(function() { dunsStatus.textContent = "Request failed."; show(dunsStatus,"error"); });
}

// ─── STEP 6: REVIEW ─────────────────────────────────────────
function populateReview() {
  var cn = $("#dCompanyNumber").value, name = $("#dCompanyName").value;
  var shortName = shortNameInput.value;
  var displayName = shortName || generateShortName(name);
  var sic = $("#dSIC").value, address = $("#dAddress").value;
  var domain = domainInput.value;
  var email = emailSelect.value || emailManual.value;
  var support = supportField.value;
  var duns = $("#dunsNumber").value;
  var archetype = $("#bArchetype").value;
  var appId = "uk.c" + cn + ".shift";
  var pal = paletteFor(name);
  var warn = '<span class="tag warn">Not set</span>';
  var rows = [
    ["Company #", cn], ["Company Name", name],
    ["App Name", "<strong>" + displayName + "</strong>"],
    ["Application ID", "<code>" + appId + "</code>"],
    ["Archetype", archetype], ["SIC Codes", sic], ["Address", address],
    ["Domain", domain || warn], ["Developer Email", email || warn],
    ["Support Email", support || warn],
    ["DUNS", duns || '<span class="tag warn">Pending</span>'],
    ["Palette", '<span class="dot" style="background:'+pal.primary+'"></span> '+pal.primary+' &nbsp;<span class="dot" style="background:'+pal.primary_dark+'"></span> '+pal.primary_dark+' &nbsp;<span class="dot" style="background:'+pal.accent+'"></span> '+pal.accent],
  ];
  $("#reviewTable tbody").innerHTML = rows.map(function(r){return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>';}).join("");
}

// ─── SUBMIT ──────────────────────────────────────────────────
var btnSubmit = $("#btnSubmit");
var submitStatus = $("#submitStatus");
btnSubmit.addEventListener("click", submitPipeline);

function submitPipeline() {
  var payload = {
    company_number: $("#dCompanyNumber").value, company_name: $("#dCompanyName").value,
    short_name: shortNameInput.value, sic_codes: $("#dSIC").value,
    address: $("#dAddress").value, domain: domainInput.value,
    email: emailSelect.value || emailManual.value, support_email: supportField.value,
    duns_number: $("#dunsNumber").value, duns_email: $("#dunsEmail").value,
    archetype: $("#bArchetype").value, directors: $("#dDirectors").value,
    nationalities: $("#dNationalities").value, status: $("#dStatus").value,
    type: $("#dType").value, date_of_creation: $("#dCreated").value,
  };
  btnSubmit.disabled = true;
  show(submitStatus, "info"); submitStatus.textContent = "Adding to pipeline\u2026";
  fetch("/api/pipeline/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
  .then(function(r){return r.json();}).then(function(data) {
    if (data.success) {
      submitStatus.innerHTML = '\u2705 <strong>Done!</strong> ' + data.company_number + ' added as row ' + (data.row||"") + '. <a href="#" onclick="resetWizard();return false;">Onboard another \u2192</a>';
      show(submitStatus, "success");
    } else { submitStatus.textContent = "Error: " + (data.error||"Unknown"); show(submitStatus,"error"); btnSubmit.disabled = false; }
  }).catch(function() { submitStatus.textContent = "Failed to connect."; show(submitStatus,"error"); btnSubmit.disabled = false; });
}

function resetWizard() {
  state.company = {}; state.details = {}; state.branding = {};
  state.domain = ""; state.email = ""; state.duns = { number:"", status:"" };
  $$("input:not([type=hidden]), select, textarea").forEach(function(el) { el.value = ""; });
  tbody.innerHTML = ""; hide(apSection); hide(table); hide(submitStatus);
  btnSubmit.disabled = false; goStep(1); searchInput.focus();
}
window.resetWizard = resetWizard;

// ─── INIT ────────────────────────────────────────────────────
document.getElementById("footYear").textContent = new Date().getFullYear();
