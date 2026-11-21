// The old ground chevron that circled the player is retired: ctx.guide (src/guide) now draws the edge arrow, the "!" marker
// and the footprint trail. The objective itself (pickObjective in index.js, ctx.guide.target) is unchanged; this stays as a
// no-op so the createHintArrow(...).update(...) call and its shape keep working.

/** No-op stand-in for the former ground chevron (nothing is added to the scene). */
export function createHintArrow() {
  return { mesh: null, update() {} };
}
