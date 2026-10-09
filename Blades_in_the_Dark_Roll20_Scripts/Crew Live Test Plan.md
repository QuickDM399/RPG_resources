# Crew Live Test Plan - BitD Crew Token Action Maker v0.4.1

For the local session that deploys the script (roll20-api-script-editor skill) and runs the live checks. The script and its mock tests were built without access to the game, so **every Roll20 behaviour below is unverified until you run it.** Record each result as pass, fail or not run; do not mark anything passed on the mock tests alone.

## Deliverable under test

`BitD Crew Token Action Maker.js` v0.4.1 (character count and hash are in the hand-back message). Game 22049328, Roll20 Pro, Mod Sandbox v1.5, sheet "Blades in the Dark" v3.11. The PC script `BitD Token Action Maker.js` v0.2.0 stays installed and enabled throughout.

## Ground truth

- **The sheet:** the crew sheet's own buttons (Tier, Wanted, Engagement, Fortune, cohort roll, ability and clock Show buttons) and its boxes (Heat, Wanted, Rep, Turf, Coin, XP, debt).
- **The books:** core `bladesinthedark_v8_2` (Heat p147, Incarceration p148, Entanglements p150) and Deep Cuts v1.0 (Advancement p78, Fallout p80, Payoff p81, Entanglements p82, Heat & Hold p84, crew changes p88). The rule table is in `BitD Crew Token Action Maker - Spec.md`, section 3.
- **An older working crew sheet:** Bravos, made before the modules existed.

## Crews

| Label | Crew | Character id | Why |
|---|---|---|---|
| A | `crew test` | `-P37IngTboqYwzckEMPu` | Assassins crew made after the modules existed: Advancement, Downtime, Harm, Load on. The Deep Cuts crew. |
| B | Bravos | `-MEo2MoHcs1_bIktRx8g` | Old crew, `crew_type` is lowercase `bravos`, all modules off. The core-rules crew. |
| C | Assassins | `-MEo28An-uFTAxOyQV9b` | Old crew, `crew_type` is capitalised `Assassins`, modules off. Checks that casing does not matter. |
| D | Shadows | `-MeHGN5WWSLnEI9YFOpk` | For Slippery and the 5th Wanted box (L14). |
| E | `crew new` | look up the id | The user's new test crew with **all five Deep Cuts modules on, including Action**. Run L1, L2, L5, L7 and L11 on it too; results must match A. |

Other crews (Hawkers, Cult, Smugglers, Vigilantes) get only L1. The Action module is expected to change nothing for crews; the mock tests check that, the live runs on E confirm it.

## Before you start

1. For crews A to D write down: `heat`, `wanted`, `wantedDC`, `rep`, `turf`, `crew_tier`, `hold`, `crewcoin`, `crewcoin_dc`, `crew_xp`, `dc_crew_xpclock_1` to `_4`, `crew_debt_dc`, the crew clocks, and the settings `setting_dc_downtime`, `setting_dc_advancement`, `setting_wanted_5th`. L20 puts them back.
2. Open each crew's sheet once in your browser (sheet workers only run in a browser that has the sheet open).
3. Make sure each crew has a token on the table and that its "Can be edited and controlled by" is set. For L12 you need one player account that controls crew B and one that does not (or log in as a player in a second browser).

## L0 Deploy and coexistence

**Steps:** upload the script to the Mods page. Open the API console.
**Pass:** the log shows `BitD Crew Token Action Maker v0.4.1 ready` and no error. The Macros list now has `CREW_TAM` (visible to all) next to `BLADES_TAM`. Select a PC token and click one of its token actions (for example `7. Status`): it answers exactly as before.
**Known fail states:** a syntax error in the console (the file was altered on upload: compare the character count and hash); `CREW_TAM` missing (no GM player id at start-up: restart the sandbox); a PC action now answering twice (two scripts handling one command: report it).

## L1 Setup and Rebuild (crews A, B, C, then the others)

