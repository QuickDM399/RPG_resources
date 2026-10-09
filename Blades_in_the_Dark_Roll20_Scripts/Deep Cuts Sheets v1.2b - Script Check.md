# Deep Cuts Sheets v1.2b: check against the crew script (v0.8.1)

**Status: findings only. No code was changed.** Four items need your ruling before I touch the script (section 3). Everything else in the script agrees with the PDF.

## 1. What the PDF is

`BitD_Deep_Cuts_Sheets_v1_2b.pdf`, 19 pages: 11 player playbooks (Cutter, Hound, Leech, Lurk, Slide, Spider, Whisper, Stranger, Ghost, Hull, Vampire), a blank playbook, six crew sheets (Assassins, Bravos, Cult, Hawkers, Shadows, Smugglers) and a Factions of Doskvol page. There are **no Vigilantes, Emcees, River or Roots crew sheets** in it, so those four crews are unchecked.

## 2. How I checked

I pulled the PDF's text layer and compared it with three things: the Roll20 sheet's own data (sheet v3.11: `crewData.json` and `translation.json`), the tables inside the crew script, and the Deep Cuts Part Two book text. A difference is only reported when the sheet and the PDF disagree in wording or number, not in punctuation or capitals.

**The PDF is newer than the Roll20 sheet.** For Crow's Veil, Emberdeath, High Society, Pack Rats, Conviction, Blood Brothers, All Hands and Reavers the PDF matches your Deep Cuts Part Two book (pages 88 and 110 to 111), and the Roll20 sheet still shows older text. For **Hagfish Farm, Forged in the Fire, Vipers and the Smugglers upgrade list the PDF is the only Deep Cuts source**: the book does not mention them. That is why items 1 and 4 below need your ruling.

## 3. Items that need your ruling

| # | Item | PDF v1.2b | Roll20 sheet v3.11 and core book | Script today | What I would do |
|---|---|---|---|---|---|
| 1 | **Hagfish Farm** (Assassins, Shadows) | "Body disposal + **counts as turf**" | Sheet: "body disposal, +1d to reduce heat after killing". Core: +1d to the Reduce Heat roll. Deep Cuts Part Two never names it; p88 turns "+1d to Reduce Heat" into Heat -1 in Heat & Hold | `6c. Claims` shows the core text. `9. Status` compares turf boxes with ticked **Turf** claims only, so a held Hagfish Farm would trigger a false "boxes do not match" note. The future-work doc plans a Heat -1 button | Follow v1.2b for Downtime crews: show "counts as turf" on the claim card, count it in the Status turf check, drop the planned Heat -1 button. **Needs your ruling**: v1.2b is the only Deep Cuts source for this claim |
| 2 | **Infirmary** (Assassins, Bravos, Shadows) and **Sacred Nexus** (Cult) | "+1 tick to healing clock in downtime" | Sheet and core: "+1d to healing rolls". **Deep Cuts p88: "+1d to healing rolls instead counts as 1 tick on the healing clock"** | `6c. Claims` shows the core "+1d to healing treatment rolls" as the rule in force | Add the Deep Cuts wording as the rule in force for Downtime crews, the same way Warehouses and Informants already work. The book supports it, so I would not wait on a ruling unless you disagree |
| 3 | **Cover Identities** | Assassins: "deception / social plans". **Hawkers: "deception or transport plans"** | Core book (both crews): "deception and social plans". Sheet (both): "deception and transport plans" | Engagement roll counts it for deception and social plans (core) | Keep core for both. If the Hawkers wording is intended, I change Hawkers only. **Needs your ruling** |
| 4 | **Forged in the Fire** (Bravos) | "+1d when you **push yourself** against physical harm" | Sheet: "+1d to resistance rolls" | Not automated. My earlier note said to enter +1 in each PC's Resistance bonus boxes, which matches the sheet wording only | **Do not enter the Resistance bonus** if you use the v1.2b wording: it would give +1d to every resistance roll, not only pushed ones. No code change. **Needs your ruling** on which wording is in force |

## 4. Differences that change nothing in the script

