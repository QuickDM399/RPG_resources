# Crew Script: `6d. Cohorts` (proposal for v0.12.0)

**Status: decisions 2 to 7 approved, decision 1 changed, two questions open (section 0). No code has been touched.**

## 0. Answers, the revised armor design, and the batch question

| Decision | Answer | In the plan |
|---|---|---|
| 1. Armor | The script should work out whether a cohort has armor, from the sheet and from the characters in the crew, including by exception (Leader). It may tick armor as used only if the cohort has armor. Otherwise it leaves the box ticked, permanently, to mean no armor available | Rewritten in section 0a |
| 2. Harm stacking | Yes | Harm at a marked level moves up; past Broken is Dead |
| 3. Dead | Yes | Mark all three boxes, post the Destroyed card, replacement cost |
| 4. Roll buttons | Roll with -3 to +3 bonus dice | Seven buttons: -3d, -2d, -1d, Roll, +1d, +2d, +3d |
| 5. Heal every cohort | Yes | A button on the cohort list, not automatic, not on Heat and Hold |
| 6. Vehicle edges and flaws | Yes | Core wording, and the Deep Cuts v1.2b Nimble wording beside it with the Action module on |
| 7. Look | Yes | Styled HTML card when `fmt card html` is on |

### 0a. Armor: what the script can know

