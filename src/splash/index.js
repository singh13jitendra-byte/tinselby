// Boot milestones → the launch splash (the trailer in design/splash/trailer.html, driven by window.__splash, which the
// inline script from src/splash/inline.js defines at first paint). Under ?capture the splash is already gone and
// every call here is a cheap no-op, so test timing (window.__tinselby.ready) is unchanged.
//
//   page downloading        0 → 40 %  (time-based creep, in the inline script)
//   whole page arrived      45 %  Knitting the town…  (one-line script at the end of <body>, src/splash/vite-plugin.js)
//   game script parsed      50 %
//   world built             72 %  Hanging the lights…
//   first frame rendered    88 %  Warming the cocoa…
//   entry card ready       100 %  → done(): short hold, then the trailer hands over to the start card
// Each milestone also leaves a performance mark (tb:parsed, tb:world, tb:frame, tb:entry) for load-time checks.

const splash = () => window.__splash;
const mark = (n) => { try { performance.mark(`tb:${n}`); } catch (e) { /* */ } };
const step = (n, pct, label) => { mark(n); try { splash()?.step(pct, label); } catch (e) { /* never break boot */ } };

export const bootSplash = {
  parsed() { step('parsed', 0.5, 'Knitting the town…'); },
  world() { step('world', 0.72, 'Hanging the lights…'); },
  /**
   * Starts the render loop. While the splash is up, let one frame paint "Hanging the lights…" first (the first 3D
   * frame compiles every shader and can take a while on a phone); otherwise (?capture, no splash) start right away.
   */
  start(engineStart) {
    const s = splash();
    if (!s?.active) { engineStart(); return; }
    requestAnimationFrame(() => setTimeout(() => {
      engineStart();
      // queued after the engine's own rAF → runs once the first frame has been drawn
      requestAnimationFrame(() => {
        step('frame', 0.88, 'Warming the cocoa…');
        // the start card is built by now; give its web font a moment (capped) so it doesn't swap in front of the player
        const fonts = document.fonts?.ready || Promise.resolve();
        Promise.race([fonts, new Promise((r) => setTimeout(r, 1500))]).catch(() => {}).then(() => {
          step('entry', 1, 'Here we go!');
          try { s.done(); } catch (e) { /* */ }
        });
      });
    }, 0));
  },
};
