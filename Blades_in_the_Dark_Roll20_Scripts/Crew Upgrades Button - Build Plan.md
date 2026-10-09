# Crew Script: `6c. Crew Upgrades` and the button renames (proposal for v0.9.0)

**Status: approved, then built as v0.9.0 (mock tested; nothing run in the live game).** Every crew needs `~ Rebuild`. Where the answers below differ from the proposal, the answers win. The proposal as first written follows.

## 0. Answers and what was built

| Decision | Answer | In v0.9.0 |
|---|---|---|
| 1. Special label | "crew type not name" | "Bravos Special" from the crew type text; "Crew Special" if blank |
| 2. Text for the specials | Yes | Core book text plus the sheet name, "No book text" for the crews the book lacks |
| 3. "Taken" rules | **Changed:** "multiple indicators in carriage, boat etc. that have 2 unlinked boxes"; Hardened and Mastery count only when all boxes are filled | **One circle per box** on every upgrade, in sheet order, so the two unlinked boxes of Carriage, Boat, Secure and Vault each show. The partial circle (half-filled) is gone: "in progress" is stated in the card header instead. Hardened-type upgrades and Mastery count only with every box. Carriage, Boat, Secure and Vault still count as taken from either box (inference: the sheet text says the second box improves the first; say so if you want both boxes required) |
| 4. Deep Cuts lines | Yes | Training and Mastery (p88), Vault (p88), Workshop (p87), cost (p83) |
| 5. Quality rule | Yes | On every Quality card |
| 6. Visibility | Yes | Whispered menus, public upgrade card |

The button renames are done: `6a. Contacts`, `6b. Claims`, `6c. Crew Upgrades`. The four rulings in `Deep Cuts Sheets v1.2b - Script Check.md` are still open; nothing in v0.9.0 depends on them.

---

# Proposal (as written before the answers)

Status at that time: **proposal for approval. No code had been touched.** Rules text is from your core book (`bladesinthedark_v8_2`), Deep Cuts Part Two, or the Roll20 sheet; each row says which. Where I am inferring, it says so. If this is approved it ships as v0.9.0 and every crew needs `~ Rebuild`.

## 1. Bottom line

- **Renames:** `6b. Contacts` becomes `6a. Contacts`, `6c. Claims` becomes `6b. Claims`, and the new button is `6c. Crew Upgrades`. The bar sorts character by character, so `6.`, `6a.`, `6b.`, `6c.`, `7.` stay in order. A Downtime crew gets 13 token actions, a core crew 12 (gap at 5 as now).
- **Three levels of cards**, the same pattern as Contacts and Claims: a whispered category card, a whispered list for the category you pick, and a public card for the upgrade you pick.
- **One thing differs from what you described.** On this sheet the drop-down under a crew-special upgrade (Hardened, Assassin Rigging and so on) is **empty**. The sheet fills in only the name, and a few names carry a short effect in brackets, for example "Hardened (+1 trauma box)". The Lair, Training and Quality upgrades do have drop-down text. So for the specials I propose showing the core-book text for that upgrade, word for word, as well as the sheet name. Section 4 lists the texts for your approval. This is inference from the sheet's source code, not something I have seen on a live sheet, so the live test checks it.

## 2. What the player sees

**Card 1** (whisper), title "Crew upgrades":

> [Bravos Special] [Lair] [Training] [Quality]
> Bravos Special: 2 of 5 taken. Lair: 3 of 7. Training: 2 of 5. Quality: 0 of 6.

**Card 2** (whisper), for example Lair:

> [● Carriage 2/2] [○ Boat 0/2] [● Hidden 1/1] [○ Quarters 0/1] [● Secure 1/2] [○ Vault 0/2] [○ Workshop 0/1]
> ● taken, ◐ some boxes marked (not complete yet), ○ not taken. The number is boxes marked of boxes available.

**Card 3** (public, posted as the clicking player), for example Vault with one box marked on a Downtime crew:

> **Upgrade taken** (header) / **● Vault** (title)
> Boxes marked: 1 of 2. First level taken.
> Cost (Deep Cuts, Development): 10 coin per box.
> On the sheet: Your lair has a secure vault, increasing your storage capacity for coin to 8. A second upgrade increases your capacity to 16. A separate part of your vault can be used as a holding cell.
> Rule in force (Deep Cuts, Downtime module): Vaults are bigger: the first holds 8 Coin, the second holds 12.
> Core book: (the sheet text above)

Headers read "Upgrade taken", "Upgrade not taken" or "Upgrade in progress" (some boxes marked, not complete).

## 3. The sheet's data (checked in the sheet source, v3.11)

