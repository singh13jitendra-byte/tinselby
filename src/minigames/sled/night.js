// Sledge Hill Race II (door 16): the same two heats, the same sim and camera rig as door 7 (sled/index.js), run
// at night with lantern gates and jingle bells. Everything variant-specific lives in VARIANTS.night (index.js),
// props.js (lanternGateGeo, bellGeo), race.js (scoreNight) and course.js (layoutRun opts).
import sled, { startSled } from './index.js';

const ICON = '<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg"><path d="M32 6v7" stroke="#8a5a12" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M24 17h16l3 6H21z" fill="#ecb03c"/><rect x="19" y="23" width="26" height="26" rx="9" fill="#ffd27a" stroke="#c0352f" stroke-width="3"/><path d="M26 23v26M38 23v26" stroke="#e8a63a" stroke-width="2"/><path d="M22 49h20l-2 6H24z" fill="#ecb03c"/><circle cx="48" cy="12" r="2" fill="#fff3c4"/><circle cx="14" cy="18" r="1.5" fill="#fff3c4"/></svg>';

export default {
  ...sled,
  id: 'sled2',
  title: 'Sledge Hill Race II',
  district: 'hill',
  icon: ICON,
  intro: 'The hill after dark! Two night runs between glowing lanterns. Steer with ← → (or A / D), or hold the left or right side of the screen. Slip through the lantern gates, ring the jingle bells, and mind the gnomes, pines and snow lumps.',
  start: (ctx, mg) => startSled(ctx, mg, { variant: 'night' }),
};
