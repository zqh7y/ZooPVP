import { REWARD, TROPHY_ROAD, leagueOf } from '../data';
import type { MatchResult, Opponent, PetType, SaveState } from '../types';
import type { SimSummary } from '../sim/types';
import type { Rng } from '../rng';

/**
 * Books a finished match into the save: trophies, record, roll meter and rolls. A draw (summary.winner -1) changes
 * no trophies, gives no win bonus and leaves the streak alone.
 */
export function applyMatch(state: SaveState, summary: SimSummary, opponent: Opponent, rng: Rng): MatchResult {
  void opponent;
  const won = summary.winner === 0;
  const draw = summary.winner === -1;
  const jitter = rng.int(-REWARD.trophyJitter, REWARD.trophyJitter);
  let delta: number;
  if (draw) {
    delta = 0;
  } else if (won) {
    delta = Math.max(1, REWARD.trophiesWin + jitter);
  } else {
    // a defeat costs less the closer you are to 0 trophies, smoothly
    const scale = Math.min(1, Math.max(0, state.trophies / REWARD.gentleBelow));
    delta = -Math.round(Math.max(0, REWARD.trophiesLose + jitter) * scale);
    delta = Math.max(delta, -state.trophies) || 0;
  }
  const before = leagueOf(state.trophies);
  state.trophies = Math.max(0, state.trophies + delta);
  state.bestTrophies = Math.max(state.bestTrophies, state.trophies);
  state.matches += 1;
  if (won) {
    state.wins += 1;
    state.streak = state.streak > 0 ? state.streak + 1 : 1;
  } else if (!draw) {
    state.streak = state.streak < 0 ? state.streak - 1 : -1;
  }

  const kills = summary.kills[0];
  const share = summary.size[1] > 0 ? Math.min(1, kills / summary.size[1]) : 0;
  const meter = state.rollMeter + share * REWARD.rollsForKills;
  let rolls = Math.floor(meter + 1e-9);
  state.rollMeter = Math.max(0, meter - rolls);
  if (state.rollMeter > 1 - 1e-9) state.rollMeter = 0;
  if (won) rolls += REWARD.rollsForWin;
  state.rolls += rolls;

  const after = leagueOf(state.trophies);
  return { won, draw, trophies: delta, kills, losses: summary.kills[1], rolls, time: summary.time, leagueUp: after > before ? after : -1 };
}

/**
 * Grants the trophy-road rewards up to bestTrophies not yet claimed. reached = indexes into TROPHY_ROAD; pets =
 * the welcome pets it gave, queued on state.gifts (the roll screen opens them like rolls).
 */
export function claimRoad(state: SaveState): { rolls: number; reached: number[]; pets: PetType[] } {
  const reached: number[] = [];
  const pets: PetType[] = [];
  let rolls = 0;
  while (state.claimed < TROPHY_ROAD.length && TROPHY_ROAD[state.claimed].at <= state.bestTrophies) {
    const step = TROPHY_ROAD[state.claimed];
    rolls += step.rolls;
    if (step.pet) pets.push(step.pet);
    reached.push(state.claimed);
    state.claimed += 1;
  }
  state.rolls += rolls;
  state.gifts.push(...pets);
  return { rolls, reached, pets };
}
