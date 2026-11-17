// Touch joystick (bottom-left). Feeds ctx.input.setJoystick(x, y) with y up = forward.
export function createJoystick(ctx, parent) {
  const el = document.createElement('div');
  el.className = 'tb-joy interactive';
  el.innerHTML = '<div class="tb-joy-ring"></div><div class="tb-knob"></div>';
  parent.appendChild(el);
  const knob = el.querySelector('.tb-knob');
  let id = null, cx = 0, cy = 0;
  const R = () => el.clientWidth * 0.38;

  function move(e) {
    const r = R();
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const k = Math.min(1, d / r);
    const dead = 0.12;
    const s = k < dead ? 0 : (k - dead) / (1 - dead) / Math.max(k, 1e-4);
    ctx.input.setJoystick((dx / r) * s, (-dy / r) * s);
  }
  function end(e) {
    if (e.pointerId !== id) return;
    id = null;
    el.classList.remove('active');
    knob.style.transform = '';
    ctx.input.setJoystick(0, 0);
  }
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    el.setPointerCapture?.(id);
    const b = el.getBoundingClientRect();
    cx = b.left + b.width / 2; cy = b.top + b.height / 2;
    el.classList.add('active');
    move(e);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  return {
    el,
    reset() { if (id !== null) end({ pointerId: id }); },
  };
}
