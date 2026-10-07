// Scroll and entrance effects. Everything here is optional polish:
// without JavaScript (or with "reduce motion" on) the page shows fully and statically.
(function () {
  const header = document.querySelector('.site-header');
  const onScroll = () => header && header.classList.toggle('scrolled', window.scrollY > 20);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Touch screens: press and hold a brand card to flip it, let go to flip back.
  // A short delay and a movement check stop it flipping while you scroll past.
  document.querySelectorAll('.flip').forEach((card) => {
    let timer, startX, startY;
    const release = () => { clearTimeout(timer); card.classList.remove('is-held'); };
    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => card.classList.add('is-held'), 180);
    }, { passive: true });
    card.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!card.classList.contains('is-held') && Math.hypot(t.clientX - startX, t.clientY - startY) > 10) release();
    }, { passive: true });
    card.addEventListener('touchend', release);
    card.addEventListener('touchcancel', release);
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // Testimonial carousel: buttons move one card at a time; touch and trackpads scroll naturally.
  document.querySelectorAll('.testimonial-carousel').forEach((carousel) => {
    const track = carousel.querySelector('.testimonial-grid');
    const previous = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    if (!track || !previous || !next) return;

    const move = (direction) => {
      const card = track.querySelector('.testimonial');
      if (!card) return;
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);

      if (direction > 0 && track.scrollLeft >= maxScroll - 2) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
        return;
      }
      if (direction < 0 && track.scrollLeft <= 8) {
        track.scrollTo({ left: maxScroll, behavior: 'smooth' });
        return;
      }

      track.scrollBy({ left: direction * (card.getBoundingClientRect().width + gap), behavior: 'smooth' });
    };

    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
  });

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('motion');

  // Fade and slide elements in as they enter the viewport, staggering siblings
  const revealSelector = [
    '.section-title', '.section-subtitle', '.story p', '.story-photo', '.intro-card',
    '.step', '.service-card', '.result', '.subhead', '.case-card', '.compare-wrap',
    '.testimonial', '.featured-testimonial', '.faq details', '.contact-copy', '.contact-form', '.proof-card', '.mini-result', '.fit-list li', '.industry', '.contact-copy .checklist li', '.contact-copy .chips li', '.contact-form > div',
    '.trust-label', '.reviews-bar', '.cta-box', '.about h1', '.about > .container > p'
  ].join(',');
  const items = document.querySelectorAll(revealSelector);
  items.forEach((el) => {
    const siblings = [...el.parentElement.children].filter((c) => c.matches(revealSelector));
    el.style.setProperty('--delay', `${Math.min(siblings.indexOf(el), 5) * 90}ms`);
    el.classList.add('reveal');
  });
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach((el) => revealer.observe(el));

  // Highlighted words sweep in whenever they scroll into view, and reset when they leave
  const highlights = document.querySelectorAll('.highlight');
  const highlightStart = performance.now();
  const highlighter = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      if (entry.isIntersecting) {
        // on first load, let the headline finish rising in before sweeping
        const wait = Math.max(0, 900 - (performance.now() - highlightStart));
        clearTimeout(el._sweep);
        el._sweep = setTimeout(() => el.classList.add('lit'), wait);
      } else {
        clearTimeout(el._sweep);
        el.classList.remove('lit');
      }
    });
  }, { threshold: 1, rootMargin: '-60px 0px -60px 0px' });
  highlights.forEach((el) => highlighter.observe(el));

  // Headline stats rapidly count up from zero whenever they scroll fully into view.
  // They reset to 0 once they leave the screen, so they replay when you come back.
  const counters = document.querySelectorAll('[data-count]');
  const pageStart = performance.now();
  const entranceDelay = 1100; // let the stat cards finish fading in on first load
  // data-decimals="2" keeps decimal places (1.97%); whole numbers get thousands separators ($222,933)
  const format = (el, n) => {
    const decimals = Number(el.dataset.decimals || 0);
    const body = decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-US');
    return (el.dataset.prefix || '') + body + (el.dataset.suffix || '');
  };
  const run = (el) => {
    const target = Number(el.dataset.count);
    const duration = 1200;
    const start = performance.now();
    el.classList.remove('counted');
    const tick = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = format(el, target * eased);
      if (t < 1) requestAnimationFrame(tick);
      else el.classList.add('counted');
    };
    requestAnimationFrame(tick);
  };
  counters.forEach((el) => { el.textContent = format(el, 0); });
  const counter = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const el = entry.target;
      if (entry.intersectionRatio >= 0.95) {
        if (el.dataset.running) return;
        el.dataset.running = '1';
        const wait = Math.max(0, entranceDelay - (performance.now() - pageStart));
        setTimeout(() => run(el), wait);
      } else if (!entry.isIntersecting) {
        delete el.dataset.running;
        el.classList.remove('counted');
        el.textContent = format(el, 0);
      }
    });
  }, { threshold: [0, 0.95] });
  counters.forEach((el) => counter.observe(el));
})();
