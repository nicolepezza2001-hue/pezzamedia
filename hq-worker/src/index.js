// Tasks HQ Worker: one Durable Object ("Board") holds everything.
// Every /api call needs the password in the X-Key header (Worker secret KEY).
import { DurableObject } from "cloudflare:workers";

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

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
    const url = new URL(req.url);
    if (url.pathname === "/" ) return json({ ok: true, app: "Tasks HQ" }, 200, req);
    if (!env.KEY) return json({ error: "Password not set on the Worker yet" }, 503, req);
    const stub = env.BOARD.get(env.BOARD.idFromName("main"));
    const ip = req.headers.get("CF-Connecting-IP") || "local";
    if (await stub.tooManyFails(ip)) return json({ error: "Too many wrong tries. Wait 10 minutes." }, 429, req);
    if (!sameKey(req.headers.get("X-Key"), env.KEY)) {
      await stub.fail(ip);
      return json({ error: "Wrong password" }, 401, req);
    }
    try {
      const body = ["POST", "PUT"].includes(req.method) ? await req.json().catch(() => ({})) : null;
      const [status, data] = await stub.handle(req.method, url.pathname, body);
      return json(data, status, req);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500, req);
    }
  },
};

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
    this.data.trash.unshift({ kind, item, deleted: new Date().toISOString() });
    this.data.trash.length = Math.min(this.data.trash.length, TRASH_MAX);
  }

  async handle(method, path, body) {
    const d = await this.load();
    const p = path.replace(/\/+$/, "");
    if (p === "/api/ping") return [200, { ok: true }];
    if (p === "/api/board" && method === "GET") {
      return [200, { projects: d.projects, tasks: d.tasks, notes: d.notes, suggestions: d.suggestions,
                     lastSweep: d.lastSweep, updated: d.updated || d.created }];
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
    return [404, { error: "Not found" }];
  }
}
