# BitD Generators: live checklist

For the local session that has the Roll20 game. Nothing in this list has been run in Roll20. The script passed 706 offline checks and 37 deliberate breaks (see the spec), but the offline mock cannot show how Roll20 renders or delivers anything.

## 0. Deliverable, ground truth, setup

**Deliverable.** `BitD Generators.js` v0.1.0 (69,833 characters; recompute size and hash before and after deploying and report both). Deploy it with the `roll20-api-script-editor` skill as a new script. Do not touch the other scripts.

**Ground truth.**
1. The five handouts in the game's "Generators" folder: People, Devils, Streets & Buildings, Scores, Rumors. `Generator handouts.md` is a word-for-word snapshot of them from 2026-10-05, so the handouts and the snapshot should agree. The script has six approved spelling fixes, so a result may differ from the handout in those words only: `anointed`, `The Cloud of Woe`, `acolyte`, `sowing the seeds`, `Stairs, Ramps, Terraces`, `Ecstasy`.
2. Every result line on a card shows its dice in small grey text. To check a result, find the table in the handout (see the lookup table in section 3) and read the cell the dice point to.

**Setup.**
- GM browser and a second browser (or a private window) logged in as a player.
- The other scripts installed as they are in the game (Position and Effect Tracker, Token Action Maker, the crew script), so coexistence is tested.
- API console open on the Mods page.
- Run `!bitdgen debug on` first. It logs every die, so a wrong result can be traced.

## 1. Cases

Record Pass or Fail for each, with the card text or console line for any failure.

