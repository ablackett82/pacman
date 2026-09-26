// Gamepad API: d-pad or left stick to steer; A/Start start a game.
export class Gamepad {
  constructor() { this.startPressed = false; this.lastButtons = 0; this.any = false; }
  read(into) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let buttons = 0;
    this.any = false;
    for (const p of pads) {
      if (!p) continue;
      const b = p.buttons;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const l = b[14]?.pressed || ax < -0.5, r = b[15]?.pressed || ax > 0.5;
      const u = b[12]?.pressed || ay < -0.5, d = b[13]?.pressed || ay > 0.5;
      if (l) into.left = true;
      if (r) into.right = true;
      if (u) into.up = true;
      if (d) into.down = true;
      if (l || r || u || d) this.any = true;
      for (let i = 0; i < b.length; i++) if (b[i]?.pressed) buttons |= 1 << i;
    }
    const fresh = buttons & ~this.lastButtons;
    this.startPressed = !!(fresh & ((1 << 0) | (1 << 9)));
    if (fresh) this.any = true;
    this.lastButtons = buttons;
  }
}
