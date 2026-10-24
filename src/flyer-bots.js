// Forked from the playable skill's bots.js for the Wright Flyer page: a configurable field size (cfg.half), a world hook
// (cfg.world replaces the flat floor), ground-following (cfg.ground), gradual speed changes (cfg.accel), a driving switch
// (cfg.driving), self-driving figures (cfg.selfDrive: the config moves it in cfg.after), pick / click / key / readout / camera hooks (cfg.onPick, cfg.onClick, cfg.key, cfg.readout, cfg.follow, cfg.after).
// A drivable robot from a rigged .glb, one tab per config (generalised from robot.js). Its own clips are the postures:
// idle / walk / run blend by gait; the ground speed comes from the walk cycle (foot travel per cycle) so feet don't skate;
// one-shot moves fade in over the gait and back out; "hold" moves (fall, power down) keep their pose until you move again.
// Third-person game controls: WASD / arrows relative to the camera, shift runs, the camera follows and swings in behind.
// Lights: chosen triangles of the model light up in the accent (eyes, lenses, sensors), a real spot light in the first
// light group lights the floor ahead (dark theme), footsteps light their grid cell, and "flash" groups fire with a move
// (muzzle flashes). Light theme: same accent, flat, no halos, no light pools.
//
// botFig({ id, name, el, size, targetY, clips: { idle, walk, run, jump, walkJump, fall }, feet: /re/, speeds: { walk, run },
//          hover: { height }, lights: [{ pick(t), halo, spot, flashOn: { clip, at } }], moves: [[label, key, clip, opts]],
//          click: clip, info, hint })
// pick(t) gets one triangle: { twin, island: { tris, size, centre, bone, rank } , c: centroid normalised to its island box (−1…1),
//                              n: face normal (twin space) } and returns true to light it.
const botFig = cfg => FIGS3D.push({ id: cfg.id, name: cfg.name, mod: (() => {
  const ID = cfg.id, C = cfg.clips;
  const g0 = new THREE.Group(); g0.visible = false; scene.add(g0);
  const SIZE = cfg.size || 1.5, HALF = cfg.half || 6, EDGE = HALF - 0.45, HOVER = cfg.hover ? cfg.hover.height : 0;
  const mover = new THREE.Group(); g0.add(mover);                    // floor position + heading; the model's nodes stay untouched
  const tilt = new THREE.Group(); mover.add(tilt);                   // hover robots lean into their motion
  const st = { ready: false, err: '', gait: 0, w: [1, 0, 0], heading: cfg.heading ?? 0.6, keyMove: false, run: false, auto: false, autoGait: 1, lights: true, lightK: 0,
    turnLeft: 0, eW: 0, emote: null, posture: '', v: 0, goal: null, vWalk: 0.9, vRun: 2.4, lastSteer: -1e9, wander: 0, lean: 0, bank: 0 };
  let M = null; const A = {};
  const held = new Set(), DIRS = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
  const view = { target: new THREE.Vector3(cfg.start ? cfg.start[0] : 0, cfg.targetY || 0.5, cfg.start ? cfg.start[1] : 0), get dist() { return (cfg.dist || 9.8) * Math.min(1, Math.max(0.6, Math.sqrt(persp.aspect / 1.45))) * (window.__embedZoom || 1); } };   // embed: a bit closer
  const GAITS = ['idle', cfg.hover ? 'cruising' : 'walking', cfg.hover ? 'boosting' : 'running'], LOCO = [C.idle, C.walk, C.run];

  // floor: a plate with a hairline grid a tier below the robot's lines; a soft contact shadow (a shadow, not a glow)
  const gridMat = new LineMaterial({ color: EDGE_COL.clone(), ...lineOpts });
  if (cfg.world) cfg.world(g0, { HALF, EDGE }); else {
  const plate = rbox(-HALF * 100, -HALF * 100, -5, HALF * 200, HALF * 200, 5, 24, bodyMat, g0, { lines: false });
  plate.add(fat(creaseLines(plate.geometry, 30), lineMat));
  { const s = []; for (let u = -HALF * 100 + 50; u < HALF * 100; u += 50) { s.push([[u, -HALF * 100 + 12, 0.1], [u, HALF * 100 - 12, 0.1]], [[-HALF * 100 + 12, u, 0.1], [HALF * 100 - 12, u, 0.1]]); } seg(s, g0, gridMat); } }
  const ring = loopL(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos(i / 48 * Math.PI * 2) * 0.24, 0.004, Math.sin(i / 48 * Math.PI * 2) * 0.24)), accentLineMat);
  ring.visible = false; g0.add(ring);
  const shadowM = softMat(0x000000, false), shadow = new THREE.Mesh(new THREE.PlaneGeometry(SIZE * 0.9, SIZE * 0.9), shadowM);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.003; mover.add(shadow);
  const shadowA = () => (theme === 'light' ? 0.14 : 0.55) * (cfg.hover ? 0.7 : 1);
  themeHooks.push(() => shadowM.uniforms.opacity.value = shadowA()); shadowM.uniforms.opacity.value = shadowA();

  (cfg.build ? (f => isoBuilt(cfg.build, f)) : (f => isoGlb(cfg.el, SIZE, f, { fitTo: 'rest' })))(r => {
    if (r.err) { st.err = r.err; readout(); return; }
    M = r; tilt.add(r.fit);
    r.clips.forEach((c, i) => A[c.name] = r.actions[i]);
    const foot = []; if (cfg.feet) r.root.traverse(o => { if ((o.isBone || cfg.build) && cfg.feet.test(o.name)) foot.push(o); });   // code-built robots have joints, not bones
    // ground speed = how fast a planted foot slides back under the body (the body moves forward by exactly that):
    // sample the clip, keep the moments a foot is at its lowest, take the median of its backward speed
    const speedOf = name => { const a = A[name]; if (!a || !foot.length) return 0; const T = a.getClip().duration, N = 80, p = new THREE.Vector3(), sp = [];
      a.reset().play(); a.setEffectiveWeight(1);
      foot.forEach(f => { const ys = [], zs = []; for (let i = 0; i <= N; i++) { r.mixer.setTime(T * i / N); r.fit.updateMatrixWorld(true); p.setFromMatrixPosition(f.matrixWorld); ys.push(p.y); zs.push(p.z); }
        const lo = Math.min(...ys), down = lo + 0.12 * (Math.max(...ys) - lo); for (let i = 0; i < N; i++) if (ys[i] < down && ys[i + 1] < down) sp.push((zs[i] - zs[i + 1]) / (T / N)); });
      a.stop(); sp.sort((x, y) => x - y); return sp.length ? Math.max(0, sp[sp.length >> 1]) : 0; };
    st.vWalk = (cfg.speeds && cfg.speeds.walk) || speedOf(C.walk) || st.vWalk;
    st.vRun = (cfg.speeds && cfg.speeds.run) || speedOf(C.run) || st.vRun;
    LOCO.forEach((n, i) => { const a = A[n]; if (a) { a.reset().play(); a.setEffectiveWeight(st.w[i]); } });
    r.mixer.update(0);
    if (cfg.start) mover.position.set(cfg.start[0], HOVER, cfg.start[1]); else mover.position.set(-0.8, HOVER, -0.6); mover.rotation.y = st.heading;
    setupLights(r, foot);
    st.ready = true; if (active === ID) act.iso(); readout();
    (window.__anim = window.__anim || {})[ID] = { ...r, st, mover, A };   // test handle
  });

  // ── commands ──
  const touch = () => { st.lastSteer = performance.now(); st.goal = null; };
  function setGait(g) {
    g = Math.max(0, Math.min(2, g)); touch();
    if (st.emote) endEmote();
    st.posture = ''; st.gait = g; SFX.button(); readout(); return true;
  }
  // play a one-shot clip over the gait: hold = keep its last pose (fall, power down); loop = repeat until the next command
  function once(name, { hold = false, loop = false, moving = false, after = null } = {}) {
    const a = A[name]; if (!a || !M) return true;
    if (st.emote && st.emote.a !== a) st.emote.a.stop();
    a.reset(); a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1); a.clampWhenFinished = true; a.play(); a.setEffectiveWeight(st.eW);
    st.emote = { a, name, hold, loop, moving, after, ending: false }; readout(); return true;
  }
  const endEmote = () => { if (st.emote) st.emote.ending = true; };
  const move = (name, opts = {}) => () => {
    touch(); if (opts.hold && st.posture === name) { st.posture = ''; endEmote(); readout(); SFX.bit(0); return true; }   // pressed again: get up
    st.posture = opts.hold ? name : ''; if (opts.loop || opts.hold) st.gait = 0; opts.hold ? SFX.thunk() : SFX.bit(1); return once(name, opts); };
  const jump = () => { touch(); SFX.thunk(); if (C.walkJump && st.gait && !st.posture) return once(C.walkJump, { moving: true }); st.posture = ''; return once(C.jump, { moving: !!cfg.hover }); };
  const restGait = () => st.auto ? st.autoGait : 0;
  const autoWalk = (on, g = 1) => { st.auto = on; st.autoGait = g; setGait(on ? g : 0); st.lastSteer = -1e9; sync(); return true; };
  const toggleAuto = () => autoWalk(!st.auto);
  const toggleLights = () => { st.lights = !st.lights; st.lights ? SFX.bit(1) : SFX.bit(0); sync(); return true; };
  function sync() { document.querySelectorAll(`#ctl-${ID} button, #bar-${ID} button`).forEach(b => {
    const t = b.textContent; if (/^Lights/.test(t)) b.classList.toggle('on', st.lights); if (/^Auto /.test(t)) b.classList.toggle('on', st.auto); }); }

  // ── lights ──
  const groups = [];                                                 // { mat, anchors: [{ obj, pos }], halos, spot, flash, cfg }
  const islandsOf = g => {
    const p = g.attributes.position, ix = g.index, key = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    const id = new Map(), par = [], find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    const k = i => { const s = key(i); if (!id.has(s)) { id.set(s, id.size); par.push(id.size - 1); } return id.get(s); };
    for (let f = 0; f < ix.count; f += 3) { const a = find(k(ix.getX(f))); par[find(k(ix.getX(f + 1)))] = a; par[find(k(ix.getX(f + 2)))] = a; }
    const isl = new Map(); for (let f = 0; f < ix.count; f += 3) { const r0 = find(k(ix.getX(f))); (isl.get(r0) || isl.set(r0, []).get(r0)).push(f); }
    return [...isl.values()];
  };
  // where a point of a skinned twin lives: on its heaviest bone, in that bone's space (attached bind: boneInverse · bindMatrix · v)
  const anchorOf = (tw, local, f) => {
    if (!tw.isSkinnedMesh) return { obj: tw, pos: local.clone() };
    const g = tw.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, ix = g.index, score = new Map();
    for (let q = 0; q < 3; q++) { const i = ix.getX(f + q); for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > 0) score.set(si.getComponent(i, c), (score.get(si.getComponent(i, c)) || 0) + w); } }
    let b = 0, bw = -1; score.forEach((w, k) => { if (w > bw) { bw = w; b = k; } });
    const M4 = tw.skeleton.boneInverses[b].clone().multiply(tw.bindMatrix);
    return { obj: tw.skeleton.bones[b], pos: local.clone().applyMatrix4(M4) };
  };
  let spot = null; const feet = [];
  function setupLights(r, footBones) {
    const L = cfg.lights || [];
    L.forEach(lc => groups.push({ cfg: lc, mat: (() => { const m = glowMat(); m.side = THREE.DoubleSide; accentFill({ traverse: f => f({ material: m }) }); return m; })(), anchors: [], halos: [], flash: 0 }));
    const twins = []; r.root.traverse(o => { if (o.isMesh && o.name.endsWith('·iso') && o.geometry.index) twins.push(o); });
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nrm = new THREE.Vector3();
    twins.forEach(tw => {
      const g = tw.geometry, p = g.attributes.position, ix = g.index, isl = islandsOf(g), matOf = new Int8Array(ix.count / 3);
      const ranked = isl.slice().sort((a, b) => b.length - a.length);
      isl.forEach(fs => {
        const box = new THREE.Box3(); fs.forEach(f => { for (let q = 0; q < 3; q++) box.expandByPoint(va.fromBufferAttribute(p, ix.getX(f + q))); });
        const ctr = box.getCenter(new THREE.Vector3()), half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5).max(new THREE.Vector3(1e-6, 1e-6, 1e-6));
        const island = { tris: fs.length, size: half.clone().multiplyScalar(2), centre: ctr, rank: ranked.indexOf(fs), bone: tw.isSkinnedMesh ? anchorOf(tw, ctr, fs[0]).obj.name : tw.name };
        const hits = L.map(() => []);
        fs.forEach(f => {
          va.fromBufferAttribute(p, ix.getX(f)); vb.fromBufferAttribute(p, ix.getX(f + 1)); vc.fromBufferAttribute(p, ix.getX(f + 2));
          const cen = va.clone().add(vb).add(vc).divideScalar(3); nrm.subVectors(vb, va).cross(vc.clone().sub(va)).normalize();
          const t = { twin: tw, island, c: cen.clone().sub(ctr).divide(half), n: nrm.clone() };
          const gi = L.findIndex(lc => lc.pick(t)); if (gi >= 0) { matOf[f / 3] = gi + 1; hits[gi].push(f); }
        });
        hits.forEach((fsLit, gi) => {   // one anchor (halo / spot / flash light) per lit piece, at its centre
          if (!fsLit.length) return; const c = new THREE.Vector3(); fsLit.forEach(f => { for (let q = 0; q < 3; q++) c.add(va.fromBufferAttribute(p, ix.getX(f + q))); }); c.divideScalar(fsLit.length * 3);
          groups[gi].anchors.push(anchorOf(tw, c, fsLit[0]));
        });
      });
      if (!matOf.some(x => x)) return;
      // regroup the triangles by material so the lit ones draw with their own material (outline shell ignores groups)
      const byMat = L.map(() => []), rest = []; for (let f = 0; f < ix.count; f += 3) { const m = matOf[f / 3]; (m ? byMat[m - 1] : rest).push(ix.getX(f), ix.getX(f + 1), ix.getX(f + 2)); }
      const all = rest.concat(...byMat); g.setIndex(all); g.clearGroups(); g.addGroup(0, rest.length, 0);
      let at = rest.length; byMat.forEach((arr, gi) => { if (arr.length) g.addGroup(at, arr.length, gi + 1); at += arr.length; });
      tw.material = [bodyMat, ...groups.map(G => G.mat)];
    });
    r.root.updateMatrixWorld(true); mover.updateMatrixWorld(true);
    groups.forEach(G => {
      G.anchors.forEach(a => { if (G.cfg.halo) { const h = glowPoints([a.pos], G.cfg.halo); a.obj.add(h); G.halos.push(h); } });
      if (G.cfg.spot && !spot && G.anchors.length) {   // the spot sits at the light's centre, aimed ahead and down (worked out in world space at rest)
        const a = G.anchors.reduce((s, x) => s.add(x.obj.localToWorld(x.pos.clone())), new THREE.Vector3()).divideScalar(G.anchors.length), host = G.anchors[0].obj;
        const fw = new THREE.Vector3(Math.sin(st.heading), 0, Math.cos(st.heading)), wT = a.clone().addScaledVector(fw, G.cfg.spot.ahead || 1.1); wT.y = 0;
        spot = new THREE.SpotLight(accent.clone(), 0, 6 + HOVER * 2, 0.48, 0.85, 1.4); spot.position.copy(host.worldToLocal(a.clone())); host.add(spot);
        spot.target.position.copy(host.worldToLocal(wT)); host.add(spot.target);
        themeHooks.push(() => spot.color.copy(accent));
      }
      if (G.cfg.point) G.anchors.forEach(a => { const l = new THREE.PointLight(accent.clone(), 0, G.cfg.point.distance || 3, 1.4); l.position.copy(a.pos); a.obj.add(l); (G.points = G.points || []).push(l); themeHooks.push(() => l.color.copy(accent)); });
      if (G.cfg.flashOn) G.anchors.forEach(a => { const l = new THREE.PointLight(accent.clone(), 0, 2.2, 1.6); l.position.copy(a.pos); a.obj.add(l); (G.lightsArr = G.lightsArr || []).push(l); themeHooks.push(() => l.color.copy(accent)); });
    });
    footBones.forEach(b => feet.push({ b, lo: Infinity, up: false }));
    setTheme(theme);
  }
  const stepCells = Array.from({ length: 16 }, () => {
    const m = new LineMaterial({ color: accent.clone(), linewidth: 1, resolution: devRes(), transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 });
    const h = 0.25 - 0.025, sq = loopL([[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(x, 0.005, z)), m);
    const fm = softMat0(0xffffff, true), fill = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), fm); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.004; sq.add(fill);
    sq.visible = false; g0.add(sq); return { sq, m, fm, t0: -1e9 };
  });
  let nextCell = 0;
  const footstep = (x, z, now) => { const cx = Math.floor(x / 0.5) * 0.5 + 0.25, cz = Math.floor(z / 0.5) * 0.5 + 0.25;
    if (stepCells.some(c => c.sq.visible && now - c.t0 < 250 && c.sq.position.x === cx && c.sq.position.z === cz)) return;   // two feet, one cell
    const c = stepCells[nextCell++ % stepCells.length]; c.sq.position.set(cx, 0, cz); c.t0 = now; c.sq.visible = true; };
  const wp = new THREE.Vector3();
  function tickLights(now, dt) {
    st.lightK = approach(st.lightK, st.lights ? 1 : 0, dt / 0.35);
    const light = theme === 'light', k = st.lightK, S = st.emote && st.emote.name;
    groups.forEach(G => {
      let lv = (G.cfg.level ? G.cfg.level(st, S, now) : 1) * k;
      (G.points || []).forEach(l => l.intensity = light ? 0 : G.cfg.point.intensity * lv);   // a steady light of its own (a jet nozzle lighting the floor)
      if (G.cfg.flashOn) {   // fired by a move: a sharp flash at the moment in the clip, gone in a tenth of a second
        const F = G.cfg.flashOn; if (S && F.clip.test(S)) { const t = st.emote.a.time; if (t >= F.at && (G.lastT ?? -1) < F.at) G.flash = 1; G.lastT = t; } else G.lastT = -1;
        G.flash = Math.max(0, G.flash - dt * 7); lv = G.flash;
        (G.lightsArr || []).forEach(l => l.intensity = light ? 0 : 6 * G.flash);
      }
      G.mat.emissiveIntensity = 1.3 * lv; G.halos.forEach(h => h.material.uniforms.intensity.value = 0.85 * lv);
    });
    if (spot) spot.intensity = light ? 0 : 9 * k;
    feet.forEach(f => {   // a foot is planted when it drops back to its lowest height after being lifted
      wp.setFromMatrixPosition(f.b.matrixWorld); f.lo = Math.min(f.lo + dt * 0.02, wp.y);
      if (wp.y > f.lo + 0.035) f.up = true;
      else if (f.up && wp.y < f.lo + 0.012) { f.up = false; if (k > 0.5 && st.v > 0.1 && !st.posture) footstep(wp.x, wp.z, now); }
    });
    stepCells.forEach(c => { if (!c.sq.visible) return; const a = 1 - (now - c.t0) / 1400; if (a <= 0) { c.sq.visible = false; return; }
      c.m.opacity = a; c.m.color.copy(accent); c.m.linewidth = accentLineMat.linewidth; c.m.resolution.copy(accentLineMat.resolution);
      c.fm.uniforms.color.value.copy(accent); c.fm.uniforms.opacity.value = light ? 0 : 0.16 * a; });
  }

  // ── keys ──
  const MOVES = cfg.moves || [];
  function key(e) {
    if (cfg.key && cfg.key(e)) return true;
    const k = e.key.toLowerCase();
    if (cfg.driving && !cfg.driving() && (DIRS[k] || k === ' ' || k === 'q')) return false;
    st.run = e.shiftKey;
    if (DIRS[k]) { if (!held.size && (st.posture || (st.emote && !st.emote.moving))) setGait(0); held.add(DIRS[k]); touch(); return true; }   // get up / stop the move first
    if (k === 'shift') return false;
    if (k === 'l' && !e.repeat) return toggleLights();
    if (k === 'q' && !e.repeat) return toggleAuto();
    if (k === ' ') { if (!e.repeat) jump(); return true; }
    const m = MOVES.find(x => x[1] === k); if (m) { if (!e.repeat) move(m[2], m[3])(); return true; }
    return false;
  }
  addEventListener('keyup', e => { const k = e.key.toLowerCase(); st.run = e.shiftKey; if (DIRS[k]) held.delete(DIRS[k]); });
  addEventListener('blur', () => { held.clear(); st.run = false; });
  let dragging = false, lastDrag = -1e9;
  renderer.domElement.addEventListener('pointerdown', () => { dragging = true; });
  addEventListener('pointerup', () => { if (dragging) lastDrag = performance.now(); dragging = false; });
  renderer.domElement.addEventListener('wheel', () => { lastDrag = performance.now(); }, { passive: true });
  const fwd = new THREE.Vector3(), mv = new THREE.Vector3(), off = new THREE.Vector3(), tgt = new THREE.Vector3();

  // ── per frame ──
  const approach = (v, to, rate) => v + Math.sign(to - v) * Math.min(Math.abs(to - v), rate);
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  function tick(now, dt) {
    bar.classList.remove('off'); if (badge) badge.classList.remove('off');
    if (!M) { tickFlashes(now); return; }
    const E = st.emote;
    if (E) {
      const d = E.a.getClip().duration, nearEnd = !E.hold && !E.loop && E.a.time > d - 0.3;
      if (E.ending || nearEnd) { st.eW = approach(st.eW, 0, dt / (st.posture === '' && E.hold ? 0.6 : 0.3)); if (st.eW <= 0) { E.a.stop(); st.emote = null; if (E.after) E.after(); readout(); } }
      else st.eW = approach(st.eW, 1, dt / 0.2);
      if (E.loop && st.gait > 0) E.ending = true;
    } else st.eW = 0;
    st.w = st.w.map((w, i) => approach(w, i === st.gait ? 1 : 0, dt / 0.3));
    // gaits without a clip of their own (a hovering drone) fall back to the idle clip
    const wIdle = st.w[0] + (A[C.walk] ? 0 : st.w[1]) + (A[C.run] ? 0 : st.w[2]);
    if (A[C.idle]) A[C.idle].setEffectiveWeight(wIdle * (1 - st.eW));
    if (A[C.walk]) A[C.walk].setEffectiveWeight(st.w[1] * (1 - st.eW));
    if (A[C.run]) A[C.run].setEffectiveWeight(st.w[2] * (1 - st.eW));
    if (st.emote) st.emote.a.setEffectiveWeight(st.eW);
    M.mixer.update(dt);
    if (cfg.tick) cfg.tick(st, now, dt, M);
    if (cfg.selfDrive) {                                             // the figure moves itself: no gait steering, no follow camera
      if (cfg.after) cfg.after(st, now, dt, M, mover);
      tickLights(now, dt); ring.visible = false;
      if ((tick.n = (tick.n || 0) + 1) % 6 === 0) readout();
      tickFlashes(now); return;
    }

    const moveK = st.emote && !st.emote.moving ? 1 - st.eW : 1;
    const drive = !cfg.driving || cfg.driving();
    if (!drive) { held.clear(); if (st.gait && !st.auto) st.gait = 0; }
    const vGoal = (st.w[1] * st.vWalk + st.w[2] * st.vRun) * moveK;
    const acc = typeof cfg.accel === 'function' ? cfg.accel() : cfg.accel;
    st.v = acc ? approach(st.v, vGoal, (vGoal > st.v ? acc : acc * 1.6) * dt) : vGoal;   // a plane builds speed slowly
    const rate = (st.gait === 2 ? 2.2 : 1.8) * dt;
    let turn = 0, chase = 0;
    const ix = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0), iz = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0);
    if (ix || iz) {
      fwd.subVectors(controls.target, camera.position).setY(0).normalize();
      mv.set(-fwd.z * ix + fwd.x * iz, 0, fwd.x * ix + fwd.z * iz).normalize();
      const err = wrap(Math.atan2(mv.x, mv.z) - st.heading);
      turn = Math.sign(err) * Math.min(Math.abs(err), (cfg.turnRate ? cfg.turnRate(st) : 9) * dt);
      if (!st.emote || st.emote.moving || st.emote.ending) st.gait = st.run ? 2 : 1;
      st.keyMove = true; st.goal = null;
      chase = Math.max(0, mv.dot(fwd));
    } else if (st.keyMove) { st.keyMove = false; st.gait = restGait(); readout(); }
    if (!turn && Math.abs(st.turnLeft) > 1e-4) { turn = Math.sign(st.turnLeft) * Math.min(Math.abs(st.turnLeft), rate); st.turnLeft -= turn; }
    const p = mover.position, fx = Math.sin(st.heading), fz = Math.cos(st.heading);
    const out = Math.max(Math.abs(p.x), Math.abs(p.z)) > EDGE - 0.6 && (p.x * fx + p.z * fz) > 0;
    if (st.goal) {
      const dx = st.goal.x - p.x, dz = st.goal.z - p.z, dist = Math.hypot(dx, dz), err = wrap(Math.atan2(dx, dz) - st.heading);
      turn = Math.sign(err) * Math.min(Math.abs(err), rate * 1.6);
      if (dist < 0.06 + st.v * 0.16) { st.goal = null; st.gait = restGait(); readout(); }
      else if (!st.emote || st.emote.moving) st.gait = Math.abs(err) > 1.4 && dist < 1 ? 0 : dist > 1.8 ? 2 : 1;
    }
    else if (out && st.v > 0.01 && !st.keyMove) { const want = Math.atan2(-p.x, -p.z); turn = Math.sign(wrap(want - st.heading)) * Math.min(Math.abs(wrap(want - st.heading)), rate * 1.4); }
    else if (!turn && !st.keyMove && st.v > 0.01 && now - st.lastSteer > 4000) { st.wander += dt; turn = Math.sin(st.wander * 0.35) * 0.35 * dt; }
    st.heading = wrap(st.heading + turn); mover.rotation.y = st.heading;
    p.x = THREE.MathUtils.clamp(p.x + Math.sin(st.heading) * st.v * dt, -EDGE, EDGE);
    p.z = THREE.MathUtils.clamp(p.z + Math.cos(st.heading) * st.v * dt, -EDGE, EDGE);
    if (cfg.hover) {   // hovering: lean into the speed, bank into turns, hold height; the shadow stays on the floor and fades with height
      st.lean = approach(st.lean, Math.min(0.32, st.v * 0.09), dt * 0.8); st.bank = approach(st.bank, THREE.MathUtils.clamp(-turn / Math.max(dt, 1e-4) * 0.12, -0.3, 0.3), dt * 1.5);
      tilt.rotation.set(st.lean, 0, st.bank); p.y = HOVER + (cfg.ground ? cfg.ground(p.x, p.z) : 0); shadow.position.y = 0.003 - HOVER;
    }
    tgt.set(p.x, (cfg.targetY || 0.5) + (cfg.followY ? cfg.followY(st, p) : 0), p.z); view.target.copy(tgt);
    if (!camAnim && active === ID && drive && (!cfg.follow || cfg.follow())) {
      off.subVectors(tgt, controls.target).multiplyScalar(1 - Math.exp(-dt * 4)); controls.target.add(off); camera.position.add(off);
      if (chase > 0 && st.v > 0.3 && !dragging && now - lastDrag > 1500 && !controls.autoRotate) {
        off.subVectors(camera.position, controls.target);
        const err = wrap(st.heading + Math.PI - Math.atan2(off.x, off.z));
        off.applyAxisAngle(THREE.Object3D.DEFAULT_UP, err * (1 - Math.exp(-dt * 0.9 * chase))); camera.position.copy(controls.target).add(off);
      }
    }
    if (cfg.after) cfg.after(st, now, dt, M, mover);
    tickLights(now, dt);
    ring.visible = !!st.goal; if (st.goal) { ring.position.set(st.goal.x, cfg.ground ? cfg.ground(st.goal.x, st.goal.z) + 0.02 : 0, st.goal.z); const k = Math.min(1, (performance.now() - (st.goalAt || 0)) / 350); ring.scale.setScalar(1.8 - 0.8 * k + 0.06 * Math.sin(performance.now() / 160)); }
    gridMat.color.copy(BG_COL).lerp(lineMat.color, 0.5); gridMat.linewidth = lineMat.linewidth; gridMat.resolution.copy(lineMat.resolution);
    if ((tick.n = (tick.n || 0) + 1) % 6 === 0) readout();
    tickFlashes(now);
  }
  const isBot = o => { for (; o; o = o.parent) if (o === mover) return true; return false; };
  let lastTap = -1e9;
  function click(hit, e) {
    if (performance.now() - lastTap < 300) return; lastTap = performance.now();   // the same tap can arrive as both a touch and a click
    if (!M) return;
    if (!hit && e) { const g = groundPoint(e.clientX, e.clientY); if (g) hit = { object: null, point: g }; }   // past the floor's edge: head that way
    if (!hit) return;
    if (cfg.onClick && cfg.onClick(hit, e, isBot(hit.object))) return;
    if (isBot(hit.object)) { if (cfg.onPick) cfg.onPick(hit.object); else move(cfg.click || C.idle)(); return; }
    const q = g0.worldToLocal(hit.point.clone()), x = THREE.MathUtils.clamp(q.x, -EDGE, EDGE), z = THREE.MathUtils.clamp(q.z, -EDGE, EDGE);
    if (st.posture || (st.emote && !st.emote.moving)) setGait(0);
    if (st.auto) { st.auto = false; sync(); }                       // a tap is a destination: go there and stop
    st.lastSteer = performance.now(); st.goal = { x, z }; st.goalAt = performance.now(); SFX.detent(); readout();
  }
  // phones: one scrolling row of buttons under a short tip (shown for the active tab only)
  const bar = document.createElement('div'); bar.id = 'bar-' + ID; bar.className = 'ui ctl bot-bar off';
  bar.innerHTML = `<div class="tip">tap the floor to ${cfg.hover ? 'fly' : 'walk'} there · tap it to ${(cfg.clickLabel || 'react')} · drag to orbit</div><div class="row"></div>`;
  [['Lights', toggleLights], [cfg.hover ? 'Auto fly' : 'Auto walk', toggleAuto], [cfg.hover ? 'Boost' : 'Run', () => autoWalk(true, 2)], [cfg.jumpLabel || 'Jump', () => jump()],
   ...MOVES.map(([t, , clip, o]) => [t.replace(/ \/ .*/, ''), () => move(clip, o)()])]
    .forEach(([t, f]) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', () => { f(); b.blur(); }); bar.querySelector('.row').appendChild(b); });
  document.body.appendChild(bar); setTimeout(sync, 0);
  // an optional highlight for this robot, shown while its tab is active (also inside an embedded preview)
  const badge = cfg.badge ? Object.assign(document.createElement('div'), { className: 'ui bot-badge off', innerHTML: '<span><i></i><em>' + cfg.badge + '</em></span>' }) : null;
  if (badge) { document.body.appendChild(badge); if (!document.getElementById('bot-badge-css')) { const c = document.createElement('style'); c.id = 'bot-badge-css'; c.textContent = `
    .bot-badge { left:0; right:0; top:64px; display:flex; justify-content:center; pointer-events:none; padding:0 16px; }
    .bot-badge.off { display:none; }
    .bot-badge span { display:inline-flex; align-items:center; gap:9px; padding:7px 14px; border-radius:999px; font-size:13px; line-height:1.35; color:var(--ink-hi, #e6e8e9);
      background:color-mix(in srgb, var(--panel, #141516) 82%, transparent); border:1px solid color-mix(in srgb, var(--accent) 55%, transparent); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
    .bot-badge i { width:7px; height:7px; border-radius:50%; background:var(--accent); flex:none; }
    .bot-badge span { max-width:100%; }
    .bot-badge em { font-style:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
    html.embed .bot-badge { top:12px; }
    @media (max-width:640px) { .bot-badge { top:auto; bottom:150px; } .bot-badge span { font-size:12px; } html.embed .bot-badge { top:10px; bottom:auto; } }`; document.head.appendChild(c); } }
  if (!document.getElementById('bot-bar-css')) { const css = document.createElement('style'); css.id = 'bot-bar-css'; css.textContent = `
    .bot-bar { display:none; left:0; right:0; bottom:10px; flex-direction:column; gap:6px; }
    .bot-bar .tip { padding:0 16px; font-size:11px; opacity:.6; pointer-events:none; }
    .bot-bar .row { display:flex; gap:6px; overflow-x:auto; padding:0 16px; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
    .bot-bar .row::-webkit-scrollbar { display:none; }
    .bot-bar button { flex:0 0 auto; white-space:nowrap; }
    @media (max-width:640px), (pointer:coarse) {
      .bot-bar:not(.off) { display:flex; } .ui.ctl[id^="ctl-"], #info, #hint { display:none !important; } #read { bottom:84px; }
    }`; document.head.appendChild(css); }
  // readout word for a move: its 5th entry, else its label in lower case
  const label = n => { const m = MOVES.find(x => x[2] === n); return m ? (m[4] || m[0].toLowerCase().replace(/ \/ .*/, '')) : n === C.jump || n === C.walkJump ? (cfg.jumpWord || 'jumping') : n.toLowerCase(); };
  function readout() {
    if (badge) badge.classList.toggle('off', active !== ID);         // the page calls readout when a tab opens: show this robot's highlight
    if (active !== ID) return; const el = document.getElementById('read');
    if (st.err) { el.textContent = 'could not load model · ' + st.err; return; }
    if (!st.ready) { el.textContent = `loading ${cfg.name.toLowerCase()}…`; return; }
    const what = st.emote ? label(st.emote.name) : GAITS[st.gait];
    const deg = Math.round(((-st.heading * 180 / Math.PI) % 360 + 360) % 360);
    el.textContent = cfg.readout ? cfg.readout(st, what, deg) : `${what} · ${st.v.toFixed(1)} m/s · heading ${String(deg).padStart(3, '0')}°`;
  }
  return { group: g0, key, tick, readout, stop: () => { held.clear(); bar.classList.add('off'); if (badge) badge.classList.add('off'); },
    click, demo: () => autoWalk(true),
    panel: [['Lights', 'L', toggleLights], [cfg.hover ? 'Auto fly / stop' : 'Auto walk / stop', 'Q', toggleAuto], [cfg.hover ? 'Cruise' : 'Walk', 'WASD', () => autoWalk(true, 1)], [cfg.hover ? 'Boost' : 'Run', 'shift', () => autoWalk(true, 2)],
      [cfg.jumpLabel || 'Jump', 'space', jump], ...MOVES.map(([t, k, clip, o]) => [t, k, move(clip, o)])],
    view, info: cfg.info,
    hint: `WASD / arrows ${cfg.hover ? 'fly' : 'walk'} · shift ${cfg.hover ? 'boost' : 'run'} · q auto · l lights · space ${(cfg.jumpLabel || 'jump').toLowerCase()} · 1–${MOVES.length} moves · click the floor to go there` };
})() });

