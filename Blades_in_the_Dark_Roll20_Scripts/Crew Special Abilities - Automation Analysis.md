# Crew Special Abilities: Automation Analysis

Input for the planning step. Nothing here is built. Scope: every special ability on the seven crew types in the game (Assassins, Bravos, Cult, Hawkers, Shadows, Smugglers, Vigilantes). That is 57 ability slots and **48 distinct abilities** (Patron appears on four crews, Veteran on all seven).

Sources: the sheet's ability list and wording (`crewData.json`, `translation.json`, v3.11), the core book (`bladesinthedark_v8_2`), Deep Cuts v1.0 Part Two, and the PC script's text fixer. Page numbers for Deep Cuts are book pages; core page numbers come from the book's contents and cross-references.

## 1. Bottom line

- **19 of 48 abilities have an automation hook.** Two are already built (No Traces' Heat reduction, Slippery's effective Wanted). The other 17 fall into four small bundles below. The remaining 29 are reminders, narrative, one-time rating bumps, or act on player characters rather than the crew.
- **Best first bundle: a Downtime "Heat & Hold" step.** Patron is on four of the seven crews, and High Society, Just Passing Through, No Traces, Fiends and Accord all end in "adjust Heat, Rep or Hold once per Downtime". Today every one of those is easy to forget at the end of a session.
- **Second: Score hooks.** Leverage (Smugglers) is a clean automatic +1 Rep. Crow's Veil (Assassins) and Misdirection (Vigilantes) need a button because the table decides when they apply.
- **Third, optional: an Engagement roll that knows the plan type** (Predators, Door Kickers, Second Story). It means replacing a native sheet macro, so it is the one bundle with a real trade-off.
- **Cult gets nothing from these bundles.** Its useful abilities (Bound in Darkness, Conviction, Anointed) act on PCs (Edge, Harm, resistance), which needs a decision on how the crew script reaches PC sheets. That matters now that the Action module is on.
- **The Action module changes no crew rule the script computes.** I checked, and added tests for an all-modules-on crew like `crew new`. Details in section 3.

## 2. How I judged

An ability is worth automating when it changes a number the script already tracks (Heat, Wanted, Rep, Coin, Hold, XP, a dice pool), the trigger happens in a place the script runs (Score, Adjust, Roll, Status), it comes up often, it is easy to forget, and the wording is unambiguous.

Five levels of automation, from most to least intrusive:

| Level | Meaning |
|---|---|
| **Auto** | Applied inside a flow with a line on the card. Only for unconditional rules. |
| **Button** | One click applies it. Used when the table must decide whether it applies (consecrated killer, positive opinion, once per Downtime). |
| **Remind** | Shown at the right moment, changes nothing. |
| **Cross** | Acts on player characters. Needs a PC-to-crew link first. |
| **Leave** | Narrative, one-time, or already handled by the sheet. |

## 3. Facts that shape the plan

1. **Which wording is in force varies by ability.** The PC script's text fixer rewrites seven crew abilities to Deep Cuts wording on every crew sheet, whatever the modules: Crow's Veil, Emberdeath, Conviction, High Society, Pack Rats, All Hands, Reavers. The sheet itself swaps three abilities with Downtime (No Traces, Patron, Slippery), three with Action (Blood Brothers, Bound in Darkness, Synchronized) and one with Harm (Anointed). Hooks must read the modules at click time, as the Score flow already does.
2. **Deep Cuts Downtime removes the dice from several core abilities.** Acquire, Reduce Heat and Entanglements are diceless (pp82, 84, 86). So Vipers ("+1 result level" on acquire) and core Slippery ("roll entanglements twice", "+1d reduce heat") have nothing to attach to on a Downtime crew. Core Reduce Heat is also a PC action roll (core Downtime Activities), so the crew script never sees it.
3. **The Action module (now on) leaves the crew script's maths alone.** For crews it swaps three ability texts (above) and the Informants claim text (the PC fixer already handles that). It also lets a crew roll its Tier as a Threat Roll "when their clout or reputation is threatened" (DC p94), which is the existing `1. Roll > Tier` with the same dice. Edge (DC p92) lives on PC sheets. New tests run a crew with all five modules on and an Action-only crew; Heat, Score, Tier roll and the Heat 9 rule behave exactly as before.
4. **What the script can and cannot see.** It sees crew attributes, ticked abilities (by name), and the flows it runs. It cannot see the plan type of a score, whether a killer was consecrated, whether a patron-style contact has a positive opinion, faction Status, or which PCs belong to the crew. Anything that depends on those is a Button, not Auto.
5. **Roll20 limits.** Prompts exist only in token-action macros, which are built at Rebuild, so a new prompt costs a click on every use and goes stale until the next Rebuild. Chat buttons cannot prompt but can carry fixed choices. Dice can be read only from a card the script posted.
6. **Veteran lets any crew take any ability.** Hooks therefore key on the ability's name and tick, never on the crew type.
7. **Vigilantes are not in the core book.** Their abilities are analysed from the sheet's wording only.
8. **Name matching is English text.** A ticked row named "No Traces" is detected the way No Traces already is in the Score flow. A renamed or mistyped row would be missed. Curly and straight apostrophes are handled.

