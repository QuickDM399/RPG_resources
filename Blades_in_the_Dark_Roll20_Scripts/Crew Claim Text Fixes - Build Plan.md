# Correcting the claim wording on the sheet to match the Deep Cuts crew sheets (proposal)

**Status: approved (2026-10-10). Decisions: extend the PC script's fixer, all 30 rows, Downtime switch for Hagfish Farm, Infirmary and Sacred Nexus, everything else always. `!bitd fixtext check` printed "Every text already matches the book", so the existing fixes work. The work is done by the PC script's own session from `PC Script Handoff - Claim Text Fixes.md` (PC script v0.3.2); nothing in the crew script changes.** The proposal as first written follows. (The three rulings you just gave are built in the crew script v0.9.3; see `Deep Cuts Sheets v1.2b - Script Check.md`.) Source for every new wording below: `BitD_Deep_Cuts_Sheets_v1_2b.pdf`, crew pages.

## 1. Bottom line

- **The mechanism you describe already exists, in the PC script** (`BitD Token Action Maker.js`, v0.2.0): the text fixer. It rewrites sheet wording to the Deep Cuts wording when a Deep Cuts module is switched on, puts the sheet's own wording back when it is switched off, watches the module checkboxes, the crew type and the claim boxes, and has `!bitd fixtext check` (dry run) and `!bitd fixtext undo`. It only rewrites text that equals a wording the sheet is known to ship, so anything you typed yourself is never touched.
- **It covers one claim today: Informants.** It also covers seven crew abilities (Crow's Veil, Emberdeath, Conviction, High Society, Pack Rats, All Hands, Reavers) and six upgrades (Vault, the four Training upgrades, Mastery). Every other claim is outside it, which fits what you saw: switching on a module does not correct Infirmary, Hagfish Farm and the rest.
- **I recommend adding the claims to that table, not writing a second fixer in the crew script.** Two scripts writing the same text attribute would fight each other, and the crew script is deliberately read-only (its tests forbid a write to any text the fixer owns). The change is data rows plus one small extension: a crew-type filter, because Cover Identities is worded differently for Assassins and Hawkers.
- **Cost:** the PC script is not in your repository folder. I would return the whole updated file, based on the v0.2.0 copy you uploaded (64,464 characters), and you paste it over the live one.

## 2. Why the Informants claim may still not have changed for you

I cannot tell from here. Three possibilities: the live PC script is not the v0.2.0 I have; the sheet's own worker rewrote the text after the fixer ran (the fixer waits 1.5 seconds and also reacts to the sheet's own write); or you were looking at a claim the table does not cover. **Please run `!bitd fixtext check` on a Deep Cuts crew and paste what it prints.** "Every text already matches the book" with Informants still wrong would be a bug I need to find first.

## 3. What would change: 30 claim rows across the six crews

The sheet text I compare is the sheet's own (`translation.json`, sheet v3.11) against the PDF, case and all. Line breaks follow the PDF tile layout, the way the sheet's own Deep Cuts claim texts are written.

### 3a. Wording changes (12 rows)

| Claim (crews) | Sheet today | PDF v1.2b | Switch |
|---|---|---|---|
| Hagfish Farm (Assassins, Shadows) | Body disposal, +1d to reduce heat after killing | `Body disposal +` / `counts as turf` | Downtime module (decision 3) |
| Infirmary (Assassins, Bravos, Shadows) | +1d to healing rolls | `+1 tick to healing` / `clock in downtime` | Downtime module (Deep Cuts p88) |
| Sacred Nexus (Cult) | +1d to healing rolls | `+1 tick to healing clock` / `in downtime` | Downtime module (Deep Cuts p88) |
| Cover Identities (Assassins) | +1d engagement for deception and transport plans | `+1d engagement for` / `deception / social plans` | always (a correction) |
| Cover Identities (Hawkers) | +1d engagement for deception and transport plans | `+1d engagement` / `for deception or` / `transport plans` | always (your ruling) |
| Barracks (Bravos) | +1 scale for your Thugs cohorts | `+1 scale for your` / `Thug cohorts` | always |
| Cloister (Cult) | +1 scale for your Adepts cohorts | `+1 scale for your` / `Adept cohorts` | always |
| Ancient Obelisk (Cult) | -1 stress cost for all arcane powers and rituals | `-1 Stress cost for` / `arcane powers &` / `rituals` | always |
| Surplus Caches (Hawkers) | +2 coin for product sale or supply | `+2 coin for` / `sale or supply` | always |