| # | Step (what to click or type) | Pass | Fail states to record |
|---|---|---|---|
| L1 | Deploy. Read the API console. | `[BitD Gen] BitD Generators v0.1.0 ready.` and `created macro DUSK_ROLL`, no errors above them. | Syntax error; no ready line; "no GM player found" (macro not created). |
| L2 | Open the GM's Macros list. | `DUSK_ROLL` exists, GM-only (not shared to players). Run it, choose **NPC** from the dropdown. | Macro missing; a click on it turns into plain chat (Roll20 swallows a name that resembles the command); dropdown shows no options; options with spaces break (try "Street rumor"). |
| L3 | In chat type `!bitdgen`. | A dark "Generators" card appears **to the GM only** with buttons for every generator. Compare with `Card samples.html`. | Raw HTML text shown instead of a card (whispered HTML is not rendered): note it, then run `!bitdgen mode public` and repeat; the card must then render. Buttons grey or pink instead of the card style (note it). The refresh arrow shows as a box. |
| L4 | Press **NPC**. Press the refresh arrow on **Goal**. Press **Roll all again**. | A new card each time; after the Goal arrow only the Goal line changed; after Roll all again every line changed. The old card stays in chat above. | Card does not post; a click does nothing; a click re-posts an unchanged card; an error whisper. |
| L5 | **Edge, d66.** On an NPC card, read the Trait line's dice (for example `d66 52`). Open People, find the big table under "Professions: Rare" (header "Roll 2d6, Traits, Interests, Quirks"), row "5 2". | The Trait cell is the one in the row whose label is the dice in order: `52` means tens digit 5, units digit 2, so row "5 2", not "2 5". Repeat for Interest and Quirk (each line has its own dice). Also press **Cult** and check God and Practice against Devils, "Forgotten Gods and Cult Practices", rows labelled 11 to 66, using the dice on the card. | Tens and units reversed; Trait, Interest and Quirk taken from the same row (they should be independent). |
| L6 | **Edge, highest of N.** Type `!bitdgen ghost 10`. Read the Trait dice (`10d6, top two A and B`). Open Devils, "Ghost Traits": row A, column B. Then press the **d20** button and the **1** button. | The trait is the cell at row A (the highest die), column B (the second highest). With years 1 the dice note says `1d6 X, column d6 Y` and the cell is row X, column Y. The d20 button shows `d20 N` and then N dice. Setting years never rolls a d20. Most ghosts at 10 years should land in the bottom rows (Mad to Vile). | Row and column swapped; lowest used instead of highest; d20 rolled when years were set; years of 1 gives an error. |
| L7 | **Edge, multi-roll.** Type `!bitdgen street props 3`. Press **+** on Props. Type `!bitdgen score`; on the Twist line press **Two**, then **Any** until a d4 of 4 appears (or press Roll all again repeatedly). | Props shows 3 different items, then 4. Each prop's dice note reads `list dN, d6 M`; check item M of prop list N in Streets & Buildings, "Props" (the nine unlabelled lists, in order). Twist "Two" gives two different complications, each tagged `(list 1)` to `(list 3)`; check each against Scores, "Twist or Complication" (three lists separated by rules). | Fewer or more props than asked; duplicates; "Two" gives one result; a list tag that disagrees with the handout. |
| L8 | Press **Share to players** on an NPC card. In the player browser look at chat. | A public copy appears for everyone, labelled "shared", with **no buttons**. The player did not see any of the earlier whispered cards. | Players see whispered cards; the shared copy has buttons; the share posts as a whisper. |
| L9 | **Negative, player.** As the player type `!bitdgen`, then `!bitdgen npc`, then `!bitdgen debug off`. | Each gets one whisper: "The BitD generators are GM-only." No card, nothing posted publicly, nothing in the API console except the normal chat lines. With debug on in the GM view, no dice lines are logged for the player's commands. | A card appears for the player; state changes (check that `debug` is still on); an error. |
| L10 | **Negative, other scripts.** As GM type `!bitd`, `!bitdpe` and one command of the crew script; then `!bitdgen npc`. | Each other script responds exactly as before and `!bitdgen npc` posts only its own card. The other macros (`BLADES_TAM`, `ODDS_CALL`) are unchanged. Record the crew script's command prefix. | `!bitdgen` triggers another script (a script matching a prefix of `!bitd`) or another script triggers on `!bitdgen`. If it does, report the other script's name and match rule. |
| L11 | **Message size.** Type `!bitdgen score` several times (it is the largest card, about 10,400 characters) and press a few buttons on it. | The whole card posts with every row and button visible, including the handout note at the bottom. | Card missing, truncated, or the API console reports an error or a size limit. If so, report the smallest size that fails; a fix would be to drop the list-choice buttons from the card. |
| L12 | Press the Rare job toggle on an NPC card, then the refresh arrow. On a **Rumor** card press **Use other option**. | The Job line label says `(rare)` and a result comes from People, "Professions: Rare"; the refresh keeps rare. Use other option swaps the rumor text with the "Other option" text, and pressing it again swaps back. | Toggle does nothing; refresh drops back to common; flip rolls new dice. |
| L13 | Press a refresh arrow on a card that is more than 25 cards old (post 26 cards with `!bitdgen horror`, then use the first). | One whisper: "That card has expired. Roll again." No dice rolled. | Error, a crash, or a re-roll of the wrong card. |
| L14 | `!bitdgen mode public`, then `!bitdgen npc`, then `!bitdgen mode whisper`. | In public mode the card is visible to the player and has the buttons; after switching back cards are whispered again. Only the GM's clicks work. | Card not public; player click changes the GM's card (it must be refused). |
| L15 | `!bitdgen check` (GM). | A card lists each handout. Record exactly what it says for all five. Sizes should match the snapshot if the handouts are unchanged since 2026-10-05. | A handout reported "not found" because its name differs; sizes differ by a constant factor (the recorded size is URL-encoded; report the raw and encoded numbers shown so the comparison can be corrected). This check is indicative only. |
| L16 | `!bitdgen debug on`, run `!bitdgen name`, read the API console, then `!bitdgen debug off`. | A line like `!bitdgen name dice: d170=N` and a `posting NNNN characters (whisper)` line; nothing after debug is off. | No lines; lines after turning it off. |
| L17 | Restart the API sandbox with the script unchanged, then run `!bitdgen`. Edit the `DUSK_ROLL` action by hand, restart again. | After a restart the old cards' buttons still work (state survives) and the macro is not duplicated. The hand-edited macro action is repaired and the console says `repaired macro DUSK_ROLL`. | Duplicate macros; state lost; macro not repaired. |
| L18 | Spot-check three more lines against the handouts using their dice: one from Streets & Buildings (for example Use or Type, which have rows labelled "1-3", "4,5", "6"), one from Scores (Client or Work: the dice show `d4 N, d6 M`, so list N, item M), one from Rumors (`d6 N, side d2 M`: row N, option A if M is 1, B if M is 2; row 4 option B is the one in the oddly placed cell). | All three match the handout cell. | Any mismatch: record the dice, the handout cell, and what the card showed. |

## 2. What to report back

