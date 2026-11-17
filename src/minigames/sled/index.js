// STUB — owned by the sled mini-game agent (see WAVE1.md §Mini-games).
export default {
  id: 'sled', title: 'sled', district: '', intro: 'Coming soon',
  async start(ctx, mg) { await mg.intro(); mg.finish({ score: 1, stars: 1, text: 'Stub game' }); },
};
