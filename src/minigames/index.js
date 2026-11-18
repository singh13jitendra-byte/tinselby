// Registry of mini-games (lead-owned). Each game lives in its own folder and default-exports its definition.
import snowball from './snowball/index.js';
import ornaments from './ornaments/index.js';
import sled from './sled/index.js';
import cookies from './cookies/index.js';
// wave 2
import skate from './skate/index.js';
import tram from './tram/index.js';
import giftwrap from './giftwrap/index.js';
import snowman from './snowman/index.js';
import sled2 from './sled/night.js';
// wave 3 (doors 17 / 19 / 21 / 23, behind ?w3 until release)
import carols from './carols/index.js';
import cocoa from './cocoa/index.js';
import presents from './presents/index.js';
import pack from './pack/index.js';
export const MINIGAMES = [snowball, ornaments, sled, cookies, skate, tram, giftwrap, snowman, sled2, carols, cocoa, presents, pack];
