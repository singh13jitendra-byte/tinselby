// Registry of mini-games (lead-owned). Each game lives in its own folder and default-exports its definition.
import snowball from './snowball/index.js';
import ornaments from './ornaments/index.js';
import sled from './sled/index.js';
import cookies from './cookies/index.js';
export const MINIGAMES = [snowball, ornaments, sled, cookies];
