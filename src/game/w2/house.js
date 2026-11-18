// STUB (wave 2 scaffolding), replaced by its builder (WAVE2.md §Activity interface).
export default function create(ctx, env) {
  return { id: 'house', n: env.n, busy: false,
    onGiver() { env.say(env.n, 'accept'); env.taskComplete('house'); env.completeDoor(env.n); },
    objective: () => null, giverLabel: () => null, update() {}, sync() {},
    async selfTest(T) { await T.talk(env.n); } };
}
