/* ── GGPlay Wizard — wizard.js ── */

// ─── State ───────────────────────────────────────────────────
const state = {
  step: 1,
  company: {},        // raw CH data
  details: {},        // enriched details (step 2)
  branding: {},       // short_name, palette, archetype
  domain: "",
  email: "",
  supportEmail: "",
  duns: { number: "", status: "" },
};

// ─── SIC → Archetype (mirror of catalog.py) ─────────────────
const SIC_ARCHETYPE = {
  "78200": "shift", "88100": "shift", "87100": "shift",
  "53202": "shift", "49410": "shift", "98000": "shift",
};
const DEFAULT_ARCHETYPE = "shift";

// ─── Palette Generation (mirror of brand_synth.py) ──────────
function hashToHue(name) {
  // Simple FNV-1a-ish hash → 0..359
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
  return {
    primary:      rgbHex(pr, pg, pb),
    primary_dark:  rgbHex(dr, dg, db),
    accent:        rgbHex(ar, ag, ab),
  };
}

// ─── Helpers ─────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const show = (el, cls = "") => { el.classList.remove("hidden"); if (cls) el.className = el.className.replace(/info|success|error|warning/g, "").trim() + " " + cls; };
const hide = el => el.classList.add("hidden");

function initials(name) {
  const parts = name.replace(/-/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function stripSuffix(name) {
  return name.trim().replace(/\s+(LTD|LIMITED|LLP|PLC)\.?$/i, "").trim();
}

function titleCase(str) {
  return str.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function autoDisplayName(companyName) {
  return titleCase(stripSuffix(companyName)).substring(0, 30).trimEnd();
}

// ─── Navigation ──────────────────────────────────────────────
function goStep(n) {
  state.step = n;

  // Update panels
  $$(".panel").forEach(p => p.classList.remove("active"));
  const target = $(`#panel-${n}`);
  if (target) target.classList.add("active");

  // Update stepper
  $$(".stepper .step").forEach(s => {
    const sn = parseInt(s.dataset.step);
    s.classList.remove("active", "done");
    if (sn === n) s.classList.add("active");
    else if (sn < n) s.classList.add("done");
  });

  // Hooks per step
  if (n === 3) populateBranding();
  if (n === 4) populateDomain();
  if (n === 5) populateDuns();
  if (n === 6) populateReview();
}
window.goStep = goStep;

// ─── STEP 1: SEARCH ─────────────────────────────────────────
const btnSearch   = $("#btnSearch");
const searchInput = $("#searchQuery");
const searchNat   = $("#searchNat");
const statusEl    = $("#searchStatus");
const table       = $("#searchResults");
const tbody       = table.querySelector("tbody");

btnSearch.addEventListener("click", doSearch);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });

function doSearch() {
  const q   = searchInput.value.trim();
  const nat = searchNat.value;
  if (!q && !nat) return;

  show(statusEl, "info");
  statusEl.textContent = "Searching Companies House…";
  hide(table);
  tbody.innerHTML = "";

  const params = new URLSearchParams();
  if (q)   params.set("q", q);
  if (nat) params.set("nationality", nat);

  const es = new EventSource(`/api/search/stream?${params}`);
  let count = 0;

  es.onmessage = (e) => {
    const d = JSON.parse(e.data);

    if (d.status) {
      statusEl.textContent = d.status;
    }

    if (d.company_number && !d._skip) {
      count++;
      show(table);
      const addr = d.registered_office_address || {};
      const addrStr = [addr.address_line_1, addr.locality, addr.postal_code].filter(Boolean).join(", ");
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.company_number}</td>
        <td>${d.company_name || d.title || ""}</td>
        <td>${d.company_status || ""}</td>
        <td>${d.company_type || d.type || ""}</td>
        <td>${d.date_of_creation || ""}</td>
        <td>${addrStr}</td>
        <td><button class="btn primary" style="padding:.3rem .7rem;font-size:.78rem">Select</button></td>
      `;
      tr.querySelector("button").addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectCompany(d);
      });
      tbody.appendChild(tr);
      statusEl.textContent = `Found ${count} companies…`;
    }

    if (d.done) {
      es.close();
      statusEl.textContent = `Search complete — ${count} companies found.`;
      show(statusEl, count > 0 ? "success" : "warning");
    }
  };

  es.onerror = () => {
    es.close();
    statusEl.textContent = "Connection lost. Try again.";
    show(statusEl, "error");
  };
}

function selectCompany(data) {
  state.company = data;
  // Fetch full details
  show(statusEl, "info");
  statusEl.textContent = `Loading details for ${data.company_number}…`;

  fetch(`/api/company/${data.company_number}`)
    .then(r => r.json())
    .then(profile => {
      state.details = profile;
      // Also fetch officers
      return fetch(`/api/company/${data.company_number}/officers`).then(r => r.json());
    })
    .then(officers => {
      state.details._officers = officers;
      populateDetails();
      goStep(2);
    })
    .catch(err => {
      // Fallback: use what we have from search
      state.details = data;
      populateDetails();
      goStep(2);
    });
}

// ─── STEP 2: DETAILS ────────────────────────────────────────
function populateDetails() {
  const d = state.details;
  const addr = d.registered_office_address || {};
  const addrStr = typeof addr === "string" ? addr
    : [addr.address_line_1, addr.address_line_2, addr.locality, addr.region, addr.postal_code]
        .filter(Boolean).join(", ");

  $("#dCompanyNumber").value = d.company_number || state.company.company_number || "";
  $("#dCompanyName").value   = d.company_name || "";
  $("#dStatus").value        = d.company_status || "";
  $("#dType").value          = d.type || d.company_type || "";
  $("#dCreated").value       = d.date_of_creation || "";
  $("#dSIC").value           = (d.sic_codes || []).join(", ");
  $("#dAddress").value       = addrStr;

  // Officers
  const officers = (d._officers || {}).items || [];
  const active = officers.filter(o => !o.resigned_on);
  const names = active.map(o => o.name).join("\n");
  const nats  = [...new Set(active.map(o => (o.nationality || "").trim()).filter(Boolean))].join(", ");
  $("#dDirectors").value     = names;
  $("#dNationalities").value = nats;
}

// ─── STEP 3: BRANDING ───────────────────────────────────────
const shortNameInput = $("#bShortName");
const nameCount      = $("#bNameCount");

shortNameInput.addEventListener("input", () => {
  const val = shortNameInput.value;
  nameCount.textContent = `${val.length} / 30 characters`;
  updateBrandPreview();
});

function populateBranding() {
  const companyName = $("#dCompanyName").value || state.company.company_name || "";
  const cn = $("#dCompanyNumber").value || state.company.company_number || "";
  const sic = ($("#dSIC").value || "").split(",")[0].trim();

  const autoName = autoDisplayName(companyName);
  $("#bAutoName").value = autoName;
  if (!shortNameInput.value) shortNameInput.value = autoName;
  nameCount.textContent = `${shortNameInput.value.length} / 30 characters`;

  $("#bAppId").value      = `uk.c${cn}.shift`;
  $("#bArchetype").value  = SIC_ARCHETYPE[sic] || DEFAULT_ARCHETYPE;

  updateBrandPreview();
}

function updateBrandPreview() {
  const companyName = $("#dCompanyName").value || "";
  const displayName = shortNameInput.value || autoDisplayName(companyName);
  const pal = paletteFor(companyName);

  state.branding = {
    short_name: shortNameInput.value,
    palette: pal,
    display_name: displayName,
  };

  // Swatches
  $("#swPrimary").style.background     = pal.primary;
  $("#swPrimaryDark").style.background = pal.primary_dark;
  $("#swAccent").style.background      = pal.accent;

  // Icon preview
  const icon = $("#fakeIcon");
  icon.style.background = pal.primary;
  $("#iconInitials").textContent = initials(displayName);
  $("#iconLabel").textContent    = displayName;
}

// ─── STEP 4: DOMAIN & EMAIL ─────────────────────────────────
const domainInput   = $("#domainInput");
const btnCheckDom   = $("#btnCheckDomain");
const domainStatus  = $("#domainStatus");
const domSuggDiv    = $("#domainSuggestions");
const domChips      = $("#domainChips");
const emailSelect   = $("#emailSelect");
const emailManual   = $("#emailManual");
const supportField  = $("#supportEmail");

btnCheckDom.addEventListener("click", checkDomain);

domainInput.addEventListener("input", () => {
  const d = domainInput.value.trim();
  supportField.value = d ? `support@${d}` : "";
});

function populateDomain() {
  const companyName = $("#dCompanyName").value || "";
  const slug = stripSuffix(companyName).toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .substring(0, 30);

  if (!domainInput.value) {
    domainInput.value = slug ? `${slug}.co.uk` : "";
    supportField.value = domainInput.value ? `support@${domainInput.value}` : "";
  }

  // Suggestions
  domChips.innerHTML = "";
  const suggestions = [
    `${slug}.co.uk`, `${slug}.uk`, `${slug}app.co.uk`,
    `${slug}hq.co.uk`, `get${slug}.co.uk`,
  ].filter((v, i, a) => a.indexOf(v) === i);

  suggestions.forEach(s => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = s;
    chip.addEventListener("click", () => {
      domainInput.value = s;
      supportField.value = `support@${s}`;
    });
    domChips.appendChild(chip);
  });
  show(domSuggDiv);

  // Load email pool
  loadEmailPool();
}

function checkDomain() {
  const d = domainInput.value.trim();
  if (!d) return;

  show(domainStatus, "info");
  domainStatus.textContent = `Checking ${d}…`;

  fetch(`/api/domains/check?domains=${encodeURIComponent(d)}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        domainStatus.textContent = `Error: ${data.error}`;
        show(domainStatus, "error");
        return;
      }
      const results = Array.isArray(data) ? data : (data.results || [data]);
      const avail = results.find(r => r.domain?.toLowerCase() === d.toLowerCase());
      if (avail && avail.available) {
        domainStatus.textContent = `✅ ${d} is available! ${avail.price ? `(${avail.price})` : ""}`;
        show(domainStatus, "success");
      } else {
        domainStatus.textContent = `❌ ${d} is not available.`;
        show(domainStatus, "warning");
      }
    })
    .catch(() => {
      domainStatus.textContent = "Could not check domain — is the server running?";
      show(domainStatus, "error");
    });
}

