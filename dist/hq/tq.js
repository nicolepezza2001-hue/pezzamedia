// Tasks HQ page. Talks to the Worker at window.TQ_API with the password in X-Key.
// No browser pop-ups anywhere: deletes are tap-twice, undo comes as a toast.
(() => {
  const API = (window.TQ_API || "").replace(/\/+$/, "");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const KEY_STORE = "tq-key";
  let key = sessionStorage.getItem(KEY_STORE) || "";
  let board = null, openId = null, editing = null, addKind = "task";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ----- toast with optional action (Undo) -----
  function toast(msg, action, fn) {
    const t = $("#tq-toast");
    t.innerHTML = esc(msg) + (action ? ` <button type="button" class="tq-toast-btn">${esc(action)}</button>` : "");
    t.hidden = false;
    if (action) $(".tq-toast-btn", t).onclick = () => { t.hidden = true; fn(); };
    clearTimeout(t._h);
    t._h = setTimeout(() => (t.hidden = true), action ? 6000 : 2600);
  }

  async function api(path, opts = {}) {
    const r = await fetch(API + path, { ...opts, headers: { "Content-Type": "application/json", "X-Key": key, ...(opts.headers || {}) } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || "Something went wrong"); e.status = r.status; throw e; }
    return data;
  }
  // Every change sends her local date and gets the whole board back.
  async function change(path, method, body = {}) {
    try {
      const b = await api(path, { method, body: JSON.stringify({ ...body, today: todayISO() }) });
      board = b;
      render();
      return b;
    } catch (e) { toast(e.message); throw e; }
  }

  // ----- dates (always her local time, from the device clock) -----
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoOf(new Date());
  const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - today0()) / 86400000);
  const shortDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  function dueLabel(iso) {
    const n = daysUntil(iso);
    if (n < -1) return { text: `${-n} days late`, cls: "is-late" };
    if (n === -1) return { text: "Yesterday", cls: "is-late" };
    if (n === 0) return { text: "Today", cls: "is-soon" };
    if (n === 1) return { text: "Tomorrow", cls: "is-soon" };
    if (n === 2) return { text: shortDate(iso), cls: "is-soon" };
    return { text: shortDate(iso), cls: "" };
  }
  const ago = (iso) => { const n = -daysUntil(iso); return n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`; };

  // ----- Jobs HQ (pezzamedia.com/jobs) sits under this HQ: same password unlocks its encrypted data -----
  let jobs = null;
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
      try { sessionStorage.setItem("hq-pw", key); } catch (e) {} // so Jobs HQ opens without asking again
    } catch (e) { jobs = null; }
  }

  // ----- sorting a card's items into its sections -----
  const CHASE_DAYS = 5, LATER_DAYS = 7;
  function sections(pid) {
    const items = (board.tasks || []).filter((t) => t.project === pid);
    const s = { tasks: [], waiting: [], later: [], done: [] };
    for (const t of items) {
      if (t.done) { if (t.doneDay && -daysUntil(t.doneDay) <= 14) s.done.push(t); continue; }
      if (t.kind === "waiting") {
        const age = -daysUntil(t.asked || t.created.slice(0, 10));
        (age >= CHASE_DAYS ? s.tasks : s.waiting).push({ ...t, chase: age >= CHASE_DAYS });
        continue;
      }
      if (t.due && daysUntil(t.due) > LATER_DAYS) s.later.push(t); else s.tasks.push(t);
    }
    const key = (t) => (t.chase ? todayISO() : t.due || "9999");
    s.tasks.sort((a, b) => key(a).localeCompare(key(b)));
    s.waiting.sort((a, b) => (a.asked || "").localeCompare(b.asked || ""));
    s.later.sort((a, b) => a.due.localeCompare(b.due));
    s.done.sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
    return s;
  }

  function stats(pid) {
    const pr = board.projects.find((x) => x.id === pid);
    if (pr?.special === "jobs") return { open: jobs ? jobs.open : 0, hot: !!jobs?.hot, label: "to do" };
    const s = sections(pid);
    const hot = s.tasks.some((t) => t.chase || (t.due && daysUntil(t.due) <= 2));
    return { open: s.tasks.length, hot, sug: (board.suggestions || []).filter((x) => x.project === pid).length };
  }

  // ----- cards -----
  function cardHTML(p, s) {
    const logo = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)} logo">` : `<span class="tq-icon" aria-hidden="true">${esc(p.icon || "•")}</span>`;
    const ext = /^https?:/.test(p.dashboard || "") ? ' target="_blank" rel="noopener"' : "";
    return `
      <div class="tq-card${openId === p.id ? " is-open" : ""}" data-id="${esc(p.id)}" style="--tq-tint:${esc(p.color)}" role="button" tabindex="0" aria-expanded="${openId === p.id}">
        <span class="tq-strip"></span>
        ${p.dashboard ? `<a class="tq-pill" href="${esc(p.dashboard)}"${ext}>📊 Dashboard ↗</a>` : ""}
        <span class="tq-logo">${logo}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tq-blurb">${esc(p.blurb || "")}</p>
        ${s.sug ? `<span class="tq-sug-chip">✨ ${s.sug} suggested</span>` : ""}
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
      $$(".tq-pill", wrap).forEach((a) => a.addEventListener("click", (e) => e.stopPropagation()));
      $$(".tq-card", wrap).forEach((c) => {
        const p = board.projects.find((x) => x.id === c.dataset.id);
        const go = () => (p.special === "jobs" ? (location.href = p.dashboard) : togglePanel(p.id));
        c.addEventListener("click", go);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
      });
    }
  }

  function togglePanel(id) {
    openId = openId === id ? null : id;
    editing = null;
    renderCards();
    renderPanel();
    if (openId && window.innerWidth > 640) $("#tq-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ----- Start ▶: opens a new Claude Code session already filled in (not sent) -----
  function startHref(item, isSuggestion) {
    const p = board.projects.find((x) => x.id === item.project);
    const rules = board.notes.filter((n) => n.project === item.project).map((n) => "- " + n.text).join("\n");
    const lines = [
      `Help me with this ${p ? p.name + " " : ""}task from my Tasks HQ: ${item.kind === "waiting" ? `chase ${item.who || "them"} about: ` : ""}${item.text}`,
      item.due ? `Due: ${item.due}` : "", item.detail ? `Detail: ${item.detail}` : "", item.link ? `Link: ${item.link}` : "",
      item.source ? `Where it came from: ${item.source}` : "", rules ? `Standing rules for this card:\n${rules}` : "",
      isSuggestion
        ? `(This is still a suggestion, id ${item.id}.)`
        : `When it's fully done, tick it off: POST ${API}/api/tasks/${item.id}/done with header "X-Key: <my HQ password>" and body {"done":true}. Ask me for the password if you don't have it. Task id: ${item.id}.`,
    ].filter(Boolean).join("\n");
    const folder = board.settings?.claudeFolder;
    return "claude://code/new?q=" + encodeURIComponent(lines) + (folder ? "&folder=" + encodeURIComponent(folder) : "");
  }

  // ----- the yellow tray -----
  function suggestionHTML(sg) {
    const bits = [];
    if (sg.kind === "waiting") bits.push(`Waiting on ${esc(sg.who || "someone")}`);
    if (sg.due) { const d = dueLabel(sg.due); bits.push(`<span class="tq-due ${d.cls}">${esc(d.text)}</span>`); }
    if (sg.kind === "repeat") bits.push(`🔁 ${esc(sg.repeat)}`);
    if (sg.source) bits.push(`from ${esc(sg.source)}`);
    if (sg.link) bits.push(`<a href="${esc(sg.link)}" target="_blank" rel="noopener">Open ↗</a>`);
    const thread = (sg.comments || []).map((c) => `<li><p class="tq-c-me">💬 ${esc(c.text)}</p>${c.reply ? `<p class="tq-c-claude">✨ ${esc(c.reply)}</p>` : c.pending ? `<p class="tq-c-claude">✨ Working on it…</p>` : ""}</li>`).join("");
    return `<li class="tq-sug" data-sid="${esc(sg.id)}">
      <p class="tq-row-text">${sg.kind === "waiting" ? `<b>${esc(sg.who || "Someone")}</b>: ` : ""}${esc(sg.text)}</p>
      ${sg.why ? `<p class="tq-sug-why">${esc(sg.why)}</p>` : ""}
      ${bits.length ? `<p class="tq-row-meta">${bits.join(" · ")}</p>` : ""}
      ${sg.detail ? `<details class="tq-row-detail"><summary>Details</summary><p>${esc(sg.detail)}</p></details>` : ""}
      ${thread ? `<ul class="tq-thread">${thread}</ul>` : ""}
      <div class="tq-sug-btns">
        <button type="button" class="tq-btn tq-btn-tint tq-btn-sm" data-act="sadd">Add</button>
        <button type="button" class="tq-mini" data-act="sdismiss">Dismiss</button>
        <a class="tq-mini tq-start" href="${esc(startHref(sg, true))}">Start ▶</a>
        <button type="button" class="tq-mini" data-act="scomment">💬 Comment</button>
      </div>
      <form class="tq-c-form" hidden>
        <textarea class="tq-input" name="text" rows="2" placeholder="What's wrong? e.g. this belongs under Tmrw, due next Friday, it's a waiting-on"></textarea>
        <div class="tq-form-btns"><button class="tq-btn tq-btn-tint tq-btn-sm" type="submit">Send</button><button class="tq-mini" type="button" data-act="ccancel">Cancel</button></div>
      </form>
    </li>`;
  }

  // ----- one task row -----
  function rowHTML(t) {
    if (editing === t.id) return formHTML(t);
    const bits = [];
    if (t.kind === "waiting") bits.push(`Asked ${ago(t.asked)}`);
    else if (t.due) { const d = dueLabel(t.due); bits.push(`<span class="tq-due ${d.cls}">${esc(d.text)}</span>`); }
    if (t.kind === "repeat") bits.push(`🔁 ${esc(t.repeat)}`);
    if (t.source) bits.push(`from ${esc(t.source)}`);
    if (t.link) bits.push(`<a href="${esc(t.link)}" target="_blank" rel="noopener">Open ↗</a>`);
    const title = t.kind === "waiting"
      ? (t.chase ? `Chase ${esc(t.who || "them")}: ${esc(t.text)}` : `<b>${esc(t.who || "Someone")}</b>: ${esc(t.text)}`)
      : esc(t.text);
    return `
      <li class="tq-row${t.done ? " is-done" : ""}${t.chase ? " is-chase" : ""}" data-id="${esc(t.id)}">
        <label class="tq-tick"><input type="checkbox" data-act="tick" ${t.done ? "checked" : ""} aria-label="${t.done ? "Put back on the list" : "Mark done"}"><span></span></label>
        <div class="tq-row-main">
          <p class="tq-row-text">${title}</p>
          ${bits.length ? `<p class="tq-row-meta">${bits.join(" · ")}</p>` : ""}
          ${t.detail ? `<details class="tq-row-detail"><summary>Details</summary><p>${esc(t.detail)}</p></details>` : ""}
        </div>
        <div class="tq-row-btns">
          ${t.kind === "waiting" && !t.done ? `<button type="button" class="tq-mini" data-act="chased" title="I chased them today">🔔 Chased</button>` : ""}
          ${t.done ? "" : `<a class="tq-mini tq-start" href="${esc(startHref(t))}" title="Open a new Claude Code session filled in with this task">Start ▶</a>`}
          ${t.done ? "" : `<button type="button" class="tq-mini" data-act="edit">Edit</button>`}
          <button type="button" class="tq-mini tq-del" data-act="del" aria-label="Delete">🗑</button>
        </div>
      </li>`;
  }

  // ----- add / edit form (same form for both) -----
  function formHTML(t) {
    const kind = t ? t.kind : addKind;
    const k = (v) => (kind === v ? " is-on" : "");
    return `
      <li class="tq-form-wrap"><form class="tq-form" data-id="${t ? esc(t.id) : ""}">
        <div class="tq-seg" role="group" aria-label="Kind">
          <button type="button" class="tq-seg-btn${k("task")}" data-kind="task">Task</button>
          <button type="button" class="tq-seg-btn${k("waiting")}" data-kind="waiting">Waiting on</button>
          <button type="button" class="tq-seg-btn${k("repeat")}" data-kind="repeat">Repeating</button>
        </div>
        <input class="tq-input" name="text" maxlength="200" placeholder="${kind === "waiting" ? "What you asked for" : "Start with a verb, e.g. Send the Tmrw Lab draft"}" value="${esc(t?.text || "")}" required>
        <div class="tq-form-row">
          <label data-show="waiting"${kind === "waiting" ? "" : " hidden"}>Who<input class="tq-input" name="who" placeholder="First name" value="${esc(t?.who || "")}"></label>
          <label data-show="waiting"${kind === "waiting" ? "" : " hidden"}>Asked on<input class="tq-input" type="date" name="asked" value="${esc(t?.asked || todayISO())}"></label>
          <label data-show="task repeat"${kind === "waiting" ? " hidden" : ""}>Due <small>(only if there's a real date)</small><input class="tq-input" type="date" name="due" value="${esc(t?.due || "")}"></label>
          <label data-show="repeat"${kind === "repeat" ? "" : " hidden"}>Repeats<select class="tq-input" name="repeat">
            ${["weekly", "monthly", "quarterly", "yearly"].map((r) => `<option${(t?.repeat || "monthly") === r ? " selected" : ""}>${r}</option>`).join("")}
          </select></label>
        </div>
        <details class="tq-more"${t && (t.detail || t.link || t.source) ? " open" : ""}><summary>More (detail, link, where it came from)</summary>
          <textarea class="tq-input" name="detail" rows="3" placeholder="Detail">${esc(t?.detail || "")}</textarea>
          <input class="tq-input" name="link" placeholder="Link (https://…)" value="${esc(t?.link || "")}">
          <input class="tq-input" name="source" placeholder="Where it came from, e.g. Slack from Anthony" value="${esc(t?.source || "")}">
        </details>
        <div class="tq-form-btns">
          <button class="tq-btn tq-btn-tint" type="submit">${t ? "Save" : "Add"}</button>
          ${t ? `<button class="tq-btn tq-btn-soft" type="button" data-act="cancel">Cancel</button>` : ""}
        </div>
      </form></li>`;
  }

  function noteHTML(n) {
    if (editing === "n:" + n.id) {
      return `<li><form class="tq-note-form" data-id="${esc(n.id)}">
        <input class="tq-input" name="text" maxlength="200" value="${esc(n.text)}" required>
        <textarea class="tq-input" name="detail" rows="2" placeholder="Detail (optional)">${esc(n.detail || "")}</textarea>
        <div class="tq-form-btns"><button class="tq-btn tq-btn-tint" type="submit">Save</button><button class="tq-btn tq-btn-soft" type="button" data-act="cancel">Cancel</button></div>
      </form></li>`;
    }
    return `<li class="tq-note" data-note="${esc(n.id)}">
      ${n.detail ? `<details><summary>${esc(n.text)}</summary><p>${esc(n.detail)}</p></details>` : `<p>${esc(n.text)}</p>`}
      <span class="tq-row-btns"><button type="button" class="tq-mini" data-act="nedit">Edit</button><button type="button" class="tq-mini tq-del" data-act="ndel" aria-label="Delete">🗑</button></span>
    </li>`;
  }

  function renderPanel() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    if (openId === "__bin") return renderBin();
    if (openId === "__settings") return renderSettings();
    const p = board.projects.find((x) => x.id === openId);
    panel.hidden = scrim.hidden = !p;
    if (!p) return;
    const s = sections(p.id);
    const notes = board.notes.filter((n) => n.project === p.id);
    const sugs = (board.suggestions || []).filter((x) => x.project === p.id);
    panel.style.setProperty("--tq-tint", p.color);
    panel.innerHTML = `
      <div class="tq-panel-head">
        ${p.logo ? `<img src="${esc(p.logo)}" alt="">` : `<span class="tq-icon tq-icon-sm" aria-hidden="true">${esc(p.icon || "")}</span>`}
        <h2>${esc(p.name)}</h2>
        <button class="tq-x" type="button" aria-label="Close">✕</button>
      </div>
      <div class="tq-sec tq-sec-remember"><h3>📌 Always remember</h3>
        <ul class="tq-notes">${notes.map(noteHTML).join("")}</ul>
        ${notes.length ? "" : `<p class="tq-empty">No standing rules yet.</p>`}
        <details class="tq-add-note"${editing === "n:new" ? " open" : ""}><summary>+ Add a rule</summary>
          <form class="tq-note-form" data-id="">
            <input class="tq-input" name="text" maxlength="200" placeholder="Short rule, e.g. Every ad link needs the UTM code" required>
            <textarea class="tq-input" name="detail" rows="2" placeholder="Detail (optional)"></textarea>
            <div class="tq-form-btns"><button class="tq-btn tq-btn-tint" type="submit">Add rule</button></div>
          </form>
        </details>
      </div>
      <div class="tq-sec tq-sec-suggest"><h3>Suggested by Claude <span class="tq-n">${sugs.length}</span></h3>
        ${sugs.length ? `<ul class="tq-list">${sugs.map(suggestionHTML).join("")}</ul>` : `<p class="tq-empty">Nothing to suggest right now. Claude checks your messages in the background and puts ideas here. Nothing goes on your list until you tap Add.</p>`}
      </div>
      <div class="tq-sec tq-sec-white"><h3>Tasks <span class="tq-n">${s.tasks.length}</span></h3>
        <ul class="tq-list">${s.tasks.map(rowHTML).join("")}</ul>
        ${s.tasks.length ? "" : `<p class="tq-empty">Nothing due this week.</p>`}
      </div>
      <div class="tq-sec tq-sec-white"><h3>Waiting on others <span class="tq-n">${s.waiting.length}</span></h3>
        <ul class="tq-list">${s.waiting.map(rowHTML).join("")}</ul>
        ${s.waiting.length ? "" : `<p class="tq-empty">Nobody to wait on. After ${CHASE_DAYS} days a waiting item jumps into Tasks as "Chase…".</p>`}
      </div>
      ${s.later.length ? `<details class="tq-sec tq-sec-fold"><summary><h3>Later <span class="tq-n">${s.later.length}</span></h3><small>More than ${LATER_DAYS} days out, not counted yet</small></summary>
        <ul class="tq-list">${s.later.map(rowHTML).join("")}</ul></details>` : ""}
      ${s.done.length ? `<details class="tq-sec tq-sec-fold"><summary><h3>Done <span class="tq-n">${s.done.length}</span></h3><small>Last 14 days. Untick to put one back.</small></summary>
        <ul class="tq-list">${s.done.map(rowHTML).join("")}</ul></details>` : ""}
      <div class="tq-sec tq-sec-add"><h3>Add to ${esc(p.name)}</h3><ul class="tq-list">${formHTML(null)}</ul></div>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

  // ----- settings -----
  function renderSettings() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    panel.hidden = scrim.hidden = false;
    panel.style.setProperty("--tq-tint", "#C2D9BC");
    panel.innerHTML = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">⚙️</span><h2>Settings</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div>
      <form class="tq-set-form">
        <label class="tq-form-row"><span>Folder Start ▶ opens Claude Code in <small>(optional, e.g. /Users/Utente/Documents)</small></span>
        <input class="tq-input" name="claudeFolder" value="${esc(board.settings?.claudeFolder || "")}" placeholder="Leave empty to choose each time"></label>
        <div class="tq-form-btns"><button class="tq-btn tq-btn-tint" type="submit">Save</button></div>
      </form>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
    $(".tq-set-form", panel).addEventListener("submit", async (e) => {
      e.preventDefault();
      try { board.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify({ claudeFolder: e.target.claudeFolder.value }) }); toast("Saved"); }
      catch (err) { toast(err.message); }
    });
  }

  // ----- the bin (trash) -----
  async function renderBin() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    panel.hidden = scrim.hidden = false;
    panel.style.setProperty("--tq-tint", "#D8D4CC");
    panel.innerHTML = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">🗑</span><h2>Bin</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div><p class="tq-empty">Loading…</p>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
    let trash = [];
    try { trash = await api("/api/trash"); } catch (e) { toast(e.message); }
    if (openId !== "__bin") return;
    const name = (pid) => board.projects.find((x) => x.id === pid)?.name || "";
    panel.innerHTML = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">🗑</span><h2>Bin</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div>
      <p class="tq-empty">Nothing is ever really deleted. The last 500 things you deleted are here.</p>
      <ul class="tq-list">${trash.map((e) => `<li class="tq-row" data-tid="${esc(e.tid)}">
        <div class="tq-row-main"><p class="tq-row-text">${esc(e.item.text || e.item.name || "(no text)")}</p>
        <p class="tq-row-meta">${esc(e.kind)}${e.item.project ? " · " + esc(name(e.item.project)) : ""} · deleted ${esc(new Date(e.deleted).toLocaleDateString(undefined, { day: "numeric", month: "short" }))}</p></div>
        <div class="tq-row-btns">${e.tid ? `<button type="button" class="tq-mini" data-act="restore">Restore</button>` : ""}</div></li>`).join("")}</ul>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

  // ----- clicks inside the panel (one listener for everything) -----
  const armed = new WeakMap();
  function armDelete(btn, go) {
    if (armed.get(btn)) { go(); return; }
    btn.classList.add("is-armed"); btn.textContent = "Tap again";
    armed.set(btn, setTimeout(() => { armed.delete(btn); btn.classList.remove("is-armed"); btn.textContent = "🗑"; }, 3000));
  }
  const undoRestore = (tid) => () => change(`/api/trash/${tid}/restore`, "POST").then(() => toast("Back again"));

  $("#tq-panel").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-act], [data-kind]");
    if (!btn) return;
    const row = btn.closest("[data-id]"), id = row?.dataset.id;
    if (btn.dataset.kind) {
      const form = btn.closest("form");
      $$(".tq-seg-btn", form).forEach((b) => b.classList.toggle("is-on", b === btn));
      $$("[data-show]", form).forEach((l) => (l.hidden = !l.dataset.show.split(" ").includes(btn.dataset.kind)));
      $("[name=text]", form).placeholder = btn.dataset.kind === "waiting" ? "What you asked for" : "Start with a verb, e.g. Send the Tmrw Lab draft";
      form.dataset.kind = btn.dataset.kind;
      if (!form.dataset.id) addKind = btn.dataset.kind;
      return;
    }
    const act = btn.dataset.act;
    const sid = btn.closest("[data-sid]")?.dataset.sid;
    if (act === "sadd") { await change(`/api/suggestions/${sid}/add`, "POST"); toast("✅ Added to your list"); return; }
    if (act === "sdismiss") { await change(`/api/suggestions/${sid}/dismiss`, "POST"); toast("Dismissed. It won't be suggested again."); return; }
    if (act === "scomment") { const f = $(".tq-c-form", btn.closest(".tq-sug")); f.hidden = false; $("textarea", f).focus(); return; }
    if (act === "ccancel") { btn.closest(".tq-c-form").hidden = true; return; }
    if (act === "edit") { editing = id; renderPanel(); $("#tq-panel .tq-form [name=text]")?.focus(); }
    else if (act === "cancel") { editing = null; renderPanel(); }
    else if (act === "chased") { await change(`/api/tasks/${id}/chased`, "POST"); toast("🔔 Chased. The 5-day clock starts again."); }
    else if (act === "del") armDelete(btn, async () => {
      const b = await change(`/api/tasks/${id}`, "DELETE");
      toast("Deleted", "Undo", undoRestore(b.trashed));
    });
    else if (act === "nedit") { editing = "n:" + btn.closest("[data-note]").dataset.note; renderPanel(); }
    else if (act === "ndel") armDelete(btn, async () => {
      const b = await change(`/api/notes/${btn.closest("[data-note]").dataset.note}`, "DELETE");
      toast("Rule deleted", "Undo", undoRestore(b.trashed));
    });
    else if (act === "restore") {
      await change(`/api/trash/${btn.closest("[data-tid]").dataset.tid}/restore`, "POST");
      toast("Restored"); renderBin();
    }
  });

  $("#tq-panel").addEventListener("change", async (e) => {
    if (e.target.dataset.act !== "tick") return;
    const id = e.target.closest("[data-id]").dataset.id;
    const done = e.target.checked;
    const t = board.tasks.find((x) => x.id === id);
    await change(`/api/tasks/${id}/done`, "POST", { done }).catch(() => {});
    if (!done) toast("⏪ Back on the list");
    else if (t?.kind === "repeat") toast(`Done. The next one is on the list (${t.repeat}).`, "Undo", () => change(`/api/tasks/${id}/done`, "POST", { done: false }));
    else toast("Done", "Undo", () => change(`/api/tasks/${id}/done`, "POST", { done: false }));
  });

  $("#tq-panel").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, f = Object.fromEntries(new FormData(form));
    if (form.classList.contains("tq-set-form")) return;
    if (form.classList.contains("tq-c-form")) {
      const sid = form.closest("[data-sid]").dataset.sid;
      if (!f.text.trim()) return;
      const btn = $("button[type=submit]", form); btn.disabled = true; btn.textContent = "✨ Fixing…";
      try {
        const b = await change(`/api/suggestions/${sid}/comment`, "POST", { text: f.text });
        if (b.action === "accept") toast("✅ Fixed and added to your list");
        else if (b.action === "dismiss") toast("Dismissed");
        else toast(b.fixed ? "✨ Updated" : "💬 Comment saved");
      } catch (err) { btn.disabled = false; btn.textContent = "Send"; }
      return;
    }
    if (form.classList.contains("tq-note-form")) {
      const nid = form.dataset.id;
      editing = null;
      if (nid) await change(`/api/notes/${nid}`, "PUT", f);
      else { await change("/api/notes", "POST", { ...f, project: openId }); toast("📌 Rule pinned"); }
      return;
    }
    const kind = form.dataset.kind || $(".tq-seg-btn.is-on", form)?.dataset.kind || "task";
    const body = { kind, text: f.text, detail: f.detail, link: f.link, source: f.source,
                   due: kind === "waiting" ? "" : f.due, who: kind === "waiting" ? f.who : "",
                   asked: kind === "waiting" ? f.asked : "", repeat: kind === "repeat" ? f.repeat : "" };
    if (kind === "waiting" && !body.who) { toast("Add who you're waiting on"); return; }
    if (kind === "repeat" && !body.due) body.due = todayISO();
    const tid = form.dataset.id;
    try {
      if (tid) { editing = null; await change(`/api/tasks/${tid}`, "PUT", body); toast("Saved"); }
      else { await change("/api/tasks", "POST", { ...body, project: openId }); toast(kind === "waiting" ? "Added to Waiting on others" : "Added"); $("#tq-panel .tq-sec-add [name=text]")?.focus(); }
    } catch (err) {}
  });

  function render() {
    $("#tq-today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const u = board.updated ? new Date(board.updated) : null;
    $("#tq-updated").textContent = u ? "Last saved " + u.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    renderCards();
    // Don't redraw the panel under her while she's typing in the add form.
    const typing = document.activeElement?.closest?.(".tq-sec-add form, .tq-c-form, .tq-set-form") && document.activeElement.value;
    if (!typing) renderPanel();
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
  $("#tq-bin").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__bin"); });
  $("#tq-settings").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__settings"); });
  $("#tq-export").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const data = await api("/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = "tasks-hq-backup-" + todayISO() + ".json";
      a.click();
    } catch (err) { toast(err.message); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && openId && !editing) togglePanel(openId); });
  // Refresh quietly when she comes back to the tab.
  document.addEventListener("visibilitychange", () => { if (!document.hidden && board && key && !editing) load().catch(() => {}); });

  if (!API) showLock("Not connected to Cloudflare yet.");
  else if (key) load().then(showApp).catch(() => { sessionStorage.removeItem(KEY_STORE); key = ""; showLock(); });
  else showLock();
})();
