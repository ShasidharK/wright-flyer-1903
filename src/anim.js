// Animated .glb → iso-glow 3D, keeping the model's node tree so its own animation clips play.
// isoGlb(elId, size, done) loads the base64 glb in <script type="application/octet-stream" id=elId>, styles it and fits it.
// Nothing animated is touched: each mesh becomes an invisible holder (it keeps its name, node, children and morph weights,
// so the clips still bind to it) and gets a styled twin as its child, rescaled so the twin's geometry is in scene units.
// The crease finder has fixed tolerances (merge 1e-4, drop fragments < 6 cm) that only work at scene scale — the robot's
// parts are stored 0.01 units big and blown up ×56 by their nodes, which used to merge points wrongly and drop most lines.
// · rigid mesh   → body material, silhouette shell and crease hairlines as children: they ride the node's animation
// · skinned mesh → stays skinned (no cracks); its shell is skinned too; crease hairlines are pinned to the bone that
//                  carries most of each segment's weight (exact on rigid parts, a hair off across soft joints)
// · morph targets (face expressions) → the shell follows them; crease hairlines stay on the neutral shape

// silhouette shell that also understands skinning and morph targets; shares the template outline's uniforms, so theme,
// resolution and line weight changes reach it. Extrudes along a smoothed normal, so flat-shaded corners don't split it open.
const isoOutlineMat = new THREE.ShaderMaterial({
  uniforms: outlineMat.uniforms,
  vertexShader: `uniform float thickness; uniform vec2 res; attribute vec3 outlineNormal;
    #include <common>
    #include <morphtarget_pars_vertex>
    #include <skinning_pars_vertex>
    void main() {
      vec3 objectNormal = outlineNormal;
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <morphtarget_vertex>
      #include <skinning_vertex>
      vec4 p = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      vec4 n = projectionMatrix * vec4(normalize(normalMatrix * objectNormal), 0.0);
      vec2 d = length(n.xy) > 1e-5 ? normalize(n.xy) : vec2(0.0);
      p.xy += d * thickness * 2.0 / res * p.w;
      gl_Position = p;
    }`,
  fragmentShader: outlineMat.fragmentShader,
  // no depth push (the template's shell is pushed back for cabin interiors): a part in front of another — the robot's eyes on
  // its face — keeps its outline instead of sinking behind the surface just behind it
  side: THREE.BackSide,
});
const isoHidden = new THREE.MeshBasicMaterial({ visible: false });

// area-weighted face normals summed per position: one normal per corner, however the mesh is split for flat shading
function smoothNormals(g) {
  const p = g.attributes.position, n = p.count, key = i => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  const id = new Map(), slot = new Int32Array(n); for (let i = 0; i < n; i++) { const k = key(i); if (!id.has(k)) id.set(k, id.size); slot[i] = id.get(k); }
  const acc = new Float32Array(id.size * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), vi = q => g.index ? g.index.getX(q) : q;
  const cnt = g.index ? g.index.count : n;
  for (let f = 0; f < cnt; f += 3) {
    const i0 = vi(f), i1 = vi(f + 1), i2 = vi(f + 2);
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1).sub(a); c.fromBufferAttribute(p, i2).sub(a); b.cross(c);
    for (const i of [i0, i1, i2]) { acc[slot[i] * 3] += b.x; acc[slot[i] * 3 + 1] += b.y; acc[slot[i] * 3 + 2] += b.z; }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a.fromArray(acc, slot[i] * 3); if (a.lengthSq() < 1e-20) a.set(0, 1, 0); a.normalize().toArray(out, i * 3); }
  g.setAttribute('outlineNormal', new THREE.BufferAttribute(out, 3));
  return slot;
}

