// Tasks HQ Worker: one Durable Object ("Board") holds everything.
// Every /api call needs the password in the X-Key header (Worker secret KEY).
import { DurableObject } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";

const ORIGINS = ["https://pezzamedia.com", "https://www.pezzamedia.com"];
const TRASH_MAX = 500;

function cors(req) {
  const o = req.headers.get("Origin") || "";
  const ok = ORIGINS.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (data, status, req) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors(req) } });

function sameKey(a, b) {
  const x = new TextEncoder().encode(a || ""), y = new TextEncoder().encode(b || "");
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0 && x.length > 0;
}

// The two background checkers: Nicky's own Claude and her work Claude.
const SWEEPERS = ["claude", "work"];
async function sweepKey(password, who) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("tasks-hq-sweep:" + who));
  return "sw_" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
// What a background check may do: read the board, post suggestions, answer comments,
// record its run, and tick a task done when there's clear evidence (review only).
function sweepAllowed(method, path) {
  const p = path.replace(/\/+$/, "");
  if (method === "GET") return ["/api/board", "/api/suggestions/log", "/api/ping"].includes(p);
  if (method === "POST") return p === "/api/suggestions" || p === "/api/sweep" ||
    /^\/api\/suggestions\/[\w-]+\/reply$/.test(p) || /^\/api\/tasks\/[\w-]+\/done$/.test(p);
  return false;
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (url.pathname === "/" ) return json({ ok: true, app: "Tasks HQ" }, 200, req);
    if (!env.KEY) return json({ error: "Password not set on the Worker yet" }, 503, req);
    const stub = env.BOARD.get(env.BOARD.idFromName("main"));
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    if (await stub.tooManyFails(ip)) return json({ error: "Too many wrong tries. Wait 10 minutes." }, 429, req);
    // Owner = the password. Background checks use their own limited key (X-Sweep),
    // derived from the password, so no extra secret is needed and they can't edit tasks.
    let role = null;
    if (sameKey(req.headers.get("X-Key"), env.KEY)) role = "owner";
    else if (req.headers.get("X-Sweep")) {
      for (const who of SWEEPERS) if (sameKey(req.headers.get("X-Sweep"), await sweepKey(env.KEY, who))) role = who;
    }
    if (!role) {
      await stub.fail(ip);
      return json({ error: "Wrong password" }, 401, req);
    }
    if (role !== "owner" && !sweepAllowed(req.method, url.pathname)) return json({ error: "The background check can't do that" }, 403, req);
    try {
      const body = ["POST", "PUT"].includes(req.method) ? await req.json().catch(() => ({})) : null;
      const [status, data] = await stub.handle(req.method, url.pathname, body, role);
      return json(data, status, req);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, req);
    }
  },
};


const uid = () => crypto.randomUUID().slice(0, 8);
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const KINDS = ["task", "waiting", "repeat"];
const REPEATS = ["weekly", "monthly", "quarterly", "yearly"];
function addPeriod(iso, repeat) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (repeat === "weekly") dt.setUTCDate(dt.getUTCDate() + 7);
  else {
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[repeat] || 1;
    const day = dt.getUTCDate();
    dt.setUTCDate(1);
    dt.setUTCMonth(dt.getUTCMonth() + months);
    const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
    dt.setUTCDate(Math.min(day, last));
  }
  return dt.toISOString().slice(0, 10);
}
// Keep only the fields a task may have, trimmed and checked.
function cleanTask(input, base = {}) {
  const t = { ...base };
  for (const k of ["text", "detail", "link", "source", "who"]) {
    if (k in input) t[k] = String(input[k] ?? "").trim().slice(0, k === "detail" ? 4000 : 500);
  }
  for (const k of ["due", "asked"]) if (k in input) t[k] = isDate(input[k]) ? input[k] : "";
  if ("kind" in input && KINDS.includes(input.kind)) t.kind = input.kind;
  if ("repeat" in input) t.repeat = REPEATS.includes(input.repeat) ? input.repeat : "";
  if ("project" in input) t.project = String(input.project);
  t.kind ||= "task";
  if (t.kind === "repeat" && !t.repeat) t.repeat = "monthly";
  return t;
}

