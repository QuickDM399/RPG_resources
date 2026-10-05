# BoB Token Action Maker: live test plan

For the local session that has the Roll20 game open and the `roll20-api-script-editor` skill. The mock tests pass under `node`, but they cannot reproduce how Roll20 behaves. Everything below is what the mock could not settle.

## Deliverable under test

| | |
|---|---|
| Script | `BoB Token Action Maker.js` v0.1.0 (`Band_of_Blades/` in the repo) |
| Characters | see the hand-back message (count and hash are printed there, use them to check the upload) |
| Game | Band of Blades campaign, Roll20 game 21803933 (Pro). Mod Sandbox version: read it from the Mods page and write it here: ______ |
| Sheet | "Band of Blades Official", `sheet.json` version 1695969506 |
| Commands | `!bobtam <verb>` |
| Global macro | `LEGION_TAM` (runs `!bobtam setup`) |
| State | `state.BoBTAM` |

Deploy with the `roll20-api-script-editor` skill. Do not push the script in chunks through the browser.

Install only this script, plus the calculator and mission generator if they are already in the game. Do NOT install the Blades in the Dark script in the same game. Its automatic trauma runs on any character sheet (not only on its own marker), so on a Band of Blades sheet it would add trauma at stress 9 and post `bitd-broadcast` cards the sheet does not have. (Checked by running that script in the mock against a Band of Blades sheet.)

## Ground truth

- **The sheet.** For every roll, click the sheet's own button on the same character and compare it with the script's card. The mock already compared the card text with the sheet's button text, so what is left is how Roll20 draws it.
- **The book** (`Band of Blades Text (clean...).txt`, line numbers refer to that file):
  - Stress and Trauma, lines 373-390. Six stress boxes (line 375). Trauma when stress cannot be marked (line 384). Last trauma box is death (386).
  - Corruption and Blight, lines 397-405. The seventh corruption point resets corruption and gives a blight (399). Fourth blight box (737).
  - Resistance and Armor, lines 712-760. Cost is 6 minus the highest die (719). Armor is restored when you choose your load (749).
  - Harm, lines 681-683. A full row moves up (683).
  - Zero dice: roll two, take the lowest, no critical (lines 303-306).
- **Table rulings** (the book is silent): after a trauma, stress goes back to 0. Leftover corruption points count from 0.

## Before you start

1. Turn debugging on once: type `!bobtam debug on` in chat as GM. If any step below fails, repeat it and send me the API console lines that start with `BoB debug:` plus a screenshot.
2. Make three test characters. Use the sheet's Attributes & Abilities tab once on each (a sheet opened by script ignores edits until that tab has been opened), then go back to the Character Sheet tab.

| | Character A: Soldier (use "Soldier" playbook) | Character B: Specialist (Sniper) | Character C: Rookie |
|---|---|---|---|
| Actions | research 1, scout 0, rig 0, wreck 0, skirmish 2, shoot 1, maneuver 0, consort 0, discipline 0, marshal 0, sway 3 | wreck 2, shoot 3, research 1, everything else 0 | none rated |
| Specialist action | grit, rank 1 | aim, rank 2 | none (shows "-") |
| Extra stress | none (6 boxes) | tick **Hardened** once (8 boxes) | none |
| Extra trauma | none (2 boxes) | none | Rookie default (1 box) |
| Special abilities | tick 2 of them | tick 1 | none |
| Controlled by | player 1 | player 2 | all players |

Expected resist dice for A: insight 2 (research 1 + grit rated), prowess 2 (skirmish, shoot), resolve 1 (sway). For B: insight 2 (research 1 + aim rated), prowess 2 (wreck, shoot), resolve 0.

3. Put a token for each character on the GM layer, linked to its character ("Represents").
4. For the bar checks, type `1` into bar 2 and bar 3 of token A and note them. Leave bar 1 empty.
5. Have a second browser or a second account logged in as player 1 (controls A) and player 2 (controls B) for T12.

