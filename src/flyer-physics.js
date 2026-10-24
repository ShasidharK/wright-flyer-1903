// Flight physics for the Flyer, in scene units (1 unit = 2 m, so g = 4.9 units/s²). A light rigid-body model:
// · lift and drag from the angle of attack: a cambered-wing lift curve (lift at zero angle) with a stall, and a drag polar
//   (parasite drag from the struts and wires plus drag due to lift);
// · propeller thrust that fades as airspeed rises; less of everything above the ceiling;
// · moments: the elevator commands pitch against pitch stability (the nose settles at a trim angle of attack), wing warping
//   rolls, the rudder (linked to the warping, as on the real Flyer) and weathervane stability yaw, warping causes adverse
//   yaw, and every axis is damped. Control power grows with airspeed², so a slow Flyer answers its controls slowly;
// · on the ground the skids slide fore and aft only, with friction (soft sand in the Historic model) and steering.
// Forces are kept per unit mass (accelerations); newton() and lbf() turn them into the real Flyer's forces.
const WF_PHYS = (() => {
  const K = WF_MODEL.K, G = 9.81 * K, MASS = 340;                     // 340 kg: the Flyer and its pilot
  const C_AERO = 0.165;                                               // ½ρS/m in scene units: lift accel = C_AERO · CL · V²
  const CGH = 1.4 * K;                                                // centre of gravity above the skids
  const MODELS = {
    arcade:   { name: 'Arcade',   CL0: 0.36, CLa: 4.4, aStall: 0.22, CD0: 0.06, kInd: 0.062, Tmax: 2.6, Vprop: 18, muSand: 0.05, muRail: 0.02, trim: 0.06, elev: 0.1, level: 2.2, adverse: 0.15, ceiling: 30, autoRot: 6.2, rollK: 2.8, maxBank: 0.52, maxPitch: 0.32, turnAssist: 0.8, stabMin: 0.7, protect: 9, dampMin: 0.8, flare: 0.7, hard: 2.4, maxDive: 0.2, pathHold: 3, yawStab: 8, rudder: 0.3 },
    historic: { name: 'Historic', CL0: 0.30, CLa: 4.4, aStall: 0.18, CD0: 0.08, kInd: 0.062, Tmax: 1.9, Vprop: 14, muSand: 0.45, muRail: 0.02, trim: 0.06, elev: 0.14, level: 0,   adverse: 0.6,  ceiling: 14, autoRot: 0, rollK: 2.2, maxBank: 0.95, maxPitch: 0.6, turnAssist: 0, stabMin: 0.3, protect: 0, dampMin: 0.35, flare: 0, hard: 1.7, maxDive: 0.6, pathHold: 0, yawStab: 3.2, rudder: 1.3 },
  };
  // lift coefficient: straight line to the stall, then falling away; a flat plate has no lift at zero angle and stalls sooner
  function CL(a, m, flat = false) {
    const cl0 = flat ? 0 : m.CL0, aS = flat ? m.aStall - 0.05 : m.aStall, peak = cl0 + m.CLa * aS, aNeg = -aS - 0.08 - (flat ? 0 : 0.06);
    if (a > aS) return Math.max(peak * 0.5, peak - (a - aS) * 3.2);
    if (a < aNeg) return Math.min(-(peak - cl0) * 0.4, cl0 + m.CLa * aNeg + (aNeg - a) * 3.2);
    return cl0 + m.CLa * a;
  }
  function CD(a, cl, m) {
    let cd = m.CD0 + m.kInd * cl * cl;
    const aS = m.aStall; if (a > aS) cd += 1.4 * (a - aS); if (a < -aS) cd += 1.4 * (-aS - a);
    return cd;
  }
  const newton = acc => acc / K * MASS, lbf = acc => newton(acc) * 0.224809;
  const mphToU = mph => mph * 0.44704 * K, uToMph = u => u / K * 2.23694;

  function create() {
    return { pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),   // w = (pitch up, yaw left, roll right) rates
      ground: true, gPitch: 0, V: 0, alpha: 0, beta: 0, cl: 0, cd: 0, L: 0, D: 0, T: 0, density: 1, touch: null, stalled: false,
      fL: new THREE.Vector3(), fD: new THREE.Vector3(), fT: new THREE.Vector3(), fW: new THREE.Vector3(0, -G, 0) };
  }
  const f = new THREE.Vector3(), u = new THREE.Vector3(), l = new THREE.Vector3(), air = new THREE.Vector3(), aHat = new THREE.Vector3(), lift = new THREE.Vector3(),
    acc = new THREE.Vector3(), c = new THREE.Vector3(), org = new THREE.Vector3(), axis = new THREE.Vector3(), dq = new THREE.Quaternion(), eul = new THREE.Euler();
  const axes = q => { f.set(0, 0, 1).applyQuaternion(q); u.set(0, 1, 0).applyQuaternion(q); l.set(1, 0, 0).applyQuaternion(q); };

  // place the Flyer standing on its skids at (x, z), facing heading (0 = north, +z)
  function reset(s, x, z, heading, groundY) {
    s.q.setFromEuler(eul.set(0, heading, 0, 'YXZ')); s.vel.set(0, 0, 0); s.w.set(0, 0, 0); s.ground = true; s.gPitch = 0; s.touch = null;
    s.pos.set(x, groundY + CGH, z);
  }
  // where the skids are (the model's origin) for the current state
  const origin = (s, out) => out.copy(s.pos).sub(c.set(0, CGH, 0).applyQuaternion(s.q));

  // inp: { thr 0..1, pitch −1..1 (+ nose up), roll −1..1 (+ right), link (rudder linked to warping), brake }
  // env: { model, wind (Vector3, the air's velocity), ground(x, z), onRail(x, z) }
  function step(s, inp, env, dt) {
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) sub(s, inp, env, h);
  }
  function sub(s, inp, env, h) {
    const m = env.model; axes(s.q);
    air.copy(s.vel).sub(env.wind);                                    // the Flyer's velocity through the air
    const V = air.length(), vf = air.dot(f), vu = air.dot(u), vl = air.dot(l);
    s.V = V;
    s.alpha = V > 0.2 ? Math.atan2(-vu, Math.abs(vf)) : 0;
    s.beta = V > 0.2 ? Math.atan2(vl, Math.abs(vf) + 0.05) : 0;
    s.density = THREE.MathUtils.clamp(1 - Math.max(0, s.pos.y - m.ceiling) / 12, 0.25, 1);
    const qd = C_AERO * V * V * s.density;
    s.cl = CL(s.alpha, m); s.cd = CD(s.alpha, s.cl, m); s.stalled = s.alpha > m.aStall;
    if (V > 1e-3) aHat.copy(air).divideScalar(V); else aHat.copy(f);
    lift.copy(u).addScaledVector(aHat, -u.dot(aHat)); if (lift.lengthSq() > 1e-8) lift.normalize();
    s.L = qd * s.cl; s.D = qd * s.cd; s.T = inp.thr * m.Tmax * Math.max(0, 1 - V / m.Vprop) * s.density;
    s.fL.copy(lift).multiplyScalar(s.L); s.fD.copy(aHat).multiplyScalar(-s.D); s.fT.copy(f).multiplyScalar(s.T);
    acc.copy(s.fL).add(s.fD).add(s.fT).add(s.fW).addScaledVector(l, -qd * 0.6 * s.beta);   // side force resists sideslip
    s.vel.addScaledVector(acc, h); s.pos.addScaledVector(s.vel, h);
    if (!s.ground) {
      // control power goes with airspeed²; the stabilising moments keep some strength even when slow, so a stalled Flyer
      // still drops its nose and gathers speed again. Full elevator moves the trim angle of attack by m.elev (radians).
      const ctl = Math.min(1.6, (V / 7) ** 2) * s.density, stab = Math.max(m.stabMin, ctl), dmp = Math.max(m.dampMin, Math.sqrt(ctl)), bank = Math.atan2(l.y, u.y);
      const pitchAtt = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)), over = (x, lim) => Math.sign(x) * Math.max(0, Math.abs(x) - lim);
      // soft limits (gentler in Arcade): the nose won't zoom far past the limit attitude, nor the wings past the limit bank
      // Arcade turn assist: a banked wing has to make more lift to hold height, so the elevator gets the extra by itself
      // Arcade stall protection: near the stalling angle the elevator eases the nose down by itself
      // Arcade path hold: the stick asks for a climb or a dive; hands off, the Flyer settles onto a gentle climb under power
      // or a shallow glide without it, instead of swinging through the long nose-up, nose-down phugoid a real airplane flies
      let pIn = (m.pathHold ? 0.5 : 1) * inp.pitch + (m.turnAssist ? THREE.MathUtils.clamp((1 / Math.max(0.3, Math.cos(bank)) - 1) * m.turnAssist, 0, 0.9) : 0);
      if (m.protect) pIn -= Math.max(0, s.alpha - (m.aStall - 0.05)) * m.protect;
      if (m.pathHold) { const gam = Math.asin(THREE.MathUtils.clamp(s.vel.y / Math.max(1, s.vel.length()), -1, 1)), gamT = -0.09 + 0.2 * inp.thr + inp.pitch * (inp.pitch > 0 ? 0.22 : 0.3);
        pIn += THREE.MathUtils.clamp((gamT - gam) * m.pathHold, -1, 1); }
      if (m.flare && inp.agl !== undefined && inp.agl < 1.6 && s.vel.y < -0.3 && inp.pitch > -0.2) pIn += Math.min(0.9, -s.vel.y * m.flare) * (1 - inp.agl / 1.6);   // Arcade: flare before touching down
      pIn = THREE.MathUtils.clamp(pIn, -1.5, 1.4);
      // damping acts on the rates relative to a coordinated turn at this bank: in a turn the body has to pitch and yaw to
      // follow the curving path, and that must not be fought
      // the path's turn rate comes from the lift that actually points sideways, so it never asks for more than the wing gives
      const vh = Math.max(2, Math.hypot(air.x, air.z)), latX = air.z / vh, latZ = -air.x / vh;      // horizontal, to the left of the path
      const omega = THREE.MathUtils.clamp((s.fL.x * latX + s.fL.z * latZ) / vh, -1, 1);               // + = turning left
      const qT = -omega * Math.sin(bank), rT = omega * Math.cos(bank);
      const pitchAcc = 6.0 * (ctl * m.elev * pIn - stab * (s.alpha - m.trim)) - 3.2 * (s.w.x - qT) * dmp - stab * 24 * over(pitchAtt, pitchAtt > 0 ? m.maxPitch : m.maxDive);
      let rollAcc = ctl * m.rollK * inp.roll - 3.6 * s.w.z * dmp - stab * 24 * over(bank, m.maxBank);
      if (Math.abs(inp.roll) < 0.08) rollAcc -= m.level * bank * dmp;   // arcade: the wings settle level when you let go
      const yawAcc = stab * m.yawStab * s.beta + ctl * (m.adverse - (inp.link ? m.rudder : 0)) * inp.roll - 2.2 * (s.w.y - rT) * dmp;
      s.w.x += pitchAcc * h; s.w.y += yawAcc * h; s.w.z += rollAcc * h;
      axis.set(-s.w.x, s.w.y, s.w.z); const ang = axis.length() * h;  // body rates → a rotation in the body frame
      if (ang > 1e-9) { s.q.multiply(dq.setFromAxisAngle(axis.normalize(), ang)); s.q.normalize(); }
    }
    contact(s, inp, env, h);
  }
  // the skids against the ground
  function contact(s, inp, env, h) {
    const m = env.model; axes(s.q); origin(s, org);
    const g = env.ground(org.x, org.z);
    if (org.y > g + 0.002) { s.ground = false; return; }
    if (!s.ground) { s.touch = { impact: Math.max(0, -s.vel.y), bank: Math.atan2(l.y, u.y), pitch: Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)) }; s.gPitch = Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)); }
    s.ground = true;
    if (s.vel.y < 0) s.vel.y = 0;
    const hd = Math.atan2(f.x, f.z), fx = Math.sin(hd), fz = Math.cos(hd);
    let vF = s.vel.x * fx + s.vel.z * fz, vL = s.vel.x * fz - s.vel.z * fx;     // along the skids, and sideways (left)
    vL *= Math.exp(-10 * h);
    const load = Math.max(0, 1 - Math.max(0, s.fL.y) / G), mu = env.onRail(org.x, org.z) ? m.muRail : m.muSand;
    const dec = (mu * G * load + (inp.brake ? 2.5 : 0)) * h;
    vF = Math.abs(vF) <= dec ? 0 : vF - Math.sign(vF) * dec;
    s.vel.x = fx * vF + fz * vL; s.vel.z = fz * vF - fx * vL;
    // on the skids: wings level, nose along the ground (lifted a little by the elevator once there is air over it), steering
    const slope = Math.atan2(env.ground(org.x + fx * 0.9, org.z + fz * 0.9) - env.ground(org.x - fx * 0.9, org.z - fz * 0.9), 1.8);
    const ctl = Math.min(1.6, (s.V / 7) ** 2);
    const rot = Math.max(0, inp.pitch) * 0.14 * Math.min(1, ctl) + (m.autoRot && s.V > m.autoRot ? 0.07 : 0);   // arcade lifts the nose by itself at take-off speed
    s.gPitch += (slope + rot - s.gPitch) * (1 - Math.exp(-6 * h));
    const yawRate = -inp.roll * (0.45 + Math.min(Math.abs(vF), 4) * 0.28);
    s.q.setFromEuler(eul.set(-s.gPitch, hd + yawRate * h, 0, 'YXZ'));
    s.w.set(0, yawRate, 0);
    s.pos.y = g + c.set(0, CGH, 0).applyQuaternion(s.q).y;
  }
  // the attitude for the instruments: heading (0 = north), pitch (nose up +), bank (right +)
  function attitude(s) {
    axes(s.q);
    return { heading: Math.atan2(f.x, f.z), pitch: Math.asin(THREE.MathUtils.clamp(f.y, -1, 1)), bank: Math.atan2(l.y, u.y) };
  }

  return { K, G, MASS, C_AERO, CGH, MODELS, CL, CD, newton, lbf, mphToU, uToMph, create, reset, step, origin, attitude };
})();
