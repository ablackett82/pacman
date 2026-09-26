// Touch controls for iPad. Three layouts share one code path:
//   swipe - anywhere on the screen: the last swipe's direction is held (as a
//           joystick held over), and a finger kept down can swipe again to turn.
//   pad   - a fixed d-pad in the bottom corner; the direction is live while a
//           finger is on it, measured from its centre.
//   stick - floating: the centre is wherever the thumb lands, dragged along if
//           the thumb goes past the ring.
// A quick tap without a swipe starts a game (consumeStart).
//
// Visibility: 'auto' shows the pad/stick on the first touch and hides it as
// soon as a keyboard or gamepad is used; 'on' / 'off' force it.

const STORE_KEY = 'pacman.touch';
const DEFAULTS = { enabled: 'auto', layout: 'swipe', size: 1, opacity: 0.35, swap: false };
const DEAD = 0.28;   // stick deadzone, fraction of ring radius
const SWIPE = 18;    // pixels of travel that count as a swipe

export class Touch {
  constructor(el) {
    this.el = el;
    this.settings = { ...DEFAULTS, ...load() };
    this.pointers = new Map(); // id -> { cx, cy, x, y, t, swiped }
    this.startTapped = false;
    this.seenTouch = false;
    this.otherInputSeen = false;
    this.stickOrigin = null;
    this.knob = null;
    this.held = null;          // swipe mode: the latched direction
    this.state = { left: false, right: false, up: false, down: false };
    this.buildOverlay();
    this.bindEvents();
    this.applySettings();
    window.addEventListener('resize', () => this.layout());
  }

  get active() {
    const e = this.settings.enabled;
    return e === 'on' || (e === 'auto' && this.seenTouch && !this.otherInputSeen);
  }

  /** Called by the main loop when a keyboard/gamepad input is live. */
  notifyOtherInput() {
    if (!this.otherInputSeen) { this.otherInputSeen = true; this.held = null; this.applySettings(); }
  }

  read(into) {
    if (this.settings.enabled === 'off') return;
    for (const k in this.state) if (this.state[k]) into[k] = true;
  }

  /** Forget the held swipe (a new game, or back to the title). */
  release() { this.held = null; this.recompute(); }

  /** True once per tap (used for "tap to start"). */
  consumeStart() {
    const t = this.startTapped; this.startTapped = false; return t;
  }

