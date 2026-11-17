// STUB — owned by the Foundation agent (see WAVE1.md §Progress).
export function createProgress(ctx) {
  return { playerId: 'stub', doors: [], state: () => 'locked', current: () => 1, isOpen: () => false, complete() {}, best: () => null, recordMiniGame() {}, rewards: { owned: () => [], has: () => false, grant() {} } };
}
