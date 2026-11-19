// Wave 4 "Play together" (PLAY.md) ships behind ?w4 until release. Owned by Net; at release this becomes
// `W4 = !/[?&]w[123](&|=|$)/.test(search)`. With W4 off nothing new is visible and the net protocol is unchanged.
const search = typeof location !== 'undefined' && location && typeof location.search === 'string' ? location.search : '';
export const W4 = /[?&]w4(&|=|$)/.test(search);
