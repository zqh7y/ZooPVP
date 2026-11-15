/*
 * TEMPORARY SHIM (UI agent): a stand-in for the BattleView that src/screens/battle.ts is being rewritten into, with
 * exactly the contract's API, so the main screen can be built and play-checked before the real view lands. It draws
 * the arena and plain units and runs the real simulator. Delete this file once battle.ts exports BattleView.
 */
import { createBattle } from '../sim/battle';
import type { Battle } from '../sim/types';
import type { App } from '../screen';
import type { ArmySpec } from '../types';
import { project, viewScale } from '../draw/camera';
import { petArt } from '../draw/pets';
import { restPose, type PetLook } from '../draw/petTypes';
import { ARENA, FIGHT } from '../data';

export interface WaveSetup { player: ArmySpec; enemy: ArmySpec; seed: number; stage: number; wave: number; boss: boolean }
export interface WaveOutcome { won: boolean; kills: number; losses: number; survived: number; time: number }

export class BattleView {
  readonly live = { kills: 0, losses: 0, time: 0, mine: 0, theirs: 0 };
  private battle: Battle | null = null;
  private prep: Battle | null = null;
  private over = 0;
  private t = 0;
  private result: WaveOutcome | null = null;
  constructor(private app: App) {}

  showPrep(player: ArmySpec, enemy: ArmySpec | null): void {
    this.battle = null;
    this.result = null;
    this.prep = createBattle([player, enemy ?? { squads: [] }], 1);
    this.live.kills = this.live.losses = this.live.time = 0;
    this.live.mine = player.squads.reduce((a, s) => a + s.count, 0);
    this.live.theirs = enemy ? enemy.squads.reduce((a, s) => a + s.count, 0) : 0;
  }

  start(setup: WaveSetup): void {
    this.battle = createBattle([setup.player, setup.enemy], setup.seed);
    this.over = 0;
    this.result = null;
  }

  update(dt: number): void {
    this.t += dt;
    const b = this.battle;
    if (!b) return;
    if (!b.over) b.step(dt * 2);
    this.live.time = Math.max(0, b.time);
    this.live.mine = b.alive[0];
    this.live.theirs = b.alive[1];
    const size = [0, 0];
    for (const u of b.units) size[u.team]++;
    this.live.kills = size[1] - b.alive[1];
    this.live.losses = size[0] - b.alive[0];
    if (b.over && !this.result) {
      this.over += dt;
      if (this.over > 1) {
        const s = b.summary!;
        this.result = { won: s.winner === 0, kills: s.size[1] - s.alive[1], losses: s.size[0] - s.alive[0], survived: s.size[0] ? s.alive[0] / s.size[0] : 0, time: s.time };
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.app.arena.drawBack(ctx, this.t);
    const b = this.battle ?? this.prep;
    if (b) {
      const K = viewScale();
      if (!this.battle) b.step(0);
      for (const u of b.units) {
        if (!u.alive) continue;
        if (!this.battle && u.team === 1) continue;
        const p = project(u.x || ARENA.w / 2, u.y || (u.team ? FIGHT.lineFront : ARENA.h - FIGHT.lineFront));
        const look: PetLook = { pet: u.pet, level: 1, team: u.team, weapon: u.weapon, weaponLevel: u.spec.weaponLevel, helmet: u.spec.helmet, sneakers: u.spec.sneakers, chili: u.spec.chili, seed: u.id, boss: u.boss };
        const pose = restPose();
        pose.t = this.t + u.id;
        pose.face = u.face >= 0 ? 1 : -1;
        ctx.save();
        ctx.translate(p.x, p.y);
        petArt.drawShadow(ctx, look, u.r * K, 0);
        petArt.drawPet(ctx, look, pose, u.r * K);
        ctx.restore();
      }
    }
    this.app.arena.drawFront(ctx, this.t);
  }

  outcome(): WaveOutcome | null {
    return this.result;
  }

  phase(): 'prep' | 'fight' | 'over' {
    return this.battle ? (this.result ? 'over' : 'fight') : 'prep';
  }
}
