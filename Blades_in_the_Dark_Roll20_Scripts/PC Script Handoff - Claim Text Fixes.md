# Handoff for the PC script session: correct the crew claim wording to the Deep Cuts crew sheets (v1.2b)

**For:** the session that maintains `BitD Token Action Maker.js` (v0.3.2). **Self-contained:** you do not need the crew script session. Approved by Rich on 2026-10-10: extend the PC script's existing text fixer (`!bitd fixtext`, the `FIXES` table); fix **all 30 claim rows**; switch Hagfish Farm, Infirmary and Sacred Nexus on the **Downtime** module; everything else always.

## 1. Why

The Roll20 sheet (v3.11) keeps older wording on some crew claim tiles than the printed Deep Cuts crew sheets (`BitD_Deep_Cuts_Sheets_v1_2b.pdf`). Rich wants the script to correct the text on the sheet itself, including when a Deep Cuts module is switched on or off. The PC script already has this mechanism for the Informants claim, seven crew abilities and six upgrades (in v0.2.0: `FIXES`, `planFix`, `fixCharacter`, `scheduleFix`, `FIX_WATCH`, `!bitd fixtext [check|undo]`). `!bitd fixtext check` printed "Would change 0 texts / Every text already matches the book" on Rich's game, so the existing fixes work and the claims below are simply not in the table. **Please read your v0.3.2 `FIXES` code first: this brief describes the v0.2.0 shape.**

## 2. What to add

**20 table rows covering 30 claim tiles on the six core crews.** Claims are matched by the claim name on the sheet (`claim_N_name`, any slot) and the wording is written to `claim_N_desc`, exactly as the Informants row does.

| Claim | Crews (tiles) | Crew filter | Sheet wording today (`std`) | Deep Cuts crew sheet wording (`book`) | Switch |
|---|---|---|---|---|---|
| Vice Den | assassins, cult, hawkers, smugglers | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Hagfish Farm | assassins, shadows | any | `Body disposal,\n+1d to reduce heat\nafter killing` | `Body disposal +\ncounts as turf` | Downtime module (put the sheet wording back when off) |
| Victim Trophies | assassins | any | `+1 rep per score` | `+1 Rep per score` | always |
| Cover Operation | assassins, hawkers, smugglers | any | `-2 heat per score` | `-2 Heat per score` | always |
| Protection Racket | assassins, bravos | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Infirmary | assassins, bravos, shadows | any | `+1d to healing\nrolls` | `+1 tick to healing\nclock in downtime` | Downtime module (put the sheet wording back when off) |
| Cover Identities | assassins | assassins | `+1d engagement\nfor deception and\ntransport plans` | `+1d engagement for\ndeception / social plans` | always |
| Barracks | bravos | any | `+1 scale for your\nThugs cohorts` | `+1 scale for your\nThug cohorts` | always |
| Fighting Pits | bravos | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Bluecoat Intimidation | bravos | any | `-2 heat per score` | `-2 Heat per score` | always |
| Cloister | cult | any | `+1 scale for your\nAdepts cohorts` | `+1 scale for your\nAdept cohorts` | always |
| Ancient Obelisk | cult | any | `-1 stress cost for\nall arcane powers\nand rituals` | `-1 Stress cost for\narcane powers &\nrituals` | always |
| Ancient Gate | cult, smugglers | any | `Safe passage in\nthe Deathlands` | `Safe passage in the\ndeathlands` | always |
| Sacred Nexus | cult | any | `+1d to healing\nrolls` | `+1 tick to healing clock\nin downtime` | Downtime module (put the sheet wording back when off) |
| Foreign Market | hawkers | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Surplus Caches | hawkers | any | `+2 coin for product\nsale or supply` | `+2 coin for\nsale or supply` | always |
| Cover Identities | hawkers | hawkers | `+1d engagement\nfor deception and\ntransport plans` | `+1d engagement\nfor deception or\ntransport plans` | always |
| Gambling Den | shadows | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Drug Den | shadows | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |
| Side Business | smugglers | any | `(Tier roll) - Heat =\ncoin in downtime` | `(Tier roll) - Heat =\nCoin in downtime` | always |

`\n` is a line break; the PDF's tile line breaks are kept, as the sheet's own Deep Cuts claim texts do. Comparison ignores whitespace (`norm`), so only the written text needs the breaks.

Suggested `FIXES` rows in the v0.2.0 shape (adapt to v0.3.2):

