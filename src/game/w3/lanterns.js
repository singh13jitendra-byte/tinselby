// STUB (wave 3 scaffolding), replaced by the Tasks builder (WAVE3.md §Door 20: Lanterns for Santa).
import { LANTERNS } from '../../core/layout.js';

export default function create(ctx, env) {
  const done = () => env.ds(20) === 'done';
  // tasks.lanterns → this runway (the finale calls chase() while the sleigh comes in); stub: "lit" once door 20 is done
  const runway = {
    positions: LANTERNS.spots.map(([x, z]) => ({ x, z })),
    get lit() { return LANTERNS.spots.map(() => done()); },
    get allLit() { return done(); },
    chase() {},
  };
  return { id: 'lanterns', n: env.n, busy: false, runway,
    onGiver() { env.say(env.n, 'accept'); env.taskComplete('lanterns'); env.completeDoor(env.n); },
    objective: () => null, giverLabel: () => null, update() {}, sync() {},
    onDoll: () => false, dollLabel: () => null,
    async selfTest(T) { await T.talk(env.n); } };
}
