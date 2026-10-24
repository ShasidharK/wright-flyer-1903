// The workshop: a photo studio for the Flyer (an infinity cove, a turntable, three softboxes) and an isolated, animated
// demo of how each component works. Demos draw in the Flyer's own frame (metres, inside its root), so they ride the
// turntable; the app decides which parts are shown, ghosted or hidden (show / context), and where the camera looks (view).
const WF_STUDIO = (() => {
  const K = WF_MODEL.K, TABLE_Y = 0.32, TABLE_R = 5.8;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
  let group = null, table = null; const boxes = [], spots = [];

  const merge = list => { const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; gs.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3); let o = 0; gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = mergeVertices(out, 1e-5); m.computeVertexNormals(); return m; };
  const rod = (a, b, r) => { const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize());
    return new THREE.CylinderGeometry(r, r, d.length(), 10).applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1))); };

  function build(root) {
    group = new THREE.Group(); group.visible = false; root.add(group);
    const floor = WF_LOOK.surface('studio', { rough: 0.85 });
    // the infinity cove: a floor that curves up into a wall all the way round, so there is no horizon
    const prof = [V(0.01, 0, 0)]; for (let r = 1; r <= 15; r++) prof.push(V(r, 0, 0));
    for (let i = 1; i <= 14; i++) { const a = -Math.PI / 2 + i / 14 * Math.PI / 2; prof.push(V(15 + 7 * Math.cos(a), 7 + 7 * Math.sin(a), 0)); }
    prof.push(V(22, 18, 0));
    group.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p.x, p.y)), 128), floor));
    const ln = [], mj = [], ring = (r, y, n = 128, out = ln) => { for (let i = 0; i < n; i++) { const a = i / n * TAU, b = (i + 1) / n * TAU; out.push(Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(b) * r, y, Math.sin(b) * r); } };
    for (let r = 2; r <= 14; r += 2) ring(r, 0.006, 128, r % 4 ? ln : mj);
    ring(15, 0.006, 160, mj); ring(22, 7, 180, mj);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; ln.push(Math.cos(a) * 6.5, 0.006, Math.sin(a) * 6.5, Math.cos(a) * 15, 0.006, Math.sin(a) * 15); }
    group.add(fat(ln, lineMat)); group.add(fat(mj, majorMat));
    // the turntable, with degree marks; it turns with the Flyer
    table = new THREE.Group(); group.add(table);
    WF_WORLD.solid(new THREE.CylinderGeometry(TABLE_R, TABLE_R + 0.2, TABLE_Y, 96).translate(0, TABLE_Y / 2, 0), 'turntable', table, WF_LOOK.surface('metal', { rough: 0.55, metal: 0.35 }));
    const tk = []; for (let i = 0; i < 72; i++) { const a = i / 72 * TAU, r0 = TABLE_R - (i % 9 ? 0.25 : 0.55); tk.push(Math.cos(a) * r0, TABLE_Y + 0.006, Math.sin(a) * r0, Math.cos(a) * (TABLE_R - 0.06), TABLE_Y + 0.006, Math.sin(a) * (TABLE_R - 0.06)); }
    ring(TABLE_R - 0.6, TABLE_Y + 0.006, 128, tk); table.add(fat(tk, majorMat));
    // three softboxes on stands, aimed at the Flyer; their faces light up and each carries a real spotlight
    const metal = WF_LOOK.surface('metal', { rough: 0.5, metal: 0.4 });
    for (const a of [0.75, 2.75, 4.75]) {
      const st = new THREE.Group(), x = Math.cos(a) * 11.5, z = Math.sin(a) * 11.5; st.position.set(x, 0, z); st.rotation.y = Math.atan2(-x, -z); group.add(st);
      const parts = [rod(V(0, 0, 0), V(0, 5.2, 0), 0.06)];
      for (let i = 0; i < 3; i++) { const b = i / 3 * TAU; parts.push(rod(V(0, 1.3, 0), V(Math.cos(b) * 1.1, 0, Math.sin(b) * 1.1), 0.04)); }
      parts.push(rod(V(0, 5.2, 0), V(0, 5.5, 0.4), 0.05));
      WF_WORLD.solid(merge(parts), 'stand', st, metal);
      const head = new THREE.Group(); head.position.set(0, 5.7, 0.55); head.rotation.x = 0.42; st.add(head);
      WF_WORLD.solid(merge([new THREE.BoxGeometry(2.4, 1.7, 0.6)]), 'softbox', head, metal);
      const m = glowMat(0x2a2d33); m.side = THREE.DoubleSide; const face = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.5), m); face.position.z = 0.305; head.add(face); boxes.push(m);
      const sp = new THREE.SpotLight(0xfff1dc, 0, 32, 0.55, 0.7, 1.2); sp.position.set(0, 0, 0.4); head.add(sp);
      const tg = new THREE.Object3D(); group.add(tg); tg.position.set(0, 1.4, 0); sp.target = tg; spots.push(sp);
      stands.push({ g: st, p: V(x, 5, z) });
    }
  }
  const stands = [], sv = new THREE.Vector3(), sd = new THREE.Vector3();
  function tick(now, lights) {
    const dark = theme === 'dark', c = camera.position;
    // a stand that comes between the camera and what it looks at steps out of the picture
    sd.subVectors(controls.target, c); const len2 = Math.max(1e-6, sd.lengthSq());
    for (const s of stands) { sv.subVectors(s.p, c); const k = sv.dot(sd) / len2; s.g.visible = !(k > -0.15 && k < 0.8 && sv.addScaledVector(sd, -k).length() < 3.2); }
    boxes.forEach(m => { m.emissiveIntensity = lights ? 0.9 : 0.05; });
    spots.forEach(s => { s.intensity = lights && dark ? 34 : 0; });
  }

  // ══ mechanism demos ══
  // D: { key, o (overlay group in the Flyer's frame, metres), v (control values), t, step, lift (raise the Flyer, metres),
  //      skin (see through the skins of the shown parts), ghostSelf (regexp of the shown part's meshes to see through) }
  const P = () => WF_MODEL.piv, GEO = () => WF_MODEL.geo, FX = WF_FX;
  const part = k => WF_MODEL.parts.find(p => p.key === k);
  const pct = v => Math.round(v * 100) + '%', mph = v => Math.round(v) + ' mph';
  const dotMat = () => { const m = glowMat(0x2a2d33); m.emissiveIntensity = 0.9; accentFill({ traverse: f => f({ material: m }) }); return m; };
  const dots = (D, n, r = 0.03, mat = dotMat()) => { const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 8, 6), mat, n); m.frustumCulled = false; D.o.add(m); return m; };
  const dummy = new THREE.Object3D(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3();
  // a closed polyline with arc-length lookup
  function path(points, closed = true) {
    const pts = points.map(p => p.clone()), cum = [0];
    for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) cum.push(cum[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
    const L = cum[cum.length - 1];
    return { pts, L, at(s, out, dir) { s = closed ? ((s % L) + L) % L : THREE.MathUtils.clamp(s, 0, L);
      let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
      const a = pts[(i - 1) % pts.length], b = pts[i % pts.length], k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      out.lerpVectors(a, b, k); if (dir) dir.subVectors(b, a).normalize(); return out; } };
  }
  const arc = (c, r, a0, a1, n, z) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push(V(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, z ?? c.z)); } return o; };
  const label = (D, html, fn, opts) => { const L = FX.label(html, opts).at(fn); D.labels.push(L); return L; };
  const wpos = (D, local) => out => D.o.localToWorld(out.copy(local));

  const DEMOS = {
    wings: {
      show: k => [k], context: () => ['upperWing', 'lowerWing', 'struts'], view: { dir: [-0.75, 0.55, 0.85], fit: k => [k], pad: 1.6, include: k => [[-7.4, k === 'upperWing' ? 2.7 : 0.8, 0]] },
      controls: [{ id: 'warp', label: 'Warping', min: 0, max: 1, step: 0.01, value: 0.8, fmt: pct }, { id: 'mph', label: 'Airspeed', min: 10, max: 45, step: 1, value: 30, fmt: mph }, { id: 'xray', label: 'See inside', toggle: true, value: false }],
      enter(D) {
        const g = GEO(), y = D.key === 'upperWing' ? g.Y_UP : g.Y_LO, W = g.WING; D.y = y;
        D.aL = FX.arrow('lift', D.o, { head: 0.3 }); D.aR = FX.arrow('lift', D.o, { head: 0.3 }); D.aM = FX.arrow('lift', D.o, { head: 0.3 });
        D.lL = label(D, '', wpos(D, V(5.0, y + 0.25, 0.2)), { role: 'lift' }); D.lR = label(D, '', wpos(D, V(-5.0, y + 0.25, 0.2)), { role: 'lift' });
        // a cross-section beside the right tip, with smoke lines bending round it (an illustration: the turning is exaggerated)
        const X = -7.2, sec = [];
        for (let i = 0; i <= 24; i++) { const u = (1 - Math.cos(Math.PI * i / 24)) / 2; sec.push(V(X, y + W.yc(u) + W.th(u), W.z(u))); }
        for (let i = 23; i >= 1; i--) { const u = (1 - Math.cos(Math.PI * i / 24)) / 2; sec.push(V(X, y + W.yc(u) - W.th(u), W.z(u))); }
        const sl = []; for (let i = 0; i < sec.length; i++) { const a = sec[i], b = sec[(i + 1) % sec.length]; sl.push(a.x, a.y, a.z, b.x, b.y, b.z); }
        const secLine = fat(sl, accentLineMat); D.o.add(secLine);
        const z0 = W.z(0.25), y0 = y + W.yc(0.25), k = 0.42, field = (z, yy, out) => { const dz = z - z0, dy = yy - y0, r2 = dz * dz + dy * dy + 0.09;
          return out.set(0, k * dz / r2, -1 - k * dy / r2); };
        D.lines = []; const smoke = [];
        for (const dy of [-1.2, -0.75, -0.4, -0.18, 0.22, 0.45, 0.8, 1.25]) {
          const pts = []; const p = V(X, y0 + dy, 2.6), v = V(0, 0, 0);
          for (let i = 0; i < 260 && p.z > -2.8; i++) { pts.push(p.clone()); field(p.z, p.y, v); p.addScaledVector(v, 0.022); }
          D.lines.push(pts); for (let i = 0; i < pts.length - 1; i++) smoke.push(pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }
        D.o.add(fat(smoke, majorMat));
        D.dots = dots(D, D.lines.length * 4, 0.035);
        label(D, 'section', wpos(D, V(X, y + 0.45, -0.2)), { cls: 'dim' });
      },
      tick(D, dt) {
        const pv = P(), w = D.v.warp * 0.12 * Math.sin(D.t * 1.3), q = (D.v.mph / 30) ** 2;
        pv.warp.loL.rotation.x = pv.warp.upL.rotation.x = -w; pv.warp.loR.rotation.x = pv.warp.upR.rotation.x = w;
        const y = D.y + 0.12, base = 1.0 * q, k = w / 0.12;
        D.aL.set(V(5.0, y, 0.2), V(0, base * (1 + 0.55 * k), 0), 0.3); D.aR.set(V(-5.0, y, 0.2), V(0, base * (1 - 0.55 * k), 0), 0.3); D.aM.set(V(0, y + 0.05, 0.2), V(0, base * 1.2, 0), 0.3);
        D.lL.set(k > 0.15 ? 'more lift' : k < -0.15 ? 'less lift' : 'lift'); D.lR.set(k < -0.15 ? 'more lift' : k > 0.15 ? 'less lift' : 'lift');
        D.skin = D.v.xray;
        const n = D.lines.length; D.phase = (D.phase || 0) + dt * (D.v.mph / 30) * 30;
        for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) { const L = D.lines[i], idx = Math.floor((D.phase + j * L.length / 4) % L.length);
          dummy.position.copy(L[idx]); dummy.updateMatrix(); D.dots.setMatrixAt(i * 4 + j, dummy.matrix); }
        D.dots.instanceMatrix.needsUpdate = true;
      },
      readout(D) { const w = D.v.warp * Math.sin(D.t * 1.3); return `Lift ∝ V²: at ${D.v.mph} mph the wings carry <b>${Math.round(750 * (D.v.mph / 30) ** 2)} lbf</b> at this angle · warping ${w > 0.15 ? 'rolls right' : w < -0.15 ? 'rolls left' : 'neutral'}`; },
      exit() { const pv = P(); for (const k of ['loL', 'loR', 'upL', 'upR']) pv.warp[k].rotation.x = 0; },
    },

    struts: {
      show: () => ['struts'], context: () => ['upperWing', 'lowerWing'], forceContext: true, view: { dir: [0.35, 0.3, 1], fit: () => ['struts', 'upperWing'], pad: 1.35 },
      controls: [{ id: 'load', label: 'Load', min: 0, max: 2.5, step: 0.05, value: 1, fmt: v => v.toFixed(1) + ' g' }, { id: 'pulse', label: 'Gusts', toggle: true, value: true }],
      enter(D) {
        const g = GEO();
        D.tens = FX.lineMaterial('tension', 2.4, { opacity: 0.9 }); const wl = new LineSegments2(new LineSegmentsGeometry().setPositions(g.wires), D.tens); wl.renderOrder = 26; D.o.add(wl);
        D.comp = FX.lineMaterial('thrust', 2.6, { opacity: 0.9 }); const cs = [];
        for (const x of [...g.XS.map(x => -x), ...g.XS]) for (const [u, z] of [[g.U_F, g.zF], [g.U_R, g.zR]]) cs.push(x, g.loTop(u), z, x, g.upBot(u), z);
        const cl = new LineSegments2(new LineSegmentsGeometry().setPositions(cs), D.comp); cl.renderOrder = 26; D.o.add(cl);
        D.up = [-5.4, -4.05, -2.65, -1.25, 1.25, 2.65, 4.05, 5.4].map(() => FX.arrow('lift', D.o, { head: 0.18 }));
        D.wt = FX.arrow('weight', D.o, { head: 0.3 });
        label(D, 'wires: tension', wpos(D, V(-3.35 + 0.7, 1.75, g.zF)), { role: 'tension' }); label(D, 'uprights: compression', wpos(D, V(1.95, 1.7, g.zF + 0.1)), { role: 'thrust' });
      },
      tick(D) {
        const g = GEO(), load = D.v.load * (D.v.pulse ? 0.82 + 0.18 * Math.sin(D.t * 2.3) + 0.06 * Math.sin(D.t * 5.1) : 1);
        D.tens.opacity = Math.min(1, 0.15 + load * 0.55); D.tens.linewidth = 1.4 + load * 1.4; D.comp.opacity = Math.min(1, 0.15 + load * 0.5);
        const xs = [-5.4, -4.05, -2.65, -1.25, 1.25, 2.65, 4.05, 5.4];
        D.up.forEach((a, i) => a.set(V(xs[i], g.Y_UP + 0.14, 0.15), V(0, 0.45 * load, 0), 0.18));
        D.wt.set(V(0, 1.0, 0), V(0, -1.1, 0), 0.3); D.load = load;
      },
      readout(D) { return `Load ${D.load.toFixed(2)} g: the wings lift <b>${Math.round(750 * D.load)} lbf</b>; the wires take it in tension and the uprights in compression.`; },
    },

    elevator: {
      show: () => ['elevator'], context: () => ['skids', 'lowerWing', 'upperWing'], view: { dir: [1, 0.45, 0.75], fit: () => ['elevator'], pad: 1.6 },
      controls: [{ id: 'anim', label: 'Animate', toggle: true, value: true }, { id: 'lever', label: 'Lever', min: -1, max: 1, step: 0.01, value: 0.5, fmt: v => (v > 0 ? 'back ' : v < 0 ? 'forward ' : '') + Math.abs(Math.round(v * 100)) + '%' }],
      enter(D) { D.a = FX.arrow('lift', D.o, { head: 0.2 }); D.l = label(D, '', wpos(D, V(0, 2.5, 3.1)), { role: 'lift' }); },
      tick(D) {
        const d = (D.v.anim ? Math.sin(D.t * 1.1) : D.v.lever) * 0.25; P().elevator.rotation.x = -d;
        D.a.set(V(0, 1.75, 3.05), V(0, 0.35 + 2.2 * d, 0), 0.2); D.d = d;
        D.l.set(d > 0.03 ? 'more lift · nose up' : d < -0.03 ? 'less lift · nose down' : 'level');
      },
      readout(D) { return `Elevator ${D.d > 0 ? 'up' : 'down'} ${Math.abs(Math.round(D.d * 57.3))}°`; },
      exit() { P().elevator.rotation.x = 0; },
    },

    rudder: {
      show: () => ['rudder'], context: () => ['upperWing', 'lowerWing'], view: { dir: [0.85, 0.5, -0.9], fit: () => ['rudder'], pad: 1.7 },
      controls: [{ id: 'anim', label: 'Animate', toggle: true, value: true }, { id: 'turn', label: 'Rudder', min: -1, max: 1, step: 0.01, value: 0.6, fmt: v => (v > 0 ? 'right ' : v < 0 ? 'left ' : '') + Math.abs(Math.round(v * 100)) + '%' }],
      enter(D) {
        D.side = FX.arrow('motion', D.o, { head: 0.2 }); D.wind = [1.2, 1.6, 2.0].map(() => FX.arrow('wind', D.o, { head: 0.14 }));
        D.l = label(D, '', wpos(D, V(0, 2.75, -2.6)), { role: 'motion' }); label(D, 'relative wind', wpos(D, V(0.9, 2.1, -1.7)), { role: 'wind' });
      },
      tick(D) {
        const d = (D.v.anim ? Math.sin(D.t * 1.0) : D.v.turn) * 0.3; P().rudder.rotation.y = d; D.d = d;
        D.side.set(V(0, 1.6, -2.65), V(d * 3.2, 0, 0), 0.2);
        D.wind.forEach((a, i) => a.set(V(0.75, 1.2 + i * 0.4, -1.3), V(0, 0, -0.75), 0.14));
        D.l.set(d > 0.03 ? 'tail pushed left · nose yaws right' : d < -0.03 ? 'tail pushed right · nose yaws left' : 'straight');
      },
      readout(D) { return `Rudder ${Math.abs(Math.round(D.d * 57.3))}° ${D.d > 0 ? 'right' : 'left'}`; },
      exit() { P().rudder.rotation.y = 0; },
    },

    controls: {
      show: () => ['cradle', 'pilot', 'upperWing', 'lowerWing', 'rudder', 'elevator'], context: () => ['struts', 'skids'], view: { dir: [0.55, 0.95, -0.75], fit: () => ['upperWing', 'rudder'], pad: 1.3 },
      controls: [{ id: 'anim', label: 'Animate', toggle: true, value: true }, { id: 'hips', label: 'Hips', min: -1, max: 1, step: 0.01, value: 0.5, fmt: v => (v > 0 ? 'right ' : v < 0 ? 'left ' : '') + Math.abs(Math.round(v * 100)) + '%' }],
      enter(D) {
        P().cables.visible = false;
        D.cab = FX.poly('tension', D.o, { width: 2.2 });
        label(D, 'hips in the cradle', wpos(D, V(0.45, 1.55, -0.3)), { role: 'tension' }); label(D, 'wing warping', wpos(D, V(-6.0, 3.0, -0.4)), { role: 'tension' });
        label(D, 'rudder', wpos(D, V(0, 2.75, -2.6)), { role: 'tension' }); label(D, 'elevator lever', wpos(D, V(0.78, 1.55, 0.45)), { cls: 'dim' });
      },
      tick(D) {
        const pv = P(), s = D.v.anim ? Math.sin(D.t * 0.9) : D.v.hips, slide = -0.1 * s;
        pv.cradle.position.x = slide; part('pilot').g.position.x = slide;
        pv.warp.loL.rotation.x = pv.warp.upL.rotation.x = -0.1 * s; pv.warp.loR.rotation.x = pv.warp.upR.rotation.x = 0.1 * s;
        pv.rudder.rotation.y = 0.25 * s; pv.elevator.rotation.x = -0.12 * Math.sin(D.t * 0.55);
        const seg = []; for (const c of GEO().cables) { const p = c.path.map(v => v.clone()); p[0].x += slide; for (let i = 0; i < p.length - 1; i++) seg.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
          const r0 = c.rudder[0].clone(), r1 = c.rudder[1]; r0.x += slide; seg.push(r0.x, r0.y, r0.z, r1.x, r1.y, r1.z); }
        D.cab.set(seg); D.s = s;
      },
      readout(D) { return `Hips ${D.s > 0.05 ? 'right' : D.s < -0.05 ? 'left' : 'centred'}: warping rolls ${D.s > 0.05 ? 'right' : D.s < -0.05 ? 'left' : 'level'}, rudder ${Math.abs(Math.round(D.s * 14))}° to match`; },
      exit() { const pv = P(); pv.cables.visible = true; pv.cradle.position.x = 0; part('pilot').g.position.x = 0; for (const k of ['loL', 'loR', 'upL', 'upR']) pv.warp[k].rotation.x = 0; pv.rudder.rotation.y = 0; pv.elevator.rotation.x = 0; },
    },

    engine: {
      show: () => ['engine'], context: () => ['lowerWing', 'radiator', 'tank', 'chains'], ghostSelf: /engineBlock/, view: { dir: [-0.95, 0.65, 0.55], fit: () => ['engine'], pad: 2.0 },
      controls: [{ id: 'speed', label: 'Speed', min: 0.01, max: 0.3, step: 0.01, value: 0.06, fmt: v => Math.round(v * 100) + '% of real' }],
      enter(D) {
        const E = GEO().engine, metal = WF_LOOK.surface('metal', { rough: 0.45, metal: 0.5 }); D.hot = dotMat(); D.metal = metal; D.th = 0;
        D.cyl = E.CZ.map((z, i) => {
          const piston = WF_WORLD.solid(merge([new THREE.CylinderGeometry(0.045, 0.045, 0.07, 18).rotateZ(Math.PI / 2)]), 'piston', D.o, metal);
          const rodM = WF_WORLD.solid(merge([new THREE.BoxGeometry(0.2, 0.022, 0.022)]), 'conrod', D.o, metal);
          const pin = WF_WORLD.solid(merge([new THREE.CylinderGeometry(0.014, 0.014, 0.05, 10).rotateX(Math.PI / 2)]), 'crankpin', D.o, metal);
          const spark = glowPoints([V(-1.135, E.YC + 0.02, z)], 0.18); D.o.add(spark);
          label(D, String(i + 1), wpos(D, V(-1.16, E.YC + 0.12, z)), { cls: 'num' });
          return { z, piston, rod: rodM, pin, spark, o: i === 0 || i === 3 ? 0 : Math.PI, lag: [0, 3 * Math.PI, Math.PI, 2 * Math.PI][i], stroke: 0 };
        });
      },
      tick(D, dt) {
        const E = GEO().engine, r = 0.05, L = 0.2, slow = D.step >= 1 && D.step <= 4 ? 0.5 : 1;
        D.th += dt * 1025 / 60 * TAU * D.v.speed * slow; P().flywheel.rotation.z = D.th;
        const focus = D.step >= 1 && D.step <= 4 ? D.step - 1 : 2;   // the stroke this step is about (power by default)
        for (const c of D.cyl) {
          const ph = D.th + c.o, px = E.XC - r * Math.cos(ph), py = E.YC + r * Math.sin(ph), xp = E.XC - (r * Math.cos(ph) + Math.sqrt(L * L - (r * Math.sin(ph)) ** 2));
          c.pin.position.set(px, py, c.z); c.piston.position.set(xp - 0.01, E.YC, c.z);
          c.rod.position.set((px + xp) / 2, (py + E.YC) / 2, c.z); c.rod.rotation.z = Math.atan2(py - E.YC, px - xp);
          const psi = (((D.th - c.lag) % (4 * Math.PI)) + 4 * Math.PI) % (4 * Math.PI); c.stroke = Math.floor(psi / Math.PI);
          c.piston.material = c.stroke === focus ? D.hot : D.metal;
          c.spark.material.uniforms.intensity.value = theme === 'light' ? 0 : 1.3 * Math.exp(-(((psi - 2 * Math.PI) / 0.22) ** 2));
        }
      },
      readout(D) { const N = ['intake', 'compression', 'power', 'exhaust'];
        return `<div class="wf-strokes">${D.cyl.map((c, i) => `<span class="${c.stroke === 2 ? 'on' : ''}"><b>${i + 1}</b>${N[c.stroke]}</span>`).join('')}</div>About 1,000 rpm in life; shown at ${Math.round(D.v.speed * 100)}%.`; },
      exit() { P().flywheel.rotation.z = 0; },
    },

    chains: {
      show: () => ['chains', 'propL', 'propR'], context: () => ['engine', 'lowerWing'], ghostSelf: /chainTubes/, view: { dir: [0.05, 0.75, -1], fit: () => ['chains', 'propL', 'propR'], pad: 1.45 },
      controls: [{ id: 'speed', label: 'Speed', min: 0.01, max: 0.15, step: 0.005, value: 0.04, fmt: v => Math.round(v * 100) + '% of real' }],
      enter(D) {
        const C = GEO().chain; D.loops = []; D.s = 0; D.th = 0; const mat = dotMat();
        for (const side of ['L', 'R']) {
          const { E, P: Pc, re, rp, cross } = C[side], out = Pc.x > E.x ? 1 : -1;
          // top run to the prop sprocket, round its outer side, back along the bottom run (the crossed chain swaps sides), round
          // the outer side of the engine sprocket to the start
          const H = Math.PI / 2, a0 = cross ? -H : H, a1 = out > 0 ? (cross ? H : -H) : (cross ? -3 * H : 3 * H);
          const pts = [V(E.x, E.y + re, E.z), ...arc(Pc, rp, a0, a1, 14), V(E.x, E.y - re, E.z), ...arc(E, re, -H, out > 0 ? -3 * H : H, 8)];
          const pth = path(pts), n = Math.floor(pth.L / 0.055), mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, 0.014, 0.04), mat, n); mesh.frustumCulled = false; D.o.add(mesh);
          D.loops.push({ pth, n, mesh, cross });
        }
        D.lp = label(D, '', wpos(D, V(1.55, 3.2, -1.25)), { role: 'motion' }); D.lr = label(D, '', wpos(D, V(-1.55, 3.2, -1.25)), { role: 'motion' });
        label(D, 'crossed chain', wpos(D, V(0.5, 1.85, -0.85)), { role: 'tension' });
      },
      tick(D, dt) {
        const we = 1025 / 60 * TAU * D.v.speed, re = GEO().chain.L.re, rp = GEO().chain.L.rp;
        D.s += we * re * dt; D.th += we * dt;
        const pv = P(), thp = D.th * re / rp; pv.flywheel.rotation.z = D.th; pv.propR.rotation.z = thp; pv.propL.rotation.z = -thp;
        for (const lp of D.loops) { for (let i = 0; i < lp.n; i++) { lp.pth.at(i * lp.pth.L / lp.n + D.s, dummy.position, tv); dummy.lookAt(tv.add(dummy.position)); dummy.updateMatrix(); lp.mesh.setMatrixAt(i, dummy.matrix); } lp.mesh.instanceMatrix.needsUpdate = true; }
        D.lp.set('↺ anticlockwise'); D.lr.set('↻ clockwise');
      },
      readout(D) { const re = GEO().chain.L.re, rp = GEO().chain.L.rp; return `Sprockets ${Math.round(re * 1000)} : ${Math.round(rp * 1000)} mm, so the propellers turn at about <b>${Math.round(1025 * re / rp)} rpm</b> when the engine turns 1,025 (seen from behind).`; },
      exit() { const pv = P(); pv.flywheel.rotation.z = 0; pv.propL.rotation.z = 0; pv.propR.rotation.z = 0; },
    },

    prop: {
      show: k => [k], context: () => ['chains', 'lowerWing', 'upperWing'], view: { dir: [0.0, 0.25, -1], fit: k => [k], pad: 1.7, side: k => k === 'propL' ? 0.55 : -0.55 },
      controls: [{ id: 'rpm', label: 'Propeller speed', min: 0, max: 450, step: 5, value: 340, fmt: v => v + ' rpm' }, { id: 'mph', label: 'Airspeed', min: 0, max: 45, step: 1, value: 30, fmt: mph }, { id: 'freeze', label: 'Freeze', toggle: true, value: false }],
      enter(D) {
        const pv = P()[D.key], sgn = D.key === 'propL' ? -1 : 1; D.pv = pv; D.sgn = sgn; D.stations = [0.45, 0.85, 1.2];
        D.extra = new THREE.Group(); pv.add(D.extra);                    // rides the blade as it turns
        D.el = D.stations.map(r => {
          const s = D.key === 'propL' ? 1 : -1, b = s * Math.atan(3.0 / (2 * Math.PI * r)), cd = V(Math.cos(b), 0, -Math.sin(b)).multiplyScalar(0.16);
          const chord = fat([-cd.x, r, -cd.z, cd.x, r, cd.z], accentLineMat); chord.renderOrder = 28; D.extra.add(chord);
          return { r, b: Math.abs(b), mot: FX.arrow('motion', D.extra, { head: 0.12 }), wind: FX.arrow('wind', D.extra, { head: 0.12 }) };
        });
        D.thrust = FX.arrow('thrust', part(D.key).g, { head: 0.25 });
        const L0 = D.el[2]; label(D, 'blade speed ω·r', out => L0.mot.tipWorld(out), { role: 'motion' }); label(D, 'relative wind', out => D.extra.localToWorld(out.set(0, L0.r + 0.25, 0.45)), { role: 'wind' });
        label(D, 'thrust', out => D.thrust.tipWorld(out), { role: 'thrust' });
      },
      tick(D, dt) {
        const w = D.v.rpm / 60 * TAU, V = D.v.mph * 0.44704;
        if (!D.v.freeze) D.pv.rotation.z += D.sgn * w * 0.05 * dt;
        const sc = 0.018;
        for (const e of D.el) { const wr = w * e.r;
          e.mot.set(V0.set(0, e.r, 0), V1.set(-D.sgn * wr * sc, 0, 0), 0.12);
          const wv = V2.set(D.sgn * wr * sc, 0, -V * sc); e.wind.set(V3.set(0, e.r, 0).sub(wv), wv, 0.12); }
        const P0 = D.pv.position, T = Math.max(0, (D.v.rpm / 340) ** 2 * (1 - D.v.mph / 60));
        D.thrust.set(V0.set(P0.x, P0.y, P0.z + 0.2), V1.set(0, 0, 1.4 * T), 0.25);
      },
      readout(D) { const w = D.v.rpm / 60 * TAU, V = D.v.mph * 0.44704, n = D.v.rpm / 60;
        const rows = D.el.map(e => { const phi = Math.atan2(V, w * e.r) * 57.3, b = e.b * 57.3; return `<tr><td>${e.r.toFixed(2)} m</td><td>${b.toFixed(0)}°</td><td>${phi.toFixed(0)}°</td><td>${(b - phi).toFixed(0)}°</td></tr>`; }).join('');
        return `<table class="wf-specs wf-mini"><tr><td>radius</td><td>blade</td><td>wind</td><td>attack</td></tr>${rows}</table>Advance ratio J = V/nD = ${n > 0 ? (V / (n * 2.59)).toFixed(2) : '–'}`; },
      exit(D) { D.pv.remove(D.extra); D.pv.rotation.z = 0; part(D.key).g.remove(D.thrust.g); },
    },

    cooling: {
      show: () => ['radiator'], context: () => ['engine', 'lowerWing', 'upperWing'], view: { dir: [-0.85, 0.45, 0.85], fit: () => ['radiator', 'engine'], pad: 1.7 },
      controls: [{ id: 'flow', label: 'Flow', min: 0.1, max: 1.5, step: 0.05, value: 0.6, fmt: v => v.toFixed(1) + '×' }],
      enter(D) {
        const { lo, hi } = GEO().hoses, E = GEO().engine;
        D.p = path([hi[2], hi[1], hi[0], V(-0.5, 1.6, 0.62), V(-0.5, 1.24, 0.6), lo[1], lo[2], V(-0.92, E.YC, -0.25), V(-1.0, 1.24, 0.0)]);
        D.n = 46; D.dm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), D.n); D.dm.frustumCulled = false; D.o.add(D.dm);
        D.hot = new THREE.Color(FX.hex('weight')); D.cold = new THREE.Color(FX.hex('thrust')); D.s = 0;
        D.air = [1.3, 1.55, 1.8].map(() => FX.arrow('wind', D.o, { head: 0.12 }));
        label(D, 'hot', wpos(D, V(-0.75, 1.75, 0.35)), { role: 'weight' }); label(D, 'cooled', wpos(D, V(-0.6, 1.12, 0.62)), { role: 'thrust' }); label(D, 'air', wpos(D, V(-0.3, 1.95, 1.05)), { role: 'wind' });
      },
      tick(D, dt) {
        D.s += dt * 0.35 * D.v.flow; const c = new THREE.Color(), L = D.p.L;
        for (let i = 0; i < D.n; i++) { const s = (i / D.n * L + D.s) % L; D.p.at(s, dummy.position); dummy.updateMatrix(); D.dm.setMatrixAt(i, dummy.matrix);
          const k = s / L, cool = THREE.MathUtils.smoothstep(k, 0.25, 0.42) - THREE.MathUtils.smoothstep(k, 0.72, 0.95); D.dm.setColorAt(i, c.copy(D.hot).lerp(D.cold, cool)); }
        D.dm.instanceMatrix.needsUpdate = true; if (D.dm.instanceColor) D.dm.instanceColor.needsUpdate = true;
        D.air.forEach((a, i) => a.set(V(-0.5, 1.3 + i * 0.25, 1.1), V(0, 0, -0.42), 0.12));
      },
      readout() { return 'Water warms in the jacket, gives up its heat in the radiator, and comes back.'; },
    },

    fuel: {
      show: () => ['tank'], context: () => ['engine', 'upperWing', 'lowerWing'], view: { dir: [-0.9, 0.35, 0.7], fit: () => ['tank', 'engine'], pad: 1.7 },
      controls: [{ id: 'flow', label: 'Fuel flow', min: 0.1, max: 1, step: 0.05, value: 0.5, fmt: pct }],
      enter(D) {
        const [a, b] = GEO().fuel, E = GEO().engine; D.a = a; D.b = b; D.n = 10; D.s = 0;
        const m = new THREE.MeshBasicMaterial({ color: FX.hex('drag') }); D.dm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 8, 6), m, D.n); D.dm.frustumCulled = false; D.o.add(D.dm);
        D.g = FX.arrow('weight', D.o, { head: 0.14 }); D.vap = glowPoints([V(E.XC, E.YC + 0.13, 0.2)], 0.22); D.o.add(D.vap);
        label(D, 'gravity', wpos(D, V(-0.95, 2.1, -0.2)), { role: 'weight' }); label(D, 'mixing chamber', wpos(D, V(E.XC, E.YC + 0.32, 0.25)), { cls: 'dim' });
      },
      tick(D, dt) {
        D.s += dt * D.v.flow * 0.6;
        for (let i = 0; i < D.n; i++) { const k = (i / D.n + D.s) % 1; dummy.position.lerpVectors(D.a, D.b, k * k); dummy.scale.setScalar(0.6 + 0.6 * Math.sin(k * Math.PI)); dummy.updateMatrix(); D.dm.setMatrixAt(i, dummy.matrix); }
        D.dm.instanceMatrix.needsUpdate = true; dummy.scale.setScalar(1);
        D.g.set(V(-0.82, 2.5, -0.2), V(0, -0.55, 0), 0.14);
        D.vap.material.uniforms.intensity.value = theme === 'light' ? 0 : 0.5 + 0.4 * Math.sin(D.t * 6);
      },
      readout() { return 'No pump and no carburettor: gravity feeds the fuel and the engine\'s heat vaporises it.'; },
    },

    skids: {
      show: () => ['skids'], context: () => ['lowerWing', 'upperWing', 'struts', 'elevator'], view: { dir: [1, 0.35, 0.5], fit: () => ['skids'], pad: 1.4 },
      controls: [{ id: 'speed', label: 'Speed', min: 0.2, max: 2, step: 0.05, value: 1, fmt: v => v.toFixed(1) + '×' }],
      enter(D) {
        const wood = WF_LOOK.surface('wood'), ties = [];
        WF_WORLD.solid(merge([new THREE.BoxGeometry(0.09, 0.09, 9).translate(0, -0.205, 0), new THREE.BoxGeometry(0.04, 0.012, 9).translate(0, -0.154, 0)]), 'rail', D.o, wood);
        D.ties = new THREE.Group(); D.o.add(D.ties);
        for (let z = -4.4; z <= 4.4; z += 0.8) ties.push(new THREE.BoxGeometry(0.7, 0.04, 0.12).translate(0, -0.27, z));
        WF_WORLD.solid(merge(ties), 'ties', D.ties, wood);
        D.truck = new THREE.Group(); D.o.add(D.truck);
        WF_WORLD.solid(merge([new THREE.BoxGeometry(1.8, 0.05, 0.3).translate(0, -0.015, 0), new THREE.BoxGeometry(0.1, 0.06, 0.4).translate(0, -0.07, 0)]), 'truck', D.truck, wood);
        D.wheels = [-0.12, 0.12].map(z => { const w = new THREE.Group(); w.position.set(0, -0.1, z); D.truck.add(w);
          WF_WORLD.solid(merge([new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16).rotateZ(Math.PI / 2), new THREE.BoxGeometry(0.035, 0.1, 0.01)]), 'wheel', w, WF_LOOK.surface('metal')); return w; });
        D.lab = label(D, '', wpos(D, V(0, 0.9, 2.2)), { cls: 'dim' });
      },
      tick(D, dt) {
        // the rail runs past under the truck (as if the Flyer were rolling forward), then the Flyer lifts off the truck
        const T = 7, ph = (D.t * D.v.speed % T) / T, roll = ph < 0.8 ? ph / 0.8 : 1, v = ph < 0.8 ? 1.6 * roll : 0.4;
        D.off = ((D.off || 0) - v * dt * D.v.speed) % 0.8; D.ties.position.z = D.off;
        D.wheels.forEach(w => { w.rotation.x -= v * dt * D.v.speed / 0.06; });
        D.lift = 0.25 + (ph > 0.6 ? Math.min(1, (ph - 0.6) / 0.25) ** 2 * 0.6 : 0);
        D.truck.position.z = ph > 0.75 ? -(ph - 0.75) * 6 : 0;
        D.lab.set(ph < 0.6 ? 'rolling on the truck' : ph < 0.85 ? 'lifting off' : 'flying; the truck stays on the rail');
      },
      readout() { return 'The truck is a plank on two small wheels; the rail is 60 ft of 2×4s capped with metal.'; },
    },

    anemometer: {
      show: () => ['anemometer'], context: () => ['struts', 'upperWing', 'lowerWing'], view: { dir: [0.75, 0.3, 0.9], fit: () => ['anemometer'], pad: 2.6 },
      controls: [{ id: 'mph', label: 'Airspeed', min: 0, max: 45, step: 1, value: 30, fmt: mph }],
      enter(D) { D.dist = 0; D.time = 0; const g = GEO(); D.air = [-0.12, 0, 0.12].map(() => FX.arrow('wind', D.o, { head: 0.04 })); label(D, 'vane', wpos(D, V(0.55, 2.08, g.zF + 0.18)), { role: 'wind' }); },
      tick(D, dt) {
        const g = GEO(), ms = D.v.mph * 0.44704; P().vane.rotation.z += ms * dt * 1.6;
        D.dist += ms * dt; D.time += dt; if (D.time > 30) { D.time = 0; D.dist = 0; }
        D.air.forEach((a, i) => a.set(V0.set(0.55, 1.95 + (i - 1) * 0.12, g.zF + 0.32), V1.set(0, 0, -0.14), 0.04));
      },
      readout(D) { return `Air distance <b>${Math.round(D.dist * 3.28)} ft</b> in ${D.time.toFixed(1)} s → ${D.time > 0.5 ? Math.round(D.dist / D.time * 2.237) : '–'} mph`; },
      exit() { P().vane.rotation.z = 0; },
    },
  };
  const V0 = new THREE.Vector3(), V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3();

  return { build, tick, DEMOS, TABLE_Y, TABLE_R, get group() { return group; }, get table() { return table; } };
})();
