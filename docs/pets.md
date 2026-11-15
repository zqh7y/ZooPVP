# ZooPVP pets: the twelve-rung ladder

Final spec, written by the lead designer from two independent proposals (Design A "delight first", Design B
"systems first") and from a verification prototype (see the appendix). It replaces the pet classes (E..SSS
on ants and frogs) with a ladder of twelve pets. Nothing in this file is final pet art: the art job draws the
pets later, in the art style the player picks.

**The player's words:** "add 10 more pets models, 2 is not enough", then "instead of the classes of pets just
make the pets be the classes, every class is other pet".

---

## 0. The decisions in one page

1. **The pets are the classes.** There are twelve pets on twelve rungs, in an order the player fixed: 1 ant,
   2 bee, 3 mouse, 4 snail, 5 frog, 6 crab, 7 grasshopper, 8 hedgehog, 9 chameleon, 10 penguin, 11 beetle,
   12 turtle. Rung 1 is the weakest and most common, rung 12 the strongest and rarest. A pet has no E..SSS
   class any more: its rung comes from its type.
2. **Power doubles every rung.** A rung k+1 fighter has 2x the POWER of a rung k fighter. A pet piece covers
   one grid cell per fighter at every count (x1, x2 and x4), so POWER per cell also doubles every rung. That
   means hp and damage both double every rung, so kill times stay the same.
3. **Fusing.** Two pets of the same type and count stack, x1 -> x2 -> x4 (as today). Two x4 squads of the same
   pet **evolve** into one x1 of the next rung's pet: 8 cells become 1 cell, with 2x the power per cell. Two x4
   turtles cannot fuse.
4. **One trait per pet**, so every rung feels new (section 3).
5. **Weapons and gear keep E..SSS** as today: the same letters, fusing, odds and POWER per class. One balance
   change is needed: a weapon's class now splits its growth between damage and health
   (`WEAPON_CLASS = { dmg: 1.10, cd: 0.97, hp: 1.09 }`). Without it, S and SSS duels collapse to 1.5 s and bats
   one-shot (section 5).
6. **Rolls** give pets by rarity, around a "home rung" for each league, with steep odds above it. Evolving is
   the main way up the ladder, and the trophy road gives a welcome pet at every league.
7. **Bots** shadow the player's army squad by squad, so the rung gap inside a fight stays small.
8. **Save:** SAVE_VERSION 3. Older saves start fresh.

### Where each choice comes from

| Area | Taken from | Why |
|---|---|---|
| Stats, radii, masses, power factors | A | Fitted from fights against ladder neighbours, so body size and mass are priced in (the frog's body alone is worth +30% over an ant's). My re-run reproduced every factor to within 1%. |
| Weapon class gains health | B's diagnosis, my numbers | B found the high-class kill-time collapse. Its fix (hp x1.24 per class) doubles what a weapon class is worth in POWER and turns items into a second ladder. My split keeps today's POWER per class. |
| Ant: pack bonus by distance | A | B's per-squad bonus adds a count term to POWER and makes the first evolve only 1.79x per cell. |
| Bee: flies over its own lines, 80% over 3 s | A | Plus a fix: a dodged sting does not poison. The prototype poisoned before the dodge roll. |
| Mouse: 30% seeded dodge | A | Plus a fix: the hash uses the hit's number between that attacker and that victim, not its position in the hit list. |
| Snail: hides with regrow, cannot act | A | Plus B's order-free rule: the hide is checked after all of a step's damage. B's "keeps biting from the shell" made the snail about 25% stronger than its stats and did not shorten fights (tested, dropped). |
| Frog: +30 knock and interrupts lighter wind-ups | A | B measured plain extra knock-back as worth nothing. |
| Crab, hedgehog, chameleon, beetle, turtle traits | A | Calibrated as a set. The beetle counts only distance it walks (B), not shoves. |
| Grasshopper leap | A | Plus a fix: targets are picked for the whole team in one kick-off pass in id order. The prototype picked them during think, so the result depended on the order units were looked at. |
| Penguin: front row, slide recharges | A | It is a line-breaker that keeps sliding, not a single opening trick. |
| Turtle: 35% armour and a shared stomp | A | B's global follow-through rule changes every fight. The stomp solves the swarm case for the one pet that needs it. |
| Roll odds, pity, ant season | A | Steep odds keep evolving the main engine. B's gentler windows made evolving secondary, as B itself noted (B risk 2). |
| Trophy-road welcome pets | A's pets, B's gift queue | Welcome pets sit one rung above each league's home. The gift is handed out like a roll, so the bench rule still applies. |
| Guide | A's scripted rolls and ant season; B's non-blocking tips | The tutorial already ends at step 5, so the evolve hint is a one-time tip, not a new guide step. |
| Bots | A's shadowing; B's caps and difficulty re-tune | |
| Kick-off | A's bands and order; B's band waits (0 / 2.5 / 5 s) and shared rows only on overflow | |
| Save | Reset (allowed by the brief) | Neither migration is worth its edge cases before launch. |
| Simultaneous wipes | New (B flagged it) | Spikes and poison make mutual knock-outs common in small mirrors. |

---

## 1. The ladder at a glance

POWER is `squadPower` for one bare fighter (no weapon or gear) and for one fighter with its natural kit: a
knife, helmet and chili, all of the rung's natural tier (see `tierOf` in 6.1). One fighter covers one cell, so
these are also POWER per cell.

| Rung | id | Name | Role | Trait (one line) | Kick-off row | POWER, bare | Natural tier | POWER, natural kit |
|---|---|---|---|---|---|---|---|---|
| 1 | ant | Ant | Swarm biter, the yardstick | Bites +10% per nearby ant (up to +30%) | middle | 11.7 | E | 23 |
| 2 | bee | Bee | Fragile flying poisoner | Stings poison for 80% more over 3 s; flies over its own lines | back | 23.6 | D | 55 |
| 3 | mouse | Mouse | Evasive skirmisher | Dodges 30% of hits | middle | 46.8 | D | 109 |
| 4 | snail | Snail | Slow shell tank | Once per life, hides in its shell below half health | front | 93.5 | C | 268 |
| 5 | frog | Frog | Hopping bruiser and pusher | Tongue slap: +30 knock-back, interrupts lighter foes | front | 188 | C | 539 |
| 6 | crab | Crab | Double-hit brawler | Every attack is two pinches of 55% | middle | 376 | B | 1,320 |
| 7 | grasshopper | Grasshopper | Back-line leaper | Leaps onto the enemy back line at the whistle; the landing stuns | back | 748 | B | 2,627 |
| 8 | hedgehog | Hedgehog | Spiky tank | Spikes return 30% of every hit it takes | front | 1,504 | A | 6,505 |
| 9 | chameleon | Chameleon | Long-reach puller | Tongue reach 52; pulls light foes in | back | 3,012 | A | 13,028 |
| 10 | penguin | Penguin | Line-breaker | Belly-slides at 3x speed and bowls foes over | front | 6,023 | S | 32,106 |
| 11 | beetle | Beetle | Charging heavy | After a 90 px run-up, the next strike deals 2.5x with a big shove | front | 11,988 | S | 63,906 |
| 12 | turtle | Turtle | Armoured boss | Armour cuts 35% of everything; its stomp hits up to 4 foes around it | front | 23,962 | SSS | 160,957 |

The rung-to-rung POWER ratio is 1.987 to 2.014 (see 4.1).

---

## 2. The data

### 2.1 Types (src/types.ts)

```ts
export type PetType =
  | 'ant' | 'bee' | 'mouse' | 'snail' | 'frog' | 'crab'
  | 'grasshopper' | 'hedgehog' | 'chameleon' | 'penguin' | 'beetle' | 'turtle';
```

- `Piece.level`: for a pet it is always 1. It is kept so the save keeps its shape, and it is never shown. For
  weapons and gear it is the class, 1..7, as today.
- `SquadSpec.level` is removed. A squad's rung comes from its pet.
- `RollResult` gains `gift?: boolean` (a trophy-road pet). For a pet, `level` is 1.
- `SaveState` becomes version 3 (see 6.10).

### 2.2 PETS (src/data.ts)

`PET_TYPES` lists the pets in rung order and is the only source of a pet's rung:

