# Crew Script: completing the Heat and Hold step (proposal for v0.14.0)

**Status: APPROVED and BUILT as v0.14.0 (2026-10-11): 4a, 4b and 4d as recommended; 4c (the readiness line) later; the faction sheet found automatically, picked per crew when there are several, hand-set buttons when there is none; GM ruling buttons -1, -2, -3. One small change: the hand-set Status buttons are -1, -2 and -3 (the plan said -1 and -2). The proposal as first written follows.** Rules are quoted from your Deep Cuts Part Two PDF (page numbers are the book's). The sheet facts come from the Evil Hat sheet source (`blades.html` v3.11). Where I am inferring, it says so.

## 1. Bottom line

- **The one real gap is "reduce Heat by Status".** `Crew Script - Deferred and Future Work.md` section 1 said I did not know where faction Status lives. I do now: it is on the **faction sheet** (a character sheet with `sheet_type` = `faction`, "Factions of Doskvol"), one row per faction with its Tier, Hold and Status. So the Status reduction can be read from the sheet and offered as a button. I cannot see your game's faction sheet from here, so decision 2 below is about how the script finds the right one.
- **Everything else on the card works today** (section 3). The rest of this plan is small: an "ask the GM" line with buttons, a Tier-readiness line and, if you want it, the cohort healing step that opens the Deep Cuts crew phase.
- **Nothing automatic.** Every change is a button on the Heat and Hold card, once per Downtime where the book says once, logged in the Downtime summary, as the existing buttons are.

## 2. What the book says (Deep Cuts, Downtime module)

- **p80, Crew phase:** "First, each cohort heals one level of Harm. Then resolve Fallout, Payoff, Entanglements, Development, and Heat & Hold."
- **p84, Heat & Hold, reduce heat:** "For each +2 Status (or more) you have with a Tier 3+ faction, reduce Heat by 1. The crew may further reduce Heat by 1 for each Coin or Rep they expend. Ask the GM if there's anything else you can do to reduce Heat (like silencing a witness), what the cost or potential consequence is, and how much Heat it will remove."
- **p84, assess hold:** "Your crew's hold on their Tier is measured by your number of turf claims. To have strong hold on your Tier, you must have a number of turf claims equal to or greater than your Tier. While your number of turf claims is lower than your Tier, your hold is weak."
- **p83, Tier advancement** (for the readiness line): "Your rep track is full (including any reduction from turf). You have strong hold on your current Tier. You possess the required number of upgrades and cohorts to advance." Requirements by Tier: 0 to 1: 6 crew upgrades and at least 1 cohort; 1 to 2: 8 and 2; 2 to 3: 12 and 4; 3 to 4: 20 and 6. "Cohorts don't cost Coin, they cost 2 crew advances to acquire" (p83) and "one Cohort counts as two upgrade boxes" (p78).

## 3. What the card does today (v0.13.1)

`5. Downtime` (Deep Cuts Downtime crews) opens the Heat and Hold card and starts a Downtime if none is open. The card has: Heat and Wanted; **Reduce Heat by 1 for a Coin** and **for a Rep** (any number of clicks); **Just Passing Through** (once); a roll button for each ticked **income claim** (once per claim), with the Coin added by a second button; **Assess hold** (turf boxes against Tier); the log of this Downtime; **End Downtime** (No Traces' +1 Rep at zero Heat, and a public summary).

## 4. What I would add

### 4a. Heat reduced by Status (the main item)

- **Reading the faction sheet.** Each faction is a row in one of eight repeating groups, `repeating_factions1` to `repeating_factions8`, with `name` (a translation key such as `faction_the_unseen`, or typed text), `tier` (text: `0`, `I`, `II`, `III`, `IV`, `V` or `VI`), `hold` and `status` (a number box, blank until typed). The script reads those rows; it writes nothing to the faction sheet.
- **The rule as I read it:** each faction of Tier III or higher with Status +2 or more counts **once**, so Heat -1 for each such faction. Status runs from -3 to +3, so "for each +2 Status (or more)" read as "per faction at +2 or more" and read as "per +2 steps" give the same count (1 for +2 and for +3). It needs no decision.
- **On the card:** "Status: Heat -2 available (The Unseen +3, Tier IV; The Hive +2, Tier IV)" with a button **Take Status Heat -2**. It is once per Downtime, lowers Heat by the number (never below 0, Heat is not asked to roll over), and goes in the log. If no faction sheet can be found it says so and offers **Heat -1** and **Heat -2** buttons you set by hand.
- **Which faction sheet.** (a) One faction sheet in the game: use it. (b) More than one, or the Status on it belongs to another crew: the card shows a "Pick the faction sheet" button list once, and the script remembers the choice for this crew in state. (c) None: say so. Decision 2.

### 4b. "Ask the GM" reductions

A line quoting the book ("Ask the GM if there's anything else you can do to reduce Heat (like silencing a witness), what the cost or potential consequence is, and how much Heat it will remove.") and buttons **GM ruling: Heat -1, -2, -3**, each logged as "GM ruling". They change only Heat. No cost is tracked: the GM names it at the table.

### 4c. Tier readiness line (optional, decision 4)

One line under Assess hold: "Tier 2 to 3: rep 9 of 12 (turf 2 lowers the track to 10), hold strong, 11 of 12 upgrades, 3 of 4 cohorts: not ready." The script knows every input: Rep, turf, Hold, the taken upgrades (the `6c` reader) and the named cohorts (the `6d` reader). Two things are my inference: an upgrade counts once when taken (a Hardened-type three-box upgrade counts once, not three times; the book counts "upgrade boxes" for cohorts only) and a cohort counts once. I would show the numbers and let the table decide. No Tier change is made.

### 4d. Cohort healing at the start of the crew phase (decision 3)

p80 opens the crew phase with "each cohort heals one level of Harm". You ruled in v0.12.0 that the heal-all button lives on the cohort list only. If you now want it on the Heat and Hold card as well, it would be one button, **Heal every cohort one level**, with a "done" mark once clicked this Downtime. Never automatic.

## 5. Not in this plan

- **Fallout faction Status changes** (p80: +1, +2, -1, -2 per faction by what the score did) and **Increase faction status** (p83: 6 Coin per Tier of the faction, up to +2). Both would write to the faction sheet, which is new ground; they belong with a plan of their own if you want them.
- **Advancing the Tier** (the Tier and Rep change). The readiness line only reports.
- **Hagfish Farm's Heat bonus.** Dropped in v0.9.3 (your ruling: it counts as turf under the Deep Cuts crew sheets).
- **Core crews.** Heat and Hold is a Deep Cuts Downtime step; core crews reduce Heat as a downtime activity roll, which the script does not touch.

## 6. Decisions I need

1. **Scope.** Which of 4a to 4d do you want? My recommendation: **4a, 4b and 4d**, with 4c later if you want it (it rests on two inferences about counting upgrades and cohorts).
2. **The faction sheet.** Is there one faction sheet in the game, and is its Status column the one for the crew you run Downtime on? If you run several crews against one faction sheet, option (b) lets you pick per crew. Tell me which applies. Also tell me whether you actually type Status numbers on the faction sheet, or keep Status elsewhere (a handout, notes): if elsewhere, 4a becomes the hand-set buttons only.
3. **Cohort healing on the card.** Add the button (4d)? A button only, never automatic.
4. **Tier readiness line** (4c): include now, later or never.
5. **Anything in the current card you want changed.** If you have notes from running L18 (Heat and Hold and End Downtime) live, send them and I will fold them in.
6. **How many "Ask the GM" buttons.** -1, -2, -3 (my recommendation), or a prompt that asks for the number (it needs a Roll20 query in a chat button, which the Write in a type button on the cohort editor is testing now).

## 7. Tests I would write

Status counts for every Tier (0 to VI) and Status (blank, -3 to +3) around the thresholds; the Roman numeral reader; names as translation keys and as typed text; several factions; blank Status as 0; one faction sheet, none, several (the pick button and the remembered choice); the button once per Downtime and again after a new Downtime; Heat never below 0; logging and the End Downtime summary; the GM ruling buttons; the cohort heal button and its once-mark if chosen; the readiness line for each Tier with the inference numbers; permissions; hostile faction names and notes (no buttons, inline rolls or template fields); nothing written but Heat (and the cohort boxes if 4d); mutation checks for each; and a live test row (L33).
