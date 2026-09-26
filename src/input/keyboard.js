// Keyboard: arrows/WASD to steer; other keys are read edge-triggered by main.js.
const MAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
};

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set(); // edge-triggered, cleared by consume()
    target.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!e.repeat) this.pressed.add(e.code);
      const a = MAP[e.code];
      if (a) { this.down.add(a); e.preventDefault(); }
      if (e.code === 'Space') e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      const a = MAP[e.code];
      if (a) { this.down.delete(a); e.preventDefault(); }
    });
    window.addEventListener('blur', () => this.down.clear());
  }
  read(into) { for (const a of this.down) into[a] = true; }
  get any() { return this.down.size > 0; }
  /** True once per key press of any of the given codes. */
  consume(...codes) {
    for (const c of codes) if (this.pressed.has(c)) { this.pressed.delete(c); return true; }
    return false;
  }
  clearPressed() { this.pressed.clear(); }
}