- Result of each case above (Pass or Fail, with the evidence for any Fail).
- The live script's name in the Mods page, size in characters, and hash (use the same rolling hash as the other scripts' notes).
- The crew script's command prefix.
- Anything the game showed that this offline build could not predict: how the card looks, how wide it is in the chat panel, button colours, whether the refresh glyph shows.
- If any fix is made live, copy it back into `BitD Generators.js`, rerun `node mock_test_gen.js "BitD Generators.js"` and `node mutants.js`, and keep both green.

## 3. Where to check a result (card line, handout, section)

The dice note on each line tells you the row and column. Handout sections appear in this order on each handout.

| Card | Line | Handout, section | How to read the dice |
|---|---|---|---|
| NPC | Name | People, "Names" (last section, three paragraphs) | One pool: `d170 N` is the Nth name counting through all three paragraphs |
| NPC | Heritage | People, "Heritage" | `d6 5, d6 3`: 5 is Foreigner (4-6), then 3 in the Foreigners list |
| NPC | Looks | People, "Looks" | gender d6, then `grid r,c` in the 6x6 table |
| NPC | Style | People, "Style" | `d37 N`: Nth item of the clothing words (items are my 37-item reading) |
| NPC | Goal, Method | People, "Goals", "Preferred Methods" | `d6 4 (row 3, 4), d6 2`: row "3, 4", column 2 |
| NPC | Job | People, "Professions: Common" or "Professions: Rare" | `grid r,c` |
| NPC | Trait, Interest, Quirk | People, the untitled table under "Professions: Rare" | `d66 52` is row "5 2" |
| Ghost | Trait | Devils, "Ghost Traits" | `top two A and B`: row A, column B |
| Ghost | Effect | Devils, "Ghostly Secondary Effects" | `d6 4 (row 4,5), d6 5`: row "4,5", column 5 |
| Demon | Affinity, Aspect | Devils, "Demon Types" | d6 across the Affinity or Aspect row |
| Demon | Desire | Devils, "Demon Desires" | like Goals |
| Demon | Feature | Devils, "Demon Features" | `d19 N`: Nth of the 19 items (my reading) |
| Horror | Horror | Devils, "Summoned Horrors" | `grid r,c` |
| Cult | God, Practice | Devils, "Forgotten Gods and Cult Practices" | `d66 51`: row 51 (column 2 for god, column 3 for practice) |
| Street | Mood, Sights, Sounds, Smells | Streets & Buildings > Streets, "Mood" and "Impressions" | d6 row; each Impressions column is its own roll |
| Street | Use, Type | Streets & Buildings > Streets, "Use", "Type" | rows "1-3", "4,5", "6" |
| Street | Details | Streets & Buildings > Streets, "Details" | `grid r,c` |
| Street | Props | Streets & Buildings > Streets, "Props" | `list d9 N, d6 M`: Nth numbered list, item M |
| Building | Material, Exterior | Streets & Buildings > Buildings, "Exterior" | d6 across the Material row and the Details row |
| Building | Use | Streets & Buildings > Buildings, "Use: Common" or "Use: Rare" | `grid r,c` |
| Building | Details | Streets & Buildings > Buildings, "Details" | `grid r,c` |
| Building | Items | Streets & Buildings > Buildings, "Items" | `list d5 N, d6 M` (or `d4` for the fifth list): Nth numbered list, item M |
| Score | Client, Target | Scores, "Client / Target" | `d4 N, d6 M`: Nth list (Civilian, Criminal, Political, Strange), item M |
| Score | Work | Scores, "Work" | same, lists Skullduggery, Violence, Underworld, Unnatural |
| Score | Twist | Scores, "Twist or Complication" | `d4 N, d6 M`: list N (three lists), item M; a d4 of 4 gives two |
| Score | Connected, Faction | Scores, "Connected to A Person..." and "... and Factions" | Connected is the d6 item; Faction is `d66 33`, label "33" |
| Rumor | Rumor | Rumors, "Rumors on The Street" | `d6 N, side d2 M`: row N, option A (1) or B (2) |
| Occurrence | Event | Rumors, "Remarkable Occurrences" | same |
| Overheard | Heard | Rumors, "Overheard in Duskwall" | `d8 N`: Nth exchange (separated by lines on the handout) |
| News | Event | Rumors, "City Events in The Newspapers" | `grid r,c` |