---

## T0. Script loads, macro exists (first live check of the macro name)

Steps:
1. Open the Mod Sandbox page, confirm the script saved with no error.
2. Look at the API console.
3. Open the Macros list as GM.

Pass: the console shows `BoB Token Action Maker v0.1.0 ready` and no error. A macro `LEGION_TAM` exists, visible to all players.
If it fails: send the console text.

## T1. FIRST LIVE CHECK: a script-composed `blades` card with plain dice fields

This is the one thing the whole script depends on and the mock cannot prove.

Steps:
1. Select token A. In chat, click the sheet's own **Skirmish** button on character A, choose Risky, Standard, bonus 0. Note how the card looks.
2. Run `LEGION_TAM` with token A selected. Then click the new token action **1. Action**. Choose Skirmish, Risky, Standard, bonus 0.

Pass: the second card looks the same as the first: the "Skirmish" title image, "Ayla rolls" (the character's name) subtitle, two dice shown as `4, 2` (comma separated), position Risky, effect Standard, and the outcome block with the rule text for 6, 4/5, 1-3 and (for two 6s) critical. The character image shows.
Known fail states:
- The dice appear as raw `[[d6]]`, or one die only, or the dice row is empty. Cause: Roll20 handles the plain `{{die1=[[d6]],}}` fields differently from the entity-escaped form the sheet uses. Send the console log.
- No outcome block. Cause: `{{results=1}}` or the `result_*` fields not drawn.
- A raw `^{rolls}` or `^{skirmish}` appears. Cause: translation keys not resolving in a script message.

Repeat once with Position set to **Fortune roll**: expect the short card (no position), as the sheet's "Fortune roll" option gives.

## T2. Setup and Rebuild

Steps:
1. Select token A, run `LEGION_TAM`.
2. Open the token's action menu. Then click **~ Rebuild**. Then run `LEGION_TAM` once more.
3. Do the same for token B with the macro.
4. Check the Abilities list of character A: its own ability with a similar name, if any, must be untouched.

Pass:
- A whisper "Token actions ready" naming 9 created and "Bar 1 is linked to stress on 1 token".
- The token menu shows exactly nine entries in this order: `1. Action`, `2. Resist`, `3. Fortune`, `4. Abilities`, `5. Harm`, `6. Adjust`, `7. Status`, `8. Load`, `~ Rebuild`.
- Rebuilding twice still leaves nine.
- Open `6. Adjust` in the Abilities list and confirm its action text is complete (it ends with `Mark Playbook xp,xp-playbook}`; it is about 750 characters).
Fail states: more than nine entries (rebuild did not remove the old ones), a missing entry, an Adjust dropdown that stops partway (Roll20 truncated the text).

## T3. Action roll, every position and effect

Steps: with token A, use `1. Action` and run each of these, comparing the card with the sheet's own button for the same action:
- Skirmish (rating 2) Controlled, Great, bonus +1: 3 dice.
- Sway (3) Desperate, Limited, bonus -1: 2 dice.
- Maneuver (0) Risky, Zero, bonus 0: zero dice (two dice, "take the lowest" text under them, no outcome for a critical).
- Maneuver (0), bonus -2: still zero dice.
- Research (1) with bonus +6: 7 dice.
- Check the dropdown labels show the ratings: `Skirmish (2)`, `Sway (3)`, `Maneuver (0)`.

Pass: dice counts as listed, position and effect as chosen, same layout as the sheet's card each time. The dropdown lists exactly the 11 core actions (no specialist action).

## T4. Resist roll and the stress button

Steps with token A (stress 0):
1. `2. Resist`, choose Prowess, bonus 0. Expect 2 dice. Check the dropdown label shows `Prowess (2)`.
2. A whisper "Stress cost" arrives. Read the highest die. Check the card says `Highest die: N. Resisting costs 6 minus N = X stress.`
3. Click **Take X stress**. Check the stress radio on the sheet and the bar. Click the same button again.
4. Repeat until you get: (a) a 6 (expect "No stress to take", no button), (b) two or more 6s (expect "Critical: also clear 1 stress." and a **Clear 1 stress** button).
5. Choose Resolve with bonus -1 (A has one rated resolve action, so resolve is 1, and 1 - 1 = zero dice). The card shows two dice and the zero-dice line. Check the whisper reads `Zero dice, lowest die: N`.
6. With stress at 5 of 6, make a resist that costs 2 or more. Check the whisper warns "Only 1 stress box is free, so taking this causes trauma."
7. Click **Take X** then: trauma 1, stress 0 (T8 covers the details).
8. Two players: ask player 1 to click the same offer after you did.

Pass: costs equal 6 minus the highest die (a 4 costs 2, a 6 costs 0, a 1 costs 5). The stress radio and bar match after the click. A second click says "Already applied" and changes nothing. A critical shows the clear button. No stress button on zero dice with two 6s (the book: no critical on zero dice).
Known fail states:
- No whisper at all. Cause: the script could not match the posted card or read its dice (the debug log says `could not read the dice`). This is the Roll20 behaviour the mock cannot reproduce.
- The whisper arrives for the GM only, or twice to the same person. Check it reaches the GM and the character's player.

Also check the stored-rating message: if the sheet's resist number (the large number at the top of the Prowess column) differs from the dropdown label, you get "the sheet shows ... but its actions add up to ...". Open the sheet and confirm both agree after a recalculation.

## T5. Fortune and the specialist action

Steps:
1. Token A, `3. Fortune`, choose 3 dice, leave Notes empty. Then 0 dice with the note "check the door".
2. Token A, `3. Fortune`, choose `Specialist action (grit)`: expects 1 die (grit rank 1).
3. Token B, same: `Specialist action (aim)` expects 2 dice.
4. Token C (Rookie): choose the specialist entry.
5. Click the sheet's own Fortune and Aim buttons for comparison.

Pass: the Fortune card matches the sheet's (title image Fortune, notes shown when typed, dice 0 gives zero dice). The specialist card matches the sheet's Aim button (short card, no position, effect or results). Token C: "has no specialist action set".

## T6. Abilities

Steps: token A, `4. Abilities`. Click one ability. Then, on the sheet, untick an ability and run the menu again.

Pass: the menu lists only the ticked abilities, in the order on the sheet. Clicking one posts a card publicly with the ability's name as the title and its description, like the sheet's ":" button. Unticked abilities disappear.

## T7. Harm

Steps on token A, `5. Harm`:
1. Level 3, "Broken leg".
2. Level 3 again, "Impaled": expect the level 4 notice and nothing written.
3. Level 2 "Burns", level 2 "Bleeding", level 2 "Exhausted" (a third at level 2 with level 3 already full).
4. Clear level 3 on the sheet, then level 2 "Exhausted" again: expect it to move up to level 3.
5. Level 1 twice, then a third: expect it to move up to level 2.
6. `7. Status`, then the "Clear or share harm" button: clear one, share one.

Pass: text lands in `harm3`, `harm2_1/2`, `harm1_1/2` on the sheet. A full row moves up to the next row, and the card says so. Level 3 full gives "Level 4: fatal harm" and writes nothing. Healing ticks under the harm table are never changed. The shared harm card matches the sheet's own harm button.

## T8. Adjust: stress, trauma, corruption, blight, armor, uses, xp

Run these through `6. Adjust`, checking the sheet after each:

| Step | Expect |
|---|---|
| A: Stress +3, then +3 | stress 3, then 6 of 6, **no** trauma |
| A: Stress +1 | trauma 1, stress back to 0, a card with 8 condition buttons and a bar `1/2` |
| click `Reckless` | the sheet's Reckless box ticks and trauma stays 1 |
| A: Stress +3, +3, then +1 | trauma 2 and the death notice "last trauma box" |
| C (Rookie): Stress +3, +3, then +1 | trauma 1 of 1 with the death notice |
| B: Stress +3, +3, +2, then +1 | B has 8 boxes: stress reaches 8 of 8 with no trauma, the 9th point is trauma |
| A: Clear all stress, then Stress -1 | stays 0 |
| A: Corruption +3, then +3 | corruption 3, then 6 of 6 (no blight yet) |
| A: Corruption +1 | corruption 0, blight 1, a card with 8 blight buttons |
| click a blight condition | the sheet's box ticks, blight stays 1 |
| A: set corruption to 5 on the sheet, then Corruption +3 | corruption 1, blight 2 (sixth point, seventh resets, one left over) |
| A: repeat the corruption step until blight shows 4 | notice "completely corrupted" on the fourth blight |
| A: Armor, Heavy, Shield, Special toggles | each checkbox on the sheet ticks and unticks |
| A: Restore all armor | all four unticked |
| A: Specialist action: spend 1 use (grit rank 1) | one circle marked; a second spend says no uses left |
| A: restore all uses | circles cleared |
| A: Mark Insight/Prowess/Resolve/Specialist/Playbook xp | the right track advances; stops at 6 (playbook 8) |
| C: Mark Specialist xp, spend a use | refused ("no specialist action") |
| A: Trauma -1, Blight -1, Corruption -1 | conditions listed to clear; corruption lowers |

Pass: all of the above. Pay attention to:
- **Do the used-use circles mean "used" or "left"?** The script marks circles as uses spent. If the sheet's circles mean the opposite on the printed playbook, tell me.
- **Count of boxes.** The number of stress and trauma boxes the sheet shows must equal the script's: A shows 6 stress and 2 trauma boxes, B shows 8 stress boxes (Hardened once), C shows 1 trauma box. Also tick Hardened twice on B (10 stress boxes) and Survivor once (3 trauma boxes). The script computes these itself from the book. If the sheet shows different counts, the script's numbers are wrong.
- After a script write of trauma plus a condition, open the sheet and tick or untick one other condition: the sheet recalculates `trauma` as the number of ticked conditions. Note whether the number stays consistent.
- The sheet's corruption radio shows 0-6 and the 7th point does reset.

## T9. Status card

Steps: `7. Status` on A and B after T8. Click a few buttons on the card (Stress -1, Stress +1, a corruption button, an armor toggle, an XP button, Spend 1 use, Load).

Pass: lines for stress, trauma (with conditions), corruption, blight, the four armor boxes, the specialist action (A and B only), XP. The harm card follows. Every button works. Token C has no specialist line and no Specialist xp.

## T10. Load card and item toggles

The sheet fills the standard items per playbook when a character is created, as hidden attributes. This is the part the script knows least about, so test it on both A and B.

Steps:
1. `8. Load` on A with no load chosen: expect the three tier buttons and a hint.
2. Mark all four armor boxes used, then click **Light**.
3. Click **Normal**, then **Heavy**.
4. On the sheet, compare the item list with the card.
5. Click each item button on the card that has a box, an either-or choice, or use circles.
6. In the utility section, click a one-box item, a two-box item and an item with uses.
7. Repeat on B.

Pass:
- Armor is restored when you click a load (all four boxes clear) and the card says so.
- Light lists the light items, Normal adds the normal ones, Heavy adds the heavy ones, matching the sheet's three columns for that playbook. The sheet's Load checkbox ticks for the chosen load.
- Items with a box show a checkbox that toggles. Either-or items show two buttons and the choice ticks the matching box on the sheet. Use circles advance one at a time and wrap to 0.
- Utility rows appear with their names; boxes and uses toggle.
Known fail states: an empty item list (then the `_show` attributes are not present for that character; run `!bobtam debug on`, repeat, and send me the playbook name and a screenshot of the sheet's items), names that differ from the sheet, buttons that change nothing.
Also tell me what a marked item box or use circle means on the sheet (taken, used, or spent), since the script only toggles it.

## T11. Token bar check

Steps with token A (after T2):
1. Bar 1 shows stress over 6. Bars 2 and 3 still show the `1` values you typed.
2. Use Adjust stress +2, then -1, then Clear all stress. Watch bar 1 without refreshing.
3. Click the bar and type a value of 3 (inside the range). Check the sheet's stress.
4. Click the bar and type **7** (past the 6 boxes). Record what happens:
   - (a) Roll20 accepts it: expect trauma +1, stress 0, a whisper card to the GM and player 1, and bar 1 returning to 0 within about two seconds.
   - (b) Roll20 limits it to 6: then the bar cannot signal trauma, and trauma only comes from the buttons. That is fine; tell me.
5. On B, untick and tick Hardened and watch bar 1's maximum (8 and 6 boxes) change without a rebuild.
6. As player 1, click the bar and type a value.
7. Use the calculator: `!bob`, select token A, click "Use selected token" for Self. Note what Threat it reads.

Pass: bar 1 is linked (its value follows the sheet and the commands at once), the maximum matches the boxes, players can see and edit it, bars 2 and 3 are never changed. Step 7 is expected to read the stress value as that token's Threat: this is the known calculator conflict, still to be patched (the calculator fix is tabled). Do not use "Use selected token" on a PC token until then.

## T12. Player permissions (needs a player logged in)

Steps:
1. As player 1 (controls A): click each of the nine token actions on A. Click **~ Rebuild**.
2. As player 1, select token B and click `6. Adjust`, `7. Status`, `1. Action`, `~ Rebuild`.
3. As player 1 on token C (controlled by all): click `7. Status`.
4. As player 2 on token C, the same.
5. As player 1, look at the macro bar for `LEGION_TAM`, then select token A and run it.

Pass: player 1 works on A and C only. On B every button answers "you can only use this on characters you control", posts nothing and changes nothing. Both players can use C. `LEGION_TAM` shows on the player's macro bar and rebuilds only characters they control (selecting B with it does nothing but the refusal).

## T13. Macro name check

Steps: with a token selected, click `LEGION_TAM` in the macro bar (GM and a player).

Pass: the "Token actions ready" whisper appears. Fail state: the text `!bobtam setup` is posted into chat as a message and nothing is set up (Roll20 swallowed the macro because its name resembled the command; the name `LEGION_TAM` was chosen to avoid this).

## T14. Other sheet types

Steps: set `sheet_type` on a spare character to Chosen, Broken, and one Legion role (Marshal), select its token, click or type `!bobtam status`.

Pass: "Name is a chosen sheet; v0.1.0 supports Rookie, Soldier and Specialist character sheets only." and nothing is written.

## T15. Coexistence

Steps: run `!bob` (calculator), `!missions-help`, `!bob-help`, then `!bobtam status`.

Pass: each command only answers from its own script. The calculator still works on NPC tokens. Nothing from the calculator or mission generator changed on the PC tokens except the known bar 1 conflict in T11.

## What to send back

For each test: pass, fail or "not sure", plus a screenshot for T1, T4, T8 (box counts), T10 and T11 step 4. Include the API console lines starting `BoB debug:` for anything that failed. Then turn debugging off with `!bobtam debug off` and delete the test characters and tokens (or reset their stress, trauma, corruption, blight, armor and harm).

## What this plan cannot settle (unverified)

- Whether the sheet draws the script's plain `{{die1=[[d6]],}}` fields (T1).
- Whether Roll20 accepts a bar value past its maximum (T11 step 4), which decides whether bar edits can signal trauma.
- The meaning of marked use circles and item boxes (T8, T10), and the exact standard-item attribute names on a real character (T10).
- Whether the number of stress and trauma boxes the sheet shows matches the book numbers the script uses (T8).
- Inline chat buttons inside a `blades-broadcast` card (T4, T6, T8, T9): the BitD game proved this for its own template, not this one.
- The Load card was written from the sheet markup alone, with no live character to read.
