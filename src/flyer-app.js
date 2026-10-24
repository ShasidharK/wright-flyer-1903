// The Wright Flyer page, in three modes, each with its own place and purpose:
// · Workshop: the Flyer on a turntable in a studio, to learn its components: exploded view, see-through, the inspector,
//   and an isolated, animated demo of how each component works.
// · Wind tunnel: the Flyer on a balance in a tunnel, to learn the physics of flight in guided lessons, with the forces,
//   the smoke and the lift curve live.
// · Kitty Hawk: the 1903 field, to fly it with the physics model (and walk around it).
// The Flyer drives itself (cfg.selfDrive): the forked controller keeps the tab, lights and readout; after() runs the mode.
const WF_APP = (() => {
  const K = WF_MODEL.K, W = WF_WORLD, STU = WF_STUDIO, TUN = WF_TUNNEL, PH = WF_PHYS, FX = WF_FX, LOOK = WF_LOOK, INFO = WF_INFO, ID = 'wright';
  const clamp = THREE.MathUtils.clamp, ease = t => t * t * (3 - 2 * t), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const damp = (rate, dt) => 1 - Math.exp(-rate * dt), toward = (v, to, d) => v + Math.sign(to - v) * Math.min(Math.abs(to - v), d);
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0), EDGE = W.HALF - 0.45;
  const v1 = V(), v2 = V(), v3 = V(), q1 = new THREE.Quaternion();

  // ── settings, remembered per viewer ──
  const DEF = { mode: 'workshop', model: 'arcade', wind: 12, gusts: false, units: 'imperial', size: 'm', labels: false, sound: false, tex: 1, align: true, invert: false,
    theme: null, panels: {}, intro: false, forces: true, trail: true, lesson: 0, spin: false };
  const S = (() => { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem('wright-flyer-v3') || '{}')); } catch { return { ...DEF }; } })();
  const save = () => { try { localStorage.setItem('wright-flyer-v3', JSON.stringify(S)); } catch {} };
  const fmtSpeed = u => S.units === 'metric' ? `${Math.round(u / K * 3.6)} km/h` : `${Math.round(PH.uToMph(u))} mph`;
  const fmtLen = u => S.units === 'metric' ? `${(u / K).toFixed(u / K < 10 ? 1 : 0)} m` : `${Math.round(u / K * 3.28084)} ft`;
  const fmtForce = a => S.units === 'metric' ? `${Math.round(PH.newton(a))} N` : `${Math.round(PH.lbf(a))} lbf`;
  const pct = v => Math.round(v * 100) + '%';

  // ── state ──
  let mode = null, M = null, mover = null, ST = null, ready = false, G0 = null;
  const twins = [], partInfo = {};
  let ghost = null, ghostCtx = null, selMat = null, bracket = null;
  const WS = { yaw: -0.6, explode: 0, explodeK: 0, xray: 0, sel: null, demo: null, playing: true, context: true, engine: false, view: 'threeq' };   // workshop
  const TV = { mph: 30, aoa: 4, thr: 0.6, bank: 0, warp: 0, flat: false, link: true, smoke: true };                                            // wind tunnel
  const LS = { i: S.lesson || 0, sweep: null, t: 0, playing: false, goalDone: false };
  let tunnelF = null;
  const fl = PH.create();                                                                                                                       // Kitty Hawk
  const FL = { thr: 0, pitch: 0, roll: 0, auto: false, way: null, walk: false, cam: 'follow', log: [], flights: 0, rec: null, edgeWarned: false, bumpT: 0, gustT: 0, started: false, spin: 0, trailT: 0 };
  const walker = { g: null, body: null, legs: [], arms: [], pos: V(), heading: 0, v: 0, phase: 0, goal: null };
  const held = new Set(), touch = { x: 0, y: 0, on: false };
  const cam = { yaw: 0, pitch: 0, dist: 7, lookYaw: 0, lookPitch: 0, lastDrag: -1e9, dragging: false };
  let tween = null, wayRing = null, trail = null, trailPts = [], farrows = null;
  const MOD = () => FIGS3D.find(f => f.id === ID).mod;
  const press = key => MOD().key({ key, shiftKey: false, repeat: false });
  const partOf = k => WF_MODEL.parts.find(p => p.key === k);

  // ── the walker (Kitty Hawk, on foot): Wilbur in his dark suit and cap, legs and arms on pivots ──
  function buildWalker(g0) {
    const g = new THREE.Group(); g.visible = false; g0.add(g); walker.g = g;
    const cap = (a, b, r) => { const d = b.clone().sub(a), q = new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize());
      return new THREE.CapsuleGeometry(r, Math.max(0.01, d.length() - 2 * r), 4, 10).applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, V(1, 1, 1))); };
    const merge = list => { const gs = list.map(x => x.toNonIndexed()); let n = 0; gs.forEach(x => { n += x.attributes.position.count; });
      const pos = new Float32Array(n * 3); let o = 0; gs.forEach(x => { pos.set(x.attributes.position.array, o * 3); o += x.attributes.position.count; });
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = mergeVertices(out, 1e-5); m.computeVertexNormals(); return m; };
    const suit = LOOK.surface('cloth', { scale: 1 / K }), body = new THREE.Group(); g.add(body); walker.body = body;
    W.solid(merge([cap(V(0, 0.5, 0), V(0, 0.76, 0), 0.085), new THREE.SphereGeometry(0.06, 16, 12).translate(0, 0.86, 0.005), new THREE.CylinderGeometry(0.064, 0.064, 0.025, 16).translate(0, 0.915, 0),
      new THREE.BoxGeometry(0.1, 0.006, 0.06).translate(0, 0.905, 0.06), new THREE.TorusGeometry(0.087, 0.006, 6, 20).rotateX(Math.PI / 2).translate(0, 0.56, 0)]), 'Wilbur', body, suit);
    for (const s of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(s * 0.045, 0.49, 0); body.add(hip); walker.legs.push(hip);
      W.solid(merge([cap(V(0, 0, 0), V(0, -0.45, 0), 0.034), new THREE.BoxGeometry(0.05, 0.03, 0.1).translate(0, -0.47, 0.02)]), 'leg', hip, suit);
      const sh = new THREE.Group(); sh.position.set(s * 0.1, 0.75, 0); body.add(sh); walker.arms.push(sh);
      W.solid(merge([cap(V(0, 0, 0), V(s * 0.02, -0.32, 0.01), 0.026)]), 'arm', sh, suit);
    }
  }

  // ── environments ──
  function world(g0) {
    G0 = g0; W.build(g0); STU.build(g0); TUN.build(g0); buildWalker(W.group);
    wayRing = loopL(Array.from({ length: 48 }, (_, i) => V(Math.cos(i / 48 * Math.PI * 2) * 0.6, 0, Math.sin(i / 48 * Math.PI * 2) * 0.6)), accentLineMat); wayRing.visible = false; W.group.add(wayRing);
    trail = FX.poly('motion', W.group, { width: 1.6, opacity: 0.75 });
    W.group.visible = false;
    setTimeout(buildUI, 0);
  }

  // ── once the Flyer is built: surfaces, materials, theme, the first mode ──
  const KIND = [[/Skin/, 'fabric'], [/Orville/, 'cloth'], [/engineBlock|flywheel|chainTubes|radiator|tank|anemometer/, 'metal'], [/./, 'wood']];
  function init() {
    ready = true;
    const mats = { fabric: LOOK.surface('fabric'), wood: LOOK.surface('wood'), metal: LOOK.surface('metal', { rough: 0.5, metal: 0.45 }), cloth: LOOK.surface('cloth') };
    M.root.updateMatrixWorld(true);
    WF_MODEL.parts.forEach(p => {
      const box = new THREE.Box3(), inv = p.g.matrixWorld.clone().invert();
      p.g.traverse(o => {
        if (!o.isMesh || o.isLineSegments2 || !o.name.endsWith('·iso')) return;   // (contact lines carry the part names too)
        twins.push({ m: o, part: p.key, solid: mats[KIND.find(([re]) => re.test(o.name))[1]], shell: o.children.find(c => c.userData.outline) });
        o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld)));
      });
      partInfo[p.key] = { box, centre: box.getCenter(V()), size: box.getSize(V()).length() };
    });
    ghost = bodyMat.clone(); ghost.transparent = true; ghost.depthWrite = false;
    ghostCtx = bodyMat.clone(); ghostCtx.transparent = true; ghostCtx.depthWrite = false; ghostCtx.opacity = 0.12;
    selMat = glowMat(); selMat.side = THREE.DoubleSide; selMat.emissiveIntensity = 0.55; accentFill({ traverse: f => f({ material: selMat }) });
    LOOK.onTheme(key => { ghost.color.copy(bodyMat.color); ghostCtx.color.copy(bodyMat.color); FX.setPaper(LOOK.THEMES[key].base === 'light'); S.theme = key; save(); syncThemes(); });
    LOOK.applyTheme(S.theme || (theme === 'light' ? 'paper' : 'graphite')); LOOK.setTex(S.tex);
    farrows = { L: FX.arrow('lift', G0, { head: 0.3 }), W: FX.arrow('weight', G0, { head: 0.3 }), T: FX.arrow('thrust', G0, { head: 0.25 }), D: FX.arrow('drag', G0, { head: 0.25 }), V: FX.arrow('wind', G0, { head: 0.22 }) };
    PH.reset(fl, W.START[0], W.START[1], 0, W.ground(W.START[0], W.START[1]));
    camAnim = null;                                                   // the template's opening iso snap would fight the mode's camera
    setMode(S.mode, { instant: true });
    if (!S.intro) setTimeout(showIntro, 700);
  }

  // place the Flyer: its centre of gravity at cg, turned by q; floorY is where its shadow lies
  const og = V();
  function placePlane(cg, q, floorY) {
    og.set(0, PH.CGH, 0).applyQuaternion(q); og.subVectors(cg, og);
    mover.position.set(og.x, floorY, og.z); mover.rotation.set(0, 0, 0); M.fit.parent.rotation.set(0, 0, 0);
    M.fit.position.set(0, og.y - floorY, 0); M.fit.quaternion.copy(q);
  }
  function resetPivots() {
    const pv = WF_MODEL.piv;
    for (const k of ['loL', 'loR', 'upL', 'upR']) pv.warp[k].rotation.x = 0;
    pv.rudder.rotation.y = 0; pv.elevator.rotation.x = 0; pv.cradle.position.x = 0; partOf('pilot').g.position.x = 0; pv.cables.visible = true;
  }

  // ── materials by mode: see-through, the selection, the demo's shown / context parts ──
  function refreshMats() {
    if (!ready) return;
    const D = mode === 'workshop' && WS.demo, show = D ? new Set(D.show) : null, ctx = D ? new Set(D.context) : null;
    ghost.opacity = D && (D.skin || D.ghostSelf) ? 0.18 : 1 - WS.xray * 0.96;
    WF_MODEL.parts.forEach(p => { p.g.visible = !D || show.has(p.key) || (ctx.has(p.key) && (WS.context || D.def.forceContext)); });
    twins.forEach(t => {
      let m = t.solid;
      if (D) {
        if (!show.has(t.part)) m = ghostCtx;
        else if ((D.ghostSelf && D.ghostSelf.test(t.m.name)) || (D.skin && /Skin/.test(t.m.name))) m = ghost;
      } else if (mode === 'workshop') {
        if (WS.sel && t.part === WS.sel.key) m = selMat; else if (WS.xray > 0.01) m = ghost;
      }
      t.m.material = m;
      if (t.shell) t.shell.visible = m !== ghostCtx && (m !== ghost || (D ? false : WS.xray < 0.45));
    });
    syncUI();
  }
  function makeBracket(b, parent) {
    const out = [], mn = b.min, mx = b.max, L = b.getSize(V()).multiplyScalar(0.22);
    for (const x of [mn.x, mx.x]) for (const y of [mn.y, mx.y]) for (const z of [mn.z, mx.z]) {
      const sx = x === mn.x ? 1 : -1, sy = y === mn.y ? 1 : -1, sz = z === mn.z ? 1 : -1;
      out.push(x, y, z, x + sx * L.x, y, z, x, y, z, x, y + sy * L.y, z, x, y, z, x, y, z + sz * L.z);
    }
    const l = fat(out, accentLineMat); l.renderOrder = 3; parent.add(l); return l;
  }
  function select(kind, key) {
    if (bracket) { bracket.parent && bracket.parent.remove(bracket); bracket = null; }
    WS.sel = key ? { kind, key } : null;
    if (WS.sel && mode === 'workshop') bracket = makeBracket(partInfo[key].box.clone().expandByScalar(0.05), partOf(key).g);
    refreshMats(); renderInspector(); syncParts(); if (key) peekDock('insp');
  }
  const worldBox = keys => { const b = new THREE.Box3(); keys.forEach(k => { const p = partOf(k); if (p) b.union(partInfo[k].box.clone().applyMatrix4(p.g.matrixWorld)); }); return b; };
  const findKey = o => { for (; o; o = o.parent) if (o.userData && o.userData.wf) return { kind: o.userData.place ? 'place' : 'part', key: o.userData.wf }; return null; };

  // ══ modes ══
  const MODES = { workshop: { name: 'Workshop', sub: 'Components' }, tunnel: { name: 'Wind tunnel', sub: 'Physics' }, field: { name: 'Kitty Hawk', sub: 'Fly' } };
  let fading = false;
  function setMode(m, { instant = false } = {}) {
    if (!MODES[m] || (m === mode && !instant) || fading) return;
    const go = () => { if (mode) leave(mode); mode = m; S.mode = m; save(); enter(m); syncUI(); layout(); };
    if (instant || !ui.fade) { go(); return; }
    fading = true; ui.fade.classList.add('on');
    setTimeout(() => { go(); setTimeout(() => { ui.fade.classList.remove('on'); fading = false; }, 60);
      toast(`${MODES[m].name} · ${{ workshop: 'take the Flyer apart and see how each part works', tunnel: 'the physics of flight, lesson by lesson', field: 'fly it where it first flew' }[m]}`); }, 260);
  }
  function enter(m) {
    W.group.visible = m === 'field'; STU.group.visible = m === 'workshop'; TUN.group.visible = m === 'tunnel'; TUN.setActive(m === 'tunnel');
    resetPivots(); tween = null; held.clear();
    document.documentElement.dataset.wfMode = m;
    if (camera === ortho) setOrtho(false);                            // every mode opens in perspective; Iso is a choice in the field
    controls.enabled = true; controls.autoRotate = false;
    if (m === 'workshop') { controls.minDistance = 1; controls.maxDistance = 19; persp.fov = baseFov(); persp.updateProjectionMatrix(); viewPreset(WS.view, true); }
    else if (m === 'tunnel') { controls.minDistance = 3; controls.maxDistance = 34; persp.fov = baseFov(); persp.updateProjectionMatrix(); lesson(LS.i, true); tunnelView('threeq', true); }
    else {
      controls.minDistance = 1.2; controls.maxDistance = 240; FL.cam = 'follow'; cam.yaw = cam.pitch = 0;
      if (!FL.started) { FL.started = true; PH.reset(fl, W.START[0], W.START[1], 0, W.ground(W.START[0], W.START[1])); }
      const c = fl.pos; controls.target.copy(c); camera.position.set(c.x + 2.2, c.y + 5.5, c.z - 11.5); controls.update();
    }
    refreshMats();
  }
  function leave(m) {
    if (m === 'workshop') { exitDemo(true); WS.explodeK = WS.explode = 0; WF_MODEL.parts.forEach(p => p.g.position.set(0, 0, 0)); WS.xray = 0; select(null); }
    if (m === 'field') { if (FL.walk) { FL.walk = false; walker.g.visible = false; } FL.auto = false; FL.way = null; Object.values(farrows).forEach(a => a.hide()); }
    if (m === 'tunnel') LS.playing = false;
    resetPivots();
  }

  // ══ per frame ══
  function tick(st, now, dt, m) { M = m; ST = st; mover = m.fit.parent.parent; }
  function after(st, now, dt, m, mv) {
    M = m; ST = st; mover = mv;
    try {                                                             // a fault here must not stop the page's frame loop
      if (!ready) init();
      if (mode === 'workshop') workshopTick(now, dt);
      else if (mode === 'tunnel') tunnelTick(now, dt);
      else fieldTick(now, dt);
      cameraTick(dt);
      STU.tick(now, st.lights); W.tick(now, st.lights);
      labels(); FX.tick(camera);
      if ((after.n = (after.n || 0) + 1) % 6 === 0) panelsTick();
      sound();
    } catch (e) { if (!after.failed) { after.failed = true; console.error(e); } }
  }

  // ══ Workshop ══
  function workshopTick(now, dt) {
    const D = WS.demo;
    if (S.spin && !D) WS.yaw += dt * 0.18;
    STU.table.rotation.y = WS.yaw;
    placePlane(v1.set(0, STU.TABLE_Y + PH.CGH + (D ? (D.lift || 0) * K : 0), 0), q1.setFromAxisAngle(UP, WS.yaw), STU.TABLE_Y);
    WS.explodeK = toward(WS.explodeK, WS.explode, dt * 1.1);
    if (!D) { const e = ease(WS.explodeK); WF_MODEL.parts.forEach(p => p.g.position.copy(p.ex).multiplyScalar(e)); }
    const pv = WF_MODEL.piv;
    if (WS.engine && !D) { FL.spin += dt * 9; pv.propL.rotation.z = -FL.spin; pv.propR.rotation.z = FL.spin; pv.flywheel.rotation.z = FL.spin * 2.9; }
    if (D) {
      if (WS.playing) D.t += dt;
      const skin = D.skin;
      D.def.tick(D, WS.playing ? dt : 0);
      if (D.skin !== skin) refreshMats();
      const r = document.getElementById('wf-readout'); if (r && D.def.readout && (D.rt = (D.rt || 0) + 1) % 6 === 0) setLive(r, D.def.readout(D));
    }
  }
  function viewPreset(name, instant = false) {
    const dirs = { front: [0, 0.22, 1], side: [1, 0.18, 0.02], top: [0.001, 1, 0.05], threeq: [0.8, 0.5, 0.75], rear: [0.3, 0.35, -1] };
    if (camera === ortho) setOrtho(false);
    const c = V(0, STU.TABLE_Y + 1.6 * K + WS.explode * 1.1 * K, 0), dir = V(...dirs[name]).normalize().applyAxisAngle(UP, WS.yaw);
    const [p, t] = frame(c, 3.4 + WS.explode * 1.2, dir, 0.92); camTo(p, t, instant);
  }
  // the widths (px) the open panels take from the left and right edges; panelGap: how far the middle of the space they
  // leave is left of the screen's middle (negative: right of it)
  function panelSides() {
    const vis = id => ui[id] && !ui[id].p.classList.contains('away') && !ui[id].p.classList.contains('off') && !ui[id].st.collapsed && !docked() && !document.body.classList.contains('wf-hide') ? SCR.rect(ui[id].p).width : 0;
    const side = k => Object.keys(PANELS).filter(id => PANELS[id].def[k] != null).reduce((m, id) => Math.max(m, vis(id)), 0);
    return [side('left'), side('right')];
  }
  const panelGap = () => { const [l, r] = panelSides(); return (r - l) / 2; };
  // fit a sphere (centre c, radius r) seen from direction dir into the part of the screen the panels leave free
  function frame(c, r, dir, pad = 1, fitGap = true) {
    const [pl, pr] = panelSides(), free = fitGap ? Math.max(0.45, 1 - (pl + pr) / innerWidth) : 1;   // the demos' pads already allow for their panels
    const vf = THREE.MathUtils.degToRad(persp.fov), hf = 2 * Math.atan(Math.tan(vf / 2) * persp.aspect), f = Math.min(vf, 2 * Math.atan(Math.tan(hf / 2) * free));
    const dist = THREE.MathUtils.clamp(r / Math.sin(f / 2) * pad, 1.1, mode === 'workshop' ? 19 : 60), pos = c.clone().addScaledVector(dir, dist), tgt = c.clone();
    const shift = panelGap() / innerWidth * 2 * dist * Math.tan(hf / 2);   // world units to slide the view so the subject sits mid-gap
    const rightV = V().crossVectors(dir, UP).normalize().negate();
    pos.addScaledVector(rightV, shift); tgt.addScaledVector(rightV, shift);
    return [pos, tgt];
  }
  function camTo(pos, target, instant = false, dur = 0.9) {
    if (instant) { camera.position.copy(pos); controls.target.copy(target); controls.update(); tween = null; return; }
    tween = { t: 0, dur, p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target };
  }
  // the isolated demo of one component
  function enterDemo(partKey) {
    const id = WF_DEMO_OF[partKey]; if (!id || mode !== 'workshop') return;
    exitDemo(true);
    const def = STU.DEMOS[id], how = WF_HOW[id], show = def.show(partKey);
    const D = { id, key: partKey, def, how, step: 0, t: 0, o: new THREE.Group(), labels: [], v: {}, show, context: def.context(partKey).filter(k => !show.includes(k)), lift: 0, skin: false, ghostSelf: def.ghostSelf || null };
    def.controls.forEach(c => { D.v[c.id] = c.value; });
    if (bracket) { bracket.parent && bracket.parent.remove(bracket); bracket = null; }
    WS.sel = null; WS.explode = WS.explodeK = 0; WS.xray = 0; WF_MODEL.parts.forEach(p => p.g.position.set(0, 0, 0));
    M.root.add(D.o); WS.demo = D; WS.playing = true;
    def.enter(D); def.tick(D, 0); refreshMats(); renderMech(); syncUI(); layout();   // one tick first, so readouts have values
    frameDemo(); peekDock('mech');
  }
  function frameDemo() {                                               // frame the shown parts from the demo's own direction
    const D = WS.demo; if (!D) return; const def = D.def, partKey = D.key;
    M.root.updateMatrixWorld(true);
    const box = worldBox(def.view.fit(partKey));
    if (def.view.include) def.view.include(partKey).forEach(p => box.expandByPoint(M.root.localToWorld(V(...p))));
    const c = box.getCenter(V()), r = box.getSize(V()).length() / 2;
    const dir = V(...def.view.dir); if (def.view.side) dir.x += def.view.side(partKey); dir.normalize().applyAxisAngle(UP, WS.yaw);
    const [p, t] = frame(c, r, dir, def.view.pad * 0.75, false); camTo(p, t);
  }
  function exitDemo(silent = false) {
    const D = WS.demo; if (!D) return;
    if (D.def.exit) D.def.exit(D);
    D.labels.forEach(L => L.remove()); D.o.parent && D.o.parent.remove(D.o);
    WS.demo = null; resetPivots();
    if (!silent) { refreshMats(); syncUI(); layout(); viewPreset(WS.view); }
  }
  const setStep = i => { const D = WS.demo; if (!D) return; D.step = clamp(i, 0, D.how.steps.length - 1); renderMech(); };

  // ══ Wind tunnel ══
  function lesson(i, apply = true) {
    LS.i = clamp(i, 0, WF_LESSONS.length - 1); S.lesson = LS.i; save();
    const L = WF_LESSONS[LS.i];
    if (apply) Object.assign(TV, { mph: 30, aoa: 4, thr: 0.6, bank: 0, warp: 0, flat: false, link: true }, L.set);
    LS.sweep = L.sweep ? { param: L.sweep[0], from: L.sweep[1], to: L.sweep[2], dur: L.sweep[3] } : null;
    LS.t = 0; LS.playing = !!LS.sweep; LS.goalDone = false;
    renderLessons(); syncUI();
  }
  function tunnelTick(now, dt) {
    if (LS.playing && LS.sweep) { LS.t += dt; const s = LS.sweep, k = 0.5 - 0.5 * Math.cos(Math.PI * LS.t / s.dur); TV[s.param] = s.from + (s.to - s.from) * k; }
    const { q, cg } = TUN.pose(TV); placePlane(cg, q, 0);
    tunnelF = TUN.forces(TV);
    TUN.tick(now, dt, TV, tunnelF);
    if (WF_LESSONS[LS.i].goal === 'balance') { const ok = Math.abs(tunnelF.liftUp - tunnelF.W) / tunnelF.W < 0.03 && Math.abs(TV.bank) < 1;
      if (ok && !LS.goalDone) { LS.goalDone = true; toast('Balanced! Lift equals weight: this is level flight'); } else if (!ok && LS.goalDone) LS.goalDone = false; }
  }
  let tunnelLast = 'threeq';
  function tunnelView(name, instant = false) {
    tunnelLast = name;
    const dirs = { side: [1, 0.12, 0.02], front: [0.15, 0.2, 1], top: [0.001, 1, 0.1], threeq: [0.9, 0.38, 0.6], rear: [0.5, 0.3, -1] };
    const [p, t] = frame(V(0, TUN.MOUNT - 0.2, 0), 3.6, V(...dirs[name]).normalize(), 0.95); camTo(p, t, instant);
  }

  // ══ Kitty Hawk ══
  const envF = { model: null, wind: V(), ground: (x, z) => W.ground(x, z), onRail: (x, z) => W.onRail(x, z) };
  function fieldTick(now, dt) {
    const s = fl; envF.model = PH.MODELS[S.model];
    FL.gustT += dt; const gust = S.gusts ? 1 + 0.28 * Math.sin(FL.gustT * 0.9) * Math.sin(FL.gustT * 0.37 + 1) : 1;
    envF.wind.set(0, S.gusts ? 0.25 * Math.sin(FL.gustT * 1.3) : 0, -PH.mphToU(S.wind) * gust);
    const att = PH.attitude(s); ST.heading = att.heading;
    const inp = flightInputs(dt, att), wasGround = s.ground;
    PH.step(s, inp, envF, dt);
    if (wasGround && !s.ground) { FL.flights++; FL.rec = { x: s.pos.x, z: s.pos.z, t: now }; toast(`Airborne · flight ${FL.flights}`); }
    if (s.touch) { touchdown(now, s.touch); s.touch = null; }
    for (const ax of ['x', 'z']) {                                   // the edge of the field: a soft push back in, never a wall
      const p = s.pos[ax], lim = EDGE - 6;
      if (Math.abs(p) > lim) s.vel[ax] -= Math.sign(p) * (Math.abs(p) - lim) * 2.5 * dt;
      if (Math.abs(p) > EDGE) { s.pos[ax] = Math.sign(p) * EDGE; if (s.vel[ax] * Math.sign(p) > 0) s.vel[ax] *= 0.5; }
    }
    collide(now);
    PH.origin(s, v2); placePlane(s.pos, s.q, W.ground(v2.x, v2.z));
    const pv = WF_MODEL.piv;                                          // the controls move as the pilot works them
    pv.elevator.rotation.x = -clamp(inp.pitch * 0.12, -0.12, 0.12);
    const w = clamp(inp.roll * 0.04, -0.035, 0.035); pv.warp.loL.rotation.x = pv.warp.upL.rotation.x = -w; pv.warp.loR.rotation.x = pv.warp.upR.rotation.x = w;
    pv.rudder.rotation.y = clamp(inp.roll * 0.2, -0.2, 0.2);
    FL.spin = (FL.spin + dt * (3 + inp.thr * 24)) % (Math.PI * 2); pv.propL.rotation.z = -FL.spin; pv.propR.rotation.z = FL.spin; pv.flywheel.rotation.z = FL.spin * 2.9;
    if (FL.walk) walk(dt);
    const A = farrows, sc = 0.32;                                     // the four forces, and the relative wind
    if (S.forces && !FL.walk && FL.cam !== 'pilot') {
      A.L.set(s.pos, v1.copy(s.fL).multiplyScalar(sc)); A.W.set(s.pos, v1.copy(s.fW).multiplyScalar(sc)); A.T.set(s.pos, v1.copy(s.fT).multiplyScalar(sc * 2)); A.D.set(s.pos, v1.copy(s.fD).multiplyScalar(sc * 2));
      v3.copy(s.vel).sub(envF.wind); if (v3.length() > 0.5) A.V.set(v1.copy(s.pos).addScaledVector(v3, -0.25), v3.multiplyScalar(0.18)); else A.V.hide();
    } else Object.values(A).forEach(a => a.hide());
    if (S.trail && !s.ground && (FL.trailT += dt) > 0.12) { FL.trailT = 0; trailPts.push(s.pos.clone()); if (trailPts.length > 400) trailPts.shift(); trail.set(trailPts); }
    if (!S.trail && trailPts.length) { trailPts = []; trail.set([]); }
    if (FL.way) { wayRing.visible = true; wayRing.position.set(FL.way.x, W.ground(FL.way.x, FL.way.z) + 0.03, FL.way.z); wayRing.scale.setScalar(1 + 0.08 * Math.sin(now / 160)); } else wayRing.visible = false;
    ST.v = s.V;
  }
  // stick and throttle from the keys, the touch stick, the autopilot and the edge of the field
  function flightInputs(dt, att) {
    const k = a => held.has(a) ? 1 : 0, s = fl, walking = FL.walk, pos = s.pos;
    let roll = walking ? 0 : k('right') - k('left'), pitch = walking ? 0 : (k('climb') - k('dive')) * (S.invert ? -1 : 1);
    if (touch.on && !walking) { roll = touch.x; pitch = -touch.y * (S.invert ? -1 : 1); }
    if (!walking) { if (k('thrUp')) FL.thr = Math.min(1, FL.thr + dt * 0.5); if (k('thrDown')) FL.thr = Math.max(0, FL.thr - dt * 0.7); } else FL.thr = 0;
    if (roll || pitch) FL.way = null;
    const agl = pos.y - PH.CGH - W.ground(pos.x, pos.z);
    let hdg = null;                                                   // the autopilot's heading: the mark, or back in from the edge
    if (FL.way) { hdg = Math.atan2(FL.way.x - pos.x, FL.way.z - pos.z); if (Math.hypot(FL.way.x - pos.x, FL.way.z - pos.z) < 3) { FL.way = null; toast('Reached the mark'); } }
    const near = Math.max(Math.abs(pos.x), Math.abs(pos.z)) > EDGE - 24, outward = pos.x * Math.sin(att.heading) + pos.z * Math.cos(att.heading) > 0;
    if (near && outward && !s.ground) { hdg = Math.atan2(-pos.x, -pos.z); if (!FL.edgeWarned) { FL.edgeWarned = true; toast('Edge of the field · turning back'); } } else if (!near) FL.edgeWarned = false;
    if ((FL.auto || hdg !== null) && !s.ground && !roll) { const bankT = hdg === null ? 0 : -clamp(wrap(hdg - att.heading) * 1.3, -0.55, 0.55); roll = clamp((bankT - att.bank) * 2.6 - s.w.z * 0.7, -1, 1); }
    if ((FL.auto || FL.way) && !s.ground && !pitch) { const vzT = clamp((8 - agl) * 0.35, -1.0, 1.0); pitch = clamp((vzT - s.vel.y) * 0.7 - s.w.x * 0.3, -1, 1); }
    if ((FL.auto || FL.way) && s.ground) { FL.thr = Math.max(FL.thr, FL.way ? 0.5 : 0.85); if (s.V > 5) pitch = 1; }
    if (FL.auto && !s.ground) FL.thr = 0.72;
    if (FL.way && s.ground) roll = -clamp(wrap(Math.atan2(FL.way.x - pos.x, FL.way.z - pos.z) - att.heading) * 2, -1, 1);
    FL.roll += (roll - FL.roll) * damp(touch.on ? 14 : 7, dt); FL.pitch += (pitch - FL.pitch) * damp(touch.on ? 14 : 6, dt);
    return { thr: held.has('boost') && !walking ? 1 : FL.thr, pitch: FL.pitch, roll: FL.roll, link: true, brake: held.has('thrDown') && FL.thr === 0, agl };
  }
  function touchdown(now, t) {
    const s = fl, wing = Math.abs(t.bank) > 0.32, hard = t.impact > PH.MODELS[S.model].hard || wing;
    if (hard) s.vel.multiplyScalar(0.35);
    if (!FL.rec) return;
    const d = Math.hypot(s.pos.x - FL.rec.x, s.pos.z - FL.rec.z), secs = (now - FL.rec.t) / 1000; FL.rec = null;
    if (d < 0.6 && secs < 0.8) return;                                // a hop, not a flight
    FL.log.unshift({ n: FL.flights, d, secs, hard }); FL.log.length = Math.min(FL.log.length, 6);
    const ft = d / K * 3.28084, beat = ft > 852 ? 'farther than Wilbur\'s 852 ft' : ft > 200 ? 'farther than the third flight' : ft > 120 ? 'farther than Orville\'s first' : 'short of Orville\'s first 120 ft';
    toast(`${wing ? 'Wingtip strike! ' : hard ? 'Hard landing! ' : 'Landed · '}${fmtLen(d)} in ${secs.toFixed(1)} s, ${beat}`);
  }
  function collide(now) {
    const s = fl, R = 3.0; PH.origin(s, v2);
    for (const [x, z, hw, hd, r, h] of W.obstacles) {
      if (h < 0.6 || v2.y - W.ground(x, z) > h + 0.35) continue;
      const c = Math.cos(r), sn = Math.sin(r), dx = v2.x - x, dz = v2.z - z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
      const ex = lx - clamp(lx, -hw, hw), ez = lz - clamp(lz, -hd, hd), d = Math.hypot(ex, ez);
      if (d >= R) continue;
      const nx = d > 1e-4 ? ex / d : 1, nz = d > 1e-4 ? ez / d : 0, push = R - d;
      s.pos.x += (nx * c + nz * sn) * push; s.pos.z += (-nx * sn + nz * c) * push; s.vel.multiplyScalar(0.25);
      if (now - FL.bumpT > 1500) { FL.bumpT = now; toast('Bump! Mind the camp'); }
    }
  }
  function resetToRail() {
    if (FL.walk) setWalk(false, true);
    FL.auto = false; FL.way = null; FL.thr = 0; FL.rec = null; trailPts = []; trail.set([]);
    PH.reset(fl, W.START[0], W.START[1], 0, W.ground(W.START[0], W.START[1])); toast('Back on the rail'); syncUI();
  }
  function setWalk(on, force = false) {
    if (on === FL.walk) return;
    if (on) {
      if (!fl.ground || Math.hypot(fl.vel.x, fl.vel.z) > 0.6) { toast('Land and stop before climbing out'); return; }
      const h = PH.attitude(fl).heading; PH.origin(fl, v2);
      walker.pos.set(v2.x - Math.sin(h) * 2.6 + Math.cos(h) * 1.3, 0, v2.z - Math.cos(h) * 2.6 - Math.sin(h) * 1.3); walker.pos.y = W.ground(walker.pos.x, walker.pos.z);
      walker.heading = h + Math.PI * 0.75; walker.goal = null; walker.v = 0; walker.g.visible = true; FL.walk = true; FL.auto = false; FL.way = null;
      if (camera === ortho) setOrtho(false);
      toast('On foot · WASD walks, Shift runs · walk back and press V to climb aboard');
    } else {
      PH.origin(fl, v2);
      if (!force && walker.pos.distanceTo(v2) > 5) { toast('Walk back to the Flyer to climb aboard'); return; }
      FL.walk = false; walker.g.visible = false; held.clear(); if (!force) toast('Aboard the Flyer');
    }
    syncUI();
  }
  function walk(dt) {
    const w = walker, k = a => held.has(a) ? 1 : 0;
    let ix = k('wr') - k('wl'), iz = k('wf') - k('wb'); if (touch.on) { ix = touch.x; iz = -touch.y; }
    let goal = 0, dir = null;
    if (Math.abs(ix) > 0.05 || Math.abs(iz) > 0.05) {
      if (FL.cam === 'pilot') { const h = w.heading; dir = v1.set(Math.sin(h) * iz - Math.cos(h) * ix, 0, Math.cos(h) * iz + Math.sin(h) * ix); }
      else { const f = v2.subVectors(controls.target, camera.position).setY(0).normalize(); dir = v1.set(-f.z * ix + f.x * iz, 0, f.x * ix + f.z * iz); }
      dir.normalize(); goal = held.has('boost') ? 4.0 : 1.6 * Math.min(1, Math.hypot(ix, iz)); w.goal = null;
    } else if (w.goal) { dir = v1.set(w.goal.x - w.pos.x, 0, w.goal.z - w.pos.z); const d = dir.length(); if (d < 0.15) w.goal = null; else { dir.divideScalar(d); goal = d > 6 ? 4.0 : 1.6; } }
    w.v += (goal - w.v) * damp(goal > w.v ? 5 : 9, dt);
    if (dir && w.v > 0.01) { if (FL.cam !== 'pilot') w.heading += wrap(Math.atan2(dir.x, dir.z) - w.heading) * damp(10, dt);
      w.pos.x = clamp(w.pos.x + dir.x * w.v * dt, -EDGE, EDGE); w.pos.z = clamp(w.pos.z + dir.z * w.v * dt, -EDGE, EDGE); }
    const solids = W.obstacles.slice(); PH.origin(fl, v2);              // keep out of the Flyer and the camp
    if (fl.ground) { const h = PH.attitude(fl).heading; solids.push([v2.x + Math.sin(h) * 0.16, v2.z + Math.cos(h) * 0.16, 3.15, 1.64, -h, 2]); }
    for (const [x, z, hw, hd, r] of solids) {
      const c = Math.cos(r), sn = Math.sin(r), dx = w.pos.x - x, dz = w.pos.z - z, lx = dx * c - dz * sn, lz = dx * sn + dz * c, R = 0.16;
      if (Math.abs(lx) < hw + R && Math.abs(lz) < hd + R) { const px = hw + R - Math.abs(lx), pz = hd + R - Math.abs(lz); let nx = 0, nz = 0;
        if (px < pz) nx = Math.sign(lx) * px; else nz = Math.sign(lz) * pz; w.pos.x += nx * c + nz * sn; w.pos.z += -nx * sn + nz * c; w.goal = null; }
    }
    w.pos.y = W.ground(w.pos.x, w.pos.z); w.g.position.copy(w.pos); w.g.rotation.y = w.heading;
    w.phase += dt * w.v * 4.2; const sw = Math.sin(w.phase) * 0.6 * Math.min(1, w.v / 1.6);
    w.legs[0].rotation.x = sw; w.legs[1].rotation.x = -sw; w.arms[0].rotation.x = -sw * 0.8; w.arms[1].rotation.x = sw * 0.8;
    w.body.position.y = Math.abs(Math.sin(w.phase)) * 0.015 * Math.min(1, w.v); w.g.visible = FL.cam !== 'pilot';
  }

  // ══ cameras ══
  // At Kitty Hawk the subject (the Flyer's centre of gravity, or the walker) is always the look-at point, exactly: the
  // camera's position eases but its aim never lags, so the Flyer can't drift out of frame however it moves.
  const subject = out => mode === 'field' ? (FL.walk ? out.copy(walker.pos).add(v3.set(0, 0.7, 0)) : out.copy(fl.pos)) : mode === 'tunnel' ? out.set(0, TUN.MOUNT - 0.2, 0) : out.set(0, STU.TABLE_Y + 1.6 * K, 0);
  // 28° tall, opened up on a narrow (phone) screen so the picture is at least 24° wide and the camera can stay inside the room
  const baseFov = () => Math.max(28, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(12)) / persp.aspect)));
  let viewOff = 0, viewOffY = 0;
  function cameraTick(dt) {
    const fovGoal = mode === 'field' && (FL.cam === 'chase' || FL.cam === 'pilot') ? 50 + (FL.walk ? 0 : clamp(fl.V / 9, 0, 1) * 8) : baseFov();
    if (camera === persp && Math.abs(persp.fov - fovGoal) > 0.05) { persp.fov += (fovGoal - persp.fov) * damp(3, dt); persp.updateProjectionMatrix(); }
    if (tween) { tween.t = Math.min(1, tween.t + dt / tween.dur); const k = ease(tween.t); camera.position.lerpVectors(tween.p0, tween.p1, k); controls.target.lerpVectors(tween.t0, tween.t1, k); if (tween.t >= 1) tween = null; return; }
    // field: the Flyer stays the exact aim point, and the picture is slid sideways so it sits mid-gap between the panels
    // on a phone the panels stack at the top and the bar sits at the bottom: the picture slides down into the space between
    let offY = 0;
    if (narrow.matches && camera === persp && ui.dock && !document.body.classList.contains('wf-hide')) {
      const bar = document.querySelector('.wf-bar2:not(.away)'), top = SCR.rect(ui.dock).bottom, bot = bar ? SCR.rect(bar).top : innerHeight;
      offY = innerHeight / 2 - (top + bot) / 2;
    }
    const drawer = pland() && ui.dock && ui.dock.classList.contains('open') && camera === persp ? SCR.rect(ui.dock).width / 2 + 8 : 0;
    const offGoal = (mode === 'field' && camera === persp ? panelGap() : 0) + drawer; viewOff += (offGoal - viewOff) * damp(6, dt); viewOffY += (offY - viewOffY) * damp(6, dt);
    if (Math.abs(viewOff) < 0.5 && Math.abs(viewOffY) < 0.5) { if (persp.view && persp.view.enabled) persp.clearViewOffset(); }
    else persp.setViewOffset(innerWidth, innerHeight, Math.round(viewOff), Math.round(viewOffY), innerWidth, innerHeight);
    if (mode !== 'field') return;                                     // workshop and tunnel: orbit freely round a still subject
    VIEWS[ID].target.copy(subject(v2));
    const c = FL.cam, focus = subject(V()), heading = FL.walk ? walker.heading : PH.attitude(fl).heading, idle = performance.now() - cam.lastDrag > 1500 && !cam.dragging;
    if (c === 'free') return;
    if (c === 'follow') {
      v2.subVectors(focus, controls.target); controls.target.add(v2); camera.position.add(v2);
      const moving = FL.walk ? walker.v > 0.5 : !fl.ground || Math.hypot(fl.vel.x, fl.vel.z) > 1.5;
      if (S.align && moving && idle) { const o = v3.subVectors(camera.position, controls.target), err = wrap(heading + Math.PI - Math.atan2(o.x, o.z)); o.applyAxisAngle(UP, err * damp(0.8, dt)); camera.position.copy(controls.target).add(o); }
      return;
    }
    if (idle) { cam.yaw += (0 - cam.yaw) * damp(1.2, dt); cam.pitch += (0 - cam.pitch) * damp(1.2, dt); }
    if (c === 'chase') {
      const yaw = heading + Math.PI + cam.yaw, el = clamp(0.3 + cam.pitch, 0.05, 1.3), d = FL.walk ? Math.min(cam.dist, 5) : cam.dist;
      const want = v3.set(focus.x + Math.sin(yaw) * Math.cos(el) * d, focus.y + Math.sin(el) * d, focus.z + Math.cos(yaw) * Math.cos(el) * d);
      want.y = Math.max(want.y, W.ground(want.x, want.z) + 0.4);
      camera.position.lerp(want, damp(4.5, dt)); controls.target.copy(focus);
      return;
    }
    let head, dir;                                                    // eyes
    if (FL.walk) { head = v2.copy(walker.pos).add(v3.set(0, 0.84 + Math.abs(Math.sin(walker.phase)) * 0.012 * Math.min(1, walker.v), 0)); const h = walker.heading + cam.lookYaw;
      dir = v3.set(Math.sin(h) * Math.cos(cam.lookPitch), Math.sin(cam.lookPitch), Math.cos(h) * Math.cos(cam.lookPitch)); }
    else { M.root.updateMatrixWorld(true); head = M.root.localToWorld(WF_MODEL.piv.head.clone()); dir = v3.set(0, 0, 1).transformDirection(M.root.matrixWorld).applyAxisAngle(UP, cam.lookYaw); dir.y += Math.sin(cam.lookPitch); dir.normalize(); }
    camera.position.copy(head); controls.target.copy(head).addScaledVector(dir, 8);
  }
  const CAMS = ['follow', 'chase', 'pilot', 'free'], CAMNAME = { follow: 'Follow', chase: 'Chase', pilot: 'Eyes', free: 'Free' };
  function setCam(c) {
    tween = null; FL.cam = c; cam.yaw = cam.pitch = cam.lookYaw = cam.lookPitch = 0;
    controls.enabled = c === 'follow' || c === 'free';
    if ((c === 'chase' || c === 'pilot') && camera === ortho) setOrtho(false);
    if (c === 'follow') { const f = subject(V()), off = camera.position.clone().sub(controls.target); if (off.length() < 3) off.set(0.2, 0.5, -1);
      off.setLength(FL.walk ? 5.5 : 12); off.y = Math.max(off.y, FL.walk ? 2 : 3.5); controls.target.copy(f); camera.position.copy(f).add(off); }
    syncUI();
  }
  function behind() {
    if (mode === 'workshop') { viewPreset('rear'); return; }
    if (mode === 'tunnel') { tunnelView('rear'); return; }
    cam.yaw = cam.pitch = cam.lookYaw = cam.lookPitch = 0; if (FL.cam !== 'follow' && FL.cam !== 'free') return;
    const h = FL.walk ? walker.heading : PH.attitude(fl).heading, d = camera.position.distanceTo(controls.target), t = controls.target;
    camTo(V(t.x - Math.sin(h) * d * 0.88, t.y + d * 0.4, t.z - Math.cos(h) * d * 0.88), t.clone(), false, 0.6);
  }
  function orbitBy(a, zoom = 1) {
    if (mode === 'field' && FL.cam === 'chase') { cam.yaw += a; cam.dist = clamp(cam.dist * zoom, 3, 40); cam.lastDrag = performance.now(); return; }
    if (mode === 'field' && FL.cam === 'pilot') { cam.lookYaw += a; return; }
    const o = v1.subVectors(camera.position, controls.target).applyAxisAngle(UP, a).multiplyScalar(zoom);
    if (o.length() < controls.minDistance || o.length() > controls.maxDistance) return;
    camera.position.copy(controls.target).add(o); cam.lastDrag = performance.now();
  }
  function pointerNav() {
    const el = renderer.domElement; let drag = null;
    el.addEventListener('pointerdown', e => { cam.dragging = true; tween = null; if (mode === 'field' && (FL.cam === 'pilot' || FL.cam === 'chase') && active === ID) drag = [e.clientX, e.clientY]; });
    addEventListener('pointermove', e => {
      if (drag) { const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY];
        if (FL.cam === 'pilot') { cam.lookYaw -= dx * 0.005; cam.lookPitch = clamp(cam.lookPitch - dy * 0.004, -1.0, 0.9); if (FL.walk) { walker.heading += cam.lookYaw; cam.lookYaw = 0; } }
        else { cam.yaw -= dx * 0.006; cam.pitch = clamp(cam.pitch + dy * 0.004, -0.3, 1.0); } }
      hover(e);
    });
    addEventListener('pointerup', () => { if (cam.dragging) cam.lastDrag = performance.now(); cam.dragging = false; drag = null; });
    el.addEventListener('wheel', e => { cam.lastDrag = performance.now(); tween = null; if (mode === 'field' && FL.cam === 'chase') { cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), 3, 40); e.preventDefault(); } }, { passive: false });
    el.addEventListener('dblclick', () => { if (mode === 'workshop' && WS.sel && !WS.demo) enterDemo(WS.sel.key); });
  }

  // ══ clicks, hover ══
  function onClick(hit, e, onBot) {
    // pick again from the pointer: the controller's ray also meets the other modes' rooms, which stay in the scene hidden
    if (e && e.clientX != null) { hit = pickAt(e.clientX, e.clientY, true) || (hit && !hit.object ? hit : null); onBot = !!(hit && hit.object && inside(hit.object, M.root)); }
    const k = hit && hit.object ? findKey(hit.object) : null;
    if (mode === 'workshop') { if (k && k.kind === 'part') { if (WS.demo) { if (WF_DEMO_OF[k.key] !== WS.demo.id) enterDemo(k.key); } else select('part', k.key); } else if (!WS.demo) select(null); return true; }
    if (mode === 'tunnel') { if (k && k.kind === 'part') toast(`${INFO.parts[k.key].name} · open the Workshop (1) to see how it works`); return true; }
    if (k) { toast(`${(k.kind === 'part' ? INFO.parts : INFO.places)[k.key].name}${k.kind === 'part' ? ' · see how it works in the Workshop (1)' : ''}`); return true; }
    if (!hit || !hit.point || onBot) return true;
    if (FL.walk) walker.goal = { x: hit.point.x, z: hit.point.z };
    else { FL.way = { x: clamp(hit.point.x, -EDGE + 8, EDGE - 8), z: clamp(hit.point.z, -EDGE + 8, EDGE - 8) }; toast(fl.ground ? 'Taxiing to the mark · steer to cancel' : 'Flying to the mark · steer to cancel'); }
    return true;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let hoverT = 0;
  const inside = (o, root) => { for (; o; o = o.parent) if (o === root) return true; return false; };
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  // what the pointer (page coordinates) is over: only things showing, never the see-through context or a demo's particles;
  // with ground, the field's sand counts too (a place to fly or walk to)
  function pickAt(x, y, ground = false) {
    ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const targets = [M.root, ...(mode === 'field' ? (ground ? [W.group] : Object.values(W.places).filter(P => P.meshes.length).map(P => P.g)) : [])];
    return ray.intersectObjects(targets, true).find(h => h.object.isMesh && !h.object.isLineSegments2 && !h.object.userData.outline && h.object.material !== ghostCtx && !h.object.isInstancedMesh && shown(h.object)) || null;
  }
  function hover(e) {
    if (!ui.tip) return;
    if (!ready || active !== ID || cam.dragging || e.target !== renderer.domElement) { ui.tip.classList.remove('show'); return; }
    const now = performance.now(); if (now - hoverT < 70) return; hoverT = now;
    const h = pickAt(e.clientX, e.clientY), k = h && findKey(h.object);
    renderer.domElement.style.cursor = k ? 'pointer' : '';
    if (!k) { ui.tip.classList.remove('show'); return; }
    const info = (k.kind === 'part' ? INFO.parts : INFO.places)[k.key];
    ui.tip.innerHTML = (info ? info.name : k.key) + (mode === 'workshop' && k.kind === 'part' && !WS.demo ? ' <span>double-click: how it works</span>' : '');
    ui.tip.classList.add('show'); ui.tip.style.left = e.clientX + 'px'; ui.tip.style.top = e.clientY + 'px';
  }

  // ══ keys ══
  const FLY_KEYS = { w: 'thrUp', s: 'thrDown', a: 'left', d: 'right', arrowleft: 'left', arrowright: 'right', arrowup: 'climb', arrowdown: 'dive', r: 'climb', f: 'dive' };
  const WALK_KEYS = { w: 'wf', arrowup: 'wf', s: 'wb', arrowdown: 'wb', a: 'wl', arrowleft: 'wl', d: 'wr', arrowright: 'wr' };
  function key(e) {
    const k = e.key.toLowerCase();
    if (k === 'shift') { held.add('boost'); return false; }
    if (k === 'l') return false;                                      // the controller's lights
    if (k.length === 1 && '123'.includes(k)) { if (!e.repeat) setMode(['workshop', 'tunnel', 'field'][+k - 1]); return true; }
    if (k === 'h') { if (!e.repeat) toggleUI(); return true; }
    if (k === '?') { showIntro(); return true; }
    if (mode === 'field') {
      const map = FL.walk ? WALK_KEYS : FLY_KEYS;
      if (map[k]) { held.add(map[k]); if (FL.walk) walker.goal = null; return true; }
      if (e.repeat && ['v', 'c', 'b', 'o', 'p', 'q', ' ', '0', 'g'].includes(k)) return true;
      switch (k) {
        case ' ': case 'q': if (!FL.walk) { FL.auto = !FL.auto; toast(FL.auto ? 'Autopilot on · cruising at about 50 ft' : 'Autopilot off'); syncUI(); } return true;
        case 'v': setWalk(!FL.walk); return true;
        case 'c': setCam(CAMS[(CAMS.indexOf(FL.cam) + 1) % CAMS.length]); toast(`Camera: ${CAMNAME[FL.cam]}`); return true;
        case 'o': S.forces = !S.forces; save(); syncUI(); return true;
        case 'p': S.trail = !S.trail; save(); syncUI(); return true;
        case '0': resetToRail(); return true;
        case 'escape': FL.way = null; FL.auto = false; syncUI(); return true;
        case 'g': S.labels = !S.labels; save(); syncUI(); return true;
      }
    }
    if (mode === 'workshop') {
      const D = WS.demo;
      if (D) { if (k === 'arrowright') { setStep(D.step + 1); return true; } if (k === 'arrowleft') { setStep(D.step - 1); return true; }
        if (k === ' ') { WS.playing = !WS.playing; syncUI(); return true; } if (k === 'escape' || k === 'backspace') { exitDemo(); return true; } }
      if (e.repeat) return ['e', 'x', 'g', 'r', 'enter', 'i'].includes(k);
      switch (k) {
        case 'e': if (D) exitDemo(); WS.explode = WS.explode > 0.5 ? 0 : 1; syncUI(); return true;
        case 'x': if (D) exitDemo(); WS.xray = WS.xray > 0.5 ? 0 : 1; refreshMats(); return true;
        case 'enter': case 'i': if (WS.sel && !D) enterDemo(WS.sel.key); return true;
        case 'escape': select(null); return true;
        case 'g': S.labels = !S.labels; save(); syncUI(); return true;
        case 'r': S.spin = !S.spin; save(); syncUI(); return true;
      }
    }
    if (mode === 'tunnel') {
      switch (k) {
        case 'arrowright': lesson(LS.i + 1); return true;
        case 'arrowleft': lesson(LS.i - 1); return true;
        case 'arrowup': LS.playing = false; TV.aoa = clamp(TV.aoa + 1, -6, 24); syncUI(); return true;
        case 'arrowdown': LS.playing = false; TV.aoa = clamp(TV.aoa - 1, -6, 24); syncUI(); return true;
        case 'w': LS.playing = false; TV.mph = clamp(TV.mph + 1, 0, 50); syncUI(); return true;
        case 's': LS.playing = false; TV.mph = clamp(TV.mph - 1, 0, 50); syncUI(); return true;
        case ' ': if (LS.sweep && !e.repeat) { LS.playing = !LS.playing; syncUI(); } return true;
      }
    }
    switch (k) { case '[': orbitBy(0.15); return true; case ']': orbitBy(-0.15); return true; case '-': orbitBy(0, 1.12); return true; case '=': case '+': orbitBy(0, 0.89); return true; case 'b': behind(); return true; }
    return false;
  }
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === 'shift') held.delete('boost'); for (const m of [FLY_KEYS, WALK_KEYS]) if (m[k]) held.delete(m[k]); });
  addEventListener('blur', () => held.clear());

  // ── engine sound (off until asked for) ──
  let au = null;
  function sound() {
    const on = S.sound && (mode === 'field' || mode === 'tunnel' || (mode === 'workshop' && WS.engine));
    if (!on) { if (au && au.ctx.state === 'running') au.ctx.suspend(); return; }
    if (!au) { const ctx = new AudioContext(), o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.frequency.value = 380; g.gain.value = 0; o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(ctx.destination); o1.start(); o2.start(); au = { ctx, o1, o2, g }; }
    if (au.ctx.state !== 'running') au.ctx.resume();
    const t = au.ctx.currentTime, thr = mode === 'field' ? (FL.walk ? 0.05 : FL.thr) : mode === 'tunnel' ? TV.thr : 0.4;
    au.o1.frequency.setTargetAtTime(32 + thr * 46, t, 0.15); au.o2.frequency.setTargetAtTime(64 + thr * 92, t, 0.15); au.g.gain.setTargetAtTime(0.025 + thr * 0.05, t, 0.2);
  }

  // ══ UI ══
  const css = `
  #ctl-wright, #info, #hint, .bot-bar { display:none !important; }
  :root { --wf-fs:12px; --wf-ease:cubic-bezier(.2,.8,.2,1); --wf-spring:cubic-bezier(.34,1.56,.64,1); }
  html[data-wf-size="s"] { --wf-fs:11px; } html[data-wf-size="l"] { --wf-fs:13.5px; }
  html, body { transition:background-color .4s var(--wf-ease), color .4s var(--wf-ease); }
  html:not([data-wf-mode="field"]) #read { display:none; }
  .wf-panel { position:fixed; z-index:6; font-size:var(--wf-fs); width:var(--w); max-width:calc(var(--wf-vw, 100vw) - 24px); max-height:calc(var(--wf-vh, 100vh) - 150px); display:flex; flex-direction:column;
    background:var(--panel); border:1px solid var(--line); border-radius:12px; color:var(--ink); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);
    box-shadow:0 10px 30px rgba(0,0,0,.18); animation:wfIn .45s var(--wf-ease) both; transition:background-color .4s, border-color .4s, box-shadow .2s; }
  .wf-panel.dragging { box-shadow:0 18px 40px rgba(0,0,0,.3); transition:none; }
  @keyframes wfIn { from { opacity:0; transform:translateY(10px) scale(.98); } }
  .wf-panel.off, .wf-panel.away { display:none; }
  .wf-head { display:flex; align-items:center; gap:6px; padding:6px 6px 6px 11px; cursor:grab; user-select:none; touch-action:none; letter-spacing:.1em; text-transform:uppercase; font-size:.9em; color:var(--dim); border-bottom:1px solid var(--line); transition:border-color .28s; }
  .wf-head:active { cursor:grabbing; } .wf-head b { color:var(--ink); font-weight:600; letter-spacing:.12em; } .wf-head .sp { flex:1; }
  .wf-head button { all:unset; cursor:pointer; width:22px; height:22px; display:grid; place-items:center; border-radius:6px; color:var(--dim); font-size:1.05em; transition:color .15s, background .15s, transform .28s var(--wf-ease); }
  .wf-head button:hover { color:var(--ink); background:var(--line); } .wf-head button:active { transform:scale(.88); }
  .wf-panel.collapsed [data-a=fold] { transform:rotate(-90deg); }
  .wf-fold { display:grid; grid-template-rows:1fr; min-height:0; transition:grid-template-rows .3s var(--wf-ease), opacity .25s; }
  .wf-panel.collapsed .wf-fold { grid-template-rows:0fr; opacity:0; } .wf-panel.collapsed .wf-head { border-bottom-color:transparent; }
  .wf-fold > div { min-height:0; overflow:hidden; display:flex; flex-direction:column; }
  .wf-sum { display:none; text-transform:none; letter-spacing:0; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; } .wf-panel.collapsed .wf-sum { display:inline; animation:wfFade .3s both; }
  @keyframes wfFade { from { opacity:0; transform:translateX(-4px); } }
  .wf-body { padding:10px 12px 12px; overflow:auto; display:flex; flex-direction:column; gap:10px; min-height:0; }
  .wf-sec { display:flex; flex-direction:column; gap:6px; }
  .wf-lbl { font-size:.82em; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); display:flex; justify-content:space-between; gap:8px; }
  .wf-lbl output { color:var(--ink); letter-spacing:0; text-transform:none; font-variant-numeric:tabular-nums; }
  .wf-row { display:flex; gap:5px; flex-wrap:wrap; align-items:center; }
  .wf-btn { all:unset; cursor:pointer; padding:5px 9px; border:1px solid var(--line); border-radius:8px; color:var(--dim); white-space:nowrap; touch-action:none;
    transition:transform .16s var(--wf-ease), color .15s, border-color .2s, box-shadow .25s, background .2s; }
  .wf-btn:hover { color:var(--ink); border-color:var(--dim); transform:translateY(-1px); } .wf-btn:active { transform:translateY(0) scale(.95); transition-duration:.06s; }
  .wf-btn.on { color:var(--ink); border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset, 0 0 14px color-mix(in srgb, var(--accent) 22%, transparent); animation:wfPop .3s var(--wf-spring); }
  .wf-btn.primary { color:var(--ink); border-color:color-mix(in srgb, var(--accent) 70%, transparent); background:color-mix(in srgb, var(--accent) 14%, transparent); }
  @keyframes wfPop { 50% { transform:scale(1.06); } }
  .wf-btn kbd { font:inherit; opacity:.55; margin-left:6px; }
  .wf-seg { position:relative; display:flex; border:1px solid var(--line); border-radius:8px; overflow:hidden; isolation:isolate; }
  .wf-seg .wf-ind { position:absolute; z-index:-1; top:0; bottom:0; left:0; width:0; background:color-mix(in srgb, var(--accent) 22%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent) inset; border-radius:7px; transition:left .32s var(--wf-spring), width .32s var(--wf-spring); }
  .wf-seg button { all:unset; flex:1; text-align:center; cursor:pointer; padding:5px 6px; color:var(--dim); white-space:nowrap; transition:color .2s, transform .1s; }
  .wf-seg button:hover { color:var(--ink); } .wf-seg button.on { color:var(--ink); } .wf-seg button:active { transform:scale(.96); }
  input[type=range].wf-r { -webkit-appearance:none; appearance:none; width:100%; height:18px; margin:0; background:transparent; cursor:pointer; }
  input[type=range].wf-r::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:linear-gradient(90deg, var(--accent) var(--p, 0%), var(--line) var(--p, 0%)); }
  input[type=range].wf-r::-moz-range-track { height:4px; border-radius:2px; background:var(--line); } input[type=range].wf-r::-moz-range-progress { height:4px; border-radius:2px; background:var(--accent); }
  input[type=range].wf-r::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; margin-top:-5px; border-radius:50%; background:var(--ink); border:2px solid var(--accent); transition:transform .18s var(--wf-spring), box-shadow .2s; }
  input[type=range].wf-r::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:var(--ink); border:2px solid var(--accent); }
  input[type=range].wf-r:hover::-webkit-slider-thumb { transform:scale(1.2); box-shadow:0 0 0 5px color-mix(in srgb, var(--accent) 18%, transparent); } input[type=range].wf-r:active::-webkit-slider-thumb { transform:scale(1.35); }
  .wf-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 10px; }
  .wf-stat small { display:block; color:var(--dim); font-size:.78em; letter-spacing:.1em; text-transform:uppercase; }
  .wf-stat span { font-size:1.15em; font-variant-numeric:tabular-nums; } .wf-stat.big span { font-size:1.65em; line-height:1.1; }
  .wf-stat i { font-style:normal; display:inline-block; width:8px; height:8px; border-radius:2px; margin-right:6px; background:var(--c); }
  .wf-bar { position:relative; height:6px; border-radius:3px; background:var(--line); overflow:hidden; }
  .wf-bar i { position:absolute; left:0; top:0; bottom:0; width:0; background:var(--accent); border-radius:3px; transition:width .2s var(--wf-ease); }
  .wf-bar b { position:absolute; top:-1px; bottom:-1px; width:2px; margin-left:-1px; background:var(--ink); left:0; transition:left .2s var(--wf-ease); }
  .wf-bar.hot i { background:linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 50%, #fff), var(--accent)); background-size:200% 100%; animation:wfShine 1.2s linear infinite; }
  @keyframes wfShine { to { background-position:-200% 0; } }
  .wf-chips { display:flex; gap:5px; flex-wrap:wrap; } .wf-chip { padding:2px 8px; border-radius:999px; border:1px solid var(--line); font-size:.85em; color:var(--dim); transition:color .2s, border-color .2s, background .2s; }
  .wf-chip.hot { color:var(--accent); border-color:var(--accent); } .wf-chip.bump { animation:wfBump .35s var(--wf-spring); } @keyframes wfBump { 40% { transform:scale(1.12); } }
  .wf-chip.warn { color:var(--accent); border-color:var(--accent); animation:wfBlink .7s ease-in-out infinite alternate; } @keyframes wfBlink { to { background:color-mix(in srgb, var(--accent) 22%, transparent); } }
  .wf-chip.ok { color:var(--ink); border-color:#4ade80; background:color-mix(in srgb, #4ade80 18%, transparent); animation:wfBump .4s var(--wf-spring); }
  .wf-log { display:flex; flex-direction:column; gap:2px; font-size:.92em; color:var(--dim); } .wf-log b { color:var(--ink); font-weight:500; }
  .wf-log span.fresh { animation:wfSlide .45s var(--wf-ease); color:var(--ink); } @keyframes wfSlide { from { opacity:0; transform:translateY(-6px); } }
  .wf-card { display:flex; flex-direction:column; gap:8px; animation:wfRise .35s var(--wf-ease) both; } @keyframes wfRise { from { opacity:0; transform:translateY(6px); } }
  .wf-card h3 { margin:0; font-size:1.2em; color:var(--accent); letter-spacing:.03em; font-weight:600; } .wf-card p { margin:0; line-height:1.55; }
  .wf-specs { width:100%; border-collapse:collapse; } .wf-specs td { padding:4px 0; border-top:1px solid var(--line); vertical-align:top; }
  .wf-specs tr { animation:wfRise .35s var(--wf-ease) both; } .wf-specs td:first-child { color:var(--dim); padding-right:10px; white-space:nowrap; }
  .wf-mini td { padding:2px 6px 2px 0; font-variant-numeric:tabular-nums; } .wf-mini tr:first-child td { color:var(--dim); border-top:0; font-size:.85em; }
  .wf-fact { border-left:2px solid var(--accent); padding:3px 0 3px 10px; line-height:1.5; }
  .wf-list { display:flex; flex-direction:column; gap:1px; }
  .wf-group { font-size:.78em; letter-spacing:.12em; text-transform:uppercase; color:var(--dim); padding:8px 8px 3px; }
  .wf-item { display:flex; align-items:center; gap:6px; border-radius:7px; transition:background .15s; }
  .wf-item:hover { background:color-mix(in srgb, var(--line) 70%, transparent); } .wf-item.on { background:color-mix(in srgb, var(--accent) 14%, transparent); }
  .wf-item > button { all:unset; cursor:pointer; flex:1; padding:6px 8px; transition:padding-left .2s var(--wf-ease), color .15s; } .wf-item:hover > button:first-child { padding-left:11px; }
  .wf-item.on > button:first-child { color:var(--accent); }
  .wf-item .wf-go { flex:none; padding:3px 8px; margin-right:3px; border-radius:6px; color:var(--dim); font-size:.88em; border:1px solid transparent; transition:color .15s, border-color .15s, transform .2s var(--wf-spring); }
  .wf-item .wf-go:hover { color:var(--ink); border-color:var(--accent); transform:translateX(2px); }
  .wf-steps { display:flex; gap:4px; flex-wrap:wrap; }
  .wf-steps button { all:unset; cursor:pointer; min-width:22px; height:22px; padding:0 4px; display:grid; place-items:center; border-radius:999px; border:1px solid var(--line); color:var(--dim); font-size:.9em; transition:all .25s var(--wf-spring); }
  .wf-steps button:hover { border-color:var(--dim); color:var(--ink); }
  .wf-steps button.on { color:var(--ink); border-color:var(--accent); background:color-mix(in srgb, var(--accent) 22%, transparent); transform:scale(1.1); } .wf-steps button.done { color:var(--ink); }
  .wf-step h4 { margin:0 0 4px; font-size:1.05em; } .wf-step p { margin:0; line-height:1.55; } .wf-step { animation:wfRise .35s var(--wf-ease) both; }
  .wf-readout .wf-specs tr { animation:none; }   /* live numbers: no rise-in */
  .wf-readout { padding:8px 10px; border-radius:8px; background:color-mix(in srgb, var(--line) 45%, transparent); line-height:1.5; font-variant-numeric:tabular-nums; }
  .wf-strokes { display:grid; grid-template-columns:repeat(4, 1fr); gap:4px; margin-bottom:6px; } .wf-strokes span { padding:4px 2px; border-radius:6px; border:1px solid var(--line); text-align:center; font-size:.82em; color:var(--dim); transition:all .2s; }
  .wf-strokes span b { display:block; color:var(--ink); } .wf-strokes span.on { border-color:var(--accent); color:var(--accent); background:color-mix(in srgb, var(--accent) 14%, transparent); }
  .wf-keys { display:grid; grid-template-columns:auto 1fr; gap:4px 12px; } .wf-keys kbd { font:inherit; color:var(--ink); white-space:nowrap; } .wf-keys span { color:var(--dim); }
  .wf-empty { color:var(--dim); line-height:1.5; }
  .wf-chart { width:100%; height:150px; display:block; border-radius:8px; background:color-mix(in srgb, var(--line) 35%, transparent); }
  .wf-eq { font-size:.92em; line-height:1.6; color:var(--dim); } .wf-eq b { color:var(--ink); font-weight:500; }
  .wf-att { display:flex; gap:10px; align-items:center; } .wf-att canvas { width:92px; height:92px; flex:none; }
  .wf-modes { position:fixed; z-index:8; top:14px; left:50%; transform:translateX(-50%); display:flex; padding:3px; gap:2px; border:1px solid var(--line); border-radius:999px; background:var(--panel); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); isolation:isolate; animation:wfDrop .5s var(--wf-ease) both; }
  @keyframes wfDrop { from { opacity:0; transform:translate(-50%, -8px); } }
  html.wf-w1180 .wf-modes { top:54px; }
  .wf-modes button { all:unset; cursor:pointer; display:flex; align-items:center; gap:7px; padding:5px 13px 5px 10px; border-radius:999px; color:var(--dim); font-size:11.5px; letter-spacing:.04em; white-space:nowrap; transition:color .2s; }
  .wf-modes button svg { width:16px; height:16px; flex:none; transition:transform .3s var(--wf-spring); } .wf-modes button:hover svg { transform:scale(1.15) rotate(-6deg); }
  .wf-modes button small { opacity:.6; font-size:9.5px; letter-spacing:.08em; text-transform:uppercase; }
  .wf-modes button:hover, .wf-modes button.on { color:var(--ink); } .wf-modes button.on svg { color:var(--accent); }
  .wf-modes .wf-ind { position:absolute; z-index:-1; top:3px; bottom:3px; border-radius:999px; background:color-mix(in srgb, var(--accent) 20%, transparent); box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent) inset; transition:left .4s var(--wf-spring), width .4s var(--wf-spring); }
  .wf-bar2 { position:fixed; z-index:7; left:50%; bottom:16px; transform:translateX(-50%); display:flex; align-items:center; gap:10px; padding:7px 10px; max-width:calc(var(--wf-vw, 100vw) - 24px); overflow-x:auto; scrollbar-width:none;
    border:1px solid var(--line); border-radius:14px; background:var(--panel); color:var(--ink); font-size:var(--wf-fs); -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); box-shadow:0 10px 30px rgba(0,0,0,.18); animation:wfUp .45s var(--wf-ease) both; }
  @keyframes wfUp { from { opacity:0; transform:translate(-50%, 12px); } }
  .wf-bar2.away { display:none; } .wf-bar2 .wf-div { width:1px; align-self:stretch; background:var(--line); flex:none; }
  .wf-bar2 label { display:flex; flex-direction:column; gap:2px; min-width:112px; } .wf-bar2 label > span { font-size:.8em; letter-spacing:.1em; text-transform:uppercase; color:var(--dim); display:flex; justify-content:space-between; gap:6px; }
  .wf-bar2 label output { color:var(--ink); text-transform:none; letter-spacing:0; } .wf-bar2 .wf-seg { min-width:170px; }
  .wf-credit { position:fixed; left:50%; bottom:3px; transform:translateX(-50%); z-index:1; pointer-events:none; white-space:nowrap; font-size:10px; letter-spacing:.08em; color:var(--dim); opacity:.4; }
  .wf-fade { position:fixed; inset:0; z-index:20; background:var(--bg); opacity:0; pointer-events:none; transition:opacity .26s var(--wf-ease); } .wf-fade.on { opacity:1; }
  .wf-intro { position:fixed; inset:0; z-index:30; display:grid; place-items:center; background:color-mix(in srgb, var(--bg) 70%, transparent); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); animation:wfFadeIn .3s both; padding:16px; }
  @keyframes wfFadeIn { from { opacity:0; } }
  .wf-intro > div { width:min(760px, 100%); max-height:calc(var(--wf-vh, 100vh) - 32px); overflow:auto; padding:22px; border-radius:16px; border:1px solid var(--line); background:var(--panel); color:var(--ink); font-size:13px; animation:wfRise .45s var(--wf-spring) both; }
  .wf-intro h2 { margin:0 0 4px; font-size:18px; letter-spacing:.04em; } .wf-intro > div > p { margin:0 0 16px; color:var(--dim); line-height:1.5; }
  .wf-cards { display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; }
  .wf-cards button { all:unset; cursor:pointer; display:flex; flex-direction:column; gap:6px; padding:14px; border-radius:12px; border:1px solid var(--line); transition:transform .2s var(--wf-spring), border-color .2s, box-shadow .25s; animation:wfRise .5s var(--wf-ease) both; }
  .wf-cards button:nth-child(2) { animation-delay:.06s; } .wf-cards button:nth-child(3) { animation-delay:.12s; }
  .wf-cards button:hover { transform:translateY(-3px); border-color:var(--accent); box-shadow:0 10px 26px color-mix(in srgb, var(--accent) 18%, transparent); }
  .wf-cards svg { width:28px; height:28px; color:var(--accent); } .wf-cards b { font-size:14px; } .wf-cards span { color:var(--dim); line-height:1.45; } .wf-cards kbd { font:inherit; color:var(--dim); font-size:11px; }
  .wf-toast { position:fixed; left:50%; top:var(--wf-top, 58px); z-index:9; max-width:calc(var(--wf-vw, 100vw) - 32px); padding:7px 14px; border-radius:999px; border:1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    background:var(--panel); color:var(--ink); font-size:12px; pointer-events:none; opacity:0; transform:translate(-50%, -8px) scale(.97); transition:opacity .25s, transform .35s var(--wf-spring); text-align:center; -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
  .wf-toast.show { opacity:1; transform:translate(-50%, 0) scale(1); }
  .wf-tip { position:fixed; z-index:9; pointer-events:none; opacity:0; transform:translate(14px, 18px); padding:3px 8px; border-radius:6px; background:var(--panel); border:1px solid var(--line); font-size:11px; color:var(--ink); white-space:nowrap; transition:opacity .15s, transform .2s var(--wf-ease); }
  .wf-tip span { color:var(--dim); margin-left:6px; } .wf-tip.show { opacity:1; transform:translate(14px, 14px); }
  .wf-labels, .wf-fxl { position:fixed; inset:0; pointer-events:none; z-index:3; overflow:hidden; }
  .wf-label { position:absolute; transform:translate(-50%, -130%); padding:1px 6px; border-radius:4px; font-size:10.5px; white-space:nowrap; color:var(--ink); background:color-mix(in srgb, var(--panel) 88%, transparent); border:1px solid var(--line); animation:wfFade .3s both; }
  .wf-label.sel { color:var(--accent); border-color:var(--accent); }
  .wf-fxlabel { position:absolute; left:0; top:0; margin:-10px 0 0 8px; padding:1px 6px; border-radius:4px; font-size:10.5px; white-space:nowrap; color:var(--c, var(--ink)); background:color-mix(in srgb, var(--panel) 85%, transparent); border:1px solid color-mix(in srgb, var(--c, var(--dim)) 55%, transparent); animation:wfFade .3s both; }
  .wf-fxlabel.dim { color:var(--dim); border-color:var(--line); } .wf-fxlabel.num { margin:-10px 0 0 -8px; min-width:12px; text-align:center; } .wf-fxlabel small { opacity:.6; }
  #wf-ui { all:unset; cursor:pointer; height:28px; padding:0 11px; display:flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:999px; background:var(--panel); color:var(--dim); font-size:11px; letter-spacing:.08em; text-transform:uppercase; transition:color .15s, border-color .15s, transform .16s var(--wf-ease); }
  #wf-ui:hover { border-color:var(--dim); color:var(--ink); transform:translateY(-1px); } #wf-ui:active { transform:scale(.95); }
  .wf-menu { position:fixed; z-index:10; width:250px; padding:12px; display:flex; flex-direction:column; gap:9px; background:var(--panel); border:1px solid var(--line); border-radius:12px; font-size:12px; color:var(--ink);
    -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px); box-shadow:0 16px 40px rgba(0,0,0,.25); transform-origin:top right; opacity:0; transform:scale(.95) translateY(-4px); pointer-events:none; transition:opacity .18s, transform .25s var(--wf-spring); }
  .wf-menu.open { opacity:1; transform:none; pointer-events:auto; } .wf-menu label { display:flex; align-items:center; gap:8px; cursor:pointer; } .wf-menu input[type=checkbox] { accent-color:var(--accent); margin:0; }
  .wf-themes { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .wf-theme { all:unset; cursor:pointer; display:flex; flex-direction:column; gap:5px; padding:7px; border-radius:9px; border:1px solid var(--line); transition:transform .18s var(--wf-spring), border-color .2s, box-shadow .25s; }
  .wf-theme:hover { transform:translateY(-2px); border-color:var(--dim); } .wf-theme:active { transform:scale(.96); } .wf-theme.on { border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; }
  .wf-theme i { display:flex; height:22px; border-radius:5px; overflow:hidden; border:1px solid rgba(127,127,127,.25); } .wf-theme i b { flex:1; } .wf-theme span { font-size:11px; color:var(--dim); } .wf-theme.on span { color:var(--ink); }
  .wf-stick { position:fixed; left:18px; bottom:24px; width:118px; height:118px; border-radius:50%; z-index:7; border:1px solid var(--line); background:color-mix(in srgb, var(--panel) 80%, transparent); touch-action:none; display:none; }
  .wf-stick i { position:absolute; left:50%; top:50%; width:46px; height:46px; margin:-23px 0 0 -23px; border-radius:50%; background:var(--panel); border:2px solid var(--accent); transition:transform .25s var(--wf-spring); } .wf-stick.on i { transition:none; }
  .wf-thr { position:fixed; right:18px; bottom:24px; width:46px; height:150px; border-radius:23px; z-index:7; border:1px solid var(--line); background:color-mix(in srgb, var(--panel) 80%, transparent); touch-action:none; display:none; overflow:hidden; }
  .wf-thr i { position:absolute; left:0; right:0; bottom:0; height:0; background:color-mix(in srgb, var(--accent) 40%, transparent); transition:height .12s; } .wf-thr span { position:absolute; inset:auto 0 6px; text-align:center; font-size:10px; color:var(--ink); }
  html.wf-touch[data-wf-mode="field"] .wf-stick, html.wf-touch[data-wf-mode="field"] .wf-thr { display:block; }
  html.wf-touch[data-wf-mode="field"] #read { bottom:180px; }
  body.wf-hide .wf-panel, body.wf-hide .wf-labels, body.wf-hide .wf-fxl, body.wf-hide #read, body.wf-hide .wf-stick, body.wf-hide .wf-thr, body.wf-hide .wf-bar2 { display:none !important; }
  .wf-dock { display:none; }
  html.wf-mid .wf-bar2 { left:12px; right:12px; transform:none; animation:none; flex-wrap:wrap; justify-content:center; row-gap:6px; overflow:visible; } html.wf-mid .wf-bar2 .wf-div { display:none; }
  html.wf-narrow .wf-modes { top:var(--wf-mtop, 52px); left:8px; right:8px; transform:none; justify-content:space-between; animation:none; } html.wf-narrow .wf-modes button { flex:1; justify-content:center; padding:6px; } html.wf-narrow .wf-modes button small { display:none; }
  html.wf-narrow .wf-dock { display:flex; flex-direction:column; gap:6px; position:fixed; z-index:6; left:8px; right:8px; top:var(--wf-dtop, 96px); max-height:min(calc(var(--wf-vh, 100vh) - 190px), calc(var(--wf-vh, 100vh) * .44)); overflow:auto; }
  html.wf-narrow.wf-touch[data-wf-mode="field"] .wf-dock { max-height:min(calc(var(--wf-vh, 100vh) - 290px), calc(var(--wf-vh, 100vh) * .38)); }
  html.wf-narrow[data-wf-mode="field"] #read { display:none; }   /* the Flight panel's title line carries the same numbers */
  html.wf-narrow .wf-dock .wf-panel { position:static !important; width:auto !important; max-width:none; max-height:none !important; }
  html.wf-narrow .wf-dock .wf-head { cursor:pointer; }
  html.wf-narrow .wf-bar2 { left:8px; right:8px; transform:none; bottom:10px; animation:none; }
  html.wf-narrow .wf-toast { top:auto; bottom:84px; border-radius:12px; } html.wf-narrow .wf-cards { grid-template-columns:1fr; }
  .wf-ico { all:unset; cursor:pointer; width:28px; height:28px; display:none; place-items:center; flex:none; box-sizing:border-box; border:1px solid var(--line); border-radius:999px; background:var(--panel); color:var(--ink);
    transition:color .15s, border-color .15s, box-shadow .2s, transform .16s var(--wf-ease); }
  .wf-ico svg { width:15px; height:15px; transition:transform .45s var(--wf-spring); } .wf-ico:hover { border-color:var(--dim); } .wf-ico:active { transform:scale(.9); }
  .wf-ico[aria-pressed="true"] { color:var(--accent); border-color:var(--accent); box-shadow:0 0 0 1px var(--accent) inset; } .wf-ico.spin svg { transform:rotate(90deg); }
  html.wf-phone .wf-ico.wf-phone-only, html.wf-pland .wf-ico.wf-pland-only { display:grid; }
  html.wf-phone #spin span { display:none; } html.wf-phone #spin { padding:0 8px; } html.wf-phone .swatches button { width:20px; height:20px; }
  /* a phone on its side: one slim header row, the panels in a drawer from the right, the picture left whole */
  html.wf-pland #top { top:8px; left:12px; right:12px; } html.wf-pland .swatches { display:none; }
  html.wf-pland .wf-modes { top:8px; padding:2px; } html.wf-pland .wf-modes button { padding:5px 9px; gap:5px; } html.wf-pland .wf-modes button small, html.wf-pland .wf-modes button:not(.on) span { display:none; }
  html.wf-pland .wf-dock { display:flex; flex-direction:column; gap:6px; position:fixed; z-index:8; top:46px; right:8px; bottom:8px; width:min(330px, calc(var(--wf-vw, 100vw) * .46)); overflow:auto; overscroll-behavior:contain;
    transform:translateX(calc(100% + 16px)); visibility:hidden; transition:transform .32s var(--wf-ease), visibility 0s .32s; }
  html.wf-pland .wf-dock.open { transform:none; visibility:visible; transition:transform .32s var(--wf-ease); }
  html.wf-pland .wf-dock .wf-panel { position:static !important; width:auto !important; max-width:none; max-height:none !important; } html.wf-pland .wf-dock .wf-head { cursor:pointer; }
  html.wf-pland .wf-bar2 { left:8px; right:8px; transform:none; bottom:8px; padding:5px 8px; gap:8px; animation:none; transition:right .32s var(--wf-ease); flex-wrap:nowrap; justify-content:flex-start; overflow-x:auto; }
  html.wf-pland .wf-bar2 .wf-div { display:block; }
  html.wf-pland .wf-dock.open ~ .wf-bar2 { right:calc(min(330px, calc(var(--wf-vw, 100vw) * .46)) + 16px); }   /* the bar stays clear of an open drawer */
  html.wf-pland .wf-toast { top:46px; } html.wf-pland .wf-intro > div { padding:14px; }
  html.wf-pland .wf-stick { left:16px; bottom:16px; width:104px; height:104px; } html.wf-pland .wf-thr { right:16px; bottom:16px; height:118px; }
  html.wf-pland[data-wf-mode="field"] #read { left:50%; right:auto; bottom:12px; transform:translateX(-50%); text-align:center; max-width:calc(var(--wf-vw, 100vw) - 300px); font-size:11px; }
  /* full view, where the browser can't go full screen: just the picture and the flying controls */
  html.wf-immersive #top, html.wf-immersive .wf-modes, html.wf-immersive .wf-dock, html.wf-immersive .wf-panel, html.wf-immersive .wf-bar2, html.wf-immersive .wf-labels { display:none !important; }
  .wf-ico.wf-exitfs { position:fixed; z-index:9; top:10px; right:10px; } html.wf-immersive .wf-ico.wf-exitfs { display:grid; }
  @media (prefers-reduced-motion: reduce) { .wf-panel, .wf-panel *, .wf-toast, .wf-tip, .wf-menu, .wf-label, .wf-fxlabel, .wf-stick i, .wf-modes, .wf-modes *, .wf-bar2, .wf-intro, .wf-intro * { animation:none !important; transition:none !important; } }`;

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const ui = {};
  // panels: which views each belongs to (workshop-demo = the workshop with a demo open), and where it starts
  const PANELS = {
    parts:   { title: 'Components', w: '17em', views: ['workshop', 'workshop-demo'], def: { left: 16, top: 64 } },
    insp:    { title: 'Inspector', w: '22em', views: ['workshop'], def: { right: 16, top: 64 } },
    mech:    { title: 'How it works', w: '23em', views: ['workshop-demo'], def: { right: 16, top: 64 } },
    lessons: { title: 'Lessons', w: '21em', views: ['tunnel'], def: { left: 16, top: 64 } },
    lab:     { title: 'Wind tunnel', w: '20em', views: ['tunnel'], def: { right: 16, top: 64 } },
    hud:     { title: 'Flight', w: '17.5em', views: ['field'], def: { left: 16, top: 64 } },
    ctl:     { title: 'Controls', w: '19em', views: ['field'], def: { right: 16, top: 64 } },
  };
  const viewTag = () => mode === 'workshop' && WS.demo ? 'workshop-demo' : mode;
  const SCR = WF_SCREEN, HTML = document.documentElement;
  // layout classes come from WF_SCREEN: they follow the page's own (possibly turned) size, which width media queries can't see
  const narrow = { get matches() { return HTML.classList.contains('wf-narrow'); }, addEventListener: (t, f) => SCR.onChange(f) };
  const pland = () => HTML.classList.contains('wf-pland');           // a phone on its side: the panels live in a drawer
  const docked = () => narrow.matches || pland();                     // panels stacked in the dock rather than floating
  function panel(id) {
    const cfg = PANELS[id], st = S.panels[id] = S.panels[id] || {};
    const p = el('div', 'wf-panel away'); p.id = 'wf-' + id; p.style.setProperty('--w', cfg.w);
    const head = el('div', 'wf-head', `<b>${cfg.title}</b><span class="wf-sum"></span><span class="sp"></span><button title="Fold" data-a="fold">▾</button><button title="Hide (the ☰ UI menu brings it back)" data-a="hide">×</button>`);
    const fold = el('div', 'wf-fold'), inner = el('div'), body = el('div', 'wf-body'); inner.appendChild(body); fold.appendChild(inner); p.append(head, fold);
    const U = { p, body, head, st, id };
    U.place = () => { if (docked()) return; p.style.left = p.style.right = p.style.top = p.style.bottom = '';
      const pos = U.st.pos || { ...cfg.def, top: TOP }; for (const k of ['left', 'right', 'top', 'bottom']) if (pos[k] != null) p.style[k] = pos[k] + 'px';
      if (U.st.pos) { const r = SCR.rect(p); p.style.left = clamp(r.left, 0, innerWidth - 60) + 'px'; p.style.top = clamp(r.top, 52, innerHeight - 40) + 'px'; } };
    U.fold = v => { U.st.collapsed = v; p.classList.toggle('collapsed', v); save(); setTimeout(layout, 320); };
    head.addEventListener('click', e => { const a = e.target.closest('button')?.dataset.a; if (a === 'fold') U.fold(!U.st.collapsed); if (a === 'hide') { U.st.hidden = true; p.classList.add('off'); save(); syncMenu(); } if (!a && docked()) U.fold(!U.st.collapsed); });
    head.addEventListener('dblclick', e => { if (e.target.closest('button') || docked()) return; U.st.pos = null; U.place(); layout(); save(); });
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || docked()) return;
      const r = SCR.rect(p), q0 = SCR.pt(e), dx = q0.x - r.left, dy = q0.y - r.top; head.setPointerCapture(e.pointerId); p.classList.add('dragging');
      const mv = ev => { const q = SCR.pt(ev), x = clamp(q.x - dx, 0, innerWidth - r.width), y = clamp(q.y - dy, 0, innerHeight - 36); p.style.right = p.style.bottom = ''; p.style.left = x + 'px'; p.style.top = y + 'px'; U.st.pos = { left: x, top: y }; };
      const up = () => { head.removeEventListener('pointermove', mv); head.removeEventListener('pointerup', up); p.classList.remove('dragging'); save(); };
      head.addEventListener('pointermove', mv); head.addEventListener('pointerup', up);
    });
    if (st.collapsed == null && (narrow.matches || innerWidth < 1000) && cfg.def.left != null) st.collapsed = true;   // small screens: the left column starts folded
    p.classList.toggle('collapsed', !!st.collapsed); if (st.hidden) p.classList.add('off');
    ui[id] = U; return p;
  }
  let TOP = 64;                                                      // panels start below the top bar and the mode switcher
  function layout() {
    if (!ui.parts) return;
    const tag = viewTag();
    if (ui.modes && !narrow.matches) TOP = Math.max(64, Math.round(SCR.rect(ui.modes).bottom + 10));
    if (ui.modes && narrow.matches) {   // phone: the header wraps onto two rows; the mode switcher and the panels go under both
      const hb = Math.round(SCR.rect(document.getElementById('top')).bottom), de = document.documentElement.style;
      de.setProperty('--wf-mtop', hb + 8 + 'px'); de.setProperty('--wf-dtop', hb + 52 + 'px');
    }
    document.documentElement.style.setProperty('--wf-top', TOP + 'px');   // toasts drop in under the mode switcher
    for (const [id, cfg] of Object.entries(PANELS)) ui[id].p.classList.toggle('away', !cfg.views.includes(tag));
    if (ui.wbar) ui.wbar.classList.toggle('away', mode !== 'workshop');
    if (!docked()) for (const id of Object.keys(PANELS)) { ui[id].place(); ui[id].p.style.maxHeight = (innerHeight - TOP - (mode === 'workshop' ? 90 : 40)) + 'px'; }
    moveIndicators();
  }

  // controls
  const seg = (opts, cur, fn) => {
    const s = el('div', 'wf-seg'), ind = el('span', 'wf-ind'); s.appendChild(ind);
    opts.forEach(([v, label]) => { const b = el('button', '', label); b.dataset.v = String(v); b.addEventListener('click', () => { fn(v); b.blur(); }); s.appendChild(b); });
    s.sync = () => { let on = null; s.querySelectorAll('button').forEach(b => { const x = b.dataset.v === String(cur()); b.classList.toggle('on', x); if (x) on = b; });
      if (on && on.offsetWidth) { ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px'; } else if (!on) ind.style.width = '0'; };
    return s;
  };
  const btn = (label, fn, kbd = '', cls = '') => { const b = el('button', 'wf-btn ' + cls, label + (kbd ? `<kbd>${kbd}</kbd>` : '')); b.addEventListener('click', () => { fn(); b.blur(); }); return b; };
  const hold = (label, down, upFn) => { const b = el('button', 'wf-btn', label); b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('on'); down(); }); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { b.classList.remove('on'); upFn(); }); return b; };
  // live readouts: touch only the text that changed, so nothing is rebuilt, re-animated or deselected every frame
  const liveTpl = document.createElement('template');
  const patchKids = (a, b) => {
    if (a.childNodes.length !== b.childNodes.length) return false;
    for (let i = 0; i < a.childNodes.length; i++) {
      const x = a.childNodes[i], y = b.childNodes[i];
      if (x.nodeName !== y.nodeName) return false;
      if (x.nodeType === 3) { if (x.data !== y.data) x.data = y.data; }
      else if (x.nodeType === 1 && (x.getAttribute('class') !== y.getAttribute('class') || x.getAttribute('style') !== y.getAttribute('style') || !patchKids(x, y))) return false;
    }
    return true;
  };
  const setLive = (el, html) => {
    if (el._html === html) return; el._html = html; liveTpl.innerHTML = html;
    if (!patchKids(el, liveTpl.content)) el.replaceChildren(...liveTpl.content.childNodes);
  };
  const slider = (label, min, max, step, get, set, fmt) => {
    const w = el('label', 'wf-sec'), l = el('span', 'wf-lbl', `<span>${label}</span><output></output>`), i = el('input', 'wf-r'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = get();
    const out = l.querySelector('output'), fill = () => i.style.setProperty('--p', ((+i.value - min) / (max - min) * 100) + '%');
    i.addEventListener('input', () => { set(+i.value); out.textContent = fmt(+i.value); fill(); });
    i.addEventListener('change', () => i.blur()); i.addEventListener('pointerup', () => i.blur());
    w.append(l, i); w.sync = () => { if (document.activeElement !== i) i.value = get(); out.textContent = fmt(get()); fill(); }; return w;
  };
  const toggleBtn = (label, get, set, kbd) => { const b = btn(label, () => { set(!get()); syncUI(); }, kbd); b.sync = () => b.classList.toggle('on', !!get()); return b; };
  const sec = (title, ...kids) => { const s = el('div', 'wf-sec'); s.appendChild(el('div', 'wf-lbl', title)); kids.forEach(k => s.appendChild(k)); return s; };
  const row = (...kids) => { const r = el('div', 'wf-row'); kids.forEach(k => r.appendChild(k)); return r; };
  const syncers = [], sync = x => { syncers.push(x); return x; };
  const ICON = {
    workshop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
    tunnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/></svg>',
    field: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9h20M2 13h20M7 9v4M12 9v4M17 9v4"/><path d="M12 13l-1 5h2z"/></svg>',
  };

  function buildUI() {
    document.head.appendChild(el('style', null, css));
    document.documentElement.dataset.wfSize = S.size;
    const coarse = matchMedia('(pointer: coarse)'), setTouch = () => document.documentElement.classList.toggle('wf-touch', coarse.matches || narrow.matches);
    setTouch(); coarse.addEventListener('change', setTouch); narrow.addEventListener('change', setTouch);
    ui.fade = el('div', 'wf-fade'); document.body.appendChild(ui.fade);
    document.body.appendChild(el('div', 'wf-credit', 'Created by Shasidhar Kanchu'));   // a quiet credit on every mode
    const modes = el('div', 'wf-modes'), mind = el('span', 'wf-ind'); modes.appendChild(mind); ui.modes = modes; ui.mind = mind;
    Object.entries(MODES).forEach(([k, m], i) => { const b = el('button', '', `${ICON[k]}<span>${m.name}</span><small>${m.sub}</small>`); b.dataset.m = k; b.title = `${m.name}: ${m.sub} (${i + 1})`; b.addEventListener('click', () => { setMode(k); b.blur(); }); modes.appendChild(b); });
    document.body.appendChild(modes);
    const dock = el('div', 'wf-dock'); document.body.appendChild(dock); ui.dock = dock;
    const all = Object.keys(PANELS).map(panel); all.forEach(p => document.body.appendChild(p));
    const relayout = () => { all.forEach(p => (docked() ? dock : document.body).appendChild(p)); if (!pland()) dock.classList.remove('open'); layout(); syncUI(); syncScreenBtns(); };
    narrow.addEventListener('change', relayout); addEventListener('resize', () => { layout(); syncUI(); }); relayout();
    let wasLand = innerWidth > innerHeight;                            // turned the other way: frame the subject again
    SCR.onChange(() => { const land = innerWidth > innerHeight; if (land !== wasLand) { wasLand = land; setTimeout(refit, 80); } });
    buildWorkshopUI(); buildTunnelUI(); buildFieldUI();
    ui.toast = el('div', 'wf-toast'); ui.tip = el('div', 'wf-tip'); ui.labels = el('div', 'wf-labels'); document.body.append(ui.toast, ui.tip, ui.labels);
    buildTouch(); buildMenu(); pointerNav();
    syncUI(); layout(); setTimeout(() => { layout(); syncUI(); }, 500);
  }

  // ── workshop UI: the component list, the inspector, the mechanism panel and the view bar ──
  const GROUPS = [['Structure', ['upperWing', 'lowerWing', 'struts', 'skids']], ['Controls', ['elevator', 'rudder', 'cradle']], ['Powerplant', ['engine', 'radiator', 'tank']],
    ['Propulsion', ['chains', 'propL', 'propR']], ['Crew and instruments', ['pilot', 'anemometer']]];
  function buildWorkshopUI() {
    const list = el('div', 'wf-list');
    GROUPS.forEach(([g, keys]) => { list.appendChild(el('div', 'wf-group', g)); keys.forEach(k => {
      const it = el('div', 'wf-item'); it.dataset.k = k; const name = el('button', '', INFO.parts[k].name), go = el('button', 'wf-go', '▶ how'); go.title = 'See how it works';
      name.addEventListener('click', () => { if (WS.demo) enterDemo(k); else select('part', k); }); go.addEventListener('click', e => { e.stopPropagation(); enterDemo(k); });
      it.append(name, go); list.appendChild(it); }); });
    ui.parts.body.append(el('div', 'wf-empty', 'Select a part to read about it, or ▶ to see it working on its own.'), list);
    const bar = el('div', 'wf-bar2 away'); ui.wbar = bar;
    const ex = sync(slider('Exploded <kbd style="opacity:.5">E</kbd>', 0, 1, 0.01, () => WS.explode, v => { if (WS.demo) exitDemo(); WS.explode = v; syncUI(); }, pct));
    const xr = sync(slider('See-through <kbd style="opacity:.5">X</kbd>', 0, 1, 0.01, () => WS.xray, v => { if (WS.demo) exitDemo(); WS.xray = v; refreshMats(); }, pct));
    const views = sync(seg([['front', 'Front'], ['side', 'Side'], ['top', 'Top'], ['threeq', '¾']], () => WS.view, v => { WS.view = v; viewPreset(v); syncUI(); }));
    const spin = sync(toggleBtn('Turntable', () => S.spin, v => { S.spin = v; save(); }, 'R')), eng = sync(toggleBtn('Run engine', () => WS.engine, v => { WS.engine = v; })), lab = sync(toggleBtn('Labels', () => S.labels, v => { S.labels = v; save(); }, 'G'));
    const back = btn('← Back to the whole Flyer', () => exitDemo(), 'esc', 'primary');
    const play = btn('Pause', () => { WS.playing = !WS.playing; syncUI(); });
    const d1 = el('div', 'wf-div'), d2 = el('div', 'wf-div');
    bar.append(back, play, ex, xr, d1, views, d2, spin, eng, lab);
    bar.sync = () => { const d = !!WS.demo; back.style.display = play.style.display = d ? '' : 'none'; play.innerHTML = (WS.playing ? 'Pause' : 'Play') + '<kbd>space</kbd>';
      for (const x of [ex, xr, d1, spin, eng]) x.style.display = d ? 'none' : ''; };
    syncers.push(bar); document.body.appendChild(bar);
    renderInspector();
  }
  function syncParts() { if (!ui.parts) return; ui.parts.body.querySelectorAll('.wf-item').forEach(it => it.classList.toggle('on', WS.demo ? WS.demo.key === it.dataset.k : !!(WS.sel && WS.sel.key === it.dataset.k))); }
  function renderInspector() {
    if (!ui.insp) return; const body = ui.insp.body;
    if (!WS.sel) { body.innerHTML = `<div class="wf-card wf-empty"><p>Click any part of the Flyer to read about it. Double-click it, or press ▶ in the list, to see it working on its own.</p>
      <p>Slide <b style="color:var(--ink)">Exploded</b> to take the Flyer apart and <b style="color:var(--ink)">See-through</b> to look inside the wings. Drag to orbit, scroll to zoom.</p></div>`; ui.insp.head.querySelector('.wf-sum').textContent = ''; return; }
    const info = INFO.parts[WS.sel.key];
    body.innerHTML = `<div class="wf-card"><div class="wf-chips"><span class="wf-chip hot">${info.cat}</span></div><h3>${info.name}</h3><p>${info.text}</p>
      <table class="wf-specs">${info.specs.map(([a, v], i) => `<tr style="animation-delay:${0.05 + i * 0.04}s"><td>${a}</td><td>${v}</td></tr>`).join('')}</table>
      ${info.fact ? `<div class="wf-fact">${info.fact}</div>` : ''}<div class="wf-row" id="wf-cardbtns"></div></div>`;
    body.querySelector('#wf-cardbtns').append(btn('▶ How it works', () => enterDemo(WS.sel.key), 'enter', 'primary'), btn('Deselect', () => select(null), 'esc'));
    ui.insp.head.querySelector('.wf-sum').textContent = info.name;
    if (ui.insp.st.collapsed) ui.insp.fold(false);
  }
  function renderMech() {
    const D = WS.demo; if (!D || !ui.mech) return; const body = ui.mech.body, st = D.how.steps[D.step];
    body.innerHTML = `<div class="wf-card"><div class="wf-chips"><span class="wf-chip hot">${INFO.parts[D.key].name}</span><span class="wf-chip">step ${D.step + 1} of ${D.how.steps.length}</span></div><h3>${D.how.title}</h3>
      <div class="wf-steps">${D.how.steps.map((s, i) => `<button data-s="${i}" class="${i === D.step ? 'on' : i < D.step ? 'done' : ''}" title="${s[0]}">${i + 1}</button>`).join('')}</div>
      <div class="wf-step"><h4>${st[0]}</h4><p>${st[1]}</p></div>
      <div class="wf-row"><button class="wf-btn" data-a="prev">← Previous</button><button class="wf-btn primary" data-a="next">${D.step < D.how.steps.length - 1 ? 'Next →' : 'Done ✓'}</button></div>
      <div class="wf-sec" id="wf-dctl"></div><div class="wf-readout" id="wf-readout"></div></div>`;
    body.querySelectorAll('[data-s]').forEach(b => b.addEventListener('click', () => setStep(+b.dataset.s)));
    body.querySelector('[data-a=prev]').addEventListener('click', () => setStep(D.step - 1));
    body.querySelector('[data-a=next]').addEventListener('click', () => { if (D.step < D.how.steps.length - 1) setStep(D.step + 1); else exitDemo(); });
    const c = body.querySelector('#wf-dctl'), tg = [];
    D.def.controls.forEach(ct => { if (ct.toggle) { const b = toggleBtn(ct.label, () => D.v[ct.id], v => { D.v[ct.id] = v; }); b.sync(); b.addEventListener('click', () => b.sync()); tg.push(b); }
      else { const s = slider(ct.label, ct.min, ct.max, ct.step, () => D.v[ct.id], v => { D.v[ct.id] = v; }, ct.fmt); s.sync(); c.appendChild(s); } });
    if (D.context.length && !D.def.forceContext) { const b = toggleBtn('Parts around it', () => WS.context, v => { WS.context = v; refreshMats(); }); b.sync(); b.addEventListener('click', () => b.sync()); tg.push(b); }
    if (tg.length) c.appendChild(row(...tg));
    const ro = body.querySelector('#wf-readout'); if (D.def.readout) setLive(ro, D.def.readout(D)); else ro.remove();
    ui.mech.head.querySelector('.wf-sum').textContent = D.how.title;
    if (ui.mech.st.collapsed) ui.mech.fold(false);
    syncParts();
  }

  // ── wind tunnel UI: lessons, and the tunnel's settings, readouts and the lift curve ──
  function buildTunnelUI() {
    ui.lessons.body.innerHTML = '<div id="wf-lesson"></div>';
    const b = ui.lab.body;
    b.append(
      sec('Wing', sync(seg([[false, 'Cambered'], [true, 'Flat plate']], () => TV.flat, v => { TV.flat = v; syncUI(); }))),
      sync(slider('Airspeed <kbd style="opacity:.5">W / S</kbd>', 0, 50, 1, () => TV.mph, v => { TV.mph = v; LS.playing = false; }, v => S.units === 'metric' ? `${Math.round(v * 1.609)} km/h` : `${Math.round(v)} mph`)),
      sync(slider('Angle of attack <kbd style="opacity:.5">↑ ↓</kbd>', -6, 24, 0.5, () => TV.aoa, v => { TV.aoa = v; LS.playing = false; }, v => v.toFixed(1) + '°')),
      sync(slider('Throttle', 0, 1, 0.01, () => TV.thr, v => { TV.thr = v; LS.playing = false; }, pct)),
      sync(slider('Bank', -40, 40, 1, () => TV.bank, v => { TV.bank = v; LS.playing = false; }, v => Math.round(v) + '°')),
      sync(slider('Wing warping', -1, 1, 0.01, () => TV.warp, v => { TV.warp = v; LS.playing = false; }, v => (v > 0.01 ? 'roll right ' : v < -0.01 ? 'roll left ' : '') + Math.abs(Math.round(v * 100)) + '%')),
      row(sync(toggleBtn('Rudder link', () => TV.link, v => { TV.link = v; })), sync(toggleBtn('Smoke', () => TV.smoke, v => { TV.smoke = v; }))),
      el('div', 'wf-grid', ['lift', 'weight', 'thrust', 'drag'].map(k => `<div class="wf-stat"><small><i style="--c:${FX.css(k)}"></i>${k}</small><span id="wf-f-${k}">0</span></div>`).join('') +
        '<div class="wf-stat"><small>Lift / drag</small><span id="wf-f-ld">0</span></div><div class="wf-stat"><small>Lift − weight</small><span id="wf-f-net">0</span></div>'),
      el('canvas', 'wf-chart'), el('div', 'wf-eq', ''));
    ui.chart = b.querySelector('canvas'); ui.eq = b.querySelector('.wf-eq');
  }
  function renderLessons() {
    const host = document.getElementById('wf-lesson'); if (!host) return;
    const L = WF_LESSONS[LS.i];
    host.innerHTML = `<div class="wf-card"><div class="wf-steps">${WF_LESSONS.map((l, i) => `<button data-l="${i}" class="${i === LS.i ? 'on' : i < LS.i ? 'done' : ''}" title="${l.title}">${i + 1}</button>`).join('')}</div>
      <div class="wf-step"><h4>${LS.i + 1}. ${L.title}</h4><p>${L.text}</p></div>
      ${L.goal ? `<div class="wf-chips"><span class="wf-chip" id="wf-goal">lift ≠ weight yet</span></div>` : ''}
      ${L.sweep ? `<div class="wf-row"><button class="wf-btn" data-a="play"></button></div>` : ''}
      <div class="wf-row"><button class="wf-btn" data-a="prev">← Previous</button><button class="wf-btn primary" data-a="next">${LS.i < WF_LESSONS.length - 1 ? 'Next lesson →' : 'Fly it at Kitty Hawk →'}</button></div>
      <div class="wf-empty">Arrows: <span style="color:${FX.css('lift')}">lift</span>, <span style="color:${FX.css('weight')}">weight</span>, <span style="color:${FX.css('thrust')}">thrust</span>, <span style="color:${FX.css('drag')}">drag</span>. Drag to orbit; ← → change lesson.</div></div>`;
    host.querySelectorAll('[data-l]').forEach(b => b.addEventListener('click', () => lesson(+b.dataset.l)));
    host.querySelector('[data-a=prev]').addEventListener('click', () => lesson(LS.i - 1));
    host.querySelector('[data-a=next]').addEventListener('click', () => { if (LS.i < WF_LESSONS.length - 1) lesson(LS.i + 1); else setMode('field'); });
    const pb = host.querySelector('[data-a=play]'); if (pb) pb.addEventListener('click', () => { LS.playing = !LS.playing; syncUI(); });
    if (ui.lessons) { ui.lessons.head.querySelector('.wf-sum').textContent = `${LS.i + 1}. ${L.title}`; if (ui.lessons.st.collapsed && !docked()) ui.lessons.fold(false); }
    syncPlay();
  }
  const syncPlay = () => { const p = document.querySelector('#wf-lesson [data-a=play]'); if (p) p.innerHTML = (LS.playing ? 'Pause the sweep' : '▶ Play the sweep') + '<kbd>space</kbd>'; };
  function drawChart() {
    const c = ui.chart; if (!c || mode !== 'tunnel' || !tunnelF) return;
    const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight; if (!w) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
    const cs = getComputedStyle(document.documentElement), dim = cs.getPropertyValue('--dim'), line = cs.getPropertyValue('--line'), acc = cs.getPropertyValue('--accent');
    const A0 = -6, A1 = 24, C0 = -0.4, C1 = 1.4, D1 = 0.7, pl = 26, pr = 26, pt = 14, pb = 18;
    const X = a => pl + (a - A0) / (A1 - A0) * (w - pl - pr), Y = cl => pt + (C1 - cl) / (C1 - C0) * (h - pt - pb), YD = cd => pt + (1 - cd / D1) * (h - pt - pb);
    x.strokeStyle = line; x.lineWidth = 1; x.font = '9.5px ui-monospace, monospace'; x.fillStyle = dim;
    for (let a = -5; a <= 20; a += 5) { x.beginPath(); x.moveTo(X(a), pt); x.lineTo(X(a), h - pb); x.stroke(); x.fillText(a + '°', X(a) - 6, h - 5); }
    for (const cl of [0, 0.5, 1]) { x.beginPath(); x.moveTo(pl, Y(cl)); x.lineTo(w - pr, Y(cl)); x.stroke(); x.fillText(cl.toFixed(1), 3, Y(cl) + 3); }
    const curve = (fn, col, dash = []) => { x.strokeStyle = col; x.setLineDash(dash); x.lineWidth = 1.6; x.beginPath(); for (let a = A0; a <= A1 + 1e-6; a += 0.25) { const p = fn(a * Math.PI / 180); a === A0 ? x.moveTo(X(a), p) : x.lineTo(X(a), p); } x.stroke(); x.setLineDash([]); };
    const m = TUN.M;
    curve(a => Y(PH.CL(a, m, !TV.flat)), dim, [3, 3]);
    curve(a => Y(PH.CL(a, m, TV.flat)), FX.css('lift'));
    curve(a => YD(PH.CD(a, PH.CL(a, m, TV.flat), m)), FX.css('drag'));
    const sa = (TV.flat ? m.aStall - 0.05 : m.aStall) * 57.3;
    x.strokeStyle = acc; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(X(sa), pt); x.lineTo(X(sa), h - pb); x.stroke(); x.setLineDash([]); x.fillStyle = acc; x.fillText('stall', X(sa) + 3, pt + 8);
    x.fillStyle = FX.css('lift'); x.beginPath(); x.arc(X(TV.aoa), Y(tunnelF.cl), 4.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = FX.css('drag'); x.beginPath(); x.arc(X(TV.aoa), YD(tunnelF.cd), 3.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = FX.css('lift'); x.fillText(`lift (${TV.flat ? 'flat' : 'cambered'}), dashed: ${TV.flat ? 'cambered' : 'flat'}`, pl + 3, 10); x.fillStyle = FX.css('drag'); x.fillText('drag', w - pr + 2, YD(0.12));
  }

  // ── Kitty Hawk UI: the flight panel (with an attitude indicator) and the controls ──
  function buildFieldUI() {
    ui.hud.body.innerHTML = `
      <div class="wf-chips"><span class="wf-chip" id="wf-state">parked</span><span class="wf-chip warn" id="wf-stall" style="display:none">stall</span><span class="wf-chip" id="wf-auto" style="display:none">autopilot</span></div>
      <div class="wf-att"><canvas id="wf-attc" width="184" height="184"></canvas><div class="wf-grid" style="flex:1; grid-template-columns:1fr">
        <div class="wf-stat big"><small>Airspeed</small><span id="wf-as">0</span></div><div class="wf-stat big"><small>Altitude</small><span id="wf-alt">0</span></div></div></div>
      <div class="wf-grid">
        <div class="wf-stat"><small>Ground speed</small><span id="wf-gs">0</span></div><div class="wf-stat"><small>Climb</small><span id="wf-vs">0</span></div>
        <div class="wf-stat"><small>Heading</small><span id="wf-hdg">000°</span></div><div class="wf-stat"><small>Angle of attack</small><span id="wf-aoa">0°</span></div>
        <div class="wf-stat"><small>Wind</small><span id="wf-wind">calm</span></div><div class="wf-stat"><small>Lift / weight</small><span id="wf-lw">0</span></div>
      </div>
      <div class="wf-sec"><div class="wf-lbl"><span>Throttle <span style="opacity:.6">W / S</span></span><output id="wf-thr">0%</output></div><div class="wf-bar" id="wf-thrbar"><i></i><b></b></div></div>
      <div class="wf-sec"><div class="wf-lbl">Now</div><div id="wf-now" class="wf-empty"></div></div>
      <div class="wf-sec"><div class="wf-lbl">Flight log</div><div class="wf-log" id="wf-log"></div></div>`;
    ui.hud.body.appendChild(sync(seg([['imperial', 'mph · ft'], ['metric', 'km/h · m']], () => S.units, v => { S.units = v; save(); syncUI(); })));
    const b = ui.ctl.body;
    const back = btn('Walk back to the Flyer', () => { PH.origin(fl, v2); walker.pos.set(v2.x + 1.5, 0, v2.z - 2.4); walker.goal = null; }); back.id = 'wf-wback';
    b.appendChild(sec('Mode <span style="opacity:.6">V</span>', sync(seg([[false, 'Fly'], [true, 'On foot']], () => FL.walk, v => setWalk(v))), back));
    const iso = sync(btn('Iso', () => { if (FL.cam !== 'follow' && FL.cam !== 'free') setCam('follow'); act.iso(); syncUI(); })); iso.sync = () => iso.classList.toggle('on', camera === ortho);
    b.appendChild(sec('Camera <span style="opacity:.6">C · B behind</span>', sync(seg(CAMS.map(c => [c, CAMNAME[c]]), () => FL.cam, v => setCam(v))), row(iso, btn('Behind', behind, 'B'), sync(toggleBtn('Auto-align', () => S.align, v => { S.align = v; save(); })))));
    b.appendChild(sec('Flight', sync(seg(Object.entries(PH.MODELS).map(([k, m]) => [k, m.name]), () => S.model, v => { S.model = v; save(); syncUI(); toast(v === 'historic' ? 'Historic: the real Flyer\'s numbers; skids drag in sand, little power to spare' : 'Arcade: more power, a gentler stall, wings settle level'); })),
      ui.thrS = sync(slider('Throttle <span style="opacity:.6">W / S</span>', 0, 1, 0.01, () => FL.thr, v => { FL.thr = v; }, pct)),
      sync(slider('Wind from the north', 0, 30, 1, () => S.wind, v => { S.wind = v; save(); }, v => S.units === 'metric' ? `${Math.round(v * 1.609)} km/h` : `${v} mph`)),
      row(sync(toggleBtn('Autopilot', () => FL.auto, v => { FL.auto = v; }, 'space')), sync(toggleBtn('Gusts', () => S.gusts, v => { S.gusts = v; save(); })), btn('Reset', resetToRail, '0')),
      row(hold('▲ Climb', () => held.add('climb'), () => held.delete('climb')), hold('▼ Dive', () => held.add('dive'), () => held.delete('dive')), sync(toggleBtn('Invert', () => S.invert, v => { S.invert = v; save(); })))));
    b.appendChild(sec('Show', row(sync(toggleBtn('Forces', () => S.forces, v => { S.forces = v; save(); }, 'O')), sync(toggleBtn('Flight path', () => S.trail, v => { S.trail = v; save(); }, 'P')), sync(toggleBtn('Labels', () => S.labels, v => { S.labels = v; save(); }, 'G')))));
    b.appendChild(sec('Keys', el('div', 'wf-keys', '<kbd>W / S</kbd><span>throttle</span><kbd>A / D</kbd><span>warp the wings: bank and turn</span><kbd>↑ / ↓</kbd><span>elevator: nose up, nose down</span><kbd>Shift</kbd><span>full power</span><kbd>Space</kbd><span>autopilot</span><kbd>Click sand</kbd><span>fly there</span><kbd>V</kbd><span>walk / climb aboard</span>')));
    b.appendChild(sec('Sound', row(sync(toggleBtn('Engine sound', () => S.sound, v => { S.sound = v; save(); })))));
  }
  let lastState = '', lastLog = -1;
  function fieldPanel() {
    const $ = id => document.getElementById(id), s = fl; if (!$('wf-as')) return;
    PH.origin(s, v2); const agl = v2.y - W.ground(v2.x, v2.z), att = PH.attitude(s), gs = Math.hypot(s.vel.x, s.vel.z);
    const state = FL.walk ? 'on foot' : !s.ground ? (s.stalled ? 'stalling' : 'flying') : W.onRail(v2.x, v2.z) ? (gs > 0.1 ? 'on the rail' : 'on the truck') : gs > 0.1 ? 'skidding' : 'parked';
    const se = $('wf-state'); if (state !== lastState) { se.textContent = state; se.classList.remove('bump'); void se.offsetWidth; se.classList.add('bump'); lastState = state; } se.classList.toggle('hot', !s.ground);
    $('wf-stall').style.display = !s.ground && s.alpha > PH.MODELS[S.model].aStall * 0.9 ? '' : 'none';
    $('wf-auto').style.display = FL.auto || FL.way ? '' : 'none'; $('wf-auto').textContent = FL.way ? 'to the mark' : 'autopilot';
    $('wf-as').textContent = fmtSpeed(s.V); $('wf-alt').textContent = fmtLen(Math.max(0, agl)); $('wf-gs').textContent = fmtSpeed(FL.walk ? walker.v : gs);
    $('wf-vs').textContent = S.units === 'metric' ? (s.vel.y / K).toFixed(1) + ' m/s' : Math.round(s.vel.y / K * 196.85) + ' ft/min';
    $('wf-hdg').textContent = String(Math.round(((-att.heading * 180 / Math.PI) % 360 + 360) % 360)).padStart(3, '0') + '°';
    $('wf-aoa').textContent = (s.alpha * 57.3).toFixed(1) + '°'; $('wf-lw').textContent = (Math.max(0, s.fL.y) / PH.G).toFixed(2);
    $('wf-wind').textContent = S.wind ? (S.units === 'metric' ? `${Math.round(S.wind * 1.609)} km/h N` : `${S.wind} mph N`) + (S.gusts ? ' gusty' : '') : 'calm';
    $('wf-thr').textContent = pct(FL.thr); const bar = $('wf-thrbar'); bar.querySelector('i').style.width = FL.thr * 100 + '%'; bar.querySelector('b').style.left = (held.has('boost') ? 100 : FL.thr * 100) + '%'; bar.classList.toggle('hot', FL.thr > 0.92 || held.has('boost'));
    if (ui.thrS && ui.thrS.v !== FL.thr) { ui.thrS.v = FL.thr; ui.thrS.sync(); }   // W / S move the slider too
    if (ui.thrStrip) { ui.thrStrip.firstChild.style.height = FL.thr * 100 + '%'; ui.thrStrip.lastChild.textContent = pct(FL.thr); }
    ui.hud.head.querySelector('.wf-sum').textContent = FL.walk ? 'on foot' : `${fmtSpeed(s.V)} · ${fmtLen(Math.max(0, agl))}`;
    setLive($('wf-now'), FL.walk ? 'On foot. Walk back and press V to climb aboard.' : !s.ground && FL.rec ? `Flight ${FL.flights} · <b style="color:var(--ink)">${fmtLen(Math.hypot(s.pos.x - FL.rec.x, s.pos.z - FL.rec.z))}</b> · ${((performance.now() - FL.rec.t) / 1000).toFixed(1)} s`
      : s.ground && s.V > 5 ? 'Enough air over the wings: ease back on ↑ to lift off.' : s.ground && FL.thr < 0.05 ? 'Press W to open the throttle and roll down the rail into the wind.' : s.ground ? 'Building speed…' : '');
    if (FL.log.length !== lastLog) { $('wf-log').innerHTML = FL.log.length ? FL.log.map((f, i) => `<span class="${i === 0 ? 'fresh' : ''}"><b>#${f.n}</b> ${fmtLen(f.d)} · ${f.secs.toFixed(1)} s${f.hard ? ' · hard' : ''}</span>`).join('') + '<span>1903 best: 852 ft in 59 s</span>' : '<span>No flights yet. Orville\'s first: 120 ft in 12 s.</span>'; lastLog = FL.log.length; }
    drawAttitude(att);
  }
  function drawAttitude(att) {
    const c = document.getElementById('wf-attc'); if (!c || !c.offsetWidth) return; const x = c.getContext('2d'), w = c.width, h = c.height, r = w / 2 - 6;
    const cs = getComputedStyle(document.documentElement), ink = cs.getPropertyValue('--ink'), dim = cs.getPropertyValue('--dim'), line = cs.getPropertyValue('--line'), acc = cs.getPropertyValue('--accent');
    x.clearRect(0, 0, w, h); x.save(); x.translate(w / 2, h / 2); x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.clip();
    x.rotate(-att.bank); const py = att.pitch * r * 2.2;
    x.globalAlpha = 0.16; x.fillStyle = acc; x.fillRect(-w, py, w * 2, w); x.globalAlpha = 1;
    x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(-w, py); x.lineTo(w, py); x.stroke();
    x.strokeStyle = dim; x.lineWidth = 1.5; for (const d of [-20, -10, 10, 20]) { const y = py - d / 57.3 * r * 2.2; x.beginPath(); x.moveTo(-r * 0.25, y); x.lineTo(r * 0.25, y); x.stroke(); }
    x.restore(); x.save(); x.translate(w / 2, h / 2);
    x.strokeStyle = line; x.lineWidth = 3; x.beginPath(); x.arc(0, 0, r, 0, Math.PI * 2); x.stroke();
    x.strokeStyle = acc; x.lineWidth = 4; x.beginPath(); x.moveTo(-r * 0.55, 0); x.lineTo(-r * 0.15, 0); x.lineTo(0, r * 0.12); x.lineTo(r * 0.15, 0); x.lineTo(r * 0.55, 0); x.stroke();
    x.rotate(-att.bank); x.fillStyle = acc; x.beginPath(); x.moveTo(0, -r + 4); x.lineTo(-7, -r + 18); x.lineTo(7, -r + 18); x.fill(); x.restore();
  }

  // phones and tablets (Kitty Hawk): a stick (warp and elevator, or walking) and a throttle strip
  function buildTouch() {
    const stick = el('div', 'wf-stick', '<i></i>'), knob = stick.firstChild, thr = el('div', 'wf-thr', '<i></i><span>0%</span>');
    document.body.append(stick, thr); ui.thrStrip = thr; let id = null, tid = null;
    const move = e => { const r = SCR.rect(stick), q = SCR.pt(e), R = r.width / 2; let x = (q.x - r.left - R) / R, y = (q.y - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      touch.x = x; touch.y = y; knob.style.transform = `translate(${x * R * 0.62}px, ${y * R * 0.62}px)`; };
    stick.addEventListener('pointerdown', e => { id = e.pointerId; stick.setPointerCapture(id); stick.classList.add('on'); touch.on = true; move(e); e.preventDefault(); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    const end = () => { id = null; touch.on = false; touch.x = touch.y = 0; stick.classList.remove('on'); knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const setT = e => { const r = SCR.rect(thr); FL.thr = clamp(1 - (SCR.pt(e).y - r.top) / r.height, 0, 1); };
    thr.addEventListener('pointerdown', e => { tid = e.pointerId; thr.setPointerCapture(tid); setT(e); e.preventDefault(); });
    thr.addEventListener('pointermove', e => { if (e.pointerId === tid) setT(e); }); thr.addEventListener('pointerup', () => { tid = null; });
  }

  // ── phones: full screen, portrait / landscape, and the panel drawer when the phone is on its side ──
  const SV = d => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const SICON = {
    fsIn: SV('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>'),
    fsOut: SV('<path d="M6 2v4H2M10 2v4h4M14 10h-4v4M2 10h4v4"/>'),
    land: SV('<rect x="1.5" y="5.5" width="13" height="8" rx="1.6"/><path d="M4.5 3.4A6 6 0 0 1 11 2.4"/><path d="M9.6 1.2 11 2.4 9.8 3.8"/>'),
    port: SV('<rect x="5.5" y="1.5" width="8" height="13" rx="1.6"/><path d="M1.6 11.5A6 6 0 0 1 2.6 5"/><path d="M1.2 6.4 2.6 5 3.9 6.2"/>'),
    dock: SV('<rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M10 2.5v11M11.9 5.5h.8M11.9 8h.8M11.9 10.5h.8"/>'),
  };
  function syncScreenBtns() {
    if (!ui.fsBtn) return;
    const full = SCR.isFS() || HTML.classList.contains('wf-immersive'), land = innerWidth > innerHeight;
    ui.fsBtn.innerHTML = full ? SICON.fsOut : SICON.fsIn; ui.fsBtn.title = full ? 'Leave full screen' : 'Full screen'; ui.fsBtn.setAttribute('aria-pressed', full);
    ui.orBtn.innerHTML = land ? SICON.port : SICON.land; ui.orBtn.title = land ? 'Turn to portrait' : 'Turn to landscape'; ui.orBtn.setAttribute('aria-pressed', !!(SCR.turn || SCR.locked));
    ui.dkBtn.innerHTML = SICON.dock; ui.dkBtn.title = 'Panels'; ui.dkBtn.setAttribute('aria-pressed', ui.dock.classList.contains('open'));
    for (const b of [ui.fsBtn, ui.orBtn, ui.dkBtn]) b.setAttribute('aria-label', b.title);
  }
  async function toggleFS() {
    if (HTML.classList.contains('wf-immersive')) return immersive(false);
    if (SCR.canFS) { try { await SCR.fullscreen(!SCR.isFS()); } catch (e) { immersive(true); } } else immersive(true);
    syncScreenBtns();
  }
  // where the browser can't go full screen (an iPhone): full view, only the picture and the flying controls stay
  function immersive(on) {
    HTML.classList.toggle('wf-immersive', on); openDock(false); syncScreenBtns(); layout();
    if (on) toast('Full view · the corner button brings the panels back');
  }
  async function turnView(b) {
    const to = innerWidth > innerHeight ? 'portrait' : 'landscape', name = to === 'landscape' ? 'Landscape' : 'Portrait';
    b.classList.add('spin'); setTimeout(() => b.classList.remove('spin'), 450);
    const r = await SCR.orient(to);
    toast(r === 'locked' ? `${name} · full screen` : r === 'turned' ? `${name} · hold your phone ${to === 'landscape' ? 'on its side' : 'upright'}` : SCR.canTurn ? name : 'Turn your phone to change the view');
    syncScreenBtns();
  }
  function openDock(on) { if (!ui.dock) return; ui.dock.classList.toggle('open', !!on && pland()); syncScreenBtns(); }
  // a part picked or a demo opened on a phone on its side: slide the drawer out at that panel
  const peekDock = id => { if (!pland()) return; openDock(true); const P = ui[id]; if (P) { if (P.st.collapsed) P.fold(false); setTimeout(() => ui.dock.scrollTo({ top: Math.max(0, P.p.offsetTop - 2), behavior: 'smooth' }), 60); } };
  function refit() {                                                   // the screen changed shape: frame the subject again
    layout();
    if (mode === 'workshop') { if (WS.demo) frameDemo(); else viewPreset(WS.view); }
    else if (mode === 'tunnel') tunnelView(tunnelLast);
  }

  // ── the ☰ UI menu: themes, textures, panels, size, layout, the intro ──
  function buildMenu() {
    const menuBtn = el('button', null, '☰ <span>UI</span>'); menuBtn.id = 'wf-ui'; menuBtn.title = 'Themes, panels, size and layout';
    const tops = document.querySelectorAll('#top .tops'), host = tops[tops.length - 1] || document.getElementById('top'); host.prepend(menuBtn);
    const ico = (cls, fn) => { const b = el('button', 'wf-ico ' + cls); b.addEventListener('click', e => { e.stopPropagation(); fn(b); b.blur(); }); return b; };
    ui.fsBtn = ico('wf-phone-only', toggleFS); ui.orBtn = ico('wf-phone-only', turnView); ui.dkBtn = ico('wf-pland-only', () => openDock(!ui.dock.classList.contains('open')));
    host.prepend(ui.dkBtn); host.append(ui.fsBtn, ui.orBtn);
    ui.exitFS = ico('wf-exitfs', () => immersive(false)); ui.exitFS.innerHTML = SICON.fsOut; ui.exitFS.title = 'Leave full view'; ui.exitFS.setAttribute('aria-label', ui.exitFS.title); document.body.appendChild(ui.exitFS);
    SCR.onChange(syncScreenBtns); syncScreenBtns();
    const menu = el('div', 'wf-menu'); document.body.appendChild(menu); ui.menu = menu;
    const hx = n => '#' + n.toString(16).padStart(6, '0');
    menu.innerHTML = `<div class="wf-lbl">Theme</div><div class="wf-themes">${Object.entries(LOOK.THEMES).map(([k, T]) =>
        `<button class="wf-theme" data-theme="${k}"><i><b style="background:${hx(T.bg)}"></b><b style="background:${hx(T.body)}"></b><b style="background:${hx(T.line)}"></b><b style="background:${hx(T.edge)}"></b></i><span>${T.name}</span></button>`).join('')}</div>
      <div id="wf-texs"></div>
      <div class="wf-lbl">Panels</div><label><input type="checkbox" data-allp> Show this mode's panels</label>
      <div class="wf-lbl">Size</div><div id="wf-size"></div>
      <div class="wf-row"><button class="wf-btn" data-a="reset">Reset layout</button><button class="wf-btn" data-a="hide">Hide all <kbd>H</kbd></button><button class="wf-btn" data-a="intro">Modes <kbd>?</kbd></button></div>`;
    menu.querySelector('#wf-size').appendChild(sync(seg([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], () => S.size, v => { S.size = v; document.documentElement.dataset.wfSize = v; save(); setTimeout(() => { layout(); syncUI(); }, 30); })));
    menu.querySelector('#wf-texs').appendChild(sync(slider('Textures', 0, 1, 0.01, () => S.tex, v => { S.tex = v; LOOK.setTex(v); save(); }, pct)));
    menuBtn.addEventListener('click', e => { e.stopPropagation(); const r = SCR.rect(menuBtn); menu.style.top = r.bottom + 6 + 'px'; menu.style.left = clamp(r.right - 250, 8, innerWidth - 258) + 'px'; menu.classList.toggle('open'); syncMenu(); setTimeout(syncUI, 20); menuBtn.blur(); });
    addEventListener('click', e => { if (!menu.contains(e.target) && !menuBtn.contains(e.target)) menu.classList.remove('open'); });
    menu.addEventListener('change', e => { if (e.target.dataset.allp !== undefined) { for (const [id, cfg] of Object.entries(PANELS)) if (cfg.views.includes(viewTag())) { S.panels[id].hidden = !e.target.checked; ui[id].p.classList.toggle('off', !e.target.checked); } save(); } e.target.blur(); });
    menu.addEventListener('click', e => {
      const t = e.target.closest('[data-theme]'); if (t) { LOOK.applyTheme(t.dataset.theme, { withAccent: true }); toast(`Theme: ${LOOK.THEMES[t.dataset.theme].name}`); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'reset') { Object.keys(PANELS).forEach(k => { S.panels[k] = {}; ui[k].st = S.panels[k]; ui[k].p.classList.remove('off', 'collapsed'); }); save(); syncMenu(); layout(); }
      if (a === 'hide') { toggleUI(); menu.classList.remove('open'); }
      if (a === 'intro') { menu.classList.remove('open'); showIntro(); }
    });
  }
  function showIntro() {
    if (document.querySelector('.wf-intro')) return;
    const o = el('div', 'wf-intro'), cards = Object.entries(MODES).map(([k, m], i) => `<button data-m="${k}">${ICON[k]}<b>${m.name}</b><span>${{
      workshop: 'The Flyer on a turntable in a studio. Take it apart, look inside, and watch each component work on its own: the engine\'s four strokes, the crossed chain, wing warping and more.',
      tunnel: 'The Flyer on a balance in a wind tunnel. Ten short lessons on lift, drag, thrust and weight, angle of attack, the stall, camber, banking and adverse yaw, with live forces and smoke.',
      field: 'Kill Devil Hills, 17 December 1903. Roll down the rail into the wind and fly it with real physics; climb out and walk around the camp.' }[k]}</span><kbd>press ${i + 1}</kbd></button>`).join('');
    o.innerHTML = `<div><h2>The Wright Flyer, 1903</h2><p>Three ways in, each in its own place. Switch any time with the buttons at the top.</p><div class="wf-cards">${cards}</div></div>`;
    o.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) setMode(b.dataset.m); if (b || e.target === o) { o.remove(); S.intro = true; save(); } });
    document.body.appendChild(o);
  }
  function syncMenu() { if (!ui.menu) return; ui.menu.querySelector('[data-allp]').checked = Object.entries(PANELS).filter(([, c]) => c.views.includes(viewTag())).every(([id]) => !S.panels[id].hidden); syncThemes(); }
  function syncThemes() { if (ui.menu) ui.menu.querySelectorAll('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === LOOK.current)); }
  function toggleUI() { const on = document.body.classList.toggle('wf-hide'); toast(on ? 'Panels hidden · H brings them back' : 'Panels back'); }
  function moveIndicators() {
    if (!ui.modes) return; const on = ui.modes.querySelector(`button[data-m="${mode}"]`);
    ui.modes.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === on)); if (on && on.offsetWidth) { ui.mind.style.left = on.offsetLeft + 'px'; ui.mind.style.width = on.offsetWidth + 'px'; }
  }
  function syncUI() {
    syncers.forEach(s => s.sync && s.sync());
    const wb = document.getElementById('wf-wback'); if (wb) wb.style.display = FL.walk ? '' : 'none';
    syncMenu(); labelsBuild(); moveIndicators(); syncParts(); syncPlay();
  }
  let toastT = 0;
  function toast(msg) { if (!ui.toast) return; ui.toast.textContent = msg; ui.toast.classList.remove('show'); void ui.toast.offsetWidth; ui.toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => ui.toast.classList.remove('show'), 3600); }

  function panelsTick() {
    if (!ui.parts) return;
    if (mode === 'field') fieldPanel();
    if (mode === 'tunnel' && tunnelF) {
      const f = tunnelF, $ = id => document.getElementById(id);
      $('wf-f-lift').textContent = fmtForce(f.L); $('wf-f-weight').textContent = fmtForce(f.W); $('wf-f-thrust').textContent = fmtForce(f.T); $('wf-f-drag').textContent = fmtForce(f.D);
      $('wf-f-ld').textContent = f.ld.toFixed(1); $('wf-f-net').textContent = (f.liftUp >= f.W ? '+' : '−') + fmtForce(Math.abs(f.liftUp - f.W));
      setLive(ui.eq, `Lift = ½ ρ V² S C<sub>L</sub> = ½ × 1.2 × <b>${(TV.mph * 0.44704).toFixed(1)}</b>² × 47 × <b>${f.cl.toFixed(2)}</b> ≈ <b>${Math.round(PH.newton(f.L))} N</b>${f.stalled ? ' · <b style="color:var(--accent)">stalled</b>' : ''}`);
      if (LS.playing) syncers.forEach(s => s.sync && s.sync());
      drawChart(); ui.lab.head.querySelector('.wf-sum').textContent = `${Math.round(TV.mph)} mph · ${TV.aoa.toFixed(1)}° · lift ${fmtForce(f.L)}`;
      const g = $('wf-goal'); if (g) { g.classList.toggle('ok', LS.goalDone); g.textContent = LS.goalDone ? '✓ lift balances weight' : `lift is ${Math.round(f.liftUp / f.W * 100)}% of weight`; }
    }
  }

  // ── labels over the parts (and the places at Kitty Hawk) ──
  let labelEls = [];
  function labelsBuild() {
    if (!ui.labels) return;
    if (!S.labels || mode === 'tunnel') { ui.labels.innerHTML = ''; labelEls = []; return; }
    if (labelEls.length && labelEls.mode === mode) return;
    ui.labels.innerHTML = ''; labelEls = []; labelEls.mode = mode;
    const add = (kind, key, name) => { const d = el('div', 'wf-label', name); ui.labels.appendChild(d); labelEls.push({ kind, key, d }); };
    Object.entries(INFO.parts).forEach(([k, v]) => add('part', k, v.name)); if (mode === 'field') Object.entries(INFO.places).forEach(([k, v]) => add('place', k, v.name));
  }
  function labels() {
    if (!S.labels || !labelEls.length || !ready) return;
    const near = mode !== 'field' || camera.position.distanceTo(fl.pos) < 40;
    labelEls.forEach(L => {
      let show = L.kind === 'part' ? near && partOf(L.key).g.visible && !(WS.demo && !WS.demo.show.includes(L.key)) : true, p = null;
      if (show) { if (L.kind === 'part') p = partOf(L.key).g.localToWorld(partInfo[L.key].centre.clone()); else { const P = W.places[L.key]; p = P.g.localToWorld(P.centre.clone()); p.y += 1.2; show = camera.position.distanceTo(p) < 90; } }
      if (show) { v3.copy(p).project(camera); show = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1; }
      L.d.style.display = show ? '' : 'none';
      if (show) { L.d.style.left = (v3.x + 1) / 2 * innerWidth + 'px'; L.d.style.top = (1 - v3.y) / 2 * innerHeight + 'px'; L.d.classList.toggle('sel', !!(WS.sel && WS.sel.key === L.key)); }
    });
  }

  function readout(st, what, deg) {
    if (mode !== 'field') return '';
    if (FL.walk) return `on foot · ${fmtSpeed(walker.v)} · ${CAMNAME[FL.cam].toLowerCase()} camera`;
    PH.origin(fl, v2); const agl = v2.y - W.ground(v2.x, v2.z);
    return `${fl.ground ? 'on the ground' : 'flying'} · airspeed ${fmtSpeed(fl.V)} · ${fmtLen(Math.max(0, agl))} up · throttle ${pct(FL.thr)} · heading ${String(deg).padStart(3, '0')}°`;
  }

  window.__wf = { FL, fl, WS, TV, LS, walker, held, get mode() { return mode; }, get camera() { return camera; }, controls, scene, get tween() { return tween; }, setMode, enterDemo, exitDemo, lesson, setStep, model: WF_MODEL, info: WF_INFO };   // test handle
  return { world, tick, after, key, onClick, readout };
})();

botFig({ id: 'wright', name: 'Wright Flyer', build: WF_MODEL.build, tick: WF_APP.tick, after: WF_APP.after, world: WF_APP.world, selfDrive: true,
  half: WF_WORLD.HALF, heading: 0, hover: { height: 0 }, size: 7, targetY: 0.9, dist: 11,
  key: WF_APP.key, onClick: WF_APP.onClick, readout: WF_APP.readout, clips: {}, lights: [], moves: [],
  info: '<h2>Wright Flyer, 1903</h2><p>Learn it, test it, fly it.</p>' });
