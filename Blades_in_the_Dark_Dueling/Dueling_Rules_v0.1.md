# Dueling Subsystem for Blades in the Dark

Working draft v0.1. Numbers marked (T) are untested starting values.

## 1. Scope

This subsystem handles a one-on-one fight between two duelists where weapon position matters. Use it for especially dangerous opponents, not for ordinary fights.

Everything not changed here works as written in Blades in the Dark: action rolls, Position and Effect, Push Yourself, Stress, Harm, Resistance, Armor and clocks. NPCs never roll.

Two ideas drive the subsystem:

- Effect is measured in zones. A better roll carries a weapon farther across the board.
- A weapon guards the zone it holds. Holding a zone costs the other side something.

## 2. The Board

Each duelist has three zones: **Body**, **Left Guard** and **Right Guard**. Left and Right are from each duelist's own point of view. Seen from above with the duelists facing each other, the two upper Guard zones connect and the two lower Guard zones connect.

| Zone | Adjacent to |
|---|---|
| Body | own Left Guard, own Right Guard |
| Left Guard | own Body, own Right Guard, the opponent's Right Guard |
| Right Guard | own Body, own Left Guard, the opponent's Left Guard |

A Body zone can only be entered from that duelist's own Guard zones. Reaching an enemy Body from your own Guard takes two moves: across to the enemy Guard in your lane, then into the Body. A lane is a pair of connected Guard zones.

## 3. Assets

- **Weapons.** Hand-held, up to two per duelist. Each starts in one of its owner's Guard zones (owner's choice). Weapons are the only assets that move.
- **Body assets.** A shield, a heavy coat, anything worn as a defense. They sit in the Body zone and do not move. Armor boxes are not Body assets and work as written.
- **Traits.** Temporary, intangible assets such as Off-Balance or Reading Their Rhythm. Mark them on the map. A trait gives +1 Effect or one step of Position on one later roll where it applies (your choice), then it is spent.
- **Unarmed.** A duelist with no weapon has an Unarmed asset. Treat it as inferior quality (one level less Effect).

A weapon is a **defender** while it sits in a zone where an attack lands, and a **guard** while it sits in a Guard zone an enemy wants to enter.

## 4. Setting Up a Duel

1. **Choose the stakes.**

   | Stakes | Defeat Clock | Duel ends when | Harm cap on the PC |
   |---|---|---|---|
   | First blood | 2 (T) | either duelist is harmed, or the Clock fills | Level 2 |
   | To defeat (wound or yield) | by Tier, below | the Clock fills, or the PC takes Level 3 harm | Level 3 |
   | To the death | by Tier, below | the Clock fills, or the PC takes Level 4 harm | Level 4 |

   Defeat Clock by Tier (T): Tier 0 to II is 4 segments, Tier III is 6, Tier IV and V is 8.

2. **Fill in the Duelist Card** (section 11) for the opponent. The GM keeps it.
3. **Place weapons.** The GM places the opponent's visible assets. The PC then places theirs, seeing those assets but not the hidden abilities.
4. **Start with the PC's first action.** If the Card says the duelist is Skilled or Master, apply section 10 first.

## 5. Actions in a Duel

Every action is an ordinary action roll. The GM sets Position and Effect from the fiction. These are the common duel actions:

| Action | Typical rating | What it does |
|---|---|---|
| Move | Finesse, Skirmish or Wreck | Move one of your weapons (section 6) |
| Strike | Finesse, Skirmish or Wreck | Attack from a weapon in the enemy Body zone (section 7) |
| Disrupt | Skirmish or Wreck | Needs a weapon in the same zone as an enemy weapon. Limited Effect displaces it one zone. Standard or better knocks it from the owner's hand. |
| Setup | any that fits | Create a trait. Limited Effect or better succeeds. |
| Study | Insight | Read the duelist. On a 6 the GM reveals one hidden ability from the Card. On a 4/5 it reveals one, but the consequence is a non-pressing one. |
| Recover | Prowess | Retrieve a dropped weapon, or return a weapon to a Guard zone. |

One roll moves or acts with one weapon.

## 6. Moving Weapons

### Zone budget

