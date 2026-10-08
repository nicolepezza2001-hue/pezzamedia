// Pezza Media — small bits of behaviour: mobile menu, typing headline,
// carousels and the contact form. No libraries needed.

// ----- Mobile menu -----
(function () {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('mobile-menu');
  const overlay = document.querySelector('.menu-overlay');
  if (!toggle || !menu) return;
  function setOpen(open) {
    menu.classList.toggle('open', open);
    overlay.hidden = !open;
    document.body.classList.toggle('no-scroll', open);
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggle.addEventListener('click', () => setOpen(true));
  overlay.addEventListener('click', () => setOpen(false));
  menu.querySelector('.menu-close').addEventListener('click', () => setOpen(false));
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setOpen(false)));
})();

// ----- Typing headline ("Your ideas, my words, our success.") -----
(function () {
  const el = document.querySelector('.typing-text');
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const text = el.dataset.text || el.textContent.trim();
  const min = 2;
  let i = min, forward = true;
  function loop() {
    el.textContent = text.substring(0, i);
    let delay = 90;
    if (forward) {
      if (i < text.length) i++; else { forward = false; delay = 1800; }
    } else {
      if (i > min) { i--; delay = 40; } else { forward = true; delay = 400; }
    }
    setTimeout(loop, delay);
  }
  loop();
})();

// ----- Carousels: arrows + autoplay every 3.5s while on screen (pauses 8s after a click or swipe) -----
(function () {
  document.querySelectorAll('.carousel').forEach(track => {
    const step = () => track.firstElementChild.getBoundingClientRect().width +
      parseFloat(getComputedStyle(track).columnGap || 0);
    function move(dir) {
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 5;
      if (dir > 0 && atEnd) track.scrollTo({ left: 0 });
      else if (dir < 0 && track.scrollLeft <= 5) track.scrollTo({ left: track.scrollWidth });
      else track.scrollBy({ left: dir * step() });
    }
    document.querySelectorAll(`.arrow[data-target="${track.id}"]`).forEach(btn =>
      btn.addEventListener('click', () => { move(btn.classList.contains('next') ? 1 : -1); pause(); }));

    let timer = null, visible = false, hold = false;
    const start = () => { if (!timer && visible && !hold) timer = setInterval(() => move(1), 3500); };
    const stop = () => { clearInterval(timer); timer = null; };
    function pause() { stop(); hold = true; setTimeout(() => { hold = false; start(); }, 8000); }
    track.addEventListener('touchstart', pause, { passive: true });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); },
      { threshold: 0.2 }).observe(track);
  });
})();

// ----- Logo strip: duplicate the logos so the scroll loops seamlessly -----
(function () {
  const track = document.querySelector('.logo-track');
  if (!track) return;
  Array.from(track.children).forEach(li => {
    const copy = li.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    track.appendChild(copy);
  });
})();

// ----- Contact form (sent via formsubmit.co to the address in data-email) -----
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const show = id => { document.getElementById(id).hidden = false; };
  document.querySelectorAll('.popup-overlay').forEach(o => {
    o.addEventListener('click', e => { if (e.target === o || e.target.hasAttribute('data-close')) o.hidden = true; });
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = form.querySelector('.submit');
    const data = Object.fromEntries(new FormData(form));
    if (data._honey) return;
    data._subject = 'New enquiry from pezzamedia.com';
    data._template = 'table';
    data._captcha = 'false';
    button.disabled = true;
    try {
      const res = await fetch('https://formsubmit.co/ajax/' + form.dataset.email, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && String(json.success) !== 'false') { form.reset(); show('popup-success'); }
      else show('popup-failed');
    } catch (err) {
      show('popup-failed');
    } finally {
      button.disabled = false;
    }
  });
})();