The books and the sheet give cohorts armor in three ways only (searched in the core book, Deep Cuts Part Two, the v1.2b crew sheets and the sheet's own texts):

| Source | Text | Kind |
|---|---|---|
| **Vehicle upgrade** (Smugglers' lair upgrade, two boxes) | "When the vehicle is upgraded (two boxes), it also gets armor." (core) | **Permanent**, for a vehicle cohort |
| **Leader** (a player ability) | "When you Command a cohort in combat, they continue to fight when they would otherwise break (they're not taken out when they suffer level 3 harm). They gain +1 effect and 1 armor." (core; Deep Cuts crew sheets) | **By exception**: only the cohort that PC Commands, only in combat |
| **Reavers** (Smugglers' crew ability) | "When you go into conflict aboard a vehicle, you add +1 Quality to the vehicle's damage and speed. The vehicle also gains +1 armor to represent skillful maneuvering." (Deep Cuts) | **By exception**: a vehicle, only in conflict aboard it |

How it would work:

- **The box means "no armor available right now".** Ticked = none or already used; clear = armor available. A cohort with no permanent armor has its box **ticked by the script and left ticked**. The script ticks it (writes `armor` = 1) when you open `6d. Cohorts`, when you open a cohort's card, on `~ Rebuild`, and with `!bitdcrew cohortsync`. It does not watch your hand edits.
- **Permanent armor** (a vehicle cohort when a Vehicle upgrade has both boxes marked): the script clears the box once when it first sees the armor, then only you and the script's "Use armor" tick it. "Restore armor" clears it again.
- **By exception:** the card names the source it found ("Leader: Cutter is in the party", "Reavers is ticked and this is a vehicle") and offers a button, "Grant 1 armor for this fight". It clears the box. "Use armor" then ticks it. "Restore armor" puts the box back to ticked for a cohort with no permanent armor. Leader also lets a Broken cohort keep fighting, so a Broken cohort led by a Leader gets a "Roll anyway" button and a line saying so.
- **"Use armor" exists only when the box is clear.** On a cohort with no armor the harm card has no armor row at all.
- **How a vehicle cohort is recognised** (inference): the name or the type text contains vehicle, boat, carriage, barge, skiff, cart or wagon, or it is the Smugglers' sheet cohort the sheet fills in as "vehicle". Which of the two Vehicle upgrade rows belongs to which cohort is not recorded anywhere, so either row with both boxes marked counts.
- **Party PCs are read** the way the Engagement roll already reads them: the characters marked as Party members, a ticked row named Leader in their abilities.

### 0b. The "not included" list: include now or later?

| Item | Recommendation | Why |
|---|---|---|
| Replace a destroyed cohort: pay Tier +2 Coin | **Include now** | Small. A button on the Destroyed card checks the Coin, pays it, clears the harm boxes, and reminds you of the two downtime activities |
| Hawkers' Hooked | **Include now** | Core: "Add the savage, unreliable, or wild flaw to your gangs to give them +1 quality (max rating of 4)". Once flaws are parsed it is a +1d on a gang or Elite cohort with one of those flaws, capped at quality 4, shown on the card. It changes the dice a cohort rolls, including from `1. Roll` |
| Edit type, edges and flaws from buttons | Later batch | The largest piece: type and flaw buttons, "one or two edges and an equal number of flaws", "up to two types". Typing the names on the sheet already works with the parser |
| Recruit or modify a cohort | Later batch | It spends "two upgrades" (core) or two advancement clocks (Deep Cuts), and the script has no way to spend either, and it would create new sheet rows |
| Cohort downtime activities (All Hands, Roots) | Later batch | The script does not track downtime activities for anyone; a once-per-Downtime record is cheap but empty without them |

**Reason for splitting:** this batch already writes to the sheet in new ways (harm boxes, armor boxes). I would rather see those work in your game before adding text edits and new rows.

---

(The sections below are the plan as first written, with the changes above applied where they differ.)

**Status at first writing: proposal for approval. No code has been touched.** Rules are quoted from your core book (`bladesinthedark_v8_2`), Deep Cuts Part Two, the Deep Cuts crew sheets (v1.2b PDF) or the Roll20 sheet; each row says which. Where I am inferring, it says so. If this is approved it ships as v0.12.0 and every crew needs `~ Rebuild`.

## 1. Bottom line

- **One new token action, `6d. Cohorts`** (no prompt). It whispers a list of the crew's cohorts. A cohort button posts a **status card to the table**: condition, type, quality and scale, harm, armor, edges and flaws with their descriptions. The card carries the buttons to roll the cohort, take harm (with or without armor) and heal.
- **Buttons, not prompts.** A prompt only works in a token-action macro and goes stale when a cohort is added or renamed. Chat buttons read the sheet when you click. The existing `1. Roll` entries for cohorts stay.
- **The sheet already holds everything except the descriptions.** Per cohort it has name, type (Gang, Elite, Expert), a free-text type, three harm boxes (Weak, Impaired, Broken), one armor box, and free-text edges, flaws and notes. The edge and flaw descriptions are not on the sheet; they are in your core book and I would show them word for word.
- **Three things differ from a plain port of the sheet, and I want your ruling on each** (section 6): what the armor box means, what happens when harm lands on a box that is already marked, and what to do about "Dead", which the sheet has no box for.

## 2. What the rules say

All text below would be shown as written. Core book unless marked.

**Types** (core, creating a gang): "Adepts: Scholars, tinkerers, occultists, and chemists." "Rooks: Con artists, spies, and socialites." "Rovers: Sailors, carriage drivers, and deathlands scavengers." "Skulks: Scouts, infiltrators, and thieves." "Thugs: Killers, brawlers, and roustabouts."

**Quality and scale** (core): "A gang has scale and quality equal to your current crew Tier." "An expert has quality equal to your current crew Tier +1. Their scale is always zero (1 person)." "Some crew upgrades will add the 'Elite' feature to a gang, which gives them +1d when they roll for a given Type." "A given cohort can have up to two types. When a cohort performs actions for which its types apply, it uses its full quality rating. Otherwise, its quality is zero." Scale table (core): 0 = 1 or 2 people, 1 = a small gang (3-6), 2 = a medium gang (12), 3 = a large gang (20), 4 = a huge gang (40), 5 = a massive gang (80), 6 = a colossal gang (160).

**Edges** (core): "Fearsome: The cohort is terrifying in aspect and reputation." "Independent: The cohort can be trusted to make good decisions and act on their own initiative in the absence of direct orders." "Loyal: The cohort can't be bribed or turned against you." "Tenacious: The cohort won't be deterred from a task."
**Flaws** (core): "Principled: The cohort has an ethic or values that it won't betray." "Savage: The cohort is excessively violent and cruel." "Unreliable: The cohort isn't always available, due to other obligations, stupefaction from their vices, etc." "Wild: The cohort is drunken, debauched, and loud-mouthed." Vehicle cohorts (Smugglers' Like Part of the Family) use the core vehicle edges Nimble, Simple, Sturdy and flaws Costly, Distinct, Finicky.

**Harm** (core, Cohort Harm and Healing): "Cohorts suffer harm similarly to PCs. A cohort can suffer four levels of harm: 1. Weakened. The cohort has reduced effect. 2. Impaired. The cohort operates with reduced quality (-1d). 3. Broken. The cohort can't do anything until they recover. 4. Dead. The cohort is destroyed."
**Healing** (core): "All of your cohorts heal during downtime. If circumstances are amenable for recovery, each cohort removes one level of harm (or two levels of harm instead, if a PC spends a downtime activity helping them recuperate)." **Deep Cuts, Downtime module (p80):** "First, each cohort heals one level of Harm. Then resolve Fallout, Payoff, Entanglements, Development, and Heat & Hold."
**Replacing** (core): "If a cohort is destroyed, it may be replaced. Spend coin equal to your Tier +2 to restore it, plus two downtime activities to recruit new gang members, or hire a new expert."
**Armor:** the core book has no cohort armor rule of its own. Cohorts get armor from abilities: Leader ("They gain +1 effect and 1 armor", "allows them to resist harm by using armor"), Reavers ("Your vehicle gains armor"), the Smugglers' Vehicle ("When the vehicle is upgraded (two boxes), it also gets armor"). The Deep Cuts crew sheets draw one armor box beside the three harm boxes.

## 3. What the sheet holds (sheet v3.11)

| Thing | Attribute (fixed cohort `cohort1_`, others `repeating_cohort_<row>_`) | Note |
|---|---|---|
| Name | `name` | a cohort with no name is skipped, as the Roll list does |
| Type | `type` = gang, elite or expert | the sheet's roll adds +1d for Elite or Expert, minus 1d when Impaired (`calculateCohortDice`) |
| Types (Thugs, Rooks...) | `subtype`, free text | up to two; also holds an expert's specialty (a Physicker) |
| Harm | `weak`, `impaired`, `broken` (checkboxes) | the Deep Cuts layout shows the same three boxes as one row of harm |
| Armor | `armor` (checkbox) | meaning is not stated on the sheet (decision 1) |
| Edges, Flaws | `edges`, `flaws`, free text | names only, no descriptions |
| Notes | `description` | free text |
| Dead | **no box** | decision 3 |

The sheet has one fixed cohort and a repeating section for the rest, in sheet order. The script already reads both (`cohortList`).

## 4. What you would see

**Card 1 (whisper), "Cohorts":** one button per cohort in sheet order, each with its harm as circles (`○○○` fit, `●○○` weakened, `●●○` impaired, `●●●` broken) and the name. Below: a button for the table summary of every cohort, and one for "every cohort heals one level" (the Deep Cuts crew-phase step when the Downtime module is on, the core downtime rule otherwise).

**Card 2 (public), the cohort's status** (the styled HTML card when `fmt card html` is on, a sheet card otherwise):

> **THE BLOODLETTERS** / COHORT / **THUGS**  [IMPAIRED]
> **Type:** Gang, Thugs. *Thugs: Killers, brawlers, and roustabouts.*
> **Quality:** rolls 1d (Tier 2, Impaired -1d). **Scale 2:** a medium gang (12).
> **Harm:** ●●○ Weakened, Impaired. *Impaired: operates with reduced quality (-1d).*
> **Armor:** free.
> **Edges:** *Fearsome:* The cohort is terrifying in aspect and reputation.
> **Flaws:** *Savage:* The cohort is excessively violent and cruel.
> [Roll] [Roll +1d] [Roll -1d] [Harm or armor] [Heal]

**Roll:** the same `blades` cohort-quality card `1. Roll` posts now, with the same pool. A **Broken** cohort does not roll: the card says "Broken: can't do anything until they recover" and nothing is posted to the dice. (The sheet's own button still rolls, as it does today.)

**Harm card (whisper):** "Harm to <cohort>": buttons for level 1 to 4 (Weakened, Impaired, Broken, Dead). When the armor box is free, a second row, "Use armor, then take level N", which marks the armor box and applies the harm one level lower (level 1 becomes none). A click marks the box and posts the result to the table: "Thugs take level 2 harm: Impaired."

**Heal card (whisper):** "Heal one level", "Heal two levels (a PC spent a downtime activity helping)", "Restore armor". Each posts a short result.

## 5. How it would be built

- **Verbs:** `cohorts` (card 1), `cohort --row <code>` (status card), `cohortroll --row <code> --n <bonus>`, `cohortharm --row <code> --n <level> [armor]`, `cohortheal --row <code> --n <levels>`, `cohortall` (the table summary), `cohortrest` (every cohort heals one level). **No colon in any button command** (the colon in the upgrade buttons stopped Roll20 running them; the cohort row codes the Roll list uses contain one, so buttons carry the row id as a plain argument). Old macros keep working.
- **Reading:** the existing cohort readers plus: types parsed from `subtype`, edges and flaws parsed from their text (split on commas, semicolons, "and" and line breaks; bracket text dropped; matched without regard to case). A name that is not in the book table is shown as typed with "no book text", the way unknown claims and upgrades are.
- **Writing:** only the cohort's `weak`, `impaired`, `broken` and `armor` boxes, and only on a button click. The script's own roll reads the boxes directly, so it does not depend on the sheet's worker; writing an existing box with the sheet's worker flag also lets the sheet refresh its own roll formula, as for a hand edit.
- **Permissions:** as every verb: the GM, or a player who controls the crew.
- **Data tables in the script:** the five types, four edges, four flaws, three vehicle edges and three vehicle flaws, the four harm levels, the healing and replacement texts and the scale table, all verbatim from the core book, with the Deep Cuts line for healing (p80).
- **Debug:** `!bitdcrew debug on` logs the cohort found, its parsed types, edges and flaws, and every box written.

## 6. Decisions I need

1. **The armor box.** On the PC sheet the script treats a marked armor box as **used** and "Restore all armor" clears it. I would do the same for cohorts: the box is **marked when the armor is used**. The sheet cannot say which cohorts have armor (Leader, Reavers and the Vehicle upgrade give it), so "Use armor" would be offered on every cohort whose box is free and the table decides whether it applies. Agree, or do you read the box as "this cohort has armor"?
2. **Harm stacking.** "Similarly to PCs": a PC's harm moves up a level when its slot is full. With one box per level, I would do the same: harm at a level whose box is already marked moves to the next box, and harm past Broken is Dead. Agree?
3. **Dead.** The sheet has no Dead box. I would mark all three boxes and post a "Destroyed" card with the core replacement text ("Spend coin equal to your Tier +2 ... plus two downtime activities"), the cost worked out (Tier +2 Coin), and change nothing else; you clear the boxes after the replacement. No Coin is spent by the script. Agree?
4. **Roll buttons.** Roll, +1d and -1d (fixed choices, because a button cannot ask). The Elite upgrade stays the sheet's way: you set the cohort's type to Elite; the script does not add +1d from a ticked Elite upgrade (that would count twice). The card would remind you when the matching Elite upgrade is ticked and the cohort is not set to Elite. Agree?
5. **Heal every cohort one level.** A button on card 1 only; it is not automatic at the start of Downtime. Add the same button to the Heat and Hold card? (Deep Cuts crews only.) I recommend yes for card 1 and no for Heat and Hold, so nothing changes your sheet unasked.
6. **Vehicle edges and flaws** (Smugglers). The core book and the Roll20 sheet agree. The Deep Cuts crew sheet (v1.2b) words Nimble "+1d to threat rolls when appropriate" and the rest in shorter form. Show the core wording, and the v1.2b wording of Nimble beside it when the Action module is on?
7. **Look.** Status card in the styled HTML style when `fmt card html` is on, sheet card otherwise (my recommendation), or always a sheet card?

## 7. Not in this plan

Editing type, edges or flaws from a button (you type them on the sheet), recruiting or modifying a cohort (spends upgrades), spending the replacement Coin, cohort downtime activities (All Hands, Roots), and the Hawkers' Hooked ability (the parsed flaws would make it possible later).

## 8. Tests I would write

Reading both the fixed and the repeating cohorts, in sheet order; types, edges and flaws parsed from every spelling (commas, lines, "and", case, bracket text); the book texts verbatim; condition and circles for every box combination; the pool for gang, Elite and Expert with and without Impaired at Tier 0 to IV; a Broken cohort refusing to roll; harm at each level on empty and full ladders, with and without armor; Dead; healing one and two levels; a stale or colon-free button check; players on another crew refused; hostile text in names, edges, notes and types; nothing written except the four boxes; mutation checks for each; and a live test row (L32).
