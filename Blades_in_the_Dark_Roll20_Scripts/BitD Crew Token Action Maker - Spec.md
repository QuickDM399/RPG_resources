# BitD Crew Token Action Maker - Spec (v0.2.1)

Roll20 API script that builds token actions for **crew sheets** of the Evil Hat "Blades in the Dark" sheet v3.11, the companion of `BitD Token Action Maker.js` (player characters). Game 22049328, Mod Sandbox v1.5. Deep Cuts modules are per crew (`setting_dc_*`), read at click time.

Status: v0.2.1 built and tested against a mock API only. **Nothing here has been run in the live game.** See `Crew Live Test Plan.md`.

## 1. Scope

- Crew sheets only (`sheet_type` = `crew`). Every verb refuses character and faction sheets.
- The user's seven crew types: Assassins, Hawkers, Bravos, Cult, Smugglers, Vigilantes, Shadows (and `crew test`, an Assassins crew). Emcees, River and Roots are not tested. The script never touches claims text or crew-type text.
- Two rule sets, chosen per crew by `setting_dc_downtime`: **core** (off) and **Deep Cuts Downtime** (on). Advancement only changes how crew XP is ticked. Harm, Load and Action change nothing on a crew.
- The Action module is now on in the game, with `crew new` as its test crew. It changes no crew rule this script computes (it swaps three ability texts and the Informants claim text, and lets a crew roll its Tier as a Threat Roll, which is the existing Tier roll). Tests cover an all-modules-on crew and an Action-only crew.
- Decided against by the user: automating Patron, High Society, Fiends, Accord, Crow's Veil and Emberdeath.
- Not built: Tier advancement (upgrade and cohort counts are ambiguous on this sheet; Tier is a plus/minus counter), Contacts, Upgrades and Claims menus, a bank ledger. A core-rules Payoff walk-through was dropped at the user's request (not needed).

## 2. Token actions (built by `~ Rebuild`, marker `bitd-crew-tam`)

| Button | What it does |
|---|---|
| `1. Roll` | Prompts: Roll (Tier, Entanglement [core only], one entry per cohort), Bonus dice. Script composes the sheet's `blades` card. Pools: Tier = `crew_tier`; Entanglement = Wanted track; cohort = `crew_tier` minus `impaired`, plus 1 if `elite` or `expert` (sheet rule `calculateCohortDice`). Pool 0 or less = 2d6, take the lowest. |
| `2. Engagement` | The sheet's own Engagement macro (number-of-dice prompt). |
| `3. Fortune` | The sheet's own crew Fortune macro. |
| `4. Score` | Core: 5 prompts, applies Heat. Deep Cuts: 7 prompts (the last is the PC count: "All party members" or 1 to 8), applies Heat and Rep, starts a Downtime, walks the Payoff with buttons, then offers Heat and Hold. |
| `5. Abilities` | Ticked crew abilities only, each a button running the sheet's own `Show` card. |
| `6. Adjust` | Heat, Wanted, Incarceration, Rep, Turf, Coin, Tier, Hold, Mark crew XP; with Downtime on also Assess hold, Reduce Heat (Coin or Rep), Debt clock, **Downtime: Heat and Hold** and **Downtime: start a new Downtime**. |
| `7. Clocks` | Menu of named crew clocks with -1, +1 and the sheet's Show button. |
| `8. Status` | Heat, Wanted, Rep, Turf, Tier, Hold, Coin and vault room, XP or advancement clocks, Debt clock, crew clocks, cohorts. |
| `~ Rebuild` | `!bitdcrew setup` on the selected tokens; GM any crew, players only crews they control. Links token bar 1 to `heat` (max 9, shown to and editable by players). |

Token action text depends on the crew's modules and cohorts at Rebuild time. A stale Score action (answer count does not match the module) is refused with "Run ~ Rebuild". Cohort names are copied at Rebuild (commas and brackets removed).

## 3. Rules and where they come from

