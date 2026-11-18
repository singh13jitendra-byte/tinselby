// STUB (wave 3 scaffolding), replaced by the Tasks builder (WAVE3.md §Door 18: Christmas Cards).
export default function create(ctx, env) {
  return { id: 'post', n: env.n, busy: false,
    onGiver() { env.say(env.n, 'accept'); env.taskComplete('post'); env.completeDoor(env.n); },
    objective: () => null, giverLabel: () => null, update() {}, sync() {},
    // optional wave-3 hooks (game/index.js calls them once the Doors agent adds them): onDoll(doll) → bool, dollLabel(doll)
    onDoll: () => false, dollLabel: () => null,
    async selfTest(T) { await T.talk(env.n); } };
}