// ----- Scroll animations: elements fade up as they come into view -----
(function () {
  const sel = [
    '.section-title', '.hero-sub', '.hero-ctas', '.laurel', '.hero-quote', '.marquee-label',
    '.stat', '.stats-note', '.case-card', '.more-title', '.more-brands li',
    '.journey-lead', '.journey-label', '.journey-map li', '.chips li', '.offer', '.result-card', '.results-note',
    '.about-intro', '.about-text p', '.about-photo', '.svc', '.services-head p',
    '.carousel', '.proof-strip li', '.faq details', '.contact-lead', '.envelope', '.btn'
  ].join(',');
  const els = Array.from(document.querySelectorAll(sel)).filter(el => !el.closest('.site-header, .mobile-menu, .popup'));
  if (!('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('anim');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const sibs = Array.from(el.parentElement.children).filter(c => c.classList.contains('reveal'));
    el.style.transitionDelay = Math.min(sibs.indexOf(el), 6) * 90 + 'ms';
    el.classList.add('in');
    io.unobserve(el);
    setTimeout(() => { el.classList.remove('reveal', 'in'); el.style.transitionDelay = ''; }, 1400);
  }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(el => { el.classList.add('reveal'); io.observe(el); });

  // Count up the numbers in the laurel badges
  document.querySelectorAll('.laurel b').forEach(b => {
    const m = b.textContent.match(/^(\D*)(\d+)(.*)$/);
    if (!m) return;
    const [, pre, num, post] = m, target = +num;
    const run = () => {
      const t0 = performance.now(), dur = 1400;
      const tick = now => {
        const p = Math.min((now - t0) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
        b.textContent = pre + Math.round(target * eased) + post;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    let shown = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !shown) { shown = true; run(); }
      else if (!e.isIntersecting) { shown = false; b.textContent = pre + '0' + post; }
    }, { threshold: 0.5 }).observe(b);
  });
})();

// ----- Hand-drawn underlines draw in, header shadow on scroll, laurels recount on return -----
(function () {
  if (!('IntersectionObserver' in window)) return;
  const draw = new IntersectionObserver(entries => entries.forEach(e => {
    e.target.classList.toggle('drawn', e.isIntersecting);
  }), { threshold: 1, rootMargin: '-40px 0px -40px 0px' });
  document.querySelectorAll('.underline').forEach(u => draw.observe(u));

  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 20);
  onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
})();

// ----- Mobile sticky "Book a call": hides at the top of the page and once the contact form is in view.
// The booking link lives in the sticky-cta href in index.html.
(function () {
  const cta = document.querySelector('.sticky-cta');
  if (!cta) return;
  const contact = document.getElementById('contact-section');
  let contactVisible = false;
  const update = () => cta.classList.toggle('away', contactVisible || window.scrollY < 400);
  if (contact && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { contactVisible = e.isIntersecting; update(); }, { threshold: 0.1 }).observe(contact);
  }
  update(); window.addEventListener('scroll', update, { passive: true });
})();

// ----- Animation pass 3: progress bar, word-by-word titles, counting result cards,
//       the journey "envelope", comparison ticks and tilting case cards -----
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Green reading-progress bar at the top of the page
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  document.body.appendChild(bar);
  const progress = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  };
  progress(); addEventListener('scroll', progress, { passive: true }); addEventListener('resize', progress);

  if (reduce || !('IntersectionObserver' in window)) return;
  const once = (els, fn, threshold = 0.4) => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { fn(e.target); io.unobserve(e.target); } }), { threshold });
    els.forEach(el => io.observe(el));
  };

  // Split section titles into words (keeps the hand-drawn underline spans intact)
  document.querySelectorAll('.section-title').forEach(t => {
    let i = 0;
    const wrap = node => {
      Array.from(node.childNodes).forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w'; w.textContent = part; w.style.transitionDelay = (i++ * 70) + 'ms';
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.classList.contains('underline')) {
          n.classList.add('w'); n.style.transitionDelay = (i++ * 70) + 'ms';
        } else if (n.nodeType === 1 && n.tagName !== 'BR') { wrap(n); }
      });
    };
    wrap(t);
  });
  once(document.querySelectorAll('.section-title'), t => t.classList.add('words-in'), 0.3);

  // Count up the big numbers on the result cards ($2M, $649K, 95th ...)
  once(document.querySelectorAll('.result-card b'), b => {
    const m = b.textContent.match(/^(\D*)([\d.]+)(.*)$/);
    if (!m) return;
    const [, pre, num, post] = m, target = parseFloat(num), dec = (num.split('.')[1] || '').length;
    const t0 = performance.now(), dur = 1300;
    b.classList.add('counting');
    const tick = now => {
      const p = Math.min((now - t0) / dur, 1), v = target * (1 - Math.pow(1 - p, 3));
      b.textContent = pre + v.toFixed(dec) + post;
      if (p < 1) requestAnimationFrame(tick); else { b.textContent = pre + num + post; b.classList.remove('counting'); }
    };
    requestAnimationFrame(tick);
  }, 0.6);

  // Journey map: light each flow card in turn, looping while it is on screen
  const map = document.querySelector('.journey-map');
  if (map) {
    const cards = Array.from(map.children);
    let idx = -1, timer = null;
    const step = () => { cards.forEach(c => c.classList.remove('lit')); idx = (idx + 1) % (cards.length + 2); if (cards[idx]) cards[idx].classList.add('lit'); };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !timer) timer = setInterval(step, 2800);
      else if (!e.isIntersecting) { clearInterval(timer); timer = null; cards.forEach(c => c.classList.remove('lit')); }
    }, { threshold: 0.5 }).observe(map);
    map.addEventListener('mouseenter', () => { clearInterval(timer); timer = null; cards.forEach(c => c.classList.remove('lit')); });
  }

  // Comparison table: ticks pop in row by row
  const table = document.querySelector('.versus-table');
  if (table) {
    table.querySelectorAll('tbody tr').forEach((tr, r) => {
      tr.style.transitionDelay = (r * 160) + 'ms';
      tr.querySelectorAll('i').forEach((i, c) => { i.style.animationDelay = (500 + r * 220 + c * 90) + 'ms'; });
    });
    // Replays every time the table comes back into view, once most of it is on screen
    new IntersectionObserver(([e]) => {
      if (e.intersectionRatio >= 0.55) table.classList.add('ticks-in');
      else if (!e.isIntersecting) table.classList.remove('ticks-in');
    }, { threshold: [0, 0.55] }).observe(table);
  }

  // Case cards tilt gently towards the pointer (mouse only)
  if (matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.case-card').forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.classList.add('tilting');
        card.style.transform = `perspective(900px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg) translateY(-6px)`;
      });
      card.addEventListener('mouseleave', () => { card.classList.remove('tilting'); card.style.transform = ''; });
    });
  }
})();

