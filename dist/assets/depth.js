// Pezza Media — depth pass: layered hero parallax, 3D medallions, the orbiting logo ring
// and cards that tilt towards the pointer. Pure CSS 3D transforms, no libraries.
// Everything is skipped for people who ask for reduced motion.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  root.classList.add('depth');
  var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  var lerp = function (a, b, t) { return a + (b - a) * t; };

  // ---------- Hero: pointer + scroll parallax ----------
  var hero = document.querySelector('.hero');
  if (hero) {
    var tx = 0, ty = 0, mx = 0, my = 0, sy = -1, heroOn = true, raf = 0;
    var frame = function () {
      raf = 0;
      mx = lerp(mx, tx, 0.08); my = lerp(my, ty, 0.08);
      var s = Math.min(Math.max(scrollY / (hero.offsetHeight * 0.9), 0), 1);
      hero.style.setProperty('--mx', mx.toFixed(4));
      hero.style.setProperty('--my', my.toFixed(4));
      if (Math.abs(s - sy) > 0.0005) { sy = s; hero.style.setProperty('--sy', s.toFixed(4)); }
      if (heroOn && (Math.abs(tx - mx) > 0.001 || Math.abs(ty - my) > 0.001)) kick();
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(frame); };
    if (finePointer) {
      addEventListener('pointermove', function (e) {
        if (!heroOn) return;
        tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; kick();
      }, { passive: true });
    } else if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      // Phones that share tilt without asking (most Android): lean the hero layers with the phone
      addEventListener('deviceorientation', function (e) {
        if (!heroOn || e.gamma == null) return;
        tx = Math.max(-0.5, Math.min(0.5, e.gamma / 50));
        ty = Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 60)); kick();
      }, { passive: true });
    }
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick);
    new IntersectionObserver(function (es) { heroOn = es[0].isIntersecting; if (heroOn) kick(); }).observe(hero);
    kick();

    // Medallions spin once when hovered or tapped
    document.querySelectorAll('.laurel').forEach(function (l) {
      var spin = function () {
        if (l.classList.contains('spin')) return;
        l.classList.add('spin');
        l.addEventListener('animationend', function done(e) {
          if (e.animationName !== 'medal-spin') return;
          l.classList.remove('spin'); l.removeEventListener('animationend', done);
        });
      };
      l.addEventListener(finePointer ? 'mouseenter' : 'click', spin);
    });
  }

  // ---------- Logo ring: brands and press orbit in 3D, drag or swipe to spin ----------
  var wrap = document.querySelector('.logo-marquee');
  var track = wrap && wrap.querySelector('.logo-track');
  if (wrap && track) {
    // site.js doubled the logos for the flat marquee; the ring only needs one set
    track.querySelectorAll('li[aria-hidden="true"]').forEach(function (li) { li.remove(); });
    var items = Array.prototype.slice.call(track.children);
    var n = items.length;
    if (n > 2) {
      wrap.classList.add('ring');

      var step = (Math.PI * 2) / n, angle = 0, vel = 0, auto = 0.0016, R = 380, lift = 46;
      var dragging = false, lastX = 0, lastT = 0, hover = false, ringOn = false, ringRaf = 0, last = 0;
      var size = function () {
        var w = wrap.clientWidth, small = w < 768;
        var spacing = small ? 100 : 230;
        R = Math.max((n * spacing) / (Math.PI * 2), small ? 200 : 300);
        R = Math.min(R, small ? w * 0.62 : w * 0.46);
        lift = small ? 30 : 46;
      };
      var place = function () {
        for (var i = 0; i < n; i++) {
          var a = angle + i * step, c = Math.cos(a), s = Math.sin(a);
          var depth = (c + 1) / 2; // 1 = front, 0 = back
          items[i].style.transform =
            'translate3d(' + (s * R).toFixed(1) + 'px,' + (-(1 - depth) * lift).toFixed(1) + 'px,' + ((c - 1) * R).toFixed(1) + 'px) rotateY(' + (s * 32).toFixed(1) + 'deg)';
          items[i].style.opacity = (0.12 + 0.88 * Math.pow(depth, 2)).toFixed(3);
          items[i].style.setProperty('--d', depth.toFixed(3));
          items[i].style.zIndex = Math.round(depth * 100);
          items[i].style.pointerEvents = depth > 0.6 ? '' : 'none';
        }
      };
      var tick = function (now) {
        ringRaf = 0;
        var dt = Math.min(now - (last || now), 50); last = now;
        if (!dragging) {
          vel *= Math.pow(0.94, dt / 16);
          angle -= (hover ? 0 : auto) * dt / 16 * 1 + vel * dt / 16;
        }
        place();
        if (ringOn) ringRaf = requestAnimationFrame(tick);
      };
      var startRing = function () { if (!ringRaf) { last = 0; ringRaf = requestAnimationFrame(tick); } };

      size(); place();
      addEventListener('resize', function () { size(); place(); });
      new IntersectionObserver(function (es) {
        ringOn = es[0].isIntersecting;
        if (ringOn) startRing(); else { cancelAnimationFrame(ringRaf); ringRaf = 0; }
      }).observe(wrap);

      if (finePointer) {
        wrap.addEventListener('mouseenter', function () { hover = true; });
        wrap.addEventListener('mouseleave', function () { hover = false; });
      }
      wrap.addEventListener('pointerdown', function (e) {
        dragging = true; lastX = e.clientX; lastT = performance.now(); vel = 0;
        wrap.classList.add('dragging');
        if (e.pointerType === 'mouse') wrap.setPointerCapture(e.pointerId);
      });
      wrap.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var now = performance.now(), dx = e.clientX - lastX;
        var dA = dx / R; // move the front logo with the finger
        angle += dA;
        vel = -dA / Math.max((now - lastT) / 16, 0.5);
        lastX = e.clientX; lastT = now;
        if (!ringRaf) place();
      });
      var end = function () { if (!dragging) return; dragging = false; wrap.classList.remove('dragging'); vel = Math.max(-0.08, Math.min(0.08, vel)); };
      wrap.addEventListener('pointerup', end);
      wrap.addEventListener('pointercancel', end);
      wrap.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') end(); });
    }
  }

  // ---------- Cards tilt towards the pointer with a moving light (mouse and trackpad only) ----------
  if (finePointer) {
    var cards = document.querySelectorAll('.case-card, .stat, .result-card, .svc, .journey-map li');
    cards.forEach(function (card) {
      card.classList.add('tilt');
      var glare = document.createElement('span');
      glare.className = 'glare'; glare.setAttribute('aria-hidden', 'true');
      card.appendChild(glare);
      var max = card.classList.contains('result-card') || card.matches('.journey-map li') ? 10 : 7;
      var pending = null, rafId = 0;
      var apply = function () {
        rafId = 0; if (!pending) return;
        var r = card.getBoundingClientRect();
        var x = (pending.x - r.left) / r.width - 0.5, y = (pending.y - r.top) / r.height - 0.5;
        var lifted = card.matches('.journey-map li.lit') ? ' translateY(-10px) translateZ(40px)' : ' translateY(-6px)';
        card.style.transform = 'perspective(900px) rotateX(' + (-y * max).toFixed(2) + 'deg) rotateY(' + (x * max * 1.2).toFixed(2) + 'deg)' + lifted;
        card.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
      };
      card.addEventListener('mousemove', function (e) {
        if (card.classList.contains('reveal')) return; // let the entrance finish first
        card.classList.add('tilting');
        pending = { x: e.clientX, y: e.clientY };
        if (!rafId) rafId = requestAnimationFrame(apply);
      });
      card.addEventListener('mouseleave', function () {
        pending = null; card.classList.remove('tilting'); card.style.transform = '';
      });
    });
  }
})();