Effect is a budget of zones for the roll.

| Effect | Zones |
|---|---|
| Zero | 0 |
| Limited | 1 |
| Standard | 2 |
| Great | 3 |

Tier, quality, scale and potency adjust Effect as usual. Pushing Yourself for +1 Effect adds a zone.

Each zone entered costs 1. A **guarded zone** costs 2 to enter. A guarded zone is a Guard zone that holds an enemy weapon (add 1 per extra enemy weapon in it). Body zones never cost extra to enter. Defenders in a Body zone reduce Strikes instead (section 7).

Tolls apply only to your own weapon's movement. Moving an enemy weapon costs 1 per zone wherever it goes. Unspent budget is lost. Resolve any displacement before your own movement, and check tolls at the moment each step is taken.

### Movement styles

Declare **normal**, **bold** or **subtle** before rolling. Normal movement has no trades.

| Style | Typical rating | Trade | What you get |
|---|---|---|---|
| Normal | any | none | Spend the whole budget on your own weapon. |
| Bold | Skirmish or Wreck | Spend units of the budget to move an enemy weapon instead of your own. One unit moves one enemy weapon one zone. | The consequence cannot return that weapon to the zone you moved it from. |
| Subtle | Finesse | Reduce the budget by 1. | The GM cannot impose a **pressing consequence** (section 8) on a full or partial success. On a 1 to 3 it does not protect you. |

A bold move can target an enemy weapon in a zone your weapon occupies or that is adjacent to it. The player chooses its new zone, which must be adjacent. Your budget may reach 0 own-zone movement if you spend it all on displacement.

### No negation

A consequence may cost you something, but it cannot undo what the roll accomplished. After a successful move, the GM cannot return your weapon to the zone it left. After a bold move, the GM cannot put the displaced weapon back.

## 7. Striking

A Strike needs one of your weapons in the enemy Body zone.

| Effect | Ticks on the Defeat Clock |
|---|---|
| Limited | 1 |
| Standard | 2 |
| Great | 3 |

Reduce the Effect one level for each defender in the enemy Body zone (Body assets and any weapon the enemy holds there), to a minimum of Zero. A Strike that reaches Zero Effect needs a different approach first (Disrupt, Bold move, Setup, or Pushing Yourself).

Your weapon stays in the enemy Body zone after a Strike unless a consequence moves it. Repeat Strikes then cost one roll each.

When the Defeat Clock fills, the opponent is defeated as the stakes describe.

## 8. Consequences

On a 4/5 the GM chooses one consequence. On a 1 to 3 the GM chooses a harder one or combines two. A reaction attack on a 1 to 3 does not need an enemy weapon already in your Body zone. A weapon in one of your Guard zones can move in and strike as one consequence.

| Consequence | Pressing? | Notes |
|---|---|---|
| Counter-move. One enemy weapon moves one zone. | Yes | Blocks, covers or closes in. Cannot undo this roll's result. |
| Bind. An enemy weapon sharing a zone with yours binds it. | Yes | Your weapon gets a Bound trait and cannot move until freed by Disrupt or a bold move. |
| Reaction attack. An enemy weapon in your Body zone strikes. | Yes | Harm is set by Position, quality and Tier as usual, capped by the stakes. Guarding applies (section 9). |
| Disarm. A weapon leaves your hand. | Yes | Usually a 1 to 3 result. |
| Worse Position or reduced Effect on your next roll. | No | |
| You lose a trait, or the enemy gains a trait on you. | No | For example Off-Balance. |
| Pressure Clock ticks. | No | Optional clock for outside danger, such as guards arriving. |

A **pressing consequence** is any consequence that would stop you from pressing the attack. Subtle movement bars these on a success.

## 9. Guarding

You can always resist a consequence, and Armor works as written. Guarding is a separate choice made by position.

A weapon you hold in your own Body zone is a **guard**. When a Strike consequence or reaction attack would harm you, you may choose one:

- **Parry.** The harm is negated. Your guard is forced to a Guard zone adjacent to your Body, chosen by the GM. The attacker stays in your Body zone and your Body is now open.
- **Brace.** The harm drops one level. Your guard gains a Bound trait.