| Category | Where it lives | Items, in sheet order | Boxes |
|---|---|---|---|
| **Special** | Repeating section `repeating_upgrade`: `name`, `check_1` to `check_3`, `numboxes`, `cost`, `description` | The five or six rows the sheet fills in when you pick a crew type, plus any row you add | 1, or 3 for the stress and trauma upgrade (Hardened, Ordained, Composed, Steady, Sustained, Calm, Unbroken) |
| **Lair** | `upgrade_<key>_name`, `_check_N`, `_description` | Carriage 2, Boat 2, Hidden 1, Quarters 1, Secure 2, Vault 2, Workshop 1 | as listed |
| **Training** | same | Insight, Prowess, Resolve, Personal (1 each), Mastery (4) | as listed |
| **Quality** | same | Documents, Gear, Implements, Supplies, Tools, Weapons (1 each) | 1 |

- **Smugglers:** the sheet renames Carriage and Boat to "Vehicle" (a translation key), so the Lair list shows two Vehicle rows, as the PDF does. The key form is cleaned to a readable name.
- **Cohorts and Elite cohort upgrades** are not in the four categories. The cohort columns hold them.
- The `[Crew Name] Special` label uses the crew type text on the sheet (decision 1).

## 4. Rules text, for your approval

### 4a. Lair, Training, Quality

