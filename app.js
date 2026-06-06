/* AI Allergen Detector — core app logic (two-level scientific taxonomy).
   Pure browser JS. Core analysis works fully offline.
   OCR (Tesseract.js) and PDF (jsPDF) are optional enhancements. */
(function () {
  "use strict";

  const DB = window.ALLERGEN_DB || { groups: [], dishes: [], meta: {} };
  const GROUPS = DB.groups;
  const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));

  const SAMPLE_TEXT =
    "Ingredients: wheat flour, refined sugar, milk solids, peanut oil, soy lecithin (E322), " +
    "iodised salt, cashew bits, raising agent. CONTAINS: WHEAT, MILK, PEANUT, TREE NUTS (CASHEW), SOYA. " +
    "May contain traces of sesame and egg.";

  const PRECAUTION_RE = /(may contain|may be present|traces? of|processed in|manufactured in|shared (?:equipment|facility|line)|same (?:equipment|facility|line)|produced in (?:a|the) (?:facility|plant)|cross[- ]?contact)/i;

  // ---------- DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- state ----------
  const state = {
    mode: "label",
    profile: new Set(), // tokens: "group:KEY" (whole group) or "mem:KEY:MemberName"
    person: {},
    lastResult: null,
    pendingFile: null,
    lastWasOcr: false,
  };
  const HISTORY_KEY = "allergen_history_v1";
  const PROFILE_KEY = "allergen_profile_v2";
  const PERSON_KEY = "allergen_person_v1";

  // demographic fields: input id -> stored key
  const PERSON_FIELDS = { pName: "name", pAge: "age", pGender: "gender", pId: "pid", pContact: "contact" };
  function loadPersonIntoForm() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(PERSON_KEY)) || {}; } catch (e) {}
    Object.keys(PERSON_FIELDS).forEach((id) => {
      const node = document.getElementById(id);
      if (node && p[PERSON_FIELDS[id]] != null) node.value = p[PERSON_FIELDS[id]];
    });
    state.person = p;
  }
  function readPersonForm() {
    const p = {};
    Object.keys(PERSON_FIELDS).forEach((id) => {
      const node = document.getElementById(id);
      p[PERSON_FIELDS[id]] = node ? node.value.trim() : "";
    });
    return p;
  }
  function savePerson() {
    state.person = readPersonForm();
    try { localStorage.setItem(PERSON_KEY, JSON.stringify(state.person)); } catch (e) {}
  }
  // Name, age and gender are mandatory. Returns true if valid; otherwise shows errors.
  function validatePerson() {
    const p = readPersonForm();
    const problems = [];
    ["pName", "pAge", "pGender"].forEach((id) => { const n = document.getElementById(id); if (n) n.classList.remove("invalid"); });
    if (!p.name) { problems.push("name"); markInvalid("pName"); }
    const ageNum = Number(p.age);
    if (!p.age || isNaN(ageNum) || ageNum < 0 || ageNum > 120) { problems.push("a valid age (0–120)"); markInvalid("pAge"); }
    if (!p.gender) { problems.push("gender"); markInvalid("pGender"); }
    const errBox = $("#onboardError");
    if (problems.length) {
      errBox.textContent = "Please enter " + problems.join(", ") + " to continue.";
      errBox.classList.remove("is-hidden");
      const first = document.getElementById(problems[0] === "name" ? "pName" : problems[0].startsWith("a valid age") ? "pAge" : "pGender");
      if (first) { first.scrollIntoView({ behavior: "smooth", block: "center" }); try { first.focus(); } catch (e) {} }
      return false;
    }
    errBox.classList.add("is-hidden");
    return true;
  }
  function markInvalid(id) { const n = document.getElementById(id); if (n) n.classList.add("invalid"); }
  function personLine() {
    const p = state.person || {};
    const bits = [];
    if (p.name) bits.push(p.name);
    if (p.age) bits.push(p.age + " yrs");
    if (p.gender) bits.push(p.gender);
    if (p.pid) bits.push("ID: " + p.pid);
    return bits.join(" · ");
  }

  const memToken = (gk, name) => "mem:" + gk + ":" + name;
  const grpToken = (gk) => "group:" + gk;
  function inProfile(groupKey, memberNames) {
    if (state.profile.has(grpToken(groupKey))) return true;
    return (memberNames || []).some((n) => state.profile.has(memToken(groupKey, n)));
  }

  // =====================================================================
  //  MATCHING ENGINE
  // =====================================================================
  function normalize(text) {
    return String(text || "").replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
  }
  function containsPhrase(haystackLower, phrase) {
    const p = phrase.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + p + "(es|s)?([^a-z0-9]|$)", "i").test(haystackLower);
  }
  function splitSegments(text) {
    return text.split(/[\n,.;:•|]+/).map((s) => s.trim()).filter(Boolean);
  }
  function isPrecautionaryContext(text, phrase) {
    const lp = phrase.toLowerCase();
    for (const seg of splitSegments(text)) {
      const low = seg.toLowerCase();
      if (containsPhrase(low, lp) && PRECAUTION_RE.test(low)) return true;
    }
    return false;
  }

  /* Confidence model (deterministic, documented):
       direct match  : high-sev 95 / med-sev 90
       cross-contact : 60
       dish likely   : 72 ; dish possible : 45
       OCR penalty   : −8 ; AI-vision penalty : −12  (floor 30)  */
  function scoreConfidence(kind, severity, source) {
    let base;
    if (kind === "direct") base = severity === "high" ? 95 : 90;
    else if (kind === "cross_contact") base = 60;
    else if (kind === "dish_likely") base = 72;
    else base = 45;
    if (source === "ocr") base = Math.max(30, base - 8);
    else if (source === "vision") base = Math.max(30, base - 12);
    return base;
  }
  const KIND_RANK = { direct: 4, cross_contact: 3, dish_likely: 2, dish_possible: 1 };

  function analyze(rawText, opts) {
    const text = normalize(rawText);
    const low = text.toLowerCase();
    const source = (opts && opts.source) || "text"; // 'text' | 'ocr' | 'vision'
    const fromOcr = source === "ocr";
    const foodHints = (opts && opts.foodHints) || []; // [{name, likely[], possible[], prob}]
    const hintVerb = (opts && opts.hintVerb) || "AI vision identified"; // or "You selected"
    const dets = new Map(); // groupKey -> detection

    function ensureDet(group) {
      let d = dets.get(group.key);
      if (!d) { d = { group, kind: null, members: new Map(), evidence: [] }; dets.set(group.key, d); }
      return d;
    }
    function noteMember(group, member, kind, evidence) {
      const d = ensureDet(group);
      const cur = d.members.get(member.name);
      if (!cur || KIND_RANK[kind] > KIND_RANK[cur.kind]) d.members.set(member.name, { member, kind, evidence });
      if (!d.kind || KIND_RANK[kind] > KIND_RANK[d.kind]) d.kind = kind;
      d.evidence.push(evidence);
    }
    function noteGroupGeneric(group, kind, evidence) {
      const d = ensureDet(group);
      if (!d.kind || KIND_RANK[kind] > KIND_RANK[d.kind]) d.kind = kind;
      d.evidence.push(evidence);
    }

    // 1) specific member (species) matches + generic group matches
    for (const g of GROUPS) {
      let matchedSomething = false;
      for (const m of g.members) {
        for (const alias of m.aliases) {
          if (containsPhrase(low, alias)) {
            const cc = isPrecautionaryContext(text, alias);
            noteMember(g, m, cc ? "cross_contact" : "direct",
              (cc ? "“" + alias + "” in a may-contain / traces statement" : "ingredient term “" + alias + "”"));
            matchedSomething = true;
            break;
          }
        }
      }
      for (const alias of g.generic_aliases) {
        if (containsPhrase(low, alias)) {
          const cc = isPrecautionaryContext(text, alias);
          noteGroupGeneric(g, cc ? "cross_contact" : "direct",
            (cc ? "“" + alias + "” (traces statement)" : "term “" + alias + "”"));
          matchedSomething = true;
          break;
        }
      }
      if (!matchedSomething) dets.delete(g.key);
    }

    // 2) dish inference
    const dishHits = [];
    for (const dish of DB.dishes) {
      if (dish.aliases.some((a) => containsPhrase(low, a))) {
        dishHits.push(dish);
        (dish.likely || []).forEach((k) => {
          const g = GROUP_BY_KEY[k];
          if (g) noteGroupGeneric(g, "dish_likely", "dish “" + dish.name + "” is usually made with " + g.label.toLowerCase());
        });
        (dish.possible || []).forEach((k) => {
          const g = GROUP_BY_KEY[k];
          if (g) noteGroupGeneric(g, "dish_possible", "dish “" + dish.name + "” may contain " + g.label.toLowerCase());
        });
      }
    }

    // 2b) food hints from AI vision OR a user-confirmed dish (no text needed)
    for (const fh of foodHints) {
      (fh.likely || []).forEach((k) => {
        const g = GROUP_BY_KEY[k];
        if (g) noteGroupGeneric(g, "dish_likely", "“" + fh.name + "” is usually made with " + g.label.toLowerCase());
      });
      (fh.possible || []).forEach((k) => {
        const g = GROUP_BY_KEY[k];
        if (g) noteGroupGeneric(g, "dish_possible", "“" + fh.name + "” may contain " + g.label.toLowerCase());
      });
    }

    // finalize detections
    const list = Array.from(dets.values()).map((d) => {
      const members = Array.from(d.members.values());
      const confidence = scoreConfidence(d.kind, d.group.severity, source);
      const memberNames = members.map((mm) => mm.member.name);
      return {
        group: d.group, kind: d.kind, confidence,
        members, memberNames,
        profileHit: inProfile(d.group.key, memberNames),
        evidence: d.evidence,
      };
    }).sort((a, b) => {
      const sev = { high: 0, medium: 1, low: 2 };
      if (a.profileHit !== b.profileHit) return a.profileHit ? -1 : 1;
      if (sev[a.group.severity] !== sev[b.group.severity]) return sev[a.group.severity] - sev[b.group.severity];
      return b.confidence - a.confidence;
    });

    // 3) verdict
    let level = "green";
    const hasDirect = list.some((d) => d.kind === "direct");
    const hasDirectHigh = list.some((d) => d.kind === "direct" && d.group.severity === "high");
    const hasProfiledDirect = list.some((d) => d.profileHit && d.kind === "direct");
    if (hasProfiledDirect || hasDirectHigh) level = "red";
    else if (hasDirect) level = state.profile.size ? "yellow" : "red";
    else if (list.length) level = "yellow";

    const reasons = [];
    if (foodHints.length) reasons.push(hintVerb + ": " + foodHints.map((f) => f.name + (f.prob ? " (" + Math.round(f.prob * 100) + "%)" : "")).join(", ") + " — allergens inferred from typical recipes.");
    if (!list.length && !foodHints.length) reasons.push("No known allergen terms, species, dishes, or biomolecules matched the text.");
    if (!list.length && foodHints.length) reasons.push("No major allergens are typical for the identified food — but AI vision can be wrong, so verify if you have a severe allergy.");
    if (dishHits.length) reasons.push("Recognised dish(es): " + dishHits.map((d) => d.name).join(", ") + " — ingredients inferred from typical recipes.");
    if (list.some((d) => d.kind === "cross_contact")) reasons.push("A precautionary (“may contain / traces”) statement was detected.");
    const prof = list.filter((d) => d.profileHit);
    if (state.profile.size && prof.length) reasons.push("Escalated against YOUR profile: " + prof.map((d) => d.group.label).join(", ") + ".");
    if (fromOcr) reasons.push("Text came from photo OCR — confidence reduced slightly for reading errors.");
    if (source === "vision") reasons.push("Result is from AI image recognition (no label/text). Treat it as a hint, not a guarantee.");

    return { level, detections: list, reasons, text, fromOcr, source, dishHits, foodHints };
  }

  // =====================================================================
  //  RENDERING
  // =====================================================================
  const VERDICT_COPY = {
    green: ["No known allergen detected", "Nothing in the database matched. Still verify if you have a severe allergy."],
    yellow: ["Possible allergen — review needed", "Soft or precautionary signals were found. Check carefully before consuming."],
    red: ["High-risk allergen detected", "Potentially unsafe — a major allergen was found directly in the text."],
  };
  const STATUS_TEXT = { green: "No known allergen detected", yellow: "Caution", red: "Potentially Unsafe" };

  function statusLabel(d) {
    if (d.kind === "direct") return d.group.severity === "high" ? "Potentially Unsafe" : "Likely Present";
    if (d.kind === "cross_contact") return "Possible (traces / cross-contact)";
    if (d.kind === "dish_likely") return "Likely (inferred from dish)";
    return "Possible (inferred from dish)";
  }
  const KIND_LABEL = {
    direct: "Found directly in text", cross_contact: "Cross-contact / may-contain statement",
    dish_likely: "Inferred from dish (likely)", dish_possible: "Inferred from dish (possible)",
  };

  function renderResult(result) {
    state.lastResult = result;
    const v = $("#verdict");
    v.className = "verdict verdict-" + result.level;
    $("#verdictTitle").textContent = VERDICT_COPY[result.level][0];
    $("#verdictText").textContent = VERDICT_COPY[result.level][1];

    const meta = $("#resultsMeta");
    meta.innerHTML = ""; meta.classList.remove("is-hidden");
    meta.appendChild(el("span", "pill", result.detections.length + " allergen group(s)"));
    const specSpecies = result.detections.reduce((n, d) => n + d.members.length, 0);
    if (specSpecies) meta.appendChild(el("span", "pill", specSpecies + " specific source(s)"));
    meta.appendChild(el("span", "pill", "mode: " + (state.mode === "menu" ? "menu/dish" : "label")));
    if (result.source === "ocr") meta.appendChild(el("span", "pill", "source: photo OCR"));
    if (result.source === "vision") meta.appendChild(el("span", "pill", "source: AI vision"));
    if (state.profile.size) meta.appendChild(el("span", "pill", "profile active"));

    const wrap = $("#cards");
    wrap.innerHTML = "";
    for (const d of result.detections) wrap.appendChild(buildCard(d));

    const rList = $("#reasoningList"); rList.innerHTML = "";
    if (result.reasons.length) { result.reasons.forEach((r) => rList.appendChild(el("li", null, esc(r)))); $("#reasoning").classList.remove("is-hidden"); }
    else $("#reasoning").classList.add("is-hidden");

    if (result.text) { $("#extractedText").textContent = result.text; $("#extractedWrap").classList.remove("is-hidden"); }
    else $("#extractedWrap").classList.add("is-hidden");

    fireAlerts(result.level);
  }

  function moleculeTable(molecules, cap) {
    const scroll = el("div", "mol-scroll");
    const tbl = el("table", "mol-table");
    tbl.innerHTML = "<thead><tr><th>Allergen</th><th>Protein / biomolecule</th><th>MW</th><th>IgE evidence</th><th>Ref.</th></tr></thead>";
    const tb = el("tbody");
    molecules.slice(0, cap).forEach((m) => {
      const tr = el("tr");
      const ref = m.accession
        ? (m.link ? '<a href="' + esc(m.link) + '" target="_blank" rel="noopener">' + esc(m.accession) + "</a>" : esc(m.accession))
        : (m.link ? '<a href="' + esc(m.link) + '" target="_blank" rel="noopener">link</a>' : "—");
      tr.innerHTML =
        '<td class="mol-name">' + esc(m.name) + "</td>" +
        "<td>" + esc(m.protein) + "</td>" +
        "<td>" + esc(m.mw || "—") + "</td>" +
        '<td><span class="ev">' + esc(m.evidence) + "</span></td>" +
        '<td class="mol-ref">' + ref + "</td>";
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    scroll.appendChild(tbl);
    return scroll;
  }

  function buildCard(d) {
    const g = d.group;
    const card = el("div", "card sev-" + g.severity);

    const head = el("div", "card-head");
    head.appendChild(el("div", "card-title",
      esc(g.label) +
      ' <span class="badge badge-' + g.severity + '">' + g.severity + " risk</span>" +
      (d.profileHit ? '<span class="badge badge-profile">your allergy</span>' : "")));
    head.appendChild(el("div", null, '<span class="hint">' + esc(g.category) + "</span>"));
    card.appendChild(head);

    const confColor = d.confidence >= 80 ? "var(--red)" : d.confidence >= 60 ? "var(--yellow)" : "var(--green)";
    card.appendChild(el("div", "card-row", '<span class="k">Status</span><b>' + esc(statusLabel(d)) + "</b>"));
    card.appendChild(el("div", "card-row", '<span class="k">Basis</span>' + esc(KIND_LABEL[d.kind]) + " — " + esc(d.evidence[0])));

    const conf = el("div", "card-row", '<span class="k">Confidence</span><b>' + d.confidence + "%</b>");
    const bar = el("div", "conf-bar"); const fill = el("div", "conf-fill");
    fill.style.width = d.confidence + "%"; fill.style.background = confColor; bar.appendChild(fill); conf.appendChild(bar);
    card.appendChild(conf);

    // Specific allergen sources (species) detected
    if (d.members.length) {
      const sect = el("div", "species-block");
      sect.appendChild(el("div", "species-head", "Specific allergen(s) identified"));
      d.members.forEach((mm) => {
        const member = mm.member;
        const box = el("div", "species-item");
        box.appendChild(el("div", "species-name",
          esc(member.name) + ' <span class="species-latin">' + esc(member.species || "") + "</span>" +
          ' <span class="hint">· ' + member.molecule_count + " molecule(s)</span>"));
        if (member.molecules.length) {
          const det = el("details", "molecules");
          det.appendChild(el("summary", null, "Allergenic biomolecules / proteins"));
          det.appendChild(moleculeTable(member.molecules, 14));
          if (member.molecules.length > 14) det.appendChild(el("p", "hint", "+" + (member.molecules.length - 14) + " more in database."));
          box.appendChild(det);
        }
        sect.appendChild(box);
      });
      card.appendChild(sect);
    } else {
      // generic group hit — show representative molecules across the group
      const rep = [];
      g.members.forEach((m) => m.molecules.slice(0, 3).forEach((x) => rep.push(x)));
      card.appendChild(el("div", "card-row",
        '<span class="k">Scientific class</span>' +
        esc(g.members.map((m) => m.species).filter(Boolean).slice(0, 3).join("; ")) +
        ' <span class="hint">(specific species not named in text)</span>'));
      if (rep.length) {
        const det = el("details", "molecules");
        det.appendChild(el("summary", null, "Representative allergenic biomolecules"));
        det.appendChild(moleculeTable(rep, 12));
        card.appendChild(det);
      }
    }

    card.appendChild(el("p", "card-note hint", esc(g.note)));
    return card;
  }

  // =====================================================================
  //  ALERTS
  // =====================================================================
  function fireAlerts(level) {
    if (level === "red") {
      if ($("#optVibrate").checked && navigator.vibrate) navigator.vibrate([180, 80, 180]);
      if ($("#optSound").checked) beep(880, 0.18);
    } else if (level === "yellow") {
      if ($("#optVibrate").checked && navigator.vibrate) navigator.vibrate(120);
      if ($("#optSound").checked) beep(520, 0.14);
    }
  }
  function beep(freq, dur) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.frequency.value = freq; osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(); osc.stop(ctx.currentTime + dur + 0.02);
    } catch (e) {}
  }

  // =====================================================================
  //  HISTORY + EXPORTS
  // =====================================================================
  function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch (e) { return []; } }
  function saveHistory(list) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 200))); } catch (e) {} }
  function recordScan(result) {
    const list = loadHistory();
    list.unshift({
      id: "scan_" + Date.now(), ts: new Date().toISOString(), level: result.level,
      mode: state.mode, source: result.source === "vision" ? "ai_photo" : result.source === "ocr" ? "photo_ocr" : "text", status: STATUS_TEXT[result.level],
      allergens: result.detections.map((d) => ({
        label: d.group.label, severity: d.group.severity, kind: d.kind, confidence: d.confidence,
        inProfile: d.profileHit,
        species: d.members.map((mm) => mm.member.name + " (" + mm.member.species + ")").join("; "),
        biomolecules: d.members.flatMap((mm) => mm.member.molecules.slice(0, 6).map((x) => x.name)).join("; "),
      })),
      textSnippet: result.text.slice(0, 240),
    });
    saveHistory(list); renderHistory();
  }
  function renderHistory() {
    const list = loadHistory();
    $("#historyCount").textContent = list.length ? "(" + list.length + ")" : "";
    const wrap = $("#historyList"); wrap.innerHTML = "";
    if (!list.length) { wrap.appendChild(el("p", "history-empty", "No scans yet. Analyses are logged here for your records.")); return; }
    list.slice(0, 30).forEach((item) => {
      const row = el("div", "history-item");
      row.appendChild(el("span", "history-dot " + item.level));
      const grow = el("div", "grow");
      const names = item.allergens.length ? item.allergens.map((a) => a.label).join(", ") : "No allergens detected";
      grow.appendChild(el("b", null, esc(names)));
      grow.appendChild(el("span", "meta", esc(new Date(item.ts).toLocaleString()) + " · " + esc(item.status) + " · " + esc(item.source)));
      row.appendChild(grow); wrap.appendChild(row);
    });
  }
  function exportCsv() {
    const list = loadHistory();
    if (!list.length) return alert("No history to export yet.");
    const p = state.person || {};
    const pre = [p.name || "", p.age || "", p.gender || "", p.pid || "", p.contact || ""];
    const rows = [["patient_name", "age", "gender", "participant_id", "contact",
      "scan_id", "timestamp", "verdict", "status", "mode", "source", "allergen_group", "severity", "basis", "confidence_%", "in_profile", "species", "biomolecules", "text_snippet"]];
    list.forEach((s) => {
      if (!s.allergens.length) rows.push(pre.concat([s.id, s.ts, s.level, s.status, s.mode, s.source, "(none)", "", "", "", "", "", "", s.textSnippet]));
      else s.allergens.forEach((a) => rows.push(pre.concat([s.id, s.ts, s.level, s.status, s.mode, s.source, a.label, a.severity, a.kind, a.confidence, a.inProfile ? "yes" : "no", a.species, a.biomolecules, s.textSnippet])));
    });
    const csv = rows.map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    downloadBlob(new Blob([csv], { type: "text/csv" }), "allergen_scan_history.csv");
  }
  function exportPdf() {
    const list = loadHistory();
    if (!list.length) return alert("No history to export yet.");
    const ns = window.jspdf || (window.jsPDF ? { jsPDF: window.jsPDF } : null);
    if (window.__noJsPDF || !ns) { alert("PDF library could not load. Use CSV export instead, or connect to the internet once."); return; }
    const doc = new ns.jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth(); let y = 54;
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.text("AI Allergen Detector — Scan Report", 40, y); y += 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
    doc.text("Generated " + new Date().toLocaleString() + "  ·  " + list.length + " record(s)  ·  Research/educational use only", 40, y);
    y += 14;
    // Participant / patient details block
    const p = state.person || {};
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20);
    doc.text("Participant details", 40, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(40);
    const detail = (lab, val) => { doc.setFont("helvetica", "bold"); doc.text(lab + ": ", 40, y); const lw = doc.getTextWidth(lab + ": "); doc.setFont("helvetica", "normal"); doc.text(val || "—", 40 + lw, y); y += 13; };
    detail("Name", p.name);
    detail("Age", p.age ? p.age + " years" : "");
    detail("Gender", p.gender);
    detail("Participant / Patient ID", p.pid);
    if (p.contact) detail("Contact", p.contact);
    const allergenList = (function () { const g = new Set(); state.profile.forEach((t) => g.add(t.split(":")[1])); return Array.from(g).map((k) => (GROUP_BY_KEY[k] ? GROUP_BY_KEY[k].label : k)).join(", "); })();
    detail("Declared allergen profile", allergenList);
    y += 4; doc.setDrawColor(220); doc.line(40, y, W - 40, y); y += 18; doc.setTextColor(20);
    const ensure = (h) => { if (y + h > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 50; } };
    list.forEach((s, i) => {
      ensure(60); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      const dot = { green: [22, 163, 74], yellow: [217, 119, 6], red: [220, 38, 38] }[s.level] || [100, 100, 100];
      doc.setFillColor(dot[0], dot[1], dot[2]); doc.circle(45, y - 3, 4, "F"); doc.setTextColor(20);
      doc.text((i + 1) + ". " + s.status + "  (" + s.mode + " · " + s.source + ")", 58, y); y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(110);
      doc.text(new Date(s.ts).toLocaleString(), 58, y); y += 13; doc.setTextColor(30);
      if (!s.allergens.length) { doc.text("No allergens detected.", 58, y); y += 14; }
      else s.allergens.forEach((a) => {
        ensure(34); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        doc.text("• " + a.label + " — " + a.severity.toUpperCase() + " risk, " + a.confidence + "%" + (a.inProfile ? " [PROFILE]" : ""), 64, y); y += 12;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
        const lines = [];
        if (a.species) lines.push("species: " + a.species);
        lines.push("basis: " + a.kind.replace(/_/g, " ") + (a.biomolecules ? "  ·  biomolecules: " + a.biomolecules : ""));
        lines.forEach((t) => doc.splitTextToSize(t, W - 130).forEach((ln) => { ensure(11); doc.text(ln, 70, y); y += 10; }));
        doc.setTextColor(30);
      });
      y += 8; doc.setDrawColor(235); ensure(6); doc.line(58, y, W - 40, y); y += 14;
    });
    doc.save("allergen_scan_report.pdf");
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // =====================================================================
  //  OCR
  // =====================================================================
  let tesseractLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tesseractLoading) return tesseractLoading;
    tesseractLoading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(new Error("offline"));
      document.head.appendChild(s);
    });
    return tesseractLoading;
  }
  async function runOcr(file) {
    const status = $("#ocrStatus"); status.classList.remove("is-hidden");
    status.textContent = "Loading OCR engine…";
    let T; try { T = await loadTesseract(); } catch (e) {
      status.textContent = "⚠️ Couldn't load OCR (needs internet the first time). You can still type/paste the text.";
      return null;
    }
    try {
      status.textContent = "Reading text from image… this can take 10–30s.";
      const { data } = await T.recognize(file, "eng", {
        logger: (m) => { if (m.status === "recognizing text") status.textContent = "Reading text… " + Math.round(m.progress * 100) + "%"; },
      });
      const text = normalize(data.text || "");
      status.textContent = text ? "✓ Text extracted. Review and edit below, then Analyse." : "No readable text found.";
      return text;
    } catch (e) { status.textContent = "⚠️ OCR failed. Try a clearer photo, or type the text."; return null; }
  }

  // =====================================================================
  //  AI FOOD VISION  (TensorFlow.js MobileNet, loaded from CDN on demand)
  // =====================================================================
  /* Maps the model's recognised food labels to allergen inference.
     Key = a keyword that may appear in MobileNet's className; value = friendly
     food name + likely/possible allergen group keys. Covers common foods the
     free in-browser model can recognise. */
  const VISION_FOOD = [
    { kw: ["pizza"], name: "Pizza", likely: ["wheat", "milk"], possible: ["soy"] },
    { kw: ["cheeseburger", "hamburger"], name: "Burger", likely: ["wheat", "milk"], possible: ["egg", "soy", "sesame"] },
    { kw: ["hotdog", "hot dog"], name: "Hot dog", likely: ["wheat"], possible: ["milk", "soy"] },
    { kw: ["bagel"], name: "Bagel", likely: ["wheat"], possible: ["sesame", "egg"] },
    { kw: ["pretzel"], name: "Pretzel", likely: ["wheat"], possible: [] },
    { kw: ["french loaf", "baguette", "bread"], name: "Bread", likely: ["wheat"], possible: ["milk", "sesame", "soy"] },
    { kw: ["dough"], name: "Dough", likely: ["wheat"], possible: [] },
    { kw: ["carbonara"], name: "Pasta carbonara", likely: ["wheat", "egg", "milk"], possible: [] },
    { kw: ["spaghetti", "pasta", "noodle"], name: "Pasta / noodles", likely: ["wheat"], possible: ["egg", "milk", "soy"] },
    { kw: ["burrito"], name: "Burrito", likely: ["wheat"], possible: ["milk", "soy"] },
    { kw: ["pot pie", "potpie"], name: "Pot pie", likely: ["wheat", "milk", "egg"], possible: [] },
    { kw: ["meat loaf", "meatloaf"], name: "Meatloaf", likely: ["egg"], possible: ["wheat", "milk"] },
    { kw: ["ice cream", "ice lolly", "icecream"], name: "Ice cream", likely: ["milk"], possible: ["egg", "tree_nut"] },
    { kw: ["eggnog"], name: "Eggnog", likely: ["egg", "milk"], possible: [] },
    { kw: ["trifle"], name: "Trifle", likely: ["milk", "egg", "wheat"], possible: ["tree_nut"] },
    { kw: ["chocolate sauce", "chocolate syrup"], name: "Chocolate sauce", likely: ["milk"], possible: ["soy", "tree_nut"] },
    { kw: ["waffle"], name: "Waffle", likely: ["wheat", "egg", "milk"], possible: [] },
    { kw: ["pancake"], name: "Pancake", likely: ["wheat", "egg", "milk"], possible: [] },
    // Seafood — ImageNet recognises several crustaceans & food fish directly
    { kw: ["dungeness crab", "rock crab", "fiddler crab", "king crab", "hermit crab", "crab"], name: "Crab", likely: ["shellfish"], possible: ["mollusc"] },
    { kw: ["american lobster", "spiny lobster", "lobster"], name: "Lobster", likely: ["shellfish"], possible: [] },
    { kw: ["crayfish", "crawfish"], name: "Crayfish / prawn", likely: ["shellfish"], possible: [] },
    { kw: ["coho", "salmon", "eel", "sturgeon", "barracouta", "gar", "sea bass"], name: "Fish", likely: ["fish"], possible: [] },
    { kw: ["sea slug", "conch", "snail", "chiton", "chambered nautilus"], name: "Sea snail / shellfish", likely: ["mollusc"], possible: ["shellfish"] },
    { kw: ["guacamole"], name: "Guacamole", likely: [], possible: [] },
    { kw: ["mashed potato"], name: "Mashed potato", likely: [], possible: ["milk"] },
    { kw: ["consomme", "hot pot", "soup", "broth"], name: "Soup / broth", likely: [], possible: ["celery", "wheat", "fish"] },
    { kw: ["burrito"], name: "Burrito", likely: ["wheat"], possible: ["milk"] },
    { kw: ["espresso", "cup", "coffee", "eggnog"], name: "Beverage", likely: [], possible: [] },
    { kw: ["banana", "orange", "lemon", "strawberry", "pineapple", "fig", "pomegranate", "granny smith", "jackfruit", "custard apple"], name: "Fruit", likely: [], possible: [] },
    { kw: ["broccoli", "cauliflower", "cabbage", "cucumber", "mushroom", "bell pepper", "zucchini", "artichoke", "cardoon"], name: "Vegetable", likely: [], possible: [] },
  ];

  let mobilenetLoading = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("offline"));
      document.head.appendChild(s);
    });
  }
  function loadMobilenet() {
    if (window.__mobilenetModel) return Promise.resolve(window.__mobilenetModel);
    if (mobilenetLoading) return mobilenetLoading;
    mobilenetLoading = (async () => {
      if (!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js");
      if (!window.mobilenet) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js");
      window.__mobilenetModel = await window.mobilenet.load({ version: 2, alpha: 1.0 });
      return window.__mobilenetModel;
    })();
    return mobilenetLoading;
  }

  // Map raw model predictions to allergen food-hints.
  function mapPredictionsToHints(predictions) {
    const hints = [];
    const seen = new Set();
    for (const p of predictions) {
      if (p.probability < 0.08) continue;
      const cn = p.className.toLowerCase();
      for (const entry of VISION_FOOD) {
        if (entry.kw.some((k) => cn.indexOf(k) !== -1)) {
          if (seen.has(entry.name)) break;
          seen.add(entry.name);
          hints.push({ name: entry.name, likely: entry.likely, possible: entry.possible, prob: p.probability });
          break;
        }
      }
    }
    return hints;
  }

  function imageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  async function runFoodVision(file) {
    const status = $("#ocrStatus"); status.classList.remove("is-hidden");
    status.textContent = "Loading AI food-recognition model… (first time needs internet)";
    let model; try { model = await loadMobilenet(); } catch (e) {
      status.textContent = "⚠️ Couldn't load the AI model (needs internet the first time). You can type the dish name instead.";
      return null;
    }
    try {
      status.textContent = "Looking at the image…";
      const img = await imageFromFile(file);
      const preds = await model.classify(img, 5);
      status.classList.add("is-hidden");
      return { predictions: preds, hints: mapPredictionsToHints(preds) };
    } catch (e) {
      status.textContent = "⚠️ AI vision failed on this image. Try a clearer, closer photo of the food.";
      return null;
    }
  }

  function renderVisionResult(vres) {
    const box = $("#visionResult");
    box.classList.remove("is-hidden");
    let head;
    if (!vres || !vres.predictions || !vres.predictions.length) {
      head = '<span class="hint">The AI could not recognise the food.</span>';
    } else if (vres.hints.length) {
      head = '<div class="vision-title">🍽️ AI identified:</div><div>' +
        vres.hints.map((h) => '<span class="ps-chip">' + esc(h.name) + " · " + Math.round(h.prob * 100) + "%</span>").join("") + "</div>";
    } else {
      head = '<div class="vision-title">🍽️ AI saw "' + esc(vres.predictions[0].className.split(",")[0]) +
        '"</div><span class="hint">…but it is not a food I can map. Pick the real dish below.</span>';
    }
    // correction control — pick the ACTUAL dish (incl. Vietnamese) from the database
    const correct =
      '<div class="vision-correct">' +
      '<label for="dishCorrect">Wrong, or want to be exact? Choose / type the actual dish:</label>' +
      '<div class="vision-correct-row">' +
      '<input id="dishCorrect" list="dishList" autocomplete="off" placeholder="e.g. Phở, Bún chả, Gỏi cuốn, Mực…" />' +
      '<button id="dishConfirmBtn" class="secondary-btn" type="button">Analyse</button>' +
      "</div></div>";
    box.innerHTML = head + correct;
    const input = $("#dishCorrect");
    if (vres && vres.hints && vres.hints.length) input.value = vres.hints[0].name;
    $("#dishConfirmBtn").addEventListener("click", () => confirmDish(input.value));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); confirmDish(input.value); } });
  }

  // Look up a dish by its display name or any alias, then analyse it.
  function findDish(text) {
    const v = String(text || "").trim().toLowerCase();
    if (!v) return null;
    let best = null;
    for (const d of DB.dishes) {
      if (d.name.toLowerCase() === v) return d;
      if (d.aliases.some((a) => a.toLowerCase() === v)) return d;
      if (!best && (d.name.toLowerCase().indexOf(v) !== -1 || d.aliases.some((a) => v.indexOf(a.toLowerCase()) !== -1 || a.toLowerCase().indexOf(v) !== -1))) best = d;
    }
    return best;
  }
  function confirmDish(text) {
    const val = String(text || "").trim();
    if (!val) { alert("Type or choose a dish first."); return; }
    const dish = findDish(val);
    let result;
    if (dish) {
      result = analyze("", { source: "text", hintVerb: "You selected dish", foodHints: [{ name: dish.name, likely: dish.likely, possible: dish.possible, prob: null }] });
    } else {
      // free text the user typed — run the normal text analysis on it
      result = analyze(val, { source: "text" });
    }
    renderResult(result); recordScan(result);
    $("#verdict").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // =====================================================================
  //  PROFILE TREE
  // =====================================================================
  function buildProfileTree() {
    const wrap = $("#profileTree");
    GROUPS.forEach((g) => {
      const block = el("div", "ptree-group");
      const head = el("div", "ptree-head");
      const gid = "pg_" + g.key;
      head.innerHTML =
        '<label class="ptree-grouplabel"><input type="checkbox" id="' + gid + '" data-grp="' + g.key + '"> ' +
        '<span class="ptree-dot sev-' + g.severity + '"></span><b>' + esc(g.label) + "</b>" +
        '<span class="hint"> · ' + esc(g.category) + "</span></label>";
      if (g.members.length > 1 || (g.members[0] && g.members[0].name !== g.label)) {
        const toggle = el("button", "ptree-toggle", "▸"); toggle.type = "button";
        toggle.setAttribute("aria-label", "Expand " + g.label);
        head.appendChild(toggle);
        toggle.addEventListener("click", () => {
          const open = block.classList.toggle("is-open");
          toggle.textContent = open ? "▾" : "▸";
        });
      }
      block.appendChild(head);

      const memWrap = el("div", "ptree-members");
      g.members.forEach((m) => {
        const row = el("label", "ptree-member",
          '<input type="checkbox" data-mem="' + esc(g.key) + "::" + esc(m.name) + '"> ' +
          esc(m.name) + ' <span class="species-latin">' + esc(m.species || "") + "</span>");
        memWrap.appendChild(row);
      });
      block.appendChild(memWrap);
      wrap.appendChild(block);

      // group checkbox => toggle all members
      const gcb = head.querySelector("input[data-grp]");
      gcb.addEventListener("change", () => {
        if (gcb.checked) state.profile.add(grpToken(g.key)); else state.profile.delete(grpToken(g.key));
        memWrap.querySelectorAll("input[data-mem]").forEach((cb) => { cb.checked = gcb.checked; syncMember(cb); });
        persistProfile();
      });
      memWrap.querySelectorAll("input[data-mem]").forEach((cb) =>
        cb.addEventListener("change", () => { syncMember(cb); persistProfile(); }));
    });
    restoreProfile();
  }
  function syncMember(cb) {
    const [gk, name] = cb.dataset.mem.split("::");
    if (cb.checked) state.profile.add(memToken(gk, name)); else state.profile.delete(memToken(gk, name));
  }
  function persistProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(Array.from(state.profile))); } catch (e) {}
    updateProfileBadge();
    renderProfileSummary();
  }
  function updateProfileBadge() {
    const badge = $("#profileBadge");
    if (!badge) return;
    const groups = new Set();
    state.profile.forEach((t) => groups.add(t.split(":")[1]));
    const n = groups.size;
    if (n) { badge.textContent = n + " selected"; badge.classList.remove("is-hidden"); }
    else { badge.classList.add("is-hidden"); }
  }
  function restoreProfile() {
    try {
      (JSON.parse(localStorage.getItem(PROFILE_KEY)) || []).forEach((t) => state.profile.add(t));
    } catch (e) {}
    document.querySelectorAll("#profileTree input[data-grp]").forEach((cb) => { cb.checked = state.profile.has(grpToken(cb.dataset.grp)); });
    document.querySelectorAll("#profileTree input[data-mem]").forEach((cb) => {
      const [gk, name] = cb.dataset.mem.split("::"); cb.checked = state.profile.has(memToken(gk, name));
    });
  }
  function filterProfile(q) {
    q = q.trim().toLowerCase();
    document.querySelectorAll("#profileTree .ptree-group").forEach((block) => {
      if (!q) { block.style.display = ""; block.classList.remove("is-open"); block.querySelectorAll(".ptree-member").forEach((r) => (r.style.display = "")); return; }
      let any = false;
      const gLabel = block.querySelector(".ptree-grouplabel b").textContent.toLowerCase();
      block.querySelectorAll(".ptree-member").forEach((row) => {
        const t = row.textContent.toLowerCase();
        const hit = t.includes(q) || gLabel.includes(q);
        row.style.display = hit ? "" : "none";
        if (hit) any = true;
      });
      if (gLabel.includes(q)) any = true;
      block.style.display = any ? "" : "none";
      if (any) block.classList.add("is-open");
    });
  }

  // =====================================================================
  //  WIRING
  // =====================================================================
  function doAnalyze(fromOcr) {
    const text = $("#textInput").value;
    if (!normalize(text)) { alert("Add some text first — type/paste it, or scan a photo."); return; }
    const result = analyze(text, { fromOcr: !!fromOcr });
    renderResult(result); recordScan(result);
    $("#verdict").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const ONBOARD_KEY = "allergen_onboarded_v1";

  function showOnboarding(editMode) {
    $("#onboardTitle").textContent = editMode ? "Edit your profile" : "Welcome — set up your profile";
    $("#saveProfileBtn").textContent = editMode ? "Save changes" : "Save profile & continue";
    $("#onboarding").classList.remove("is-hidden");
    $("#mainApp").classList.add("is-hidden");
    $("#historyPanel").classList.add("is-hidden");
    window.scrollTo(0, 0);
  }
  function enterApp() {
    if (!validatePerson()) return;
    savePerson();
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (e) {}
    $("#onboarding").classList.add("is-hidden");
    $("#mainApp").classList.remove("is-hidden");
    $("#historyPanel").classList.remove("is-hidden");
    $("#profileBtn").classList.remove("is-hidden");
    renderProfileSummary();
    window.scrollTo(0, 0);
  }
  function renderProfileSummary() {
    const box = $("#profileSummary");
    if (!box) return;
    const groups = new Set();
    state.profile.forEach((t) => groups.add(t.split(":")[1]));
    const who = personLine();
    const whoHtml = who ? '<div class="ps-who">👤 ' + esc(who) + "</div>" : "";
    if (!groups.size) {
      box.className = "profile-summary";
      box.innerHTML = whoHtml +
        '<div><span class="hint">No allergens selected.</span> ' +
        '<button class="link-btn" id="editProfileInline" type="button">' + (who ? "Edit details" : "Set up profile") + "</button></div>";
    } else {
      const labels = Array.from(groups).map((k) => (GROUP_BY_KEY[k] ? GROUP_BY_KEY[k].label : k));
      box.className = "profile-summary is-set";
      box.innerHTML = whoHtml +
        '<div><span class="ps-title">Allergens:</span> ' +
        labels.map((l) => '<span class="ps-chip">' + esc(l) + "</span>").join("") +
        ' <button class="link-btn" id="editProfileInline" type="button">Edit</button></div>';
    }
    const ed = $("#editProfileInline");
    if (ed) ed.addEventListener("click", () => showOnboarding(true));
  }

  function buildDishDatalist() {
    if (document.getElementById("dishList")) return;
    const dl = document.createElement("datalist");
    dl.id = "dishList";
    DB.dishes.forEach((d) => { const o = document.createElement("option"); o.value = d.name; dl.appendChild(o); });
    document.body.appendChild(dl);
  }

  function init() {
    buildProfileTree();
    buildDishDatalist();
    loadPersonIntoForm();
    updateProfileBadge();
    renderHistory();
    $("#aboutMeta").textContent =
      "Database: " + (DB.meta.molecule_records || 0) + " molecule records · " +
      (DB.meta.biomolecules_attached || 0) + " biomolecules · " +
      (DB.meta.groups || 0) + " groups across " +
      GROUPS.reduce((n, g) => n + g.members.length, 0) + " species. Source: " + (DB.meta.sources || "");

    document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll(".seg-btn").forEach((x) => { x.classList.remove("is-active"); x.setAttribute("aria-checked", "false"); });
      b.classList.add("is-active"); b.setAttribute("aria-checked", "true"); state.mode = b.dataset.mode;
    }));
    document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => { x.classList.remove("is-active"); x.setAttribute("aria-selected", "false"); });
      t.classList.add("is-active"); t.setAttribute("aria-selected", "true");
      document.querySelectorAll(".tab-body").forEach((p) => p.classList.toggle("is-hidden", p.dataset.panel !== t.dataset.tab));
    }));

    $("#sampleBtn").addEventListener("click", () => { $("#textInput").value = SAMPLE_TEXT; });
    $("#analyzeBtn").addEventListener("click", () => doAnalyze(state.lastWasOcr));
    $("#profileSearch").addEventListener("input", (e) => filterProfile(e.target.value));

    // onboarding / profile-first flow (name, age, gender are mandatory)
    $("#saveProfileBtn").addEventListener("click", enterApp);
    $("#profileBtn").addEventListener("click", () => showOnboarding(true));
    ["pName", "pAge", "pGender"].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.addEventListener("input", () => { n.classList.remove("invalid"); $("#onboardError").classList.add("is-hidden"); });
    });
    let onboarded = false;
    try { onboarded = localStorage.getItem(ONBOARD_KEY) === "1"; } catch (e) {}
    if (onboarded) enterApp(); else showOnboarding(false);

    $("#imageInput").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      const img = $("#preview"); img.src = URL.createObjectURL(file); img.classList.remove("is-hidden");
      $("#scanActions").classList.remove("is-hidden");
      $("#visionResult").classList.add("is-hidden");
      state.pendingFile = file;
    });
    // AI: identify the food/dish and analyse allergens directly (no label needed)
    $("#visionBtn").addEventListener("click", async () => {
      if (!state.pendingFile) return;
      const btn = $("#visionBtn"); btn.disabled = true; const orig = btn.textContent; btn.textContent = "Identifying…";
      const vres = await runFoodVision(state.pendingFile);
      btn.disabled = false; btn.textContent = orig;
      renderVisionResult(vres);
      if (vres && vres.hints && vres.hints.length) {
        const result = analyze("", { source: "vision", foodHints: vres.hints });
        renderResult(result); recordScan(result);
        $("#verdict").scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else if (vres && vres.predictions && vres.predictions.length) {
        // recognised something but not a known food — let user confirm by typing
        document.querySelector('.tab[data-tab="type"]').click();
        $("#textInput").value = vres.predictions[0].className.split(",")[0];
      }
    });
    $("#ocrBtn").addEventListener("click", async () => {
      if (!state.pendingFile) return;
      $("#ocrBtn").disabled = true;
      const text = await runOcr(state.pendingFile);
      $("#ocrBtn").disabled = false;
      if (text) { document.querySelector('.tab[data-tab="type"]').click(); $("#textInput").value = text; state.lastWasOcr = true; }
    });
    $("#textInput").addEventListener("input", () => { state.lastWasOcr = false; });

    $("#exportCsvBtn").addEventListener("click", exportCsv);
    $("#exportPdfBtn").addEventListener("click", exportPdf);
    $("#clearHistoryBtn").addEventListener("click", () => { if (confirm("Clear all scan history? This cannot be undone.")) { saveHistory([]); renderHistory(); } });
    $("#optBigText").addEventListener("change", (e) => document.body.classList.toggle("big-text", e.target.checked));
    $("#aboutBtn").addEventListener("click", () => $("#aboutModal").showModal());

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