// Business icons: play once when the cards come into view; tap toggles on touch screens
(function () {
  const stats = document.querySelectorAll('.stat');
  if (!stats.length) return;
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    setTimeout(() => { el.classList.add('play'); setTimeout(() => el.classList.remove('play'), 2600); }, 300 + [...stats].indexOf(el) * 250);
  }), { threshold: 0.5 });
  stats.forEach(s => { io.observe(s); s.addEventListener('click', () => s.classList.toggle('play')); });
})();

// Services: draw the top line and pop the icon once each card is in view
(function () {
  const svcs = document.querySelectorAll('.svc');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('drawn'); io.unobserve(e.target); } }), { threshold: 0.4 });
  svcs.forEach(s => io.observe(s));
})();

// Contact letter: quill moves to the active field and writes while you type
(function () {
  const form = document.getElementById('contact-form');
  const pen = form && form.querySelector('.quill-pen');
  if (!pen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let idle;
  const place = el => {
    const f = form.getBoundingClientRect(), r = el.getBoundingClientRect();
    const len = Math.min(el.value.length * 7.5, r.width - 70);
    pen.style.translate = `${r.left - f.left + 14 + len}px ${r.top - f.top - 38}px`;
  };
  form.querySelectorAll('input:not(.honeypot), textarea').forEach(el => {
    el.addEventListener('focus', () => { pen.classList.add('on'); place(el); });
    el.addEventListener('input', () => { place(el); pen.classList.add('writing'); clearTimeout(idle); idle = setTimeout(() => pen.classList.remove('writing'), 350); });
    el.addEventListener('blur', () => setTimeout(() => { if (!form.contains(document.activeElement)) pen.classList.remove('on', 'writing'); }, 50));
  });
  form.addEventListener('submit', () => { pen.classList.remove('writing'); pen.classList.add('sent'); setTimeout(() => pen.classList.remove('sent', 'on'), 1100); });
})();

// ----- Services: words drift in; Envelope: stamp + postmark land when it comes into view -----
(function () {
  document.querySelectorAll('.svc').forEach(function (c, i) {
    c.style.setProperty('--i', i % 3);
    var p = c.querySelector('p'); if (!p || p.dataset.split) return;
    p.dataset.split = 1;
    p.innerHTML = p.textContent.split(/\s+/).map(function (w, j) { return '<span class="w" style="--d:' + j + '">' + w + '</span>'; }).join(' ');
  });
  var env = document.querySelector('.envelope');
  if (env && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { env.classList.add('posted'); io.disconnect(); } }); }, { threshold: 0.3 });
    io.observe(env);
  } else if (env) env.classList.add('posted');
})();