// Taps on touch screens, detected from the touch itself: the template's click needs a release within 5 px, and when the page
// lets a finger scroll (the embedded hero) a slight drag turns the tap into a scroll. Mouse clicks stay with the template.
if (!window.__playableTaps) { window.__playableTaps = true;
  const el = renderer.domElement, rc = new THREE.Raycaster(), v2 = new THREE.Vector2(); let t0 = null;
  const at = t => WF_SCREEN.pt(t);   // page coordinates, also while the page is turned on its side
  el.addEventListener('touchstart', e => { const t = at(e.changedTouches[0]); t0 = e.touches.length === 1 ? { x: t.x, y: t.y, at: performance.now() } : null; }, { passive: true });
  el.addEventListener('touchend', e => {
    const t = at(e.changedTouches[0]); if (!t0 || e.touches.length) return;
    const moved = Math.hypot(t.x - t0.x, t.y - t0.y), long = performance.now() - t0.at; t0 = null;
    if (moved > 12 || long > 600) return;
    const F = EXTRA[active]; if (!F || !F.click) return;
    v2.set(t.x / innerWidth * 2 - 1, -(t.y / innerHeight) * 2 + 1); rc.setFromCamera(v2, camera);
    F.click(rc.intersectObject(F.group, true).find(h => h.object.isMesh && !h.object.isLineSegments2 && !h.object.userData.outline), { clientX: t.x, clientY: t.y, __wfTurned: true });
  }, { passive: true });
}