```ts
export const PET_TYPES: readonly PetType[] = ['ant', 'bee', 'mouse', 'snail', 'frog', 'crab',
  'grasshopper', 'hedgehog', 'chameleon', 'penguin', 'beetle', 'turtle'];
export const rungOf = (p: PetType) => PET_TYPES.indexOf(p) + 1;   // 1..12
export const petAt = (rung: number) => PET_TYPES[rung - 1];       // undefined above 12
export const isPet = (t: PieceType): t is PetType => (PET_TYPES as readonly string[]).includes(t);
/** the item-style tier (1..7 = E..SSS) a rung looks like: frames, classFx, the natural kit, the reveal sound */
export const tierOf = (rung: number) => Math.max(1, Math.min(7, Math.round(1 + ((rung - 1) * 6) / 11)));
// rung 1..12 -> E D D C C B B A A S S SSS

export type MoveStyle = 'scurry' | 'fly' | 'dart' | 'glide' | 'hop' | 'scuttle' | 'leap' | 'roll' | 'creep' | 'slide' | 'charge' | 'plod';
export type LineRow = 'front' | 'middle' | 'back';

export interface PetDef {
  hp: number;      // health of one fighter
  dmg: number;     // damage of its own attack
  cd: number;      // seconds between its own attacks
  reach: number;   // px past its body
  speed: number;   // px per second
  radius: number;  // body radius in the arena, px
  mass: number;    // how hard it is to push around
  move: MoveStyle;
  row: LineRow;    // its band at kick-off
  power: number;   // what its trait and body are worth in squadPower (fitted, see 4.2)
}

export const PETS: Record<PetType, PetDef> = {
  ant:         { hp: 58,    dmg: 3.96,  cd: 0.6,  reach: 4,  speed: 56, radius: 16, mass: 1.0, move: 'scurry',  row: 'middle', power: 1.00 },
  bee:         { hp: 89,    dmg: 5.54,  cd: 0.5,  reach: 5,  speed: 74, radius: 13, mass: 0.6, move: 'fly',     row: 'back',   power: 1.25 },
  mouse:       { hp: 177,   dmg: 14.6,  cd: 0.45, reach: 3,  speed: 68, radius: 14, mass: 0.8, move: 'dart',    row: 'middle', power: 1.03 },
  snail:       { hp: 413,   dmg: 61,    cd: 1.1,  reach: 4,  speed: 26, radius: 20, mass: 2.4, move: 'glide',   row: 'front',  power: 1.03 },
  frog:        { hp: 862,   dmg: 86.4,  cd: 1.0,  reach: 9,  speed: 40, radius: 24, mass: 2.6, move: 'hop',     row: 'front',  power: 1.15 },
  crab:        { hp: 1686,  dmg: 146.6, cd: 1.0,  reach: 7,  speed: 48, radius: 23, mass: 2.6, move: 'scuttle', row: 'middle', power: 1.26 },
  grasshopper: { hp: 3616,  dmg: 306,   cd: 0.8,  reach: 6,  speed: 46, radius: 21, mass: 1.6, move: 'leap',    row: 'back',   power: 1.06 },
  hedgehog:    { hp: 7846,  dmg: 447,   cd: 0.9,  reach: 4,  speed: 46, radius: 25, mass: 2.6, move: 'roll',    row: 'front',  power: 1.27 },
  chameleon:   { hp: 15232, dmg: 1400,  cd: 1.1,  reach: 52, speed: 36, radius: 25, mass: 2.2, move: 'creep',   row: 'back',   power: 1.14 },
  penguin:     { hp: 34560, dmg: 2975,  cd: 1.0,  reach: 6,  speed: 34, radius: 28, mass: 3.4, move: 'slide',   row: 'front',  power: 0.99 },
  beetle:      { hp: 65434, dmg: 6103,  cd: 1.3,  reach: 10, speed: 40, radius: 30, mass: 4.2, move: 'charge',  row: 'front',  power: 1.14 },
  turtle:      { hp: 97280, dmg: 15421, cd: 1.4,  reach: 6,  speed: 26, radius: 34, mass: 6.0, move: 'plod',    row: 'front',  power: 1.22 },
};
```

How the numbers were made: each pet has a body on the ant's scale (A's base hp/dmg: ant 58/3.96,
bee 44.5/2.77, mouse 44.3/3.64, snail 51.6/7.63, frog 53.9/5.40, crab 52.7/4.58, grasshopper 56.5/4.78,
hedgehog 61.3/3.49, chameleon 59.5/5.47, penguin 67.5/5.81, beetle 63.9/5.96, turtle 47.5/7.53). Each base is
scaled so that its fitted strength equals the ant's, then hp and dmg are multiplied by 2^(rung-1). The table
stores the results so they can be read and tuned directly. A unit test checks the 2x rule (see 4.1). The
turtle's low base hp is right: its armour and body carry it.

`PET_CLASS` is deleted. Speed, radius and mass are per pet and no longer scale. `MAX_LEVEL`, `CLASSES`,
`classOf` and `cls` become item-only.

### 2.3 Names and drag lines

| id | PIECE_NAME | PIECE_DESC (shown while dragged) |
|---|---|---|
| ant | Ant | Bites harder next to other ants. |
| bee | Bee | Flies over friends. Its sting keeps hurting. |
| mouse | Mouse | Tiny and quick. Dodges almost a third of hits. |
| snail | Snail | Hides in its shell once when hurt. |
| frog | Frog | Its tongue slaps foes far away. |
| crab | Crab | Two pinches every attack. |
| grasshopper | Grasshopper | Leaps onto the back line at the whistle. |
| hedgehog | Hedgehog | Spikes hurt whoever hits it. |
| chameleon | Chameleon | Hits from afar and reels light foes in. |
| penguin | Penguin | Belly-slides in and bowls foes over. |
| beetle | Beetle | Charges in: its first strike hits huge. |
| turtle | Turtle | Armour cuts every hit. It stomps all round. |

The beetle is drawn as a rhino beetle, but it is called "Beetle" so it fits on tiles and banners.

### 2.4 Trait numbers (src/data.ts)

Every trait number is in one table, so tools/balance.ts can sweep them:

```ts
export const TRAIT = {
  ant:         { per: 0.10, max: 3, range: 100 },
  bee:         { poison: 0.8, time: 3, tickEvent: 0.5 },
  mouse:       { dodge: 0.3 },
  snail:       { below: 0.5, time: 2.5, take: 0.15, regrow: 0.15, massMul: 5 },
  frog:        { knock: 30, interruptMass: 0.8, interrupt: 0.2 },
  crab:        { share: 0.55 },
  grasshopper: { flight: 0.8, gap: 2, splash: 30, stun: 0.6, knock: 20, spread: 120, side: 0.3, cdLeft: 0.5, warn: 0.3 },
  hedgehog:    { thorns: 0.3 },
  chameleon:   { pull: 28, pullMass: 1.5 },
  penguin:     { speed: 3, minDist: 110, maxTime: 1.6, touch: 3, slam: 1.5, knock: 55, splash: 36, standUp: 0.4, recharge: 5, steer: 30 },
  beetle:      { run: 90, speed: 1.35, mul: 2.5, knock: 70, stun: 0.35 },
  turtle:      { armour: 0.35, stompMax: 4 },
} as const;
```

---

## 3. The twelve pets

Every pet has one look, one stat line, one trait and one kick-off band. "Hit" means one entry in the
simulator's `hits` list (an attack, a pinch, a landing, a slam). Poison ticks and spikes are not hits unless
a rule says so. A rule that names a weapon's numbers uses that pet's `UnitStats` (weapon and gear included).
The death lists are the deaths.ts `OWN` lists: 8 entries each, weighted by repetition as today.

### 3.1 Ant (rung 1)

- **Role:** the starter swarm biter and the yardstick every other pet is measured against.
- **Look:** long and low: three beads in a row (head, waist, round rear), two elbowed antennae and six thin
  legs. It reads as a horizontal dash even at 10 px.
