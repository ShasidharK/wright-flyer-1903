// Kill Devil Hills, 17 December 1903, in scene units (the Flyer's metres × K). North is +z, east is −x (the Atlantic).
// Sand terrain with contour hairlines and a draped grid, the big dune to the south-west, the camp, the launch rail and the
// four flight markers on the line the flights took, north into the wind.
const WF_WORLD = (() => {
  const K = WF_MODEL.K, HALF = 80, WATER = -0.6;
  const RAIL = { x: 0, z0: -70, z1: -70 + 18.288 * K };            // 60 ft of rail
  const START = [0, -69.2];                                           // the Flyer on its truck at the start of the rail
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // dunes: [x, z, radius, height, keepOnFlightLine]
  const DUNES = [[36, -48, 26, 12.5, 1], [-32, 18, 11, 2.2], [30, 34, 13, 2.8], [-46, -38, 10, 1.9], [58, 8, 9, 1.7], [-20, 54, 10, 2.1],
    [14, 66, 8, 1.3], [62, -14, 8, 1.4], [66, 52, 12, 2.6], [-40, 70, 9, 1.5], [44, 74, 10, 1.8], [-56, -66, 9, 1.2]];
  function terrain(x, z) {
    const line = sm(3, 11, Math.abs(x));                              // the flight line runs north along x = 0: keep it level
    const calm = Math.max(sm(2, 6, Math.abs(x)), sm(-58, -50, z));    // and no ripples under the rail
    let h = 0;
    for (const [cx, cz, r, hh, keep] of DUNES) { const d = Math.hypot(x - cx, (z - cz) * 1.15); if (d < r) h += hh * Math.pow(0.5 + 0.5 * Math.cos(Math.PI * d / r), 1.3) * (keep ? 1 : line); }
    h += (0.12 * Math.sin(x * 0.55 + z * 0.21) * Math.sin(z * 0.43 - x * 0.12) + 0.05 * Math.sin(x * 1.3 + z * 0.9)) * (0.25 + 0.75 * line) * calm;
    h -= sm(56, 68, -x + 3 * Math.sin(z * 0.05)) * 1.7;               // the beach falls away into the Atlantic
    return h;
  }
  const onRail = (x, z) => Math.abs(x - RAIL.x) < 0.4 && z > RAIL.z0 - 0.3 && z < RAIL.z1 + 0.1;
  const ground = (x, z) => onRail(x, z) ? 0.14 : Math.max(terrain(x, z), WATER);       // on the rail the Flyer rides its truck

  // a styled solid: body fill, silhouette shell and crease hairlines, like the robot parts
  function solid(geo, name, parent, mat = bodyMat) {
    smoothNormals(geo);
    const m = new THREE.Mesh(geo, mat); m.name = name;
    const sh = new THREE.Mesh(geo, isoOutlineMat); sh.userData.outline = true; m.add(sh);
    m.add(fat(creaseLines(geo, 30), lineMat)); const mj = fat(creaseLines(geo, 60), majorMat); mj.renderOrder = 1; m.add(mj);
    parent.add(m); return m;
  }
  const at = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  const box = (w, h, d, x, y, z, rx, ry, rz) => at(new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  const merge = list => { const gs = list.map(g => g.index ? g.toNonIndexed() : g); let n = 0; gs.forEach(g => { g.deleteAttribute('uv'); n += g.attributes.position.count; });
    const pos = new Float32Array(n * 3); let o = 0; gs.forEach(g => { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; });
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = mergeVertices(out, 1e-5); m.computeVertexNormals(); return m; };
  const rnd = (s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; })(1903);

  const places = {};                                                  // key → { g, meshes, centre (local), size }
  function place(g0, key, x, z, ry = 0, y = null) {
    const g = new THREE.Group(); g.position.set(x, y ?? terrain(x, z), z); g.rotation.y = ry; g.userData.wf = key; g.userData.place = true; g0.add(g);
    places[key] = { key, g, meshes: [] }; return g;
  }
  const addMesh = (key, geo, name, mat) => { const m = solid(geo, name, places[key].g, mat); places[key].meshes.push(m); return m; };

  const windows = [], lanterns = [];
  // things you can't walk or taxi through: [x, z, half-width, half-depth, turn, height] (scene units)
  const obstacles = [];
  const MAT = {};                                                     // textured surfaces, made on first build (the shader needs the page)
  let waves = null, gridMat = null;

  let group = null;
  function build(root) {
    const g0 = new THREE.Group(); root.add(g0); group = g0;            // the whole field, shown only in the Kitty Hawk mode
    // ── terrain: one sheet, 1-unit cells, past the edge of the field so the horizon is sand and sea ──
    const N = 220, X0 = -110, H = new Float32Array((N + 1) * (N + 1));
    const tg = new THREE.PlaneGeometry(N, N, N, N).rotateX(-Math.PI / 2), tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = terrain(tp.getX(i), tp.getZ(i)); tp.setY(i, y); }
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = terrain(X0 + i, X0 + j);
    tg.computeVertexNormals();
    MAT.sand = WF_LOOK.surface('sand', { rough: 0.97 }); MAT.sea = WF_LOOK.surface('sea', { rough: 0.6, metal: 0.1 });
    MAT.planks = WF_LOOK.surface('planks', { scale: 1 / K }); MAT.wood = WF_LOOK.surface('wood', { scale: 1 / K }); MAT.stone = WF_LOOK.surface('stone', { scale: 1 / K, rough: 0.95 });
    const land = new THREE.Mesh(tg, MAT.sand); land.name = 'terrain'; g0.add(land);

    // contours every 0.6 units (every fifth brighter) and the shoreline
    const minor = [], major = [], STEP = 0.6;
    const cell = (i, j) => H[j * (N + 1) + i];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const c = [[i, j, cell(i, j)], [i + 1, j, cell(i + 1, j)], [i + 1, j + 1, cell(i + 1, j + 1)], [i, j + 1, cell(i, j + 1)]];
      const lo = Math.min(...c.map(v => v[2])), hi = Math.max(...c.map(v => v[2]));
      const levels = []; for (let k = Math.ceil(lo / STEP); k * STEP <= hi; k++) if (k > 0) levels.push([k * STEP, k % 5 === 0]);
      if (lo < WATER && hi > WATER) levels.push([WATER + 0.001, true]);
      for (const [L, big] of levels) {
        const pts = [];
        for (let e = 0; e < 4; e++) { const a = c[e], b = c[(e + 1) % 4]; if ((a[2] - L) * (b[2] - L) < 0) { const t = (L - a[2]) / (b[2] - a[2]); pts.push(X0 + a[0] + (b[0] - a[0]) * t, L + 0.03, X0 + a[1] + (b[1] - a[1]) * t); } }
        const out = big ? major : minor;
        if (pts.length >= 6) out.push(...pts.slice(0, 6)); if (pts.length === 12) out.push(...pts.slice(6, 12));
      }
    }
    g0.add(fat(minor, lineMat)); { const l = fat(major, majorMat); l.renderOrder = 1; g0.add(l); }

    // a faint grid draped over the sand, and the edge of the field
    gridMat = new LineMaterial({ color: EDGE_COL.clone(), ...lineOpts });
    const grid = [];
    for (let u = -HALF; u <= HALF; u += 5) for (let v = -HALF; v < HALF; v += 1) {
      for (const [x0, z0, x1, z1] of [[u, v, u, v + 1], [v, u, v + 1, u]]) { const a = terrain(x0, z0), b = terrain(x1, z1); if (a > WATER && b > WATER) grid.push(x0, a + 0.02, z0, x1, b + 0.02, z1); }
    }
    g0.add(fat(grid, gridMat));
    const E = HALF - 0.45, edge = [];
    for (let v = -E; v < E; v += 1) for (const [x0, z0, x1, z1] of [[v, -E, v + 1, -E], [v, E, v + 1, E], [-E, v, -E, v + 1], [E, v, E, v + 1]]) edge.push(x0, ground(x0, z0) + 0.04, z0, x1, ground(x1, z1) + 0.04, z1);
    g0.add(fat(edge, majorMat));

    // the Atlantic: a flat sheet with long swell lines that drift
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(170, 300).rotateX(-Math.PI / 2), MAT.sea); sea.position.set(-145, WATER, 0); g0.add(sea);
    waves = new THREE.Group(); g0.add(waves); const wl = [];
    for (let k = 0; k < 16; k++) { const x = -64 - k * 3.2; for (let z = -120; z < 120; z += 2) wl.push(x + 0.7 * Math.sin(z * 0.11 + k), WATER + 0.02, z, x + 0.7 * Math.sin((z + 2) * 0.11 + k), WATER + 0.02, z + 2); }
    waves.add(fat(wl, lineMat));

    // marram grass on the dunes
    const grass = [];
    for (let n = 0; n < 1600; n++) {
      const x = (rnd() * 2 - 1) * HALF, z = (rnd() * 2 - 1) * HALF, h = terrain(x, z);
      if (h < 0.35 || Math.abs(x) < 6) continue;
      for (let b = 0; b < 3; b++) { const dx = (rnd() - 0.5) * 0.25, dz = (rnd() - 0.5) * 0.25, t = 0.16 + rnd() * 0.18;
        grass.push(x + dx, h, z + dz, x + dx * 2.2 + (rnd() - 0.5) * 0.12, h + t, z + dz * 2.2); }
    }
    g0.add(fat(grass, lineMat));

    // ── the camp ──
    const house = (w, L, hw, ridge) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, hw); s.lineTo(0, hw + ridge); s.lineTo(-w / 2, hw);
      return new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-L / 2, 0, 0); };
    { const g = place(g0, 'hangar', 9, -63);                         // 44 × 16 ft
      addMesh('hangar', merge([house(16 * 0.3048 * K, 44 * 0.3048 * K, 1.2, 0.5), box(44 * 0.3048 * K + 0.1, 0.05, 0.08, 0, 1.72, 0)]), 'hangar', MAT.planks);
      obstacles.push([9, -63, 44 * 0.3048 * K / 2, 16 * 0.3048 * K / 2, 0, 1.7]);
      const d = 1.0, y = 0.95, z = 16 * 0.3048 * K / 2 + 0.004; g.add(fat([-d, 0, z, -d, y, z, -d, y, z, d, y, z, d, y, z, d, 0, z, 0, 0, z, 0, y, z], lineMat)); }
    { const g = place(g0, 'camp', 17, -70, 0.2);                      // 25 × 16 ft
      const w = 16 * 0.3048 * K, L = 25 * 0.3048 * K, z = w / 2 + 0.006;
      addMesh('camp', merge([house(w, L, 1.2, 0.45), box(0.18, 0.5, 0.18, 0.9, 1.5, -0.3), box(0.5, 0.08, 0.3, -0.2, 0.04, z + 0.15)]), 'camp', MAT.planks);
      obstacles.push([17, -70, L / 2, w / 2, 0.2, 1.65]);
      g.add(fat([-0.2, 0, z, -0.2, 0.85, z, -0.2, 0.85, z, 0.2, 0.85, z, 0.2, 0.85, z, 0.2, 0, z], lineMat));
      for (const x of [-1.2, 0.8]) { const m = glowMat(); m.side = THREE.DoubleSide; const win = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.28), m); win.position.set(x, 0.7, z); g.add(win); windows.push(m); places.camp.meshes.push(win); }
      const lamp = new THREE.PointLight(accent.clone(), 0, 7, 1.4); lamp.position.set(-0.2, 0.75, z + 0.6); g.add(lamp); lanterns.push(lamp); themeHooks.push(() => lamp.color.copy(accent)); }

    // the launch rail with its truck, the takeoff boulder, the four markers, Orville's camera
    { place(g0, 'rail', RAIL.x, (RAIL.z0 + RAIL.z1) / 2, 0, 0); const L = RAIL.z1 - RAIL.z0, list = [box(0.045, 0.045, L, 0, 0.0225, 0), box(0.02, 0.008, L, 0, 0.049, 0)];
      for (let z = -L / 2 + 0.3; z < L / 2; z += 1) list.push(box(0.36, 0.02, 0.06, 0, 0.01, z));
      const zt = START[1] - (RAIL.z0 + RAIL.z1) / 2;                 // the truck: a plank on two small wheels that ride the rail
      list.push(box(0.9, 0.025, 0.15, 0, 0.1255, zt), box(0.05, 0.03, 0.2, 0, 0.098, zt));
      for (const dz of [-0.07, 0.07]) list.push(at(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 14), 0, 0.083, zt + dz, 0, 0, Math.PI / 2));
      addMesh('rail', merge(list), 'rail', MAT.wood); }
    { place(g0, 'boulder', 1.1, RAIL.z1 + 0.4); const b = new THREE.IcosahedronGeometry(0.42, 1), p = b.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.12 * Math.sin(x * 17.1 + y * 9.3) * Math.cos(z * 13.7 - x * 5.1); p.setXYZ(i, x * k, Math.max(-0.05, y * 0.65 * k) + 0.12, z * k * 0.85); }
      addMesh('boulder', merge([b]), 'boulder', MAT.stone); obstacles.push([1.1, RAIL.z1 + 0.4, 0.45, 0.4, 0, 0.4]); }
    const slab = () => { const s = new THREE.Shape(); s.moveTo(-0.07, 0); s.lineTo(0.07, 0); s.lineTo(0.07, 0.36); s.lineTo(-0.07, 0.44); return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-0.15, 0, 0); };
    [120, 175, 200, 852].forEach((ft, i) => { const key = 'marker' + (i + 1), z = RAIL.z1 + ft * 0.3048 * K; place(g0, key, 0.7, z); addMesh(key, slab(), key, MAT.stone); obstacles.push([0.7, z, 0.2, 0.12, 0, 0.44]); });
    { const x = -4.5, z = -57.5, g = place(g0, 'camera', x, z, Math.atan2(RAIL.x - x, RAIL.z1 - z)), list = [];
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3, f = new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), top = new THREE.Vector3(0, 0.62, 0);
        const d = top.clone().sub(f), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
        list.push(new THREE.CylinderGeometry(0.01, 0.012, d.length(), 6).applyMatrix4(new THREE.Matrix4().compose(f.clone().add(top).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)))); }
      list.push(box(0.13, 0.12, 0.17, 0, 0.69, 0), at(new THREE.CylinderGeometry(0.035, 0.04, 0.06, 14), 0, 0.69, 0.11, Math.PI / 2, 0, 0));
      addMesh('camera', merge(list), 'camera', MAT.wood); obstacles.push([x, z, 0.25, 0.25, 0, 0.7]); }
    // camp clutter: water barrels with hoops, a sawhorse workbench, crates of parts
    { const g = new THREE.Group(), parts = []; g0.add(g);
      for (const [x, z] of [[19.9, -68.3], [20.4, -68.9]]) { const y = terrain(x, z); parts.push(at(new THREE.CylinderGeometry(0.15, 0.13, 0.42, 16), x, y + 0.21, z));
        g.add(fat([0.11, 0.33, 0.37].flatMap(h => { const o = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2, r = 0.152; o.push(x + Math.cos(a) * r, y + h, z + Math.sin(a) * r, x + Math.cos(b) * r, y + h, z + Math.sin(b) * r); } return o; }), majorMat));
        obstacles.push([x, z, 0.18, 0.18, 0, 0.42]); }
      { const x = 13.4, z = -67.4, y = terrain(x, z), bench = [box(1.4, 0.04, 0.32, x, y + 0.43, z)];
        for (const dx of [-0.55, 0.55]) for (const s of [-1, 1]) bench.push(at(new THREE.BoxGeometry(0.035, 0.46, 0.035), x + dx, y + 0.21, z + s * 0.1, s * 0.25, 0, 0));
        parts.push(...bench); obstacles.push([x, z, 0.72, 0.2, 0, 0.45]); }
      for (const [x, z, r, sz] of [[14.9, -68.2, 0.3, 0.32], [15.3, -67.8, 0.1, 0.24]]) { const y = terrain(x, z); parts.push(at(new THREE.BoxGeometry(sz * 1.3, sz, sz), x, y + sz / 2, z, 0, r, 0)); obstacles.push([x, z, sz * 0.7, sz * 0.6, r, sz]); }
      solid(merge(parts), 'campClutter', g, MAT.wood); }
    // the dune and the sea have no solid of their own: an anchor for the label and the camera
    place(g0, 'hill', 36, -48, 0, terrain(36, -48)); place(g0, 'ocean', -78, 0, 0, WATER);
    Object.values(places).forEach(P => {
      const b = new THREE.Box3(); P.g.updateMatrixWorld(true); const inv = P.g.matrixWorld.clone().invert();
      P.meshes.forEach(m => { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox.clone().applyMatrix4(inv.clone().multiply(m.matrixWorld))); });
      if (b.isEmpty()) b.setFromCenterAndSize(new THREE.Vector3(0, 1, 0), new THREE.Vector3(30, 2, 30));
      P.box = b; P.centre = b.getCenter(new THREE.Vector3()); P.size = b.getSize(new THREE.Vector3()).length();
    });
  }

  function tick(now, lights) {
    WF_LOOK.tick(now);
    if (waves) waves.position.x = 0.8 * Math.sin(now / 2600);
    const dark = theme === 'dark';
    windows.forEach(m => { m.emissiveIntensity = lights ? 1.1 : 0; });
    lanterns.forEach(l => { l.intensity = lights && dark ? 2.4 : 0; });
    if (gridMat) { gridMat.color.copy(BG_COL).lerp(lineMat.color, 0.55); gridMat.linewidth = lineMat.linewidth; gridMat.resolution.copy(lineMat.resolution); }
  }

  return { HALF, WATER, RAIL, START, terrain, ground, onRail, build, tick, solid, places, obstacles, MAT, get group() { return group; } };
})();
