// Tasks HQ sign-in helpers (stage 8), shared by the main page and every tool page.
// - Remembers the password on this device for 30 days, renewed on every visit:
//   localStorage with an expiry, plus a backup cookie (only sent to /hq/ pages).
// - Touch ID / Face ID (passkeys): after the check passes, the Worker hands back the password.
(() => {
  const API = (window.TQ_API || "").replace(/\/+$/, "");
  const LS = "tq-remember", CK = "tq_r", DAYS = 30;
  const WA = () => window.SimpleWebAuthnBrowser;

  function readCookie() {
    const m = document.cookie.match(/(?:^|;\s*)tq_r=([^;]*)/);
    try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; }
  }
  function get() {
    try {
      const r = JSON.parse(localStorage.getItem(LS) || "null");
      if (r && r.k && r.exp > Date.now()) return r.k;
    } catch (e) {}
    try { const s = sessionStorage.getItem("tq-key"); if (s) return s; } catch (e) {}
    return readCookie();
  }
  function save(key) {
    if (!key) return;
    const exp = Date.now() + DAYS * 864e5;
    try { localStorage.setItem(LS, JSON.stringify({ k: key, exp })); } catch (e) {}
    try { sessionStorage.setItem("tq-key", key); } catch (e) {}
    // Jobs HQ reads its own copy.
    try { sessionStorage.setItem("hq-pw", key); } catch (e) {}
    try {
      document.cookie = `${CK}=${encodeURIComponent(key)}; Max-Age=${DAYS * 86400}; Path=/hq/; Secure; SameSite=None; Partitioned`;
    } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(LS); sessionStorage.removeItem("tq-key"); sessionStorage.removeItem("hq-pw"); localStorage.removeItem("hq-pw"); } catch (e) {}
    try { document.cookie = `${CK}=; Max-Age=0; Path=/hq/; Secure; SameSite=None; Partitioned`; } catch (e) {}
  }
  const supported = () => !!(window.PublicKeyCredential && WA());
  async function post(path, body, key) {
    const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { "X-Key": key } : {}) }, body: JSON.stringify(body || {}) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || "Something went wrong"); e.status = r.status; throw e; }
    return data;
  }
  function niceError(e) {
    if (e && (e.name === "NotAllowedError" || e.name === "AbortError")) return "Face ID / Touch ID was cancelled or timed out. Tap the button again, or use your password.";
    if (e && e.name === "InvalidStateError") return "This device is already set up for Touch ID.";
    return (e && e.message) || "That didn't work.";
  }
  // Sign in with Touch ID / Face ID. Returns the password on success.
  // iPhone Safari only allows Face ID / Touch ID straight after a tap. Waiting for the network in between
  // makes it refuse, so the challenge is fetched ahead of time and the tap goes straight to Face ID.
  const ready = { login: null, reg: null };
  const fresh = (r) => r && Date.now() - r.at < 240000;
  async function prefetchLogin() {
    if (!supported()) return;
    try { ready.login = { at: Date.now(), opts: await post("/api/passkey/login/options") }; } catch (e) { ready.login = { at: Date.now(), err: e }; }
  }
  async function prefetchSetUp(key) {
    if (!supported() || !key) return;
    try { ready.reg = { at: Date.now(), opts: await post("/api/passkey/register/options", {}, key) }; } catch (e) { ready.reg = null; }
  }
  setInterval(() => { if (ready.login) prefetchLogin(); if (ready.reg && ready.reg.key) prefetchSetUp(ready.reg.key); }, 200000);
  async function passkeySignIn() {
    let optionsJSON;
    if (fresh(ready.login) && ready.login.opts) optionsJSON = ready.login.opts;
    else if (fresh(ready.login) && ready.login.err && ready.login.err.status === 404) throw ready.login.err;
    else optionsJSON = await post("/api/passkey/login/options");
    ready.login = null; setTimeout(prefetchLogin, 1500);
    let response;
    try { response = await WA().startAuthentication({ optionsJSON }); } catch (e) { throw new Error(niceError(e)); }
    const { key } = await post("/api/passkey/login/verify", { response });
    save(key);
    try { localStorage.setItem("tq-has-passkey", "1"); } catch (e) {}
    return key;
  }
  // Set up Touch ID / Face ID on this device (needs the password, i.e. signed in).
  async function passkeySetUp(key, label) {
    const optionsJSON = fresh(ready.reg) ? ready.reg.opts : await post("/api/passkey/register/options", {}, key);
    ready.reg = null;
    let response;
    try { response = await WA().startRegistration({ optionsJSON }); } catch (e) { throw new Error(niceError(e)); }
    await post("/api/passkey/register/verify", { response, label }, key);
    try { localStorage.setItem("tq-has-passkey", "1"); } catch (e) {}
  }
  const deviceName = () => {
    const u = navigator.userAgent;
    if (/iPhone/.test(u)) return "iPhone"; if (/iPad/.test(u)) return "iPad"; if (/Android/.test(u)) return "Android phone";
    if (/Mac/.test(u)) return "Mac"; if (/Windows/.test(u)) return "Windows PC"; return "This device";
  };
  const hasPasskeyHere = () => { try { return localStorage.getItem("tq-has-passkey") === "1"; } catch (e) { return false; } };
  window.TQAUTH = { get, save, clear, supported, passkeySignIn, passkeySetUp, prefetchLogin, prefetchSetUp, deviceName, hasPasskeyHere };
})();
