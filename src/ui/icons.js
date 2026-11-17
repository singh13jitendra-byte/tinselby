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
  mountain: svg('<path d="M2 19l7-11 4 6 2.5-3.5L22 19z" fill="currentColor" fill-opacity=".2"/><path d="M7.3 10.7l1.7 1.3 1.4-1.6"/>'),
  soundOn: svg('<path d="M4 9.5h4L13 5v14l-5-4.5H4z" fill="currentColor" fill-opacity=".25"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>'),
  soundOff: svg('<path d="M4 9.5h4L13 5v14l-5-4.5H4z" fill="currentColor" fill-opacity=".25"/><path d="M17 9.5l5 5m0-5l-5 5"/>'),
  dice: svg('<rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" fill-opacity=".15"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2.5" fill="currentColor" fill-opacity=".15"/><path d="M11 18.5h2"/>'),
};

/** A knitted star for the Festive Spirit meter (filled or empty). */
export function spiritStar() {
  return `<svg viewBox="0 0 48 48" class="tb-sstar" aria-hidden="true">
    <path class="tb-sstar-body" d="M24 3.5l6.3 12.8 14.1 2-10.2 9.9 2.4 14L24 35.6l-12.6 6.6 2.4-14L3.6 18.3l14.1-2z"/>
    <path class="tb-sstar-stitch" d="M24 9.5l4.6 9.3 10.2 1.5-7.4 7.2 1.8 10.2L24 32.9l-9.2 4.8 1.8-10.2-7.4-7.2 10.2-1.5z"/>
    <path class="tb-sstar-shine" d="M18.5 21.5l3-1"/>
  </svg>`;
}
