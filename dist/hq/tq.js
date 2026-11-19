// Tasks HQ page. Talks to the Worker at window.TQ_API with the password in X-Key.
// No browser pop-ups anywhere: deletes are tap-twice, undo comes as a toast.
(() => {
  const API = (window.TQ_API || "").replace(/\/+$/, "");
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const KEY_STORE = "tq-key";
  // Stage 8: the sign-in is remembered for 30 days on this device (see tq-auth.js).
  let key = window.TQAUTH ? TQAUTH.get() : sessionStorage.getItem(KEY_STORE) || "";
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
      // A dated task only shows in Tasks from its due date on (Nicky, 2026-11-18); before that it waits in Coming up.
      if (t.due && daysUntil(t.due) > 0) s.later.push(t); else s.tasks.push(t);
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
    const logo = p.logo ? `<img src="${esc(p.logo)}" alt="${esc(p.name)} logo">` : iconHTML(p, "");
    const ext = /^https?:/.test(p.dashboard || "") ? ' target="_blank" rel="noopener"' : "";
    return `
      <div class="tq-card${openId === p.id ? " is-open" : ""}" data-id="${esc(p.id)}" style="--tq-tint:${esc(p.color)}" role="button" tabindex="0" aria-expanded="${openId === p.id}">
        <span class="tq-strip"></span>
        <span class="tq-logo">${logo}</span>
        <h3>${esc(p.name)}</h3>
        <p class="tq-blurb">${esc(p.blurb || "")}</p>
        ${p.dashboard ? `<a class="tq-pill" href="${esc(p.dashboard)}"${ext}>📊 Dashboard ↗</a>` : ""}
        ${s.sug ? `<span class="tq-sug-chip">✨ ${s.sug} suggested</span>` : ""}
        ${p.special === "admin" && (board.habits || []).length ? `<span class="tq-habit-chip">🌱 ${habitChip()}</span>` : ""}
        ${s.open ? `<span class="tq-count${s.hot ? " is-hot" : ""}"><b>${s.open}</b> ${s.label || "open"}</span>` : (s.sug ? "" : `<span class="tq-clear">All clear</span>`)}
      </div>`;
  }

  function habitChip() {
    const hs = board.habits || [], daily = hs.filter((h) => h.kind !== "avoid");
    if (daily.length) return `${daily.filter((h) => habitStats(h).today).length} of ${daily.length} done today`;
    return `${hs.length} ${hs.length === 1 ? "habit" : "habits"}`;
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
    bits.push(sg.by === "work" ? "💼 Work Claude" : "✨ Claude");
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
          ${t.done && t.doneBy ? `<p class="tq-row-meta">✨ Ticked by ${t.doneBy === "work" ? "Work Claude" : "Claude"}${t.doneWhy ? `: ${esc(t.doneWhy)}` : ""}</p>` : ""}
          ${t.addedBy ? `<p class="tq-row-meta tq-by">✨ Added by ${t.addedBy === "work" ? "Work Claude" : "Claude"}</p>` : ""}
          ${t.done && t.closedBy ? `<p class="tq-row-meta tq-by">✨ Closed by ${t.closedBy === "work" ? "Work Claude" : "Claude"}${t.resolution?.answer ? `: ${esc(t.resolution.answer)}` : ""}${t.resolution?.source ? ` (${esc(t.resolution.source)})` : ""}${t.resolution?.link ? ` · <a href="${esc(t.resolution.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""}</p>` : ""}
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
            ${[["daily", "daily"], ["weekdays", "weekdays (Mon to Fri)"], ["weekly", "weekly"], ["monthly", "monthly"], ["quarterly", "quarterly"], ["yearly", "yearly"]].map(([r, l]) => `<option value="${r}"${(t?.repeat || "monthly") === r ? " selected" : ""}>${l}</option>`).join("")}
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
    if (openId === "__touchid") return renderTouchId();
    if (openId === "__settings") return renderSettings();
    if (openId === "__anims") return renderAnims();
    if (openId === "__icons") return renderIcons();
    const p = board.projects.find((x) => x.id === openId);
    panel.hidden = scrim.hidden = !p;
    if (!p) return;
    const s = sections(p.id);
    const notes = board.notes.filter((n) => n.project === p.id);
    const sugs = (board.suggestions || []).filter((x) => x.project === p.id);
    panel.style.setProperty("--tq-tint", p.color);
    panel.innerHTML = `
      <div class="tq-panel-head">
        ${p.logo ? `<img src="${esc(p.logo)}" alt="">` : iconHTML(p, " tq-icon-sm")}
        <h2>${esc(p.name)}</h2>
        <button class="tq-x" type="button" aria-label="Close">✕</button>
      </div>
      ${p.special === "admin" ? habitsHTML() : ""}
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
        ${s.tasks.length ? "" : `<p class="tq-empty">Nothing due today.</p>`}
      </div>
      <div class="tq-sec tq-sec-white"><h3>Waiting on others <span class="tq-n">${s.waiting.length}</span></h3>
        <ul class="tq-list">${s.waiting.map(rowHTML).join("")}</ul>
        ${s.waiting.length ? "" : `<p class="tq-empty">Nobody to wait on. After ${CHASE_DAYS} days a waiting item jumps into Tasks as "Chase…".</p>`}
      </div>
      ${s.later.length ? `<details class="tq-sec tq-sec-fold"><summary><h3>Coming up <span class="tq-n">${s.later.length}</span></h3><small>Moves into Tasks on its due date. Not counted yet.</small></summary>
        <ul class="tq-list">${s.later.map(rowHTML).join("")}</ul></details>` : ""}
      ${s.done.length ? `<details class="tq-sec tq-sec-fold"><summary><h3>Done <span class="tq-n">${s.done.length}</span></h3><small>Last 14 days. Untick to put one back.</small></summary>
        <ul class="tq-list">${s.done.map(rowHTML).join("")}</ul></details>` : ""}
      <div class="tq-sec tq-sec-add"><h3>Add to ${esc(p.name)}</h3><ul class="tq-list">${formHTML(null)}</ul></div>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

  // ----- habits (Life Admin only; personal, never shown on a work card) -----
  const dayDiff = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  const plusDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
  function habitStats(h) {
    const t = todayISO();
    if (h.kind === "avoid") {
      const now = Math.max(0, dayDiff(h.lastSlip || t, t));
      const dates = [...(h.slips || []), h.lastSlip].filter(Boolean);
      let best = now;
      for (let i = 1; i < dates.length; i++) best = Math.max(best, dayDiff(dates[i - 1], dates[i]));
      return { now, best };
    }
    const set = new Set(h.days || []);
    let d = set.has(t) ? t : plusDays(t, -1), streak = 0;
    while (set.has(d)) { streak++; d = plusDays(d, -1); }
    let best = 0, run = 0, prev = null;
    for (const x of [...set].sort()) { run = prev && dayDiff(prev, x) === 1 ? run + 1 : 1; best = Math.max(best, run); prev = x; }
    return { streak, best, today: set.has(t), set };
  }
  function habitHTML(h) {
    const s = habitStats(h);
    const del = `<button class="tq-mini tq-del" type="button" data-act="hdel" aria-label="Delete habit">🗑</button>`;
    if (h.kind === "avoid") return `<li class="tq-habit is-avoid" data-habit="${esc(h.id)}">
        <div class="tq-habit-big"><b>${s.now}</b><small>${s.now === 1 ? "day" : "days"}</small></div>
        <div class="tq-habit-main"><span class="tq-habit-name">${esc(h.name)}</span>
          <small>since you last slipped${s.best > s.now ? ` · best ${s.best} days` : s.now > 0 ? " · your best run" : ""}</small></div>
        <button class="tq-btn tq-slip" type="button" data-act="hslip">Slipped</button>${del}</li>`;
    const week = [...Array(7)].map((_, i) => plusDays(todayISO(), i - 6));
    return `<li class="tq-habit is-daily" data-habit="${esc(h.id)}">
        <label class="tq-tick tq-habit-tick"><input type="checkbox" data-act="htick"${s.today ? " checked" : ""} aria-label="Done today"><span></span></label>
        <div class="tq-habit-main"><span class="tq-habit-name">${esc(h.name)}</span>
          <span class="tq-week">${week.map((d) => `<button type="button" class="tq-dot${s.set.has(d) ? " is-on" : ""}" data-act="hday" data-day="${d}" title="${esc(shortDate(d))}" aria-label="${esc(shortDate(d))}">${new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "narrow" })}</button>`).join("")}</span></div>
        <div class="tq-streak${s.streak ? "" : " is-zero"}">🔥 <b>${s.streak}</b><small>${s.best > s.streak ? `best ${s.best}` : s.streak === 1 ? "day" : "days"}</small></div>${del}</li>`;
  }
  function habitsHTML() {
    const hs = board.habits || [];
    const avoid = hs.filter((h) => h.kind === "avoid"), daily = hs.filter((h) => h.kind !== "avoid");
    return `<div class="tq-sec tq-sec-habits"><h3>🌱 Habits</h3>
      ${daily.length ? `<h4>Every day</h4><ul class="tq-habits">${daily.map(habitHTML).join("")}</ul>` : ""}
      ${avoid.length ? `<h4>Trying to avoid</h4><ul class="tq-habits">${avoid.map(habitHTML).join("")}</ul>` : ""}
      ${hs.length ? "" : `<p class="tq-empty">No habits yet. Add one you want to do every day, or one you're trying to stop.</p>`}
      <details class="tq-add-note"${editing === "h:new" ? " open" : ""}><summary>+ Add a habit</summary>
        <form class="tq-habit-form" data-hkind="daily">
          <div class="tq-seg"><button type="button" class="tq-seg-btn is-on" data-hkind="daily">Every day</button><button type="button" class="tq-seg-btn" data-hkind="avoid">Trying to avoid</button></div>
          <input class="tq-input" name="name" maxlength="80" placeholder="e.g. Read 10 pages" required>
          <label class="tq-lbl" data-hshow="avoid" hidden>Last slip (leave empty for today) <input class="tq-input" type="date" name="lastSlip"></label>
          <div class="tq-form-btns"><button class="tq-btn tq-btn-tint" type="submit">Add habit</button></div>
        </form>
      </details></div>`;
  }
  const habitEl = (id) => $(`#tq-panel [data-habit="${CSS.escape(id)}"]`);

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

  // ----- animations -----
  const fx = (action, ctx, el) => window.TQFX && TQFX.play(action, ctx, el);
  const snap = (el) => (window.TQFX ? TQFX.capture(el) : null);
  const rowEl = (id) => $(`#tq-panel [data-id="${CSS.escape(id)}"]`);

  // ----- scoreboard: finished per day, best day, this week, workday streak -----
  function score() {
    const days = board.stats?.days || {};
    const t = todayISO(), today = days[t] || 0;
    const bestOther = Math.max(0, ...Object.entries(days).filter(([d]) => d !== t).map(([, n]) => n));
    const best = Math.max(bestOther, today);
    const d0 = today0(), dow = (d0.getDay() + 6) % 7; // Monday = 0
    let week = 0;
    for (let i = 0; i <= dow; i++) { const d = new Date(d0); d.setDate(d.getDate() - i); week += days[isoOf(d)] || 0; }
    // Workday streak: weekends never break it; today only counts once something is done.
    let streak = 0;
    const d = new Date(d0);
    if (!today) d.setDate(d.getDate() - 1);
    for (let guard = 0; guard < 2000; guard++) {
      const wd = d.getDay();
      if (wd === 0 || wd === 6) { if (days[isoOf(d)]) streak++; d.setDate(d.getDate() - 1); continue; }
      if (!days[isoOf(d)]) break;
      streak++; d.setDate(d.getDate() - 1);
    }
    return { today, best, bestOther, week, streak };
  }
  function renderScore() {
    const sc = score();
    const slots = Math.min(Math.max(sc.best + 1, 3), 30);
    let html = "";
    for (let i = 1; i <= slots; i++) {
      const last = i === slots;
      html += `<span class="tq-slot${i <= sc.today ? " is-on" : ""}${last ? " is-goal" : ""}" title="${last ? "Beat your best to fill this one" : i + " done"}">${last ? "🏆" : i <= sc.today ? "✓" : ""}</span>`;
    }
    $("#tq-score").innerHTML = `
      <div class="tq-score-top"><p><b>${sc.today}</b> done today</p>
        <span class="tq-chip">Best day ${sc.best}</span><span class="tq-chip">This week ${sc.week}</span><span class="tq-chip">🔥 ${sc.streak} day streak</span></div>
      <div class="tq-slots" aria-label="${sc.today} done today, best day ${sc.best}">${html}</div>
      <p class="tq-score-hint">${sc.today > sc.bestOther && sc.bestOther > 0 ? "New record today! 🏆" : sc.best ? `${Math.max(sc.bestOther + 1 - sc.today, 0) || 1} more to beat your best day.` : "Tick your first task to start the scoreboard."}</p>`;
  }

  // ----- card icons: 4 drawn options per card without a logo (picked in the Icons sheet) -----
  const ICON_CARDS = ["jobs", "study", "family", "tallulah", "frolic", "admin"];
  const ICON_NAMES = ["Soft tile", "Solid circle", "Different symbol", "Outline", "From the website"];
  // Option 4 (the default) is the icon taken from the card's own website.
  const SITE_ICON = { jobs: "icons/jobs-site.svg", study: "icons/study-site.png", family: "icons/family-site.png", tallulah: "icons/tallulah-site.svg", frolic: "icons/frolic-site.png" };
  const defIcon = (id) => (SITE_ICON[id] ? 4 : 0);
  const iconSrc = (id, v) => (v === 4 ? SITE_ICON[id] : `icons/${id}-${v}.svg`);
  function iconHTML(p, cls) {
    if (ICON_CARDS.includes(p.id)) return `<img class="tq-icon-img${cls}" src="${iconSrc(p.id, board.settings?.icons?.[p.id] ?? defIcon(p.id))}" alt="">`;
    return `<span class="tq-icon${cls}" aria-hidden="true">${esc(p.icon || "•")}</span>`;
  }
  function renderIcons() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    panel.hidden = scrim.hidden = false;
    panel.style.setProperty("--tq-tint", "#C2D9BC");
    const picks = board.settings?.icons || {};
    panel.innerHTML = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">🎨</span><h2>Card icons</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div>
      <p class="tq-empty">Tap the icon you like for each card. It's saved straight away.</p>
      <ul class="tq-anim-list">${ICON_CARDS.map((id) => { const p = board.projects.find((x) => x.id === id); return p ? `<li class="tq-anim" data-icons="${id}">
        <h3>${esc(p.name)}</h3>
        <div class="tq-icon-opts">${(SITE_ICON[id] ? [4, 0, 1, 2, 3] : [0, 1, 2, 3]).map((i) => `<button type="button" class="tq-icon-opt${(picks[id] ?? defIcon(id)) === i ? " is-picked" : ""}" data-iopt="${i}" aria-label="${ICON_NAMES[i]}"><img src="${iconSrc(id, i)}" alt=""><span>${ICON_NAMES[i]}</span></button>`).join("")}</div>
      </li>` : ""; }).join("")}</ul>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

  // ----- animation picker (4 options per action) -----
  function renderAnims() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    panel.hidden = scrim.hidden = false;
    panel.style.setProperty("--tq-tint", "#F5C04E");
    const picks = board.settings?.anims || {};
    panel.innerHTML = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">🎬</span><h2>Animations</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div>
      <p class="tq-empty">Tap an option to see it on the sample row. The one you tap is saved straight away.</p>
      <ul class="tq-anim-list">${Object.entries(TQFX.NAMES).map(([k, name]) => `<li class="tq-anim" data-anim="${k}">
        <h3>${esc(name)}</h3>
        <div class="tq-anim-demo"><span class="tq-anim-box"></span><span>Sample: Send the launch email</span></div>
        <div class="tq-anim-opts">${TQFX.OPTIONS[k].map((o, i) => `<button type="button" class="tq-mini${(picks[k] ?? 0) === i ? " is-picked" : ""}" data-opt="${i}">${(picks[k] ?? 0) === i ? "✓ " : ""}${esc(o)}</button>`).join("")}</div>
      </li>`).join("")}</ul>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

  // ----- the bin (trash) -----
  // ----- Touch ID / Face ID set-up -----
  async function renderTouchId() {
    const panel = $("#tq-panel"), scrim = $("#tq-scrim");
    panel.hidden = scrim.hidden = false;
    panel.style.setProperty("--tq-tint", "#C2D9BC");
    const head = `<div class="tq-panel-head"><span class="tq-icon tq-icon-sm" aria-hidden="true">👆</span><h2>Touch ID / Face ID</h2><button class="tq-x" type="button" aria-label="Close">✕</button></div>`;
    panel.innerHTML = head + `<p class="tq-empty">Loading…</p>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
    let list = [];
    try { [list] = await Promise.all([api("/api/passkeys").then((r) => r.passkeys), TQAUTH.prefetchSetUp(key)]); } catch (e) { toast(e.message); }
    if (openId !== "__touchid") return;
    const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");
    panel.innerHTML = head + `
      <p class="tq-empty">Sign in with your fingerprint or face instead of typing the password. It works on every HQ page, Tools included. Your password still works as a backup. You also stay signed in for 30 days on each device.</p>
      ${TQAUTH.supported() ? `<div class="tq-form-btns"><button class="tq-btn tq-btn-main" type="button" data-act="pkadd">👆 Set up Touch ID / Face ID on this device</button></div>` : `<p class="tq-empty">This browser can't do Touch ID or Face ID.</p>`}
      <h3 class="tq-pk-h">Set up on</h3>
      <ul class="tq-list">${list.map((k) => `<li class="tq-row" data-pk="${esc(k.id)}"><div class="tq-row-main"><p class="tq-row-text">${esc(k.label)}</p>
        <p class="tq-row-meta">Added ${esc(when(k.created))}${k.lastUsed ? " · last used " + esc(when(k.lastUsed)) : ""}</p></div>
        <div class="tq-row-btns"><button type="button" class="tq-mini tq-del" data-act="pkdel">Remove</button></div></li>`).join("") || `<li class="tq-empty">Nothing yet.</li>`}</ul>`;
    $(".tq-x", panel).addEventListener("click", () => togglePanel(openId));
  }

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
        <div class="tq-row-main"><p class="tq-row-text">${esc(e.item.text || e.item.name || e.item.title || e.item.stat || e.item.who || "(no text)")}</p>
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
    const iopt = e.target.closest("[data-iopt]");
    if (iopt) {
      const id = iopt.closest("[data-icons]").dataset.icons, v = +iopt.dataset.iopt;
      $$("[data-iopt]", iopt.parentNode).forEach((b) => b.classList.toggle("is-picked", b === iopt));
      try { board.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify({ icons: { [id]: v } }) }); renderCards(); toast("Saved"); } catch (err) { toast(err.message); }
      return;
    }
    const opt = e.target.closest("[data-opt]");
    if (opt) {
      const li = opt.closest("[data-anim]"), k = li.dataset.anim, v = +opt.dataset.opt;
      const demo = $(".tq-anim-demo", li);
      TQFX.play(k, TQFX.capture(demo), demo, v);
      $$("[data-opt]", li).forEach((b, i) => { b.classList.toggle("is-picked", i === v); b.textContent = (i === v ? "✓ " : "") + TQFX.OPTIONS[k][i]; });
      TQFX.picks[k] = v;
      try { board.settings = await api("/api/settings", { method: "PUT", body: JSON.stringify({ anims: { [k]: v } }) }); } catch (err) { toast(err.message); }
      return;
    }
    const hk = e.target.closest("[data-hkind]");
    if (hk && hk.tagName === "BUTTON") {
      const form = hk.closest("form");
      $$("[data-hkind]", form).forEach((b) => b.classList.toggle("is-on", b === hk));
      form.dataset.hkind = hk.dataset.hkind;
      $("[data-hshow]", form).hidden = hk.dataset.hkind !== "avoid";
      $("[name=name]", form).placeholder = hk.dataset.hkind === "avoid" ? "e.g. Doomscrolling in bed" : "e.g. Read 10 pages";
      return;
    }
    const hrow = e.target.closest("[data-habit]");
    if (hrow && e.target.closest("button[data-act]")) {
      const hid = hrow.dataset.habit, a = e.target.closest("button[data-act]");
      if (a.dataset.act === "hslip") {
        const c = snap(hrow), h = board.habits.find((x) => x.id === hid), was = habitStats(h).now;
        await change(`/api/habits/${hid}/slip`, "POST");
        fx("slip", c, habitEl(hid));
        toast(`Reset to 0 (it was ${was} ${was === 1 ? "day" : "days"})`, "Undo", () => change(`/api/habits/${hid}/unslip`, "POST").then(() => toast("Back to " + was)));
      } else if (a.dataset.act === "hday") {
        const on = !a.classList.contains("is-on"), c = snap(a);
        await change(`/api/habits/${hid}/tick`, "POST", { day: a.dataset.day, done: on });
        if (on) fx("habit", c, habitEl(hid));
      } else if (a.dataset.act === "hdel") armDelete(a, async () => {
        const c = snap(hrow);
        const b = await change(`/api/habits/${hid}`, "DELETE");
        fx("del", c);
        toast("Habit deleted", "Undo", undoRestore(b.trashed));
      });
      return;
    }
    const pk = e.target.closest("[data-act=pkadd], [data-act=pkdel]");
    if (pk) {
      if (pk.dataset.act === "pkadd") {
        pk.disabled = true;
        try { await TQAUTH.passkeySetUp(key, TQAUTH.deviceName()); fx("tick", snap(pk), pk); toast("👆 Touch ID is set up on this device"); renderTouchId(); }
        catch (err) { toast(err.message); pk.disabled = false; }
      } else armDelete(pk, async () => {
        try { await api(`/api/passkeys/${encodeURIComponent(pk.closest("[data-pk]").dataset.pk)}`, { method: "DELETE" }); toast("Removed"); renderTouchId(); } catch (err) { toast(err.message); }
      });
      return;
    }
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
    if (act === "sadd") { const c = snap(btn.closest(".tq-sug")); const b = await change(`/api/suggestions/${sid}/add`, "POST"); fx("add", c, b.added && rowEl(b.added)); toast("✅ Added to your list"); return; }
    if (act === "sdismiss") { const c = snap(btn.closest(".tq-sug")); await change(`/api/suggestions/${sid}/dismiss`, "POST"); fx("dismiss", c); toast("Dismissed. It won't be suggested again."); return; }
    if (act === "scomment") { const f = $(".tq-c-form", btn.closest(".tq-sug")); f.hidden = false; $("textarea", f).focus(); return; }
    if (act === "ccancel") { btn.closest(".tq-c-form").hidden = true; return; }
    if (act === "edit") { editing = id; renderPanel(); $("#tq-panel .tq-form [name=text]")?.focus(); }
    else if (act === "cancel") { editing = null; renderPanel(); }
    else if (act === "chased") { const c = snap(row); await change(`/api/tasks/${id}/chased`, "POST"); fx("chased", c, rowEl(id)); toast("🔔 Chased. The 5-day clock starts again."); }
    else if (act === "del") armDelete(btn, async () => {
      const c = snap(row);
      const b = await change(`/api/tasks/${id}`, "DELETE");
      fx("del", c);
      toast("Deleted", "Undo", undoRestore(b.trashed));
    });
    else if (act === "nedit") { editing = "n:" + btn.closest("[data-note]").dataset.note; renderPanel(); }
    else if (act === "ndel") armDelete(btn, async () => {
      const c = snap(btn.closest("[data-note]"));
      const b = await change(`/api/notes/${btn.closest("[data-note]").dataset.note}`, "DELETE");
      fx("del", c);
      toast("Rule deleted", "Undo", undoRestore(b.trashed));
    });
    else if (act === "restore") {
      await change(`/api/trash/${btn.closest("[data-tid]").dataset.tid}/restore`, "POST");
      toast("Restored"); renderBin();
    }
  });

  $("#tq-panel").addEventListener("change", async (e) => {
    if (e.target.dataset.act === "htick") {
      const hid = e.target.closest("[data-habit]").dataset.habit, done = e.target.checked, c = snap(e.target.closest("[data-habit]"));
      try { await change(`/api/habits/${hid}/tick`, "POST", { done }); } catch (err) { return; }
      if (done) { fx("habit", c, habitEl(hid)); const st = habitStats(board.habits.find((x) => x.id === hid)).streak; toast(st > 1 ? `🔥 ${st} days in a row` : "Done for today"); }
      return;
    }
    if (e.target.dataset.act !== "tick") return;
    const id = e.target.closest("[data-id]").dataset.id;
    const done = e.target.checked;
    const t = board.tasks.find((x) => x.id === id);
    const c = snap(e.target.closest("[data-id]")), before = score();
    try { await change(`/api/tasks/${id}/done`, "POST", { done }); } catch (err) { return; }
    fx(done ? "tick" : "untick", c, rowEl(id));
    const after = score();
    if (done && after.today > before.today && after.today > after.bestOther && before.today <= after.bestOther && after.bestOther > 0) setTimeout(() => fx("record"), 900);
    if (!done) toast("⏪ Back on the list");
    else if (t?.kind === "repeat") toast(`Done. The next one is on the list (${t.repeat}).`, "Undo", () => change(`/api/tasks/${id}/done`, "POST", { done: false }));
    else toast("Done", "Undo", () => change(`/api/tasks/${id}/done`, "POST", { done: false }));
  });

  $("#tq-panel").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target, f = Object.fromEntries(new FormData(form));
    if (form.classList.contains("tq-set-form")) return;
    if (form.classList.contains("tq-habit-form")) {
      const kind = form.dataset.hkind || "daily";
      if (!f.name.trim()) return;
      const had = new Set((board.habits || []).map((x) => x.id));
      editing = null;
      try { await change("/api/habits", "POST", { name: f.name, kind, lastSlip: kind === "avoid" ? f.lastSlip : "" }); } catch (err) { return; }
      const nh = (board.habits || []).find((x) => !had.has(x.id));
      const el = nh && habitEl(nh.id);
      fx("newtask", snap(el), el);
      toast("🌱 Habit added");
      return;
    }
    if (form.classList.contains("tq-c-form")) {
      const sid = form.closest("[data-sid]").dataset.sid;
      if (!f.text.trim()) return;
      const btn = $("button[type=submit]", form); btn.disabled = true; btn.textContent = "✨ Fixing…";
      fx("comment", snap(form.closest(".tq-sug")));
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
      if (nid) { await change(`/api/notes/${nid}`, "PUT", f); fx("edit", null, $(`#tq-panel [data-note="${CSS.escape(nid)}"]`)); }
      else {
        const had = new Set(board.notes.map((n) => n.id));
        await change("/api/notes", "POST", { ...f, project: openId });
        const n = board.notes.find((x) => !had.has(x.id));
        const el = n && $(`#tq-panel [data-note="${CSS.escape(n.id)}"]`);
        fx("note", snap(el), el);
        toast("📌 Rule pinned");
      }
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
      if (tid) { editing = null; await change(`/api/tasks/${tid}`, "PUT", body); fx("edit", null, rowEl(tid)); toast("Saved"); }
      else {
        const had = new Set(board.tasks.map((x) => x.id));
        await change("/api/tasks", "POST", { ...body, project: openId });
        const nt = board.tasks.find((x) => !had.has(x.id));
        const el = nt && rowEl(nt.id);
        fx("newtask", snap(el || form), el);
        toast(kind === "waiting" ? "Added to Waiting on others" : "Added"); $("#tq-panel .tq-sec-add [name=text]")?.focus();
      }
    } catch (err) {}
  });

  function render() {
    $("#tq-today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const u = board.updated ? new Date(board.updated) : null;
    $("#tq-updated").textContent = u ? "Last saved " + u.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
    const fmt = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    const checks = [["claude", "Claude"], ["work", "Work Claude"]].map(([k, name]) => {
      const sw = board.sweeps?.[k];
      if (!sw?.at) return "";
      const old = (Date.now() - Date.parse(sw.at)) / 36e5;
      const when = old < 20 ? fmt(sw.at) : new Date(sw.at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + fmt(sw.at);
      return `<span class="tq-check${sw.failed ? " is-warn" : ""}" title="${esc(sw.summary || "")}${sw.failed ? " · Couldn't read: " + esc(sw.failed) : ""}">${name} checked ${when}${sw.failed ? " ⚠️" : ""}</span>`;
    }).filter(Boolean);
    $("#tq-checks").innerHTML = checks.length ? checks.join("") : `<span class="tq-check">Background checks start soon</span>`;
    if (window.TQFX) TQFX.picks = { ...(board.settings?.anims || {}) };
    renderScore();
    renderCards();
    renderCalendar();
    // Don't redraw the panel under her while she's typing in the add form.
    const typing = document.activeElement?.closest?.(".tq-sec-add form, .tq-c-form, .tq-set-form, .tq-habit-form") && document.activeElement.value;
    if (!typing) renderPanel();
  }

  // ----- Tools row (stage 7): each tool is its own page -----
  const TOOL_CARDS = [
    ["notes", "Notes → Tasks", "Paste notes, pick the tasks"], ["kits", "Brand guides", "Voice, rules, logos, colours"],
    ["proof", "Proof bank", "Your numbers, ready to copy"], ["calendar", "Content calendar", "What goes out when"],
    ["swipe", "Swipe file", "Lines you love"], ["tallulah", "Tallulah tracker", "Words and queries"],
    ["pitches", "Pitch tracker", "Follow-ups and wins"], ["focus", "Focus timer", "Time on what matters"],
  ];
  let toolSum = null;
  async function loadTools() {
    try { toolSum = await api("/api/tools/summary"); } catch (e) { toolSum = null; }
    renderTools();
    try { agenda = await api("/api/agenda"); } catch (e) { agenda = null; }
    renderCalendar();
  }

  // ----- calendar of everything: tasks, waiting-on chase days, calendar events, posts, pitch and query follow-ups -----
  let agenda = null, calMonth = null, calDay = null, calShow = "all";
  function calItems() {
    const out = [], proj = (id) => board.projects.find((p) => p.id === id);
    const grp = (id) => proj(id)?.group || "work";
    for (const t of board.tasks || []) {
      if (t.done) continue;
      if (t.kind === "waiting") {
        const d = plusDaysISO(t.asked || t.created.slice(0, 10), CHASE_DAYS);
        out.push({ date: d, title: `Chase ${t.who || ""}: ${t.text}`, kind: "chase", project: t.project, group: grp(t.project), id: t.id });
      } else if (t.due) out.push({ date: t.due, title: t.text, kind: t.kind === "repeat" ? "repeat" : "task", project: t.project, group: grp(t.project), id: t.id });
    }
    if (agenda) {
      for (const e of agenda.events || []) {
        const mine = e.who === "nicky" || e.who === "booking";
        out.push({ date: e.date, time: e.time, end: e.end, title: e.title, kind: "event", evId: mine ? e.id : "",
          group: e.group || (e.who === "work" ? "work" : (e.project ? grp(e.project) : "personal")), project: e.project, where: e.where, link: e.link,
          label: e.who === "work" ? "Work calendar" : e.who === "nicky" ? "Added by you" : e.who === "booking" ? "Booking, added by Claude" : "Calendar" });
      }
      for (const x of agenda.posts || []) out.push({ date: x.date, title: x.title, kind: "post", project: x.project, group: x.project ? grp(x.project) : "work", label: x.channel, href: "tools/calendar.html" });
      for (const x of agenda.pitches || []) out.push({ date: x.date, title: `Follow up ${x.who} (${x.company})`, kind: "pitch", project: x.project, group: "work", href: "tools/pitches.html" });
      for (const x of agenda.queries || []) out.push({ date: x.date, title: `${x.kind}: ${x.name}`, kind: "query", project: "tallulah", group: "personal", href: "tools/tallulah.html" });
    }
    return out.filter((x) => calShow === "all" || x.group === calShow);
  }
  const CAL_KIND = { task: "Task", repeat: "Repeating", chase: "Chase", event: "Calendar", post: "Post", pitch: "Pitch follow-up", query: "Tallulah" };
  function calColour(x) { return board.projects.find((p) => p.id === x.project)?.color || (x.group === "work" ? "#A9D3EE" : "#E8D8D5"); }
  function renderCalendar() {
    const wrap = $("#tq-calendar"); if (!wrap || !board) return;
    const t = todayISO();
    calMonth ||= t.slice(0, 7); calDay ||= t;
    const items = calItems();
    const first = new Date(calMonth + "-01T00:00:00");
    const start = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const byDay = {};
    for (const x of items) (byDay[x.date] ||= []).push(x);
    for (const k in byDay) byDay[k].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const cell = (i) => {
      const iso = `${calMonth}-${pad(i + 1)}`, on = byDay[iso] || [];
      return `<button type="button" class="tq-cal-d${iso === t ? " is-today" : ""}${iso === calDay ? " is-sel" : ""}${iso < t ? " is-past" : ""}" data-calday="${iso}">
        <i>${i + 1}</i>${on.slice(0, 3).map((x) => `<span class="tq-cal-ev is-${x.kind}" style="--c:${esc(calColour(x))}">${x.time ? `<b>${esc(x.time)}</b> ` : ""}${esc(x.title)}</span>`).join("")}${on.length > 3 ? `<span class="tq-cal-more">+${on.length - 3} more</span>` : ""}
        ${on.length ? `<span class="tq-cal-dots">${on.slice(0, 5).map((x) => `<span style="background:${esc(calColour(x))}"></span>`).join("")}</span>` : ""}</button>`;
    };
    const sel = byDay[calDay] || [];
    const overdue = calDay === t ? items.filter((x) => x.date < t && ["task", "repeat", "chase"].includes(x.kind)) : [];
    const row = (x) => `<li class="tq-cal-item" ${x.id ? `data-calopen="${esc(x.project)}"` : ""}>
        <span class="tq-cal-bar" style="background:${esc(calColour(x))}"></span>
        <div><p>${x.time ? `<b>${esc(x.time)}</b> · ` : ""}${esc(x.title)}</p>
        <small>${x.kind === "event" ? esc(x.label || "Calendar") : esc(CAL_KIND[x.kind]) + (x.label ? " · " + esc(x.label) : "")}${x.project ? " · " + esc(board.projects.find((p) => p.id === x.project)?.name || "") : ""}${x.where ? " · " + esc(x.where) : ""}${x.date < t ? " · was due " + esc(shortDate(x.date)) : ""}</small></div>
        ${x.href ? `<a class="tq-mini" href="${esc(x.href)}">Open</a>` : x.link ? `<a class="tq-mini" href="${esc(x.link)}" target="_blank" rel="noopener">Open ↗</a>` : x.id ? `<span class="tq-mini">Open card</span>` : ""}
        ${x.evId ? `<button type="button" class="tq-mini" data-evdel="${esc(x.evId)}" aria-label="Remove">🗑</button>` : ""}</li>`;
    const noEvents = !(agenda?.events || []).length;
    wrap.innerHTML = `<h2 class="tq-group-h">Calendar</h2>
      <div class="tq-cal-box">
        <div class="tq-cal-top">
          <button class="tq-mini" type="button" data-calnav="-1" aria-label="Last month">‹</button>
          <h3>${esc(first.toLocaleDateString(undefined, { month: "long", year: "numeric" }))}</h3>
          <button class="tq-mini" type="button" data-calnav="1" aria-label="Next month">›</button>
          <button class="tq-mini" type="button" data-calnav="0">Today</button>
          <div class="tq-seg tq-cal-filter">${[["all", "All"], ["work", "Work"], ["personal", "Personal"]].map(([k, l]) => `<button type="button" class="tq-seg-btn${calShow === k ? " is-on" : ""}" data-calshow="${k}">${l}</button>`).join("")}</div>
        </div>
        <div class="tq-cal">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<b class="tq-cal-h">${d}</b>`).join("")}${[...Array(start)].map(() => `<span class="tq-cal-d is-blank"></span>`).join("")}${[...Array(days)].map((_, i) => cell(i)).join("")}</div>
        <div class="tq-cal-day"><h3>${esc(shortDate(calDay))}${calDay === t ? " · today" : ""}</h3>
          <ul class="tq-cal-list">${[...overdue, ...sel].map(row).join("") || `<li class="tq-empty">Nothing on this day.</li>`}</ul>
          <details class="tq-add-note tq-cal-add"><summary>+ Add to this day</summary>
            <form class="tq-form" id="tq-ev-form">
              <input class="tq-input" name="title" maxlength="200" placeholder="What, e.g. Call with Chris (Monte)" required>
              <div class="tq-form-row">
                <label>Starts<input class="tq-input" type="time" name="time"></label>
                <label>Ends<input class="tq-input" type="time" name="end"></label>
                <label>Card<select class="tq-input" name="project"><option value="">Work, no card</option><option value="-personal">Personal, no card</option>${board.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label>
              </div>
              <input class="tq-input" name="link" placeholder="Meeting link (https://…)">
              <div class="tq-form-btns"><button class="tq-btn tq-btn-tint" type="submit">Add</button></div>
            </form></details>
          ${noEvents ? `<p class="tq-empty tq-cal-note">Your Google Calendar events (personal and work) will appear here after the next background check.</p>` : ""}</div>
      </div>`;
  }
  $("#tq-calendar").addEventListener("submit", async (e) => {
    if (e.target.id !== "tq-ev-form") return;
    e.preventDefault();
    const f = new FormData(e.target), proj = f.get("project");
    const body = { date: calDay, title: f.get("title"), time: f.get("time"), end: f.get("end"), link: f.get("link"),
      where: /meet\.google|zoom\.us|cal\.com|teams\./.test(f.get("link")) ? "Video call" : "",
      project: proj && proj !== "-personal" ? proj : "", group: proj === "-personal" ? "personal" : proj ? "" : "work" };
    try { await api("/api/events/add", { method: "POST", body: JSON.stringify(body) }); agenda = await api("/api/agenda"); renderCalendar(); toast("Added to the calendar"); }
    catch (err) { toast(err.message); }
  });
  $("#tq-calendar").addEventListener("click", async (e) => {
    const del = e.target.closest("[data-evdel]");
    if (del) {
      e.stopPropagation();
      if (!del.classList.contains("is-armed")) { del.classList.add("is-armed"); del.textContent = "Tap again"; setTimeout(() => { del.classList.remove("is-armed"); del.textContent = "🗑"; }, 3000); return; }
      try { await api("/api/events/" + del.dataset.evdel, { method: "DELETE" }); agenda = await api("/api/agenda"); renderCalendar(); toast("Removed"); } catch (err) { toast(err.message); }
      return;
    }
    const nav = e.target.closest("[data-calnav]"), show = e.target.closest("[data-calshow]"), day = e.target.closest("[data-calday]"), open = e.target.closest("[data-calopen]");
    if (nav) {
      if (nav.dataset.calnav === "0") { calMonth = todayISO().slice(0, 7); calDay = todayISO(); }
      else { const d = new Date(calMonth + "-01T00:00:00"); d.setMonth(d.getMonth() + +nav.dataset.calnav); calMonth = isoOf(d).slice(0, 7); calDay = calMonth + "-01"; }
    } else if (show) calShow = show.dataset.calshow;
    else if (day) calDay = day.dataset.calday;
    else if (open && !e.target.closest("a")) { if (openId !== open.dataset.calopen) togglePanel(open.dataset.calopen); $("#tq-panel").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    else return;
    renderCalendar();
  });
  function toolStat(id) {
    const s = toolSum; if (!s) return "";
    const t = todayISO(), n = (x, one, many) => `${x} ${x === 1 ? one : many}`;
    if (id === "proof") return s.counts.proof ? n(s.counts.proof, "number", "numbers") : "Add your numbers";
    if (id === "swipe") return s.counts.swipe ? n(s.counts.swipe, "saved", "saved") : "";
    if (id === "kits") return s.kits ? `${s.kitsChecked} of ${s.kits} checked` : "";
    if (id === "calendar") { const w = s.calendar.filter((d) => d >= t && d <= plusDaysISO(t, 7)).length; return w ? n(w, "post this week", "posts this week") : ""; }
    if (id === "pitches") { const due = s.pitchesDue.filter((d) => d <= t).length; return due ? `<b class="tq-tool-hot">${n(due, "follow-up due", "follow-ups due")}</b>` : s.counts.pitches ? n(s.counts.pitches, "pitch", "pitches") : ""; }
    if (id === "tallulah") return s.words ? `${(s.words.words || 0).toLocaleString()} words${s.queriesOpen ? ` · ${s.queriesOpen} out` : ""}` : "";
    if (id === "focus") { const m = s.focus.filter(([d]) => d === t).reduce((a, [, x]) => a + x, 0); return m ? `${m} min today` : ""; }
    return "";
  }
  function plusDaysISO(iso, k) { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + k); return isoOf(d); }
  function renderTools() {
    const wrap = $("#tq-tools"); if (!wrap) return;
    wrap.innerHTML = TOOL_CARDS.map(([id, name, sub]) => `<a class="tq-tool" href="tools/${id}.html">
      <img src="tools/icon-${id}.svg" alt="" width="44" height="44"><span><b>${esc(name)}</b><small>${toolStat(id) || esc(sub)}</small></span></a>`).join("");
  }

  async function load() {
    const [b] = await Promise.all([api("/api/board"), loadJobs()]);
    board = b;
    render();
    loadTools();
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
      TQAUTH.save(key);
      showApp();
    } catch (err) {
      key = "";
      const card = $(".tq-lock-card"); card.classList.remove("tq-shake"); void card.offsetWidth; card.classList.add("tq-shake");
      $("#tq-lock-msg").textContent = err.status === 401 ? "That's not it. Try again." : err.message;
    }
  });

  $("#tq-sync").addEventListener("click", async () => {
    const c = snap($("#tq-sync"));
    try { await load(); fx("sync", c, null); toast("Up to date"); } catch (e) { toast(e.message); }
  });
  $("#tq-scrim").addEventListener("click", () => togglePanel(openId));
  $("#tq-signout").addEventListener("click", (e) => { e.preventDefault(); TQAUTH.clear(); key = ""; showLock(); });
  $("#tq-touchid").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__touchid"); });
  // Touch ID / Face ID on the lock screen.
  $("#tq-passkey").hidden = !TQAUTH.supported();
  TQAUTH.prefetchLogin();
  $("#tq-passkey").addEventListener("click", async () => {
    $("#tq-lock-msg").textContent = "";
    try { key = await TQAUTH.passkeySignIn(); await load(); showApp(); fx("sync", null, null); }
    catch (err) { key = ""; $("#tq-lock-msg").textContent = err.message; }
  });
  $("#tq-bin").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__bin"); });
  $("#tq-settings").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__settings"); });
  $("#tq-anims").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__anims"); });
  $("#tq-icons").addEventListener("click", (e) => { e.preventDefault(); togglePanel("__icons"); });

  // ----- light / dark (light by default, remembered on this device) -----
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    $("#tq-theme").textContent = t === "dark" ? "☀️ Light" : "🌙 Dark";
    $("meta[name=theme-color]").content = t === "dark" ? "#0D1230" : "#FBF4D7";
  };
  try { setTheme(localStorage.getItem("tq-theme") === "dark" ? "dark" : "light"); } catch (e) { setTheme("light"); }
  $("#tq-theme").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(t); try { localStorage.setItem("tq-theme", t); } catch (e) {}
  });

  // ----- headline: the last word rotates -----
  const WORDS = ["tasks.", "clients.", "launches.", "inbox.", "family tree.", "novel.", "week."];
  let wi = 0;
  setInterval(() => {
    const w = $("#tq-rotate"); if (!w || document.hidden) return;
    w.classList.add("is-out");
    setTimeout(() => { wi = (wi + 1) % WORDS.length; w.textContent = WORDS[wi]; w.classList.remove("is-out"); }, 350);
  }, 2600);
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
  else if (key) load().then(() => { TQAUTH.save(key); showApp(); }).catch((e) => { if (e.status === 401) TQAUTH.clear(); key = ""; showLock(e.status === 401 ? "" : e.message); });
  else showLock();
})();