(Hagfish Farm sits on two crews and Infirmary on three, which is how the 9 lines above give 12 rows on the sheets.)

### 3b. Capitalization only (18 rows)

The PDF capitalizes game terms the sheet leaves in lower case: `coin` becomes `Coin` in the seven income claims (Vice Den on four crews, Protection Racket on two, Fighting Pits, Foreign Market, Gambling Den, Drug Den, Side Business: 11 rows), `rep` becomes `Rep` (Victim Trophies), `heat` becomes `Heat` (Cover Operation on three crews, Bluecoat Intimidation: 4 rows), and `Deathlands` becomes `deathlands` (Ancient Gate on Cult and Smugglers: 2 rows). No meaning changes.

### 3c. Already right, nothing to add

Informants (the fixer has it), Warehouse and Warehouses (the sheet swaps its own text with the Downtime module and it equals the PDF), and every other claim on the six crews.

## 4. How it would work

- **New rows in the existing `FIXES` table**, `kind: "claim"`, each with the sheet's wording (`std`), the PDF wording (`book`) and its module list. A claim is found by its name on the sheet, so Hagfish Farm in any slot is found.
- **A crew filter:** a row can name a crew type (matched on the `crew_type` stem, as the crew script does), so Cover Identities gets two rows.
- **Module on:** the row is rewritten to the PDF wording. **Module off:** the sheet's own wording is put back (Infirmary, Sacred Nexus, Hagfish Farm). Rows with no module are rewritten once and stay.
- **Triggers:** the existing ones: a module toggle, a crew type change, a write by the sheet to a claim, and `!bitd fixtext`. The GM sees one line, "corrected sheet text on <crew>: ...", as now.
- **Safety, as today:** text you edited by hand is left alone and listed as "left alone"; `!bitd fixtext undo` restores what the log holds.
- **The crew script stays read-only.** Its `6b. Claims` card already shows the Deep Cuts rule and "On the sheet:", so after the fix both agree.

## 5. Tests I would write (in the PC script's mock test, which I have)

- Each new row: the sheet wording is rewritten when the switch is on, put back when off, left alone when hand-edited, untouched on a crew of another type, written to the claim in whatever slot it sits.
- Cover Identities: Assassins and Hawkers get different wording; a typeless crew is left alone (no guess).
- The existing fixes still pass; mutation checks for the new rows.

## 6. Risks

1. **The sheet's own worker** rewrites Warehouses and Informants text on a toggle; the fixer already waits and re-checks, and no new row is one the sheet swaps itself.
2. **Line breaks:** the tile is narrow, so I copy the PDF's breaks. If a tile looks cramped in Roll20 I adjust.
3. **Your live PC script** may differ from the v0.2.0 I have. If you have edited it, tell me before I send a whole file, and I will give you the new rows to paste into `FIXES` instead.

## 7. Decisions I need

1. **Where:** extend the PC script's fixer (my recommendation), or build a separate one in the crew script?
2. **Scope:** all 30 rows (the sheet then matches the PDF exactly, my recommendation, since the fixer cannot touch hand-edited text), or only the 12 wording rows?
3. **Switch for Hagfish Farm, Infirmary and Sacred Nexus:** the Downtime module, with the sheet wording put back when it is off. The PDF names no module for Hagfish Farm; I chose Downtime because that is where turf and hold are used. Agree?
4. **Run `!bitd fixtext check` and paste the result**, and tell me whether your live PC script is still v0.2.0 and unedited.
