# Crew Script: editing a cohort's edges and flaws from buttons (proposal for v0.13.0)

**Status: proposal for approval. No code has been touched.** Rules are quoted from your core book (`bladesinthedark_v8_2`), Deep Cuts Part Two or the Roll20 sheet (v3.11). Where I am inferring, it says so.

## 1. Bottom line

- **One new button on the cohort card, "Edit edges and flaws"**, opens a whispered editor. Each book edge and each book flaw is a button. A click adds it if the cohort lacks it and removes it if the cohort has it. The editor re-posts itself after each click, so you can make several changes in a row.
- **It writes only the cohort's `edges` and `flaws` text boxes**, on a click. Nothing else on the sheet changes. The sheet has no worker that depends on that text (its only job with those two boxes is to trim stray spaces after a player types), so the API write is safe.
- **The books are silent on changing edges or flaws after a cohort is made**, so the script spends nothing and enforces nothing hard. It shows the book rule and warns when a cohort is off it (section 4). The GM decides at the table.

## 2. What the books say

Core book, Cohorts: "When you create a cohort, give them one or two edges and an equal number of flaws."

| Edges | Text (core book) |
|---|---|
| Fearsome | The cohort is terrifying in aspect and reputation. |
| Independent | The cohort can be trusted to make good decisions and act on their own initiative in the absence of direct orders. |
| Loyal | The cohort can't be bribed or turned against you. |
| Tenacious | The cohort won't be deterred from a task. |

| Flaws | Text (core book) |
|---|---|
| Principled | The cohort has an ethic or values that it won't betray. |
| Savage | The cohort is excessively violent and cruel. |
| Unreliable | The cohort isn't always available, due to other obligations, stupefaction from their vices, etc. |
| Wild | The cohort is drunken, debauched, and loud-mouthed. |

A Smugglers vehicle cohort (Like Part of the Family) uses "the vehicle edges and flaws": edges Nimble, Simple, Sturdy; flaws Costly, Distinct, Finicky (core book wording, already in the script from v0.12.0). The core book gives no count for a vehicle; I would apply the same "one or two and an equal number" line (inference).

**Not in the books (searched the core book, Deep Cuts Part Two and the v1.2b crew sheets):** any rule for changing an edge or a flaw after creation, and any cost for it. What the books do price, and what this batch does **not** touch: adding a second gang type ("spend two crew upgrades", core), recruiting a cohort (two upgrades, or two advancement clocks with Downtime), and upgrading a cohort to Elite (Deep Cuts p83 list: "Upgrade a Cohort to Elite quality", 10 Coin).

## 3. What the sheet holds

| Thing | Attribute | Note |
|---|---|---|
| Edges | `cohort1_edges`, `repeating_cohort_<row>_edges` | free text in a text area, no list, no limit |
| Flaws | `cohort1_flaws`, `repeating_cohort_<row>_flaws` | same |

The script already reads both boxes (v0.12.0): it splits on commas, semicolons, slashes, plus signs, "and" and line breaks, drops bracket text, matches the book names without regard to case or a final "s", keeps names it does not know as typed, and reads at most six names per box.

## 4. What you would see

**Cohort card (public), one new button:** `Edit edges and flaws`, beside Take harm and Heal.

**Editor (whisper), "Edges and flaws: Thugs":**

> **Edges (1 of 1 to 2):** [● Fearsome] [○ Independent] [○ Loyal] [○ Tenacious]
> *Fearsome: The cohort is terrifying in aspect and reputation.* (the four texts, one line each)
> **Flaws (1 of 1 to 2):** [● Savage] [○ Principled] [○ Unreliable] [○ Wild]
> *Savage: ...* (the four texts)
> Also on the sheet, not from the book: **Greedy** (flaw) [Remove Greedy]
> *Hooked: +1 quality now from the Savage flaw.* (only when it applies)
> *Core book: when you create a cohort, give them one or two edges and an equal number of flaws.*
> [Show the cohort card to the table]