## 4. Recommended bundles, ranked

### Bundle 1: Downtime "Heat & Hold" step (value High, effort Medium)

**Abilities:** Patron (4 crews), High Society, Just Passing Through, No Traces (the +1 Rep half), Fiends, Accord, plus the existing Reduce Heat and Assess hold entries.

**What it does:** the Score walk-through ends with a "Heat & Hold" card, named after the book's own phase (Deep Cuts p84, which holds Reduce Heat and Assess Hold). It lists only the sources this crew actually has, each as a one-click button. The same card is reachable from Adjust when there was no Score.

| Source | Wording in force | Button |
|---|---|---|
| Patron (Downtime on) | "reducing one crew upgrade cost by 2 -or- reducing your Heat by 2" (DC p88) | Heat -2, or a reminder that one upgrade costs 2 less |
| High Society | "During Downtime, name a member of the city's elite: If they have a positive opinion of you, take -1 Heat. If not, ask the GM: ..." | Heat -1 if positive; otherwise the three GM questions |
| Just Passing Through | "During downtime, take -1 heat." (unchanged by Deep Cuts) | Heat -1 |
| No Traces | "When you end downtime with zero Heat, take +1 Rep." (DC p88) | Rep +1, offered only when Heat is 0 |
| Fiends | "count each wanted level as if it was turf" | Assess hold counts Wanted as extra turf |
| Accord | "treat up to three +3 faction statuses you hold as if they are turf" | Assess hold buttons for 1, 2 or 3 statuses counted |

**Needs:** a "once per Downtime" ledger in script state. The Score flow starts a Downtime; an Adjust entry "Start Downtime" covers the other case. **Risks:** the ledger is new state; core Patron (Tier advancement at half cost) is not a Heat effect and the script has no Tier advancement, so it stays a reminder; Accord needs the number of +3 statuses from the player because faction Status is not on the crew sheet.

### Bundle 2: Score hooks (value Medium, effort Small to Medium)

| Ability | Crew | Hook |
|---|---|---|
| **Leverage** | Smugglers | **Auto.** "Whenever you gain rep, gain +1 rep." One extra Rep and one line in the Fallout card. Applied in Score only, so a manual Rep +1 correction is never doubled. |
| **Crow's Veil** | Assassins | **Button** in the Fallout card when the death Heat is above 0: "Crow's Veil protected the killer: remove the death Heat". Wording: "If there are no witnesses, these killings don't add extra Heat." The script cannot know who was consecrated. The core Score card gets the same button for its +2 killing Heat. Also an Adjust entry for the ritual cost (2 Coin). |
| **Emberdeath** | Assassins | **Button**: the ritual with the extra 4 Coin (6 Coin in all), next to Crow's Veil. |
| **Misdirection** | Vigilantes | **Button** after the Rep line: give up half the Rep gained so another faction loses Status instead. "Half" has no rounding rule in the sheet text, so it needs a ruling (I would round down). |

No Traces' Heat reduction is already built (Score takes 1 off the total).

### Bundle 3: Engagement roll that knows the plan type (value Medium for three crews, effort Medium)

**Abilities:** Predators (Assassins), Door Kickers (Bravos), Second Story (Shadows). All three add +1d to the engagement roll for a specific plan type.

**Today:** `2. Engagement` is the sheet's own macro with a free 0 to 6 dice prompt, so the player adds the +1d by hand.