function loadEmailPool() {
  fetch("/api/email-pool/status")
    .then(r => r.json())
    .then(data => {
      if (data.available_emails) {
        emailSelect.innerHTML = `<option value="">— Select (${data.available} available) —</option>`;
        data.available_emails.forEach(e => {
          const opt = document.createElement("option");
          opt.value = e;
          opt.textContent = e;
          emailSelect.appendChild(opt);
        });
      }
    })
    .catch(() => {
      // Pool endpoint might not exist yet — that's OK
      emailSelect.innerHTML = `<option value="">— Pool unavailable —</option>`;
    });
}

// ─── STEP 5: DUNS ────────────────────────────────────────────
const btnDunsLookup  = $("#btnDunsLookup");
const btnDunsRequest = $("#btnDunsRequest");
const dunsStatus     = $("#dunsStatus");

btnDunsLookup.addEventListener("click", lookupDuns);
btnDunsRequest.addEventListener("click", requestDuns);

function populateDuns() {
  const email = emailSelect.value || emailManual.value || "";
  if (!$("#dunsEmail").value && email) {
    $("#dunsEmail").value = email;
  }
}

function lookupDuns() {
  const cn = $("#dCompanyNumber").value;
  if (!cn) return;

  show(dunsStatus, "info");
  dunsStatus.textContent = "Looking up DUNS…";

  fetch(`/api/duns/lookup?company_number=${cn}`)
    .then(r => r.json())
    .then(data => {
      if (data.duns_number) {
        $("#dunsNumber").value = data.duns_number;
        dunsStatus.textContent = `✅ Found DUNS: ${data.duns_number}`;
        show(dunsStatus, "success");
      } else {
        dunsStatus.textContent = "No DUNS found. You can request one.";
        show(dunsStatus, "warning");
      }
    })
    .catch(() => {
      dunsStatus.textContent = "Lookup failed — is the server running?";
      show(dunsStatus, "error");
    });
}