- A filled circle means the cohort has it. A click toggles. The counts show "1 of 1 to 2".
- **Off the book rule** (no edges, more than two, or edges and flaws unequal): one italic warning line, for example "2 edges and 1 flaw: the core book gives one or two edges and an equal number of flaws." Nothing is blocked.
- A name the book table lacks stays in the box as typed. The editor lists it with a Remove button; adding a made-up name is typed on the sheet (decision 4).
- **What a click writes:** the box is rewritten as the held names joined by a comma and a space, in book spelling (`Fearsome, Loyal`). Unknown names keep their typed spelling and their place. **Bracket text and line breaks in the box are not kept.** The editor shows the previous text of the box in the first card after a change, so nothing is lost silently (decision 3).
- A vehicle cohort gets the vehicle table; any other cohort gets the core table.
- Hooked: the editor says when the Hawkers' Hooked ability is giving the gang +1 quality from a flaw, because adding or removing Savage, Unreliable or Wild changes the dice it rolls.

## 5. How it would be built

- **Verbs:** `cohortedit --row <ref>` (the editor), `cohortedit --row <ref> --n e<key>` or `f<key>` (toggle an edge or a flaw, then re-post the editor). The key is the table key (`loyal`), so no colon is needed in any button command. Remove-by-position for unknown names: `--n x<index>`.
- **Reading:** the existing `cohortEdgeNames` and `cohortFlawNames`. **Writing:** one `setAttr` on `edges` or `flaws`, through the sheet worker flag as the other writes do.
- **Permissions:** as every verb: the GM, or a player who controls the crew (decision 6).
- **Debug:** `!bitdcrew debug on` logs the old text, the new text and the attribute written.
- **Not changed:** harm, armor, the roll, type, gang types, the notes box.

## 6. Decisions I need

1. **Scope.** (A) Edges and flaws only, as you said (my recommendation). (B) A plus the gang types (up to two, toggle the five types). (C) B plus the Gang, Elite, Expert setting. B and C need a ruling on cost, since the books charge two upgrades for a second type and 10 Coin for Elite (Downtime module), which the script cannot spend. The sheet's type setting also changes the verb the roll card shows ("rolls their" for an expert), which the sheet does itself.
2. **Limits.** (a) Soft: warn when off "one or two edges and an equal number of flaws" and block nothing (my recommendation: the rule says "when you create", and a swap is a remove then an add, so equality cannot be enforced hard). (b) Hard cap of two edges and two flaws. (c) Hard cap and equal counts.
3. **What happens to the old text.** (a) Rewrite the box in normal form, drop bracket text and line breaks, and show the previous text on the card after the first change (my recommendation). (b) Refuse to edit a box that holds text the rewrite would drop, and say to edit it on the sheet.
4. **Made-up edges and flaws.** (a) Buttons for the book names only; a made-up name already in the box can be removed from the editor, and a new one is typed on the sheet (my recommendation). (b) No remove button for made-up names either.
5. **Announcing.** (a) Editor and each change are whispers; a "Show the cohort card" button posts the public card when you want it (my recommendation). (b) Each change also posts a public line, for example "Thugs gains Loyal."
6. **Who may edit.** (a) The GM or a player who controls the crew, like every other cohort button (my recommendation). (b) GM only, since it changes what the cohort is.
7. **Vehicle cohorts.** Same one-or-two rule applied to the vehicle edges and flaws (an inference, the book gives no count). Agree, or no warning for vehicles?

## 7. Tests I would write

Parsing then writing round trips (commas, lines, "and", case, plurals, bracket text); add and remove every book edge and flaw on a gang, an Elite gang, an expert and a vehicle; the vehicle table versus the core table; counts and each warning (none, over two, unequal); an unknown name kept, listed, removed; the previous text shown; Hooked line on and off; permissions (player on another crew refused, GM allowed); a removed cohort; hostile text in the old box and in names (no buttons, inline rolls or template fields); nothing written except the one box; a text box that reads as "more than six names"; the card button present; mutation checks for each; and a live test row (L33).