// crease hairlines of a skinned twin, each segment pinned to its heaviest bone (in that bone's space, from the bind pose)
function skinCreases(sm, slot) {
  const g = sm.geometry, p = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const first = new Map(); for (let i = 0; i < p.count; i++) if (!first.has(slot[i])) first.set(slot[i], i);
  const keyAt = (x, y, z) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`, byKey = new Map();
  for (let i = 0; i < p.count; i++) byKey.set(keyAt(p.getX(i), p.getY(i), p.getZ(i)), i);
  const near = (x, y, z) => { const i = byKey.get(keyAt(x, y, z)); if (i !== undefined) return i;   // mergeVertices moved it a hair: nearest vertex
    let best = 0, bd = Infinity; for (let j = 0; j < p.count; j++) { const d = (p.getX(j) - x) ** 2 + (p.getY(j) - y) ** 2 + (p.getZ(j) - z) ** 2; if (d < bd) { bd = d; best = j; } } return best; };
  const bones = sm.skeleton.bones, inv = sm.skeleton.boneInverses, M = new THREE.Matrix4(), v = new THREE.Vector3();
  [[30, lineMat, 0], [MAJOR_ANGLE, majorMat, 1]].forEach(([thr, mat, order]) => {
    const segs = creaseLines(g, thr), per = new Map(), score = new Map();
    for (let s = 0; s < segs.length; s += 6) {
      score.clear();
      for (const o of [0, 3]) { const i = near(segs[s + o], segs[s + o + 1], segs[s + o + 2]); for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > 0) score.set(si.getComponent(i, k), (score.get(si.getComponent(i, k)) || 0) + w); } }
      let bb = 0, bw = -1; score.forEach((w, b) => { if (w > bw) { bw = w; bb = b; } });
      (per.get(bb) || per.set(bb, []).get(bb)).push(...segs.slice(s, s + 6));
    }
    // attached bind mode: world = Σ bone.matrixWorld · boneInverse · bindMatrix · v, so in the bone's own space: boneInverse · bindMatrix · v
    per.forEach((arr, b) => {
      M.copy(inv[b]).multiply(sm.bindMatrix);
      for (let i = 0; i < arr.length; i += 3) { v.fromArray(arr, i).applyMatrix4(M).toArray(arr, i); }
      const l = fat(arr, mat); l.renderOrder = order; bones[b].add(l);
    });
  });
}

// contact lines: where two parts that move together pass into each other (eyes set into a face, a rivet in a band), the
// visible edge is neither a silhouette nor a crease of either part, so neither shows it. Intersect their triangles once, in
// their shared parent's space, and hang the result on one of them as a fold line. Parts moved by a transform track are skipped.
function contactLines(twins, clips) {
  const moved = new Set(clips.flatMap(c => c.tracks.filter(t => /\.(position|quaternion|scale)$/.test(t.name)).map(t => t.name.replace(/\.[^.]+$/, ''))));
  const groups = new Map();
  twins.forEach(t => { const h = t.parent; if (t.isSkinnedMesh || moved.has(h.name)) return; (groups.get(h.parent) || groups.set(h.parent, []).get(h.parent)).push(t); });
  const rel = t => t.parent.matrix.clone().multiply(t.matrix);   // twin → shared parent
  const tris = (t, M) => {   // triangles mapped by M (into the first twin's own space: scene scale, so the tolerances hold), with boxes
    const g = t.geometry, p = g.attributes.position, n = g.index ? g.index.count : p.count, out = [];
    for (let f = 0; f < n; f += 3) { const v = [0, 1, 2].map(q => new THREE.Vector3().fromBufferAttribute(p, g.index ? g.index.getX(f + q) : f + q).applyMatrix4(M)); out.push({ v, box: new THREE.Box3().setFromPoints(v) }); }
    return { t, list: out, box: new THREE.Box3().setFromPoints(out.flatMap(x => x.v)) };
  };
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), h = new THREE.Vector3(), sv = new THREE.Vector3(), qv = new THREE.Vector3();
  const segTri = (a, b, [p0, p1, p2]) => {   // Möller–Trumbore on segment a→b
    const d = b.clone().sub(a); e1.subVectors(p1, p0); e2.subVectors(p2, p0); h.crossVectors(d, e2); const det = e1.dot(h); if (Math.abs(det) < 1e-12) return null;
    const f = 1 / det; sv.subVectors(a, p0); const u = f * sv.dot(h); if (u < 0 || u > 1) return null;
    qv.crossVectors(sv, e1); const v = f * d.dot(qv); if (v < 0 || u + v > 1) return null; const t = f * e2.dot(qv); return t >= 0 && t <= 1 ? a.clone().addScaledVector(d, t) : null;
  };
  let count = 0;
  groups.forEach(list => {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const toA = rel(list[i]).invert(), A = tris(list[i], new THREE.Matrix4()), B = tris(list[j], toA.multiply(rel(list[j])));
      if (!A.box.intersectsBox(B.box)) continue;
      const out = [];
      for (const ta of A.list) { if (!ta.box.intersectsBox(B.box)) continue;
        for (const tb of B.list) { if (!ta.box.intersectsBox(tb.box)) continue;
          const pts = [];
          for (const [x, y] of [[0, 1], [1, 2], [2, 0]]) { const q1 = segTri(ta.v[x], ta.v[y], tb.v), q2 = segTri(tb.v[x], tb.v[y], ta.v); if (q1) pts.push(q1); if (q2) pts.push(q2); }
          let far = null, d0 = 1e-5; for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) { const d = pts[a].distanceToSquared(pts[b]); if (d > d0) { d0 = d; far = [pts[a], pts[b]]; } }
          if (far) out.push(...far[0].toArray(), ...far[1].toArray());
        } }
      if (out.length) { const l = fat(out, majorMat); l.renderOrder = 1; l.name = `contact ${A.t.name}×${B.t.name}`; A.t.add(l); count += out.length / 6; }
    }
  });
  return count;
}

// style one mesh: hide it, give it a scene-scale twin with shell and hairlines. s = the mesh's final world scale.
function isoTwin(o, s) {
  const g = o.geometry.clone(); g.scale(s, s, s);
  for (const k in g.morphAttributes) if (k === 'position') g.morphAttributes[k].forEach(a => { for (let i = 0; i < a.array.length; i++) a.array[i] *= s; a.needsUpdate = true; });
  const slot = smoothNormals(g);
  const twin = o.isSkinnedMesh ? new THREE.SkinnedMesh(g, bodyMat) : new THREE.Mesh(g, bodyMat);
  const shell = o.isSkinnedMesh ? new THREE.SkinnedMesh(g, isoOutlineMat) : new THREE.Mesh(g, isoOutlineMat);
  twin.scale.setScalar(1 / s); twin.name = o.name + '·iso'; shell.userData.outline = true;
  if (o.morphTargetInfluences) for (const m of [twin, shell]) { m.morphTargetInfluences = o.morphTargetInfluences; m.morphTargetDictionary = o.morphTargetDictionary; }   // same array: the clip's weights drive all three
  o.material = isoHidden; o.add(twin); twin.add(shell);
  if (o.isSkinnedMesh) {
    twin.updateMatrixWorld(true);
    const bind = o.bindMatrix.clone().multiply(new THREE.Matrix4().makeScale(1 / s, 1 / s, 1 / s));   // the twin's vertices are s× bigger
    for (const m of [twin, shell]) { m.bind(o.skeleton, bind); m.frustumCulled = false; }
    skinCreases(twin, slot);
  } else twMeshes.push(twin);                                        // rigid: the template's creases() hangs the hairlines on it
  return twin;
}

// a robot built in code instead of loaded: build() returns { root, clips } with meshes already at scene scale, each in its
// own holder group (so contact lines can pair parts that move together). Same styling and same result shape as isoGlb.
function isoBuilt(build, done) { setTimeout(async () => { try { isoBuilt0(await build(), done); } catch (e) { console.error(e); done({ err: String(e && e.message || e) }); } }, 0); }   // after the page's own setup, like a loaded model; build may be async
function isoBuilt0(built, done) {
  const { root, clips } = built, fit = new THREE.Group(); fit.add(root);
  const meshes = []; root.traverse(o => { if (o.isMesh && !o.isLineSegments2) meshes.push(o); });   // drawn hairlines (flame, smile) aren't parts
  const first = twMeshes.length;
  meshes.forEach(m => {
    let g = m.geometry; if (!g.index) { g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5); m.geometry = g; }   // lights and contact lines need an index
    smoothNormals(g); m.material = bodyMat; m.name = (m.name || 'part') + '·iso';
    const shell = new THREE.Mesh(g, isoOutlineMat); shell.userData.outline = true; m.add(shell); twMeshes.push(m);
  });
  creases(first);
  root.updateMatrixWorld(true); meshes.forEach(m => m.updateMatrix());
  const contacts = contactLines(meshes, clips);
  const mixer = new THREE.AnimationMixer(root), actions = clips.map(c => mixer.clipAction(c));
  const box = new THREE.Box3().setFromObject(root);
  setTheme(theme);
  done({ root, fit, mixer, clips, actions, canAll: false, height: box.max.y - box.min.y, meshes: meshes.length, contacts, skinned: 0 });
}

// load + style + fit. fit: 'sweep' fits the box the clips sweep (machines), 'rest' fits the rest pose (characters).
function isoGlb(elId, SIZE, done, { fitTo = 'auto' } = {}) {
  const bin = Uint8Array.from(atob(document.getElementById(elId).textContent.trim()), c => c.charCodeAt(0));
  new GLTFLoader().parse(bin.buffer, '', gltf => {
    const root = gltf.scene, fit = new THREE.Group(); fit.add(root);
    const meshes = []; root.traverse(o => { if (o.isMesh) meshes.push(o); });
    const mixer = new THREE.AnimationMixer(root), clips = gltf.animations, actions = clips.map(c => mixer.clipAction(c));
    // clips that move different nodes can play together (a machine split into clips); a character's clips all fight over its bones
    const seen = new Set(), canAll = clips.length > 1 && clips.every(c => { const ns = new Set(c.tracks.map(t => t.name.replace(/\.[^.]+$/, '')));
      const clash = [...ns].some(n => seen.has(n)); ns.forEach(n => seen.add(n)); return !clash; });
    const box = new THREE.Box3(), b = new THREE.Box3(), sample = () => { root.updateMatrixWorld(true);
      meshes.forEach(o => { o.geometry.boundingBox || o.geometry.computeBoundingBox(); box.union(b.copy(o.geometry.boundingBox).applyMatrix4(o.bindMatrix ? o.matrixWorld.clone().multiply(o.bindMatrixInverse).multiply(o.bindMatrix) : o.matrixWorld)); }); };
    sample();
    if (fitTo === 'sweep' || (fitTo === 'auto' && (clips.length < 2 || canAll))) actions.forEach(a => { a.play(); for (let i = 0; i <= 8; i++) { mixer.setTime(a.getClip().duration * i / 8); sample(); } a.stop(); });
    mixer.stopAllAction(); root.updateMatrixWorld(true);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), k = SIZE / Math.max(size.x, size.y, size.z);
    fit.scale.setScalar(k); fit.position.set(-c.x * k, -box.min.y * k, -c.z * k);
    const first = twMeshes.length, e = new THREE.Vector3();
    const twins = meshes.map(o => { const m = o.matrixWorld.elements; return isoTwin(o, Math.hypot(m[0], m[1], m[2]) * k); });
    creases(first);
    twins.forEach(t => t.updateMatrix()); const contacts = contactLines(twins, clips);
    setTheme(theme);                                                  // re-apply: lines made after the first setTheme pick up the palette
    done({ root, fit, mixer, clips, actions, canAll, height: size.y * k, meshes: meshes.length, contacts, skinned: meshes.filter(o => o.isSkinnedMesh).length });
  }, err => done({ err: String(err && err.message || err) }));
}

// generic player: one tab that plays a model's own clips (space play/pause, ←→ clip, ↑↓ speed, r restart)
const animGlb = (id, name, elId, { size: SIZE = 3, credit = '', start = null } = {}) => FIGS3D.push({ id, name, mod: (() => {
  const g0 = new THREE.Group(); g0.visible = false; scene.add(g0);
  const st = { ready: false, ci: 0, playing: true, speed: 1, t: 0, err: '' }, SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4];
  let M = null;
  const view = { target: new THREE.Vector3(0, SIZE * 0.3, 0), dist: SIZE * 2.4 };
  hazeAndShadow(g0, 0, 0, SIZE * 1.1, SIZE * 0.9).uniforms.opacity.value = 0;   // keep the shadow, no sourceless haze
  isoGlb(elId, SIZE, r => {
    if (r.err) { st.err = r.err; readout(); return; }
    M = r; g0.add(r.fit); view.target.set(0, r.height / 2, 0); if (active === id) act.iso();
    const si = start ? r.clips.findIndex(c => start.test(c.name)) : -1;   // optional first clip, by name
    (window.__anim = window.__anim || {})[id] = r;
    st.ready = true; play(si >= 0 ? si : r.canAll ? -1 : 0);
  });
  function play(ci) { if (!M) return; st.ci = ci; M.mixer.stopAllAction(); (ci < 0 ? M.actions : [M.actions[ci]]).forEach(a => a && a.reset().play()); M.mixer.setTime(0); st.t = 0; readout(); }
  const dur = () => st.ci < 0 ? Math.max(0, ...M.clips.map(c => c.duration)) : (M.clips[st.ci] ? M.clips[st.ci].duration : 0);
  function readout() {
    if (active !== id) return; const el = document.getElementById('read');
    if (st.err) { el.textContent = 'could not load model · ' + st.err; return; }
    if (!st.ready) { el.textContent = 'loading model…'; return; }
    if (!M.clips.length) { el.textContent = `no animation clips · ${M.meshes} parts`; return; }
    const d = dur(), name = st.ci < 0 ? `all ${M.clips.length} clips` : M.clips[st.ci].name || `clip ${st.ci + 1}`;
    el.textContent = `${name} · ${(d ? st.t % d : 0).toFixed(2)} / ${d.toFixed(2)} s · ${st.speed}×${st.playing ? '' : ' · paused'}`;
  }
  const toggle = () => { st.playing = !st.playing; SFX.detent(); readout(); return true; };
  const step = d => { if (!M || !M.clips.length) return true; const a = M.canAll ? 1 : 0, n = M.clips.length + a; play((((st.ci + a + d) % n) + n) % n - a); SFX.bit(1); return true; };
  const speed = d => { st.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, SPEEDS.indexOf(st.speed) + d))]; SFX.button(); readout(); return true; };
  const restart = () => { play(st.ci); st.playing = true; return true; };
  function key(e) {
    const k = e.key.toLowerCase();
    if (k === ' ') { if (!e.repeat) toggle(); return true; }
    if (k === 'arrowright' || k === 'arrowleft') { if (!e.repeat) step(k === 'arrowright' ? 1 : -1); return true; }
    if (k === 'arrowup' || k === 'arrowdown') return speed(k === 'arrowup' ? 1 : -1);
    if (k === 'r') return restart();
    return false;
  }
  function tick(now, dt) { if (M && st.playing) { M.mixer.update(dt * st.speed); st.t += dt * st.speed; } if ((tick.n = (tick.n || 0) + 1) % 6 === 0) readout(); tickFlashes(now); }
  return { group: g0, key, click: hit => { if (hit) toggle(); }, tick, readout, demo: restart, stop: () => {}, view,
    panel: [['Play / pause', 'space', toggle], ['Next clip', '→', () => step(1)], ['Faster', '↑', () => speed(1)], ['Slower', '↓', () => speed(-1)], ['Restart', 'R', restart]],
    info: `<h2>${name}</h2><p>The model's own animation clips, played on its original node tree. Each part keeps its outline and crease hairlines while it moves.</p>${credit ? `<p style="opacity:.7;margin-top:6px">${credit}</p>` : ''}`,
    hint: 'space play/pause · → next clip · ↑↓ speed · r restart · drag to orbit' };
})() });

// where a screen point meets the ground plane (y = 0): a tap past the floor's edge still means "go that way"
const groundPoint = (() => { const rc = new THREE.Raycaster(), v = new THREE.Vector2(), pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), out = new THREE.Vector3();
  return (x, y) => { v.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); rc.setFromCamera(v, camera); return rc.ray.intersectPlane(pl, out) ? out.clone() : null; }; })();
// hairlines are never tap targets (every hit test skips them), and a line whose material has no resolution throws
// inside the ray test, which silently kills the whole tap: keep them out of ray tests
LineSegments2.prototype.raycast = function () {};