"Core" = `bladesinthedark_v8_2` (page numbers from the book's contents and cross-references; the text file has no page markers). "DC" = Deep Cuts v1.0 (book page numbers). Confirmed by the user in the design chat.

| # | Rule the script applies | Book wording |
|---|---|---|
| R1 | Heat reaching 9: Wanted +1, Heat clears, the excess rolls over. Fires on token-bar or sheet edits and on every button. Several fills in one go give several levels (user confirmed). At the highest level no level is added, Heat still clears, and the card says so (user confirmed). | Core Heat p147: "When your heat level reaches 9, you gain a wanted level and clear your heat (any excess heat 'rolls over,' so if your heat was 7 and you took 4 heat, you'd reset with 2 heat marked)." Deep Cuts never restates this; the user confirmed it still applies with Downtime on. |
| R1b | With Downtime on, the Wanted card adds the Bluecoats line, the buy-off cost and a Mark crew XP button. | DC p82: "When the crew gains a wanted level, mark crew xp and pick Bluecoats as the entanglement." Bluecoats table 0 to 4 and "Bluecoats can be bought off for Coin equal to your wanted level +4." |
| R2 core | Score Heat: exposure 0/2/4/6, +1 high-profile or well-connected target, +1 hostile turf, +1 at war, +2 killing. | Core Heat p147. |
| R2 DC | Score Heat: base 0 or 2 **plus crew Tier**, target +2, chaos +2 (combat, destruction, mayhem) and +2 at war, death +4, witnesses +2 or +4. | DC p80, Fallout table. |
| R2b | Rep gained = 1 per 2 Heat generated (rounded down, user confirmed), +1 per Tier of the target above the crew's Tier. Applied to `rep`, capped at 12. | DC p81, Payoff. |
| R2c | Payoff = 1 Coin per PC (the table chooses "All party members", counted from Roll20's Party flag at click time, or a number 1 to 8, because not every PC is on every score) plus 3 x the target's Tier. Seized assets: +4 Coin for a load of cash; valuables fenced for 2, 4, 6 or 8 Coin cost 1 Heat per 4 Coin of value. Tithe at Tier 2 or lower: 1 Coin per 4 Coin earned (rounded down). Coin is applied only by the deposit buttons: all, half or none to the crew, up to its vault room (4 on hand plus vaults: standard 4/8/16, Deep Cuts 4/12/24 from the sheet's own vault text). The rest is "PC stashes or a bank, record by hand". | DC p81, Payoff, Tithe, Vaults & Banks. |
| R11 | **Just Passing Through** (Downtime on): "During Downtime, take -1 Heat." Heat and Hold button, once per Downtime, offered only when Heat is above 0. Status shows whether its +1d (Heat 4 or less) is active. | Core book, Smugglers (unchanged by Deep Cuts). Once per Downtime is the user's approved reading. |
| R12 | **No Traces, Rep half** (Downtime on): End Downtime gives +1 Rep when Heat is exactly 0 at that moment. The Heat half (-1 to Heat taken) was built in v0.1.0. | DC p88: "When you end downtime with zero Heat, take +1 Rep." |
| R13 | **Leverage**: +1 Rep on every Rep gain the script makes (the Score, No Traces at End Downtime), never on a gain of 0, never on a manual Adjust. | Sheet and core book: "Whenever you gain rep, gain +1 rep." |
| R14 | **Misdirection**: after a Score's Rep is applied, a button gives up half the Rep **earned**, rounded down (user confirmed), once per Score. "Earned" is the figure the Fallout card shows (Rep from Heat and target Tier, plus Leverage's +1), even when part of it did not fit under 12 (v0.2.1, user chose this over "half of what fit" after a live test where Rep was already at the top). The button costs real Rep, so a full track is no exploit. The card always says why the offer is missing: half of the Rep earned rounds down to 0, or the row is on the sheet but not ticked. A crew with no Misdirection row hears nothing. The final "Score recorded" line says "Rep +N earned, M fit on the track" when they differ. The Status change is not tracked. | Sheet wording (the core book has no Vigilantes text): "sacrifice half the rep gained to make another faction lose status with your target instead of your crew". |
| R15 | **Downtime ledger**: one record per crew in `state.BitDCrewTAM.downtime`, started by a Deep Cuts Score or Adjust > Downtime: start a new Downtime, closed by End Downtime. Each Heat and Hold button carries its id. | User-approved design. |
| R3 | Entanglement roll (core only): after the script posts the roll, it reads the dice and whispers the table result. Column by the Heat when rolled (0-3, 4/5, 6+), row by the highest die (lowest for zero dice): 1-3, 4/5, 6. | Core Entanglements p150. Deep Cuts has no entanglement roll (p82), so the option is not offered with Downtime on. |
| R4 | Incarceration (Adjust): Wanted -1 (floor 0), Heat cleared. | Core Incarceration p148. |
| R5 | Crew XP tracker full with **both** Deep Cuts modules off: reminder card only, with a Clear button. | Core Crew Advancement (about p48): "When you fill your crew advancement tracker, clear the marks and take a new special ability or mark two crew upgrade boxes." "each PC gets stash equal to the crew Tier+2". Not shown with Downtime on (DC p78 footnote and p83: other upgrades cost Coin there). |
| R6 | With Downtime on: Reduce Heat by 1 for each Coin or Rep spent (Adjust entries). | DC p84, Reduce Heat. |
| R7 | With Downtime on: Assess hold = strong if turf claims are at least the Tier, else weak. Uses the `turf` boxes; Status notes a mismatch with ticked Turf claims (user: they should be equal). | DC p84, Assess Hold. |
| R8 | With Downtime on: ticked **No Traces** takes 1 off the score's Heat; ticked **Slippery** shows effective Wanted one lower (and uses it for the Bluecoats line). | DC p88. |
| R9 | Wanted track: `wanted` (0-4); `wantedDC` (0-5) when the crew's 5th Wanted box setting is on (the user adds it for crews with Slippery). | DC p88 ("and may go up to 5"); sheet markup. |
| R10 | Crew XP: `crew_xp` (0-10), or with Advancement on the first unfilled of four clocks `dc_crew_xpclock_1..4` (size `dc_xp_clocksize`). | DC p78. |

Judgement calls made without a book sentence: rounding Rep down; applying Heat to the track again for each extra fill; single choice for seized assets (cash or one fenced amount); a tithe that is not paid just moves on (the book says ask the GM about debt, a favor or lost patience); Deep Cuts' bank rules are shown as a reminder only.

## 4. Command grammar

`!bitdcrew <verb> [args] [--c <charId>] [--row <rowId>] [--idx <flowId>] [--n <step>]`. Verbs: `setup`, `roll`, `abilities`, `clocks`, `clock`, `adj`, `score`, `seized`, `tithe`, `deposit`, `misdirect`, `hh`, `hhact`, `status`, and two GM tools, `party` and `debug on|off`. The character comes from `--c`, else the first selected token. GM: any crew. Player: only crews whose `controlledby` includes them or `all`. All numeric writes are clamped to the sheet's range. Payoff buttons carry a flow id kept in `state.BitDCrewTAM.flows` (last 40); each step applies once.

## 4b. Party link (probe only)

Roll20's "Party member" flag is read as the character's `tags` containing `_roll20_internal_party_tag_` (array, JSON text or plain text). This comes from a Roll20 forum thread; **it has not been checked against the live game**. `!bitdcrew party` (GM only) lists the party members the script sees, with their sheet types, and the raw tags it can read, so it can be verified first. The only current use is the Score's "All party members" PC count. Planned for later (not built): the crew sheet marked as a party member is the active crew, and its bonuses apply to the party's player characters.

## 5. Coexistence with `BitD Token Action Maker.js`

| | PC script | Crew script |
|---|---|---|
| Command | `!bitd` | `!bitdcrew` |
| Top-level variable | `BitDTAM` | `BitDCrewTAM` |
| State key | `BitDTAM` | `BitDCrewTAM` |
| Ability marker | `bitd-tam` | `bitd-crew-tam` |
| Global macro | `BLADES_TAM` | `CREW_TAM` |
| Sheets | `character` | `crew` |

The PC script's text fixer owns `upgrade_vault_description`, the four training upgrade descriptions, the Mastery description, the Informants claim description and seven crew ability descriptions. The crew script never writes any `*_description`, `claim_N_desc` or `claim_N_name`, and the tests check that on a crew sheet. Both scripts react to `change:attribute:current` and bar events; each acts only on its own attribute (`stress` or `heat`) and sheet type.

## 6. Sheet facts used (verified against `blades.html` v3.11)

`heat` 0-9, `wanted` 0-4, `wantedDC` 0-5, `setting_wanted_5th`, `rep` 0-12, `turf` 0-6, `hold` weak/strong, `crew_tier` 0-4 (a checkbox group acting as a radio), `crew_xp` 0-10, `dc_crew_xpclock_1..4`, `dc_xp_clocksize`, `crewcoin` 0-16 and `crewcoin_dc` 0-24 (module-dependent; the sheet copies between them only when the toggle changes), `crew_debt_dc` and `crew_debt_dc_max`, `upgrade_vault_check_1/2`, repeating `crewability` (`name`, `check`, `Show`), `crewclock` (`name`, `size`, `progress`, `Show`), `cohort` and `cohort1_*` (`name`, `type`, `subtype`, `verb`, `impaired`). Roll templates `blades` and `bitd-broadcast`; translation keys used are checked against `translation.json` by the tests.

## 7. Files and how to run the tests

- `BitD Crew Token Action Maker.js` - the script (ES5, one IIFE, ASCII only).
- `crew_mock_test.js` - `node crew_mock_test.js "BitD Crew Token Action Maker.js" translation.json "BitD Token Action Maker.js"` (the third argument loads the PC script too for the coexistence tests).
- `crew_mutation_check.js` - same arguments; breaks the script in 73 places and requires the tests to fail each time.
- `Crew Live Test Plan.md` - what to click in the live game.
