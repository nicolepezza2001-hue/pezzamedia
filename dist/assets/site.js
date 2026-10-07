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
    '.journey-lead', '.journey-label', '.journey-map li', '.chips li', '.offer',
    '.about-intro', '.about-text p', '.about-photo', '.svc', '.services-head p',
    '.carousel', '.faq details', '.contact-lead', '.envelope', '.btn'
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
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { run(); o.disconnect(); } }, { threshold: 0.5 }).observe(b);
  });
})();