function requestDuns() {
  const cn    = $("#dCompanyNumber").value;
  const email = $("#dunsEmail").value;
  const first = $("#dunsFirst").value;
  const last  = $("#dunsLast").value;

  if (!cn || !email) {
    show(dunsStatus, "warning");
    dunsStatus.textContent = "Company number and email are required.";
    return;
  }

  show(dunsStatus, "info");
  dunsStatus.textContent = "Submitting DUNS request…";

  fetch("/api/duns/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_number: cn, email, first_name: first, last_name: last }),
  })
    .then(r => r.json())
    .then(data => {
      if (data.duns_number) {
        $("#dunsNumber").value = data.duns_number;
        dunsStatus.textContent = `✅ DUNS: ${data.duns_number}`;
        show(dunsStatus, "success");
      } else {
        dunsStatus.textContent = data.message || "Request submitted. D&B will email the DUNS.";
        show(dunsStatus, "success");
      }
    })
    .catch(() => {
      dunsStatus.textContent = "Request failed — try again.";
      show(dunsStatus, "error");
    });
}

// ─── STEP 6: REVIEW ─────────────────────────────────────────
function populateReview() {
  const cn          = $("#dCompanyNumber").value;
  const name        = $("#dCompanyName").value;
  const shortName   = shortNameInput.value;
  const displayName = shortName || autoDisplayName(name);
  const sic         = $("#dSIC").value;
  const address     = $("#dAddress").value;
  const domain      = domainInput.value;
  const email       = emailSelect.value || emailManual.value;
  const support     = supportField.value;
  const duns        = $("#dunsNumber").value;
  const archetype   = $("#bArchetype").value;
  const appId       = `uk.c${cn}.shift`;

  const rows = [
    ["Company #",     cn],
    ["Company Name",  name],
    ["App Name",      `<strong>${displayName}</strong>${shortName ? "" : " <em>(auto)</em>"}`],
    ["Application ID", appId],
    ["Archetype",     archetype],
    ["SIC Codes",     sic],
    ["Address",       address],
    ["Domain",        domain || "<em>Not set</em>"],
    ["Email",         email || "<em>Not set</em>"],
    ["Support Email", support || "<em>Not set</em>"],
    ["DUNS",          duns || "<em>Pending</em>"],
  ];

  const rt = $("#reviewTable tbody");
  rt.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
}