**Option A (compose it):** prompts for plan type, Major Advantages and Major Disadvantages. Pool = 1 die for sheer luck, plus advantages, minus disadvantages (core Engagement Roll), plus 1 for each ticked ability that fits the plan. **Option B (keep native):** leave the macro and add a Status line for crews that have one of the three: "Engagement: Door Kickers gives +1d to an assault plan".

**Trade-off:** Option A replaces a native button with a longer one and needs a mapping the books leave loose (is every Stealth plan a "clandestine infiltration"?). Predators needs "stealth or deception plan whose goal is murder", a second question. I recommend B first and A only if forgetting turns out to be a real problem.

### Bundle 4: Small additions (value Low to Medium, effort Small each)

- **The Good Stuff** (Hawkers): a button that rolls a Fortune card with Tier+2 dice for product quality. Wording: "The product quality is equal to your Tier+2."
- **Pack Rats** (Shadows, Deep Cuts wording): "Once per Downtime, Acquire an item with Quality equal to your Tier+1 without spending Coin or using a Downtime activity." A once-per-Downtime button in Bundle 1's ledger that posts the card.
- **Status lines** for abilities in play, no state needed: Just Passing Through ("+1d to deceive while Heat is 4 or less": active or not), Slippery (done), Fiends and Accord (effective turf), Patron (available this Downtime).
- **Hooked** (Hawkers): +1 quality on gangs with the savage, unreliable or wild flaw, max 4. It means reading the cohort's free-text flaw field, which is fragile. Optional.
- **Favors, As Good as Your Word** (Vigilantes): "spend 1 Rep" buttons. Trivial and low value.

### Bundle 5: Deferred, needs a PC-to-crew link (value unknown, effort Large)

Forged in the Fire, Anointed, Bound in Darkness, Conviction, Blood Brothers, the seven rating bumps, Favors' action dot, Moral Compass. They change PC sheets: resistance dice, Edge, Harm, action ratings, XP triggers.

- **Forged in the Fire needs no code:** the PC sheet already has a "Resistance bonus" box per attribute (`setting_resbonus_insight`, `_prowess`, `_resolve`), and the PC script already adds it to its Resist roll. Entering +1 on each PC does the job.
- **Bound in Darkness and Conviction (Edge)** are the real candidates, and they matter more now that the Action module is on. They would need a crew roster (PCs added with selected tokens, kept in script state), a "begin score" action, and writes to the PC's `edge_amount` plus its bar 2. That crosses into the PC script's territory.

## 5. All 48 abilities

Verdict key: **Done** already in v0.1.0, **Auto**, **Button**, **Remind**, **Cross**, **Leave**. Value: H, M, L, or a dash.

