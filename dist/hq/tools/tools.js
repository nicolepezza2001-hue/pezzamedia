// Tasks HQ tools (stage 7). One script for every tool page; the page says which tool it is in <body data-tool>.
// Same password as Tasks HQ (kept for this browser session only). No browser pop-ups anywhere:
// deletes are tap-twice, undo comes as a toast.
(() => {
  const API = (window.TQ_API || "").replace(/\/+$/, "");
  const TOOL = document.body.dataset.tool;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let key = window.TQAUTH ? TQAUTH.get() : sessionStorage.getItem("tq-key") || "";
  let board = null;

  // ----- basics -----
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
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoOf(new Date());
  const plusDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
  const shortDate = (iso) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "");
  const snap = (el) => (window.TQFX ? TQFX.capture(el) : null);
  const fx = (action, ctx, el) => { if (window.TQFX) TQFX.play(action, ctx, el); };
  const armed = new WeakMap();
  function armDelete(btn, go) {
    if (armed.get(btn)) { go(); return; }
    const old = btn.textContent;
    btn.classList.add("is-armed"); btn.textContent = "Tap again";
    armed.set(btn, setTimeout(() => { armed.delete(btn); btn.classList.remove("is-armed"); btn.textContent = old; }, 3000));
  }
  async function copy(text, el) {
    try { await navigator.clipboard.writeText(text); fx("copy", snap(el), el); toast("Copied"); } catch (e) { toast("Couldn't copy. Select the text and copy it yourself."); }
  }
  const projects = (group) => (board?.projects || []).filter((p) => !group || (p.group || "work") === group).sort((a, b) => (a.order || 99) - (b.order || 99));
  const projName = (id) => board?.projects.find((p) => p.id === id)?.name || "";
  const projOptions = (sel, group, blank = "No card") => `<option value="">${esc(blank)}</option>` + projects(group).map((p) => `<option value="${esc(p.id)}"${p.id === sel ? " selected" : ""}>${esc(p.name)}</option>`).join("");
  const opts = (list, sel) => list.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === sel ? " selected" : ""}>${esc(l)}</option>`; }).join("");

  // ----- a list tool (add / edit / delete with Undo) -----
  // cfg: { col, fields: [{k, label, type, options, ph, wide}], item(it) -> html, sort(a,b), filter(it) }
  function listTool(cfg) {
    let items = [], editing = null;
    const root = $("#tt-main");
    const fieldHTML = (f, v) => {
      const val = v ?? f.def ?? "";
      const lab = `<span>${esc(f.label)}</span>`;
      if (f.type === "textarea") return `<label class="tt-f tt-wide">${lab}<textarea class="tq-input" name="${f.k}" rows="${f.rows || 3}" placeholder="${esc(f.ph || "")}"${f.req ? " required" : ""}>${esc(val)}</textarea></label>`;
      if (f.type === "select") return `<label class="tt-f">${lab}<select class="tq-input" name="${f.k}">${opts(f.options, val)}</select></label>`;
      if (f.type === "project") return `<label class="tt-f">${lab}<select class="tq-input" name="${f.k}">${projOptions(val, f.group)}</select></label>`;
      return `<label class="tt-f${f.wide ? " tt-wide" : ""}">${lab}<input class="tq-input" name="${f.k}" type="${f.type || "text"}" value="${esc(val)}" placeholder="${esc(f.ph || "")}"${f.req ? " required" : ""}${f.type === "number" ? ' step="any"' : ""}></label>`;
    };
    const formHTML = (it) => `<form class="tt-form" data-id="${esc(it?.id || "")}">
      <div class="tt-grid">${cfg.fields.map((f) => fieldHTML(f, it ? it[f.k] : (cfg.prefill || {})[f.k])).join("")}</div>
      <div class="tq-form-btns"><button class="tq-btn tq-btn-main tt-save" type="submit">${it ? "Save" : esc(cfg.addLabel || "Add")}</button>${it ? `<button class="tq-btn tq-btn-soft" type="button" data-act="cancel">Cancel</button>` : ""}</div>
    </form>`;
    function draw() {
      const shown = items.filter((x) => !cfg.filter || cfg.filter(x)).sort(cfg.sort || ((a, b) => String(b.created).localeCompare(String(a.created))));
      $("#tt-list", root).innerHTML = shown.length ? shown.map((it) => editing === it.id ? `<li class="tt-item is-editing">${formHTML(it)}</li>` :
        `<li class="tt-item" data-id="${esc(it.id)}">${cfg.item(it)}<div class="tt-item-btns">${cfg.extraBtns ? cfg.extraBtns(it) : ""}<button class="tq-mini" type="button" data-act="edit">✎ Edit</button><button class="tq-mini tq-del" type="button" data-act="del">🗑</button></div></li>`).join("")
        : `<li class="tt-empty">${esc(cfg.empty || "Nothing here yet.")}</li>`;
      if (cfg.after) cfg.after(items, shown);
    }
    root.insertAdjacentHTML("beforeend", `${cfg.top || ""}
      <details class="tt-add"${cfg.openAdd ? " open" : ""}><summary>${esc(cfg.addTitle || "+ Add")}</summary>${formHTML(null)}</details>
      ${cfg.bar || ""}
      <ul id="tt-list" class="tt-list"></ul>`);
    root.addEventListener("submit", async (e) => {
      const form = e.target.closest(".tt-form"); if (!form) return;
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      for (const fd of cfg.fields) if (fd.type === "number" && f[fd.k] !== "") f[fd.k] = Number(f[fd.k]);
      if (cfg.clean) cfg.clean(f);
      try {
        if (form.dataset.id) {
          const r = await api(`/api/col/${cfg.col}/${form.dataset.id}`, { method: "PUT", body: JSON.stringify(f) });
          items = r.items; editing = null; draw();
          const el = $(`[data-id="${CSS.escape(form.dataset.id)}"]`, root); fx("edit", snap(el), el); toast("Saved");
        } else {
          const r = await api(`/api/col/${cfg.col}`, { method: "POST", body: JSON.stringify(f) });
          items = r.items; form.reset(); draw();
          const el = $(`[data-id="${CSS.escape(r.added)}"]`, root); fx("newtask", snap(el || form), el); toast("Added");
        }
      } catch (err) { toast(err.message); }
    });
    root.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      const li = b.closest("[data-id]"), id = li?.dataset.id;
      if (b.dataset.act === "cancel") { editing = null; draw(); }
      else if (b.dataset.act === "edit") { editing = id; draw(); }
      else if (b.dataset.act === "del") armDelete(b, async () => {
        const c = snap(li);
        try {
          const r = await api(`/api/col/${cfg.col}/${id}`, { method: "DELETE" });
          items = r.items; draw(); fx("del", c);
          toast("Deleted", "Undo", async () => { await api(`/api/trash/${r.trashed}/restore`, { method: "POST" }); await reload(); toast("Back again"); });
        } catch (err) { toast(err.message); }
      });
      else if (cfg.onAct) cfg.onAct(b.dataset.act, items.find((x) => x.id === id), b, { set: (list) => { items = list; draw(); }, draw });
    });
    async function reload() { items = (await api(`/api/col/${cfg.col}`)).items; draw(); }
    return { reload, draw, get items() { return items; }, set items(v) { items = v; draw(); }, edit(id) { editing = id; draw(); } };
  }

  // ===== the tools =====
  const TOOLS = {};

  // ----- 1. Notes -> Tasks -----
  TOOLS.notes = () => {
    const root = $("#tt-main");
    root.innerHTML = `<div class="tt-box">
        <textarea id="tt-notes" class="tq-input" rows="10" placeholder="Paste meeting notes, a call transcript or a long email here."></textarea>
        <div class="tq-form-btns"><button id="tt-find" class="tq-btn tq-btn-main" type="button">✨ Find tasks</button></div>
      </div><div id="tt-result"></div>`;
    let found = [];
    $("#tt-find").addEventListener("click", async (e) => {
      const notes = $("#tt-notes").value.trim();
      if (!notes) { toast("Paste some notes first"); return; }
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = "✨ Reading your notes…";
      fx("comment", snap(btn), btn);
      try {
        const r = await api("/api/notes-to-tasks", { method: "POST", body: JSON.stringify({ notes, today: todayISO() }) });
        found = r.items || [];
        $("#tt-result").innerHTML = `<div class="tt-box"><h3>Summary</h3><p>${esc(r.summary)}</p></div>
          <div class="tt-box"><h3>Possible tasks <span class="tq-n">${found.length}</span></h3>
          <p class="tt-hint">Nothing is added until you tick the ones you want and press Add. Ones already on your list are left unticked.</p>
          <ul class="tt-list">${found.map((x, i) => `<li class="tt-item tt-n2t${x.alreadyOnList ? " is-dupe" : ""}" data-i="${i}">
            <label class="tq-tick"><input type="checkbox" class="tt-pick"${x.alreadyOnList ? "" : " checked"}><span></span></label>
            <div class="tt-n2t-main">
              <input class="tq-input tt-n2t-text" value="${esc(x.text)}">
              <div class="tt-n2t-row">
                <select class="tq-input tt-n2t-proj">${projOptions(x.project, null, "Pick a card")}</select>
                <select class="tq-input tt-n2t-kind">${opts([["task", "Task"], ["waiting", "Waiting on"], ["repeat", "Repeating"]], x.kind)}</select>
                <input class="tq-input tt-n2t-who" placeholder="Who" value="${esc(x.who)}"${x.kind === "waiting" ? "" : " hidden"}>
                <input class="tq-input tt-n2t-due" type="date" value="${esc(x.due)}">
              </div>
              <small class="tt-quote">“${esc(x.quote)}”${x.alreadyOnList ? ` · <b>Already on your list:</b> ${esc(x.alreadyOnList)}` : ""}</small>
            </div></li>`).join("") || `<li class="tt-empty">No tasks in these notes.</li>`}</ul>
          ${found.length ? `<div class="tq-form-btns"><button id="tt-addsel" class="tq-btn tq-btn-main" type="button">Add ticked tasks</button></div>` : ""}</div>`;
      } catch (err) { toast(err.message); }
      btn.disabled = false; btn.textContent = "✨ Find tasks";
    });
    root.addEventListener("change", (e) => {
      if (e.target.classList.contains("tt-n2t-kind")) $(".tt-n2t-who", e.target.closest("li")).hidden = e.target.value !== "waiting";
    });
    root.addEventListener("click", async (e) => {
      if (e.target.id !== "tt-addsel") return;
      const rows = $$(".tt-n2t", root).filter((li) => $(".tt-pick", li).checked);
      if (!rows.length) { toast("Tick at least one"); return; }
      if (rows.some((li) => !$(".tt-n2t-proj", li).value)) { toast("Pick a card for each ticked task"); return; }
      let n = 0;
      for (const li of rows) {
        const kind = $(".tt-n2t-kind", li).value;
        try {
          await api("/api/tasks", { method: "POST", body: JSON.stringify({ today: todayISO(), project: $(".tt-n2t-proj", li).value, kind, text: $(".tt-n2t-text", li).value,
            who: kind === "waiting" ? $(".tt-n2t-who", li).value : "", due: kind === "waiting" ? "" : $(".tt-n2t-due", li).value || (kind === "repeat" ? todayISO() : ""),
            repeat: kind === "repeat" ? "monthly" : "", source: "Meeting notes", detail: "From your notes: " + (found[+li.dataset.i]?.quote || "") }) });
          fx("add", snap(li)); li.remove(); n++;
        } catch (err) { toast(err.message); }
      }
      toast(`✅ Added ${n} to your list`);
    });
  };

  // ----- 2. Brand kits -----
  const KIT_DEFAULTS = {
    pezza: { colours: [{ name: "Cream", hex: "#FBF4D7" }, { name: "Pink", hex: "#E8D8D5" }, { name: "Green", hex: "#C2D9BC" }, { name: "Navy", hex: "#141B41" }, { name: "Ink", hex: "#01010B" }],
             fonts: [{ name: "EB Garamond", use: "Headings and text" }, { name: "Mrs Saint Delafield", use: "Signature script" }], notes: "From pezzamedia.com. Beige backgrounds, navy accents.", checked: true },
    tmrw: { colours: [{ name: "Tmrw blue", hex: "#2755C4" }, { name: "White", hex: "#FFFFFF" }], fonts: [], notes: "White wordmark on blue. Fonts not confirmed yet.", checked: false },
  };
  TOOLS.kits = async () => {
    const root = $("#tt-main");
    let kits = (await api("/api/kits")).kits || {};
    let cur = new URLSearchParams(location.search).get("card") || "pezza";
    const fileCache = {};
    const kitOf = (id) => kits[id] || { logos: [], ...(KIT_DEFAULTS[id] || { colours: [], fonts: [], notes: "", checked: false }) };
    async function save(id, kit, el) {
      try { kits = (await api(`/api/kits/${id}`, { method: "PUT", body: JSON.stringify(kit) })).kits; draw(); if (el !== false) fx("edit", snap($(".tt-kit")), $(".tt-kit")); }
      catch (err) { toast(err.message); }
    }
    async function fileURL(fid) {
      if (!fileCache[fid]) fileCache[fid] = api(`/api/files/${fid}`).then((f) => f.data).catch(() => "");
      return fileCache[fid];
    }
    function draw() {
      const p = board.projects.find((x) => x.id === cur) || projects()[0]; cur = p.id;
      const k = kitOf(cur);
      root.innerHTML = `<div class="tt-tabs">${projects().map((x) => `<button type="button" class="tt-tab${x.id === cur ? " is-on" : ""}" data-card="${esc(x.id)}">${esc(x.name)}${kits[x.id]?.checked || (!kits[x.id] && KIT_DEFAULTS[x.id]?.checked) ? " ✓" : ""}</button>`).join("")}</div>
        <div class="tt-box tt-kit" style="--tq-tint:${esc(p.color)}">
          <div class="tt-kit-head"><h2>${esc(p.name)}</h2>
            <label class="tt-check"><input type="checkbox" id="tt-checked"${k.checked ? " checked" : ""}> Checked (real colours and fonts confirmed)</label></div>
          <h3>Logos</h3>
          <div class="tt-logos">${p.logo ? `<figure><img src="../${esc(p.logo)}" alt=""><figcaption>On the HQ card</figcaption></figure>` : ""}
            ${(k.logos || []).map((l) => `<figure data-fid="${esc(l.id)}"><img alt="" data-src="${esc(l.id)}"><figcaption>${esc(l.name || "Logo")} <button type="button" class="tq-mini tq-del" data-act="dellogo">🗑</button></figcaption></figure>`).join("")}
            <label class="tt-upload">+ Upload a logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" id="tt-logo-file" hidden></label></div>
          <h3>Colours</h3>
          <div class="tt-swatches">${(k.colours || []).map((c, i) => `<div class="tt-swatch" data-i="${i}"><span style="background:${esc(c.hex)}"></span><b>${esc(c.name)}</b><button type="button" class="tt-hex" data-act="copyhex">${esc(c.hex)}</button><button type="button" class="tq-mini tq-del" data-act="delcol">🗑</button></div>`).join("") || `<p class="tt-hint">No colours yet.</p>`}</div>
          <form class="tt-inline" id="tt-addcol"><input class="tq-input" name="name" placeholder="Name, e.g. Brand blue" required><input class="tq-input" name="hex" type="color" value="#2755C4"><button class="tq-btn tq-btn-soft" type="submit">+ Add colour</button></form>
          <h3>Fonts</h3>
          <ul class="tt-fonts">${(k.fonts || []).map((f, i) => `<li data-i="${i}"><b style="font-family:'${esc(f.name)}',inherit">${esc(f.name)}</b> <span>${esc(f.use || "")}</span> <button type="button" class="tq-mini tq-del" data-act="delfont">🗑</button></li>`).join("") || `<li class="tt-hint">No fonts yet.</li>`}</ul>
          <form class="tt-inline" id="tt-addfont"><input class="tq-input" name="name" placeholder="Font name" required><input class="tq-input" name="use" placeholder="Used for, e.g. Headings"><button class="tq-btn tq-btn-soft" type="submit">+ Add font</button></form>
          <h3>Notes</h3>
          <textarea class="tq-input" id="tt-kitnotes" rows="4" placeholder="Tone of voice, logo rules, where the files live…">${esc(k.notes || "")}</textarea>
          <div class="tq-form-btns"><button class="tq-btn tq-btn-main" type="button" data-act="savenotes">Save notes</button></div>
        </div>`;
      $$("img[data-src]", root).forEach(async (img) => { img.src = await fileURL(img.dataset.src); });
    }
    root.addEventListener("click", async (e) => {
      const tab = e.target.closest("[data-card]");
      if (tab) { cur = tab.dataset.card; history.replaceState(null, "", "?card=" + cur); draw(); return; }
      const b = e.target.closest("[data-act]"); if (!b) return;
      const k = structuredClone(kitOf(cur));
      if (b.dataset.act === "copyhex") return copy(b.textContent, b);
      if (b.dataset.act === "savenotes") { k.notes = $("#tt-kitnotes").value; await save(cur, k); toast("Saved"); return; }
      const del = (list, i) => armDelete(b, async () => { k[list].splice(i, 1); await save(cur, k, false); toast("Deleted"); });
      if (b.dataset.act === "delcol") del("colours", +b.closest("[data-i]").dataset.i);
      if (b.dataset.act === "delfont") del("fonts", +b.closest("[data-i]").dataset.i);
      if (b.dataset.act === "dellogo") armDelete(b, async () => {
        const fid = b.closest("[data-fid]").dataset.fid;
        k.logos = (k.logos || []).filter((l) => l.id !== fid);
        await save(cur, k, false); api(`/api/files/${fid}`, { method: "DELETE" }).catch(() => {}); toast("Logo removed");
      });
    });
    root.addEventListener("change", async (e) => {
      const k = structuredClone(kitOf(cur));
      if (e.target.id === "tt-checked") { k.checked = e.target.checked; await save(cur, k, false); if (k.checked) fx("tick", snap(e.target.closest("label")), null); return; }
      if (e.target.id === "tt-logo-file") {
        const file = e.target.files[0]; if (!file) return;
        try {
          const data = await shrinkImage(file, 800);
          const { id } = await api("/api/files", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ""), data }) });
          k.logos = [...(k.logos || []), { id, name: file.name.replace(/\.[^.]+$/, "") }];
          await save(cur, k); toast("Logo added");
        } catch (err) { toast(err.message); }
      }
    });
    root.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)), k = structuredClone(kitOf(cur));
      if (e.target.id === "tt-addcol") (k.colours ||= []).push({ name: f.name, hex: f.hex.toUpperCase() });
      if (e.target.id === "tt-addfont") (k.fonts ||= []).push({ name: f.name, use: f.use });
      await save(cur, k); toast("Added");
    });
    draw();
  };
  // Shrink a photo before upload (logos only need to be small). SVG goes up as it is.
  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onerror = () => rej(new Error("Couldn't read that file"));
      r.onload = () => {
        if (file.type === "image/svg+xml") return res(r.result);
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9));
        };
        img.onerror = () => rej(new Error("That isn't an image"));
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // ----- 3. Proof bank -----
  const PROOF_SEED = [
    ["$3.06M", "Tmrw email revenue Oct 2025 to Sep 2026, 54% of store revenue", "Tmrw", "Oct 2025 to Sep 2026", "Klaviyo"],
    ["$649K", "Tmrw welcome flow revenue", "Tmrw", "Oct 2025 to Sep 2026", "Klaviyo"],
    ["$944K", "Tmrw subscription renewal reminder flow, 28% placed-order rate", "Tmrw", "Oct 2025 to Sep 2026", "Klaviyo"],
    ["$427K", "Tmrw post-purchase nurture flow revenue", "Tmrw", "Oct 2025 to Sep 2026", "Klaviyo"],
    ["$59,480", "Tmrw Lab 12 newsletter revenue at a 61% open rate", "Tmrw", "2026", "Klaviyo"],
    ["55%", "Tmrw Lab average open rate (last six issues 61%)", "Tmrw", "since May 2026", "Klaviyo"],
    ["$440K+", "Simply Science newsletter revenue, 130+ sends to 2M+ inboxes", "Simply Nootropics", "Feb 2024 to now", "Klaviyo"],
    ["$409K", "Simply Nootropics Black Friday 2025 from Klaviyo, 51% of the store's $799K", "Simply Nootropics", "Black Friday 2025", "Klaviyo"],
    ["$2.1M", "Simply Nootropics campaign revenue, 224 campaigns", "Simply Nootropics", "last 12 months (to Oct 2026)", "Klaviyo"],
    ["600+ / 80M+ / $6M+", "Blogs written / emails sent / revenue from copy", "All", "career", "Nicky"],
    ["10,000+", "Five-star reviews on brands she writes for", "All", "career", "Nicky"],
    ["8", "Tmrw press placements (paid, via Linkby: never call them earned)", "Tmrw", "Apr to Sep 2026", "Linkby"],
  ];
  TOOLS.proof = () => {
    let q = "";
    const t = listTool({
      col: "proof", addTitle: "+ Add a number", openAdd: false, empty: "No numbers yet.",
      fields: [{ k: "stat", label: "The number", ph: "$649K", req: true }, { k: "what", label: "What it is", ph: "Tmrw welcome flow revenue", wide: true, req: true },
        { k: "brand", label: "Brand", ph: "Tmrw" }, { k: "period", label: "When", ph: "Oct 2025 to Sep 2026" }, { k: "source", label: "Where it's from", ph: "Klaviyo" },
        { k: "use", label: "OK to use?", type: "select", options: [["yes", "Yes, name the brand"], ["anon", "Only without the brand name"], ["ask", "Ask first"]] },
        { k: "note", label: "Note", type: "textarea", rows: 2 }],
      bar: `<div class="tt-bar"><input class="tq-input" id="tt-q" placeholder="Search numbers"><span class="tt-hint" id="tt-seedbox"></span></div>`,
      filter: (x) => !q || JSON.stringify(x).toLowerCase().includes(q),
      item: (x) => `<div class="tt-proof"><b class="tt-stat">${esc(x.stat)}</b><div><p>${esc(x.what)}</p><small>${esc([x.brand, x.period, x.source].filter(Boolean).join(" · "))}${x.use === "anon" ? " · <i>no brand name</i>" : x.use === "ask" ? " · <i>ask first</i>" : ""}</small>${x.note ? `<small class="tt-note">${esc(x.note)}</small>` : ""}</div></div>`,
      extraBtns: () => `<button class="tq-mini" type="button" data-act="copy">Copy</button>`,
      onAct: (a, it, b) => { if (a === "copy") copy(`${it.stat}: ${it.what}${it.period ? ` (${it.period})` : ""}`, b.closest("li")); },
      after: (items) => { $("#tt-seedbox").innerHTML = items.length ? "" : `<button class="tq-btn tq-btn-main" type="button" id="tt-seed">Add my ${PROOF_SEED.length} known numbers</button>`; },
    });
    $("#tt-main").addEventListener("input", (e) => { if (e.target.id === "tt-q") { q = e.target.value.toLowerCase(); t.draw(); } });
    $("#tt-main").addEventListener("click", async (e) => {
      if (e.target.id !== "tt-seed") return;
      e.target.disabled = true;
      for (const [stat, what, brand, period, source] of PROOF_SEED) await api("/api/col/proof", { method: "POST", body: JSON.stringify({ stat, what, brand, period, source, use: "yes" }) });
      await t.reload(); fx("newtask", snap($("#tt-list"))); toast("Added your numbers");
    });
    return t.reload();
  };

  // ----- 4. Content calendar -----
  const CHANNELS = ["Newsletter", "Blog", "Email campaign", "Substack", "Medium", "Instagram", "LinkedIn", "TikTok", "PR", "Other"];
  const STATUSES = [["idea", "Idea"], ["draft", "Drafting"], ["ready", "Ready"], ["scheduled", "Scheduled"], ["published", "Published"]];
  TOOLS.calendar = () => {
    let month = todayISO().slice(0, 7);
    const t = listTool({
      col: "calendar", addTitle: "+ Add a post", empty: "Nothing planned this month.",
      fields: [{ k: "date", label: "Date", type: "date", req: true, def: todayISO() }, { k: "title", label: "What", ph: "Tmrw Lab 14: sleep issue", wide: true, req: true },
        { k: "project", label: "Card", type: "project" }, { k: "channel", label: "Channel", type: "select", options: CHANNELS },
        { k: "status", label: "Status", type: "select", options: STATUSES }, { k: "link", label: "Link", type: "url", ph: "https://" }, { k: "note", label: "Note", type: "textarea", rows: 2 }],
      top: `<div class="tt-bar tt-month"><button class="tq-btn tq-btn-soft" type="button" data-act="prev">‹</button><h2 id="tt-mname"></h2><button class="tq-btn tq-btn-soft" type="button" data-act="next">›</button><button class="tq-btn tq-btn-soft" type="button" data-act="now">Today</button></div><div id="tt-grid" class="tt-cal"></div>`,
      filter: (x) => String(x.date).startsWith(month),
      sort: (a, b) => String(a.date).localeCompare(String(b.date)),
      item: (x) => `<div class="tt-calrow"><b>${esc(shortDate(x.date))}</b><div><p>${esc(x.title)}</p><small>${esc([x.channel, projName(x.project)].filter(Boolean).join(" · "))}</small></div><span class="tt-pill is-${esc(x.status)}">${esc((STATUSES.find((s) => s[0] === x.status) || ["", ""])[1])}</span>${x.link ? `<a class="tq-mini" href="${esc(x.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""}</div>`,
      onAct: (a) => {
        if (a === "prev" || a === "next") { const d = new Date(month + "-01T00:00:00"); d.setMonth(d.getMonth() + (a === "next" ? 1 : -1)); month = isoOf(d).slice(0, 7); t.draw(); }
        if (a === "now") { month = todayISO().slice(0, 7); t.draw(); }
      },
      after: (items) => {
        const first = new Date(month + "-01T00:00:00");
        $("#tt-mname").textContent = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
        const start = (first.getDay() + 6) % 7, days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
        const heads = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<b class="tt-cal-h">${d}</b>`).join("");
        const cells = [...Array(start)].map(() => `<span class="tt-cal-d is-blank"></span>`).join("") + [...Array(days)].map((_, i) => {
          const iso = `${month}-${pad(i + 1)}`, on = items.filter((x) => x.date === iso);
          return `<button type="button" class="tt-cal-d${iso === todayISO() ? " is-today" : ""}" data-day="${iso}"><i>${i + 1}</i>${on.map((x) => `<span class="tt-cal-ev is-${esc(x.status)}" title="${esc(x.title)}">${esc(x.title)}</span>`).join("")}</button>`;
        }).join("");
        $("#tt-grid").innerHTML = heads + cells;
      },
    });
    $("#tt-main").addEventListener("click", (e) => {
      const d = e.target.closest("[data-day]"); if (!d) return;
      const det = $(".tt-add"); det.open = true; $("[name=date]", det).value = d.dataset.day; $("[name=title]", det).focus();
    });
    return t.reload();
  };

  // ----- 5. Swipe file -----
  const SWIPE_KINDS = ["Subject line", "Preview text", "Headline", "Hook / opener", "CTA", "Whole email", "Ad", "Landing page", "Other"];
  TOOLS.swipe = () => {
    let q = "", kind = "";
    const t = listTool({
      col: "swipe", addTitle: "+ Save something good", empty: "Nothing saved yet. Keep lines you love here.",
      fields: [{ k: "text", label: "The copy", type: "textarea", rows: 3, req: true }, { k: "kind", label: "Type", type: "select", options: SWIPE_KINDS },
        { k: "source", label: "From", ph: "Brand or person" }, { k: "link", label: "Link", type: "url", ph: "https://" }, { k: "why", label: "Why it works", type: "textarea", rows: 2 }, { k: "tags", label: "Tags", ph: "supplements, urgency" }],
      bar: `<div class="tt-bar"><input class="tq-input" id="tt-q" placeholder="Search"><select class="tq-input" id="tt-kind"><option value="">All types</option>${opts(SWIPE_KINDS)}</select></div>`,
      filter: (x) => (!kind || x.kind === kind) && (!q || JSON.stringify(x).toLowerCase().includes(q)),
      item: (x) => `<div class="tt-swipe"><span class="tt-pill">${esc(x.kind)}</span><blockquote>${esc(x.text)}</blockquote><small>${esc([x.source, x.tags].filter(Boolean).join(" · "))}${x.link ? ` · <a href="${esc(x.link)}" target="_blank" rel="noopener">source ↗</a>` : ""}</small>${x.why ? `<small class="tt-note">${esc(x.why)}</small>` : ""}</div>`,
      extraBtns: () => `<button class="tq-mini" type="button" data-act="copy">Copy</button>`,
      onAct: (a, it, b) => { if (a === "copy") copy(it.text, b.closest("li")); },
    });
    $("#tt-main").addEventListener("input", (e) => { if (e.target.id === "tt-q") { q = e.target.value.toLowerCase(); t.draw(); } });
    $("#tt-main").addEventListener("change", (e) => { if (e.target.id === "tt-kind") { kind = e.target.value; t.draw(); } });
    return t.reload();
  };

  // ----- 6. Tallulah tracker: word count + queries -----
  const Q_KINDS = ["Agent", "Indie press", "Competition", "Magazine", "Other"];
  const Q_STATUS = [["planned", "Planned"], ["sent", "Sent"], ["partial", "Asked for partial"], ["full", "Asked for full"], ["noreply", "No reply"], ["rejected", "Rejected"], ["offer", "Offer! 🎉"]];
  TOOLS.tallulah = async () => {
    const root = $("#tt-main");
    root.innerHTML = `<div class="tt-box" id="tt-words"></div><h2 class="tt-h2">Queries, presses and competitions</h2>`;
    let words = (await api("/api/col/words")).items;
    function drawWords() {
      const log = words.filter((x) => !x.goal).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const goal = words.find((x) => x.goal)?.words || 90000, last = log[log.length - 1]?.words || 0;
      const weekAgo = plusDays(todayISO(), -7), before = [...log].reverse().find((x) => x.date <= weekAgo)?.words ?? (log[0]?.words || 0);
      const pts = log.slice(-30), ws = pts.map((x) => x.words || 0), lo = Math.min(...ws, 0), hi = Math.max(...ws, 1);
      const line = pts.map((x, i) => `${pts.length < 2 ? 0 : (i / (pts.length - 1)) * 300},${58 - (((x.words || 0) - lo) / (hi - lo || 1)) * 54}`).join(" ");
      $("#tt-words").innerHTML = `<div class="tt-words-top"><div><p class="tq-eyebrow">Tallulah Has Nothing</p><h2><b>${last.toLocaleString()}</b> words</h2>
          <p class="tt-hint">${Math.round((last / goal) * 100)}% of your ${goal.toLocaleString()} goal · ${last - before >= 0 ? "+" : ""}${(last - before).toLocaleString()} this week</p></div>
          ${pts.length > 1 ? `<svg class="tt-spark" viewBox="0 0 300 60" preserveAspectRatio="none"><polyline points="${line}" fill="none" stroke="#7A4E9C" stroke-width="2.5"/></svg>` : ""}</div>
        <div class="tt-progress"><span style="width:${Math.min(100, (last / goal) * 100)}%"></span></div>
        <form class="tt-inline" id="tt-wlog"><label class="tt-f"><span>Total words now</span><input class="tq-input" name="words" type="number" min="0" required value="${last || ""}"></label><label class="tt-f"><span>Date</span><input class="tq-input" name="date" type="date" value="${todayISO()}"></label><button class="tq-btn tq-btn-main" type="submit">Log it</button></form>
        <details class="tt-add"><summary>Change the goal</summary><form class="tt-inline" id="tt-wgoal"><input class="tq-input" name="goal" type="number" min="1000" value="${goal}"><button class="tq-btn tq-btn-soft" type="submit">Save goal</button></form></details>`;
    }
    drawWords();
    root.addEventListener("submit", async (e) => {
      if (!["tt-wlog", "tt-wgoal"].includes(e.target.id)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const f = Object.fromEntries(new FormData(e.target));
      try {
        if (e.target.id === "tt-wgoal") {
          const g = words.find((x) => x.goal);
          words = (await api(g ? `/api/col/words/${g.id}` : "/api/col/words", { method: g ? "PUT" : "POST", body: JSON.stringify({ goal: true, words: Number(f.goal) }) })).items;
          toast("Goal saved");
        } else {
          const same = words.find((x) => !x.goal && x.date === f.date);
          words = (await api(same ? `/api/col/words/${same.id}` : "/api/col/words", { method: same ? "PUT" : "POST", body: JSON.stringify({ date: f.date, words: Number(f.words) }) })).items;
          fx("habit", snap($("#tt-words")), $("#tt-words")); toast("Logged");
        }
        drawWords();
      } catch (err) { toast(err.message); }
    }, true);
    const t = listTool({
      col: "queries", addTitle: "+ Add a query or entry", empty: "No queries yet.",
      fields: [{ k: "name", label: "Who", ph: "Agent or prize name", req: true }, { k: "kind", label: "Type", type: "select", options: Q_KINDS }, { k: "agency", label: "Agency / publisher" },
        { k: "status", label: "Status", type: "select", options: Q_STATUS }, { k: "sent", label: "Sent on", type: "date" }, { k: "followUp", label: "Deadline or follow up", type: "date" },
        { k: "link", label: "Link", type: "url", ph: "https://" }, { k: "note", label: "Notes", type: "textarea", rows: 2 }],
      sort: (a, b) => String(a.followUp || "9999").localeCompare(String(b.followUp || "9999")),
      item: (x) => `<div class="tt-calrow"><b>${esc(x.kind)}</b><div><p>${esc(x.name)}${x.agency ? ` · ${esc(x.agency)}` : ""}</p><small>${x.sent ? "Sent " + esc(shortDate(x.sent)) : ""}${x.followUp ? `${x.sent ? " · " : ""}<span class="${x.followUp <= todayISO() ? "tt-due" : ""}">Next: ${esc(shortDate(x.followUp))}</span>` : ""}</small>${x.note ? `<small class="tt-note">${esc(x.note)}</small>` : ""}</div><span class="tt-pill is-${esc(x.status)}">${esc((Q_STATUS.find((s) => s[0] === x.status) || ["", ""])[1])}</span>${x.link ? `<a class="tq-mini" href="${esc(x.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""}</div>`,
    });
    return t.reload();
  };

  // ----- 7. Pitch tracker -----
  const P_KINDS = ["Client", "Guest post", "Press", "Podcast", "Partnership", "Other"];
  const P_STATUS = [["draft", "Draft"], ["sent", "Sent"], ["replied", "Replied"], ["won", "Won 🎉"], ["lost", "No"]];
  TOOLS.pitches = () => {
    let show = "open";
    const t = listTool({
      col: "pitches", addTitle: "+ Add a pitch", empty: "No pitches here.",
      fields: [{ k: "who", label: "Who", ph: "First name", req: true }, { k: "company", label: "Company / outlet", req: true }, { k: "kind", label: "Type", type: "select", options: P_KINDS },
        { k: "status", label: "Status", type: "select", options: P_STATUS, def: "sent" }, { k: "sent", label: "Sent on", type: "date", def: todayISO() }, { k: "followUp", label: "Follow up on", type: "date", def: plusDays(todayISO(), 5) },
        { k: "project", label: "Card", type: "project", group: "work" }, { k: "link", label: "Link", type: "url", ph: "https://" }, { k: "note", label: "Notes", type: "textarea", rows: 2 }],
      bar: `<div class="tt-bar"><div class="tq-seg"><button type="button" class="tq-seg-btn is-on" data-show="open">Open</button><button type="button" class="tq-seg-btn" data-show="done">Won and lost</button></div><span class="tt-hint" id="tt-pstats"></span></div>`,
      filter: (x) => (show === "open") === !["won", "lost"].includes(x.status),
      sort: (a, b) => String(a.followUp || "9999").localeCompare(String(b.followUp || "9999")),
      item: (x) => `<div class="tt-calrow"><b>${esc(x.kind)}</b><div><p>${esc(x.who)} · ${esc(x.company)}</p><small>${x.sent ? "Sent " + esc(shortDate(x.sent)) : ""}${x.followUp && !["won", "lost"].includes(x.status) ? ` · <span class="${x.followUp <= todayISO() ? "tt-due" : ""}">Follow up ${esc(shortDate(x.followUp))}</span>` : ""}</small>${x.note ? `<small class="tt-note">${esc(x.note)}</small>` : ""}</div><span class="tt-pill is-${esc(x.status)}">${esc((P_STATUS.find((s) => s[0] === x.status) || ["", ""])[1])}</span>${x.link ? `<a class="tq-mini" href="${esc(x.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""}</div>`,
      extraBtns: (x) => ["won", "lost"].includes(x.status) ? "" : `<button class="tq-mini" type="button" data-act="chased">🔔 Followed up</button>`,
      onAct: async (a, it, b, h) => {
        if (a !== "chased") return;
        const c = snap(b.closest("li"));
        try { h.set((await api(`/api/col/pitches/${it.id}`, { method: "PUT", body: JSON.stringify({ followUp: plusDays(todayISO(), 7), chased: (it.chased || 0) + 1 }) })).items); fx("chased", c); toast("Next follow-up in 7 days"); }
        catch (err) { toast(err.message); }
      },
      after: (items) => {
        const sent = items.filter((x) => x.status !== "draft").length, won = items.filter((x) => x.status === "won").length;
        $("#tt-pstats").textContent = sent ? `${sent} sent · ${won} won · ${Math.round((won / sent) * 100)}% win rate` : "";
      },
    });
    $("#tt-main").addEventListener("click", (e) => {
      const s = e.target.closest("[data-show]"); if (!s) return;
      show = s.dataset.show; $$("[data-show]").forEach((x) => x.classList.toggle("is-on", x === s)); t.draw();
    });
    return t.reload();
  };

  // ----- 8. Focus timer -----
  TOOLS.focus = async () => {
    const root = $("#tt-main");
    const ST = "tq-focus";
    let st = null; try { st = JSON.parse(localStorage.getItem(ST) || "null"); } catch (e) {}
    let log = (await api("/api/col/focus")).items, tick = null;
    const save = () => { try { st ? localStorage.setItem(ST, JSON.stringify(st)) : localStorage.removeItem(ST); } catch (e) {} };
    const openTasks = (pid) => (board.tasks || []).filter((x) => !x.done && (!pid || x.project === pid));
    root.innerHTML = `<div class="tt-box tt-focus">
        <div class="tt-clock" id="tt-clock">25:00</div>
        <div class="tq-seg" id="tt-len">${[15, 25, 50, 90].map((m) => `<button type="button" class="tq-seg-btn${m === 25 ? " is-on" : ""}" data-min="${m}">${m} min</button>`).join("")}</div>
        <div class="tt-grid">
          <label class="tt-f"><span>Card</span><select class="tq-input" id="tt-fproj">${projOptions("", null, "Any card")}</select></label>
          <label class="tt-f tt-wide"><span>Working on</span><select class="tq-input" id="tt-ftask"></select></label>
        </div>
        <div class="tq-form-btns tt-focus-btns"><button class="tq-btn tq-btn-main" id="tt-fgo" type="button">▶ Start</button><button class="tq-btn tq-btn-soft" id="tt-fstop" type="button" hidden>■ Stop and log</button></div>
      </div>
      <div class="tt-box"><h3>Focus time</h3><div id="tt-fstats"></div><ul class="tt-list" id="tt-flog"></ul></div>`;
    let mins = 25;
    const fillTasks = () => { $("#tt-ftask").innerHTML = `<option value="">Just focusing</option>` + openTasks($("#tt-fproj").value).map((x) => `<option value="${esc(x.id)}">${esc(x.text)}</option>`).join(""); };
    fillTasks();
    const fmt = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
    function drawLog() {
      const t = todayISO(), wk = plusDays(t, -6);
      const today = log.filter((x) => x.day === t), week = log.filter((x) => x.day >= wk);
      const sum = (l) => l.reduce((a, x) => a + (x.minutes || 0), 0);
      $("#tt-fstats").innerHTML = `<p class="tt-hint"><b>${sum(today)} min</b> today · <b>${Math.round(sum(week) / 6) / 10} h</b> this week · ${today.length} ${today.length === 1 ? "session" : "sessions"} today</p>`;
      $("#tt-flog").innerHTML = today.slice().reverse().map((x) => `<li class="tt-item" data-id="${esc(x.id)}"><div class="tt-calrow"><b>${esc(new Date(x.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }))}</b><div><p>${esc(x.task || "Focus")}</p><small>${esc(projName(x.project))}</small></div><span class="tt-pill">${x.minutes} min</span></div></li>`).join("") || `<li class="tt-empty">No focus sessions yet today.</li>`;
    }
    drawLog();
    function show() {
      const left = st ? (st.paused ? st.left : Math.max(0, (st.end - Date.now()) / 1000)) : mins * 60;
      $("#tt-clock").textContent = fmt(left);
      document.title = st ? `${fmt(left)} · Focus` : "Focus timer · Tasks HQ";
      $("#tt-fgo").textContent = !st ? "▶ Start" : st.paused ? "▶ Keep going" : "❚❚ Pause";
      $("#tt-fstop").hidden = !st;
      $(".tt-focus").classList.toggle("is-running", !!st && !st.paused);
      if (st && !st.paused && left <= 0) finish(true);
    }
    function chime() {
      try {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        [660, 880, 990].forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.0001, ac.currentTime + i * 0.25); g.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + i * 0.25 + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + i * 0.25 + 0.6);
          o.start(ac.currentTime + i * 0.25); o.stop(ac.currentTime + i * 0.25 + 0.7); });
      } catch (e) {}
    }
    async function finish(full) {
      const s = st; st = null; save(); clearInterval(tick);
      const used = Math.round((s.total - (s.paused ? s.left : Math.max(0, (s.end - Date.now()) / 1000))) / 60);
      show();
      if (used < 1) { toast("Stopped. Nothing logged (under a minute)."); return; }
      try {
        log = (await api("/api/col/focus", { method: "POST", body: JSON.stringify({ day: todayISO(), start: s.start, minutes: used, project: s.project, taskId: s.taskId, task: s.task }) })).items;
        drawLog();
        if (full) { chime(); fx("focus", snap($(".tt-focus")), $(".tt-focus")); toast(`🎉 ${used} minutes of focus logged`); } else toast(`Logged ${used} min`);
      } catch (err) { toast(err.message); }
    }
    root.addEventListener("click", (e) => {
      const m = e.target.closest("[data-min]");
      if (m && !st) { mins = +m.dataset.min; $$("[data-min]").forEach((b) => b.classList.toggle("is-on", b === m)); show(); return; }
      if (e.target.id === "tt-fgo") {
        if (!st) {
          const sel = $("#tt-ftask");
          st = { start: new Date().toISOString(), total: mins * 60, end: Date.now() + mins * 60000, project: $("#tt-fproj").value, taskId: sel.value, task: sel.value ? sel.selectedOptions[0].textContent : "" };
          fx("newtask", snap($("#tt-clock")), $("#tt-clock"));
        } else if (st.paused) { st.end = Date.now() + st.left * 1000; delete st.paused; delete st.left; }
        else { st.left = Math.max(0, (st.end - Date.now()) / 1000); st.paused = true; }
        save(); clearInterval(tick); tick = setInterval(show, 500); show();
      }
      if (e.target.id === "tt-fstop") armDelete(e.target, () => finish(false));
    });
    root.addEventListener("change", (e) => { if (e.target.id === "tt-fproj") fillTasks(); });
    if (st) tick = setInterval(show, 500);
    show();
  };

  // ===== start up =====
  const NAMES = { notes: "Notes → Tasks", kits: "Brand kits", proof: "Proof bank", calendar: "Content calendar", swipe: "Swipe file", tallulah: "Tallulah tracker", pitches: "Pitch tracker", focus: "Focus timer" };
  function showLock(msg) {
    $("#tt-app").hidden = true; $("#tq-lock").hidden = false;
    $("#tq-lock-msg").textContent = msg || "";
    setTimeout(() => $("#tq-pw").focus(), 50);
  }
  async function start() {
    try {
      board = await api("/api/board");
    } catch (e) {
      if (e.status === 401) { const had = !!key; TQAUTH.clear(); key = ""; return showLock(had ? "That's not it. Try again." : ""); }
      return showLock(e.message);
    }
    TQAUTH.save(key);
    $("#tq-lock").hidden = true; $("#tt-app").hidden = false;
    if (window.TQFX) TQFX.picks = { ...(board.settings?.anims || {}) };
    $("#tt-title").textContent = NAMES[TOOL] || "Tool";
    try { await TOOLS[TOOL](); } catch (e) { toast(e.message); }
  }
  $("#tq-lock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    key = $("#tq-pw").value;
    start();
  });
  $("#tq-passkey").hidden = !TQAUTH.supported();
  $("#tq-passkey").addEventListener("click", async () => {
    $("#tq-lock-msg").textContent = "";
    try { key = await TQAUTH.passkeySignIn(); start(); } catch (err) { $("#tq-lock-msg").textContent = err.message; }
  });
  $("#tt-theme")?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    if (dark) document.documentElement.dataset.theme = "dark"; else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("tq-theme", dark ? "dark" : "light"); } catch (e) {}
  });
  if (key) start(); else showLock("");
})();