```js
  { id: "claim_vice_den", label: "Vice Den claim", kind: "claim", name: "Vice Den", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_hagfish_farm", label: "Hagfish Farm claim", kind: "claim", name: "Hagfish Farm", mods: ["downtime"], std: "Body disposal,\n+1d to reduce heat\nafter killing", sheet: [], book: "Body disposal +\ncounts as turf" },
  { id: "claim_victim_trophies", label: "Victim Trophies claim", kind: "claim", name: "Victim Trophies", mods: null, std: "+1 rep per score", sheet: [], book: "+1 Rep per score" },
  { id: "claim_cover_operation", label: "Cover Operation claim", kind: "claim", name: "Cover Operation", mods: null, std: "-2 heat per score", sheet: [], book: "-2 Heat per score" },
  { id: "claim_protection_racket", label: "Protection Racket claim", kind: "claim", name: "Protection Racket", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_infirmary", label: "Infirmary claim", kind: "claim", name: "Infirmary", mods: ["downtime"], std: "+1d to healing\nrolls", sheet: [], book: "+1 tick to healing\nclock in downtime" },
  { id: "claim_cover_identities_assassins", label: "Cover Identities claim (assassins)", kind: "claim", name: "Cover Identities", crew: "assassins", mods: null, std: "+1d engagement\nfor deception and\ntransport plans", sheet: [], book: "+1d engagement for\ndeception / social plans" },
  { id: "claim_barracks", label: "Barracks claim", kind: "claim", name: "Barracks", mods: null, std: "+1 scale for your\nThugs cohorts", sheet: [], book: "+1 scale for your\nThug cohorts" },
  { id: "claim_fighting_pits", label: "Fighting Pits claim", kind: "claim", name: "Fighting Pits", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_bluecoat_intimidation", label: "Bluecoat Intimidation claim", kind: "claim", name: "Bluecoat Intimidation", mods: null, std: "-2 heat per score", sheet: [], book: "-2 Heat per score" },
  { id: "claim_cloister", label: "Cloister claim", kind: "claim", name: "Cloister", mods: null, std: "+1 scale for your\nAdepts cohorts", sheet: [], book: "+1 scale for your\nAdept cohorts" },
  { id: "claim_ancient_obelisk", label: "Ancient Obelisk claim", kind: "claim", name: "Ancient Obelisk", mods: null, std: "-1 stress cost for\nall arcane powers\nand rituals", sheet: [], book: "-1 Stress cost for\narcane powers &\nrituals" },
  { id: "claim_ancient_gate", label: "Ancient Gate claim", kind: "claim", name: "Ancient Gate", mods: null, std: "Safe passage in\nthe Deathlands", sheet: [], book: "Safe passage in the\ndeathlands" },
  { id: "claim_sacred_nexus", label: "Sacred Nexus claim", kind: "claim", name: "Sacred Nexus", mods: ["downtime"], std: "+1d to healing\nrolls", sheet: [], book: "+1 tick to healing clock\nin downtime" },
  { id: "claim_foreign_market", label: "Foreign Market claim", kind: "claim", name: "Foreign Market", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_surplus_caches", label: "Surplus Caches claim", kind: "claim", name: "Surplus Caches", mods: null, std: "+2 coin for product\nsale or supply", sheet: [], book: "+2 coin for\nsale or supply" },
  { id: "claim_cover_identities_hawkers", label: "Cover Identities claim (hawkers)", kind: "claim", name: "Cover Identities", crew: "hawkers", mods: null, std: "+1d engagement\nfor deception and\ntransport plans", sheet: [], book: "+1d engagement\nfor deception or\ntransport plans" },
  { id: "claim_gambling_den", label: "Gambling Den claim", kind: "claim", name: "Gambling Den", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_drug_den", label: "Drug Den claim", kind: "claim", name: "Drug Den", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
  { id: "claim_side_business", label: "Side Business claim", kind: "claim", name: "Side Business", mods: null, std: "(Tier roll) - Heat =\ncoin in downtime", sheet: [], book: "(Tier roll) - Heat =\nCoin in downtime" },
```

## 3. One extension the table needs

**A crew filter.** Cover Identities has the same sheet wording on Assassins and Hawkers but different correct wording (Assassins: deception / social; Hawkers: deception or transport; Rich's ruling, Hawkers correct as printed). Add an optional `crew` field to a row: the row applies only to a crew sheet whose `crew_type` text contains that stem (case-insensitive; `assassins`, `hawkers`). A crew sheet with no `crew_type` is left alone for filtered rows (no guessing). The crew script matches `crew_type` the same way (stems `assassin`, `bravo`, `cult`, `hawker`, `shadow`, `smuggler`, `vigilante`; the crew type is free text, for example "The Red Sashes (Hawkers)").

## 4. Behaviour to keep (already the fixer's design)

- Rewrite a tile only when its text equals the sheet's known wording (`std`) or the new wording; anything else is "left alone (edited by hand)".
- Module **on**: write `book`. Module **off**: write `std` back (`put back`), for the three Downtime rows. Always-rows (`mods: null`) are rewritten to `book` and never put back.
- Triggers: module toggles, `crew_type` change, the sheet writing a claim name or description, `!bitd fixtext`; `check` is a dry run; `undo` restores from the log.
- Do not touch Informants, Warehouse or Warehouses: the sheet swaps those itself, and Informants is already in the table.
- The crew script (`BitD Crew Token Action Maker.js`) only reads these tiles (its `6b. Claims` card shows them as "On the sheet:") and writes none of them; its tests forbid a write to any claim text. Do not move any of these fixes into it.

## 5. Tests to add (in the PC script's own mock test)

- Each row: the wording is rewritten when its switch is on, put back when off (Downtime rows), untouched when hand-edited, ignored on a sheet that lacks the claim, found in any slot (1 to 15), and a second run changes nothing.
- Cover Identities: an Assassins sheet gets the Assassins wording, a Hawkers sheet the Hawkers wording, a sheet with no `crew_type` and a sheet of another crew type are left alone.
- Hagfish Farm, Infirmary, Sacred Nexus: Downtime module on gives `book`; toggling it off gives `std`; Action or Harm alone changes nothing.
- The income claims: `coin` becomes `Coin` once and a second run is quiet.
- Existing fixes still pass. Mutation-check the new rows if the PC script has a mutation file.

## 6. Live check for Rich

1. `!bitd fixtext check` on a Deep Cuts crew: it lists the claim tiles it would change (Downtime off: the 24 tiles of the 17 always-rows; Downtime on: the 6 Hagfish Farm, Infirmary and Sacred Nexus tiles as well).
2. Run `!bitd fixtext`, open the crew sheet, compare the tiles with the PDF.
3. Toggle the Downtime module off and on: Infirmary, Sacred Nexus and Hagfish Farm flip between the sheet wording and the PDF wording within a couple of seconds, and a GM line says what was corrected.
4. `!bitd fixtext undo`: the tiles go back.
5. Open `6b. Claims` in the crew script: "On the sheet:" shows the corrected text.
