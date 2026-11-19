// Wave 4 "Play together" (PLAY.md) is live; ?w1 / ?w2 / ?w3 turn it off for testing the older waves.
// With W4 off nothing new is visible and the net protocol is unchanged.
const search = typeof location !== 'undefined' && location && typeof location.search === 'string' ? location.search : '';
export const W4 = !/[?&]w[123](&|=|$)/.test(search);
