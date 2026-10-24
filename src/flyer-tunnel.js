// The wind tunnel (after the brothers' own 1901 tunnel, scaled up): an open-frame test section with a honeycomb at the inlet
// and a fan at the far end, the Flyer held on a balance sting with a lift gauge, and the airflow drawn two ways: smoke
// streamlines, and moving smoke particles. The flow is a simple model (the oncoming air plus a bound vortex for each wing,
// its strength following the lift, turning exaggerated so it reads), and past the stall the wake breaks up.
// Values come from the lesson (v: mph, aoa, thr, bank, warp, flat, link); the forces are the physics model's, with the
// Historic (real Flyer) coefficients.
const WF_TUNNEL = (() => {
  const K = WF_MODEL.K, PH = WF_PHYS, M = PH.MODELS.historic, MOUNT = 4.6, HX = 13, HY = 11, HZ = 22, N = 760, SMOKE = 16, SSTEPS = 200;
  const V = (x, y, z) => new THREE.Vector3(x, y, z), TAU = Math.PI * 2;
  let group = null, fan = null, needle = null, streak = null, smoke = null, active = false, smokeKey = '';
  const P = new Float32Array(N * 3), seeds = new Float32Array(N);
  const vort = [V(0, 0, 0), V(0, 0, 0)];                              // the two wings' bound vortices (y, z used)
  let gamma = 0, U = 1, wake = 0, wakeZ = 0, wakeY = 0;
  const merge = list => { const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; gs.forEach(g => { n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3); let o = 0; gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = mergeVertices(out, 1e-5); m.computeVertexNormals(); return m; };

  function build(root) {
    group = new THREE.Group(); group.visible = false; root.add(group);
    const metal = WF_LOOK.surface('metal', { rough: 0.55, metal: 0.35 }), floorM = WF_LOOK.surface('studio', { rough: 0.85 });
    WF_WORLD.solid(merge([new THREE.BoxGeometry(HX * 2 + 1, 0.2, HZ * 2 + 2).translate(0, -0.1, 0)]), 'floor', group, floorM);
    const fr = [];
    for (let z = -HZ; z <= HZ + 0.01; z += 4) { for (const x of [-HX, HX]) fr.push(new THREE.BoxGeometry(0.22, HY, 0.22).translate(x, HY / 2, z)); fr.push(new THREE.BoxGeometry(HX * 2 + 0.22, 0.22, 0.22).translate(0, HY, z)); }
    for (const x of [-HX, HX]) for (const y of [0.11, HY]) fr.push(new THREE.BoxGeometry(0.16, 0.16, HZ * 2).translate(x, y, 0));
    WF_WORLD.solid(merge(fr), 'frames', group, metal);
    const ln = [], mj = [];
    for (let x = -HX + 1; x < HX; x += 1) ln.push(x, 0.005, -HZ, x, 0.005, HZ);
    for (let z = -HZ; z <= HZ; z += 1) ln.push(-HX, 0.005, z, HX, 0.005, z);
    mj.push(0, 0.006, -HZ, 0, 0.006, HZ);
    for (let z = -HZ; z < HZ - 0.01; z += 4) for (const x of [-HX, HX]) ln.push(x, 0.2, z, x, HY - 0.2, z + 4, x, HY - 0.2, z, x, 0.2, z + 4);
    for (let x = -HX; x <= HX + 0.01; x += 0.5) mj.push(x, 0, HZ, x, HY, HZ);              // the honeycomb straightens the air
    for (let y = 0; y <= HY + 0.01; y += 0.5) mj.push(-HX, y, HZ, HX, y, HZ);
    group.add(fat(ln, lineMat)); group.add(fat(mj, majorMat));
    for (let z = -HZ + 2; z < HZ; z += 4) for (const x of [-4, 4]) { const m = glowMat(0x2a2d33); const s = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 2.2), m); s.position.set(x, HY - 0.12, z); group.add(s); m.userData.lamp = true; lamps.push(m); }
    // the fan at the far end
    fan = new THREE.Group(); fan.position.set(0, HY / 2, -HZ + 0.6); group.add(fan);
    WF_WORLD.solid(merge([new THREE.TorusGeometry(5.6, 0.26, 10, 72), new THREE.CylinderGeometry(0.6, 0.6, 0.8, 24).rotateX(Math.PI / 2)]), 'fanHousing', group, metal).position.copy(fan.position);
    const rotor = new THREE.Group(); fan.add(rotor); fan.userData.rotor = rotor;
    WF_WORLD.solid(merge(Array.from({ length: 6 }, (_, i) => new THREE.BoxGeometry(0.9, 4.6, 0.08).translate(0, 2.8, 0).rotateY(0.35).rotateZ(i / 6 * TAU))), 'fanBlades', rotor, metal);
    // the balance: a sting up to the Flyer's centre of gravity and a gauge at its foot
    WF_WORLD.solid(merge([new THREE.CylinderGeometry(0.07, 0.09, MOUNT - 0.2, 14).translate(0, (MOUNT - 0.2) / 2, 0), new THREE.SphereGeometry(0.16, 16, 12).translate(0, MOUNT - 0.1, 0),
      new THREE.BoxGeometry(1.5, 0.9, 1.1).translate(0, 0.45, 0), new THREE.CylinderGeometry(0.38, 0.38, 0.06, 32).rotateZ(Math.PI / 2).translate(0.78, 0.5, 0)]), 'balance', group, metal);
    const dial = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + i / 8 * Math.PI, r0 = i % 4 ? 0.3 : 0.25; dial.push(0.815, 0.5 + Math.sin(a) * r0, Math.cos(a) * r0, 0.815, 0.5 + Math.sin(a) * 0.35, Math.cos(a) * 0.35); }
    group.add(fat(dial, majorMat));
    needle = new THREE.Group(); needle.position.set(0.82, 0.5, 0); group.add(needle); needle.add(fat([0, 0, 0, 0, 0.32, 0], accentLineMat));
    // smoke particles (streaks that fade to the background) and smoke streamlines
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3)); sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    streak = new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false })); streak.frustumCulled = false; group.add(streak);
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE * SSTEPS * 6), 3));
    smoke = new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); smoke.frustumCulled = false; group.add(smoke);
    for (let i = 0; i < N; i++) respawn(i, true);
    // force arrows from the centre of gravity, tip arrows for the warping lesson, a yaw arrow at the nose
    A.lift = WF_FX.arrow('lift', group, { head: 0.35 }); A.weight = WF_FX.arrow('weight', group, { head: 0.35 }); A.thrust = WF_FX.arrow('thrust', group, { head: 0.3 }); A.drag = WF_FX.arrow('drag', group, { head: 0.3 });
    A.tipL = WF_FX.arrow('lift', group, { head: 0.22 }); A.tipR = WF_FX.arrow('lift', group, { head: 0.22 }); A.yaw = WF_FX.arrow('motion', group, { head: 0.25 }); A.turn = WF_FX.arrow('motion', group, { head: 0.3 });
    for (const k of ['lift', 'weight', 'thrust', 'drag']) LB[k] = WF_FX.label('', { role: k, cls: 'force' }).at(out => active && A[k].g.visible ? A[k].tipWorld(out) : null);
    LB.yaw = WF_FX.label('', { role: 'motion', cls: 'force' }).at(out => active && A.yaw.g.visible ? A.yaw.tipWorld(out) : null);
    LB.turn = WF_FX.label('turning force', { role: 'motion', cls: 'force' }).at(out => active && A.turn.g.visible ? A.turn.tipWorld(out) : null);
  }
  const lamps = [], A = {}, LB = {};

  // the flow: oncoming air (toward −z) plus the wings' vortices; the wake behind a stalled wing churns
  function field(x, y, z, t, out, turb = true) {
    let vy = 0, vz = -U;
    const span = THREE.MathUtils.smoothstep(6.2 - Math.abs(x), 0, 1.2);  // the vortices act across the span only
    for (const c of vort) { const dz = z - c.z, dy = y - c.y, r2 = dz * dz + dy * dy + 0.12, k = 2.6 * gamma / TAU * span;
      vy += k * dz / r2; vz += -k * dy / r2; }
    if (turb && wake > 0 && z < wakeZ && z > wakeZ - 9 && Math.abs(y - wakeY) < 1.8 + (wakeZ - z) * 0.12) {
      const a = wake * U * 0.55 * span; vy += a * Math.sin(z * 2.1 + t * 7 + y * 3) ; vz += a * 0.6 * Math.cos(y * 3.3 + t * 9 + z);
    }
    return out.set(0, vy, vz);
  }
  const fv = V(0, 0, 0);
  function respawn(i, anywhere) {
    const sheets = [-2.4, 1.3, 2.8];
    P[i * 3] = sheets[i % 3] + (Math.random() - 0.5) * 0.3; P[i * 3 + 1] = MOUNT - 3.4 + Math.random() * 6.8; P[i * 3 + 2] = anywhere ? -HZ + Math.random() * HZ * 2 : HZ - Math.random() * 1.5;
    seeds[i] = Math.random();
  }

  // the forces for a set of values (also used by the app's readouts and charts)
  const f = V(0, 0, 0), u = V(0, 0, 0), l = V(0, 0, 0), q = new THREE.Quaternion(), eul = new THREE.Euler();
  function pose(v, out = {}) {
    q.setFromEuler(eul.set(-v.aoa * Math.PI / 180, 0, v.bank * Math.PI / 180, 'YXZ'));
    out.q = q.clone(); out.cg = V(0, MOUNT, 0); return out;
  }
  function forces(v) {
    const a = v.aoa * Math.PI / 180, Vu = PH.mphToU(v.mph), qd = PH.C_AERO * Vu * Vu;
    const cl = PH.CL(a, M, v.flat), cd = PH.CD(a, cl, M), L = qd * cl, D = qd * cd, T = v.thr * M.Tmax * Math.max(0, 1 - Vu / M.Vprop), Wt = PH.G;
    const b = v.bank * Math.PI / 180, d = v.warp * 0.06;
    const clL = PH.CL(a + d, M, v.flat), clR = PH.CL(a - d, M, v.flat);   // warping: the left tip meets the air steeper when warp > 0
    const yaw = (PH.CD(a + d, clL, M) - PH.CD(a - d, clR, M)) * qd * (v.link ? 0.05 : 1);   // + = adverse yaw to the left
    return { a, Vu, cl, cd, L, D, T, W: Wt, ld: D > 0 ? L / D : 0, bank: b, liftUp: L * Math.cos(b), liftSide: L * Math.sin(b), clL, clR, tipL: qd * clL, tipR: qd * clR, yaw, stalled: a > M.aStall };
  }

  function tick(now, dt, v, fc) {
    const t = now / 1000, S = 0.5;                                        // arrow length per unit of acceleration (units per units/s²)
    for (const m of lamps) m.emissiveIntensity = 0.8;
    U = Math.max(0.15, fc.Vu); gamma = 0.5 * fc.cl * U * 0.99;
    const { q: pq, cg } = pose(v);
    f.set(0, 0, 1).applyQuaternion(pq); u.set(0, 1, 0).applyQuaternion(pq); l.set(1, 0, 0).applyQuaternion(pq);
    const g = WF_MODEL.geo, W = g.WING;
    const place = (y, out) => out.set(0, (y + W.yc(0.25)) * K - PH.CGH, W.z(0.25) * K).applyQuaternion(pq).add(cg).add(V(0, 0, 0));
    place(g.Y_UP, vort[0]); place(g.Y_LO, vort[1]);
    wake = fc.stalled ? Math.min(1, (fc.a - M.aStall) * 7) : 0; wakeZ = (vort[0].z + vort[1].z) / 2 - 0.4; wakeY = (vort[0].y + vort[1].y) / 2 + 0.3;
    // particles
    const pos = streak.geometry.attributes.position.array, col = streak.geometry.attributes.color.array;
    const bg = BG_COL, ink = new THREE.Color().copy(LINE_COL).lerp(new THREE.Color(theme === 'light' ? 0x000000 : 0xffffff), 0.35), hot = accent, c = new THREE.Color();
    const pace = 0.55;
    for (let i = 0; i < N; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      field(x, y, z, t + seeds[i] * 3, fv);
      P[i * 3 + 1] += fv.y * dt * pace; P[i * 3 + 2] += fv.z * dt * pace;
      if (P[i * 3 + 2] < -HZ + 1 || P[i * 3 + 1] < 0.3 || P[i * 3 + 1] > HY - 0.3) respawn(i, false);
      const sp = fv.length(), k = THREE.MathUtils.clamp((sp / U - 1) * 5, 0, 1), tl = 0.06 + 0.04 * seeds[i];
      pos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], P[i * 3], P[i * 3 + 1] - fv.y * tl, P[i * 3 + 2] - fv.z * tl], i * 6);
      c.copy(ink).lerp(hot, k); col.set([c.r, c.g, c.b, bg.r, bg.g, bg.b], i * 6);
    }
    streak.geometry.attributes.position.needsUpdate = true; streak.geometry.attributes.color.needsUpdate = true;
    streak.visible = v.smoke !== false;
    // smoke streamlines, redrawn when the flow changes
    const key = [U.toFixed(2), gamma.toFixed(3), wake.toFixed(2), vort[0].y.toFixed(2), vort[0].z.toFixed(2), Math.floor(t * 8) * (wake > 0 ? 1 : 0)].join('|');
    if (key !== smokeKey) {
      smokeKey = key; const sp = smoke.geometry.attributes.position.array; let o = 0; const p = V(0, 0, 0);
      for (let j = 0; j < SMOKE; j++) { p.set(1.3, MOUNT - 2.7 + j * 0.36, HZ - 1.5);
        for (let s = 0; s < SSTEPS; s++) { const x0 = p.x, y0 = p.y, z0 = p.z; field(p.x, p.y, p.z, t, fv, true); const n = fv.length() || 1; p.addScaledVector(fv, 0.19 / n);
          sp[o++] = x0; sp[o++] = y0; sp[o++] = z0; sp[o++] = p.x; sp[o++] = p.y; sp[o++] = p.z; } }
      smoke.geometry.attributes.position.needsUpdate = true;
    }
    smoke.material.color.copy(LINE_COL).lerp(new THREE.Color(theme === 'light' ? 0x000000 : 0xffffff), 0.25); smoke.visible = v.smoke !== false;
    // the fan, the gauge needle (lift as a share of weight)
    fan.userData.rotor.rotation.z -= dt * U * 1.2;
    needle.rotation.x = -(THREE.MathUtils.clamp(fc.L / fc.W, 0, 2) - 1) * Math.PI / 2;
    // forces
    const lift = V(0, 0, 0).copy(u).addScaledVector(V(0, 0, 1), -u.z).normalize();   // perpendicular to the oncoming air
    A.lift.set(cg, lift.multiplyScalar(fc.L * S), 0.35); A.weight.set(cg, V(0, -fc.W * S, 0), 0.35);
    A.thrust.set(V(0, cg.y + 0.05, cg.z).addScaledVector(f, 0.3), V(0, 0, 0).copy(f).multiplyScalar(fc.T * S * 3), 0.3);
    A.drag.set(V(0, cg.y - 0.05, cg.z), V(0, 0, -fc.D * S * 3), 0.3);
    const lb = x => `${Math.round(PH.lbf(x))} lbf`;
    LB.lift.set(`Lift ${lb(fc.L)}`); LB.weight.set(`Weight ${lb(fc.W)}`); LB.thrust.set(`Thrust ${lb(fc.T)} <small>×3</small>`); LB.drag.set(`Drag ${lb(fc.D)} <small>×3</small>`);
    if (Math.abs(fc.bank) > 0.02) A.turn.set(cg, V(0, 0, 0).copy(l).multiplyScalar(-Math.sign(fc.bank)).setY(0).normalize().multiplyScalar(Math.abs(fc.liftSide) * S), 0.3); else A.turn.hide();
    if (Math.abs(v.warp) > 0.02) {
      const tip = (x, out) => out.set(x * K, (g.Y_UP + 0.15) * K - PH.CGH, 0).applyQuaternion(pq).add(cg);
      A.tipL.set(tip(5.2, V(0, 0, 0)), V(0, 0, 0).copy(u).multiplyScalar(fc.tipL * S * 0.5), 0.22); A.tipR.set(tip(-5.2, V(0, 0, 0)), V(0, 0, 0).copy(u).multiplyScalar(fc.tipR * S * 0.5), 0.22);
      const nose = V(0, 0, 0).copy(cg).addScaledVector(f, 1.9);
      if (Math.abs(fc.yaw) > 0.01) { A.yaw.set(nose, V(Math.sign(fc.yaw) * Math.min(2.2, Math.abs(fc.yaw) * 6), 0, 0), 0.25); LB.yaw.set(v.link ? 'rudder cancels the yaw' : 'adverse yaw'); }
      else { A.yaw.set(nose, V(Math.sign(fc.yaw || 1) * 0.0001, 0, 0)); A.yaw.hide(); }
    } else { A.tipL.hide(); A.tipR.hide(); A.yaw.hide(); }
    // the Flyer's own moving parts follow the settings
    const pv = WF_MODEL.piv, w = v.warp * 0.1;
    pv.warp.loL.rotation.x = pv.warp.upL.rotation.x = -w; pv.warp.loR.rotation.x = pv.warp.upR.rotation.x = w;
    pv.rudder.rotation.y = v.link ? v.warp * 0.2 : 0;
    const sp = (v.thr * 18 + 0.5) * dt; pv.propL.rotation.z -= sp; pv.propR.rotation.z += sp; pv.flywheel.rotation.z += sp * 2.9;
  }
  function setActive(on) { active = on; if (!on) for (const k in A) A[k].hide(); }
  return { build, tick, pose, forces, setActive, MOUNT, M, get group() { return group; } };
})();
