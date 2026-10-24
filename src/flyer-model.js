// The 1903 Wright Flyer built in code, in real metres: +z forward, +y up, +x the pilot's left. The root is scaled by K
// to scene units. Each component is a part group (key = its WF_INFO entry); static pieces of a part are merged into one
// mesh. Moving pieces hang on pivots: the warping wingtips, the elevator, the rudder, the propellers and the flywheel.
const WF_MODEL = (() => {
  const K = 0.5;                                          // scene units per metre
  const M0 = new THREE.MeshBasicMaterial();               // placeholder: isoBuilt restyles every solid
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Y_LO = 0.80, Y_UP = 2.68, CHORD = 1.98;           // wing chord-line heights (gap 1.88 m) and chord
  const U_F = 0.12, U_R = 0.72;                           // front and rear spar, as fractions of the chord

  // a cambered section (camber h, thickness t) with its camber line yc and half thickness th, u = 0 at the leading edge
  function foil(c, h, t) {
    const yc = u => h * 6.75 * u * (1 - u) * (1 - u), th = u => t * 1.3 * Math.sqrt(u) * (1 - u) + 0.002;
    const z = u => (0.5 - u) * c;
    function shape(k = 1, n = 18) {                       // k < 1: a slimmer, slightly shorter section that sits inside (a rib)
      const cf = k < 1 ? 0.97 : 1, s = new THREE.Shape(), us = [];
      for (let i = 0; i <= n; i++) us.push((1 - Math.cos(Math.PI * i / n)) / 2);
      s.moveTo((us[0] - 0.5) * c * cf, yc(us[0]) + th(us[0]) * k);
      for (let i = 1; i <= n; i++) s.lineTo((us[i] - 0.5) * c * cf, yc(us[i]) + th(us[i]) * k);
      for (let i = n - 1; i >= 1; i--) s.lineTo((us[i] - 0.5) * c * cf, yc(us[i]) - th(us[i]) * k);
      return s;
    }
    // extrude along +x from x0 to x1 at height y: the shape's x becomes −z, so the leading edge faces forward
    const span = (sh, x0, x1, y) => new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 }).rotateY(Math.PI / 2).translate(x0, y, 0);
    return { c, yc, th, z, panel: (x0, x1, y) => span(shape(1), x0, x1, y), rib: (x, y, w = 0.012) => span(shape(0.8), x - w / 2, x + w / 2, y),
      top: (x, y, n = 14) => { const p = []; for (let i = 0; i <= n; i++) { const u = (1 - Math.cos(Math.PI * i / n)) / 2; p.push(V(x, y + yc(u) + th(u) + 0.003, z(u))); } return p; } };
  }
  const WING = foil(CHORD, CHORD / 20, 0.06), ELEV = foil(0.8, 0.04, 0.035);
  const zF = WING.z(U_F), zR = WING.z(U_R);
  const loTop = u => Y_LO + WING.yc(u) + WING.th(u), loBot = u => Y_LO + WING.yc(u) - WING.th(u);
  const upTop = u => Y_UP + WING.yc(u) + WING.th(u), upBot = u => Y_UP + WING.yc(u) - WING.th(u);

  // ── geometry helpers ──
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(1, 1, 1)));
  const box = (w, h, d, x, y, z, rx, ry, rz) => at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const cyl = (r, h, x, y, z, rx, ry, rz, seg = 14) => at(new THREE.CylinderGeometry(r, r, h, seg), x, y, z, rx, ry, rz);
  const along = (g, a, b, axis) => {                     // stand geometry g (built along `axis`) between points a and b
    const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(axis, d.normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1))); g.userData.axis = d.clone(); return g;
  };
  const beam = (a, b, w, h) => along(new THREE.BoxGeometry(w, h, a.distanceTo(b)), a, b, V(0, 0, 1));
  const rod = (a, b, r, seg = 8) => along(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), a, b, V(0, 1, 0));
  const limb = (a, b, r) => along(new THREE.CapsuleGeometry(r, Math.max(0.01, a.distanceTo(b) - 2 * r), 4, 10), a, b, V(0, 1, 0));
  // the direction wood grain runs in a piece: recorded by along(), else its longest side
  const grainOf = g => { if (g.userData.axis) return g.userData.axis; g.computeBoundingBox(); const s = g.boundingBox.getSize(V(0, 0, 0));
    return s.x >= s.y && s.x >= s.z ? V(1, 0, 0) : s.y >= s.z ? V(0, 1, 0) : V(0, 0, 1); };
  // many geometries → one indexed mesh geometry (positions, flat normals, grain axis; isoBuilt finds the hairlines on it)
  function merge(list) {
    const gs = list.map(g => { const a = grainOf(g), x = g.index ? g.toNonIndexed() : g; x.userData.axis = a; return x; });
    let n = 0; gs.forEach(g => { if (!g.attributes.normal) g.computeVertexNormals(); n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), grn = new Float32Array(n * 3); let o = 0;
    gs.forEach(g => { const c = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < c; i++) grn.set([g.userData.axis.x, g.userData.axis.y, g.userData.axis.z], (o + i) * 3); o += c; });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('aGrain', new THREE.BufferAttribute(grn, 3));
    out.setIndex(Array.from({ length: n }, (_, i) => i));
    return out;
  }
  const lines = (pts, closed = false) => { const a = []; for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a.push(p.x, p.y, p.z, q.x, q.y, q.z); } return a; };

  let root = null, parts = [], piv = {}, geo = {}, strutWires = [];
  function part(key, ex) {
    const g = new THREE.Group(); g.name = key; g.userData.wf = key; root.add(g);
    parts.push({ key, g, ex: V(...ex) }); return g;
  }
  const mesh = (name, geo, parent) => { const m = new THREE.Mesh(geo, M0); m.name = name; parent.add(m); return m; };
  const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
  const off = (g, p) => g.translate(-p.position.x, -p.position.y, -p.position.z);

  // ── wings: a centre panel and two tip panels that twist about the front spar ──
  function wing(key, y, ex) {
    const g = part(key, ex), out = {};
    for (const [side, x0, x1] of [['C', -3.2, 3.2], ['L', 3.2, 6.15], ['R', -6.15, -3.2]]) {
      const p = pivot(g, side === 'C' ? 0 : side === 'L' ? 3.2 : -3.2, y + WING.yc(U_F), zF); out[side] = p;
      mesh(key + side + 'Skin', off(merge([WING.panel(x0, x1, y)]), p), p);
      const frame = [box(x1 - x0, 0.028, 0.045, (x0 + x1) / 2, y + WING.yc(U_F), zF), box(x1 - x0, 0.022, 0.04, (x0 + x1) / 2, y + WING.yc(U_R), zR)];
      const ribX = []; for (let x = x0 + 0.16; x < x1 - 0.05; x += 0.31) ribX.push(x);
      ribX.forEach(x => frame.push(WING.rib(x, y)));
      mesh(key + side + 'Frame', off(merge(frame), p), p);
      // the rib pockets show through the fabric as fine lines on the upper surface
      const rl = []; ribX.forEach(x => rl.push(...lines(WING.top(x, y))));
      rl.push(x0, y + 0.003, WING.z(1), x1, y + 0.003, WING.z(1));      // the trailing edge is a wire the fabric is sewn to
      const l = fat(rl, lineMat); l.position.copy(p.position).negate(); p.add(l);
    }
    return out;
  }

  function build() {
    root = new THREE.Group(); root.scale.setScalar(K); parts = []; piv = {}; geo = {}; strutWires = [];
    const lo = wing('lowerWing', Y_LO, [0, 0.7, 0]), up = wing('upperWing', Y_UP, [0, 2.9, 0]);
    piv.warp = { loL: lo.L, loR: lo.R, upL: up.L, upR: up.R };

    // uprights and the crossed wires of each bay
    const XS = [0.55, 1.95, 3.35, 4.75, 6.0], xs = [...XS.map(x => -x).reverse(), ...XS];
    { const g = part('struts', [0, 1.8, 0]), list = [], w = [];
      for (const x of xs) for (const [u, z] of [[U_F, zF], [U_R, zR]]) { const b = loTop(u), t = upBot(u); list.push(box(0.028, t - b, 0.055, x, (b + t) / 2, z));
        list.push(box(0.05, 0.022, 0.075, x, b + 0.011, z), box(0.05, 0.022, 0.075, x, t - 0.011, z)); }   // metal fittings at both ends
      mesh('uprights', merge(list), g);
      for (let i = 0; i < xs.length - 1; i++) for (const [u, z] of [[U_F, zF], [U_R, zR]]) {
        const a = xs[i], b = xs[i + 1], y0 = loTop(u), y1 = upBot(u);
        w.push(a, y0, z, b, y1, z, a, y1, z, b, y0, z);
      }
      const wl = fat(w, lineMat); g.add(wl); piv.wires = wl; strutWires = w; }

    // skids: runners that sweep up at the front to carry the elevator, with posts and braces to the lower wing
    { const g = part('skids', [0, 0, 0]), list = [];
      for (const s of [-1, 1]) { const x = s * 0.55;
        const path = [V(x, 0.05, -1.05), V(x, 0.05, 1.5), V(x, 0.2, 2.15), V(x, 0.52, 2.6), V(x, 0.86, 2.85)];
        for (let i = 0; i < path.length - 1; i++) list.push(beam(path[i], path[i + 1], 0.05, 0.08));
        for (const [u, z] of [[U_F, zF], [U_R, zR]]) list.push(beam(V(x, 0.09, z), V(x, loBot(u), z), 0.04, 0.04));
        list.push(beam(V(x, 0.09, 1.5), V(x, loBot(0.02), WING.z(0.02)), 0.035, 0.035), beam(V(x, 0.09, -1.05), V(x, loBot(0.96), WING.z(0.96)), 0.035, 0.035));
      }
      mesh('runners', merge(list), g); }

    // forward elevator: two cambered surfaces, struts and half-moon blinkers on one pivot; outriggers fixed to the wing
    { const g = part('elevator', [0, 0.9, 2.4]), p = pivot(g, 0, 1.3, 3.05); piv.elevator = p;
      const skin = [], frame = [];
      for (const y of [1.0, 1.6]) {
        skin.push(ELEV.panel(-1.8, 1.8, y).translate(0, 0, 3.05));
        for (let x = -1.65; x <= 1.66; x += 0.3) frame.push(ELEV.rib(x, y).translate(0, 0, 3.05));
      }
      for (const x of [-1.45, -0.4, 0.4, 1.45]) frame.push(box(0.022, 0.55, 0.035, x, 1.3, 3.05 + ELEV.z(0.3)));
      const moon = new THREE.Shape(); moon.moveTo(0, -0.27); for (let i = 1; i <= 16; i++) { const a = -Math.PI / 2 + Math.PI * i / 16; moon.lineTo(0.27 * Math.cos(a), 0.27 * Math.sin(a)); }
      for (const x of [-0.3, 0.3]) frame.push(new THREE.ExtrudeGeometry(moon, { depth: 0.012, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(x + 0.006, 1.3, 3.05));
      mesh('elevatorSkin', off(merge(skin), p), p); mesh('elevatorFrame', off(merge(frame), p), p);
      const fixed = []; for (const s of [-1, 1]) {                     // hinge brackets on the pivot line, outriggers from the upper wing and the skid tips
        fixed.push(box(0.05, 0.09, 0.09, s * 0.62, 1.3, 3.05), rod(V(s * 0.55, upBot(0.02), WING.z(0.02)), V(s * 0.62, 1.34, 3.0), 0.022), rod(V(s * 0.55, 0.86, 2.85), V(s * 0.62, 1.26, 3.0), 0.02)); }
      mesh('elevatorOutriggers', merge(fixed), g); }

    // twin rudder on a vertical hinge at its leading edge, outriggers back from both wings
    { const g = part('rudder', [0, 0.9, -2.4]), p = pivot(g, 0, 1.6, -2.3); piv.rudder = p;
      const skin = [], frame = [];
      for (const s of [-1, 1]) { skin.push(box(0.025, 1.7, 0.6, s * 0.3, 1.6, -2.6)); for (let y = 0.9; y < 2.4; y += 0.3) frame.push(box(0.012, 0.02, 0.56, s * 0.3, y, -2.6)); }
      for (const y of [0.76, 2.44]) for (const z of [-2.31, -2.89]) frame.push(box(0.6, 0.03, 0.03, 0, y, z));
      frame.push(rod(V(0, 0.74, -2.3), V(0, 2.46, -2.3), 0.016));         // the post the unit turns on
      mesh('rudderSkin', off(merge(skin), p), p); mesh('rudderFrame', off(merge(frame), p), p);
      const fixed = []; for (const s of [-1, 1]) {
        fixed.push(rod(V(s * 0.55, loBot(0.98), WING.z(0.98)), V(s * 0.3, 0.76, -2.2), 0.02), rod(V(s * 0.55, upBot(0.98), WING.z(0.98)), V(s * 0.3, 2.44, -2.2), 0.02));
        fixed.push(rod(V(s * 0.55, loBot(0.98), WING.z(0.98)), V(s * 0.3, 2.44, -2.2), 0.012));
      }
      for (const y of [0.76, 2.44]) fixed.push(box(0.64, 0.025, 0.025, 0, y, -2.2), box(0.03, 0.025, 0.09, 0, y, -2.25));
      mesh('rudderOutriggers', merge(fixed), g); }

    // engine: an inline four lying on its side, crankshaft fore-and-aft (parallel to the propeller shafts, so the chains can
    // drive them): flywheel at the front, chain sprockets at the back, cylinders pointing outboard in a water jacket.
    { const g = part('engine', [-2.2, 0.9, 0.6]), list = [], XC = -0.62, YC = 1.15, CZ = [0.13, 0.01, -0.11, -0.23];
      list.push(box(0.22, 0.2, 0.62, XC, YC, -0.05), box(0.22, 0.15, 0.5, -0.9, YC, -0.05));
      for (const z of CZ) list.push(cyl(0.052, 0.34, -0.89, YC, z, 0, 0, Math.PI / 2), box(0.04, 0.09, 0.09, -1.08, YC, z),
        cyl(0.008, 0.05, -1.125, YC + 0.02, z, 0, 0, Math.PI / 2, 8), cyl(0.012, 0.06, -0.95, YC + 0.1, z), cyl(0.013, 0.03, XC, YC + 0.115, z, 0, 0, 0, 8));
      list.push(box(0.03, 0.03, 0.5, -0.84, YC + 0.095, -0.05), box(0.08, 0.06, 0.08, XC, YC + 0.13, 0.2), box(0.1, 0.09, 0.08, -0.45, YC - 0.05, -0.3));
      for (const x of [-0.6, -0.98]) list.push(box(0.04, 0.1, 0.62, x, 0.985, -0.05));
      list.push(cyl(0.02, 0.96, XC, YC, -0.12, Math.PI / 2, 0, 0), cyl(0.045, 0.015, XC, YC, -0.53, Math.PI / 2, 0, 0, 20), cyl(0.045, 0.015, XC, YC, -0.57, Math.PI / 2, 0, 0, 20));   // small sprockets: about 1 : 3 to the props
      mesh('engineBlock', merge(list), g);
      const wires = []; CZ.forEach(z => wires.push(-1.13, YC + 0.03, z, -0.45, YC - 0.01, -0.3)); g.add(fat(wires, lineMat));   // ignition leads to the magneto
      const fw = pivot(g, XC, YC, 0.34); piv.flywheel = fw;
      mesh('flywheel', merge([cyl(0.2, 0.05, 0, 0, 0, Math.PI / 2, 0, 0, 24), cyl(0.05, 0.08, 0, 0, 0, Math.PI / 2, 0, 0)]), fw);
      geo.engine = { XC, YC, CZ, head: -1.06, crank: [-0.6, 0.36], flywheelZ: 0.34 }; }

    // radiator on a centre strut; the hoses arch over the flywheel to the front of the water jacket
    { const g = part('radiator', [-1.4, 1.2, 2.0]), lo = [V(-0.5, 1.24, 0.6), V(-0.5, 1.5, 0.45), V(-0.98, 1.24, 0.2)], hi = [V(-0.5, 1.86, 0.64), V(-0.6, 1.6, 0.45), V(-1.0, 1.24, 0.16)];
      mesh('radiator', merge([box(0.04, 0.6, 0.26, -0.5, 1.55, 0.62), box(0.06, 0.03, 0.28, -0.5, 1.865, 0.62), box(0.06, 0.03, 0.28, -0.5, 1.235, 0.62),
        rod(lo[0], lo[1], 0.015), rod(lo[1], lo[2], 0.015), rod(hi[0], hi[1], 0.015), rod(hi[1], hi[2], 0.015),
        new THREE.SphereGeometry(0.016, 8, 6).translate(lo[1].x, lo[1].y, lo[1].z), new THREE.SphereGeometry(0.016, 8, 6).translate(hi[1].x, hi[1].y, hi[1].z)]), g);
      const t = []; for (let z = 0.52; z <= 0.73; z += 0.035) t.push(-0.478, 1.27, z, -0.478, 1.83, z); g.add(fat(t, lineMat));
      geo.hoses = { lo, hi }; }

    // fuel tank hung under the upper wing, with its strap and the fuel line down to the mixing chamber
    { const g = part('tank', [-2.4, 1.5, -0.9]), line = [V(-0.62, 2.33, -0.2), V(-0.62, 1.31, 0.2)];
      mesh('tank', merge([cyl(0.075, 0.3, -0.62, 2.48, -0.2), cyl(0.02, 0.03, -0.62, 2.645, -0.2, 0, 0, 0, 10), box(0.012, 0.09, 0.16, -0.62, 2.665, -0.2), rod(line[0], line[1], 0.008)]), g);
      geo.fuel = line; }

    // chain drive: a pair of guide tubes (the two runs of each chain) from each engine sprocket straight back to its propeller
    // sprocket; the left pair crosses over (the figure-eight chain). Prop sprockets, shafts, braces to the rear uprights.
    { const g = part('chains', [0, 1.2, -1.6]), list = []; geo.chain = {};
      for (const s of [-1, 1]) {
        const E = V(-0.62, 1.15, s > 0 ? -0.53 : -0.57), P = V(s * 1.55, 1.72, -1.06), cross = s > 0, re = 0.042, rp = 0.12;
        for (const d of [1, -1]) list.push(rod(E.clone().add(V(0, re * d, 0)), P.clone().add(V(0, rp * d * (cross ? -1 : 1), 0)), 0.02));
        list.push(cyl(0.13, 0.02, P.x, P.y, P.z, Math.PI / 2, 0, 0, 20), rod(V(P.x, P.y, -1.0), V(P.x, P.y, -1.22), 0.025));
        list.push(rod(V(P.x, P.y, -1.02), V(s * 1.95, loTop(U_R), zR), 0.016), rod(V(P.x, P.y, -1.02), V(s * 1.95, upBot(U_R), zR), 0.016));
        geo.chain[s > 0 ? 'L' : 'R'] = { E, P, re, rp, cross };
      }
      mesh('chainTubes', merge(list), g); }

    // propellers: two twisted spruce blades each, counter-rotating
    for (const s of [1, -1]) {
      const key = s > 0 ? 'propL' : 'propR', g = part(key, [s * 2.6, 1.2, -2.4]), p = pivot(g, s * 1.55, 1.72, -1.25);
      piv[key] = p; mesh(key + 'Blades', propeller(s), p);
    }

    // hip cradle on its slide rails (it slides on a pivot, so the controls demo can move it), the elevator lever, the
    // pulleys on the rear spar, and the warping and rudder cables
    { const g = part('cradle', [1.6, 0.9, -0.9]), slide = pivot(g, 0, 0, 0); piv.cradle = slide;
      mesh('cradle', merge([box(0.36, 0.03, 0.42, 0.45, 0.945, -0.25), box(0.03, 0.08, 0.42, 0.27, 0.97, -0.25), box(0.03, 0.08, 0.42, 0.63, 0.97, -0.25),
        rod(V(0.78, 0.93, 0.45), V(0.78, 1.25, 0.42), 0.012), cyl(0.025, 0.05, 0.78, 1.27, 0.42)]), slide);
      const fixed = [box(0.75, 0.02, 0.03, 0.45, 0.92, -0.05), box(0.75, 0.02, 0.03, 0.45, 0.92, -0.45)];
      for (const s of [-1, 1]) fixed.push(cyl(0.03, 0.012, s * 0.62, 0.89, zR, 0, 0, Math.PI / 2, 14));
      mesh('cradleRails', merge(fixed), g);
      const c = []; geo.cables = [];
      for (const s of [-1, 1]) { const x0 = s > 0 ? 0.63 : 0.27, path = [V(x0, 0.97, -0.3), V(s * 0.62, 0.9, zR), V(s * 6.0, loTop(U_R) + 0.01, zR), V(s * 6.0, upBot(U_R) - 0.01, zR - 0.02)];
        const rud = [V(0.45, 0.95, -0.46), V(s * 0.3, 0.8, -2.2)];
        c.push(...lines(path), ...lines(rud)); geo.cables.push({ s, path, rudder: rud }); }
      const cl = fat(c, lineMat); g.add(cl); piv.cables = cl; }

    // Orville, prone in the cradle, left hand on the elevator lever; head kept clear of the front strut
    { const g = part('pilot', [1.9, 1.3, 1.6]), X = 0.45;
      mesh('Orville', merge([limb(V(X, 1.115, -0.33), V(X, 1.115, 0.47), 0.15), new THREE.SphereGeometry(0.105, 16, 12).translate(X, 1.2, 0.58),
        cyl(0.11, 0.04, X, 1.29, 0.58), box(0.2, 0.012, 0.1, X, 1.275, 0.66), new THREE.TorusGeometry(0.152, 0.012, 6, 24).translate(X, 1.115, -0.12),
        limb(V(X + 0.09, 1.06, -0.24), V(X + 0.09, 1.04, -1.12), 0.065), limb(V(X - 0.09, 1.06, -0.24), V(X - 0.09, 1.04, -1.12), 0.065),
        box(0.09, 0.06, 0.12, X + 0.09, 1.03, -1.17), box(0.09, 0.06, 0.12, X - 0.09, 1.03, -1.17),
        limb(V(X + 0.14, 1.13, 0.36), V(0.77, 1.22, 0.42), 0.045), limb(V(X - 0.14, 1.13, 0.36), V(X - 0.16, 1.03, 0.62), 0.045)]), g);
      piv.head = V(X, 1.36, 0.6); }

    // anemometer clamped to the front left centre strut; its vane turns in the airflow
    { const g = part('anemometer', [1.2, 2.0, 2.6]), x = 0.55, y = 1.95, z = zF + 0.08;
      mesh('anemometer', merge([cyl(0.03, 0.09, x, y, z, Math.PI / 2, 0, 0), box(0.03, 0.04, 0.06, x, y, z - 0.06)]), g);
      const v = pivot(g, x, y, z + 0.06); piv.vane = v;
      mesh('anemometerVane', merge([cyl(0.05, 0.008, 0, 0, 0, Math.PI / 2, 0, 0, 20), box(0.1, 0.012, 0.004, 0, 0, 0.006, 0, 0, 0.5), box(0.1, 0.012, 0.004, 0, 0, 0.006, 0, 0, -1.07)]), v); }

    Object.assign(geo, { Y_LO, Y_UP, CHORD, zF, zR, U_F, U_R, WING, ELEV, XS, loTop, upBot, wires: strutWires });
    return { root, clips: [] };
  }

  // a two-blade propeller: paddle-shaped blades twisted from steep at the hub to flat at the tip; s mirrors the twist
  function propeller(s) {
    const R = 1.295, N = 14, sh = new THREE.Shape(), st = [];
    for (let i = 0; i <= N; i++) { const r = 0.09 + (R - 0.09) * i / N, f = r / R;
      let c = 0.055 + 0.17 * THREE.MathUtils.smoothstep(f, 0.08, 0.75); if (f > 0.88) c *= Math.sqrt(Math.max(0, 1 - ((f - 0.88) / 0.12) ** 2)); st.push([r, c]); }
    sh.moveTo(-st[0][1] / 2, st[0][0]); st.forEach(([r, c]) => sh.lineTo(-c / 2, r)); for (let i = N; i >= 0; i--) sh.lineTo(st[i][1] / 2, st[i][0]);
    const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015), p = blade.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), r = p.getY(i), z = p.getZ(i), b = s * Math.atan(3.0 / (2 * Math.PI * Math.max(r, 0.12)));   // 3 m of pitch: a little more than the Flyer advances per turn
      p.setXYZ(i, x * Math.cos(b) + z * Math.sin(b), r, -x * Math.sin(b) + z * Math.cos(b));
    }
    blade.computeVertexNormals();
    const bolts = [0, 1, 2, 3].map(i => cyl(0.009, 0.19, Math.cos(i * Math.PI / 2 + 0.785) * 0.045, Math.sin(i * Math.PI / 2 + 0.785) * 0.045, 0, Math.PI / 2, 0, 0, 6));
    return merge([blade, blade.clone().rotateZ(Math.PI), cyl(0.075, 0.16, 0, 0, 0, Math.PI / 2, 0, 0, 16), ...bolts]);
  }

  return { K, build, get parts() { return parts; }, get piv() { return piv; }, get geo() { return geo; } };
})();
