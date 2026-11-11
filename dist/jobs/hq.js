/* Pezza Media Jobs HQ.
   The job data is AES-GCM encrypted (key from the password via PBKDF2-SHA256).
   Nothing private is in this file; it only decrypts data.enc.json in the browser. */
(function () {
  "use strict";
  var DATA_URL = "data.enc.json";
  var PW_KEY = "hq-pw";
  var STATE_KEY = "hq-state-v1";

  function store(kind) { try { return kind === "s" ? window.sessionStorage : window.localStorage; } catch (e) { return null; } }
  function get(kind, k) { try { var s = store(kind); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(kind, k, v) { try { var s = store(kind); if (s) s.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }

  function b64(s) { var bin = atob(s), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }

  async function decrypt(pw) {
    var res = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load the data file.");
    var box = await res.json();
    var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
    var key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(box.salt), iterations: box.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, key, b64(box.ct));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }
  var state = { jobs: {}, leads: {} };
  function loadState() { try { var s = JSON.parse(get("l", STATE_KEY) || "{}"); state.jobs = s.jobs || {}; state.leads = s.leads || {}; } catch (e) {}
    D.jobs.forEach(function (j) { if (j.done && !state.jobs[j.id]) state.jobs[j.id] = { s: j.done, t: 0, auto: 1 }; }); }
  function saveState() { set("l", STATE_KEY, JSON.stringify(state)); }
  function toast(msg) { var t = document.querySelector(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("on"); }, 1600); }
  function copy(text) {
    var done = function () { toast("Copied"); };
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() { var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copy failed"); } ta.remove(); }
  }

  var D, channelById = {}, jobFilter = "all", jobIndex = 0, showDone = false, tab = "cold";

  function chan(id) { return channelById[id] || { name: id, color: "#999" }; }
  function tag(id) { var c = chan(id); return '<span class="pill" style="color:' + esc(c.color) + '">' + esc(c.short || c.name) + "</span>"; }

  // ---------- render ----------
  function render() {
    var app = document.getElementById("app");
    app.innerHTML =
      '<div class="wrap">' +
      '<div class="top"><a class="brand" href="../"><img src="../assets/flower.png" alt=""><span class="eyebrow">Pezza Media · Jobs HQ</span></a>' +
      '<button class="btn ghost small" id="logout">Lock</button></div>' +
      '<header class="hero"><h1>' + esc(D.goal) + '</h1><p class="sub">Updated ' + esc(D.updated) + '</p></header>' +
      '<div class="tiles" id="tiles"></div>' +
      '<section><h2>Today</h2><div class="today">' + (D.today || []).map(function (t) {
        return '<div class="todo' + (t.hot ? " hot" : "") + '"><div>' + tag(t.channel) + '</div><div><h3>' + (t.link ? '<a href="' + esc(t.link) + '" target="_blank" rel="noopener">' + esc(t.title) + "</a>" : esc(t.title)) + "</h3><p>" + linkify(t.detail || "") + "</p></div></div>";
      }).join("") + "</div></section>" +
      '<section id="jobs"><div class="viewer-head"><h2 style="margin:0">Jobs, one at a time</h2><div class="filters" id="filters"></div></div><div id="viewer"></div></section>' +
      '<section><h2>Platforms</h2><div class="grid">' + D.channels.map(platCard).join("") + "</div></section>" +
      '<section><h2>Applications per week</h2><div class="card">' + chart() + "</div></section>" +
      '<section><div class="tabs" id="tabs"></div><div class="card" id="tabbody"></div></section>' +
      '<div class="foot"><span>Updated every morning. Your Applied and Skip clicks are saved in this browser.</span><button class="linkbtn" id="reset">Reset my clicks</button></div>' +
      "</div>";
    document.getElementById("logout").onclick = function () { del(PW_KEY); location.reload(); };
    document.getElementById("reset").onclick = function () { if (confirm("Clear your Applied/Skip clicks on this device?")) { state = { jobs: {}, leads: {} }; saveState(); render(); } };
    renderTiles(); renderFilters(); renderViewer(); renderTabs();
  }

  function weekStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); var day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x; }

  function renderTiles() {
    var open = D.jobs.filter(function (j) { return !state.jobs[j.id]; }).length;
    var ws = weekStart(new Date()).getTime();
    var appliedLocal = Object.keys(state.jobs).filter(function (k) { var v = state.jobs[k]; return v && v.s === "applied" && v.t >= ws; }).length;
    var applied = Math.max(appliedLocal, D.stats.applied_week || 0);
    var leadsOpen = (D.leads || []).filter(function (l) { return !state.leads[l.id]; }).length;
    var tiles = [[open, "Jobs waiting for you"], [applied, "Applied this week"], [D.stats.conversations || 0, "Open conversations"], [leadsOpen, "Outreach ready to send"]];
    document.getElementById("tiles").innerHTML = tiles.map(function (t) { return '<div class="tile"><b>' + esc(t[0]) + "</b><span>" + esc(t[1]) + "</span></div>"; }).join("");
  }

  function renderFilters() {
    var ids = ["all"]; D.jobs.forEach(function (j) { if (ids.indexOf(j.channel) < 0) ids.push(j.channel); });
    var el = document.getElementById("filters");
    el.innerHTML = ids.map(function (id) { return '<button class="chip" data-f="' + esc(id) + '" aria-pressed="' + (jobFilter === id) + '">' + esc(id === "all" ? "All" : chan(id).short || chan(id).name) + "</button>"; }).join("") +
      '<button class="chip" data-done="1" aria-pressed="' + showDone + '">Show done</button>';
    el.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.done) showDone = !showDone; else jobFilter = b.dataset.f;
      jobIndex = 0; renderFilters(); renderViewer();
    };
  }

  function queue() {
    return D.jobs.filter(function (j) { return (jobFilter === "all" || j.channel === jobFilter) && (showDone || !state.jobs[j.id]); });
  }

  function renderViewer() {
    var q = queue(), el = document.getElementById("viewer");
    if (!q.length) { el.innerHTML = '<div class="job empty"><p>Nothing waiting here. New jobs land every morning.</p></div>'; renderTiles(); return; }
    if (jobIndex >= q.length) jobIndex = q.length - 1;
    var j = q[jobIndex], st = state.jobs[j.id];
    var facts = (j.facts || []).map(function (f) { return '<div class="fact"><small>' + esc(f[0]) + "</small>" + esc(f[1]) + "</div>"; }).join("");
    el.innerHTML = '<article class="job">' +
      '<div class="job-meta">' + tag(j.channel) + "<span>" + esc(j.client || "") + "</span>" + (j.posted ? "<span>Posted " + esc(j.posted) + "</span>" : "") +
      (st ? '<span class="status-' + esc(st.s) + '">● ' + esc(st.s) + "</span>" : "") + "</div>" +
      '<h3><a href="' + esc(j.link) + '" target="_blank" rel="noopener">' + esc(j.title) + "</a></h3>" +
      (facts ? '<div class="facts">' + facts + "</div>" : "") +
      '<p class="why"><b>Why it fits:</b> ' + linkify(j.why || "") + "</p>" +
      (j.flags && j.flags.length ? '<ul class="flags">' + j.flags.map(function (f) { return "<li>" + linkify(f) + "</li>"; }).join("") + "</ul>" : "") +
      (j.letter ? '<div class="letter" id="letter">' + linkify(j.letter) + "</div>" : '<p class="why" style="color:var(--muted)">No letter drafted yet. Tell me in the project chat and I\'ll write it.</p>') +
      '<div class="actions">' +
      '<a class="btn navy" href="' + esc(j.link) + '" target="_blank" rel="noopener">Open job ↗</a>' +
      (j.letter ? '<button class="btn ghost" data-a="copy">Copy letter</button>' : "") +
      '<button class="btn" data-a="applied">Applied ✓</button>' +
      '<button class="btn ghost" data-a="skipped">Skip</button>' +
      '<span class="counter">' + (jobIndex + 1) + " of " + q.length + "</span>" +
      '<button class="btn ghost small" data-a="prev" ' + (jobIndex ? "" : "disabled") + '>←</button>' +
      '<button class="btn ghost small" data-a="next" ' + (jobIndex < q.length - 1 ? "" : "disabled") + '>→</button>' +
      "</div></article>";
    el.querySelector(".actions").onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      var a = b.dataset.a;
      if (a === "copy") return copy(j.letter);
      if (a === "prev") { jobIndex--; return renderViewer(); }
      if (a === "next") { jobIndex++; return renderViewer(); }
      if (a === "applied" || a === "skipped") {
        state.jobs[j.id] = { s: a, t: Date.now() }; saveState();
        toast(a === "applied" ? "Marked as applied" : "Skipped");
        if (showDone) jobIndex++;
        renderViewer();
      }
    };
    renderTiles();
  }

  function platCard(c) {
    var stLabel = { live: "Live", setup: "Set up next", todo: "Later" }[c.status] || c.status;
    return '<div class="card plat"><div class="plat-head"><h3><span class="dot" style="background:' + esc(c.color) + '"></span>' + esc(c.name) + '</h3><span class="pill st-' + esc(c.status) + '">' + esc(stLabel) + "</span></div>" +
      "<p>" + linkify(c.about || "") + "</p>" +
      (c.stats && c.stats.length ? '<div class="kv">' + c.stats.map(function (s) { return "<span>" + esc(s[0]) + "</span><span>" + esc(s[1]) + "</span>"; }).join("") + "</div>" : "") +
      (c.setup && c.setup.length ? "<details><summary>" + (c.status === "live" ? "Profile tips" : "How to set it up") + "</summary><ol>" + c.setup.map(function (s) { return "<li>" + linkify(s) + "</li>"; }).join("") + "</ol></details>" : "") +
      (c.url ? '<a class="btn ghost small" style="align-self:flex-start;margin-top:auto" href="' + esc(c.url) + '" target="_blank" rel="noopener">Open ' + esc(c.short || c.name) + " ↗</a>" : "") +
      "</div>";
  }

  function chart() {
    var w = D.weeks || []; if (!w.length) return '<p class="empty">No data yet.</p>';
    var keys = D.week_series || [];
    var max = 1; w.forEach(function (r) { var s = 0; keys.forEach(function (k) { s += r[k.id] || 0; }); if (s > max) max = s; });
    var W = Math.max(560, w.length * 70), H = 220, pad = 28, bw = Math.min(44, (W - pad) / w.length - 16);
    var bars = w.map(function (r, i) {
      var x = pad + i * ((W - pad) / w.length) + 8, y = H - 30, out = "";
      keys.forEach(function (k) { var v = r[k.id] || 0; if (!v) return; var h = v / max * (H - 60); y -= h; out += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="4" fill="' + k.color + '"><title>' + esc(k.name) + ": " + v + "</title></rect>"; });
      var total = keys.reduce(function (s, k) { return s + (r[k.id] || 0); }, 0);
      if (total) out += '<text x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle" font-size="14" fill="#141B41">' + total + "</text>";
      return out + '<text x="' + (x + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="14" fill="#5B6080">' + esc(r.label) + "</text>";
    }).join("");
    var legend = '<div class="legend">' + keys.map(function (k) { return '<span><span class="dot" style="background:' + k.color + '"></span>' + esc(k.name) + "</span>"; }).join("") + "</div>";
    return legend + '<div class="chart-wrap"><svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H + '" role="img" aria-label="Applications per week"><line x1="' + pad + '" x2="' + W + '" y1="' + (H - 30) + '" y2="' + (H - 30) + '" stroke="rgba(20,27,65,.2)"/>' + bars + "</svg></div>";
  }

  function renderTabs() {
    var tabs = [["cold", "Cold emails"], ["hiring", "Hiring leads"], ["ideas", "More income ideas"]];
    var el = document.getElementById("tabs");
    el.innerHTML = tabs.map(function (t) { return '<button class="chip" data-t="' + t[0] + '" aria-pressed="' + (tab === t[0]) + '">' + t[1] + "</button>"; }).join("");
    el.onclick = function (e) { var b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; renderTabs(); };
    var body = document.getElementById("tabbody");
    if (tab === "ideas") {
      body.innerHTML = (D.ideas || []).map(function (i) { return '<div class="idea"><h3>' + esc(i.title) + "</h3><p>" + linkify(i.detail) + "</p></div>"; }).join("") || '<p class="empty">Coming soon.</p>';
      return;
    }
    var list = (D.leads || []).filter(function (l) { return l.type === tab; });
    if (!list.length) { body.innerHTML = '<p class="empty">' + esc((D.empty_notes || {})[tab] || "The first batch lands soon.") + "</p>"; return; }
    body.innerHTML = list.map(function (l) {
      var sent = state.leads[l.id];
      return '<div class="lead"><div><h3><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.brand) + '</a></h3><div class="niche">' + esc(l.niche || "") + "</div></div>" +
        "<div>" + (l.why ? "<p><b>Why them:</b> " + linkify(l.why) + "</p>" : "") + (l.angle ? "<p><b>The angle:</b> " + linkify(l.angle) + "</p>" : "") +
        (l.draft ? '<div class="letter">' + linkify(l.draft) + "</div>" : "") +
        '<div class="actions">' + (l.draft ? '<button class="btn small" data-copy="' + esc(l.id) + '">Copy message</button>' : "") +
        '<button class="btn ghost small" data-sent="' + esc(l.id) + '">' + (sent ? "Sent ✓" : "Mark as sent") + "</button></div></div>" +
        '<div class="contact">' + linkify(l.contact || "Contact not found yet") + "</div></div>";
    }).join("");
    body.onclick = function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.dataset.copy) { var l = list.filter(function (x) { return x.id === b.dataset.copy; })[0]; if (l) copy(l.draft); }
      if (b.dataset.sent) { var id = b.dataset.sent; if (state.leads[id]) delete state.leads[id]; else state.leads[id] = { t: Date.now() }; saveState(); renderTabs(); renderTiles(); }
    };
  }

  // ---------- boot ----------
  async function open(pw, remember) {
    var msg = document.getElementById("lock-msg");
    msg.textContent = "Opening…";
    try {
      D = await decrypt(pw);
    } catch (e) {
      msg.textContent = e && e.name === "OperationError" ? "Wrong password." : (e.message || "Something went wrong.");
      del(PW_KEY);
      return;
    }
    set(remember ? "l" : "s", PW_KEY, pw);
    D.channels.forEach(function (c) { channelById[c.id] = c; });
    loadState();
    document.getElementById("lock").hidden = true;
    var app = document.getElementById("app"); app.hidden = false;
    render();
  }

  document.getElementById("lock-form").addEventListener("submit", function (e) {
    e.preventDefault();
    open(document.getElementById("pw").value, document.getElementById("remember").checked);
  });
  var saved = get("l", PW_KEY) || get("s", PW_KEY);
  if (saved) open(saved, !!get("l", PW_KEY));
})();
