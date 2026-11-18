# Tasks HQ

Private task board at **https://pezzamedia.com/hq/** (page code in `dist/hq/`), with all data in a
Cloudflare Worker (`hq-worker/`). Read this before changing anything.

## Pieces
- `dist/hq/index.html`, `tq.css`, `tq.js`: the page. Plain HTML/CSS/JS, `noindex, nofollow`, all classes start `tq-`.
- `dist/hq/config.js`: `window.TQ_API` = the Worker address (not secret; useless without the password).
- `dist/hq/logos/`: project logos (transparent PNGs).
- `hq-worker/src/index.js`: the Worker + one Durable Object `Board` (SQLite-backed, free plan) that holds everything as one JSON document under the storage key `board`.
- `.github/workflows/deploy-hq-worker.yml`: deploys the Worker on every push to main that touches `hq-worker/`, or by hand (Actions > Deploy Tasks HQ Worker > Run workflow).

## Secrets (never in this repo)
- GitHub repo secrets: `CLOUDFLARE_API_TOKEN` (Cloudflare token from the "Edit Cloudflare Workers" template), `HQ_KEY` (the HQ password; same as the Jobs HQ password so one password opens both).
- Worker secrets: `KEY` (set from `HQ_KEY` by the deploy) and `ANTHROPIC_API_KEY` (set from the GitHub secret of the same name by the deploy, if present).
- Local testing: `hq-worker/.dev.vars` with `KEY=...` (git-ignored), then `npx wrangler dev`.

## API
Every call needs header `X-Key: <password>`. 10 wrong tries from one IP = locked for 10 minutes.
- `GET /` health check (no password).
- `GET /api/ping` password check.
- `GET /api/board` → `{ projects, tasks, notes, suggestions, lastSweep, updated }`.
- `GET /api/export` → everything (backup). The page's footer "Backup" link downloads it.
- `POST /api/projects` upsert a project by `id`.
- `POST /api/tasks` add `{ project, kind, text, due?, who?, asked?, repeat?, detail?, link?, source? }`.
- `PUT /api/tasks/:id` edit (same fields). `DELETE /api/tasks/:id` → bin (response has `trashed` = bin id for Undo).
- `POST /api/tasks/:id/done` `{ done: true|false }`. Ticking a repeat adds the next copy (due + period) and stores `nextId`; unticking removes that copy if it wasn't touched.
- `POST /api/tasks/:id/chased` resets `asked` to today.
- `POST /api/notes` `{ project, text, detail? }` (Always remember rules), `PUT/DELETE /api/notes/:id`.
- `POST /api/trash/:tid/restore` puts a binned item back.
- `POST /api/suggestions` `{ items: [{ project, kind, text, why, source, due?, who?, repeat?, detail?, link?, by? }] }` → `{ posted, skipped }`. Skips anything that looks the same (80% word overlap) as an open suggestion, the suggestion log (added + dismissed) or an open task.
- `GET /api/suggestions/log` → `{ log, open }` (the sweep reads this so nothing reworded comes back).
- `POST /api/suggestions/:id/add` | `/dismiss` | `/comment {text}` | `/reply {comment, reply, changes?}` (reply = the sweep answering a comment the instant fix missed; open comments have `pending: true`).
- Comment fix: Worker calls Claude (`claude-opus-5-5`, effort low, structured JSON, server-side fallback) with the suggestion + comment, applies the changes, can accept/dismiss only if she clearly says so, and pins a rule to Always remember when the comment is a lasting rule.
- `PUT /api/settings { claudeFolder }` (folder for Start ▶). `POST /api/sweep { lastSweep, summary }` for the background sweep.
- Start ▶ = `claude://code/new?q=<prompt>&folder=<claudeFolder>`; the prompt carries the task id and how to tick it done via the API.
- All change calls send `today` (her local YYYY-MM-DD) and return the whole board.
- `DELETE /api/projects/:id` moves it to trash.
- `GET /api/trash` → last 500 deleted items `{ kind, item, deleted }`.

## Data shapes
- Project: `{ id, name, group: "work"|"tools"|"personal", blurb, logo, color, dashboard, order }`.
- Task (stage 2): `{ id, project, kind: "task"|"waiting"|"repeat", text, due?, detail?, link?, source?, who?, asked?, repeat?, done?, created }`.
- Counters: open = not done and (no due date or due within 7 days); waiting-on counts once 5+ days old. Red when due within 2 days or someone needs chasing.

