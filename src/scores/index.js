// Friends-town scoreboards (PHASE3.md). ctx.scores = createScores(ctx)
//   submit(game, raw) / list({force}) / format(game, n)   (see api.js / games.js)  — also used by the tests
//   resultsBlock(card, def, result)   framework hook: the "Your town" block on the results card (results.js)
//   onRosterOpen(card)                roster hook: People | Scores tab in the People-in-your-town sheet (roster.js)
// Friends towns only; in the public town every call is a no-op (no global board: strangers never see names).
// Events: scores:town_best {game}, scores:viewed {where: results|roster} (→ analytics town_best / scores_viewed).
import './scores.css';
import { createScoresApi } from './api.js';
import { createResultsBlock } from './results.js';
import { createRosterScores } from './roster.js';
import { GAMES, format, formatShort, toServer, fasterTime } from './games.js';

export function createScores(ctx) {
  const api = createScoresApi(ctx);
  // prefetch the board when a run starts, so the results card knows the previous top score ("You beat Ava's 590!")
  ctx.game.on('minigame:start', () => { if (api.enabled()) api.list().catch(() => {}); });
  return {
    get mode() { return api.mode; },
    get enabled() { return api.enabled(); },
    town: api.town,
    submit: (game, raw) => api.submit(game, raw),
    list: (o) => api.list(o),
    format,
    formatShort,
    toServer,
    games: GAMES,
    fasterTime,
    resultsBlock: createResultsBlock(ctx, api),
    onRosterOpen: createRosterScores(ctx, api),
    _api: api,
  };
}
