// The screen: full screen, a portrait / landscape toggle, and the layout classes the page's CSS keys off.
// A phone that can lock its orientation (Android, in full screen) turns for real. Anywhere else the page itself is turned
// 90° inside the screen: the body is rotated, innerWidth / innerHeight report the turned size, and pointer events on the
// 3D view are sent again with turned coordinates, so the camera controls, picking and labels all work unchanged. Page code
// that measures elements or reads pointer positions itself uses WF_SCREEN.rect(el) and WF_SCREEN.pt(e).
const WF_SCREEN = (() => {
  const html = document.documentElement, canvas = renderer.domElement, coarse = matchMedia('(pointer: coarse)');
  const own = k => Object.getOwnPropertyDescriptor(window, k) || Object.getOwnPropertyDescriptor(Window.prototype, k);
  const dW = own('innerWidth'), dH = own('innerHeight'), canWrap = !!(dW && dW.get && dH && dH.get);
  const realW = canWrap ? () => dW.get.call(window) : () => window.innerWidth, realH = canWrap ? () => dH.get.call(window) : () => window.innerHeight;
  let turn = 0, want = null, native = false, canTurn = false;   // turn: 0, 90 (page turned clockwise) or -90
  if (canWrap) try {                                             // a browser that won't let the size be re-read can't turn the page
    Object.defineProperty(window, 'innerWidth', { configurable: true, enumerable: true, get: () => turn ? realH() : realW() });
    Object.defineProperty(window, 'innerHeight', { configurable: true, enumerable: true, get: () => turn ? realW() : realH() });
    canTurn = innerWidth === realW() && innerHeight === realH();
  } catch (e) {}

  // a point on the screen → the same point on the turned page
  const toPage = (x, y) => turn === 90 ? { x: y, y: realW() - x } : turn === -90 ? { x: realH() - y, y: x } : { x, y };
  const pt = e => e.__wfTurned || !turn ? { x: e.clientX, y: e.clientY } : toPage(e.clientX, e.clientY);
  function rect(el) {
    const r = el.getBoundingClientRect(); if (!turn) return r;
    const a = toPage(r.left, r.top), b = toPage(r.right, r.bottom);
    const left = Math.min(a.x, b.x), top = Math.min(a.y, b.y), right = Math.max(a.x, b.x), bottom = Math.max(a.y, b.y);
    return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top };
  }

  // pointer events on the 3D view, sent again in page coordinates while the page is turned
  function resend(e) {
    if (!turn || e.__wfTurned || e.target !== canvas) return;          // (the copies carry __wfTurned, so they pass straight through)
    e.stopImmediatePropagation();
    const p = toPage(e.clientX, e.clientY), base = { bubbles: e.bubbles, cancelable: e.cancelable, composed: e.composed, view: window, detail: e.detail,
      screenX: p.x, screenY: p.y, clientX: p.x, clientY: p.y, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
      button: e.button, buttons: e.buttons, relatedTarget: e.relatedTarget };
    const ne = e instanceof PointerEvent ? new PointerEvent(e.type, { ...base, pointerId: e.pointerId, pointerType: e.pointerType, isPrimary: e.isPrimary,
        width: e.width, height: e.height, pressure: e.pressure, tiltX: e.tiltX, tiltY: e.tiltY, twist: e.twist })
      : e instanceof WheelEvent ? new WheelEvent(e.type, { ...base, deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode })
      : new MouseEvent(e.type, base);
    ne.__wfTurned = true;
    if (!canvas.dispatchEvent(ne)) e.preventDefault();
  }
  ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerover', 'pointerout', 'click', 'dblclick', 'contextmenu', 'wheel']
    .forEach(t => addEventListener(t, resend, { capture: true, passive: false }));

  const css = document.createElement('style');
  css.textContent = `
  html.wf-turned, html.wf-turned body { overflow:hidden; }
  html.wf-turned body { position:fixed; left:0; top:0; margin:0; width:var(--wf-rh); height:var(--wf-rw); transform-origin:0 0; }
  html.wf-turned[data-wf-turn="90"] body { transform:translate(var(--wf-rw), 0) rotate(90deg); }
  html.wf-turned[data-wf-turn="-90"] body { transform:translate(0, var(--wf-rh)) rotate(-90deg); }`;
  document.head.appendChild(css);

  // layout classes, from the page's own (turned) size: the CSS uses these rather than width media queries, which would
  // see the untouched screen
  const fns = []; let sig = '';
  function classes() {
    const w = innerWidth, h = innerHeight, st = html.style;
    st.setProperty('--wf-rw', realW() + 'px'); st.setProperty('--wf-rh', realH() + 'px'); st.setProperty('--wf-vw', w + 'px'); st.setProperty('--wf-vh', h + 'px');
    const c = { 'wf-narrow': w <= 640, 'wf-mid': w > 640 && w <= 1100, 'wf-w1180': w <= 1180, 'wf-pland': h <= 500 && w > h && w <= 1000,
      'wf-phone': Math.min(realW(), realH()) <= 520, 'wf-portrait': w < h };
    for (const k in c) html.classList.toggle(k, c[k]);
    const s = Object.keys(c).filter(k => c[k]).join(' ') + '|' + turn;
    if (s !== sig) { sig = s; fns.forEach(f => f()); }
  }
  function setTurn(t) {
    if (t !== turn) {
      turn = t; html.classList.toggle('wf-turned', !!t); html.dataset.wfTurn = String(t);
      classes(); dispatchEvent(new Event('resize'));   // every size-dependent piece (renderer, camera, panels) re-measures
    } else classes();
  }
  const realPortrait = () => realW() < realH();
  function apply() { setTurn(want && canTurn && !native && (want === 'landscape') === realPortrait() ? (want === 'landscape' ? 90 : -90) : 0); }

  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const canFS = !!((html.requestFullscreen || html.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled));
  // some browsers (embedded web views) never settle these requests: give up after a moment rather than wait forever
  const within = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timed out')), ms))]);
  async function fullscreen(on) {
    if (on && !fsEl()) { if (html.requestFullscreen) await within(html.requestFullscreen({ navigationUI: 'hide' }), 1500); else html.webkitRequestFullscreen(); }
    else if (!on && fsEl()) { if (document.exitFullscreen) await within(document.exitFullscreen(), 1500); else document.webkitExitFullscreen(); }
  }
  // ask for an orientation: lock the screen where the browser allows it (that needs full screen), else turn the page.
  // Returns 'locked', 'turned' or 'same' (the screen already has that shape).
  async function orient(o) {
    want = o; native = false;
    const so = screen.orientation, wasFS = !!fsEl();
    if (o && coarse.matches && so && so.lock && canFS) {
      try { await fullscreen(true); await within(so.lock(o), 1500); native = true; }
      catch (e) { if (!wasFS && fsEl()) try { await fullscreen(false); } catch (e2) {} }   // no lock here: leave full screen as it was
    }
    apply();
    return native ? 'locked' : turn ? 'turned' : 'same';
  }
  addEventListener('resize', apply);
  if (screen.orientation) screen.orientation.addEventListener('change', apply);
  const onFS = () => { if (!fsEl() && native) { native = false; want = null; } apply(); fns.forEach(f => f()); };   // leaving full screen also ends a lock
  document.addEventListener('fullscreenchange', onFS); document.addEventListener('webkitfullscreenchange', onFS);
  classes();

  return { pt, rect, orient, fullscreen, canFS, canTurn, isFS: () => !!fsEl(), onChange: f => fns.push(f),
    get turn() { return turn; }, get want() { return want; }, get locked() { return native; } };
})();