  bindEvents() {
    const el = this.el;
    const opts = { passive: false };
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      if (!this.seenTouch || this.otherInputSeen) { this.seenTouch = true; this.otherInputSeen = false; this.applySettings(); }
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
      this.down(e.pointerId, e.clientX, e.clientY);
    }, opts);
    el.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      e.preventDefault();
      this.move(e.pointerId, e.clientX, e.clientY);
    }, opts);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      el.addEventListener(ev, (e) => this.up(e.pointerId, ev === 'pointerup'), opts);
    }
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => { this.pointers.clear(); this.recompute(); });
  }

  down(id, x, y) {
    const g = this.geom, layout = this.settings.layout;
    let cx = x, cy = y;
    if (layout === 'pad') {
      const moveSide = this.settings.swap ? x > g.mid : x < g.mid;
      if (!moveSide) { this.pointers.set(id, { tapOnly: true, x, y, t: performance.now() }); return; }
      cx = g.padX; cy = g.padY;
    }
    this.pointers.set(id, { cx, cy, x, y, t: performance.now(), swiped: false });
    if (layout === 'stick') this.stickOrigin = [cx, cy];
    this.recompute();
  }

  move(id, x, y) {
    const p = this.pointers.get(id);
    p.x = x; p.y = y;
    if (p.tapOnly) return;
    const layout = this.settings.layout;
    if (layout === 'swipe') {
      const dx = x - p.cx, dy = y - p.cy;
      if (Math.hypot(dx, dy) >= SWIPE) {
        this.held = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
        p.cx = x; p.cy = y; p.swiped = true;
      }
    } else if (layout === 'stick') {
      const R = this.geom.padR, dx = x - p.cx, dy = y - p.cy, d = Math.hypot(dx, dy);
      if (d > R) { p.cx = x - dx * R / d; p.cy = y - dy * R / d; this.stickOrigin = [p.cx, p.cy]; }
      if (d > R * DEAD) p.swiped = true;
    } else if (Math.hypot(x - p.cx, y - p.cy) > this.geom.padR * DEAD) p.swiped = true;
    this.recompute();
  }

  up(id, lifted) {
    const p = this.pointers.get(id);
    if (!p) return;
    this.pointers.delete(id);
    if (lifted && !p.swiped && performance.now() - p.t < 400) this.startTapped = true;
    if (![...this.pointers.values()].some((q) => !q.tapOnly)) this.stickOrigin = null;
    this.recompute();
  }

  /** Derive the four directions from the held swipe or the live fingers. */
  recompute() {
    const s = this.state;
    s.left = s.right = s.up = s.down = false;
    let knob = null;
    if (this.settings.layout === 'swipe') {
      if (this.held) s[this.held] = true;
    } else {
      const R = this.geom.padR;
      for (const p of this.pointers.values()) {
        if (p.tapOnly) continue;
        const dx = p.x - p.cx, dy = p.y - p.cy, d = Math.hypot(dx, dy);
        const k = Math.min(1, R * 0.7 / Math.max(d, 1e-6));
        knob = [p.cx + dx * k, p.cy + dy * k];
        if (d < R * DEAD) continue;
        // four-way: the dominant axis only
        if (Math.abs(dx) > Math.abs(dy)) s[dx > 0 ? 'right' : 'left'] = true;
        else s[dy > 0 ? 'down' : 'up'] = true;
      }
    }
    this.knob = knob;
    this.paint();
  }

  // ---- visual side ----------------------------------------------------------

  buildOverlay() {
    const el = this.el;
    el.innerHTML = `
      <div class="tc-pad"><div class="tc-arrow tc-l">&#9664;</div><div class="tc-arrow tc-r">&#9654;</div>
        <div class="tc-arrow tc-u">&#9650;</div><div class="tc-arrow tc-d">&#9660;</div><div class="tc-knob"></div></div>
      <div class="tc-hint"></div>
      <button class="tc-gear" type="button" aria-label="Settings"><svg class="tc-cog" viewBox="0 0 10 10" shape-rendering="crispEdges" aria-hidden="true"><rect x="4" y="0" width="1" height="1"/><rect x="5" y="0" width="1" height="1"/><rect x="1" y="1" width="1" height="1"/><rect x="3" y="1" width="1" height="1"/><rect x="4" y="1" width="1" height="1"/><rect x="5" y="1" width="1" height="1"/><rect x="6" y="1" width="1" height="1"/><rect x="8" y="1" width="1" height="1"/><rect x="0" y="2" width="1" height="1"/><rect x="1" y="2" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="3" y="2" width="1" height="1"/><rect x="4" y="2" width="1" height="1"/><rect x="5" y="2" width="1" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="7" y="2" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="9" y="2" width="1" height="1"/><rect x="1" y="3" width="1" height="1"/><rect x="2" y="3" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="6" y="3" width="1" height="1"/><rect x="7" y="3" width="1" height="1"/><rect x="8" y="3" width="1" height="1"/><rect x="0" y="4" width="1" height="1"/><rect x="1" y="4" width="1" height="1"/><rect x="2" y="4" width="1" height="1"/><rect x="7" y="4" width="1" height="1"/><rect x="8" y="4" width="1" height="1"/><rect x="9" y="4" width="1" height="1"/><rect x="0" y="5" width="1" height="1"/><rect x="1" y="5" width="1" height="1"/><rect x="2" y="5" width="1" height="1"/><rect x="7" y="5" width="1" height="1"/><rect x="8" y="5" width="1" height="1"/><rect x="9" y="5" width="1" height="1"/><rect x="1" y="6" width="1" height="1"/><rect x="2" y="6" width="1" height="1"/><rect x="3" y="6" width="1" height="1"/><rect x="6" y="6" width="1" height="1"/><rect x="7" y="6" width="1" height="1"/><rect x="8" y="6" width="1" height="1"/><rect x="0" y="7" width="1" height="1"/><rect x="1" y="7" width="1" height="1"/><rect x="2" y="7" width="1" height="1"/><rect x="3" y="7" width="1" height="1"/><rect x="4" y="7" width="1" height="1"/><rect x="5" y="7" width="1" height="1"/><rect x="6" y="7" width="1" height="1"/><rect x="7" y="7" width="1" height="1"/><rect x="8" y="7" width="1" height="1"/><rect x="9" y="7" width="1" height="1"/><rect x="1" y="8" width="1" height="1"/><rect x="3" y="8" width="1" height="1"/><rect x="4" y="8" width="1" height="1"/><rect x="5" y="8" width="1" height="1"/><rect x="6" y="8" width="1" height="1"/><rect x="8" y="8" width="1" height="1"/><rect x="4" y="9" width="1" height="1"/><rect x="5" y="9" width="1" height="1"/></svg></button>
      <div class="tc-panel" hidden>
        <h2>Settings</h2>
        <label>Difficulty <select class="tc-level"><option value="0">Normal (arcade)</option><option value="1">Easy</option><option value="2">Super easy</option></select></label>
        <label><input class="tc-lives" type="checkbox"> Unlimited lives</label>
        <button class="tc-skip" type="button">Skip this level</button>
        <h3>Touch controls</h3>
        <label>Show <select name="enabled"><option value="auto">Auto</option><option value="on">Always</option><option value="off">Off</option></select></label>
        <label>Layout <select name="layout"><option value="swipe">Swipe</option><option value="pad">D-pad</option><option value="stick">Floating stick</option></select></label>
        <label>Size <input name="size" type="range" min="0.6" max="1.6" step="0.1"></label>
        <label>Opacity <input name="opacity" type="range" min="0.1" max="0.9" step="0.05"></label>
        <label><input name="swap" type="checkbox"> D-pad on the right</label>
        <button class="tc-close" type="button">Done</button>
      </div>`;
    this.pad = el.querySelector('.tc-pad');
    this.knobEl = el.querySelector('.tc-knob');
    this.hint = el.querySelector('.tc-hint');
    this.arrows = { left: el.querySelector('.tc-l'), right: el.querySelector('.tc-r'), up: el.querySelector('.tc-u'), down: el.querySelector('.tc-d') };
    this.panel = el.querySelector('.tc-panel');
    this.gear = el.querySelector('.tc-gear');
    this.onPanelToggle = null; // main.js hooks these
    this.onLevel = null;
    this.onLives = null;
    this.onSkip = null;
    this.levelBox = el.querySelector('.tc-level');
    this.levelBox.addEventListener('change', () => this.onLevel?.(Number(this.levelBox.value)));
    this.livesBox = el.querySelector('.tc-lives');
    this.livesBox.addEventListener('change', () => this.onLives?.(this.livesBox.checked));
    el.querySelector('.tc-skip').addEventListener('click', () => { this.onSkip?.(); this.openPanel(false); });
    const stop = (e) => e.stopPropagation();
    for (const n of [this.gear, this.panel]) for (const ev of ['pointerdown', 'pointerup', 'pointermove']) n.addEventListener(ev, stop);
    this.gear.addEventListener('click', () => this.openPanel(true));
    el.querySelector('.tc-close').addEventListener('click', () => this.openPanel(false));
    this.panel.addEventListener('input', (e) => {
      const f = e.target;
      if (!f.name) return; // difficulty and lives are game settings, not touch ones
      this.settings[f.name] = f.type === 'checkbox' ? f.checked : f.type === 'range' ? Number(f.value) : f.value;
      save(this.settings);
      this.held = null;
      this.applySettings();
    });
  }

  setLevel(n) { this.levelBox.value = String(n); }
  setLives(on) { this.livesBox.checked = on; }

  openPanel(open) {
    this.panel.hidden = !open;
    this.pointers.clear(); this.recompute();
    this.onPanelToggle?.(open);
  }

  applySettings() {
    const s = this.settings, el = this.el;
    for (const f of this.panel.querySelectorAll('[name]')) {
      if (f.type === 'checkbox') f.checked = !!s[f.name]; else f.value = String(s[f.name]);
    }
    el.style.setProperty('--tc-opacity', s.opacity);
    el.classList.toggle('tc-visible', this.active);
    el.classList.toggle('tc-stick', s.layout === 'stick');
    el.classList.toggle('tc-swipe', s.layout === 'swipe');
    this.layout();
    this.onLayout?.();
  }

  /** Geometry in window pixels, used for both hit-testing and drawing. */
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const cs = getComputedStyle(document.documentElement);
    const inset = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    const sb = inset('--sat-b'), sl = inset('--sat-l'), sr = inset('--sat-r');
    const u = this.settings.size * Math.min(W, H) * 0.11;
    const padR = 2 * u;
    const swap = this.settings.swap;
    const padX = swap ? W - sr - padR - u * 0.6 : sl + padR + u * 0.6;
    const padY = H - sb - padR - u * 0.6;
    this.geom = { mid: W / 2, padX, padY, padR };
    this.pad.style.fontSize = `${u * 0.5}px`;
    this.paint();
  }

  paint() {
    const g = this.geom, s = this.state, layout = this.settings.layout;
    const floating = layout === 'stick';
    const c = floating && this.stickOrigin ? this.stickOrigin : [g.padX, g.padY];
    this.pad.classList.toggle('tc-hidden', layout === 'swipe' || (floating && !this.stickOrigin));
    const p = this.pad.style;
    p.left = `${c[0] - g.padR}px`; p.top = `${c[1] - g.padR}px`; p.width = p.height = `${2 * g.padR}px`;
    for (const k in this.arrows) this.arrows[k].classList.toggle('on', s[k]);
    const k = this.knob || c, kr = g.padR * 0.3, ks = this.knobEl.style;
    ks.left = `${k[0] - c[0] + g.padR - kr}px`; ks.top = `${k[1] - c[1] + g.padR - kr}px`; ks.width = ks.height = `${2 * kr}px`;
    this.hint.textContent = layout === 'swipe' && this.held ? { left: '◀', right: '▶', up: '▲', down: '▼' }[this.held] : '';
  }
}

function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } }
function save(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode / quota */ } }
