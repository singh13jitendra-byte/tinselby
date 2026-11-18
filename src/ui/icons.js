// Tiny inline SVG icons (no emoji fonts needed). Stroke/fill use currentColor.
const svg = (body, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  talk: svg('<path d="M4 5h16v11H10l-5 4v-4H4z" fill="currentColor" fill-opacity=".18"/><circle cx="9" cy="10.5" r=".6" fill="currentColor"/><circle cx="12" cy="10.5" r=".6" fill="currentColor"/><circle cx="15" cy="10.5" r=".6" fill="currentColor"/>'),
  hand: svg('<path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v5m0-3a1.5 1.5 0 0 1 3 0v6c0 4-3 6.5-6.5 6.5S7 18 5.5 15.5L4 13a1.5 1.5 0 0 1 2.6-1.5L7 12" fill="currentColor" fill-opacity=".18"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" fill="currentColor" fill-opacity=".25"/>'),
  star: svg('<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="currentColor" fill-opacity=".3"/>'),
  cable: svg('<path d="M2 4l20 4"/><path d="M12 6v3"/><rect x="6" y="9" width="12" height="10" rx="2.5" fill="currentColor" fill-opacity=".2"/><path d="M6 13h12M10 13v6M14 13v6"/>'),
  gift: svg('<rect x="3.5" y="9" width="17" height="11.5" rx="1.5" fill="currentColor" fill-opacity=".2"/><path d="M2.5 9h19M12 9v11.5M12 9C10 4 6 5 7.5 7.5 8.4 9 12 9 12 9zm0 0c2-5 6-4 4.5-1.5C15.6 9 12 9 12 9z"/>'),
  camera: svg('<path d="M4 8h3l2-2.5h6L17 8h3v11H4z" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="13.3" r="3.4"/>'),
  eye: svg('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" fill="currentColor" fill-opacity=".15"/><circle cx="12" cy="12" r="3"/>'),
  mountain: svg('<path d="M2 19l7-11 4 6 2.5-3.5L22 19z" fill="currentColor" fill-opacity=".2"/><path d="M7.3 10.7l1.7 1.3 1.4-1.6"/>'),
  soundOn: svg('<path d="M4 9.5h4L13 5v14l-5-4.5H4z" fill="currentColor" fill-opacity=".25"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: svg('<path d="M4 9.5h4L13 5v14l-5-4.5H4z" fill="currentColor" fill-opacity=".25"/><path d="M17 9.5l5 5m0-5l-5 5"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" fill-opacity=".15"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="currentColor" fill-opacity=".15"/><path d="M11 18.5h2"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="currentColor" fill-opacity=".18"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><rect x="7" y="12.5" width="3" height="2.6" rx=".6" fill="currentColor"/><rect x="14" y="12.5" width="3" height="2.6" rx=".6" fill="currentColor" fill-opacity=".45"/><rect x="10.5" y="16" width="3" height="2.4" rx=".6" fill="currentColor" fill-opacity=".45"/>'),
  jumper: svg('<path d="M9 3.5h6l1.2 1.6L21 7.5l-1.6 6-2.4-.8V20.5H7v-7.8l-2.4.8L3 7.5l4.8-2.4z" fill="currentColor" fill-opacity=".2"/><path d="M9.2 3.6c.6 1.6 1.6 2.4 2.8 2.4s2.2-.8 2.8-2.4M7 16.5h10M9.5 10.5l1.2 1.4 1.3-1.4 1.3 1.4 1.2-1.4"/>'),
  snowflake: svg('<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.4 4.1L12 6.6l2.6-2.5M9.4 19.9L12 17.4l2.6 2.5M3.6 10.3l3.5.8-1 3.4M20.4 13.7l-3.5-.8 1-3.4M3.9 13.6l3.2-1.6M20.1 10.4l-3.2 1.6"/>'),
  people: svg('<circle cx="9" cy="8" r="3.2" fill="currentColor" fill-opacity=".2"/><circle cx="16.5" cy="9" r="2.6" fill="currentColor" fill-opacity=".2"/><path d="M3.5 19.5c.4-3.6 2.6-5.6 5.5-5.6s5.1 2 5.5 5.6M14.6 14.2c.6-.3 1.2-.4 1.9-.4 2.4 0 4.1 1.7 4.4 4.8"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fill-opacity=".25"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  candle: svg('<rect x="8.5" y="10" width="7" height="11" rx="1.5" fill="currentColor" fill-opacity=".25"/><path d="M12 10V8.2"/><path d="M12 2.8c1.8 1.9 2.2 3 2.2 3.8a2.2 2.2 0 0 1-4.4 0c0-.8.4-1.9 2.2-3.8z" fill="currentColor"/>'),
  arrow: svg('<path d="M12 3l7 9h-4v9h-6v-9H5z" fill="currentColor" fill-opacity=".9" stroke-width="1.6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" fill-opacity=".3"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
  sleigh: svg('<path d="M3 15.5h13.5c2 0 3.5-1.5 3.5-3.5V9"/><path d="M5 15.5c-1.5 0-2.2-1-2-2.4L4 8h7l1.5 4h5" fill="currentColor" fill-opacity=".2"/><path d="M2.5 19h15c1.6 0 2.9-.9 3.5-2.5M7 15.5V19M14 15.5V19"/>'),
  // ---- wave 2 (doors 9-16)
  home: svg('<path d="M3.5 11.5L12 4l8.5 7.5" /><path d="M5.5 10.5V20h13v-9.5" fill="currentColor" fill-opacity=".2"/><rect x="10" y="13.5" width="4" height="6.5" rx="1" fill="currentColor" fill-opacity=".35"/><path d="M16 5.5V8"/>'),
  tram: svg('<rect x="5" y="5.5" width="14" height="12" rx="3" fill="currentColor" fill-opacity=".2"/><path d="M5 12h14M12 5.5V12M8 2.5h8M12 2.5v3"/><circle cx="8.5" cy="15" r=".8" fill="currentColor"/><circle cx="15.5" cy="15" r=".8" fill="currentColor"/><path d="M7 20.5l1.5-3M17 20.5l-1.5-3M5 20.5h14"/>'),
  skate: svg('<path d="M6 3.5h5v8.5l6 2.2c1.3.5 2 1.4 2 2.8v1H6z" fill="currentColor" fill-opacity=".2"/><path d="M3.5 21h17M6 18.8V21M17 18.8V21M8.5 7h2.5"/>'),
  ribbon: svg('<path d="M12 12.5C9 8 5 7 4.6 9.6 4.3 12 8.4 12.6 12 12.5zm0 0c3-4.500 7-5.500 7.400-2.900.3 2.400-3.800 3-7.400 2.900z" fill="currentColor" fill-opacity=".25"/><circle cx="12" cy="12.5" r="1.8" fill="currentColor"/><path d="M10.800 14.200L8.500 20.500M13.200 14.200l2.300 6.300"/>'),
  snowman: svg('<circle cx="12" cy="6.500" r="3.200" fill="currentColor" fill-opacity=".2"/><circle cx="12" cy="15.500" r="5.500" fill="currentColor" fill-opacity=".2"/><path d="M12 6.800l2.200.7"/><circle cx="10.800" cy="5.800" r=".5" fill="currentColor"/><circle cx="13.200" cy="5.800" r=".5" fill="currentColor"/><circle cx="12" cy="13.500" r=".6" fill="currentColor"/><circle cx="12" cy="16" r=".6" fill="currentColor"/><path d="M6.500 12.500L3.500 10.500M17.500 12.500l3-2M9 3.200h6"/>'),
  gnome: svg('<path d="M12 2.500c-1 4-3.500 6-4.200 8.800h8.400C15.500 8.500 13 6.500 12 2.500z" fill="currentColor" fill-opacity=".35"/><path d="M6.800 11.300h10.400"/><path d="M8 11.500c0 3 1.500 4.200 4 4.200s4-1.200 4-4.200" fill="currentColor" fill-opacity=".12"/><path d="M8.500 14.500c.5 4 1.800 5 3.500 5s3-1 3.500-5" fill="currentColor" fill-opacity=".2"/><circle cx="10.500" cy="12.600" r=".5" fill="currentColor"/><circle cx="13.500" cy="12.600" r=".5" fill="currentColor"/>'),
  hoof: svg('<path d="M7.500 3.500c-2 3-2.800 7-2.200 10 .5 2.800 2.200 4 3.300 2.300.7-1.200.3-3.500.6-6 .2-2.200.6-4.300-1.700-6.300zM16.500 3.500c2 3 2.800 7 2.200 10-.5 2.800-2.200 4-3.300 2.300-.7-1.200-.3-3.500-.6-6-.2-2.200-.6-4.300 1.700-6.300z" fill="currentColor" fill-opacity=".3"/><path d="M8 19.500h8M9.500 21.500h5"/>'),
  conductor: svg('<path d="M5 14.500c0-6 14-6 14 0z" fill="currentColor" fill-opacity=".25"/><path d="M3 14.500h18l-1.800 4.500c-3.800 1.200-11.600 1.200-15.400 0z" fill="currentColor" fill-opacity=".35"/><circle cx="12" cy="9.500" r="1.500" fill="currentColor"/>'),
  bell: svg('<path d="M6 17c1.200-1.300 1.800-3 1.800-5.500a4.200 4.200 0 0 1 8.400 0c0 2.500.6 4.200 1.800 5.500z" fill="currentColor" fill-opacity=".25"/><path d="M12 4.500V3M10 19.500a2 2 0 0 0 4 0"/>'),
};

/** Icon by name; unknown names fall back to the pointing hand. */
export const icon = (name, fallback = 'hand') => ICONS[name] || ICONS[fallback] || ICONS.hand;
ICONS.house = ICONS.home;
ICONS.bow = ICONS.ribbon;
ICONS.giftwrap = ICONS.ribbon;
ICONS.cap = ICONS.conductor;

/** A knitted star for the Festive Spirit meter (filled or empty). */
export function spiritStar() {
  return `<svg viewBox="0 0 48 48" class="tb-sstar" aria-hidden="true">
    <path class="tb-sstar-body" d="M24 3.5l6.3 12.8 14.1 2-10.2 9.9 2.4 14L24 35.6l-12.6 6.6 2.4-14L3.6 18.3l14.1-2z"/>
    <path class="tb-sstar-stitch" d="M24 9.5l4.6 9.3 10.2 1.5-7.4 7.2 1.8 10.2L24 32.9l-9.2 4.8 1.8-10.2-7.4-7.2 10.2-1.5z"/>
    <path class="tb-sstar-shine" d="M18.5 21.5l3-1"/>
  </svg>`;
}
