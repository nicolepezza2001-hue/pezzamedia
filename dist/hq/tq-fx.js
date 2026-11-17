// Tasks HQ animations. Every action has 4 options; Nicky picks one per action on the preview sheet.
// Effects draw on a fixed layer above the page, so they survive the page redrawing underneath.
(() => {
  const NAMES = {
    tick: "Tick a task", untick: "Untick (back on the list)", add: "Add a suggestion", dismiss: "Dismiss a suggestion",
    newtask: "New task", edit: "Save an edit", del: "Delete", chased: "Chased", note: "New rule (Always remember)",
    comment: "Comment on a suggestion", sync: "Sync", record: "New record!",
  };
  const OPTIONS = {
    tick: ["Confetti + DONE stamp", "Green check bloom", "Rubber stamp slam", "Party emoji burst"],
    untick: ["Rewind slide", "Bounce back", "Spinning ⏪", "Yellow highlight"],
    add: ["ADDED stamp + fly into list", "Shrink into the list", "Green confetti", "✅ burst"],
    dismiss: ["Stamp + flick away", "Crumple", "Poof 💨", "Drop and fade"],
    newtask: ["Pop + confetti", "Sparkles ✨", "Bounce in + glow", "Star burst ⭐"],
    edit: ["Soft glow", "Shimmer sweep", "Pencil wiggle ✏️", "Pulse outline"],
    del: ["Burns up 🔥", "Shredder", "Poof 💨", "Into the bin 🗑"],
    chased: ["Ringing bell 🔔", "Bell + sound waves", "Megaphone 📣", "Alarm clock ⏰"],
    note: ["Pin drop 📌", "Sticky note slap", "Pin spin", "Pin + ripple"],
    comment: ["Magic wand 🪄", "Speech bubble pop 💬", "Sparkle trail ✨", "Crystal ball 🔮"],
    sync: ["Card flip", "Ripple wave", "Spinning arrows", "Shimmer"],
    record: ["Trophy + confetti 🏆", "Fireworks 🎆", "Ribbon banner", "Gold rain"],
  };
  const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const R = (a, b) => a + Math.random() * (b - a);
  const COLORS = ["#E8D8D5", "#C2D9BC", "#A9D3EE", "#2755C4", "#F5C04E", "#F28C8C", "#7B68EE"];

  function layer() {
    let l = document.getElementById("tq-fx");
    if (!l) { l = document.createElement("div"); l.id = "tq-fx"; l.setAttribute("aria-hidden", "true"); document.body.appendChild(l); }
    return l;
  }
  const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  function node(html, css) {
    const n = document.createElement("div");
    n.className = "tq-fx-n"; n.innerHTML = html; Object.assign(n.style, css);
    layer().appendChild(n); return n;
  }
  const done = (anim, n) => anim.finished.then(() => n.remove()).catch(() => n.remove());

  // ----- building blocks -----
  function confetti(r, { colors = COLORS, n = 28, spread = 1, up = 1 } = {}) {
    const c = centre(r);
    for (let i = 0; i < n; i++) {
      const p = node("", { left: c.x + "px", top: c.y + "px", width: R(6, 10) + "px", height: R(8, 14) + "px",
        background: colors[i % colors.length], borderRadius: Math.random() < .3 ? "50%" : "2px" });
      const dx = R(-160, 160) * spread, dy = R(-170, -60) * up;
      done(p.animate([
        { transform: "translate(-50%,-50%) rotate(0)", opacity: 1 },
        { transform: `translate(${dx * .7}px,${dy}px) rotate(${R(180, 540)}deg)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px,${dy + R(180, 260)}px) rotate(${R(540, 900)}deg)`, opacity: 0 },
      ], { duration: R(1000, 1500), easing: "cubic-bezier(.2,.7,.4,1)" }), p);
    }
  }
  function emojis(r, list, { n = 10, mode = "burst", size = 26, dur = 1100 } = {}) {
    const c = centre(r);
    for (let i = 0; i < n; i++) {
      const p = node(list[i % list.length], { left: (mode === "rain" ? R(r.left, r.right) : c.x) + "px", top: (mode === "rain" ? r.top - 30 : c.y) + "px", fontSize: R(size * .7, size * 1.2) + "px" });
      let k;
      if (mode === "rise") { const dx = R(-r.width / 2, r.width / 2); k = [{ transform: `translate(${dx}px,0) scale(.6)`, opacity: 0 }, { opacity: 1, offset: .2 }, { transform: `translate(${dx + R(-20, 20)}px,${R(-120, -70)}px) scale(1)`, opacity: 0 }]; }
      else if (mode === "rain") k = [{ transform: "translateY(0)", opacity: 0 }, { opacity: 1, offset: .15 }, { transform: `translateY(${r.height + R(60, 160)}px) rotate(${R(-90, 90)}deg)`, opacity: 0 }];
      else { const a = (Math.PI * 2 * i) / n + R(-.3, .3), d = R(60, 130); k = [{ transform: "translate(-50%,-50%) scale(.3)", opacity: 0 }, { opacity: 1, offset: .25 }, { transform: `translate(calc(-50% + ${Math.cos(a) * d}px),calc(-50% + ${Math.sin(a) * d}px)) scale(1)`, opacity: 0 }]; }
      done(p.animate(k, { duration: dur * R(.8, 1.2), delay: mode === "rain" ? R(0, 500) : R(0, 80), easing: "ease-out", fill: "backwards" }), p);
    }
  }
  function stamp(r, text, { color = "#2E7D32", rot = -12, hold = 650 } = {}) {
    const c = centre(r);
    const s = node(text, { left: c.x + "px", top: c.y + "px", color, border: `3px solid ${color}`, padding: "4px 14px", borderRadius: "10px",
      font: "700 24px Poppins, sans-serif", letterSpacing: ".12em", background: "rgba(255,255,255,.85)" });
    done(s.animate([
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(2.4)`, opacity: 0 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.95)`, opacity: 1, offset: .18 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: .25 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: .8 },
      { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.05)`, opacity: 0 },
    ], { duration: 700 + hold, easing: "ease-out" }), s);
  }
  function ghost(ctx) {
    if (!ctx?.html) return null;
    const r = ctx.rect;
    return node(ctx.html, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  function ghostAnim(ctx, frames, opts) {
    const g = ghost(ctx); if (!g) return;
    g.classList.add("tq-ghost");
    done(g.animate(frames, { duration: 800, easing: "cubic-bezier(.5,0,.3,1)", fill: "forwards", ...opts }), g);
    return g;
  }
  function onEl(el, frames, opts) { if (el) el.animate(frames, { duration: 900, easing: "ease-out", ...opts }); }
  function ripple(r, color = "rgba(39,85,196,.35)") {
    const c = centre(r);
    for (let i = 0; i < 3; i++) {
      const p = node("", { left: c.x + "px", top: c.y + "px", width: "20px", height: "20px", borderRadius: "50%", border: `3px solid ${color}` });
      done(p.animate([{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(9)", opacity: 0 }], { duration: 1000, delay: i * 180, easing: "ease-out", fill: "backwards" }), p);
    }
  }
  function bigEmoji(r, e, frames, dur = 1100, size = 44) {
    const c = centre(r);
    const p = node(e, { left: c.x + "px", top: c.y + "px", fontSize: size + "px" });
    done(p.animate(frames, { duration: dur, easing: "ease-in-out" }), p);
  }
  function banner(text, { bg = "#F5C04E", color = "#1D2433" } = {}) {
    const p = node(text, { left: "50%", top: "22%", background: bg, color, padding: "12px 28px", borderRadius: "999px",
      font: "700 22px Poppins, sans-serif", boxShadow: "0 12px 30px rgba(0,0,0,.18)", whiteSpace: "nowrap" });
    done(p.animate([{ transform: "translate(-50%,-30px) scale(.6)", opacity: 0 }, { transform: "translate(-50%,0) scale(1.05)", opacity: 1, offset: .2 },
      { transform: "translate(-50%,0) scale(1)", opacity: 1, offset: .85 }, { transform: "translate(-50%,-20px) scale(.95)", opacity: 0 }], { duration: 2200 }), p);
  }
  const screen = () => ({ left: 0, top: 0, right: innerWidth, bottom: innerHeight * .5, width: innerWidth, height: innerHeight * .5 });
  const shake = [{ transform: "translate(-50%,-50%) rotate(0)" }, { transform: "translate(-50%,-50%) rotate(-25deg)" }, { transform: "translate(-50%,-50%) rotate(22deg)" },
    { transform: "translate(-50%,-50%) rotate(-18deg)" }, { transform: "translate(-50%,-50%) rotate(14deg)" }, { transform: "translate(-50%,-50%) rotate(-8deg)" }, { transform: "translate(-50%,-50%) rotate(0)", opacity: 0 }];

  // ----- the 4 options for each action -----
  // ctx: { rect, html (snapshot of the old element) }, el: the element after the page redrew (may be null)
  const FX = {
    tick: [
      (c, el) => { confetti(c.rect); stamp(c.rect, "DONE"); },
      (c, el) => { bigEmoji(c.rect, "✅", [{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.5)", opacity: 1, offset: .4 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 900, 50); ripple(c.rect, "rgba(46,125,50,.35)"); },
      (c, el) => stamp(c.rect, "DONE ✓", { color: "#C62828", rot: -8, hold: 900 }),
      (c, el) => emojis(c.rect, ["🎉", "✨", "🥳", "⭐"], { n: 14 }),
    ],
    untick: [
      (c, el) => { onEl(el, [{ transform: "translateX(-60px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 600 }); emojis(c.rect, ["⏪"], { n: 1, size: 34 }); },
      (c, el) => onEl(el, [{ transform: "translateY(-30px)" }, { transform: "translateY(6px)", offset: .6 }, { transform: "translateY(0)" }], { duration: 650, easing: "cubic-bezier(.3,1.6,.6,1)" }),
      (c, el) => bigEmoji(c.rect, "⏪", [{ transform: "translate(-50%,-50%) rotate(0) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(-360deg) scale(1.3)", opacity: 1, offset: .6 }, { transform: "translate(-50%,-50%) rotate(-360deg) scale(1)", opacity: 0 }]),
      (c, el) => onEl(el, [{ background: "#FFF3B0" }, { background: "#FFF3B0", offset: .5 }, { background: "" }], { duration: 1400 }),
    ],
    add: [
      (c, el) => { stamp(c.rect, "ADDED", { color: "#2755C4" }); ghostAnim(c, [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(240px) scale(.6)", opacity: 0 }], { delay: 350 }); },
      (c, el) => { ghostAnim(c, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(.1)", opacity: 0 }], { duration: 600 }); emojis(c.rect, ["✨"], { n: 8 }); },
      (c, el) => { confetti(c.rect, { colors: ["#2E7D32", "#66BB6A", "#C2D9BC", "#A5D6A7"] }); stamp(c.rect, "ADDED"); },
      (c, el) => { ghostAnim(c, [{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(120%)", opacity: 0 }], { duration: 700 }); emojis(c.rect, ["✅"], { n: 6, size: 30 }); },
    ],
    dismiss: [
      (c, el) => { stamp(c.rect, "NOPE", { color: "#8E8E8E", rot: 10, hold: 300 }); ghostAnim(c, [{ transform: "translate(0,0) rotate(0)", opacity: 1 }, { transform: "translate(140%,-40px) rotate(25deg)", opacity: 0 }], { delay: 300, duration: 600 }); },
      (c, el) => ghostAnim(c, [{ transform: "scale(1) rotate(0)", borderRadius: "18px", opacity: 1 }, { transform: "scale(.5,.3) rotate(-12deg)", borderRadius: "50%", opacity: .9, offset: .6 }, { transform: "scale(.05) rotate(20deg)", borderRadius: "50%", opacity: 0 }], { duration: 750 }),
      (c, el) => { ghostAnim(c, [{ opacity: 1, filter: "blur(0)" }, { opacity: 0, filter: "blur(8px)", transform: "scale(1.1)" }], { duration: 500 }); emojis(c.rect, ["💨"], { n: 6, size: 34 }); },
      (c, el) => ghostAnim(c, [{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(80px)", opacity: 0 }], { duration: 650, easing: "ease-in" }),
    ],
    newtask: [
      (c, el) => { onEl(el, [{ transform: "scale(.6)", opacity: 0 }, { transform: "scale(1.06)", opacity: 1, offset: .6 }, { transform: "scale(1)" }], { duration: 500 }); confetti(el ? el.getBoundingClientRect() : c.rect, { n: 18 }); },
      (c, el) => emojis(el ? el.getBoundingClientRect() : c.rect, ["✨"], { n: 12 }),
      (c, el) => onEl(el, [{ transform: "translateY(-24px)", opacity: 0, boxShadow: "0 0 0 0 rgba(245,192,78,0)" }, { transform: "translateY(4px)", opacity: 1, boxShadow: "0 0 0 8px rgba(245,192,78,.45)", offset: .5 }, { transform: "translateY(0)", boxShadow: "0 0 0 0 rgba(245,192,78,0)" }], { duration: 900 }),
      (c, el) => emojis(el ? el.getBoundingClientRect() : c.rect, ["⭐", "🌟"], { n: 10 }),
    ],
    edit: [
      (c, el) => onEl(el, [{ boxShadow: "0 0 0 0 rgba(39,85,196,0)" }, { boxShadow: "0 0 0 6px rgba(39,85,196,.35)", offset: .3 }, { boxShadow: "0 0 0 0 rgba(39,85,196,0)" }], { duration: 1200 }),
      (c, el) => { const r = el ? el.getBoundingClientRect() : c.rect; const s = node("", { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", overflow: "hidden", borderRadius: "14px" }); s.innerHTML = '<i class="tq-fx-shine"></i>'; done(s.firstChild.animate([{ transform: "translateX(-100%) skewX(-20deg)" }, { transform: "translateX(260%) skewX(-20deg)" }], { duration: 900, easing: "ease-in-out" }), s); },
      (c, el) => bigEmoji(el ? el.getBoundingClientRect() : c.rect, "✏️", [{ transform: "translate(-50%,-50%) rotate(0)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(-20deg)", opacity: 1, offset: .2 }, { transform: "translate(-50%,-50%) rotate(20deg)", offset: .4 }, { transform: "translate(-50%,-50%) rotate(-20deg)", offset: .6 }, { transform: "translate(-50%,-50%) rotate(0)", opacity: 0 }], 1000, 36),
      (c, el) => onEl(el, [{ outline: "2px solid rgba(39,85,196,0)", outlineOffset: "0px" }, { outline: "2px solid rgba(39,85,196,.8)", outlineOffset: "4px", offset: .4 }, { outline: "2px solid rgba(39,85,196,0)", outlineOffset: "10px" }], { duration: 900 }),
    ],
    del: [
      (c, el) => { ghostAnim(c, [{ filter: "none", opacity: 1, transform: "translateY(0)" }, { filter: "sepia(1) saturate(4) hue-rotate(-20deg) brightness(1.1)", opacity: .9, offset: .4 }, { filter: "sepia(1) saturate(6) brightness(.3) blur(2px)", opacity: 0, transform: "translateY(-30px) scaleY(.6)" }], { duration: 1000 }); emojis(c.rect, ["🔥", "🔥", "✨"], { n: 12, mode: "rise", size: 24 }); },
      (c, el) => { const g = ghost(c); if (!g) return; g.classList.add("tq-ghost"); g.style.overflow = "hidden"; const w = c.rect.width / 8; g.innerHTML = ""; for (let i = 0; i < 8; i++) { const s = node("", { left: c.rect.left + i * w + "px", top: c.rect.top + "px", width: w - 2 + "px", height: c.rect.height + "px", background: "var(--tq-card,#fff)", border: "1px solid #ddd", borderRadius: "3px" }); done(s.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: `translateY(${R(140, 260)}px) rotate(${R(-15, 15)}deg)`, opacity: 0 }], { duration: R(700, 1000), delay: i * 40, easing: "ease-in", fill: "backwards" }), s); } g.remove(); },
      (c, el) => { ghostAnim(c, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.7)", filter: "blur(6px)" }], { duration: 450 }); emojis(c.rect, ["💨"], { n: 7, size: 34 }); },
      (c, el) => { ghostAnim(c, [{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: "translate(30%,160px) scale(.15) rotate(30deg)", opacity: 0 }], { duration: 750, easing: "cubic-bezier(.6,0,.9,.5)" }); bigEmoji({ ...c.rect, top: c.rect.top + 150, bottom: c.rect.bottom + 150 }, "🗑", [{ transform: "translate(-50%,-50%) scale(.5)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.2)", opacity: 1, offset: .6 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 1100); },
    ],
    chased: [
      (c, el) => bigEmoji(c.rect, "🔔", shake, 1100),
      (c, el) => { bigEmoji(c.rect, "🔔", shake, 1100, 36); ripple(c.rect, "rgba(245,192,78,.6)"); },
      (c, el) => { bigEmoji(c.rect, "📣", [{ transform: "translate(-50%,-50%) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) scale(1.3)", opacity: 1, offset: .4 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 1000); emojis(c.rect, ["❗", "‼️"], { n: 6, size: 22 }); },
      (c, el) => bigEmoji(c.rect, "⏰", [...shake.slice(0, 5), ...shake.slice(1)], 1300),
    ],
    note: [
      (c, el) => { const r = el ? el.getBoundingClientRect() : c.rect; bigEmoji({ ...r, left: r.left, right: r.left + 40 }, "📌", [{ transform: "translate(-50%,-160%) rotate(-30deg)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(0)", opacity: 1, offset: .5 }, { transform: "translate(-50%,-60%) rotate(0)", offset: .65 }, { transform: "translate(-50%,-50%) rotate(0)", opacity: 1, offset: .8 }, { opacity: 0, transform: "translate(-50%,-50%)" }], 1100, 34); },
      (c, el) => onEl(el, [{ transform: "rotate(-4deg) scale(1.15)", opacity: 0, background: "#FFF3B0" }, { transform: "rotate(1deg) scale(1)", opacity: 1, background: "#FFF3B0", offset: .4 }, { transform: "rotate(0)", background: "" }], { duration: 900 }),
      (c, el) => bigEmoji(el ? el.getBoundingClientRect() : c.rect, "📌", [{ transform: "translate(-50%,-50%) rotate(0) scale(.4)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(720deg) scale(1.2)", opacity: 1, offset: .7 }, { transform: "translate(-50%,-50%) rotate(720deg) scale(1)", opacity: 0 }], 1100),
      (c, el) => { const r = el ? el.getBoundingClientRect() : c.rect; ripple(r); bigEmoji(r, "📌", [{ opacity: 0 }, { opacity: 1, offset: .3 }, { opacity: 0 }], 900, 30); },
    ],
    comment: [
      (c, el) => { bigEmoji(c.rect, "🪄", [{ transform: "translate(-80%,-50%) rotate(-30deg)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(20deg)", opacity: 1, offset: .4 }, { transform: "translate(-50%,-50%) rotate(-10deg)", opacity: 0 }], 900, 38); setTimeout(() => emojis(c.rect, ["✨", "⭐"], { n: 12 }), 350); },
      (c, el) => bigEmoji(c.rect, "💬", [{ transform: "translate(-50%,-30%) scale(.3)", opacity: 0 }, { transform: "translate(-50%,-80%) scale(1.3)", opacity: 1, offset: .4 }, { transform: "translate(-50%,-90%) scale(1)", opacity: 1, offset: .7 }, { transform: "translate(-50%,-100%) scale(1.6)", opacity: 0 }], 1100),
      (c, el) => { for (let i = 0; i < 10; i++) setTimeout(() => { const x = c.rect.left + (c.rect.width * i) / 10; emojis({ left: x, right: x, top: c.rect.top, bottom: c.rect.top, width: 0, height: 0 }, ["✨"], { n: 1, size: 20, dur: 700 }); }, i * 60); },
      (c, el) => { bigEmoji(c.rect, "🔮", [{ transform: "translate(-50%,-50%) scale(.5)", opacity: 0, filter: "drop-shadow(0 0 0 #A88BFF)" }, { transform: "translate(-50%,-50%) scale(1.2)", opacity: 1, filter: "drop-shadow(0 0 18px #A88BFF)", offset: .5 }, { transform: "translate(-50%,-50%) scale(1)", opacity: 0 }], 1200); },
    ],
    sync: [
      () => document.querySelectorAll(".tq-card").forEach((el, i) => el.animate([{ transform: "perspective(600px) rotateY(0)" }, { transform: "perspective(600px) rotateY(180deg)", offset: .5 }, { transform: "perspective(600px) rotateY(360deg)" }], { duration: 800, delay: i * 70, easing: "ease-in-out" })),
      () => document.querySelectorAll(".tq-card").forEach((el, i) => el.animate([{ transform: "translateY(0)" }, { transform: "translateY(-12px)", offset: .4 }, { transform: "translateY(0)" }], { duration: 500, delay: i * 80, easing: "ease-out" })),
      (c) => bigEmoji(c.rect, "🔄", [{ transform: "translate(-50%,-50%) rotate(0)", opacity: 0 }, { transform: "translate(-50%,-50%) rotate(360deg)", opacity: 1, offset: .5 }, { transform: "translate(-50%,-50%) rotate(720deg)", opacity: 0 }], 1000, 40),
      () => document.querySelectorAll(".tq-card").forEach((el, i) => el.animate([{ filter: "brightness(1)" }, { filter: "brightness(1.12) saturate(1.3)", offset: .5 }, { filter: "brightness(1)" }], { duration: 700, delay: i * 60 })),
    ],
    record: [
      () => { banner("🏆 New record!"); confetti(screen(), { n: 60, spread: 2.5 }); },
      () => { banner("🎆 New record!", { bg: "#1D2433", color: "#fff" }); for (let i = 0; i < 4; i++) setTimeout(() => { const x = R(innerWidth * .2, innerWidth * .8), y = R(innerHeight * .15, innerHeight * .4); confetti({ left: x, right: x, top: y, bottom: y, width: 0, height: 0 }, { n: 26, colors: ["#F5C04E", "#F28C8C", "#A9D3EE", "#fff"], up: -.2 }); }, i * 280); },
      () => { const p = node("New record! 🎉", { left: "0", right: "0", top: "18%", textAlign: "center", background: "linear-gradient(90deg,#F28C8C,#F5C04E,#C2D9BC,#A9D3EE)", color: "#1D2433", padding: "14px", font: "700 24px Poppins, sans-serif" }); done(p.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)", offset: .2 }, { transform: "scaleX(1)", opacity: 1, offset: .85 }, { transform: "scaleX(1)", opacity: 0 }], { duration: 2200 }), p); },
      () => { banner("New record!", { bg: "#F5C04E" }); emojis(screen(), ["🪙", "⭐", "✨"], { n: 30, mode: "rain", size: 26, dur: 1600 }); },
    ],
  };

  window.TQFX = {
    NAMES, OPTIONS,
    picks: {},
    // Snapshot an element before the page redraws, so effects can start from where it was.
    capture(el) {
      if (!el) return { rect: { left: innerWidth / 2 - 100, right: innerWidth / 2 + 100, top: innerHeight / 2 - 20, bottom: innerHeight / 2 + 20, width: 200, height: 40 }, html: "" };
      const r = el.getBoundingClientRect();
      return { rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }, html: el.outerHTML };
    },
    play(action, ctx, el, variant) {
      if (reduce()) return;
      const list = FX[action]; if (!list) return;
      const v = variant ?? this.picks[action] ?? 0;
      try { list[v](ctx || this.capture(null), el || null); } catch (e) { /* an animation must never break the page */ }
    },
  };
})();