// ----- suggestions -----
const LOG_MAX = 3000;
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
function similar(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 2)), B = new Set(norm(b).split(" ").filter((w) => w.length > 2));
  if (!A.size || !B.size) return norm(a) === norm(b);
  let both = 0; for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both) >= 0.8;
}
// Structured reply the comment fixer must return.
const FIX_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["reply", "action", "changes", "rule"],
  properties: {
    reply: { type: "string", description: "One short plain sentence saying what you changed, e.g. 'Moved to Tmrw and set due Fri 21 Nov.'" },
    action: { type: "string", enum: ["none", "accept", "dismiss"] },
    changes: {
      type: "object", additionalProperties: false,
      required: ["project", "text", "detail", "due", "kind", "who", "repeat"],
      properties: {
        project: { anyOf: [{ type: "null" }, { type: "string" }] }, text: { anyOf: [{ type: "null" }, { type: "string" }] },
        detail: { anyOf: [{ type: "null" }, { type: "string" }] },
        due: { anyOf: [{ type: "null" }, { type: "string" }], description: "YYYY-MM-DD, or empty string to clear" },
        kind: { anyOf: [{ type: "null" }, { type: "string", enum: ["task", "waiting", "repeat"] }] },
        who: { anyOf: [{ type: "null" }, { type: "string" }] },
        repeat: { anyOf: [{ type: "null" }, { type: "string", enum: ["weekly", "monthly", "quarterly", "yearly"] }] },
      },
    },
    rule: { anyOf: [{ type: "null" }, {
      type: "object", additionalProperties: false, required: ["project", "text", "detail"],
      properties: { project: { type: "string" }, text: { type: "string" }, detail: { type: "string" } },
    }] },
  },
};
async function askClaudeToFix(env, { suggestion, comment, projects, today }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const system = `You fix one suggested task on Nicky's private task board after she comments on it.
Today is ${today} (her local date). Cards (id: name, group, what it is):
${projects.map((p) => `- ${p.id}: ${p.name} (${p.group}) ${p.blurb || ""}`).join("\n")}
Rules:
- Apply exactly what her comment asks. Leave every other field null (null = unchanged).
- Personal things never go on a work card, and work things never on a personal card.
- Task text starts with a verb, plain words, max ~90 characters. Only set a due date when there is a real one; turn "next Friday" etc. into YYYY-MM-DD from today's date.
- "waiting" means she asked someone for something: set who to their first name.
- action is "accept" only if she clearly says to add/accept it, "dismiss" only if she clearly says to drop/remove it; otherwise "none".
- If her comment states a lasting rule for a card ("always...", "never...", "from now on..."), also return it as rule, with the card id; otherwise rule is null.
- reply: one short friendly sentence in plain English saying what you changed. No jargon.`;
  const res = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: FIX_SCHEMA } },
    system,
    messages: [{ role: "user", content: `Suggestion:\n${JSON.stringify(suggestion, null, 1)}\n\nHer comment:\n${comment}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("Claude declined");
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

const DEFAULT_PROJECTS = [
  { id: "sn", name: "Simply Nootropics", group: "work", blurb: "Day job: senior content strategist.",
    logo: "logos/sn.png", color: "#A9D3EE", dashboard: "", order: 1 },
  { id: "tmrw", name: "Tmrw", group: "work", blurb: "Klaviyo, Tmrw Lab, blogs, PR.",
    logo: "logos/tmrw.png", color: "#2755C4", dashboard: "", order: 2 },
  { id: "pezza", name: "Pezza Media", group: "work", blurb: "Freelance clients and invoices.",
    logo: "logos/pezza.png", color: "#E8D8D5", dashboard: "", order: 3 },
  { id: "jobs", name: "Looking for a job", group: "work", special: "jobs", blurb: "Job picks, proposals, outreach.",
    icon: "💼", color: "#C2D9BC", dashboard: "/jobs/", order: 4 },
  { id: "study", name: "Study", group: "personal", blurb: "My StudyHub.", icon: "📚", color: "#F3D9A4", dashboard: "https://frolickingnicky.com/hub/", order: 11 },
  { id: "family", name: "Family research", group: "personal", blurb: "Family history digging.", icon: "🌳", color: "#B8D8C8", dashboard: "", order: 12 },
  { id: "tallulah", name: "Tallulah writing", group: "personal", blurb: "Tallulah Has Nothing.", icon: "✍️", color: "#D9C6EC", dashboard: "", order: 13 },
  { id: "frolic", name: "Frolicking Nicky", group: "personal", blurb: "Travel, fun and adventures.", icon: "🌸", color: "#F6C6D0", dashboard: "", order: 14 },
];
const SEED_VERSION = 3;

export class Board extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.env = env;
    this.fails = new Map();
  }
  async load() {
    if (this.data) return this.data;
    let d = await this.ctx.storage.get("board");
    if (!d) {
      d = { version: 1, created: new Date().toISOString(), projects: DEFAULT_PROJECTS, tasks: [], notes: [],
            suggestions: [], suggestionLog: [], trash: [], lastSweep: null, settings: {} };
      await this.ctx.storage.put("board", d);
    }
    for (const k of ["projects", "tasks", "notes", "suggestions", "suggestionLog", "trash"]) d[k] ||= [];
    d.settings ||= {};
    if ((d.settings.seedVersion || 1) < SEED_VERSION) {
      // Add new default cards and refresh the default ones; projects Nicky added herself are kept.
      for (const def of DEFAULT_PROJECTS) {
        const i = d.projects.findIndex((x) => x.id === def.id);
        if (i >= 0) d.projects[i] = { ...d.projects[i], ...def }; else d.projects.push(def);
      }
      d.settings.seedVersion = SEED_VERSION;
      await this.ctx.storage.put("board", d);
    }
    this.data = d;
    return d;
  }
  async save() {
    this.data.updated = new Date().toISOString();
    await this.ctx.storage.put("board", this.data);
  }
  tooManyFails(ip) {
    const f = this.fails.get(ip);
    return !!f && f.n >= 10 && Date.now() - f.t < 600000;
  }
  fail(ip) {
    const f = this.fails.get(ip);
    if (!f || Date.now() - f.t > 600000) this.fails.set(ip, { n: 1, t: Date.now() });
    else f.n++;
  }
  trashItem(kind, item) {
    this.data.trash.unshift({ tid: uid(), kind, item, deleted: new Date().toISOString() });
    this.data.trash.length = Math.min(this.data.trash.length, TRASH_MAX);
  }

  async handle(method, path, body, role = "owner") {
    const d = await this.load();
    const p = path.replace(/\/+$/, "");
    if (p === "/api/ping") return [200, { ok: true }];
    if (p === "/api/board" && method === "GET") {
      return [200, { projects: d.projects, tasks: d.tasks, notes: d.notes, suggestions: d.suggestions,
                     lastSweep: d.lastSweep, sweeps: d.sweeps || {}, updated: d.updated || d.created, settings: d.settings }];
    }
    if (p === "/api/export" && method === "GET") return [200, { exported: new Date().toISOString(), ...d }];

    // Projects: POST upserts by id, DELETE moves to trash.
    if (p === "/api/projects" && method === "POST") {
      if (!body?.id || !body?.name) return [400, { error: "id and name are required" }];
      const i = d.projects.findIndex((x) => x.id === body.id);
      const pr = { group: "work", color: "#E8D8D5", order: 99, ...(i >= 0 ? d.projects[i] : {}), ...body };
      if (i >= 0) d.projects[i] = pr; else d.projects.push(pr);
      await this.save();
      return [200, pr];
    }
    const m = p.match(/^\/api\/projects\/([\w-]+)$/);
    if (m && method === "DELETE") {
      const i = d.projects.findIndex((x) => x.id === m[1]);
      if (i < 0) return [404, { error: "No such project" }];
      this.trashItem("project", d.projects.splice(i, 1)[0]);
      await this.save();
      return [200, { ok: true }];
    }
    if (p === "/api/trash" && method === "GET") return [200, d.trash];
    const board = (extra = {}) => [200, { projects: d.projects, tasks: d.tasks, notes: d.notes, suggestions: d.suggestions,
                                lastSweep: d.lastSweep, sweeps: d.sweeps || {}, updated: d.updated, settings: d.settings, ...extra }];
    const hasProject = (id) => d.projects.some((x) => x.id === id);
    const today = isDate(body?.today) ? body.today : new Date().toISOString().slice(0, 10);

    // ----- tasks (kinds: task, waiting, repeat) -----
    if (p === "/api/tasks" && method === "POST") {
      const t = cleanTask(body);
      if (!t.text) return [400, { error: "The task needs some text" }];
      if (!hasProject(t.project)) return [400, { error: "Unknown card" }];
      if (t.kind === "waiting" && !t.asked) t.asked = today;
      Object.assign(t, { id: uid(), created: new Date().toISOString(), done: false });
      d.tasks.push(t);
      await this.save();
      return board();
    }
    let tm = p.match(/^\/api\/tasks\/([\w-]+)(?:\/(done|chased))?$/);
    if (tm) {
      const t = d.tasks.find((x) => x.id === tm[1]);
      if (!t) return [404, { error: "That task isn't there any more" }];
      if (!tm[2] && method === "PUT") {
        const next = cleanTask(body, t);
        if (!next.text) return [400, { error: "The task needs some text" }];
        if (!hasProject(next.project)) return [400, { error: "Unknown card" }];
        Object.assign(t, next, { edited: new Date().toISOString() });
      } else if (!tm[2] && method === "DELETE") {
        d.tasks.splice(d.tasks.indexOf(t), 1);
        this.trashItem("task", t);
        await this.save();
        return board({ trashed: d.trash[0].tid });
      } else if (tm[2] === "chased" && method === "POST") {
        t.asked = today;
        t.chasedCount = (t.chasedCount || 0) + 1;
      } else if (tm[2] === "done" && method === "POST") {
        const done = body?.done !== false;
        // A background check may only tick things done, with its evidence; never untick.
        if (role !== "owner" && !done) return [403, { error: "The background check can't untick tasks" }];
        if (done && !t.done) {
          t.done = true;
          if (role !== "owner") { t.doneBy = role; t.doneWhy = String(body?.why || "").slice(0, 300); }
          t.doneAt = new Date().toISOString();
          t.doneDay = today;
          if (t.kind === "repeat" && t.repeat && !t.nextId) {
            const copy = { ...t, id: uid(), created: new Date().toISOString(), done: false,
                           due: addPeriod(t.due || today, t.repeat), prevId: t.id };
            for (const k of ["doneAt", "doneDay", "nextId", "edited"]) delete copy[k];
            t.nextId = copy.id;
            d.tasks.push(copy);
          }
        } else if (!done && t.done) {
          t.done = false;
          delete t.doneAt; delete t.doneDay;
          // Unticking a repeat removes the copy it made, unless that copy was already changed or ticked.
          const next = t.nextId && d.tasks.find((x) => x.id === t.nextId);
          if (next && !next.done && !next.edited) d.tasks.splice(d.tasks.indexOf(next), 1);
          delete t.nextId;
        }
      } else return [405, { error: "Not allowed" }];
      await this.save();
      return board();
    }

    // ----- Always remember notes -----
    if (p === "/api/notes" && method === "POST") {
      const text = String(body?.text || "").trim().slice(0, 300);
      if (!text) return [400, { error: "The note needs some text" }];
      if (!hasProject(body.project)) return [400, { error: "Unknown card" }];
      d.notes.push({ id: uid(), project: body.project, text, detail: String(body.detail || "").trim().slice(0, 4000),
                     source: String(body.source || "").slice(0, 300), created: new Date().toISOString() });
      await this.save();
      return board();
    }
    const nm = p.match(/^\/api\/notes\/([\w-]+)$/);
    if (nm) {
      const n = d.notes.find((x) => x.id === nm[1]);
      if (!n) return [404, { error: "That note isn't there any more" }];
      if (method === "PUT") {
        if ("text" in body) n.text = String(body.text || "").trim().slice(0, 300) || n.text;
        if ("detail" in body) n.detail = String(body.detail || "").trim().slice(0, 4000);
        n.edited = new Date().toISOString();
      } else if (method === "DELETE") {
        d.notes.splice(d.notes.indexOf(n), 1);
        this.trashItem("note", n);
        await this.save();
        return board({ trashed: d.trash[0].tid });
      } else return [405, { error: "Not allowed" }];
      await this.save();
      return board();
    }

    // ----- suggestions (Claude never adds tasks itself; Nicky taps Add) -----
    if (p === "/api/suggestions/log" && method === "GET") return [200, { log: d.suggestionLog, open: d.suggestions }];
    if (p === "/api/suggestions" && method === "POST") {
      const items = Array.isArray(body?.items) ? body.items : [body];
      const result = { posted: [], skipped: [] };
      for (const raw of items) {
        const t = cleanTask(raw || {});
        t.why = String(raw?.why || "").trim().slice(0, 300);
        if (!t.text || !hasProject(t.project)) { result.skipped.push({ text: t.text, reason: "missing text or unknown card" }); continue; }
        const dup = [...d.suggestions, ...d.suggestionLog, ...d.tasks.filter((x) => !x.done)].find((x) => similar(x.text, t.text));
        if (dup) { result.skipped.push({ text: t.text, reason: "already suggested or on the list" }); continue; }
        if (t.kind === "waiting" && !t.asked) t.asked = today;
        Object.assign(t, { id: uid(), created: new Date().toISOString(), by: role === "owner" ? String(raw?.by || "claude").slice(0, 40) : role, comments: [] });
        d.suggestions.push(t);
        result.posted.push({ id: t.id, project: t.project, text: t.text });
      }
      if (result.posted.length) await this.save();
      return [200, result];
    }
    const sm = p.match(/^\/api\/suggestions\/([\w-]+)\/(add|dismiss|comment|reply)$/);
    if (sm && method === "POST") {
      const sg = d.suggestions.find((x) => x.id === sm[1]);
      if (!sg) return [404, { error: "That suggestion has already been handled" }];
      const close = (status) => {
        d.suggestions.splice(d.suggestions.indexOf(sg), 1);
        d.suggestionLog.unshift({ ...sg, status, closed: new Date().toISOString() });
        d.suggestionLog.length = Math.min(d.suggestionLog.length, LOG_MAX);
      };
      const addTask = () => {
        const t = cleanTask(sg);
        if (t.kind === "waiting" && !t.asked) t.asked = today;
        Object.assign(t, { id: uid(), created: new Date().toISOString(), done: false, fromSuggestion: sg.id });
        d.tasks.push(t);
        close("added");
        return t.id;
      };
      if (sm[2] === "add") { const id = addTask(); await this.save(); return board({ added: id }); }
      if (sm[2] === "dismiss") { close("dismissed"); await this.save(); return board(); }
      if (sm[2] === "reply") {
        // Used by the background sweep to answer a comment the instant fix couldn't handle.
        const c = sg.comments.find((x) => x.id === body?.comment);
        if (!c) return [404, { error: "No such comment" }];
        c.reply = String(body.reply || "").slice(0, 500); c.pending = false;
        if (body.changes) Object.assign(sg, cleanTask(body.changes, sg));
        await this.save();
        return board();
      }
      // comment: save it first, then try the instant fix.
      const text = String(body?.text || "").trim().slice(0, 1000);
      if (!text) return [400, { error: "Type a comment first" }];
      const c = { id: uid(), text, at: new Date().toISOString(), pending: true };
      sg.comments.push(c);
      await this.save();
      if (!this.env.ANTHROPIC_API_KEY) {
        c.reply = "Saved. The next background check will sort this out (instant fixes switch on once the Anthropic key is added).";
        await this.save();
        return board();
      }
      try {
        const before = { project: sg.project, kind: sg.kind, text: sg.text, detail: sg.detail, due: sg.due, who: sg.who, repeat: sg.repeat, why: sg.why, source: sg.source };
        const fix = await askClaudeToFix(this.env, { suggestion: before, comment: text, projects: d.projects, today });
        const ch = {};
        for (const [k, v] of Object.entries(fix.changes || {})) if (v !== null && v !== undefined) ch[k] = v;
        if (ch.project && !hasProject(ch.project)) delete ch.project;
        Object.assign(sg, cleanTask(ch, sg));
        if (fix.rule?.text && hasProject(fix.rule.project)) {
          d.notes.push({ id: uid(), project: fix.rule.project, text: fix.rule.text.slice(0, 300), detail: (fix.rule.detail || "").slice(0, 4000),
                         source: "Your comment", created: new Date().toISOString() });
          fix.reply += " I also pinned it as a rule.";
        }
        c.reply = fix.reply; c.pending = false;
        let added;
        if (fix.action === "accept") added = addTask();
        else if (fix.action === "dismiss") close("dismissed");
        await this.save();
        return board({ fixed: sg.id, added, action: fix.action });
      } catch (e) {
        c.reply = "Saved. I couldn't fix it instantly, so the next background check will.";
        await this.save();
        return board();
      }
    }

    // ----- settings and sweep bookkeeping -----
    if (p === "/api/settings" && method === "PUT") {
      if ("claudeFolder" in body) d.settings.claudeFolder = String(body.claudeFolder || "").trim().slice(0, 300);
      await this.save();
      return [200, d.settings];
    }
    if (p === "/api/sweep" && method === "POST") {
      const who = role === "owner" ? (SWEEPERS.includes(body?.by) ? body.by : "claude") : role;
      const kind = body?.kind === "review" ? "review" : "sweep";
      const at = new Date().toISOString();
      d.sweeps = d.sweeps || {};
      const prev = d.sweeps[who] || {};
      // lastSweep = how far the checker has read; it only moves forward.
      const upTo = body?.lastSweep && !isNaN(Date.parse(body.lastSweep)) ? new Date(body.lastSweep).toISOString() : at;
      d.sweeps[who] = { ...prev, at, kind, lastSweep: prev.lastSweep && prev.lastSweep > upTo ? prev.lastSweep : upTo,
                        summary: String(body?.summary || "").slice(0, 1000), failed: String(body?.failed || "").slice(0, 300) };
      if (who === "claude") d.lastSweep = d.sweeps[who].lastSweep;
      d.sweepLog = [{ at, who, kind, summary: d.sweeps[who].summary, failed: d.sweeps[who].failed }, ...(d.sweepLog || [])].slice(0, 300);
      await this.save();
      return [200, { lastSweep: d.sweeps[who].lastSweep, sweeps: d.sweeps }];
    }

    // ----- restore from trash -----
    const rm = p.match(/^\/api\/trash\/([\w-]+)\/restore$/);
    if (rm && method === "POST") {
      const i = d.trash.findIndex((x) => x.tid === rm[1]);
      if (i < 0) return [404, { error: "Not in the bin" }];
      const [entry] = d.trash.splice(i, 1);
      const list = { task: d.tasks, note: d.notes, project: d.projects }[entry.kind];
      if (!list) return [400, { error: "Can't restore that kind yet" }];
      if (!list.some((x) => x.id === entry.item.id)) list.push(entry.item);
      await this.save();
      return board();
    }
    return [404, { error: "Not found" }];
  }
}