### Assassins

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Deadly | +1 action rating to Hunt, Prowl or Skirmish, max 3 | Leave | - | One-time; the dots live on PC sheets |
| Crow's Veil | Ritual (Downtime activity + 2 Coin) hides a member's killings; no witnesses, no extra Heat | Button | M | Bundle 2. Saves 4 Heat |
| Emberdeath | Crow's Veil ritual plus 4 Coin makes an empowered weapon | Button | L | Bundle 2 |
| No Traces | Downtime on: -1 to Heat taken; ending Downtime at 0 Heat gives +1 Rep | Done + Button | M | -1 Heat is built. The +1 Rep goes in Bundle 1. Core wording (half the target's rep for a quiet job) is not tracked |
| Patron | See Patron below | Button | H | Bundle 1 |
| Predators | +1d engagement for stealth or deception plans to commit murder | Button | M | Bundle 3, Option A or B |
| Vipers | +1 result level to acquire or craft poisons; immune to your poison | Leave | L | Result-level bonus; Acquire is diceless with Downtime on |
| Veteran | Take an ability from another crew | Leave | - | |

### Bravos

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Dangerous | +1 rating to Hunt, Skirmish or Wreck | Leave | - | |
| Blood Brothers | Action on: a PC may mark Harm on a cohort instead; cohorts get Thugs free. Core: +1d on teamwork | Cross | L | Needs PC Harm and cohort harm boxes together |
| Door Kickers | +1d engagement for assault plans | Button | M | Bundle 3 |
| Fiends | Count each Wanted level as turf; max Wanted is 4; min rep cost to advance Tier is 6 | Auto | M | Bundle 1: Assess hold adds Wanted to turf. Tier advancement is not built |
| Forged in the Fire | PCs get +1d to resistance rolls | Leave | - | Set the sheet's Resistance bonus on each PC (Bundle 5 note) |
| Patron | See Patron below | Button | H | Bundle 1 |
| War Dogs | At war (-3 Status): no -1 hold, PCs keep two Downtime activities | Leave | L | War and Status are not tracked on the crew |
| Veteran | | Leave | - | |

### Cult

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Chosen | +1 rating to Attune, Study or Sway | Leave | - | |
| Anointed | Harm on: choose ghost, vampire or demon; Harm from that type is one level lower. Core: +1d resist vs the supernatural | Cross | L | Touches PC Harm or resistance |
| Bound in Darkness | Action on: each PC gains 1 Edge at the start of a score; Edge transfers freely | Cross | M | Edge on PC sheets; needs a roster and a "begin score" action |
| Conviction | Extra Vice (Worship); with a pleasing sacrifice you cannot overindulge and gain 1 Edge | Cross | L | The PC script has no Vice flow |
| Glory Incarnate | The deity sometimes manifests | Leave | - | Pure fiction |
| Sealed in Blood | Each human sacrifice gives -3 stress cost on a ritual | Leave | - | Ritual stress is a PC cost |
| Zealotry | Cohorts get +1d against enemies of the faith | Remind | L | Could be a cohort-roll entry |
| Veteran | | Leave | - | |

### Hawkers

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Silver Tongues | +1 rating to Command, Consort or Sway | Leave | - | |
| Accord | Up to three +3 faction Statuses count as turf | Button | L | Bundle 1: the player says how many; Status is not on the crew sheet |
| The Good Stuff | Product quality equals Tier+2 | Button | M | Bundle 4: a Fortune card with Tier+2 dice |
| Ghost Market | Prepare product for ghosts and demons | Leave | - | Pure fiction |
| High Society | Downtime: name an elite; positive opinion gives -1 Heat | Button | M | Bundle 1 |
| Hooked | Gangs with the savage, unreliable or wild flaw get +1 quality, max 4 | Auto | L | Bundle 4, optional: reads a free-text field |
| Patron | See Patron below | Button | H | Bundle 1 |
| Veteran | | Leave | - | |

### Shadows

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Everyone Steals | +1 rating to Prowl, Finesse or Tinker | Leave | - | |
| Ghost Echoes | See the ghost field's echo of Doskvol | Leave | - | Pure fiction |
| Pack Rats | Once per Downtime, acquire a Tier+1 item free, no activity | Button | L | Bundle 4, in the Bundle 1 ledger |
| Patron | See Patron below | Button | H | Bundle 1 |
| Second Story | +1d engagement for a clandestine infiltration | Button | M | Bundle 3 |
| Slippery | Downtime on: effective Wanted is one lower (up to 5); entanglement costs are 1 less. Core: roll entanglements twice, +1d reduce Heat | Done (Downtime) | M | Effective Wanted and the Bluecoats line are built. The core "roll twice" is an Auto candidate (two dice sets, two lookups) only if a Shadows crew stays on core rules |
| Synchronized | Action on: 6s from any teammate can be distributed. Core: several 6s in a group action count as a critical | Leave | L | Needs a group-action roller, which belongs to the PC script |
| Veteran | | Leave | - | |

### Smugglers

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| Like Part of the Family | A vehicle cohort with quality Tier+1 | Remind | L | The cohort roll already gives +1 for an expert type. Vehicle flaws Costly (1 Coin per Downtime) and Distinct (+1 Heat when used) could show as Status lines |
| All Hands | A cohort may take an additional Downtime activity to Acquire or Work | Remind | L | Cohort activities are not modelled |
| Ghost Passage | Immune to possession, may carry a ghost | Leave | - | Pure fiction |
| Just Passing Through | Downtime: -1 Heat. Heat 4 or less: +1d to pass as ordinary citizens | Button | M | Bundle 1, plus a Status line |
| Leverage | Whenever you gain Rep, gain +1 Rep | Auto | M | Bundle 2 |
| Reavers | Vehicle conflict: +1 Quality to damage and speed, +1 armor | Leave | L | In-play vehicle numbers |
| Renegades | +1 rating to Finesse, Prowl or Skirmish | Leave | - | |
| Veteran | | Leave | - | |

### Vigilantes

| Ability | Wording in force (short) | Verdict | Value | Notes |
|---|---|---|---|---|
| As Good as Your Word | Spend Rep as Coin in Downtime; Obligation is a second vice | Button | L | Mostly covered: Deep Cuts already lets extra activities and Reduce Heat cost Coin or Rep |
| Avengers | +1 rating to Hunt, Prowl or Command | Leave | - | |
| Thorn in your Side | Against a higher-Tier faction, Stealth or Assault plans count your Tier as +1 | Remind | L | Could be a Tier roll entry |
| Misdirection | Sacrifice half the Rep gained so another faction loses Status | Button | L | Bundle 2; needs a rounding ruling |
| Uncanny Preparation | Twice per session in a Desperate action, improve effect or position | Leave | L | A per-session counter with a manual reset; low value |
| Moral Compass | Each PC gains an extra XP trigger | Leave | - | PC XP |
| Favors | Spend 1 Rep: everyone gets one dot in a contact's action for this score | Button | L | Bundle 4; the dot is a PC-sheet change |
| Roots | Downtime: a contact or cohort takes an activity to acquire, reduce Heat or recover | Remind | L | |
| Veteran | | Leave | - | |

### Patron (Assassins, Bravos, Hawkers, Shadows)

| Rule set | Wording | Hook |
|---|---|---|
| Downtime on | "benefactor that helps your crew in Downtime by reducing one crew upgrade cost by 2 -or- reducing your Heat by 2" | Button in Bundle 1: Heat -2, once per Downtime. Upgrade discount as a reminder |
| Downtime off | "When you advance your Tier, it costs half the coin it normally would." | Remind only; Tier advancement is not built |

## 6. Tally

| Verdict | Abilities |
|---|---|
| Done | 2 (No Traces' Heat, Slippery's effective Wanted) |
| Auto | 3 (Fiends, Leverage, Hooked) |
| Button | 14 |
| Remind | 5 |
| Cross | 4 |
| Leave | 20 |
| **Total** | **48** |

So 19 abilities have a hook and 17 are new work. Bundles 1 and 2 hold 9 of them (Patron, High Society, Just Passing Through, Fiends, Accord, Leverage, Crow's Veil, Emberdeath, Misdirection), Bundle 3 holds 3 (Predators, Door Kickers, Second Story) and Bundle 4 holds 5 (The Good Stuff, Pack Rats, Hooked, Favors, As Good as Your Word). I would drop Favors and As Good as Your Word first. No Traces' extra +1 Rep button is counted under Done. Bundles 1 to 3 give every crew type except Cult at least one hook.

## 7. What I would not build, and why

- **Seven rating bumps** (Deadly, Dangerous, Chosen, Silver Tongues, Everyone Steals, Renegades, Avengers): done once when taken, on PC sheets, by the player.
- **Pure fiction** (Ghost Echoes, Ghost Market, Ghost Passage, Glory Incarnate, Sealed in Blood): no number to change.
- **Synchronized:** the core and Deep Cuts versions both need a group-action roller across several PCs. That is a PC-script feature, and a large one.
- **Vipers and the core halves of Slippery and Pack Rats:** they attach to rolls that Deep Cuts Downtime removes.
- **War Dogs, Accord (automatic form), the Deep Cuts "+2 Status with a Tier 3+ faction" Heat reduction:** all need faction Status, which the crew sheet does not hold.
- **Per-session counters** (Uncanny Preparation): value too low for the state they need.

## 8. Questions that decide the plan

1. **Which crews are actually in play?** The bundles pay off per crew type. What type is `crew new`, and which of the seven do you expect to run in the next few months?
2. **Will every crew move to the Deep Cuts modules?** If yes, I skip the core variants (core Patron, core Slippery double roll, core Pack Rats, core No Traces) and the work shrinks.
3. **Auto or button?** I propose Auto only for unconditional rules (Leverage, Fiends) and Buttons wherever the table decides (Crow's Veil, High Society, Patron, Misdirection). Agree?
4. **Once-per-Downtime ledger:** OK to add it to script state, started by a Score or by a "Start Downtime" Adjust entry?
5. **Engagement:** compose it (Option A) or keep the native macro and add reminders (Option B)?
6. **PC-to-crew link:** is there any appetite for a crew roster, mainly for Cult Edge? Without it, Cult stays manual.
7. **Rulings I need:** how to round "half the Rep gained" (Misdirection), and where Accord's "+3 statuses" should come from (a prompt each time, or the Faction Status sheet).
