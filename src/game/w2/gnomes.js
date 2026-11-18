// STUB (wave 2 scaffolding), replaced by its builder (WAVE2.md §Activity interface).
export default function create(ctx, env) {
  return { id: 'gnomes', n: env.n, busy: false,
    onGiver() { env.say(env.n, 'accept'); env.taskComplete('gnomes'); env.completeDoor(env.n); },
    objective: () => null, giverLabel: () => null, update() {}, sync() {},
    async selfTest(T) { await T.talk(env.n); } };
}