This is the one place the draft adds harm reduction beyond Armor. It costs position, not Stress.

## 10. Skilled and Master Duelists

Some duelists act before the PC rolls. This uses the core rules for Skilled and Master NPCs and Resistance as written.

| Initiative | Before the PC's roll |
|---|---|
| Standard | Nothing. |
| Skilled | The GM telegraphs one enemy weapon move of up to 1 zone. The PC can accept it, change their action, or Resist it. |
| Master | The GM states one enemy move of up to 2 zones as already done. If an enemy weapon is in your Body zone, it may Strike. The PC can Resist it. |

Trigger (T): before the PC's first roll, and again after any 1 to 3 result.

## 11. Duelist Card

The GM's card for a dangerous opponent. NPCs have no stats, so the card holds only what the subsystem needs. The players see the visible assets and starting zones, nothing else.

| Field | Contents |
|---|---|
| Name, Tier, Quality | As usual |
| Defeat Clock | 4, 6 or 8 segments, or 2 for first blood |
| Initiative | Standard, Skilled or Master |
| Assets | Weapons with starting zones, Body assets |
| Opening | The starting problem the PC must solve before they can strike |
| Hidden abilities | Each tagged with a trigger: when the PC moves, when the PC strikes, on a consequence, or when displaced |
| Tells | What a Study roll reveals |

Example openings:

- **Both lanes covered.** One weapon in each Guard zone, so every approach is guarded.
- **Iron body.** A Body asset. Strikes drop a level.
- **Counter-puncher.** A weapon in the Body zone, so partial successes can trigger reaction attacks.
- **Anchored guard.** Displacing the guard weapon costs 2 units instead of 1.

## 12. Worked Example

Vessa (left of the map) fights Marn (right). Marn is Tier II with a Defeat Clock of 4 (T), Standard initiative. Stakes: to defeat. His sword is in his Left Guard (lower lane). His dagger is in his Right Guard (upper lane). Vessa's blade is in her Left Guard (upper lane), facing the dagger.

1. **Bold move, Skirmish, Risky, Standard Effect (2 units).** Vessa spends 1 unit to push Marn's dagger from his Right Guard to his Left Guard, where his sword is. The upper lane is now empty. She spends 1 unit to move her blade into Marn's Right Guard. She rolls a 5. She gets both, and the GM cannot put the dagger back. The GM chooses a pressing consequence: Marn's sword moves from his Left Guard into his Body zone, so Strikes into his Body will drop a level.
2. **Subtle move, Finesse, Risky, Standard Effect.** The budget drops from 2 to 1. Her blade moves from Marn's Right Guard into his Body zone (Body zones cost no extra). She rolls a 4. She succeeds. Subtle bars pressing consequences, so the GM chooses a non-pressing one: her next roll is Desperate.
3. **Strike, Skirmish, Desperate, Standard Effect.** Marn's sword is a defender in his Body zone, so the Effect drops to Limited. She rolls a 6 and ticks his clock once. Her blade stays in his Body zone.

## 13. Translation Notes (Dune to Blades)

| Dune: Adventures in the Imperium | This draft |
|---|---|
| Defender rolls, sets Difficulty | One action roll resolves both sides. Position and the consequence carry the defender's response. |
| +1 Difficulty per defensive asset | One level less Effect per defender in the Body zone. A toll on guarded Guard zones. |
| Keep the Initiative | Subtle movement bars pressing consequences. |
| Bold movement moves an enemy asset | Same, paid from the Effect budget. |
| Extended task track | Defeat Clock |
| Resist Defeat | Resistance, as written |
| Gaining information, creating traits | Study and Setup |
| Disarming | Disrupt |

## 14. Open Questions for Playtest

- Does Tier reduce zone budget too harshly? Limited Effect is one zone, so a Tier disadvantage may stop movement entirely. Consider exempting movement from Tier adjustment.
- Should the Brace option stay, or is Parry alone enough?
- Is a toll of 2 for guarded zones the right size?
- How often should Skilled and Master duelists act first?
- Defeat Clock sizes and the first blood clock of 2.
- How many rolls does a typical duel take, and what does it cost in Stress?
