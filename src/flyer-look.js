// Surfaces and themes for the Flyer page.
// · Procedural textures painted in the fragment shader from object-space position (no UVs needed): muslin weave, spruce
//   grain (rings around a per-vertex grain axis, aGrain), brushed steel, wool cloth, weathered planks, granite, sand and a
//   moving sea. Every pattern fades out where it would shimmer (fwidth), and uTex scales them all (0 = flat iso-glow).
// · Themes: palettes for the scene (background, body, the three hairline tiers) and the panels (CSS variables), built on
//   the template's dark or light base so its glow rules still hold (no halos on paper themes).
const WF_LOOK = (() => {
  const U = { uTex: { value: 1 }, uTime: { value: 0 } };
  const GLSL = `
    float wfH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float wfN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(wfH(i), wfH(i + vec3(1, 0, 0)), f.x), mix(wfH(i + vec3(0, 1, 0)), wfH(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(wfH(i + vec3(0, 0, 1)), wfH(i + vec3(1, 0, 1)), f.x), mix(wfH(i + vec3(0, 1, 1)), wfH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
    float wfF(vec3 p) { return wfN(p) * 0.5 + wfN(p * 2.03) * 0.25 + wfN(p * 4.1) * 0.125; }
    float wfAA(float cycles) { return clamp(1.0 - fwidth(cycles) * 1.2, 0.0, 1.0); }   // fade a pattern before it aliases`;
  const PATTERN = {
    fabric: `vec3 an = abs(vN); vec2 q = an.y > max(an.x, an.z) ? vP.xz : (an.x > an.z ? vP.zy : vP.xy);
      float c = q.x * 42.0, d = q.y * 42.0, weave = sin(c * 6.2832) * sin(d * 6.2832) * wfAA(c) * wfAA(d);
      float seam = smoothstep(0.02, 0.0, abs(fract(q.x * 2.0) - 0.5) - 0.47) * wfAA(q.x * 2.0);
      pat = 1.0 + 0.06 * weave - 0.07 * seam + 0.06 * (wfF(vP * 5.0) - 0.5);`,
    wood: `vec3 ax = length(vG) > 0.01 ? normalize(vG) : vec3(0.0, 1.0, 0.0);
      float along = dot(vP, ax), across = length(vP - ax * along), n = wfF(vec3(along * 1.4, across * 8.0, 0.3) + vP * 0.6);
      float rc = across * 26.0 + n * 1.2, rings = (0.5 + 0.5 * sin(rc * 6.2832)) * wfAA(rc);
      float streak = wfN(vec3(along * 2.5, across * 70.0, 1.7)) * wfAA(across * 70.0);
      pat = 1.0 + 0.13 * (rings - 0.4) + 0.09 * (streak - 0.5) + 0.05 * (n - 0.5);`,
    metal: `float bc = vP.y * 140.0, b = wfN(vec3(vP.x * 3.0, bc, vP.z * 3.0)) * wfAA(bc);
      pat = 1.0 + 0.07 * (b - 0.5) + 0.07 * (wfF(vP * 8.0) - 0.5);`,
    cloth: `float c = (vP.x + vP.z) * 60.0, d = (vP.y - vP.z) * 60.0;
      pat = 1.0 + 0.06 * sin(c * 6.2832) * sin(d * 6.2832) * wfAA(c) * wfAA(d) + 0.06 * (wfF(vP * 12.0) - 0.5);`,
    planks: `float y = vP.y * 6.5, seam = smoothstep(0.08, 0.0, abs(fract(y) - 0.5) - 0.42) * wfAA(y);
      float grain = wfF(vec3((vP.x + vP.z) * 1.6, y * 6.0, floor(y) * 3.1)), knot = smoothstep(0.82, 0.9, wfN(vec3(vP.x + vP.z, y, 0.0) * 3.0));
      pat = 1.0 + 0.14 * (grain - 0.5) - 0.2 * seam - 0.12 * knot;`,
    stone: `float sp = wfH(floor(vP * 55.0)) * wfAA(vP.x * 55.0);
      pat = 1.0 + 0.18 * (wfF(vP * 6.0) - 0.5) + 0.1 * (sp - 0.5);`,
    sand: `float rp = vP.x * 0.45 + vP.z * 0.16 + wfF(vP * 0.2) * 0.8, r = sin(rp * 6.2832) * wfAA(rp);
      float sp = wfH(floor(vP * 16.0)) * wfAA(vP.x * 16.0);
      pat = 1.0 + 0.05 * r + 0.06 * (sp - 0.5) + 0.09 * (wfF(vP * 0.07) - 0.5);`,
    studio: `float sp = wfH(floor(vP * 9.0)) * wfAA(vP.x * 9.0);
      pat = 1.0 + 0.05 * (wfF(vP * 0.35) - 0.5) + 0.035 * (sp - 0.5);`,
    sea: `float t = uTime * 0.35, sc = vP.x * 0.16 + t + wfF(vec3(vP.xz * 0.12, t * 0.2)) * 0.7, sw = sin(sc * 6.2832) * wfAA(sc);
      pat = 1.0 + 0.09 * sw + 0.08 * (wfF(vec3(vP.xz * 0.5, t)) - 0.5);`,
  };
  // how each surface leans away from the theme's body colour: toward its own hue, a little on dark themes, more on paper
  const HUE = { fabric: ['#e3d6b4', 0.07, 0.32], wood: ['#a0703e', 0.13, 0.36], metal: ['#8d99a6', 0.11, 0.26], cloth: ['#2e2e36', 0.1, 0.55],
    planks: ['#8f6c47', 0.13, 0.38], stone: ['#a3a39d', 0.1, 0.3], sand: ['#cdb47c', 0.08, 0.32], studio: ['#8e959c', 0.06, 0.55, '#ffffff'], sea: ['#2d5f80', 0.16, 0.4] };
  const mats = [];
  function surface(kind, { rough = 0.88, metal = 0.04, scale = 1 } = {}) {
    const m = new THREE.MeshStandardMaterial({ color: 0x1b1c1f, roughness: rough, metalness: metal, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    m.userData.wfKind = kind;
    m.onBeforeCompile = sh => {
      sh.uniforms.uTex = U.uTex; sh.uniforms.uTime = U.uTime;
      sh.vertexShader = 'attribute vec3 aGrain;\nvarying vec3 vP; varying vec3 vN; varying vec3 vG;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n vP = position * ${scale.toFixed(4)}; vN = normal; vG = aGrain;`);
      sh.fragmentShader = 'uniform float uTex; uniform float uTime;\nvarying vec3 vP; varying vec3 vN; varying vec3 vG;\n' + GLSL + '\n' +
        sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>\n { float pat = 1.0; ${PATTERN[kind]} diffuseColor.rgb *= mix(1.0, pat, uTex); }`);
    };
    m.customProgramCacheKey = () => 'wf-' + kind + '-' + scale;
    mats.push(m); retintOne(m); return m;
  }
  let paper = false;
  const tmp = new THREE.Color();
  function retintOne(m) { const [hex, kd, kl, light] = HUE[m.userData.wfKind]; m.color.copy(bodyMat.color).lerp(tmp.set(paper && light ? light : hex), paper ? kl : kd); }
  const retint = () => mats.forEach(retintOne);

  // ── themes ──
  const THEMES_WF = {
    graphite:  { name: 'Graphite', base: 'dark', bg: 0x121314, body: 0x1b1c1f, line: 0x4f5357, major: 0x393c3f, edge: 0x27292c,
                 css: { '--bg': '#121314', '--panel': 'rgba(22,23,24,.85)', '--line': '#26292b', '--ink': '#c9d0db', '--dim': '#7d8796' } },
    paper:     { name: 'Paper', base: 'light', bg: 0xe9eaea, body: 0xf1f1f0, line: 0x5d6266, major: 0x8a8f93, edge: 0xb9bcbf,
                 css: { '--bg': '#e9eaea', '--panel': 'rgba(246,246,245,.9)', '--line': '#d6d8d8', '--ink': '#2b2e30', '--dim': '#6b7075' } },
    blueprint: { name: 'Blueprint', base: 'dark', accent: 'ice', bg: 0x0b2341, body: 0x0f2f57, line: 0x9cc2ec, major: 0x6189bb, edge: 0x2d578a,
                 css: { '--bg': '#0b2341', '--panel': 'rgba(13,41,74,.86)', '--line': '#2a5586', '--ink': '#dbe9fb', '--dim': '#8fb1d8' } },
    kittyhawk: { name: 'Kitty Hawk 1903', base: 'light', accent: 'ember', bg: 0xe6dac2, body: 0xeee3cc, line: 0x5c4630, major: 0x8d7252, edge: 0xc2ab86,
                 css: { '--bg': '#e6dac2', '--panel': 'rgba(243,235,217,.9)', '--line': '#cdb892', '--ink': '#3a2c1f', '--dim': '#7c6850' } },
    dusk:      { name: 'Dusk', base: 'dark', accent: 'rose', bg: 0x1a1421, body: 0x241c2d, line: 0x75638a, major: 0x50425f, edge: 0x352a41,
                 css: { '--bg': '#1a1421', '--panel': 'rgba(35,27,45,.86)', '--line': '#3b3049', '--ink': '#e8def0', '--dim': '#9d8daf' } },
    contrast:  { name: 'High contrast', base: 'dark', accent: 'lime', bg: 0x000000, body: 0x060606, line: 0xd8d8d8, major: 0xa0a0a0, edge: 0x5c5c5c,
                 css: { '--bg': '#000000', '--panel': 'rgba(0,0,0,.92)', '--line': '#5c5c5c', '--ink': '#ffffff', '--dim': '#c4c4c4' } },
  };
  let current = 'graphite', applying = false; const listeners = [];
  function paint(key) {                                              // recolour the scene and panels for a theme on its base
    const T = THEMES_WF[key]; current = key; paper = T.base === 'light';
    BG_COL.set(T.bg); scene.background.set(T.bg); bodyMat.color.set(T.body); LINE_COL.set(T.line); MAJOR_COL.set(T.major); EDGE_COL.set(T.edge);
    appliedKey = '';                                                 // the template re-derives the line colours next frame
    const st = document.documentElement.style; Object.entries(T.css).forEach(([k, v]) => st.setProperty(k, v));
    document.documentElement.dataset.wfTheme = key;
    retint(); listeners.forEach(f => f(key));
  }
  function applyTheme(key, { withAccent = false } = {}) {
    if (!THEMES_WF[key]) key = 'graphite';
    const T = THEMES_WF[key];
    applying = true; setTheme(T.base); applying = false;             // the template's base: glow rules, lights, its own hooks
    paint(key);
    if (withAccent && T.accent) pickAccent(T.accent);
  }
  // the template's own theme switch (its button, or T) lands here: follow it with the matching plain theme
  // (an accent change also runs the hooks, with the same base: that keeps the current theme)
  themeHooks.push(t => { if (!applying && t !== THEMES_WF[current].base) paint(t === 'light' ? 'paper' : 'graphite'); });

  return { U, surface, retint, applyTheme, THEMES: THEMES_WF, get current() { return current; }, onTheme: f => listeners.push(f),
    setTex: v => { U.uTex.value = v; }, tick: now => { U.uTime.value = now / 1000; } };
})();
