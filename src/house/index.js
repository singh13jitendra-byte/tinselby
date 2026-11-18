// STUB (wave 2 scaffolding), replaced by the House builder (WAVE2.md §House).
export function createHouse(ctx) {
  const DEFAULT = { wreath: 'holly', lights: 'warm', door: 'red', snowman: 'none' };
  return { OPTIONS: {}, DEFAULT, get owned() { return ctx.progress?.state?.(10) === 'done'; }, get style() { return { ...DEFAULT }; },
    isOpen: false, async decorate() { return { ...DEFAULT }; }, setStyle() {} };
}
