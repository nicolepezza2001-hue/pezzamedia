// Pezza Media — petals that tumble down the whole page in 3D.
// Near petals are bigger, faster and drift past quicker when you scroll; far ones are small and soft.
// Moving the mouse near a petal nudges it away. Skipped for reduced motion.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var layer = document.createElement('div');
  layer.className = 'petal-field'; layer.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(layer, document.body.firstChild);
  document.documentElement.classList.add('has-petals');

  var W = innerWidth, H = innerHeight;
  var count = W < 768 ? 7 : 13;
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var petals = [];
  for (var i = 0; i < count; i++) {
    var z = i / (count - 1);                   // 0 = far away, 1 = close to you
    var outer = document.createElement('div');
    var inner = document.createElement('i');
    outer.className = 'fpetal' + (z < 0.3 ? ' far' : '');
    outer.appendChild(inner); layer.appendChild(outer);
    var size = (W < 768 ? 13 : 16) + z * (W < 768 ? 14 : 22);
    inner.style.width = size + 'px'; inner.style.height = (size * 0.78) + 'px';
    outer.style.opacity = (0.6 + z * 0.4).toFixed(2);
    petals.push({
      el: outer, in: inner, z: z,
      x: rnd(0, W), y: rnd(-H * 0.2, H), vx: 0,
      fall: 16 + z * 34, sway: rnd(18, 50), freq: rnd(0.25, 0.6), phase: rnd(0, 6.28),
      rx: rnd(0.6, 1.4), ry: rnd(0.5, 1.2), rz: rnd(-45, 45),
      ax: rnd(0, 360), ay: rnd(0, 360), az: rnd(0, 360)
    });
  }

  var lastY = scrollY, mx = -999, my = -999, last = 0, t = 0;
  addEventListener('resize', function () { W = innerWidth; H = innerHeight; });
  if (matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
    document.addEventListener('pointerleave', function () { mx = my = -999; });
  }

  var frame = function (now) {
    var dt = Math.min((now - (last || now)) / 1000, 0.05); last = now; t += dt;
    var dy = scrollY - lastY; lastY = scrollY;
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      // Fall, plus parallax: scrolling carries close petals past faster than far ones
      p.y += p.fall * dt - dy * (0.12 + p.z * 0.55);
      // A breath of air from the pointer
      var dx = p.x - mx, dyy = p.y - my, d2 = dx * dx + dyy * dyy;
      if (d2 < 14400) { var f = (1 - Math.sqrt(d2) / 120) * 260 * dt; p.vx += (dx >= 0 ? 1 : -1) * f; p.y += (dyy >= 0 ? 1 : -1) * f * 0.4; }
      p.vx *= Math.pow(0.9, dt * 60);
      p.x += p.vx * dt * 6;
      if (p.y > H + 40) { p.y = -30; p.x = rnd(0, W); }
      else if (p.y < -60) { p.y = H + 30; p.x = rnd(0, W); }
      if (p.x < -40) p.x = W + 30; else if (p.x > W + 40) p.x = -30;
      p.az += p.rz * dt; // flutter in 3D, mostly facing you, while slowly turning
      var sx = p.x + Math.sin(t * p.freq * 6.28 + p.phase) * p.sway;
      p.el.style.transform = 'translate3d(' + sx.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px,' + ((p.z - 0.5) * 220).toFixed(0) + 'px)';
      p.in.style.transform = 'rotateX(' + (Math.sin(t * p.rx + p.ax) * 58).toFixed(1) + 'deg) rotateY(' + (Math.sin(t * p.ry + p.ay) * 50).toFixed(1) + 'deg) rotateZ(' + p.az.toFixed(1) + 'deg)';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
})();
