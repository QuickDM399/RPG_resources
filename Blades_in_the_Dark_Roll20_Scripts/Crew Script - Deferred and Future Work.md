# Crew Script: Deferred and Future Work

A record of what is deliberately not built, and of the parts planned for later. Nothing here is built. Anything marked "future part" needs its own plan and your approval before code, as every other bundle did.

## 1. Future part: complete the Heat and Hold phase (Deep Cuts p84 and p88)

**Rules, as you pasted them (checked against the Deep Cuts text):**

- **p84, Heat and Hold, reduce heat:** "For each +2 Status (or more) you have with a Tier 3+ faction, reduce Heat by 1. The crew may further reduce Heat by 1 for each Coin or Rep they expend. Ask the GM if there's anything else you can do to reduce Heat (like silencing a witness), what the cost or potential consequence is, and how much Heat it will remove."
- **p84, assess hold:** "Your crew's hold on their Tier is measured by your number of turf claims. To have strong hold on your Tier, you must have a number of turf claims equal to or greater than your Tier. While your number of turf claims is lower than your Tier, your hold is weak."
- **p88, system changes:** "A mechanic which gives +1d to reduce Heat rolls instead lowers Heat by 1 during the Heat & Hold phase (page 84). +1d to healing rolls instead counts as 1 tick on the healing clock."

**Built today:** spending 1 Coin or 1 Rep for Heat -1, Just Passing Through, Assess hold, End Downtime.

**Not built, for the future part:**

1. **Status-based reduction** ("each +2 Status with a Tier 3+ faction, reduce Heat by 1"). The crew sheet does not hold faction Status. I do not know whether the game's faction sheets record Status with the crew, so the first step would be to look at them and ask you where the numbers live (a prompt each time is the fallback).
2. **"Ask the GM" line.** A one-line reminder on the Heat and Hold card for other ways to reduce Heat (silencing a witness) with the GM naming the cost and the Heat removed. Trivial; no state.
3. **Mechanics that gave +1d to a Reduce Heat roll, which now lower Heat by 1 in this phase.** In your sheet and books:

| Source | Wording | Status |
|---|---|---|
| **Hagfish Farm** (claim; Assassins, Shadows) | Core book: "When you use the reduce heat downtime activity after a score that involves killing, you get +1d to the roll and quiet, convenient disposal of any corpses". Sheet: "Body disposal, +1d to reduce heat after killing" | **You want this automated, correctly, in the future part.** Not built now |
| Slippery (core wording) | "When you reduce heat on the crew, take +1d" | Deep Cuts replaces Slippery's text with the effective Wanted rule, which is built. Nothing to do |
| Roots plot "A Religious Meal" | "+1d to reduce heat with religious contacts" | Roots crew; on hold with the other community crews |
| River Detective Inspector | "Maximum 1d on Reduce Heat" | River; on hold |

**Superseded in v0.9.3:** you ruled that the Deep Cuts crew sheets (v1.2b) are right: Hagfish Farm reads "Body disposal + counts as turf" and has no Reduce Heat bonus, so there is nothing to automate here and the button below is dropped. The sheet-only wording and the turf count are handled in the claim card and `9. Status`.

**Proposed shape for Hagfish Farm (no longer planned):** a once-per-Downtime button in the Heat and Hold card, "Hagfish Farm: Heat -1", offered when the Score that started this Downtime recorded a death. The Fallout prompt already asks "Death in connection to the score", and the Downtime ledger can keep that answer. Questions for then: does "a score that involves killing" mean exactly the Death answer, and is the button also offered when Downtime was started by hand (no Score)? I would ask rather than guess.

4. **Healing.** "+1d to healing rolls instead counts as 1 tick on the healing clock" (Infirmary and Sacred Nexus claims, Anointed and Physicker). The healing clock lives on PC sheets, so this belongs with the PC-facing work, not the crew script.

## 2. On hold: River, Emcees and Roots

You asked me to hold anything River, and said you could not find the rules. What I found:

- **No rules text in either book.** Neither the core book (`bladesinthedark_v8_2`) nor Deep Cuts Part Two mentions the River, Emcees or Roots crews, Deadly Focus, or any of the River claims. I do not know which supplement they come from.
- **What the sheet has for River** (one-line descriptions only, no explanation of how they work): the crew type "River" ("the ready oppressed"; favored method: Murder, Battle, Sabotage, Redistribution; XP trigger: execute a successful foment, murder, or overthrow operation); the ability Deadly Focus ("When you set out to murder one of your Claim targets, take +1d to the engagement roll"); and a set of claims that mostly read as restrictions rather than benefits: The Governor (-1d to Engagement rolls), Chief Magistrate (+1 heat per score), Detective Inspector (maximum 1d on Reduce Heat), Editor-in-Chief (maximum 1 Rep per score), State Treasurer (maximum 2 Coin per score), Financier (maximum 2 Coin in holding), Cartel Leader (maximum 0d to Acquire Asset), Chief Legislator (maximum 1d on Long Term Project), Surgeon General (maximum 1d on Recovery), Land Owner (-1d to Command, Consort and Sway vs. gentry), The General (cohorts always Tier 0), The Mayor (+1d to Entanglement rolls).
- **Why I stopped:** whether a River crew holds these claims as burdens, whether removing them is the crew's goal, and how they interact with turf and Tier is not stated anywhere I can read. I will not guess at it. If you find the source, send me the page and the claims can be planned properly.
- **Emcees and Roots** are also sheet-only. Roots has "plots" (a benefit with a sacrifice, for example "Simple Fare: -1 heat per score, sacrifice: An Innocent"). Same position: no rules text to check against.
- **Info Biz** (an Emcees income claim) is not in the core book and is not offered as an income claim.

## 3. Decided not to build

- **Bundle 4:** The Good Stuff, Pack Rats (the Deep Cuts text stays on the sheet as a reminder), Hooked, Favors, As Good as Your Word.
- **Bundles 1 and 2:** Patron, High Society, Fiends, Accord, Crow's Veil, Emberdeath.
- **Cross-script, not worth the cost:** Conviction, Anointed, Blood Brothers, Synchronized, Moral Compass, the seven rating bumps. Forged in the Fire needs no code: enter +1 in each PC's Resistance bonus boxes once.
- **The core Payoff walk-through** (core crews keep the Heat-only Score).

## 4. Needs something the books or sheets do not give me

- **Faction Status** (needed for Status-based Heat reduction, War Dogs, Accord, Misdirection's actual effect). Not on the crew sheet.
- **Tier advancement and Development** (Deep Cuts p83). The script has no Tier advancement flow.