| Item | PDF v1.2b | Sheet v3.11 | Note |
|---|---|---|---|
| Smugglers special upgrades | Six rows: Smuggler's Rigging 6, Steady 8, Camouflage 6, Barge 10, **Elite Rooks 10, Elite Thugs 10** | Five rows: same four plus **Elite Rovers** | The core book and Deep Cuts Part Two have Elite Rovers and say nothing about a change. The upgrade button will list whatever rows are on the sheet. Tell me if the PDF is the intended list |
| Crow's Veil, Emberdeath (Assassins) | Downtime activity, 2 Coin ritual; Emberdeath +4 Coin | Older text (hard-won experience, 3 Stress) | PDF matches Deep Cuts Part Two. Not automated |
| High Society (Hawkers) | Name a member of the elite; positive opinion: -1 Heat, otherwise ask the GM | "Take -1 Heat during downtime and +1d to gather info" | PDF matches Deep Cuts Part Two. Not automated |
| Pack Rats (Shadows) | Once per Downtime Acquire an item, Quality Tier+1, no Coin or activity | "+1d to acquire an asset" | PDF matches the text you gave me. Not automated, as decided |
| Conviction (Cult) | Worship vice, deity grants 1 Edge | Older text | Not automated, as decided |
| Vipers, Blood Brothers | "+1 Quality level"; "reduce harm", "Thugs type" | "+1 result level"; "avoid harm", "Thug type" | Blood Brothers matches your Deep Cuts book except Thug/Thugs. Vipers is not in the book. Not automated |
| All Hands, Reavers, Like Part of the Family (Smugglers) | Deep Cuts wording; Like Part of the Family also lists the edges and flaws | Older wording | The `9. Status` reminder for All Hands already uses the Deep Cuts wording. The Like Part of the Family reminder is the short form and stays correct |
| Envoy, Fixer | "high-class targets", "lower-class targets" | Same as the PDF | Core book says "clients". The Score card's coin buttons use the core wording. Labels only: you choose the button per score |
| Barracks, Cloister, Ancient Obelisk, Surplus Caches | "Thug cohorts", "Adept cohorts", "-1 Stress cost for arcane powers & rituals", "+2 coin for sale or supply" | Capitalization and short phrasing differences | Same meaning |

## 5. Confirmed to match

- **Warehouse and Warehouses** (+1 Acquire activity per Downtime) and **Informants** (+1 tick on an investigation project): the PDF agrees with the Deep Cuts replacement text the claim cards already show.
- **All ten +2 Coin claims** are on the PDF crew sheets with the same amounts: Envoy, Fixer, Local Graft, Loyal Fence, Surplus Caches, Terrorized Citizens, Offertory, Street Fence, Luxury Fence, Covert Drops.
- **Income claims** (Vice Den, Drug Den, Gambling Den, Fighting Pits, Foreign Market, Protection Racket, Side Business): "(Tier roll) - Heat = Coin in downtime".
- **-2 Heat per score** claims: Cover Operation (Assassins, Hawkers, Smugglers) and Bluecoat Intimidation (Bravos). **Victim Trophies** +1 Rep per score.
- **Engagement claims**: City Records, Secret Pathways (stealth), Bluecoat Confederates (assault), Ancient Altar (occult), Personal Clothier (social), Secret Routes (transport). Cover Identities is item 3 above.
- **Abilities the script reads or reminds about**: Door Kickers, Second Story, Predators ("stealth or subterfuge", counted for stealth and deception plans as you ruled), No Traces, Patron, Slippery, Bound in Darkness (each PC that has not lost favor gains 1 Edge), Zealotry, Just Passing Through, Leverage.
- **Player sheets**: the only playbook ability that adds to the engagement roll is Weaving the Web (+1d to the engagement roll), unchanged in effect. Eye for Weakness (Rafiq) is not in the PDF, so it stays sheet-only. Every playbook has the Edge circle the Action module uses.

## 6. Not checked

- Vigilantes, Emcees, River and Roots crew sheets (not in the PDF).
- The Factions of Doskvol page (Tier and Hold per faction): the crew script does not use faction data.
- The player playbooks against the PC script (`BitD Token Action Maker.js`): out of scope for this script. I can run the same comparison for it if you want.
