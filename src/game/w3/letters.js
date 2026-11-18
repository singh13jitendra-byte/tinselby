// STUB (wave 3 scaffolding), replaced by the Tasks builder (WAVE3.md §Door 22: Letters to Santa).
export default function create(ctx, env) {
  return { id: 'letters', n: env.n, busy: false,
    onGiver() { env.say(env.n, 'accept'); env.taskComplete('letters'); env.completeDoor(env.n); },
    objective: () => null, giverLabel: () => null, update() {}, sync() {},
    onDoll: () => false, dollLabel: () => null,
    async selfTest(T) { await T.talk(env.n); } };
}