## Jobs HQ
`pezzamedia.com/jobs/` stays its own page with its own encrypted data and sweep (see `/mnt/project-files/upwork/hq/README.md`).
The "Looking for a job" work card on Tasks HQ opens it (its counter = Today items still to do; red if one is marked hot). If both use the same password, Tasks HQ decrypts the jobs file to show the open-jobs badge and hands the password over, so Jobs HQ opens without asking again. Tasks HQ is the main HQ; Jobs HQ is a sub-part of it and has no link back (Nicky, 2026-11-17).

## Deploying
- Page: commit to `main` (GitHub Pages). Bump `?v=` on `tq.css` / `tq.js` in `index.html` to bust caches.
- Worker: commit to `main` under `hq-worker/` (or run the workflow by hand). Check the Actions log for the `workers.dev` address.

## Testing rules
Use clearly marked TEST items and delete them afterwards. Never tick or delete real tasks to test.

## Stages
1. ✅ Worker + Board + password + lock screen + project cards (logos, counters, empty panel). Work row: SN, Tmrw, Pezza Media, Looking for a job (opens Jobs HQ). Personal row: Study, Family research, Tallulah writing, Frolicking Nicky. New default cards reach the live Board by bumping SEED_VERSION in the Worker.
2. ✅ Tasks, waiting-on, repeating, Later, Done (14 days, untick), Always remember, add/edit/tick/delete (tap twice), Bin + restore, Undo toasts, export.
3. ✅ Suggestions tray (Add / Dismiss / Comment with instant AI fix) + Start ▶ + Settings. 4. Scheduled sweep + review. 5. Scoreboard, headline, animations, dark mode.
6. Life Admin + habits. 7. Tools (Nicky 2026-11-17; no invoices/expenses/tax/subscriptions): Notes → Tasks, Brand kits, Proof bank, Content calendar, Swipe file, Tallulah tracker, Pitch tracker, Focus timer. 8. 30-day remember-me + Touch ID.

## Stage 4: background checks (live 2026-11-17)
- Checkers sign in with `X-Sweep: <key>` instead of the password. Keys are HMAC-SHA256(KEY, "tasks-hq-sweep:<who>"),
  first 40 hex chars, prefixed `sw_`; who = `claude` (Nicky's own Claude) or `work` (her work Claude). No extra secret needed;
  changing the password changes both keys. Keys live only in /mnt/project-files/upwork/hq/.sweep-key-* (never in the repo).
- A sweep key may only: GET /api/board, GET /api/suggestions/log, POST /api/suggestions, POST /api/suggestions/:id/reply,
  POST /api/sweep, POST /api/tasks/:id/done (tick only, with `why`; never untick). Everything else is 403.
- Suggestions get `by` from the key (claude/work); the tray shows "✨ Claude" or "💼 Work Claude".
- POST /api/sweep {kind: sweep|review, lastSweep, summary, failed} saves `sweeps[who]`; the header shows "Claude checked 5:30 PM".
- Runbook for the checks: /mnt/project-files/upwork/hq/SWEEP.md. The cloud environment allows pezza-hq.nicole-pezza2001.workers.dev.

## Stage 5: scoreboard, headline, syncs, animations, dark mode (2026-11-17)
- `stats.days` {YYYY-MM-DD: count} counts every tick (decrements on untick); backfilled once from existing done tasks. The page works out today, best day, this week (Mon-today) and the workday streak (weekends never break it).
- Animations live in dist/hq/tq-fx.js: 12 actions × 4 options. Nicky picks per action in the footer's "Animations" sheet; picks are saved in `settings.anims` (PUT /api/settings {anims:{tick:0-3,...}}).
- Dark mode: toggle in the header, remembered per device in localStorage `tq-theme`; light by default. Colours are CSS variables on :root, overridden under :root[data-theme=dark].
- Syncs-with logos: dist/hq/logos/src-*.svg (Simple Icons, recoloured).

## Stage 6: Life Admin + habits (2026-11-18)
- New personal card `admin` (Life Admin: tax, accountant, personal bills). Personal only; nothing from it goes on a work card.
- Habit tracker at the top of the Life Admin panel. Data: `habits` in the board JSON.
  - `daily`: `days` = list of YYYY-MM-DD ticked. Tick today, or tap the last 7 days' dots to fix a missed one. 🔥 streak counts back from today (or yesterday if today isn't ticked yet).
  - `avoid`: `lastSlip` date, `slips` = older slip dates. Shows days since the last slip and the best run. "Slipped" resets to 0 with an Undo toast (`/unslip` puts the old date back).
  - Routes (owner only; background checks get 403): POST /api/habits {name, kind, lastSlip?}, PUT/DELETE /api/habits/:id, POST /api/habits/:id/slip, /unslip, /tick {day?, done}.
  - Deleted habits go to the Bin and can be restored.
