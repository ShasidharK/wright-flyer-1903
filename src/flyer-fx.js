// Overlays for the teaching views: force arrows drawn over everything (so a force reads through the airframe), labels that
// follow points in 3D, trails, and one hue per force (darker on paper themes). The iso-glow rule of a single accent bends
// here on purpose: lift, weight, thrust and drag are easier to tell apart in their own colours.
const WF_FX = (() => {
  const PAL = { dark: { lift: 0x4ade80, weight: 0xf87171, thrust: 0x60a5fa, drag: 0xfbbf24, wind: 0xcbd5e1, motion: 0xe879f9, tension: 0xfb923c },
                light: { lift: 0x15803d, weight: 0xb91c1c, thrust: 0x1d4ed8, drag: 0xb45309, wind: 0x475569, motion: 0xa21caf, tension: 0xc2410c } };
  const UPV = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const arrows = [], lineMats = [];
  let paper = false;
  const hex = role => (paper ? PAL.light : PAL.dark)[role];
  const css = role => '#' + hex(role).toString(16).padStart(6, '0');

  function lineMaterial(role, width = 2.4, opts = {}) {
    const m = new LineMaterial({ color: hex(role), linewidth: width, resolution: lineMat.resolution.clone(), depthTest: false, transparent: true, ...opts });
    m.userData.role = role; m.userData.w = width; lineMats.push(m); return m;
  }
  // an arrow from `from` along `vec` (both in the parent's space); the head keeps a fixed size in world units
  function arrow(role, parent, { width = 2.6, head = 0.22 } = {}) {
    const lm = lineMaterial(role, width), cm = new THREE.MeshBasicMaterial({ color: hex(role), depthTest: false, transparent: true });
    const g = new THREE.Group(), shaft = new LineSegments2(new LineSegmentsGeometry().setPositions([0, 0, 0, 0, 1, 0]), lm);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1, 16).translate(0, -0.5, 0), cm);
    shaft.renderOrder = tip.renderOrder = 30; shaft.frustumCulled = false; tip.frustumCulled = false;
    g.add(shaft, tip); g.visible = false; parent.add(g);
    const A = { g, role, cm, from: new THREE.Vector3(), vec: new THREE.Vector3(),
      set(from, vec, headLen = head) {
        A.from.copy(from); A.vec.copy(vec);
        const L = vec.length(); if (L < 1e-4) { g.visible = false; return A; }
        g.visible = true; g.position.copy(from); g.quaternion.setFromUnitVectors(UPV, tmp.copy(vec).divideScalar(L));
        const hl = Math.min(headLen, L * 0.5);
        shaft.scale.set(1, Math.max(1e-4, L - hl * 0.7), 1); tip.position.set(0, L, 0); tip.scale.set(hl, hl, hl);
        return A; },
      hide() { g.visible = false; return A; },
      tipWorld(out) { return g.parent.localToWorld(out.copy(A.from).add(A.vec)); } };
    arrows.push(A); return A;
  }
  // a polyline that can be redrawn (trails, cables, flow lines)
  function poly(role, parent, { width = 1.6, opacity = 1 } = {}) {
    const m = lineMaterial(role, width, { opacity });
    const geo = new LineSegmentsGeometry().setPositions([0, 0, 0, 0, 0, 0]);
    const line = new LineSegments2(geo, m); line.frustumCulled = false; line.renderOrder = 25; parent.add(line);
    return { line, m, set(points, closed = false) {                      // points: Vector3[] (or a flat segment array)
      let a = points;
      if (points.length && points[0].isVector3) { a = []; for (let i = 0; i < points.length - (closed ? 0 : 1); i++) { const p = points[i], q = points[(i + 1) % points.length]; a.push(p.x, p.y, p.z, q.x, q.y, q.z); } }
      if (a.length < 6) { line.visible = false; return; }
      line.visible = true; line.geometry.dispose(); line.geometry = new LineSegmentsGeometry().setPositions(a); } };
  }

  // HTML labels that follow a point in 3D
  let layer = null; const labels = [];
  function label(text, { cls = '', role = null } = {}) {
    if (!layer) { layer = document.createElement('div'); layer.className = 'wf-fxl'; document.body.appendChild(layer); }
    const el = document.createElement('div'); el.className = 'wf-fxlabel ' + cls; el.innerHTML = text; if (role) el.style.setProperty('--c', css(role)); layer.appendChild(el);
    const L = { el, role, get: null, set(html) { if (el.innerHTML !== html) el.innerHTML = html; return L; }, at(fn) { L.get = fn; return L; },
      remove() { el.remove(); labels.splice(labels.indexOf(L), 1); } };
    labels.push(L); return L;
  }
  function tick(cam) {
    for (const m of lineMats) m.resolution.copy(lineMat.resolution);
    for (const L of labels) {
      const p = L.get && L.get(tmp2);
      if (!p) { L.el.style.display = 'none'; continue; }
      tmp.copy(p).project(cam);
      const show = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
      L.el.style.display = show ? '' : 'none';
      if (show) L.el.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px)`;
    }
  }
  function setPaper(p) {
    paper = p;
    for (const m of lineMats) m.color.setHex(hex(m.userData.role));
    for (const A of arrows) A.cm.color.setHex(hex(A.role));
    for (const L of labels) if (L.role) L.el.style.setProperty('--c', css(L.role));
  }
  return { arrow, poly, label, tick, setPaper, hex, css, lineMaterial };
})();