// ─── SUBMIT ──────────────────────────────────────────────────
const btnSubmit    = $("#btnSubmit");
const submitStatus = $("#submitStatus");

btnSubmit.addEventListener("click", submitPipeline);

function submitPipeline() {
  const payload = {
    company_number: $("#dCompanyNumber").value,
    company_name:   $("#dCompanyName").value,
    short_name:     shortNameInput.value,
    sic_codes:      $("#dSIC").value,
    address:        $("#dAddress").value,
    domain:         domainInput.value,
    email:          emailSelect.value || emailManual.value,
    support_email:  supportField.value,
    duns_number:    $("#dunsNumber").value,
    duns_email:     $("#dunsEmail").value,
    archetype:      $("#bArchetype").value,
    directors:      $("#dDirectors").value,
    nationalities:  $("#dNationalities").value,
    status:         $("#dStatus").value,
    type:           $("#dType").value,
    date_of_creation: $("#dCreated").value,
  };

  btnSubmit.disabled = true;
  show(submitStatus, "info");
  submitStatus.textContent = "Adding to pipeline…";

  fetch("/api/pipeline/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        submitStatus.textContent = `✅ Added! Row ${data.row || ""} in pipeline Excel.`;
        show(submitStatus, "success");
      } else {
        submitStatus.textContent = `Error: ${data.error || "Unknown error"}`;
        show(submitStatus, "error");
        btnSubmit.disabled = false;
      }
    })
    .catch(() => {
      submitStatus.textContent = "Failed to connect to server.";
      show(submitStatus, "error");
      btnSubmit.disabled = false;
    });
}

// ─── INIT ────────────────────────────────────────────────────
document.getElementById("footYear").textContent = new Date().getFullYear();