- Two new animation pickers: "Tick a daily habit" and "Slipped".
- Family research icon: Nicky's own engraved tree picture (icons/family-site.png).

## Stage 7: Tools (2026-11-18)
Each tool is its own page in dist/hq/tools/<name>.html, all run by tools/tools.js + tools.css (on top of ../tq.css).
Same password: the tool pages reuse the password kept for this browser session (sessionStorage "tq-key"), or show the lock screen.
The main page shows a "Tools" row with a small live number per tool (GET /api/tools/summary).

| Tool | Page | Data |
|---|---|---|
| Notes → Tasks | tools/notes.html | none stored; POST /api/notes-to-tasks {notes} returns {summary, items[{project, kind, text, who, due, quote, alreadyOnList}]}. Nothing is added until she ticks and presses Add (then POST /api/tasks each). Uses claude-opus-5-5, low effort, structured output. |
| Brand kits | tools/kits.html?card=<id> | storage "kits" = {cardId: {logos[{id,name}], colours[{name,hex}], fonts[{name,use}], notes, checked}}; GET /api/kits, PUT /api/kits/:card. Logos: POST /api/files {name, data: dataURL} (shrunk to 800px in the browser, max 1.5 MB), GET/DELETE /api/files/:id. Pezza and Tmrw have built-in starting values until first saved. |
| Proof bank | tools/proof.html | col "proof": {stat, what, brand, period, source, use: yes/anon/ask, note}. One-tap "Add my known numbers" when empty (from project memory; Tmrw press = paid). |
| Content calendar | tools/calendar.html | col "calendar": {date, title, project, channel, status idea/draft/ready/scheduled/published, link, note}. |
| Swipe file | tools/swipe.html | col "swipe": {text, kind, source, link, why, tags}. |
| Tallulah tracker | tools/tallulah.html | col "words": {date, words} (one per day, total so far) + one {goal: true, words}; col "queries": {name, kind, agency, status, sent, followUp, link, note}. |
| Pitch tracker | tools/pitches.html | col "pitches": {who, company, kind, status draft/sent/replied/won/lost, sent, followUp, project, link, note, chased}. "Followed up" pushes followUp 7 days. |
| Focus timer | tools/focus.html | col "focus": {day, start, minutes, project, taskId, task}. Running timer lives in localStorage "tq-focus" so a reload keeps it. Ends with a soft chime (Web Audio), no browser notification. |

Generic list API (owner only; background checks get 403): GET/POST /api/col/:name, PUT/DELETE /api/col/:name/:id. Each list is its own storage key "col:<name>" so the main board stays small. Deletes go to the Bin (kind "col") and restore from there. /api/export includes everything under "tools".
New animation pickers: "Focus session finished" and "Copy". The Slipped options now include the banana peel from the spec.

## Stage 8: stay signed in + Touch ID / Face ID (2026-11-18)
- dist/hq/tq-auth.js (window.TQAUTH) is shared by the main page and every tool page.
  - Remember-me: after a good sign-in the password is saved on that device for 30 days, renewed on every visit:
    localStorage "tq-remember" = {k, exp}, plus a backup cookie "tq_r" (Path=/hq/; Secure; SameSite=None; Partitioned).
    Jobs HQ (dist/jobs/hq.js) also opens with it. "Sign out" clears all of it on that device.
  - Passkeys use @simplewebauthn/server 13.3.3 in the Worker and the browser bundle in dist/hq/vendor/ (self-hosted, no CDN).
    rpID = pezzamedia.com, so one passkey works on every HQ page. Allowed origins: https://pezzamedia.com and https://www.pezzamedia.com
    (plus DEV_ORIGIN from .dev.vars for local tests).
