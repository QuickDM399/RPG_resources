# Crew Abilities, Bundles 3 to 5: Build Plan (v0.3.0)

**Status: approved with changes, then built as v0.3.0 (mock tested; nothing run in the live game).** Section 0 records the answers. Where the proposal below differs from section 0, section 0 wins.

## 0. Answers and what was built

| Decision | Answer | In v0.3.0 |
|---|---|---|
| 1. Engagement prompts | 3 prompts | Plan type, murder goal (only when a Predators or Deadly Focus row exists), net dice |
| 2. Claims in Engagement | Yes; Cover Identities follows the book (social) | All seven claims counted, Cover Identities on deception and social |
| 3. River crew items | "Do them" | Deadly Focus (+1d with a murder goal, any plan) and The Governor (-1d, any plan) counted |
| 4. Bundle 4 | Do not code The Good Stuff, Favors, As Good as Your Word, Hooked or Pack Rats (Pack Rats stays as the Deep Cuts text on the sheet) | Only item c, the Status reminders, was built: it was on my recommended list and not on your exclusion list. Say if you want it removed |
| 5. Bundle 5 | Yes to Begin score, Clear Edge as a button, and the game-wide Party flag as "the party" | Built as proposed (R18, R19) |
| 6. Bundle 6 | Yes, plan it next | See `Crew Abilities Bundle 6 - Claims Build Plan.md`. Not built |

Rulings you gave: Second Story means a stealth plan; Predators means a stealth or deception plan with a murder goal; claims that reduce Heat still apply under Deep Cuts.

