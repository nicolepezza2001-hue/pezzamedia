// Pezza Media — the scroll journey: an airmail route that winds down the page from section to section.
// A paper plane follows your scroll along the route, inking it in behind it, and lands at the contact form.
// Built from the live layout, so it redraws itself when the page changes size. Skipped for reduced motion.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var main = document.getElementById('main');
  if (!main || !('ResizeObserver' in window)) return;
  var sections = Array.prototype.slice.call(main.querySelectorAll(':scope > section'));
  if (sections.length < 3) return;

  var NAMES = { results: 'The numbers', 'portfolio-section': 'The work', email: 'Email', 'greeting-section': 'Hello', 'copyright-section': 'Services', 'reviews-section': 'Reviews', compare: 'Compare', faq: 'Questions' };
  var NS = 'http://www.w3.org/2000/svg';
  var mk = function (tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  var svg = mk('svg', { class: 'route', 'aria-hidden': 'true', focusable: 'false' });
  var base = mk('path', { class: 'route-base' }, svg);
  var done = mk('path', { class: 'route-done' }, svg);
  var stopsG = mk('g', { class: 'route-stops' }, svg);
  var plane = mk('g', { class: 'route-plane' }, svg);
  var planeInner = mk('g', { class: 'route-plane-inner' }, plane);
  // Paper plane drawn pointing right (+x), so it can be rotated to the route direction
  mk('path', { d: 'M-14 -10 L16 0 L-14 10 L-8 0 Z', fill: '#FBF4D7', stroke: '#141B41', 'stroke-width': '1.6', 'stroke-linejoin': 'round' }, planeInner);
  mk('path', { d: 'M-8 0 L16 0 M-8 0 L-12 7', fill: 'none', stroke: '#141B41', 'stroke-width': '1.3', 'stroke-linecap': 'round' }, planeInner);
  mk('path', { d: 'M-14 -10 L16 0 L-8 0 Z', fill: '#E8D8D5', stroke: '#141B41', 'stroke-width': '1.6', 'stroke-linejoin': 'round' }, planeInner);
  main.appendChild(svg);
  document.documentElement.classList.add('has-route');

  var total = 0, lens = [], ys = [], stops = [], cur = -1, target = 0, raf = 0, mainTop = 0;

  var build = function () {
    var mr = main.getBoundingClientRect();
    mainTop = mr.top + scrollY;
    var W = main.clientWidth, H = main.scrollHeight;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var c = document.querySelector('#results .container') || document.querySelector('.container');
    var contentLeft = c ? c.getBoundingClientRect().left + parseFloat(getComputedStyle(c).paddingLeft) : 20;
    var L = Math.max(8, contentLeft / 2), R = W - L, cx = W / 2;
    var y = function (r) { return r - mr.top; };

    // One crossing in the gap between each pair of neighbouring sections
    var cross = [];
    for (var i = 0; i < sections.length - 1; i++) {
      var prev = sections[i], next = sections[i + 1];
      var last = prev.lastElementChild, first = next.firstElementChild;
      while (last && (last.hidden || last.offsetHeight === 0)) last = last.previousElementSibling;
      if (!last || !first) continue;
      var a = y(last.getBoundingClientRect().bottom), b = y(first.getBoundingClientRect().top);
      if (b <= a) { a = y(next.getBoundingClientRect().top) - 20; b = a + 40; }
      var hh = Math.max(10, Math.min((b - a) / 2 - 8, 80));
      cross.push({ m: (a + b) / 2, hh: hh, n: i + 1 });
    }
    if (!cross.length) return;

    // Route: centre of the hero → down the gutters, switching sides in each gap → centre of the contact section
    var d = '', side = L, stopPts = [];
    cross.forEach(function (k, idx) {
      var fromX = idx === 0 ? cx : side;
      var toX = idx === cross.length - 1 ? cx : (fromX === L ? R : L);
      if (idx === 0) toX = L;
      var ya = k.m - k.hh, yb = k.m + k.hh, dd = (yb - ya) / 2;
      d += (idx === 0 ? 'M' : ' L') + fromX.toFixed(1) + ' ' + ya.toFixed(1);
      d += ' C' + fromX.toFixed(1) + ' ' + (ya + dd).toFixed(1) + ' ' + toX.toFixed(1) + ' ' + (yb - dd).toFixed(1) + ' ' + toX.toFixed(1) + ' ' + yb.toFixed(1);
      if (idx < cross.length - 1) stopPts.push({ x: toX, y: yb, n: k.n, left: toX === L });
      side = toX;
    });
    base.setAttribute('d', d); done.setAttribute('d', d);
    total = base.getTotalLength();
    done.style.strokeDasharray = total + ' ' + total;

    // Sample length → height (the route only ever moves down the page)
    lens = []; ys = [];
    for (var l = 0; l <= total; l += 6) { lens.push(l); ys.push(base.getPointAtLength(l).y); }
    lens.push(total); ys.push(base.getPointAtLength(total).y);

    // Stops: one small postmark dot where each new section begins
    while (stopsG.firstChild) stopsG.removeChild(stopsG.firstChild);
    stops = stopPts.map(function (p) {
      var dot = mk('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 5 }, stopsG);
      var name = NAMES[sections[p.n].id];
      if (name && W >= 768) {
        var label = mk('text', { x: (p.left ? p.x + 14 : p.x - 14).toFixed(1), y: (p.y + 4).toFixed(1), 'text-anchor': p.left ? 'start' : 'end' }, stopsG);
        label.textContent = 'Stop ' + (p.n < 10 ? '0' : '') + p.n + ' · ' + name;
      }
      return { el: dot, y: p.y };
    });
    cur = -1; update(); render();
  };

  var lenAtY = function (yy) {
    if (!ys.length) return 0;
    if (yy <= ys[0]) return 0;
    if (yy >= ys[ys.length - 1]) return total;
    var lo = 0, hi = ys.length - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ys[mid] < yy) lo = mid; else hi = mid; }
    var t = (yy - ys[lo]) / Math.max(ys[hi] - ys[lo], 0.001);
    return lens[lo] + (lens[hi] - lens[lo]) * t;
  };
  var update = function () {
    target = lenAtY(scrollY + innerHeight * 0.55 - mainTop);
    if (!raf) raf = requestAnimationFrame(render);
  };
  var render = function () {
    raf = 0;
    if (!total) return;
    cur = cur < 0 ? target : cur + (target - cur) * 0.14;
    if (Math.abs(target - cur) < 0.3) cur = target;
    done.style.strokeDashoffset = (total - cur).toFixed(1);
    var p = base.getPointAtLength(cur);
    var q = base.getPointAtLength(Math.min(cur + 2, total)), o = base.getPointAtLength(Math.max(cur - 2, 0));
    var ang = Math.atan2(q.y - o.y, q.x - o.x) * 180 / Math.PI;
    plane.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
    plane.classList.toggle('landed', cur >= total - 1);
    stops.forEach(function (s) { s.el.classList.toggle('passed', p.y >= s.y - 1); });
    if (cur !== target) raf = requestAnimationFrame(render);
  };

  var t;
  var rebuild = function () { clearTimeout(t); t = setTimeout(build, 150); };
  new ResizeObserver(rebuild).observe(main);
  addEventListener('resize', rebuild);
  addEventListener('load', rebuild);
  addEventListener('scroll', update, { passive: true });
  build();
})();