- Routes:
  - Without the password (rate-limited like wrong passwords): POST /api/passkey/login/options, POST /api/passkey/login/verify {response}
    → {key}. The page then signs in with the password as usual, so the password always works as a backup.
  - With the password: GET /api/passkeys, POST /api/passkey/register/options, POST /api/passkey/register/verify {response, label}, DELETE /api/passkeys/:id.
  - Background checks get 403 on all of these.
- Storage keys: "passkeys" = [{id, publicKey (base64url), counter, transports, label, created, lastUsed}], "pk:reg" / "pk:logins" = list of {challenge, exp} (5 minutes).
- Footer: "Set up Touch ID" opens a panel to add this device or remove one (tap twice). Lock screens show "Use Touch ID / Face ID".
- Local test: Playwright with a CDP virtual authenticator (WebAuthn.addVirtualAuthenticator) against wrangler dev with DEV_ORIGIN=http://localhost:8080.

## Calendar of everything (2026-11-18)
Main page section "Calendar" (between Personal and Tools): month grid + the chosen day's list, filters All / Work / Personal.
Shows open tasks by due date, waiting-on items on their chase day (asked + 5 days), repeating tasks, Google Calendar events,
Content calendar posts, Pitch follow-ups and Tallulah query deadlines. Overdue tasks also show under today. Colours = the card's colour.
- GET /api/agenda (owner) → {events, posts, pitches, queries}.
- POST /api/events {from, to, items[{date, time, end, title, where, link, project}]} — allowed for the sweep keys. Each checker replaces only
  its own events ("claude" = personal calendar, "work" = work calendar) in that date range. Storage key "events" (keeps the last 60 days).
- Runbook step for the checks: "Calendar events for the HQ calendar" in /mnt/project-files/upwork/hq/SWEEP.md;
  work Claude's paste-in: /mnt/project-files/hq/message-for-work-claude-3.md.

## Work Claude powers (2026-11-18)
Nicky gave the work check (X-Sweep "work" key) extra powers, on the sn and tmrw cards ONLY (403 on any other card).
The personal check ("claude" key) gets none of the task/calendar powers, and both keys are kept to their own cards by mayTouch().
- GET /api/board (work key) returns only sn/tmrw: projects {id,name,group,blurb}; tasks {id, project, kind, who, text, due, asked, repeat,
  done, doneDay, detail, link, source, addedBy, created}; notes; suggestions; sweeps.
- POST /api/tasks {project, kind task|waiting|repeat, text, who, due, repeat, detail, link, source}: adds directly, sets addedBy = "work"
  (row shows "✨ Added by Work Claude"). 409 if a similar open task is already on that card.
- POST /api/tasks/:id/resolve {answer, source, link}: closes a waiting-on item, saves t.resolution and closedBy = "work"
  (row shows "✨ Closed by Work Claude: answer (source) · Open ↗"). 400 for non-waiting items.
- POST /api/suggestions/:id/withdraw {why}: a check can remove only its own suggestions (logged as "withdrawn").
- Repeats: daily and weekdays (Mon to Fri, skips Sat/Sun) added to weekly/monthly/quarterly/yearly.
- Content calendar: GET /api/calendar → {items[{id,date,brand,channel,title,status,link,source,addedBy}]};
  POST /api/calendar {items:[{date, brand sn|tmrw, channel email|blog|FBG|social|sale, title, status, link, source}]} upserts
  (same brand + date + title updates instead of adding a copy) → {added, updated, skipped}; PUT /api/calendar/:id edits one.
  Same storage as the Content calendar tool ("col:calendar"); items show "✨ Added by Work Claude".
- Brand guides (was Brand kits): GET /api/kits/:card → {card, colours, fonts, notes, checked, sections};
  PUT /api/kits/:card/sections {sections:{voice, spelling, banned, formats, compliance, usage, content}} stores {text, by, at}.
  Both checks may read/write guides, each on its own cards. The page's whole-kit save keeps the sections.
- Work Claude's paste-in: /mnt/project-files/hq/message-for-work-claude-4.md.