- **Stats:** hp 58, dmg 3.96, cd 0.6, reach 4, speed 56, radius 16, mass 1, move `scurry` (the sim's plain walk).
- **Trait, Teamwork:** each strike deals +10% for every other living friendly ant whose centre is within 100 px
  of its own, up to +30% (3 others). Ants of any squad count. The count is taken in `think` from the step's
  start positions and applies to every victim of that strike (bat arc, spear line). Its POWER factor is 1.00:
  the pack bonus is part of the reference. Line-up spacing puts neighbours 88 px apart; a 60 px range never
  triggered in testing.
- **Kick-off:** middle band.
- **Deaths:** `['squish','squish','squish','squish','petals','pop','spin','deflate']` (today's list).
- **Voice:** tiny dry mandible clicks, "tik-tik" (two 4 ms high-passed noise ticks), on each bite. A pack bite
  (+30%) adds a bright little chime (a 2.4 kHz sine blip). Scurrying is silent.
- **Battle effect:** the bite spark grows one size per packed ant (x1..x4), and a thin warm line flicks
  between packed ants for one frame. Dust puffs under the legs.

### 3.2 Bee (rung 2)

- **Role:** a fragile, fast flying poisoner (a glass cannon), and the first pet most players evolve into.
- **Look:** a fuzzy round ball with three stripes, two big round wings standing up like ears and a tiny
  stinger. It floats a body-height above its shadow: the only pet whose feet never touch the grass.
- **Stats:** hp 89, dmg 5.54, cd 0.5, reach 5, speed 74, radius 13, mass 0.6, move `fly`.
- **Trait, Poison sting:**
  1. Every hit it lands also poisons. A dodged sting does nothing. The pool holds 80% of that hit's damage
     after shield block and drains evenly over 3 s. Stings stack: each sting is its own pool and remembers
     its bee.
  2. Pools drain at the end of `applyHits`, every step. Turtle armour and the snail's shell cut each tick.
     Ticks are not hits: they do not push, flinch, stun, interrupt or reset `sinceHit`, they cannot be dodged,
     and they never trigger spikes. Poison keeps working after the bee falls.
  3. A knock-out by poison is credited to the bee of the newest pool on that victim.
  4. Flyer: it skips collisions with its own team, so it flies over its own lines. It bumps foes normally and
     can be hit normally.
  - POWER factor 1.25. Its traits alone were worth 1.26 against a trait-less twin.
- **Kick-off:** back band.
- **Deaths:** `['pop','pop','petals','petals','deflate','deflate','spin','spin']`. No squish: it flies.
- **Voice:** a short buzzing drone (two detuned saws near 190 Hz with fast vibrato) when it dives into reach.
  It is a one-shot, not a loop. The sting is a short "zip" (a fast upward sine). Poison is a soft, quiet
  "blub" on each poison event (every 0.5 s per victim, at most 3 playing at once).
- **Battle effect:** wings as fast blurred ovals over a bobbing hover shadow. The view holds its lift near 0.5
  with a 4 Hz bob; the sim does not need `hop`. A poisoned foe gets a green tint and green bubbles rising from
  it, one per poison event, and a green swirl when a poison kill lands.

### 3.3 Mouse (rung 3)

- **Role:** evasive skirmisher.
- **Look:** a teardrop body with two huge round ears (the biggest ears for its size), a long thin curly tail
  and a pink nose. It reads as two circles over a dot.
- **Stats:** hp 177, dmg 14.6, cd 0.45, reach 3, speed 68, radius 14, mass 0.8, move `dart` (quick bursts with
  tiny pauses, in the art only; the sim moves it like `scurry`).
- **Trait, Dodge:** 30% of the hits aimed at it miss completely: no damage, push, stun, interrupt or poison.
  Each hit is rolled on its own: it misses when
  `hashSeed(seed, tickN, attackerId, mouseId, k) / 2^32 < 0.30`, where `k` counts the hits from that attacker
  to this mouse in this step (0, or 0 and 1 for two crab pinches). The roll never depends on the order units
  are looked at or on a hit's place in the list. Everything else is dodgeable, including a grasshopper
  landing, a penguin slam, a beetle charge and each turtle stomp. Poison ticks, spikes and the penguin's shove
  wave cannot be dodged. A dodge sends a `dodge` event. POWER factor 1.03: the dodge is worth about 1.21, and
  its tiny, light body costs most of that back.
- **Kick-off:** middle band.
- **Deaths:** `['launch','launch','launch','spin','spin','squish','pop','pop']`. It is light, so it tumbles away.
- **Voice:** a high squeak (a 60 ms sine chirp from 2.2 to 3 kHz) on each bite. A dodge is an airy swish
  (band-passed noise sweeping up) plus a tiny "hee".
- **Battle effect:** on a dodge it hops sideways in the view, leaving two fading afterimages and a white
  "whiff" puff where the hit would have landed. Its tail curls when it darts.

### 3.4 Snail (rung 4)

- **Role:** slow shell tank.
- **Look:** a tall spiral shell (the only spiral on the ladder) on a low soft foot, with two eye stalks topped
  by dots. The slowest walker.
- **Stats:** hp 413, dmg 61, cd 1.1, reach 4, speed 26, radius 20, mass 2.4, move `glide` (smooth, no bob).
- **Trait, Shell hide:** once per life, it hides for 2.5 s (phase `shell`). The check runs at the end of
  `applyHits`, after all of that step's hits, spikes and poison, so it does not depend on order: the first
  step that ends with it alive and below 50% health starts the hide. While hidden:
  - it takes 85% less damage from hits, poison and spikes;
  - it cannot be pushed (no knock-back, and it counts as mass x5 in collisions) or stunned;
  - it does not move or attack;
  - it regrows 15% of its full health, evenly over the 2.5 s.

  Then it pops out (phase `move`). Foes keep hitting the shell, which is the joke. A hit that takes it from
  above half straight to a knock-out skips the hide. The regrow is part of the hide: without it the hide was
  a net loss in testing. POWER factor 1.03.
- **Kick-off:** front band.
- **Deaths:** `['shatter','shatter','shatter','spin','spin','spin','petals','deflate']`. The shell cracks into
  tidy stone pieces, or spins away like a top.
- **Voice:** a soft round "bloop" (a low, falling sine) on each bite. Hiding is a hollow wooden "tok" and a
  muffled "mmp". Popping out is a cheerful "plip".
- **Battle effect:** a short sparkle trail while it glides (glitter, never slime). When it hides, the body
  zips into the shell and the shell gets a steel rim highlight. Hits on it spark small "tink" stars, little
  green pluses rise during the regrow, and popping out gives a tiny ring burst.

### 3.5 Frog (rung 5)

- **Role:** hopping bruiser and pusher.
- **Look:** a wide squat body with two big eye bumps on top and folded hind legs (the classic "M" top line).
  It stretches long mid-hop.
- **Stats:** hp 862, dmg 86.4, cd 1.0, reach 9, speed 40, radius 24, mass 2.6, move `hop` (today's hop: 0.36 s
  in the air, 0.2 s of rest).
- **Trait, Tongue slap:** every hit pushes 30 px further than its weapon would (knock + 30, then divided by the
  target's mass as usual). Its hits also interrupt the wind-up of a foe lighter than 0.8x its mass, which is
  under 2.08: ants, bees, mice and grasshoppers. That is the bat's heavy rule: the foe goes to `recover` for
  0.2 s. POWER factor 1.15.
- **Kick-off:** front band.
- **Deaths:** `['pop','pop','pop','deflate','deflate','deflate','petals','spin']` (today's list).
- **Voice:** today's ribbit (`hop`) and tongue snap (`bite`), plus a rubbery "thwap" when a slap lands.
- **Battle effect:** a tongue-lash line to the foe, which skids back with a dust streak. Today's landing puff
  on every hop.

### 3.6 Crab (rung 6)

- **Role:** double-hit brawler.
- **Look:** a wide, flat oval shell with two oversized raised pincers (a "V V" above it) and eye stalks. It is
  always drawn side-on to its path.
- **Stats:** hp 1686, dmg 146.6, cd 1.0, reach 7, speed 48, radius 23, mass 2.6, move `scuttle` (the sim walks
  it straight; the view turns its body 90 degrees to its path, with a quick leg ripple).
- **Trait, Double pinch:** every attack lands as two hits on each of its victims (two arcs with a bat, two
  thrusts with a spear), each at 55% of the damage, so 110% in total. Each pinch is its own hit for dodge,
  shield block, spikes, armour, stun and knock-back, exactly as measured. Both land in the same step, and the
  view draws the second 0.12 s after the first. POWER factor 1.26: the split hits plus its sturdy, wide body.
- **Kick-off:** middle band.
- **Deaths:** `['launch','launch','launch','spin','spin','spin','shatter','shatter']`. It flips onto its back
  and sails off, spins on its back, or its shell cracks.
- **Voice:** two dry wood-block clacks 0.12 s apart ("clack-clack") per attack. Scuttling is a soft, rapid
  tick-tick, played at most once per 0.3 s per crab.
- **Battle effect:** two crossing white snip marks per attack, one after the other, and a faint sand spray as
  it scuttles side-on.

### 3.7 Grasshopper (rung 7)

- **Role:** back-line leaper and assassin.
- **Look:** a long, slim body tilted nose-down, giant folded back legs with the knees high above its back (a
  "Z"), and long sweeping antennae.
- **Stats:** hp 3616, dmg 306, cd 0.8, reach 6, speed 46, radius 21, mass 1.6, move `leap` (one big opening
  leap, then short hops like the frog).
- **Trait, Big leap:**
  1. **Kick-off pass.** At the whistle, before any unit thinks, each team's grasshoppers pick their landing
     targets in id order, team by team, with the same procedure for both teams. For each living foe f:
     `score = depth(f) - 120 x (teammate grasshoppers already aimed at f) - 0.3 x |f.x - u.x|`, where
     `depth(f)` is f's distance from the midline (y = ARENA.h/2) on its own side. It takes the highest score;
     a tie goes to the lower id.
  2. **Flight.** It ignores its band's wait. It leaps in 0.8 s along a straight line toward that foe and stops
     with 2 px between their bodies. The end point is fixed at take-off, and it moves at a constant velocity
     (phase `air`). `SimUnit.hop = sin(pi x t / 0.8)` draws the arc. In the air it cannot be targeted, hit,
     pushed or collided with, and it does not act or bounce off the edges.
  3. **Landing.** Every foe whose body is within 30 px of its body takes one hit of its damage, with knock 20
     and a 0.6 s stun. A hiding snail takes the hit but is not stunned. Its own attack cooldown starts half
     full. A `land` event with `big: true` is sent.
  4. One leap per life.
  - POWER factor 1.06.
- **Kick-off:** back band. It leaves at the whistle anyway, arcing over both front lines.
- **Deaths:** `['launch','launch','launch','launch','spin','spin','petals','petals']`.
- **Voice:** a spring "boing" (a sine swept up from 300 to 900 Hz) on take-off, a cricket trill in the air (a
  fast amplitude-modulated 4 kHz tone), and a thump plus "bonk" on landing. The foes it lands on get the
  existing `stun` sound.
- **Battle effect:** a high arc with a dotted trail. A landing marker (a growing shadow) appears 0.3 s before
  it lands, then a ground ring and a dust burst on landing, with stun stars over the foes it hit.

### 3.8 Hedgehog (rung 8)

- **Role:** a spiky tank that punishes swarms and glass cannons.
- **Look:** a dome of spikes (a sawtooth outline) with a pointy snout and a button nose. While moving it curls
  into a perfect spiky ball and rolls.
- **Stats:** hp 7846, dmg 447, cd 0.9, reach 4, speed 46, radius 25, mass 2.6, move `roll` (the view curls it
  into a ball while it moves; the sim walks it).
- **Trait, Spikes:** whoever hits it takes back 30% of the damage the hedgehog actually took from that hit,
  after dodge, shield block and its own cuts. This comes back as a spike hit: no push, stun, poison or dodge,
  and it never triggers spikes, so there are no loops. Poison ticks never trigger spikes. The attacker's own
  turtle armour or snail shell cuts the spike. A spike knock-out is the hedgehog's kill. Spikes are collected
  during `applyHits` and applied after all the main hits. POWER factor 1.27; spikes alone were worth 1.14.
- **Kick-off:** front band.
- **Deaths:** `['pop','pop','pop','pop','deflate','deflate','spin','spin']`. The gag: it pops like a balloon
  and its spikes fly off as confetti.
- **Voice:** snuffly "huff-huff" puffs of filtered noise while rolling (at most once per 0.4 s per hedgehog).
  The spikes make a bright metallic "shing" when they hurt an attacker.
- **Battle effect:** it rolls as a motion-blurred spiky ball and pops open on contact. When its spikes bite
  back, three small spike-shaped sparks fly at the attacker, and the attacker flinches.

### 3.9 Chameleon (rung 9)

- **Role:** a long-reach puller that fights from behind its own line.
- **Look:** a curled spiral tail behind, a crest on its head, cone eyes that swivel and gripping two-toed feet.
  It walks with a sway.
- **Stats:** hp 15232, dmg 1400, cd 1.1, reach 52, speed 36, radius 25, mass 2.2, move `creep` (a
  sway-and-pause stalk in the art; the sim walks it).
- **Trait, Long tongue:**
  - **Reach.** Its attack reaches 52 px past its body, plus its weapon's reach, because the weapon rides on the
    tongue.
  - **Pull.** Every hit on a foe lighter than 1.5x its mass (under 3.3) pulls that foe 28 px toward the
    chameleon instead of pushing it. The pull is not reduced by the foe's mass, and it uses the knock-back
    channel, so it eases off like a shove. Every pet up to the hedgehog, the chameleon itself included, is
    under 3.3; penguins, beetles and turtles are not.

  POWER factor 1.14.
- **Kick-off:** back band.
- **Deaths:** `['petals','petals','petals','petals','pop','pop','spin','deflate']`. A burst of rainbow petals as
  its colours fly off.
- **Voice:** a rubbery "thwip" (a fast downward sweep) as the tongue shoots out, and a "zup" (upward) when it
  pulls. A soft click when its eyes swivel (rare).
- **Battle effect:** a long pink tongue line that snaps out and back, and a pulled foe slides toward it with
  speed lines. Its skin shimmers through colours as it creeps and settles on its team accent when it strikes.

### 3.10 Penguin (rung 10)

- **Role:** a line-breaker that bowls into the fight.
- **Look:** an upright egg in a tuxedo: white belly, dark back, two flippers and orange feet. It is the only
  upright pet. When it slides, it lies flat like a torpedo.
- **Stats:** hp 34560, dmg 2975, cd 1.0, reach 6, speed 34, radius 28, mass 3.4, move `slide` (waddles at 34
  px/s, belly-slides at 102 px/s).
- **Trait, Belly slide:**
  1. **Start.** Whenever it is in `move`, its target is more than 110 px away and its slide is ready, it flops
     onto its belly (phase `slide`). It then moves at 3x its speed for up to 1.6 s, keeps its target (no
     retargeting) and steers sharply (velocity blend 30 x DT instead of 12 x DT).
  2. **Slam.** The first foe its body touches (within 3 px) takes a slam: one hit of 1.5x its damage, knock 55,
     counted as heavy (it interrupts a lighter foe's wind-up). Every other foe within 36 px of its body is
     shoved 55 px, with no damage; the shove cannot be dodged. The penguin then stands up for 0.4 s with no
     attacks (`recover`), and its attack cooldown restarts.
  3. **Recharge.** The slide is ready again 5 s after it ends, whether it touched anyone or not. A stun ends a
     slide and starts the 5 s recharge.
  4. It ignores its band's wait, so it slides at the whistle.
  - POWER factor 0.99.
- **Kick-off:** front band.
- **Deaths:** `['spin','spin','spin','spin','launch','launch','squish','squish']`. It spins on its belly like a
  top.
- **Voice:** a honky little squawk (a nasal square wave) when it flops, a long icy "shhhh" for the slide
  (filtered noise with a falling cutoff), and a bowling "clonk" for the slam.
- **Battle effect:** it flops flat and slides on a trail of white frost sparkles. On the slam, foes scatter
  like bowling pins with a ring of snow puffs.

### 3.11 Beetle (rung 11)

- **Role:** a charging heavy with one huge blow.
- **Look:** a rhino beetle: a glossy armoured dome with one big curved horn up front and short, strong legs.
  The horn is what reads.
- **Stats:** hp 65434, dmg 6103, cd 1.3, reach 10, speed 40, radius 30, mass 4.2, move `charge`.
- **Trait, Horn charge:**
  - It adds up the distance it walks, |v| x DT each step (shoves do not count). At 90 px since its last
    strike it is charged: its horn goes down, it moves 1.35x faster (54 px/s) and a `charge` event is sent.
  - Its next strike deals 2.5x damage, adds +70 knock, stuns 0.35 s (or its weapon's stun, if longer) and
    counts as heavy, so it interrupts the wind-up of a foe lighter than 0.8x its mass (under 3.36).
  - Every strike, charged or not, resets the count.
  - At kick-off it is charged about 2.2 s in, so its first contact is always a charge.

  POWER factor 1.14; the charge alone was worth 1.13.
- **Kick-off:** front band.
- **Deaths:** `['launch','launch','launch','spin','spin','spin','shatter','shatter']`. It flips onto its back
  and sails off, spins on its back, or its shell cracks.
- **Voice:** a low hum (detuned saws near 80 Hz) that swells while it is charged. The charge hit is a big
  "BONK": a sub thump, a woody knock and a short ring.
- **Battle effect:** while charged, its horn lowers, its body tilts forward and dust trails from its feet. The
  charge hit gives a big star burst and a small screen shake (2 px, 0.15 s, at most once per 0.5 s), and the
  foe flips over tumbling.

### 3.12 Turtle (rung 12, the top)

- **Role:** the armoured boss at the top of the ladder. Two x4 turtles cannot fuse.
- **Look:** the biggest pet: a wide, high dome of hexagon plates (hexes, not a spiral), four stubby legs and a
  slow head that pokes out. The ground thumps when it steps.
- **Stats:** hp 97280, dmg 15421, cd 1.4, reach 6, speed 26, radius 34, mass 6, move `plod`.
- **Trait, Shell armour and stomp:**
  1. **Armour.** Every hit, poison tick and spike on it is cut by 35%, on top of a shield's front block. Hits
     it cuts carry `armour: true`, for the view.
  2. **Stomp.** Its attack, with any weapon, is a stomp that lands all round it. It hits every foe whose body is
     within its reach (`r + f.r + reach`, weapon reach included), nearest first (a tie goes to the lower id), up
     to max(4, its weapon's splash). Its target is added if it is not among them but is within the usual melee
     slack. A bat's arc and a spear's line do not apply.
  3. **Shared damage.** When the stomp hits more foes than its weapon alone would (1, or 3 with a bat), its
     damage is split evenly between them. Against weak swarms, the overkill turns into multi-kills, without
     multiplying its damage against equals. (Hitting every foe at full damage made one turtle beat two
     equal-power beetles every time.)
  - POWER factor 1.22; the armour alone was worth 1.24.
- **Kick-off:** front band, the very front.
- **Deaths:** `['spin','spin','spin','spin','shatter','shatter','shatter','squish']`. On its back, spinning like
  a top (the cartoon classic), or it turns to stone and breaks. It almost never launches, at mass 6.
- **Voice:** a slow, low "hmm" grunt and heavy sub "thoom" footsteps (at most one per 0.5 s for all turtles). A
  bright "tink" (a high triangle ping) when the armour cuts a hit (at most one per 0.15 s), and a deep "boom"
  for a stomp that hits two or more.
- **Battle effect:** each step thumps a dust ring and nudges the camera 1 px, only while two or fewer turtles
  are on the field. Hits glance off its shell as small white sparks with the "tink". The stomp sends a ground
  ring outward, and everything it lands on bounces.

### 3.13 Counters between roles

These are soft counters. They come from the rules above: they shift a fight, they do not decide it. Mixed
armies average them out; single-pet pairings can polarise (see risk 5).

| Trait | Strong against | Because | Countered by |
|---|---|---|---|
| Ant pack | Lone pets of its rung | +30% when packed | Spikes (small bodies take the 30% back), turtle stomp, bat arcs, penguin shoves that break up the pack |
| Bee poison, flyer | Slow tanks without cuts (frog, crab) | Damage keeps flowing after contact; it flies past its own front | Frog (interrupts its wind-ups), chameleon (pulls it in from 52 px), spikes on its fragile body, the grasshopper landing on the back line |
| Mouse dodge | Big single blows: beetle charge, penguin slam, grasshopper landing, stomp | A dodged blow is wasted | Spikes (cannot be dodged), the penguin shove wave, chameleon pulls (it is light) |
| Snail shell | Steady chip damage near half health (ants, bees, knives) | 2.5 s of 85% cut plus a 15% regrow | Burst that skips past half health to a knock-out: beetle charge, penguin slam, grasshopper landing |
| Frog slap | Light quick hitters (ant, bee, mouse, grasshopper) | Interrupts their wind-ups and shoves them away | Heavier pets (snail, crab, hedgehog and up) it cannot interrupt |
| Crab pinch | Mice (two dodge rolls per attack) | It rarely whiffs a whole attack | Nothing special: it loses to raw power |
| Grasshopper leap | Back lines: bee, chameleon, spear users | It lands on them and stuns at the whistle | A tough back line, and hedgehogs (the landing hit is spiked back) |
| Hedgehog spikes | Swarms and glass cannons (ant, bee, mouse) | Every attacker takes 30% of its own damage back | Poison (ticks are never spiked), turtles (armour cuts the spike) |
| Chameleon tongue | Light melee (up to the hedgehog) | Hits from 52 px and drags them onto its own line | Grasshopper (lands on it), penguin and beetle (too heavy to pull) |
| Penguin slide | Packed lines and spear back rows | Slam plus a 55 px shove wave | Stuns (a shield bash or a grasshopper landing ends a slide), mice (the slam can whiff) |
| Beetle charge | Snails, and any foe in a wind-up | 2.5x opening blow, heavy | Mice (dodge the charge), close brawls (it needs 90 px of walking to charge again) |
| Turtle stomp, armour | Swarms of anything | Shared stomp turns overkill into multi-kills | Long reach (chameleon, spears) that hits from outside its stomp; it is slow |

---

## 4. The power curve

### 4.1 The rule, and the proof that it holds

```
squadPower(s) = sqrt(toughness x dps) x PETS[s.pet].power x s.count x POWER.scale     (POWER.scale 0.6, countExp 1)
toughness = hp / (1 - block)
dps       = dmg / cd x (1 + 0.25 (splash - 1)) x (1 + 0.2 (pierce - 1)) x (1 + 2 stun)  (as today)
```

| Rung | Pet | POWER, bare x1 | x rung below | Natural tier | POWER, natural kit |
|---|---|---|---|---|---|
| 1 | ant | 11.7 | - | E | 23 |
| 2 | bee | 23.6 | 2.006 | D | 55 |
| 3 | mouse | 46.8 | 1.987 | D | 109 |
| 4 | snail | 93.5 | 1.999 | C | 268 |
| 5 | frog | 188 | 2.014 | C | 539 |
| 6 | crab | 376 | 1.995 | B | 1,320 |
| 7 | grasshopper | 748 | 1.990 | B | 2,627 |
| 8 | hedgehog | 1,504 | 2.011 | A | 6,505 |
| 9 | chameleon | 3,012 | 2.003 | A | 13,028 |
| 10 | penguin | 6,023 | 2.000 | S | 32,106 |
| 11 | beetle | 11,988 | 1.990 | S | 63,906 |
| 12 | turtle | 23,962 | 1.999 | SSS | 160,957 |

- **Per fighter = per cell.** POWER is linear in count, and an x1, x2 or x4 covers 1, 2 or 4 cells. So x1, x2
  and x4 have the same POWER per cell, and POWER per cell doubles every rung: 2048x from ant to turtle.
- **Stacking** (x1 + x1 -> x2, x2 + x2 -> x4) keeps POWER exactly (2P -> 2P).
- **Evolving:** two x4 of rung k (8 cells, 8P) become one x1 of rung k+1 (1 cell, 2P). That is 2.00x per cell
  at every rung (1.987 to 2.014 by the table). A full x4 of the new rung (8P in 4 cells) equals the two old
  squads in half the space.
- **Exchange rates are exact:** x4 of rung k = x2 of rung k+1 = x1 of rung k+2 in POWER, in 4, 2 and 1 cells.
- **Pets carry the progression.** A natural kit multiplies a pet's POWER by 2.0x (E, ant) up to 6.7x (SSS,
  turtle), which is worth at most about 2.7 rungs.
- **Test:** for every k, `squadPower(bare x1 of rung k+1) / squadPower(bare x1 of rung k)` is in 2.00 +- 0.03.

**Why hp cannot be small.** POWER is a geometric mean, so 2x POWER per rung means 4x (toughness x dps) per rung.
With kill times held, hp and damage both double each rung: the turtle has 97,280 hp and hits for 15,421. These
numbers are internal and never shown. There are no damage numbers, the HP bars and the tug bar are shares, and
death power uses ratios. "Bloat" would only be felt as sponginess, which is a matter of kill time (held, see
4.3) and of the rung gap inside a fight (kept small by the bots, see 6.8). POWER shown in the lobby is
formatted with k and M (`12.3k`, `1.61M`).

### 4.2 Calibration (PETS.power)

The power factors (1.00, 1.25, 1.03, 1.03, 1.15, 1.26, 1.06, 1.27, 1.14, 0.99, 1.14, 1.22) were fitted by
least squares from hp-handicap fights of each pet against its ladder neighbours. Every pet was played on the
ant's scale; neighbours were rung +-1 and +-2; counts x1, x2 and x4; no weapon, knife and spear. The fit error
is about 7%. Each base body was then scaled so that its true strength equals the ant's at the same rung. I
re-ran the fit independently (it plays E-class items, which the weapon change in section 5 does not touch):
every pet came back at 0.985 to 1.008 of the ant's strength.
Traits alone, measured against a trait-less twin, are worth: bee 1.26, mouse 1.21, turtle armour 1.24,
hedgehog spikes 1.14, beetle charge 1.13.

Factors drift with fight length: opening tricks are worth more in short fights, and the beetle went from 1.30
to 1.14 when kill times grew. tools/balance.ts owns the fit and must be re-run after any stat or trait change.

### 4.3 Kill times (one-on-one mirror, seconds from the first damage to the knock-out)

The fighters carry their natural kit (weapon, helmet and chili of the rung's natural tier), with this spec's
weapon class. Means of 12 seeds.

| Rung | Pet | Tier | No weapon | Knife | Bat | Shield | Spear |
|---|---|---|---|---|---|---|---|
| 1 | ant | E | 8.8 | 4.7 | 8.2 | 14.5 | 7.4 |
| 2 | bee | D | 6.1 | 3.7 | 6.0 | 10.2 | 5.1 |
| 3 | mouse | D | 8.1 | 4.2 | 6.4 | 12.5 | 6.2 |
| 4 | snail | C | 10.4 | 5.9 | 7.2 | 12.0 | 8.9 |
| 5 | frog | C | 10.1 | 5.7 | 6.4 | 11.4 | 9.2 |
| 6 | crab | B | 10.5 | 3.6 | 6.3 | 11.4 | 8.1 |
| 7 | grasshopper | B | 10.3 | 4.3 | 5.9 | 10.5 | 7.7 |
| 8 | hedgehog | A | 12.5 | 4.2 | 7.2 | 12.9 | 9.4 |
| 9 | chameleon | A | 12.1 | 4.0 | 6.7 | 12.8 | 8.8 |
| 10 | penguin | S | 12.0 | 3.7 | 6.5 | 12.1 | 8.5 |
| 11 | beetle | S | 11.9 | 4.4 | 5.0 | 12.5 | 8.9 |
| 12 | turtle | SSS | 14.0 | 4.4 | 7.0 | 13.9 | 9.4 |

- Knife duels sit in the 3.6-5.9 s band at every rung (today an E ant's knife duel is 3.4 s).
- With today's WEAPON_CLASS the same table collapses at high tiers: the knife falls to 1.5 s from rung 10, a
  bat beetle duel ends in its first blow, and the bat is 1.8-3.4 s from rung 7. That is why section 5 exists.
- Bare and shield duels run about 35% longer than today on purpose. With today's kill times, the openers
  (leap, slide, charge) and the traits made matched fights 15-35% shorter than today's. With these, matched
  fights land on today's lengths (4.4).

### 4.4 Matched fights (against a bot that shadows the player's squads)

Measured in the prototype, 120 fights per size, mixed-rung armies (centre rung 2-11) with natural kits:

| Size | p10 | Median | p90 | Today's median | Decided by the clock |
|---|---|---|---|---|---|
| 1v1 | 8.6 s | 13.3 s | 20.3 s | - | 0% |
| 6v6 | 13.7 s | 18.8 s | 25.8 s | 17.6 s | 0% |
| 12v12 | 16.0 s | 20.8 s | 28.2 s | 20.5 s | 0% |
| 25v25 | 18.5 s | 25.4 s | 34.9 s | 26.0 s | 0% |

By stage (median / p90, 60 fights each):

| Stage (centre rung) | 6v6 | 12v12 | 20v20 |
|---|---|---|---|
| Low (2-4) | 17.3 / 23.8 | 19.5 / 27.4 | 21.0 / 31.2 |
| Mid (5-8) | 21.2 / 29.1 | 23.5 / 31.9 | 27.1 / 35.9 |
| High (9-12) | 19.8 / 26.4 | 22.1 / 31.4 | 22.9 / 36.1 |

Medians fall inside 18-28 s, except small low-stage fights (17.3 s, the same as today). The mid stage runs
longest because snails walk at 26 px/s; risk 7 has the lever.

### 4.5 Power honesty and fairness

- **Random mixed-rung armies** (centre +-2 rungs, 300 fights per band): the stronger side by 0-5% wins 52%
  (today 52%); by 10-20%, 66% (today 69%); by 25-35%, 86% (today 80%).
- **Mirror:** of 1,387 decided mirror fights, the bottom team won 48.5% (A measured 48.2% of 1,314). Today's
  simulator shows the same small lean (B measured 44 / 49 / 8 bottom / top / draw). The same seed always gives
  the same fight.
- **Across rungs at equal POWER**, one pet against two of the rung below measures 1.00 to 1.36 in strength:
  turtle 1.00, penguin 1.02, snail 1.03, frog 1.05, hedgehog 1.06, crab 1.10, chameleon 1.19, bee 1.20,
  mouse 1.28, grasshopper 1.31, beetle 1.36. The lone higher pet is slightly favoured, because only about 9
  small bodies fit around one foe. Single pairings can polarise to 0% or 100% (risk 5).

### 4.6 One high rung against a swarm

| Fight | Result |
|---|---|
| SSS turtle (SSS knife and gear) vs 40 ants (E knife, E gear) | Turtle wins every time in 17.1 s and keeps 100% health |
| SSS turtle with a bat vs the same 40 ants | 24.2 s |
| SSS turtle with no weapon vs the same 40 ants | 30.0 s, 99% health left |
| Bare turtle vs 40 bare ants | 22.6 s |
| Turtle (knife) vs 16 hedgehogs (knife), equal POWER | Turtle wins every time, 16 s |
| Turtle (knife) vs 2 beetles (knife), equal POWER | Turtle wins 90%, 14 s |
| Turtle (knife) vs 8 penguins (knife), 2x its POWER | Turtle loses every time, 15.5 s |

One turtle against 40 ants is a readable boss walk, neither an instant wipe nor an endless fight. It stomps
them in groups of up to 4 while they bounce off its shell. With single-target attacks the same fight ran to
the 50 s enrage. The ants cannot hurt it, which is what 2x per rung means after 11 rungs. It cannot happen on
a real grid anyway: 40 ants need 40 cells, and a 5x5 grid has 25.

### 4.7 Is the evolve always an upgrade?

- **Per cell, always:** 2x (4.1). By strength in a fight, slightly more (4.5).
- **For the squad, at the moment it happens, no:** the squad drops 75% of its POWER and 7 fighters, and frees 7
  cells. A's economy model (A's odds, which this spec adopts) found that:
  1. The grid is full by the time two x4 squads of one pet exist, and the bench holds a whole x4 in one slot.
     The 7 freed cells refill from the bench and from the 2-3 rolls a match gives, so evolving surplus squads
     that do not fit is pure gain.
  2. AUTO keeps its "never weaker than it found it" rule (6.5).
  3. Opponents are matched to your POWER, so a dip never costs wins; it only shrinks the next opponent.
  4. Over 300 matches a model player evolves about 32 times (roughly every 9 matches) and ends 10-20% stronger
     than one who never evolves, owning every rung. The first turtle comes at a median of match 237.
  5. This holds only if rolls rarely hand out the next rung. With gentler odds, never evolving matched evolving,
     so the steep odds in 6.2 are load-bearing.
- **The lobby sells it:** the evolve card shows "+7 free cells" and the new pet's POWER per cell (x2), not the
  squad's drop.

---

## 5. Weapons and gear

Weapons and gear keep E..SSS exactly as players see them today: the same letters, fusing (two of a class make
the next), roll odds (ROLL_CLASS_ODDS and TOP_ODDS) and descriptions. GEAR is unchanged. One number set changes:

```ts
/** What a weapon's class changes. Each class is worth x1.112 POWER, as today, split evenly between hitting
 *  harder and holding on longer, so duels at S and SSS last as long as at E. */
export const WEAPON_CLASS = { dmg: 1.10, cd: 0.97, hp: 1.09 };   // today { dmg: 1.2, cd: 0.97 }
// unitStats: hp = p.hp x w.hp x WEAPON_CLASS.hp^(wl) x (1 + helmet%)
```

- **Why:** pet classes used to add health (x1.58 per class) alongside the weapon's damage, so kill times held as
  both climbed. Pets no longer have classes, and the natural kit climbs with the rung, so with today's numbers
  an S/SSS knife duel ends in 1.5 s and a bat one-shots (4.3).
- **What stays the same:** POWER per class is sqrt(1.09 x 1.10 / 0.97) = 1.112, the same as today's
  sqrt(1.2 / 0.97). An item's place in the economy, and every bot table, is unchanged.
- **Rejected alternative (B):** hp x1.24 per class, keeping dmg x1.2. It makes each class worth x1.24 POWER,
  so an SSS weapon is worth 3.6x instead of 1.9x and items become a second ladder beside the pets.
- **If the player vetoes the change:** keep today's numbers and accept 1.5-2 s duels and 15-17 s fights at
  high rungs. Section 4 then needs a new run.
- `unitStats` no longer scales speed, radius or mass by anything but gear.

---

## 6. The systems

### 6.1 Rung, tier and level

- A pet's rung is `rungOf(type)`. `Piece.level` stays 1 for pets.
- Pet tiles show the rung (a 1..12 badge) instead of a letter. The frame and `classFx` use `tierOf(rung)`, so
  high rungs get the fancy frames.
- `PetLook.level` becomes `tierOf(rung)`, which keeps the current drawing code and the art job's hooks working.
  Final art is the art job's.
- The lobby stage sizes a pet by rung, not by sim radius: `r = (16 + (rung - 1)) x scale`. Otherwise the first
  evolve (an ant of radius 16 into a bee of radius 13) looks like a downgrade. This replaces lobby.ts's
  `(frog ? 21 : 18) x (1 + (level - 1) x 0.05)`.
- **Placeholder art** until the art job lands (src/draw/pets.ts only; never src/draw/styles/*): the ten new
  pets draw as a soft rounded body at their radius, in one placeholder tint each, with two eyes, team accents,
  gear and weapons, and their rung number. They obey every PetPose field (hop, squash, spin, puff, stone,
  limp), so deaths and traits can be tested. The ant and the frog keep their current drawings.

### 6.2 Rolls (src/logic/rolls.ts, src/data.ts)

**Kind first.** ROLL_TYPE_ODDS becomes ROLL_KIND_ODDS:

```ts
export const ROLL_KIND_ODDS = { pet: 40, knife: 8, bat: 8, shield: 8, spear: 8, helmet: 9, sneakers: 9, chili: 10 };  // sums to 100
```

Today pets get 34% of rolls across two kinds. They rise to 40% because they now carry the whole progression.
An item roll picks its class from ROLL_CLASS_ODDS[league], exactly as today.

**A pet roll picks a rung around the league's home rung.** The weight is 0.2^(rung - home) above home and
0.3^(home - rung) below it, normalised:

```ts
export const PET_HOME = [1, 2, 3, 4.5, 6, 7.5, 9];          // Sprout .. Legend
export const PET_ODDS_STEP = { up: 0.2, down: 0.3 };
export function petOdds(league: number): number[] { /* 12 weights, normalised to 100 */ }
```

% of pet rolls (a dash is under 0.005%):

| League | ant | bee | mouse | snail | frog | crab | grasshopper | hedgehog | chameleon | penguin | beetle | turtle |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sprout | **80** | 16 | 3.2 | 0.64 | 0.13 | 0.03 | 0.01 | - | - | - | - | - |
| Bronze | 19 | **65** | 13 | 2.6 | 0.52 | 0.10 | 0.02 | - | - | - | - | - |
| Silver | 5.5 | 18 | **61** | 12 | 2.4 | 0.49 | 0.10 | 0.02 | - | - | - | - |
| Gold | 1.1 | 3.7 | 12 | **41** | **33** | 6.7 | 1.3 | 0.27 | 0.05 | 0.01 | - | - |
| Platinum | 0.14 | 0.48 | 1.6 | 5.4 | 18 | **60** | 12 | 2.4 | 0.48 | 0.10 | 0.02 | - |
| Diamond | 0.03 | 0.10 | 0.33 | 1.1 | 3.7 | 12 | **41** | **33** | 6.7 | 1.3 | 0.27 | 0.05 |
| Legend | - | 0.01 | 0.04 | 0.14 | 0.48 | 1.6 | 5.4 | 18 | **60** | 12 | 2.4 | 0.48 |

Each league has a signature pet, and low rungs fade as you climb. The 0.2 step must stay steep: a step much
above 1/8 makes rolling the next rung cheaper than evolving into it. Tune it only together with an economy
model (risk 2).

**Pity** stays one shared counter, `PITY = 30`.
- A pity roll picks its kind by ROLL_KIND_ODDS as usual.
- A pity item is A, S or SSS by TOP_ODDS, as today.
- A pity pet is rung ceil(home)+2, +3 or +4 at 88 / 10.5 / 1.5%, capped at 12. By league: Sprout mouse /
  snail / frog; Bronze snail / frog / crab; Silver frog / crab / grasshopper; Gold grasshopper / hedgehog /
  chameleon; Platinum hedgehog / chameleon / penguin; Diamond penguin / beetle / turtle; Legend beetle 88% /
  turtle 12%.
- The counter resets on an item of class A or better, or on a pet of rung ceil(home)+2 or higher, however it
  was rolled.

**Ant season:** while `state.evolves === 0 && state.matches < 12`, a normal pet roll is always an ant. Pity
rolls are not affected. This brings the first evolve around match 6.

**rollOnce order:** scripted rolls, then the gift queue, then pity, then the odds. A gift does not spend a roll
or change pity or `rolled`. Rolls stay seeded (makeRng(hashSeed(seed, rolled)), as the roll screen does today).

**The roll screen:** the reel shows pets with their rung badge. The reveal sound's n is `tierOf(rung)` for a
pet. The ODDS panel lists the league's pet rungs at 0.1% or more beside the item class odds.

### 6.3 Scripted rolls, starter kit, guide and tips

- `STARTER_KIT` is unchanged: ant, E knife, E helmet on the bench.
- `SCRIPTED_ROLLS` become ant, chili (E), ant. Today they are ant, frog, chili; a frog is now rung 5. Guide steps
  0-5 are unchanged, and step 5 ("fuse your ants into x2") still works off the first roll.
- **Non-blocking tips** come after the guide, in a new `SaveState.tips` bitmask, each shown once:
  - bit 0, "Two full squads? Drop one on the other to EVOLVE": the first time two x4 squads of one pet exist,
    with an arrow from one to the other;
  - bit 1, "Bench full: fuse, evolve or trash a piece": the first time a roll is refused;
  - bit 2, "Turtles are the top of the ladder": the first time two x4 turtles meet.
- The first evolve usually comes around match 6, thanks to ant season. The next fight shows the new bee off
  against a mirrored bot (BOT.mirrorUpTo).

### 6.4 The evolve fuse (src/logic/inventory.ts)

```ts
canFuse(a: Piece, b: Piece): 'stack' | 'class' | 'evolve' | null
```

- **Pets:** the same type and the same count. A count under 4 gives `'stack'` (x1 -> x2 -> x4, unchanged). A
  count of 4 gives `'evolve'` if the rung is under 12. Two x4 turtles give `null`.
- **Weapons and gear:** `'class'`, as today.
- `PlaceResult.fuse` gains `'evolve'`. When the dragged piece and the piece under it are both x4 turtles,
  `place()` and `preview()` return `{ kind: 'denied', reason: 'Turtles are the top of the ladder' }`, on the
  grid and on the bench, instead of swapping two identical pieces.
- **`grow(p, 'evolve')`** sets `type = petAt(rungOf(type) + 1)`, `count = 1` and `level = 1`, and deletes
  `turned`. When applied, it also adds 1 to `state.evolves` and sets the new rung's bit in `state.seen`.
- **Where the new pet lands:**
  - On the grid, the new 1x1 goes on the drop cell (the dragged piece's target top-left cell) when that cell
    is inside the mate's old 2x2; otherwise it goes on the mate's top-left cell. The other 7 cells are free.
  - On the bench, it keeps the mate's slot.
  - A bench x4 dropped on a grid x4, or the other way round, follows the mate's place.
- **The drag preview card** says "EVOLVE: Bee", with "+7 free cells". It shows a "?" silhouette if that rung
  has never been owned (the `seen` bit).
- **The evolve moment** (the lobby, view only; the state changes at once): the two squads jump together and
  swirl into a glowing cocoon, which wobbles three times, cracks, and the new pet pops out with confetti in its
  colours, a name banner and its one-line trait (PIECE_DESC). It lasts about 1.6 s, and a tap skips it.
- **NEW PET card:** the first time any rung is owned (by evolve, roll or gift), a card shows a 12-slot ladder
  bar. The slot fills, and the next one teases a "?" silhouette.
- **New sounds:** `'evolve'` (n = the new rung) and `'discover'` (n = rung). `'stack'` is unchanged.

### 6.5 AUTO (src/logic/auto.ts)

1. Stack every pair that can stack, to a fixed point (as today).
2. Try evolves one pair at a time, lowest rung first, then lowest ids. Re-stack and pack after each one, and
   keep the evolve only if the packed POWER did not drop compared with the layout before it.
3. The result is kept only if POWER >= what AUTO found. If not, try stacks only, then no fusing at all (the
   existing fallback order). AUTO still never loses a piece.

This keeps the surplus evolves (squads stuck on the bench) and skips the ones that would hollow out a full
grid.

### 6.6 Trophy road (src/data.ts, src/logic/progress.ts)

40 steps of 50 trophies, as today.

| Trophies | Reward |
|---|---|
| Every 50 that is not listed below | 2 rolls |
| 100 (Bronze) | 3 rolls + a mouse |
| 250 (Silver) | 3 rolls + a snail |
| 450 (Gold) | 3 rolls + a crab |
| 700 (Platinum) | 3 rolls + a grasshopper |
| 1000 (Diamond) | 3 rolls + a chameleon |
| 1400 (Legend) | 3 rolls + a penguin |
| 1700 | 2 rolls + a beetle |
| 2000 | 2 rolls + a turtle: it waits at the end of the road |

- Each league's welcome pet is one rung above its home rung: a pet the player has probably never seen.
- `RoadReward` becomes `{ at; rolls; pet?: PetType }`, and `minLevel` (never honoured) is removed.
- `claimRoad` pushes each `pet` onto a new `SaveState.gifts` queue and returns it in its result, so the lobby
  can show it.
- The roll screen opens gifts first. A gift lands like a roll (the reel stops on the pet, then NEW PET if it
  is new), and the bench rule applies: with a full bench the gift waits.

### 6.7 Kick-off line order (src/sim/battle.ts lineUp)

`PETS[pet].row` and one order list replace KIND_ORDER:

```ts
const LINE_ORDER: readonly PetType[] = [
  'turtle', 'beetle', 'penguin', 'hedgehog', 'frog', 'snail',   // front band, front to back
  'crab', 'mouse', 'ant',                                         // middle band
  'chameleon', 'grasshopper', 'bee',                              // back band
];
```

- Kinds keep contiguous rows in this order. Inside a kind: shields first, spears last, then squad, then id (as
  today).
- **Waits by band:** the first band that has fighters sets off at the whistle, the next 2.5 s later, the next
  at 5 s (`FIGHT.wave = 2.5`, seconds between bands). Empty bands are skipped, so a front-and-back army sets off
  at 0 and 2.5 s. A band still leaves early when a foe comes close, as today. Grasshoppers and penguins ignore
  the wait.
- **Rows:** each kind gets its own rows, as today. Only when the rows would be deeper than the half-pitch do the
  kinds of one band share rows (packed in LINE_ORDER), before the existing squeeze applies. B measured 0%
  overlap with this rule.

### 6.8 Bots (src/logic/bots.ts)

- **Options:** for each pet, every kit: no weapon, or each weapon at tier t-1, t, t+1 where `t = tierOf(rung)`;
  and each gear at none, t-1, t or t+1. The pet-level loop is gone. Weights as today (a weapon 1, none 0.2;
  x0.6 per gear).
- **Shadowing:** the bot shapes its army squad by squad from the player's grid squads. For a squad of rung k and
  count c it picks one of:

  | Shape | Weight | When |
  |---|---|---|
  | The same pet and count | 3 | Always |
  | Rung k+1 at half the count | 1 | c >= 2 and k < 12 |
  | Rung k-1 at double the count | 1 | c <= 2 and k > 1 |

  All three shapes have equal bare POWER under the 2x rule. Kit classes are the player squad's own +-1 for
  each item it has. A squad with none falls back to the natural tier t +-1.
- The existing tuning passes then land the army on the target within `BOT.tolerance`. `pickSquad`'s ant/frog
  swap becomes: when the wanted per-fighter POWER is outside a pet's kit range, step to the neighbouring rung.
- **Limits:** the total fighter count stays within `BOT.countSpread` of the player's (shapes are redrawn, up to
  24 tries, as today), with at most 25 fighters (`BOT.maxFighters`) and 10 squads (`BOT.maxSquads`). Against
  `BOT.mirrorUpTo` (3) or fewer fighters the bot fields the same pets, and in a one-on-one the same weapon, as
  today.
- **Why shadowing:** it keeps the rung gaps inside a fight small, which keeps fights readable and POWER honest.
  B found that count matching alone drifts the player's win rate from 32% (all-ant armies) to 81%
  (turtle-heavy ones).
- **Difficulty:** shadow bots at factor 1.0 measured player wins of 43-52%. B measured today's game at 57-63%
  at factor 1.0. To keep today's feel, start at `BOT.easy 0.88`, `BOT.hard 1.03` (`firstMatches`, `mercy` and
  `heat` unchanged). tools/balance.ts sets the final pair so that the player wins as often as today at every
  stage.

### 6.9 The simulator (src/sim/battle.ts, src/sim/types.ts)

**Rules that keep it fair and deterministic:**

- Game randomness only comes from the existing per-unit `makeRng` and from `hashSeed`. Nothing uses Math.random.
  Cosmetics use frand, fpick and fchance.
- Every new effect is collected and applied in `applyHits` from the step's snapshot, in this order: main hits
  (dodge, then cuts, then damage), then spike reflections, then poison ticks, then the snail hide check, then
  deaths.
- Grasshopper targets are chosen in a kick-off pass in id order. The mouse dodge hashes (seed, tickN, attacker,
  victim, k). The ant pack count uses step-start positions. The beetle's run counts its own walking, not
  shoves.

**SimUnit:**
- gains `rung`;
- gains `poison` (hp its pools still hold, for the view);
- gains `charged` (beetle);
- `hop` also draws the grasshopper's leap arc.

**UnitPhase** adds `'air'` (grasshopper leap), `'shell'` (snail hide) and `'slide'` (penguin).

**Brain** adds:
- `poison: { rate; left; by }[]`
- `shellUsed`
- `run` and `charged` (beetle)
- `slideT` and `slideCd` (penguin)
- `leapDone` and the leap end points
- `pack` (ant)

**SimEvent** gains:
- `dodge` `{ unit, from, x, y }`
- `shell` `{ unit, on }`
- `leap` `{ unit, x0, y0, x1, y1, dur }`
- `slide` `{ unit, on }`
- `slam` `{ unit, to, x, y }`
- `charge` `{ unit }`
- `stomp` `{ unit, x, y, n }`
- `poison` `{ unit, by, dmg }`, at most once per 0.5 s per victim
- `land` gains `big` (grasshopper)
- `hit` gains `pack` (0..3), `pinch` (0, 1 or 2), `spike`, `pull`, `armour`, `charge`, `slam`, `landing`
- `death` gains `cause: 'hit' | 'poison' | 'spike'`

**chooseDeath (cosmetic):**
- a poison death is `petals` 60% of the time;
- a spike death is `pop` 60% of the time;
- a beetle charge or penguin slam death is `launch` 80% of the time (`spin` if the victim's mass is 4 or more);
- otherwise as today.

**Simultaneous wipes:** spikes and poison make mutual knock-outs common in small mirrors (36% of 4-fighter
mirrors in the prototype). When both teams lose their last fighter in the same step, the team with the larger
health share at the start of that step wins; an exact tie stays a draw. In `applyMatch` a draw changes no
trophies and gives no win bonus. Today a draw counts as a defeat.

**Speed:** the traits add one `near()` query per ant per step and a few per-step loops. Keep today's
performance test cap.

### 6.10 Save (src/logic/save.ts)

- `SAVE_VERSION = 3`. A v2 (or any other) save starts fresh, as v1 did. The lobby shows one toast when it
  replaced an old save: "New pets have arrived! Your zoo starts fresh." This is fine before launch. If real
  players exist by then, map old pets by POWER instead (A: rung = 1 + round(0.552 x (level - 1) + (frog ?
  0.64 : 0))).
- New fields:
  - `gifts: PetType[]`: trophy-road pets waiting;
  - `seen: number`: a bitmask of rungs ever owned (bit rung-1);
  - `tips: number`: a bitmask of tips shown;
  - `evolves: number`.
- `repair()`:
  - accepts the 12 pet types and forces a pet's level to 1;
  - drops invalid gifts;
  - adds every owned pet's rung to `seen`;
  - clamps `tips` and `evolves` to whole numbers of 0 or more.
- `newSave()` sets `seen` to the ant's bit.

### 6.11 Sounds (src/audio)

`SoundName` gains:
- `'evolve'` (n = new rung) and `'discover'` (n = rung);
- `'sting'`, `'poison'`, `'dodge'`, `'shellIn'`, `'shellOut'`, `'pinch'`, `'leap'`, `'leapLand'`, `'spikes'`,
  `'tongue'`, `'pull'`, `'slide'`, `'slam'`, `'charge'`, `'chargeHit'`, `'armour'` and `'stomp'`.

`'bite'` takes n = rung, so each pet has its own bite voice (section 3). All synthesized. Sounds heard
often (bite, pinch, armour, poison, footsteps) stay under 120 ms and are throttled as listed per pet.

### 6.12 Files this touches

| Area | Files |
|---|---|
| Data, types | src/types.ts, src/data.ts |
| Logic | src/logic/inventory.ts, auto.ts, rolls.ts, progress.ts, bots.ts, save.ts |
| Simulator | src/sim/battle.ts, src/sim/types.ts |
| View | src/screens/lobby.ts (badges, sizes, evolve card and moment, tips), roll.ts (pets, gifts, odds panel), battle.ts (trait effects, frog-only branches generalised), match.ts (grouping by pet); src/draw/deaths.ts (12 OWN lists, death cause), src/draw/pets.ts (placeholders), src/draw/fx.ts |
| Audio | src/audio/names.ts, src/audio/sounds.ts |
| Tests | tests/logic/logic.test.ts, tests/sim/battle.test.ts |
| Tools | tools/balance.ts |
| Dev pages | dev/pets, dev/battle, dev/arena (pickers for all 12 pets) |
| Not touched | src/draw/styles/*, dev/styles.ts, dev/styles.html, git |

### 6.13 Tests and balance checks

**Tests to update:**
- logic: the line-up order, PET_CLASS radius growth, class odds, the version-2 save tests, the bot one-on-one
  mirror rules.
- sim: the frog-specific cases.

**New tests:**
- 2x per rung (4.1);
- canFuse stack, evolve and turtle-top cases, and where the evolved pet lands;
- AUTO never weaker;
- rollOnce order with gifts and ant season;
- pity reset on pets;
- road gifts;
- save v3 reset and repair;
- a determinism replay with every trait in play;
- the dodge hash not depending on hit-list order (shuffle the think order, same result).

**tools/balance.ts gains these checks (bounds):**
1. Power-factor fit against neighbours (4.2): every pet within +-8% of the ant's strength.
2. One pet vs two of the rung below, at equal POWER: report it.
3. Turtle vs 40 ants: the turtle wins and the fight lasts 15-35 s.
4. Honesty by rung spread: the stronger side wins at least 50 / 60 / 75% in the three bands.
5. The natural-kit kill-time table: knife duels 3-6 s at every rung.
6. Fight length by stage: medians 17-28 s, none decided by the clock.
7. Mirror: the bottom team's share of decided fights 46-54%, with identical replays.
8. Bot player win rate by stage, against today's.

**The fuse check changes:** "power never drops on fuse/add" becomes "stacking keeps POWER exactly; evolving
doubles POWER per cell exactly".

### 6.14 Order of work

1. Data, types, inventory (evolve), AUTO, rolls, road gifts, save v3, bots, line-up order, placeholders and the
   lobby and roll screens. The simulator runs the new stats with traits off, on a branch only, because the
   power factors assume the traits.
2. The traits in the simulator, their events, effects and sounds, gated by the balance checks in 6.13. Then
   re-run the fit and the difficulty tune, and land.

---

## 7. Risks

1. **The evolve shrinks the army.** It removes 7 fighters and 75% of that squad's POWER. The guided first evolve
   takes the army from about 9 fighters to about 2. Mitigations: AUTO's per-pair rule, the evolve moment, the
   "+7 free cells" card, ant season refilling the grid, and a smaller army meeting a smaller bot. Watch POWER
   right after an evolve in playtests.
2. **Roll odds are load-bearing.** If rolls give the next rung much more often than 1 in 8 of the rung below,
   evolving stops mattering. Tune the 0.2 step and PET_HOME only with an economy model. A slower climb (home
   rungs 1..6.5) pushed the first turtle past match 300 for 99% of model players.
3. **Weapon class change needs the player's OK.** The player said weapons keep E..SSS "exactly as today". The
   letters, fusing, odds and POWER per class are unchanged; only the damage/health split behind a class
   changes. Without it, S and SSS duels last 1.5 s (section 5).
4. **Big internal numbers:** a 97k-hp turtle, 161k POWER per kitted turtle, about 2M for a full Legend grid.
   POWER is formatted with k and M, and raw hp never appears.
5. **Polarised pairings.** The simulator has little randomness, so single pairings at equal POWER can go 0% or
   100% (one frog loses every time to two snails; x1 vs x4 two rungs down ranged from 0% to 100% by pet). Mixed
   armies average out (honesty 52 / 66 / 86%). If the balance tool shows win rates drifting with rung spread,
   weight per-fighter strength slightly more in squadPower. Do not touch `POWER.countExp`, which would make
   stacking lower POWER.
6. **Turtle vs 40 ants is a boss walk.** It lasts 17-30 s and the turtle keeps about 100% health. The only lever
   that would let the ants matter is a smaller step per rung, which conflicts with 2x per cell.
7. **The mid stage runs long.** Rungs 5-8 give medians of 21-27 s and p90 up to 36 s, mostly because snails walk
   at 26 px/s and spend about 10 s reaching the middle. The lever is the snail's speed (30 made no measurable
   difference) or a shorter kill-time scale for rungs 4-8 only. A per-pet kill-time trim shifted fitted
   strengths by up to 25%, so any trim must be followed by a refit.
8. **Calibration drifts** with fight length and after any stat or trait change. The balance tool owns the fit.
9. **Fairness details:** the dodge hash, the kick-off leap pass, the spike and poison order and the hide check
   are specified to be order-free. The prototype had two order leaks (the dodge used the hit-list position;
   leap picks happened during think) and one rule bug (dodged stings still poisoned). Test all three.
10. **Readability.** Four pets are domed (snail, hedgehog, beetle, turtle) and must read apart by spiral, spikes,
    horn and hex plates. The bee and mouse are smaller than the ant, which is why the lobby sizes pets by rung.
11. **Line-up crowding.** With up to 12 kinds, rows can overflow the half-pitch, so kinds share rows inside a band
    and the squeeze triggers more often.
12. **Bot difficulty.** The 0.88 / 1.03 start is an estimate from two different measurements (shadow bots at
    1.0, and B's figure for today's game). Measure today's curve with tools/balance.ts before the change.

---

## Appendix: evidence

- **Design A's prototype** (a copy of the simulator with all twelve pets and traits, run against the real
  weapons, gear and rng): `/tmp/claude-0/-home-user-zoopvp/ef6dad0a-b234-5ed3-bc57-4548e8186318/scratchpad/proto`.
  Its economy model: `/tmp/claude-0/-home-user-zoopvp/ef6dad0a-b234-5ed3-bc57-4548e8186318/scratchpad/econ`.
- **Design B's prototype:**
  `/tmp/claude-0/-home-user-zoopvp/ef6dad0a-b234-5ed3-bc57-4548e8186318/scratchpad/ladder-design-x7k`.
- **The lead's verification runs:** A's prototype plus switches for the weapon-class variants (`WC=today | b |
  split | mid`; this spec is `mid`) and the snail variants. It lives in
  `/tmp/claude-0/-home-user-zoopvp/ef6dad0a-b234-5ed3-bc57-4548e8186318/scratchpad/lead`: kt.ts gives the
  kill-time table and the fights by stage, match.ts the fights by size, honest.ts the honesty bands, mirror.ts
  the mirror check, `run.ts stress` the swarm table, and calib3.ts the power-factor fit. Run them from the repo
  root with `node_modules/.bin/tsx`. These are scratch folders and may be cleared; this file holds the numbers
  that matter.
