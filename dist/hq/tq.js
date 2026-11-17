// Tasks HQ page. Talks to the Worker at window.TQ_API with the password in X-Key.
(() => {
  const API = (window.TQ_API || "").replace(/\/+$/, "");
  const $ = (s) => document.querySelector(s);
  const KEY_STORE = "tq-key";
  let key = sessionStorage.getItem(KEY_STORE) || "";
  let board = null, openId = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = (msg) => { const t = $("#tq-toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600); };

  async function api(path, opts = {}) {
    const r = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", "X-Key": key, ...(opts.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || "Something went wrong"); e.status = r.status; throw e; }
    return data;
  }

  // ----- Jobs HQ (pezzamedia.com/jobs) folded in: same password unlocks its encrypted data -----
  let jobs = null; // { open, hot, today: [...] } or null if it can't be read
  const b64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  async function loadJobs() {
    try {
      const box = await (await fetch("../jobs/data.enc.json?t=" + Date.now(), { cache: "no-store" })).json();
      const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), "PBKDF2", false, ["deriveKey"]);
      const k = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: b64(box.salt), iterations: box.iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const D = JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(box.iv) }, k, b64(box.ct))));
      let local = {}; try { local = JSON.parse(localStorage.getItem("hq-state-v2") || "{}"); } catch (e) {}
      const doneJ = (id) => (local.jobs || {})[id] || D.jobs.find((j) => j.id === id)?.done;
      const doneL = (id) => (local.leads || {})[id];
      const today = (D.today || []).filter((t) => !(t.job && doneJ(t.job)) && !(t.lead && doneL(t.lead)));
      jobs = { open: today.length, hot: today.some((t) => t.hot) };
      try { sessionStorage.setItem("hq-pw", key); } catch (e) {} // so Jobs HQ opens without asking for the password again
    } catch (e) { jobs = null; }
  }

  // ----- dates (always her local time, from the device clock) -----
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - today0()) / 86400000);

  // ----- counting: what's open, what's hot -----
  function stats(pid) {
    const pr = board.projects.find((x) => x.id === pid);
    if (pr?.special === "jobs") return { open: jobs ? jobs.open : 0, hot: !!jobs?.hot, label: "to do" };
    const items = (board.tasks || []).filter((t) => t.project === pid && !t.done);
    let open = 0, hot = false;
    for (const t of items) {
      if (t.kind === "waiting") {
        const age = -daysUntil(t.asked || t.created?.slice(0, 10));
        if (age >= 5) { open++; hot = true; }
        continue;
      }
      if (t.due) {
        const d = daysUntil(t.due);
        if (d > 7) continue; // "Later": not counted yet
        if (d <= 2) hot = true;
      }
      open++;
    }
    return { open, hot };
  }

  function cardHTML(p, s) {
    const logo = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)} logo">` : `<span class="tq-icon" aria-hidden="true">${esc(p.icon || "•")}</span>`;
    return `
      <div class="tq-card${openId === p.id ? " is-open" : ""}" data-id="${esc(p.id)}" style="--tq-tint:${esc(p.color)}" role="button" tabindex="0" aria-expanded="${openId === p.id}">
        <span class="tq-strip"></span>
        ${p.dashboard ? `<a class="tq-pill" href="${esc(p.dashboard)}">📊 Dashboard ↗</a>` : ""}
        <span class="tq-logo">${logo}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tq-blurb">${esc(p.blurb || "")}</p>
        ${s.open ? `<span class="tq-count${s.hot ? " is-hot" : ""}"><b>${s.open}</b> ${s.label || "open"}</span>` : `<span class="tq-clear">All clear</span>`}
      </div>`;
  }

  function renderCards() {
    for (const group of ["work", "personal"]) {
      const wrap = $("#tq-cards-" + group);
      const list = board.projects.filter((p) => (p.group || "work") === group)
        .map((p) => ({ p, s: stats(p.id) }))
        .sort((a, b) => (b.s.hot - a.s.hot) || (b.s.open - a.s.open) || ((a.p.order ?? 99) - (b.p.order ?? 99)));
      wrap.innerHTML = list.map(({ p, s }) => cardHTML(p, s)).join("");
      wrap.querySelectorAll(".tq-pill").forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
      wrap.querySelectorAll(".tq-card").forEach((c) => {
        const p = board.projects.find((x) => x.id === c.dataset.id);
        const go = () => (p.special === "jobs" ? (location.href = p.dashboard) : togglePanel(p.id));
        c.addEventListener("click", go);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    }
  }

  function togglePanel(id) {
    openId = openId === id ? null : id;
    renderCards();
    renderPanel();
    if (openId && window.innerWidth > 640) $("#tq-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderPanel() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    const p = board.projects.find((x) => x.id === openId);
    panel.hidden = scrim.hidden = !p;
    if (!p) return;
    panel.style.setProperty("--tq-tint", p.color);
    panel.innerHTML = `
      <div class="tq-panel-head">
        ${p.logo ? `<img src="${esc(p.logo)}" alt="">` : `<span class="tq-icon tq-icon-sm" aria-hidden="true">${esc(p.icon || "")}</span>`}
        <h2>${esc(p.name)}</h2>
        <button class="tq-x" type="button" aria-label="Close">✕</button>
      </div>
      <div class="tq-sec tq-sec-remember"><h3>📌 Always remember</h3><p>No standing rules yet.</p></div>
      <div class="tq-sec tq-sec-suggest"><h3>Suggested by Claude</h3><p>Nothing suggested yet.</p></div>
      <div class="tq-sec"><h3>Tasks</h3><p>No tasks yet. Adding tasks comes in the next stage.</p></div>
      <div class="tq-sec"><h3>Waiting on others</h3><p>Nobody to chase.</p></div>
      <div class="tq-sec"><h3>Later</h3><p>Nothing more than 7 days out.</p></div>`;
    panel.querySelector(".tq-x").addEventListener("click", () => togglePanel(openId));
  }

  function render() {
    $("#tq-today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const u = board.updated ? new Date(board.updated) : null;
    $("#tq-updated").textContent = u ? "Last saved " + u.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    renderCards();
    renderPanel();
  }

  async function load() {
    const [b] = await Promise.all([api("/api/board"), loadJobs()]);
    board = b;
    render();
  }

  function showApp() { $("#tq-lock").hidden = true; $("#tq-app").hidden = false; }
  function showLock(msg) {
    $("#tq-app").hidden = true; $("#tq-lock").hidden = false;
    $("#tq-lock-msg").textContent = msg || "";
    setTimeout(() => $("#tq-pw").focus(), 50);
  }

  $("#tq-lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!API) return showLock("Not connected to Cloudflare yet.");
    key = $("#tq-pw").value;
    try {
      await load();
      sessionStorage.setItem(KEY_STORE, key);
      showApp();
    } catch (err) {
      key = "";
      const card = $(".tq-lock-card"); card.classList.remove("tq-shake"); void card.offsetWidth; card.classList.add("tq-shake");
      $("#tq-lock-msg").textContent = err.status === 401 ? "That's not it. Try again." : err.message;
    }
  });

  $("#tq-sync").addEventListener("click", async () => {
    try { await load(); toast("Up to date"); } catch (e) { toast(e.message); }
  });
  $("#tq-scrim").addEventListener("click", () => togglePanel(openId));
  $("#tq-signout").addEventListener("click", (e) => { e.preventDefault(); sessionStorage.removeItem(KEY_STORE); key = ""; showLock(); });
  $("#tq-export").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = "tasks-hq-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
    } catch (err) { toast(err.message); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openId) togglePanel(openId); });

  if (!API) showLock("Not connected to Cloudflare yet.");
  else if (key) load().then(showApp).catch(() => { sessionStorage.removeItem(KEY_STORE); key = ""; showLock(); });
  else showLock();
})();