- **Main text: the sheet's drop-down, word for word**, read from the sheet at click time. If the sheet returns nothing for an upgrade you have never edited, I fall back to a copy of the sheet's own text kept in the script (the 18 texts are in the sheet's translation file). Debug lines will say which one was used.
- **Deep Cuts lines, shown only for a crew with the Downtime module on, as "Rule in force"** (the same layout the claim cards use):

| Applies to | Deep Cuts text | Source |
|---|---|---|
| Insight, Prowess, Resolve, Personal | "Training Upgrades: You always have access to a veteran instructor (Quality rating 3) in that area of expertise. Mastery gives you a Quality 4 instructor (and unlocks rating 4 actions). When you advance with one of these instructors, mark crew xp." | Deep Cuts p88 |
| Mastery | the same text | Deep Cuts p88 |
| Vault | "Vaults are bigger: the first holds 8 Coin, the second holds 12." | Deep Cuts p88 |
| Workshop | "Add +1 tick if you have a workshop and/or other special advantages." (long-term project clock, Work) | Deep Cuts p87 |
| Cost line, every upgrade | "Lair Upgrade, Quality, or Training: 10 coin. Mastery: 10 coin per box." | Deep Cuts p83 |

- Quality cards also carry the core book's general Quality rule as an extra line: "Each upgrade improves the quality rating of all the PCs' items of that type, beyond the quality established by the crew's Tier and fine items." (optional, decision 5).

### 4b. Crew specials (core book, each crew's "UPGRADES" list, word for word)

| Upgrade | Core book text |
|---|---|
| Assassin Rigging | You get 2 free load worth of weapon or gear items. For example, you could carry a pistol (a weapon) and burglary tools (gear) for zero load. |
| Bravos Rigging | You get 2 free load worth of weapon or armor items. For example, you could carry a sword & pistol or wear normal armor for zero load. |
| Cult Rigging | You get 2 free load worth of document or implement items. For example, you could carry a profane book of curses and a demon's hand for zero load. |
| Hawker Rigging | One carried item is concealed and has no load. For example, you could carry a load of drugs or a weapon, perfectly concealed, for zero load. |
| Thief Rigging | You get 2 free load worth of tool or gear items. For example, you could carry burglary gear and tinkering tools for zero load. |
| Smuggler Rigging | Two of your carried items are perfectly concealed. You could carry 1 load of contraband and a pistol, perfectly concealed, even against a pat down. |
| Ironhook Contacts | Your Tier is effectively +1 higher in prison. This counts for any Tier-related element in prison, including the incarceration roll (see page 148). |
| Elite Skulks, Rovers, Rooks, Adepts, Thugs | All of your cohorts with the [Skulks / Rovers / Rooks / Adepts / Thugs] type get +1d to quality rolls for [Skulk / Rover / Rook / Adept / Thug]-related actions. |
| Hardened, Ordained | Each PC gets +1 trauma box. This costs three upgrades to unlock, not just one. This may bring a PC with 4 trauma back into play if you wish. |
| Composed, Steady | Each PC gets +1 stress box. This costs three upgrades to unlock, not just one. |
| Ritual Sanctum in Lair (Cult) | This counts as a sacred and arcane workshop for occult practices and rituals. |
| Underground Maps and Passkeys (Shadows) | You have easy passage through the underground canals, tunnels, and basements of the city. |
| Camouflage (Smugglers) | Your vehicles are perfectly concealed when at rest. They blend in as part of the environment, or as an uninteresting civilian vehicle (your choice). |
| Barge (Smugglers) | Add mobility to your lair. You can move it to a new location as a downtime activity. |
| Vehicle (Smugglers) | All smugglers start with a vehicle. When the vehicle is upgraded (two boxes), it also gets armor. |

- **Deep Cuts rows for specials, Downtime crews:** cost from the row's own `cost` box (6, 8 or 10 per box, which matches the Deep Cuts p83 table), and for three-box upgrades the total, for example "8 coin per box, 24 for all three". Deep Cuts p83: "Composed, Hardened, Ordained, or Steady (per box)".
- **Rigging with the Load module on:** the sheet itself swaps the rigging name to the Deep Cuts wording ("... including a heavy item while your load is discreet, if you wish"). The card shows the sheet name, so it follows the sheet.
- **Emcees, River, Roots, Vigilantes specials** (Full Pockets, Calm, Improvised Load, Jailbird Contacts, Rituals of Earth and Blood, Sustained, Unbroken, Vigilantes attire, Dedicated crafters, Irregulars, Willing to Fight): not in either book, same position as their claims. The card shows the sheet name (which carries the effect in brackets for most) and says "No book text for this upgrade: the core book has no entry for it."
- **Smugglers rows in the PDF** (Elite Rooks, Elite Thugs instead of Elite Rovers, see `Deep Cuts Sheets v1.2b - Script Check.md`): the button lists the rows on the sheet. Elite Rooks and Elite Thugs already have core text above.

## 5. How "taken" is decided

| Kind | Rule | Basis |
|---|---|---|
| Carriage, Boat, Vehicle, Secure, Vault | Taken with 1 box, improved with 2 | Sheet text: "A second upgrade improves ..." |
| Hardened, Ordained, Composed, Steady and the other three-box specials | Taken only with all 3 boxes. 1 or 2 boxes show ◐ "in progress" | Core: "This costs three upgrades to unlock, not just one" |
| Mastery | Taken only with all 4 boxes | Sheet text: "This costs four upgrade boxes to unlock" |
| Every one-box upgrade | Taken with the box marked | |
| A row you added yourself | Taken with every box marked, ◐ when some are | Inference: no rule to read |

## 6. How it would be built

- **New verbs:** `upgrades` (card 1), `upgradelist --cat special|lair|training|quality` (card 2), `upgradeinfo --cat <category> --n <index>` (card 3). `contacts` and `claims` keep their names, so old macros still work.
- **Reading the sheet:** a small helper reads a fixed upgrade's name, boxes marked and text; another walks `repeating_upgrade` rows in sheet order (the helper Contacts already uses). Names may be translation keys or English, so matching uses the same normalization as claims. Nothing is written to the sheet.
- **Same safety as the claim cards:** text goes through the chat sanitizer (brackets, `@{ %{ ?{ &{`, pipes, braces), buttons use a number that is checked against the live sheet, a stale button says "that upgrade is no longer on the sheet. Run 6c. Crew Upgrades again.", only the crew's controller or the GM can use it.
- **Debug:** `!bitdcrew debug on` writes the category, rows found, boxes and which text source was used (sheet, script copy, book table).
- **Token actions:** `ABILITY_NAMES` gets the three names; existing tests and the mutation list that name `6b. Contacts` and `6c. Claims` are updated.

## 7. Tests I would write

- Rename and order: a Downtime crew has 13 actions in order, a core crew 12 with the gap at 5, no leftover old names after a rebuild.
- Each category: sheet order, held and not held markers, box counts, legend, the "n of m" summary on card 1.
- Three-box specials (0, 1, 2, 3 boxes), Mastery (0 to 4), two-box lair upgrades (0, 1, 2).
- Card 3 text: sheet text verbatim, core text keyed to the name for each core crew type, no book text for Vigilantes and Emcees/River/Roots, Deep Cuts lines only when the Downtime module is on, cost line.
- Edge cases: empty sheet, no crew type, Smugglers "vehicle" key, translation-key names, newline in a name, long names (60-character button limit), stale button, non-controller, hostile text in a name or description.
- No write to any attribute (snapshot test). Mutation checks for each of the above, and a new live test row (L29).

## 8. Decisions I need

1. **The `[Crew Name] Special` label.** The crew type ("Bravos Special") or the crew's own name ("The Red Sashes Special")? I recommend the crew type, because the upgrades belong to the type, with "Crew Special" if the type is blank.
2. **Text for the specials.** Show the core-book text above plus the sheet name, since the drop-down is empty? I recommend yes.
3. **"Taken" rules** in section 5, including ◐ for three-box upgrades with one or two boxes. Agree?
4. **Deep Cuts lines** (Training and Mastery p88, Vault p88, Workshop p87, cost p83) for Downtime crews. I recommend yes.
5. **Quality's general rule line** from the core book on each Quality card. I recommend yes.
6. **Visibility:** whispered category cards, public upgrade card, as Contacts and Claims. Agree?

## 9. Not in this plan

Buying or ticking an upgrade (the button is read-only; nothing spends Coin), the Patron discount (a reminder line on the cards is cheap if you want it), counting upgrades for Tier advancement (Deep Cuts p83 asks for 6, 8, 12 or 20 upgrades plus cohorts, and how a three-box upgrade or cohort counts is not stated), and cohort upgrades.