**Ground truth:** the spec table (section 2). **Steps:** select the crew token. Run the `CREW_TAM` macro from the macro bar. Check the token's action bar. Click `~ Rebuild` on the token.
**Pass:**
- A card "Token actions ready" says `9 created`, the modules on, and "Rules used: Deep Cuts Downtime" for A and E (E lists "Advancement, Downtime, Harm, Load, Action") and "Rules used: core" for B and C. It says "Bar 1 is linked to Heat on 1 token".
- The action bar lists, in this order: `1. Roll`, `2. Engagement`, `3. Fortune`, `4. Score`, `5. Abilities`, `6. Adjust`, `7. Clocks`, `8. Status`, `~ Rebuild`.
- Rebuild a second time: still 9, none doubled. A, B and C each get the same behaviour, including C with its capitalised type.
- On the token: bar 1 shows Heat out of 9. Put a different number in the crew sheet's Heat boxes; the bar follows after a refresh of the token.
- Crew A's `1. Roll` list has Tier and cohorts but **no** Entanglement. B's and C's lists have Entanglement.
**Known fail states:** bar 1 empty (the linking order matters: link first, value and max second); a second set of actions with a different marker (the PC script's marker was used); Entanglement offered on A.

## L2 Rolls (B core, A Deep Cuts)

**Ground truth:** the sheet's own Tier, Wanted and cohort buttons, same crew, same bonus. **Steps:** for B set Tier 2, Wanted 2, Heat 5, and give cohort 1 a name and the type Gang. Click `1. Roll`, pick Tier, bonus 0. Click the sheet's Tier button, bonus 0, and compare. Repeat with Entanglement and with the cohort entry. Then bonus +1 and -3.
**Pass:**
- Tier card: header "Bravos roll their", title "Crew Tier", 2 dice. With +1: 3 dice. With a bonus that takes the pool to 0 or below: two dice with the "take the lowest" caption. The card looks the same as the sheet's own card.
- Entanglement card: "Bravos (who currently have 5 Heat) roll for", title "Entanglement", 2 dice (Wanted 2). Wanted 0 gives the two-dice lowest roll.
- Cohort card: header shows the cohort name with "(Gang, <subtype>)", title "Cohort Quality", dice = crew Tier. Mark the cohort impaired: one die fewer. Change the type to Elite or Expert: one die more.
- The card is posted as the player who clicked, and it appears (it is not swallowed).
**Known fail states:** no card at all (a callback was added to the post); dice count off by one from the sheet button; `^{key}` text showing raw (a missing translation key).

## L3 Engagement and Fortune (B)

**Steps:** click `2. Engagement`, answer the number-of-dice prompt with 2. Click the sheet's Engagement button, same answer. Same for `3. Fortune` and the sheet's Fortune button (answer the notes prompt too).
**Pass:** cards match the sheet's own, including the small "Engagement" title and the notes line. **Known fail states:** a prompt asked twice; the crew name replaced by the wrong character.

## L4 Entanglement result lookup (B)

**Ground truth:** core book p150 table (print or PDF). **Steps:** for each Heat in {2, 4, 7} click `1. Roll`, Entanglement, bonus 0, with Wanted 3 (dice give any result). Read the dice on the card.
**Pass:** right after the roll card a whisper from "BitDCrew" (to the GM, and to players who control the crew) names the column (Heat 0-3, 4-5, 6+), the highest die, and the matching row: 1-3, 4/5 or 6, with the entanglement names from the book. Check one result from each column and each row across the runs (you may set Wanted to force dice counts). Then set Wanted 0: the result uses the **lowest** of two dice. Change Heat on the sheet between the click and the end: the result still uses the Heat at the time of the roll.
**Known fail states:** no whisper (the dice could not be read: the console logs "could not read the dice"); the whisper arrives for a roll made with the sheet's own Wanted button (it must not); a second whisper for the same roll.

## L5 Heat bar and the Heat 9 rule (B core, A Deep Cuts, D)

**Ground truth:** core p147: at 9 the crew gains a wanted level, clears Heat, excess rolls over. **Steps (B):** set Wanted 1, Heat 8. Type 9 into **bar 1 on the token**. Then repeat by clicking the 9th Heat box on the sheet. Then set Heat 7 and use `6. Adjust` > `Heat +1`, +1, +1.
**Pass:** each time Heat becomes 0 and Wanted rises by 1 (2, then 3, then 4). A card "Wanted level" goes to the GM and controllers (not to a player who does not control the crew) and says "Heat reached 9: Wanted level +1". The **token bar shows 0**, not 9, within a few seconds. At Wanted 4, one more fill leaves Wanted at 4, clears Heat and says "already at its highest level (4)".
**Steps (A):** the same with Heat 8 on the bar.
**Pass (A):** the card also says "mark crew xp and pick Bluecoats as the entanglement", shows the Bluecoats line for the new Wanted level, the buy-off cost (Wanted + 4 Coin), and a **Mark crew XP** button that ticks the first unfilled `dc_crew_xpclock_N` clock.
**Also check:** the PC script's stress bar still resets at 9 on a PC token while this script is loaded.
**Known fail states:** bar left at 9 with Heat 0 (the late bar save: the script corrects it after 2 seconds); Wanted raised twice; nothing happens when the bar is typed (the linked bar did not save the attribute: try the sheet box to separate the two paths).

## L6 Score, core rules (B)

**Ground truth:** core p147 table. **Steps:** set Heat 0, Wanted 0. Click `4. Score` and answer: Exposure "Contained 2", the four extras No. Then Heat 7 and Exposure "Loud and chaotic 4", extras No (the book's example).
**Pass:** Heat +2 then Heat 2. Second run: card shows "Heat +4", Heat becomes 2, Wanted +1. All five prompts appear in the order exposure, high-profile target, hostile turf, at war, killing. Rep and Coin are not changed. **Known fail states:** seven prompts (a Deep Cuts action on a core crew: rebuild).

## L7 Score, Deep Cuts, and the Payoff walk-through (A)

**Ground truth:** Deep Cuts pp80-81. **Steps:** set crew Tier 2, Heat 0, Wanted 0, Rep 0, `crewcoin_dc` 0, no Vault upgrade ticked. Click `4. Score`. Answer: Base "Standard criminal operation 2", Target "High profile or well-connected +2", Chaos "Open combat or destruction or mayhem +2", Death "No death", Witnesses "Witnesses who can be questioned +2", Target Tier 1, PCs 4.
**Pass, Fallout card:** "Heat +10 (base 2, crew Tier +2, target +2, chaos or war +2, witnesses +2)". Heat becomes 1 and Wanted 1 (10 minus 9). The Wanted-level text and Bluecoats line appear. "Rep +5 ... Rep now 5/12" (Tier 1 target is not above Tier 2). "Payoff: 1 Coin per PC (4) plus 3 x the target's Tier (1) = 7 Coin". Seized-assets buttons appear. **No Coin changes yet.** The GM sees a separate Wanted card.
**Steps:** click "No seized assets".
**Pass:** "Earned from the score: 7 Coin". Tithe: Tier 2, 1 Coin per 4 earned = 1 Coin, with Pay and Not paying buttons.
**Steps:** click "Pay the tithe". **Pass:** "6 Coin left to deposit", with room for 4 more (no vault). Click "All 6 to the crew". **Pass:** `crewcoin_dc` is 4; the final card is posted **publicly** and says "Heat +10, Rep +5" (the score's totals, the same as the Fallout card), "Earned 7 Coin, tithe 1 paid, 6 to deposit", "To the crew: 4 Coin (crew now holds 4)", "The crew's vaults had room for only 4 of the 6 Coin you chose" and "Elsewhere (PC stashes or a bank): 2 Coin".
**More runs (reset Heat, Wanted, Rep and coin between them):**
- Tick the first Vault upgrade first: room is 12.
- Seized "load of cash +4": earned 11, tithe 2. Fence valuables for 8 Coin: +2 Heat and 8 Coin.
- Set crew Tier 3: no tithe step, deposit buttons straight away.
- Click any step button twice: second click says "Already done" and changes nothing.
- "Half" deposits the rounded-down half; "None" deposits nothing. The standard `crewcoin` is never changed.
- With Wanted 1 or more, the final card ends with the bank reminder.
**Known fail states:** Coin added before any deposit click; Heat applied twice; the final card whispered instead of public; `crewcoin` written instead of `crewcoin_dc`; a vault box ticked but room not counted (vault attribute names: `upgrade_vault_check_1`, `_2`).

## L8 Adjust entries (B core entries, A Deep Cuts entries)

Click `6. Adjust` and pick each entry; check the sheet box and the card.
**Pass (both):** Heat ±1 (a +1 at 8 fills the track as in L5), Wanted ±1 (stops at 0 and 4), Incarceration (Wanted -1 and Heat 0, core p148), Rep ±1 (stops at 12), Turf ±1 (stops at 6), Tier ±1 (stops at 0 and 4), Hold strong and Hold weak, Coin +1/+2/+4/-1/-2/-4.
**Pass (B):** Coin changes `crewcoin`, stops at 16. Mark crew XP raises `crew_xp`; the 10th mark posts the core reminder (new special ability or two upgrade boxes, stash Tier+2) with a Clear button.
**Pass (A):** Coin changes `crewcoin_dc` and stops at 24, and `crewcoin` is not touched. Mark crew XP ticks `dc_crew_xpclock_1` to 6, then clock 2; when all four are full it says so. "Reduce Heat: spend 1 Coin" and "... 1 Rep" lower Heat by 1 and the cost by 1, and refuse with no Heat or nothing to spend. "Assess hold": with Turf 1 and Tier 2 hold becomes weak; with Turf 2 strong. "Debt clock +1/-1" ticks `crew_debt_dc` and posts the clock card. A has no core XP reminder at 10 `crew_xp`.
**Known fail states:** the Debt, Reduce Heat or Assess hold entries missing on A (Rebuild after switching Downtime on) or present on B.

## L9 Abilities menu (A and B)

**Ground truth:** the sheet's `:` button next to an ability. **Steps:** tick two crew abilities and leave one unticked. Click `5. Abilities`, then click each ability button.
**Pass:** only the ticked abilities are listed. Each click posts the same "Special Ability" card as the sheet's own button, with the text the sheet shows (including the PC script's corrected wording for Crow's Veil and similar). **This Show button has been tested live for PC abilities only; the crew version is new.** **Known fail states:** a silent click (Roll20 sometimes ignores the first click; click again before failing it); the wrong crew's card.

## L10 Clocks (B)

**Steps:** add two crew clocks on the sheet, sizes 6 and 4, one with no size chosen. Click `7. Clocks`. Use -1, +1 and Show.
**Pass:** both clocks listed with their progress; the unset size is shown as 4. +1 raises the sheet's clock and posts the clock card; stops at full and at 0. Show posts the sheet's native card. **Known fail states:** the sheet's clock picture does not move (an attribute written but the sheet not refreshed: close and reopen the sheet).

## L11 Status (B and A)

**Pass:** the card matches the sheet: Heat, Wanted, Rep, Turf, Tier, Hold, Coin with "the crew can hold N", crew XP (B) or the four advancement clocks (A), Debt (A only), crew clocks, cohorts with quality. On A with Heat 6 or more the entanglement line shows. With Turf boxes and ticked Turf claims differing, the note appears; equal, it does not. On A with Hold different from the rule, an Assess hold button shows and works. Vault room: 4 with no vault; standard 8 and 16; Deep Cuts 12 and 24.

## L12 Permissions

**Steps:** as the player who controls B, use `~ Rebuild`, `6. Adjust`, `4. Score` on B. As the player who does **not** control B, select B's token (if you can) or paste `!bitdcrew status --c -MEo2MoHcs1_bIktRx8g` in chat. As GM, use every button on A and B. Set a crew's control to All Players and use it from a second player. Check the `CREW_TAM` macro appears on a player's macro bar.
**Pass:** the controlling player can do everything on B; the other player gets "you can only use this on crews you control" and nothing changes; the GM can act on any crew; "all players" crews work for every player; a player's Rebuild on B works and on A (if not theirs) is refused. **Known fail states:** `CREW_TAM` not on the player's bar (macro visibility: the PC macro has the same open question).

## L13 Module switch and stale actions (B)

**Steps:** with B rebuilt, switch **Downtime** on in B's sheet settings. Without rebuilding, click `4. Score` and answer the 5 core prompts. Then `~ Rebuild` and click `4. Score` again. Switch Downtime off again and rebuild.
**Pass:** the first Score says "this token action is out of date ... Run ~ Rebuild" and changes nothing. After the rebuild there are 7 prompts, Entanglement is gone from `1. Roll`, and Adjust has the Deep Cuts entries. Coin now uses `crewcoin_dc` (the sheet copies the track once when the toggle changes). **Known fail states:** coin lost when toggling (the sheet's copy behaviour: compare with doing it by hand); stale Entanglement still rolling after the switch (it must say there is no entanglement roll in Deep Cuts).

## L14 Slippery and the 5th Wanted box (D, then A)

**Steps:** on D switch Downtime on, tick Slippery, switch the 5th Wanted box on. Set Wanted 4 (`wantedDC` 4) and Heat 8. Rebuild. Click `6. Adjust` > Heat +1.
**Pass:** the 5-box track gains the level (5/5) and `wanted` is unchanged; the Bluecoats line uses the effective Wanted (one lower); the Slippery sentence appears; `8. Status` shows "Wanted (5-box track) 5/5 (Slippery: effective 4)". Switch the 5th box off: Status shows the 4-box track again. **Ground truth to confirm:** with the 5th box on, which row do your players mark? The script assumes the 5-box row (`wantedDC`).
**Also check No Traces on A** (Assassins ability, tick it): a Score with Heat total 10 takes 9 and the card says "No Traces -1".

## L15 Both scripts together

**Steps:** run the PC script's `~ Rebuild` on a PC token, then this script's on a crew token. Run the PC script's fix command `!bitd fixtext check` as GM.
**Pass:** each token keeps its own 9 actions; the crew actions are untouched by the PC rebuild; `fixtext check` reports nothing caused by the crew script (it must not list attributes this script wrote). Edit a PC's stress to 9 and a crew's Heat to 9 in the same minute: each rule fires once, on its own sheet.

## L16 Party probe (do this before L17 to L19)

**Ground truth:** Roll20's own Party member checkbox (Edit character) and the star shown next to party members in the Journal. **Steps:** mark two player characters and one crew sheet as Party member. As GM run `!bitdcrew party`. Then remove the flag from one and run it again.
**Pass:** the card lists exactly the marked characters with their sheet type (character, crew) and "Party members found" matches the stars. If it says "None found" while stars exist, the script cannot see the flag: copy the "Tags the script can read" line and report it, because the Payoff's "All party members" option depends on this.
**Known fail states:** nothing listed (wrong property name); crew sheets counted as player characters.

## L17 Score with the party count, and the new Payoff prompt (crew E, then A)

**Steps:** `~ Rebuild` the crew. Click `4. Score`: the last prompt is "PCs for the Payoff (1 Coin each)" with "All party members" first, then 1 to 8. Run one Score with "All party members" (two PCs marked) and one with a typed 3. Then clear the party flags and choose "All party members".
**Pass:** the Fallout card says "1 Coin per PC (2, the party)" and the payoff base is 2 + 3 x target Tier; the typed run says "(3)". With no party the script says so and applies nothing (Heat, Rep and the Downtime are unchanged).

## L18 Heat and Hold and End Downtime (crew E; tick abilities by hand)

**Steps:** tick **Just Passing Through** and **No Traces** on the crew (Veteran makes this legitimate). Set Heat 5, Coin 3, Rep 4, Turf 1, Tier 2. Run `4. Score`, walk to the Deposit, then use the Heat and Hold card that arrives. Click: Spend 1 Coin, Spend 1 Rep, Just Passing Through (twice), Assess hold. Set Heat 0 and click End Downtime. Repeat with Heat 3 at End Downtime. Open Adjust > Downtime: Heat and Hold, and Adjust > Downtime: start a new Downtime.
**Pass:**
- Spend 1 Coin: Heat -1 and `crewcoin_dc` -1 (never `crewcoin`); Spend 1 Rep: Heat -1, Rep -1. Both are logged on the reposted card.
- Just Passing Through: Heat -1 once; the second click says it was already used and the button is gone. A new Downtime brings it back.
- Assess hold: with Turf 1 and Tier 2 the hold becomes weak, matching the card's line.
- End Downtime at Heat 0 with No Traces: Rep +1 and a public "Downtime ended" card. At Heat 3: no Rep and the card says why. Buttons from the ended Downtime are refused.
- Status shows "Downtime is open" while one is open, and the Just Passing Through line (active at Heat 4 or less, inactive at 5).
**Known fail states:** the card not arriving after the Deposit (check the console with `!bitdcrew debug on`); a button doing nothing (stale Downtime id after a new Score); Heat dropping by 2.

## L19 Leverage and Misdirection (tick them on crew E)

**Steps:** tick **Leverage**. Run `4. Score` with Target Tier 1 and a standard operation (Heat 4 at Tier 2). Then tick **Misdirection** and run a big Score (Heat 10). Click the Misdirection button, then click it again.
**Pass:** Leverage: "Rep +2 ... Leverage: +1 Rep" and the sheet's Rep rises by 3; the final summary says Rep +3; a manual Adjust Rep +1 adds only 1. Misdirection: Rep +5 earned offers "give up 2 Rep" (half, rounded down); the click lowers Rep by 2 and tells you to name the faction; the second click says "Already done". With Leverage too the gain is 6 and the offer is 3. Start the same Score with Rep at 11 or 12: the offer is still 2, and the final summary says "Rep +5 earned, N fit on the track". An earn of 1 shows "Misdirection is not offered" with the reason. Unticking the row shows "on the crew sheet but its circle is not ticked". A crew without the row hears nothing about it.
**Known fail states:** Leverage on a Rep gain of 0; the offer shrinking when the track is nearly full; a missing offer with no reason on the card.

## L20 Composed Engagement roll (crews B, C and D, then E)

**Steps:** run `~ Rebuild` on each crew first, because `2. Engagement` is now a script macro with prompts. Compare one roll with the sheet's own Engagement button on the same crew to confirm the card looks the same.
- **Bravos (B):** tick the Door Kickers ability, and the Bluecoat Confederates claim if the sheet lists it. Run `2. Engagement`: Assault, Net dice 0. Then Stealth, then Assault with Net dice +1.
- **Assassins (C):** tick Predators. After the Rebuild there is an extra prompt, "Is the goal murder". Try Stealth with Yes, Stealth with No, Deception with Yes, and Assault with Yes. Tick City Records and Cover Identities if listed and try Stealth, Social and Transport without a murder goal.
- **Shadows (D):** tick Second Story and Secret Pathways. Run Stealth (both apply), then Assault. Run Stealth with Net dice -4.
- **Stale macro:** on a crew whose `2. Engagement` was built before it had a Predators or Deadly Focus row, add that row (do not rebuild) and run `2. Engagement`.
**Pass:** the dice counts are Bravos Assault 2 (3 with the claim ticked), Stealth 1; Assassins Stealth with Yes 2, No 1, Deception with Yes 2, Assault with Yes 1; Shadows Stealth 3, Assault 1, Net dice -4 shows the sheet's two-dice "lowest" layout. Two public cards appear: a short readable card (type Engagement, title "3d") whose text reads like "Stealth plan: 1 luck, +1 Second Story, +1 Secret Pathways = 3d.", then the engagement roll card with the crew name and image and the sheet's engagement title. The native button's card has no position text either, so none is expected A stale macro says "Run ~ Rebuild" and rolls nothing.
**Known fail states:** the arithmetic card missing or unreadable, the prompts in the wrong order, the murder prompt missing after a Rebuild, a claim not counted (the claim name on the sheet differs from the one in the script: send me the exact text of the claim box), Cover Identities counting for Transport.

## L21 Status reminders (any crew; add rows by hand)

**Steps:** on a spare crew add ability rows named Zealotry, Thorn in your Side, Roots, All Hands and Like Part of the Family, tick them, and run `8. Status`. Untick one and run it again.
**Pass:** one plain line per ticked ability, none for the unticked one, nothing on a crew without them.
**Known fail states:** a line missing because the row name differs from the script's (tell me the exact text), a line for an unticked row.

## L22 Begin score and Clear Edge (crew E with the Action module on; two or three player characters)

**Setup:** tick **Bound in Darkness** on crew E. Mark two of your player characters as Party members and leave one unmarked. Run `!bitd setup` on the PCs' tokens so bar 2 is linked to Edge. Write down each PC's Edge. Run `~ Rebuild` on crew E.
**Steps:**
1. `6. Adjust` now lists "Begin score: Edge for the party (Bound in Darkness)". Run it.
2. Click **All party PCs +1 Edge**. Then click it again.
3. Run Begin score again. Click one PC's button, then that button again, then **All party PCs**.
4. Untick Bound in Darkness and run it again. Switch the Action module off on the crew sheet, `~ Rebuild`, and check the entry is gone.
5. Re-tick and re-enable, `~ Rebuild`, give a party PC some Edge, and run a Deep Cuts `4. Score` (answer the prompts, "All party members" for the PCs). Read the Fallout card. Click **Clear Edge for the party**, then click it again.
**Pass:** step 2: each marked PC gains 1 Edge and the unmarked PC gains none; the PC's sheet and token bar 2 change at once (the bar may catch up within two seconds); the second click says "Already done". Step 3: that PC gets 1 only once, and **All** skips them. Step 4: "Bound in Darkness is not ticked" with nothing applied; no entry once Action is off. Step 5: the Fallout card says who holds Edge and offers the button; clicking it sets every party PC's Edge to 0 (sheet and bar), names who lost how much, and the second click says "Already done". With no PC marked as a Party member, Begin score says so and applies nothing.
**Known fail states:** the sheet's Edge box not updating while the attribute changes (tell me), the bar not updating, Edge written to the unmarked PC, a player who does not control the crew able to click, the PC script's own Edge actions broken afterwards (spend one with `!bitd` and check).

## L23 Heat claims and Rep claims (Score)

**Setup:** tick **Cover Operation** on a Hawkers, Assassins or Smugglers crew (a Deep Cuts crew, for example E), and **Victim Trophies** on an Assassins crew. `~ Rebuild`.
**Steps:**
1. Run `4. Score`: standard operation (base 2) at Tier 2, no other answers. Read the Fallout card. Then repeat with the claim unticked.
2. Tick a second claim of the same kind (Bluecoat Intimidation) and repeat. Then run a smooth operation (base 0) at Tier 0.
3. With Victim Trophies ticked, repeat step 1. Add Leverage and repeat.
4. On a core crew (Downtime off) with Cover Operation ticked, run `4. Score` with exposure 4.
5. Run `8. Status` on each.
**Pass:** step 1: with the claim "Heat +2 (base 2, crew Tier +2, Cover Operation -2)" and Rep +1; without it Heat +4 and Rep +2. Step 2: two claims take Heat to 0 and the Rep line says +0; a smooth operation at Tier 0 shows no claim line. Step 3 (with Cover Operation unticked, so Heat is 4): "Rep +3 (1 per 2 Heat, Victim Trophies +1)", and with Leverage the Rep rises by 4 in total (Leverage once). Step 4: "Heat +2 (exposure 4, Cover Operation -2)". Step 5: a "Claims the script counts" line naming each.
**Known fail states:** a claim not counted (send me the exact text in the claim's box on the sheet), the claim counted when unticked, Rep not following the reduced Heat, Leverage counted twice.

## L24 Claims that are buttons: Publicity, Doskvol's Most Wanted, the +2 Coin claims

**Setup:** on a Deep Cuts crew tick Publicity and Doskvol's Most Wanted (Vigilantes), or Envoy and Surplus Caches (Assassins, Hawkers), or Fixer, Local Graft, Loyal Fence. If the crew lacks the claim, tick any claim box and type the name. `~ Rebuild`.
**Steps:**
1. Run `4. Score` and read the Fallout card. Click a Rep button, then click it again. If you have Leverage ticked, check the Rep.
2. Run another Score. Click a Coin button (Envoy), then another (Surplus Caches), then **No seized assets**. Read the Payoff card and the tithe.
3. Click a Coin button after the seized step.
**Pass:** the card says "Claims that apply only to some scores" and lists a button only for each ticked claim. Rep +2, once, not boosted by Leverage. Coin: "The Payoff is now N Coin", and Earned and the tithe include it. After the seized step: "the seized assets step is already done".
**Known fail states:** a button label cut off (they are limited to 60 characters), a missing button for a ticked claim, Leverage adding to claim Rep.

## L25 Claim income in Heat and Hold (Deep Cuts crew, claims Vice Den, Drug Den, Protection Racket and so on)

**Setup:** tick one or two income claims. Set Heat to a known number. `~ Rebuild` is not needed. Open Heat and Hold (`6. Adjust` > Downtime: Heat and Hold).
**Steps:**
1. Read the card: there should be a "Claim income" line with a button for each ticked claim.
2. Click one. A dice card appears in the public chat, then (a moment later) a whisper reads the result.
3. Click **Add N Coin to the crew**, then click it again.
4. Click the same income button again. Click the second claim with Heat higher than the die.
5. Start a new Downtime (Adjust) and open the card.
6. On a Tier 0 crew with a claim, roll once.
7. If you can, click an income button and watch that the whisper arrives within a few seconds.
**Pass:** the dice card has Tier dice (two dice at Tier 0), a notes line like "Vice Den income: 2 dice, highest die minus your Heat 1.", and the whisper reads "Highest die 5, minus Heat 1 = 4 Coin." The button adds the Coin up to the vault room (the rest is reported as not fitting), once. The same claim says "Already done" until a new Downtime. A die at or below the Heat gives 0 and no button. Tier 0 says "no dice, 2d keep the lowest" and uses the lower die.
**Known fail states:** no whisper after the dice (then after about 20 seconds the script should say it could not read the roll; send me that console line, because the dice reading uses the same method as the Entanglement roll), the Coin added twice, the Coin ignoring the vault limit, Heat taken at the wrong time.

## L26 Clean up

Restore every value you recorded under "Before you start". Remove test clocks and cohorts. Remove the abilities and claims you ticked for L18 to L25, restore each PC's Edge, and clear the party flags if you set them only for testing. Leave `CREW_TAM` in place.

## Not verifiable offline (summary)

Token-action prompt wording and order in a real Roll20 query (including the new Engagement and Adjust prompts); whether the income roll's notes line is readable (the Engagement one was not); that the PC sheet's Edge box follows an API write to `edge_amount`; the crew ability Show button; bar-edit events on a crew token; reading dice from the posted Entanglement card; how the crew sheet displays API-written clock progress, Tier and coin; player-side behaviour including the `CREW_TAM` macro on a player's bar; **whether the script can read Roll20's Party member flag at all** (L16), which comes from a forum report; the Heat and Hold card arriving after the Deposit;  whether the sheet's `setting_wanted_5th` hides the 4-box track; and the entanglement table layout, which came from extracted text (check it once against p150).
