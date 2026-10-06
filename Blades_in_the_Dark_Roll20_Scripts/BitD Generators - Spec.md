# BitD Generators: Spec (v0.1.0)

A Roll20 API script that runs the random generators from the five "Generators" handouts in the Blades in the Dark game (People, Devils, Streets & Buildings, Scores, Rumors) from chat.

**Status: built and tested offline only. Nothing has been run in Roll20.** The live session deploys it, runs `Live checklist.md`, and fixes what the game shows.

- Game: Roll20 game 22049328 (Evil Hat sheet v3.11, Deep Cuts modules on)
- Script: `BitD Generators.js` (69,833 characters, hash 1185333109 using the same rolling hash as the other scripts' notes; recompute after any edit)
- Command: `!bitdgen`. State: `state.BitDGen`. Variable: `BitDGen`. Global macro: `DUSK_ROLL`.
- Ground truth: `Generator handouts.md`, the verified snapshot of the five handouts taken 2026-10-05.

---

## 1. Decisions (approved by the user)

| Topic | Decision |
|---|---|
| Generators | NPC, Name, Ghost, Demon, Horror, Cult, Street, Building, Score, Rumor, Overheard, News, Occurrence. Whole-generator cards plus single-section commands. |
| Who can run | GM only, for every command and every button. A player is refused with a whisper. |
| Where results go | Whispered to the GM (`/w gm`). `!bitdgen mode public` switches to public (`/direct`). A "Share to players" button posts a public copy with no buttons. |
| Dice | Plain `randomInteger`, shown in small grey text on every line. No Roll20 inline rolls (they are not evaluated inside `/direct` cards, and a second message would break the card look). |
| Re-roll | A refresh button per line, "Roll all again", a **+** where the handout says "multiple" (duplicates are re-rolled). No lock button. A re-roll posts a new card because the API cannot edit a posted message. The last 25 cards keep live buttons. |
| Data | Embedded in the script, generated from the data file by `build_data.js`. No cell is typed by hand. |
| Look | Band of Blades cards: dark panels, grey buttons, accent red for the current choice, green for the final action (colours and `btn`/`panel` structure taken from `band-of-blades-mission-generator.js`). |
| Names | Command `!bitdgen`. Macro `DUSK_ROLL` (GM only, dropdown of generators). Neither contains `GEN` or `BITD` in the macro name. |
| Debug | `!bitdgen debug on` writes every command, every die and every posted size to the API log. Built in from the start because the first live run cannot be tested offline. |

## 2. Answers the user gave to the handout ambiguities

| Handout / section | Decision |
|---|---|
| People > Style | The 37-item reading is correct (list in `build_data.js`, `STYLE_ITEMS`). One d37 roll. |
| People > Names | The three paragraphs are equal: one pool of 170 names, one random pick. Left exactly as written ("Booker. Ankhayat" and "Da lmore" are not typos). See section 8 for how this was read. |
| People > Traits / Interests / Quirks | One roll per column (three independent d66 rolls). |
| People > row "2 5" | "Ecstacy" corrected to "Ecstasy". |
| Devils > Demon Features | The 19-item reading is correct (`FEATURE_ITEMS`). |
| Devils > Forgotten Gods and Cult Practices | God and practice are two independent d66 rolls. Typos fixed. |
| Devils > Ghost Traits | Roll 1d20 for the years, then that many d6, take the two highest as a d66 (highest is the row, second highest is the column). |
| Devils > Demon Types | As is (Affinity and Aspect are independent d6 rolls). |
| Streets > Details | "Stairs, Ramps. Terraces" becomes "Stairs, Ramps, Terraces". |
| Streets > Props, Buildings > Items | Default: random list, then random item. The last Items list really has 4 items; no list has a label. |
| Streets > Impressions | One roll per column (Sights, Sounds, Smells). |
| Scores > Client / Target, Work | d4 picks the list, then d6. |
| Scores > Twist | d4. 1 to 3 picks that list, then d6. A 4 means two complications: 2d3 for the two lists, then 2d6 for the two results. |
| Scores > Connected to, Factions | Same d4 gate: a 4 gives two results. See section 8. |
| Rumors | Typos fixed. The "OR" rows use the default (roll one side, flip button). |

Spelling fixes applied (exact counts checked by the build): `annointed` to `anointed` (2), `Thew Cloud of Woe` to `The Cloud of Woe` (1), `acoylyte` to `acolyte` (2, includes `acoylytes`), `sewing the seeds` to `sowing the seeds` (1), `Stairs, Ramps. Terraces` to `Stairs, Ramps, Terraces` (1), `Ecstacy` to `Ecstasy` (2: People Interests row "2 5", Rumors on The Street row 4).

## 3. Commands

`!bitdgen <generator> [section] [number]`

| Generator | Sections |
|---|---|
| `npc` | name, heritage, looks, style, goal, method, job, trait, interest, quirk |
| `name` | shortcut for `npc name` |
| `ghost` | trait (years and trait), effect. A number sets the years (1 to 100) and skips the d20. |
| `demon` | name, type (affinity and aspect), desire, feature |
| `horror` | none |
| `cult` | god, practice |
| `street` | mood, impressions (sights, sounds, smells), use, type, details, props |
| `building` | exterior (material and details), use, details, items |
| `score` | client, target, work, twist, connected, faction |
| `rumor`, `occurrence`, `overheard`, `news` | none |

Any line key also works as a section (for example `street sights`). With a section, a number is how many results to roll on a repeatable line (up to 10): `!bitdgen street props 3`. Without a section a number is only valid for `ghost`.

Other commands: `!bitdgen` or `menu` (buttons), `info` (version, snapshot date, handout sizes), `check` (compare current handout sizes with the snapshot; indicative only), `debug on|off`, `mode whisper|public`, `help`.

Card buttons (generated, not typed): `re <id> <line>`, `all <id>`, `add <id> <line>`, `grp <id> <line> <any|1..4|two>`, `var <id> <line>` (common/rare), `yrs <id> <d20|n>`, `flip <id> <line>`, `share <id>`.

## 4. Dice order (the tests rely on this)

Every random number comes from `randomInteger(n)` through `die(n)`. Order per generator:

| Generator | Dice, in order |
|---|---|
| npc | name d170; heritage d6 (then d6 if 4 to 6); looks gender d6 (repeat on 6) then grid row d6, column d6; style d37; goal row, col; method row, col; job row, col; trait, interest, quirk each d6 (tens) then d6 (units) |
| ghost | years d20 (skipped if set); trait N x d6 (N = years) and, only if N is 1, one more d6 for the column; effect row d6, col d6 |
| demon | name d17; affinity d6; aspect d6; desire row, col; feature d19 |
| horror | row, col |
| cult | god d6, d6; practice d6, d6 |
| street | mood d6; sights d6; sounds d6; smells d6; use row, col; type row, col; details row, col; props d9 then d6 |
| building | material d6; exterior d6; use row, col; details row, col; items d5 then d6 (d4 for the 4-item list) |
| score | client d4, d6; target d4, d6; work d4, d6; twist d4 then (1 to 3: d6 / 4: d3, d3, d6, d6); connected d4 then d6 (4: d6, d6); faction d4 then d6, d6 (4: two pairs) |
| rumor, occurrence | row d6, side d2 (1 is A, 2 is B) |
| overheard | d8 |
| news | row, col |

Extra rolls: gender "Roll Again" rolls the gender d6 again; "Ghost of (roll again)" rolls Client / Target again (d4, d6), up to 3 levels; a duplicate second result is re-rolled (twist: d3, d6; connected: d6; faction: d6, d6); a **+** rolls one more item (a second look is a grid cell only; a duplicate is re-rolled).

Rows labelled with ranges ("1-3", "4,5", "6", "1, 2" ...) are chosen by one d6 through the labels, then a second d6 picks the column.

## 5. Cards and state

- A card is an HTML panel posted with `sendChat(sender, '/w gm ' + html)` (or `/direct`). Buttons are `<a href="!bitdgen ...">`. No command contains a quote (enforced in `btn`).
- `state.BitDGen = { version, schema, mode, debug, nextId, cards, order }`. Cards hold their lines and items. The last 25 cards stay live; older ones answer "That card has expired. Roll again." A card with a different `schema` is dropped at start-up; `mode` and `debug` are kept.
- A re-roll reuses the card id and posts a new card.
- No timers. `sendChat` is never given a callback.
- Errors inside a command are caught, written to the API log, and whispered to the GM; nothing is stored for a failed roll.

## 6. Permissions and coexistence

- `msg.type` must be `api` and the first word must be exactly `!bitdgen` (the other scripts match their first word exactly: `!bitd`, `!bitdpe`; the crew script's prefix is not recorded).
- A non-GM gets `/w "<name>" The BitD generators are GM-only.` and nothing rolls or changes.
- Only `state.BitDGen` is touched. The only global added is `BitDGen`. The macro code creates or repairs `DUSK_ROLL` only and never touches other macros (`BLADES_TAM`, `ODDS_CALL`).
- `ensureMacro` was written from the Token Action Maker spec (macro owned by the first GM player, `visibleto` empty). The Position & Effect Tracker's own `ensureMacro` was not available to copy.

## 7. Data

`build_data.js` reads `Generator handouts.md` and writes the data block between `// BEGIN GENERATED DATA` and `// END GENERATED DATA`.

It verifies: each handout block's length and checksum against the file's own table; every table's rows and cells against its `*Table N: R rows x C columns*` line; list lengths and numbering; the exact document order; that the Style and Demon Features readings use exactly the handout's words; each spelling fix hits the expected number of places; the handoff's verified examples. `node build_data.js --check` fails if the script's data block is stale.

To refresh after the handouts change: a local session re-exports the handouts to the data file with the same method, runs `node build_data.js`, runs the tests, and redeploys. `!bitdgen check` gives a hint that a handout changed (size only).

## 8. Readings I made that the user has not explicitly confirmed

1. **Names.** "All equal, just randomly choose" was read as one pool of all 170 entries, one name per roll, with a **+** for a second. Four names appear twice in the handout (Bricks, Cross, Ring, Helles) and so come up twice as often; they were not de-duplicated. The final period of paragraphs 1 and 3 ("Zara.", "Wicker.") is dropped as list punctuation.
2. **Ghost Traits.** Highest die is the row, second highest is the column. With 1 year there is no second die, so the column is a fresh d6. Effect: with this rule about 49% of ghosts are Vile, 19% Insane, and 76% fall in the bottom row (computed exactly over d20 years).
3. **Connected to and Factions.** "Do same" was read as: roll a d4; 1 to 3 gives one result, 4 gives two.
4. **Duplicates.** Two identical results in a pair, or on a **+**, are re-rolled.
5. **Years above 100** are clamped to 100; a years number of 0 means "not given" (d20).
6. **List choice buttons** (Any, the four lists, "Two" for Twist) are kept from the mock-up and force the list for that line; a forced choice stays until "Any" or "Roll all again".

## 9. Not verified (needs the live game)

Card rendering of whispered HTML; the refresh glyph; button clicks from a whispered card; macro creation and the dropdown; message size (the Score card is about 10,400 characters; the largest card in the tests is 10,570); permissions with a real player; collision with the crew script's prefix; the `check` command's size comparison (the recorded size is URL-encoded). See `Live checklist.md`.

## 10. Files

| File | Purpose |
|---|---|
| `BitD Generators.js` | The script (the only file that goes into the game) |
| `Generator handouts.md` | Ground truth data snapshot |
| `build_data.js` | Parses the data file, verifies it, writes the data block |
| `mock_test_gen.js` | Offline test: 706 checks with forced dice. `node mock_test_gen.js "BitD Generators.js"` |
| `mutants.js` | Breaks the script in 37 places and requires the tests to fail each time |
| `Card samples.html` | The exact cards the script posts, rendered in a browser |
| `Live checklist.md` | The live test for the local session |
| `BitD Generators - Spec.md` | This file |