**Not built, as decided:** The Good Stuff, Pack Rats, Hooked, Favors, As Good as Your Word, Forged in the Fire (enter +1 in each PC's Resistance bonus boxes), Conviction, Anointed, Blood Brothers, Synchronized, the rating bumps.

The proposal as first written follows.

---

# Proposal (as written before the answers)

Status at that time: proposal for approval. No code had been written for anything below. Rules are quoted from your core book (`bladesinthedark_v8_2`), Deep Cuts Part Two, or the text now on your sheet, and each row says which. Where I am inferring, the row says so.

Scope assumption carried over from Bundles 1 and 2: every new feature is Deep Cuts Downtime-on or Action-on only where the rule needs that module. The Engagement roll is a core rule, so it works on any crew.

## 1. Findings that change the plan

1. **Engagement bonuses are not only three crew abilities.** The sheet and the core book also give +1d to the engagement roll from seven **claims**. A composed roll that only knew Predators, Door Kickers and Second Story would drop them silently. Table in section 2.
2. **The sheet disagrees with your book on one claim.** Cover Identities reads "+1d engagement for deception and **transport** plans" on the sheet and "deception and **social** plans" in the core book. I would follow the book (decision 2).
3. **Claims also change Heat, Rep and Coin every Score, and I have not covered them.** The ability analysis never looked at claims. Examples from the sheet text: "-2 heat per score" (Cover Operation, Bluecoat Intimidation, Bluecoat Confidants), "+1 rep per score" (Victim Trophies), and eight income claims "(Tier roll) - Heat = coin in downtime". Deep Cuts Part Two does not restate any of these. This is a candidate **Bundle 6**, section 5. It is probably worth more than Bundle 4.
4. **The Good Stuff has book support for a roll.** Core book: "The quality of your product might be used for a fortune roll". So a Tier+2 dice Fortune button is the book's own use, not my invention.
5. **Edge rules (Deep Cuts, Action module, p92):** "When you roll more than one 6, you gain an Edge" and "Any remaining Edge you have is lost when Downtime starts." Edge lives on PC sheets in `edge_amount`, and the PC script already owns the sync of token bar 2. The party flag test passed in your game, so the crew script can now reach those PCs.

## 2. Bundle 3: composed Engagement roll (you chose "composed by script")

**Rule (core book, Engagement Roll):** a Fortune roll of "1d for sheer luck", **+1d per Major Advantage, -1d per Major Disadvantage**. The book's advantage and disadvantage prompts are: bold or daring versus complex; the plan's detail hits a weakness versus the target's strongest defense; friends or contacts help versus enemies interfere; plus "any other elements" such as a lower-Tier or higher-Tier target. Result: 1 to 3 desperate, 4 or 5 risky, 6 controlled, critical controlled and past the first obstacle. The six plan types are assault, deception, stealth, occult, social, transport.

**Sources of automatic +1d** (a row counts only when ticked on the crew sheet, same as every ability hook so far):

| Source | Applies to | Where the wording comes from |
|---|---|---|
| Door Kickers (ability) | assault plan | Core book: "When you execute an assault plan"; "applies when the goal is to attack an enemy" |
| Second Story (ability) | stealth plan | Core book: "clandestine infiltration". Reading: stealth is "Trespass unseen", so I map it to stealth (**inference**) |
| Predators (ability) | stealth or deception plan **and** the goal is murder | Core book: "stealth or deception plan to commit murder"; the sheet says "stealth or subterfuge". Needs a yes or no question |
| Deadly Focus (ability, River crew) | any plan **and** the goal is to murder a Claim target | Sheet only. River is not one of your seven crews, so low priority |
| Ancient Altar (claim) | occult | Core book and sheet |
| Bluecoat Confederates (claim) | assault | Core book and sheet |
| City Records (claim) | stealth | Core book and sheet |
| Cover Identities (claim) | deception, plus **social (book) or transport (sheet)** | Conflict, decision 2 |
| Personal Clothier (claim) | social | Core book and sheet |
| Secret Pathways (claim) | stealth | Core book and sheet |
| Secret Routes (claim) | transport | Core book and sheet |
| The Governor (River claim) | any plan, **-1d** | Sheet only. Same low priority as Deadly Focus |

PC abilities that also add engagement dice (Weaving the Web, Eye for Weakness) live on PC sheets and depend on what the player did earlier. The roll cannot see them, so the "net dice" answer below is where the player puts them.

**Proposed `2. Engagement` (replaces the native macro on the token only; the sheet's own Engagement button stays untouched):**

- Prompt 1: **Plan type** (the six).
- Prompt 2: **Goal is murder?** (No, Yes). Included only when the crew sheet has a Predators or Deadly Focus row at Rebuild.
- Prompt 3: **Net dice from advantages, disadvantages and PC abilities** (-4 to +4, default 0). One number, so the table decides the book's list out loud and the click count stays at 3.
- Pool = 1 + prompt 3 + automatic bonuses. Zero or less rolls 2d and takes the lowest, as every other roll in the script does.
- The card is a normal `blades` engagement card (same fields as the native one, so the sheet shows the position text as it does today). A short line above it lists the arithmetic, for example "Engagement, assault plan: 1 luck, +1 net, +1 Door Kickers, +1 Bluecoat Confederates = 4d".
- **Stale macro guard**, like Score: if the number of answers does not match, the script says "Run ~ Rebuild" and rolls nothing.

**Risks:** it costs three prompts where the native button costs one (you accepted this). The plan-type mapping for Second Story is my reading. Claim names are matched as English text, like abilities.

## 3. Bundle 4: small additions (not yet approved; every item optional)

| # | Item | What it would do | Wording | My recommendation |
|---|---|---|---|---|
| a | **The Good Stuff** (Hawkers) | A button that posts a Fortune card with Tier+2 dice, titled for product quality | Core: "product quality is equal to your Tier +2 ... might be used for a fortune roll" | **Yes.** Book-supported, one click |
| b | **Pack Rats** (Shadows) | A once-per-Downtime button in the Heat and Hold card that logs the free Acquire at Quality Tier+1 | Deep Cuts: "Once per Downtime, Acquire an item with Quality equal to your Tier+1 without spending Coin or using a Downtime activity." The ledger already exists | **Yes.** Trivial |
| c | **Reminder lines in `8. Status`** for ticked abilities with no number to change: Zealotry, Thorn in Your Side, Roots, All Hands, Like Part of the Family | One line each, no state | Sheet text | **Yes.** Stateless, cheap |
| d | **Hooked** (Hawkers) | +1d on the cohort roll for a gang whose flaw text mentions savage, unreliable or wild, never above 4 | Core: "Add the savage, unreliable, or wild flaw to your gangs to give them +1 quality (max rating of 4)" | **Maybe.** It reads a free-text flaw field, so a typo breaks it. The card would show the +1d so a wrong guess is visible. Whether "max 4" caps the pool before or after the +1 is **ambiguous** |
| e | **Favors** (Vigilantes) | A button that spends 1 Rep and posts the reminder that everyone gets a dot for this score | Sheet text | **No.** Low value, the dot is a PC change anyway |
| f | **As Good as Your Word** (Vigilantes) | Nothing to build | Deep Cuts already lets Reduce Heat cost Rep, and that button exists | **No** |

## 4. Bundle 5: party-based effects on PCs

Uses the Roll20 Party member flag, which passed your live probe. The party flag is game-wide, so "the party" means every PC flagged, as with the Payoff count.

| Ability | Wording in force | Proposal |
|---|---|---|
| **Bound in Darkness** (Cult, Action on) | "When you begin a score, each PC that has not lost favor with your deity gains 1 Edge. You may transfer Edge to another cult member without needing to take any action to help them." | **Adjust entry "Begin score (Edge)"**, shown when the crew's Action module is on. It posts a card with **All party PCs +1 Edge** and one button per PC for the case where someone lost favor. Writes `edge_amount` and sets token bar 2 explicitly (a linked bar is not refreshed by API writes). Edge is capped at the PC script's own 99 |
| **Edge lost at Downtime start** (Action module rule, any crew) | "Any remaining Edge you have is lost when Downtime starts." (p92) | A button on the Fallout card: **Clear Edge for the party**, listing who loses how much. A button, not automatic, so a stray Score click cannot wipe your players' Edge |
| **Forged in the Fire** (Bravos) | "+1d to resistance rolls" | **No code.** Enter +1 in each PC's Resistance bonus boxes once (`setting_resbonus_*`, which the PC script already adds to its Resist roll) |
| **Conviction, Anointed, Blood Brothers, Synchronized** | Vice, Harm and group-action changes | **Not built.** They need a Vice flow, Harm levels or a group-action roller, which belong in the PC script |
| **Rating bumps** (seven abilities) | One-time rating changes | **Not built** |

**Risks:** the crew script writing to PC sheets is new. It only writes `edge_amount` and bar 2, only on a button click, and never touches the attributes the PC script's text fixer owns. A coexistence test with both scripts loaded will cover it. "Has not lost favor with your deity" is a table decision, so the per-PC buttons are the answer, not a check.

## 5. Candidate Bundle 6: claims that change Score numbers (needs your go-ahead before I plan it)

All wording below is from the sheet text. I checked the core book for these: Cover Operation, Bluecoat Intimidation and Victim Trophies are there. **Bluecoat Confidants, Publicity and Doskvol's Most Wanted are not in the core book or Deep Cuts text you gave me**, so they would be sheet-only.

| Claim effect | Claims | Where it would go |
|---|---|---|
| "-2 heat per score" | Cover Operation, Bluecoat Intimidation, Bluecoat Confidants | Fallout Heat line, and the core Score card |
| "+1 rep per score" | Victim Trophies | Fallout Rep line |
| "+2 rep on takedown scores", "+2 rep on scores against the law" | Publicity, Doskvol's Most Wanted | A question or button, because the script cannot know the score type |
| "(Tier roll) - Heat = coin in downtime" | Drug Den, Fighting Pits, Foreign Market, Gambling Den, Info Biz, Protection Racket, Side Business, Vice Den | A button in the Heat and Hold card that rolls Tier dice, takes the highest, subtracts Heat, and adds the Coin on a second click |
| "+2 coin" for a kind of target or score (core book: "+2 coin in payoff for scores that involve ...") | Envoy (high-class targets), Fixer (lower-class), Local Graft (show of force or socializing), Loyal Fence (burglary or robbery), Surplus Cache (product sale or supply; "Surplus Caches" on the sheet) | A Payoff question, because the score type is a table decision |

Open question I cannot answer from your books: whether the Deep Cuts Fallout Heat total should still be reduced by these claims. Deep Cuts never restates the claims, so I would keep them as written, the way the Heat 9 rule was kept (confirmed by you earlier).

## 6. Build order and tests

1. **M1 Bundle 3:** composed Engagement, with tests for each plan type, each ability and claim, the murder prompt, the stale-macro guard, the zero-dice roll and the two-script coexistence check.
2. **M2 Bundle 4:** only the items you approve.
3. **M3 Bundle 5:** Begin score, Clear Edge, with tests that bar 2 is set, the PC script's own attributes are untouched, and an empty party refuses and changes nothing.
4. **M4 Bundle 6:** only after its own plan is approved.

Every milestone adds mock tests and mutation checks, then new rows in the live test plan (L21 onward). Nothing is verified in the live game until you run it.

## 7. Decisions I need

1. **Engagement prompts:** 3 prompts (plan type, murder goal if the crew has it, net dice) as proposed, or 5 (advantages and disadvantages separate, plus a PC-ability bonus)? I recommend 3.
2. **Claims in the Engagement roll:** include all seven claim bonuses? And for Cover Identities, **social (your book)** or **transport (the sheet)**? I recommend yes, and the book.
3. **River crew items** (Deadly Focus, The Governor): skip unless you run a River crew? I recommend skip.
4. **Bundle 4:** which of a to f? I recommend a, b and c, and a decision from you on d.
5. **Bundle 5:** Begin score button, and Clear Edge as a button on the Fallout card, as proposed? Anything to change about who counts as "the party"?
6. **Bundle 6:** plan it next? I recommend yes, before Bundle 4.
