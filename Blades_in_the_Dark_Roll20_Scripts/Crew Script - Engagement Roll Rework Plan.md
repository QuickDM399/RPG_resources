# Crew Script: Engagement Roll Rework (v0.5.0)

**Status: approved, then built as v0.5.0 (mock tested; nothing run in the live game).** Every crew needs `~ Rebuild`. The answers:

| Decision | Answer | In v0.5.0 |
|---|---|---|
| 1. Prompts replaced | "Correct" | The Net dice and murder prompts are gone; Predators is a button |
| 2. Other elements range | Yes, -3 to +3 | Seven options, 0 first |
| 3. Asking method | Buttons | A card with buttons, only when something applies |
| 4. Party abilities | Yes, both; each PC counts once | Weaving the Web and Eye for Weakness, one button per PC ability, each +1d |
| 5. Eye for Weakness with a weak-point answer | Yes, stack | Both count |
| 6. Who sees the follow-up card | "Show to all" | A public card (not a whisper) |
| 7. Outcome after the roll | Yes | The position is named from the dice. I made it a public card too, to match decision 6; say so if you would rather it were a whisper |

One detail beyond the plan: the follow-up card reposts after each button, so the chat shows the card a few times. The newest one is current; an older card's Roll button rolls the current total, not the number on the old card. The labels read "Roll" with no number for that reason.

The proposal as first written follows.

---

# Proposal (as written before the answers)

Status at that time: **proposal for approval.** No code had been touched. Rules are quoted from your core book (`bladesinthedark_v8_2`), Deep Cuts Part Two, or the sheet text; each row says which. Where I am inferring, it says so. If this is approved it ships as v0.5.0 and every crew needs `~ Rebuild`, because the macro changes.

## 1. Bottom line

- **The macro becomes the book's own questions.** `2. Engagement` asks the plan type and the four Major Advantages and Disadvantages questions you pasted (core book, Engagement Roll). That is 5 prompts. Each of the first three questions is a three-way answer (+1d, neither, -1d). The fourth, "other elements", is a number.
- **The script then adds what it can find.** Abilities and claims on the crew sheet that fit the plan type are added automatically, as today. Abilities that depend on a fact only the table knows are **asked in a follow-up card with buttons**, and only when one applies. That covers Predators (the goal is murder) and the two party-member abilities I found.
- **One consequence to know about:** the macro no longer depends on which crew abilities are ticked. Today a crew with a Predators row gets an extra prompt, and adding the row later makes the macro stale. Under this plan every crew gets the same 5 prompts, so that failure goes away.
- **Two readings of your sentence.** I took "the abilities question" to mean the **Net dice** prompt (its label mentions PC abilities). I also propose to drop the **murder** prompt, because it is also an abilities question and the follow-up card replaces it. Tell me if you meant only the first.

## 2. What the books and sheet say

**The four questions (core book, Engagement Roll, p128).** Starting pool 1d for sheer luck, then +1d for each Major Advantage and -1d for each Major Disadvantage:

| # | Question | +1d | -1d |
|---|---|---|---|
| 1 | Approach | Particularly bold or daring | Overly complex or contingent on many factors |
| 2 | Plan detail against the target | Exposes a vulnerability or hits them where they are weakest | The target is strongest against this approach, or has special defenses or preparations |
| 3 | Friends and enemies | Friends or contacts provide aid or insight | Enemies or rivals interfere |
| 4 | Other elements | For example a lower-Tier target | For example a higher-Tier target, or a district situation |

The book's worked examples treat these as stackable single dice ("1d base, -1d for the enemy's strength, +1d for the vulnerability").

**Why the fourth question should allow more than one die.** The core book's district text says "Most engagement rolls suffer -1d due to heavy Bluecoat patrols" for Brightstone and "-2d" for Whitecrown. Add a higher-Tier target (-1d) and the "other elements" total reaches -3. That is why I propose -3 to +3 (decision 2).

**Nothing else in the books changes the roll.** I searched the core book for "engagement": the roll rules, the claims and crew abilities already built, Spider's Weaving the Web, the district notes above, a failed setup maneuver ("give the engagement roll -1d") and long-term projects ("your engagement roll will have more dice"). The last two are table events and belong in question 4 or question 2. Deep Cuts Part Two repeats Weaving the Web with the same wording and otherwise uses the word "engagement" in an unrelated sense, so it does not change this roll.

**Abilities of party members that affect the roll.** I searched every playbook ability on the sheet. Two do:

| Ability | Playbook | Wording | Source |
|---|---|---|---|
| **Weaving the Web** | Spider | "You gain +1d to Consort when you gather information on a target for a score. You get +1d to the engagement roll for that operation." | Core book and sheet |
| **Eye for Weakness** | Rafiq | "When you gather information about someone's vulnerabilities, you get +1 effect. If you use this information to help plan a score, you also get +1d to the engagement roll for that operation." | **Sheet only**, not in either book |

Both depend on something that happened earlier (information gathered for this score), which the script cannot see. So they are asked, not assumed.

## 3. The flow as the player sees it

1. Click `2. Engagement`. Five prompts, "Neither" or 0 first in each so the default is no change:
   - Plan type (the six).
   - Bold or daring (+1d) or complex and contingent (-1d).
   - Plan detail: hits a weakness (+1d) or target strongest against it (-1d).
   - Friends help (+1d) or enemies interfere (-1d).
   - Other elements: -3 to +3.
2. The script works out the pool: 1 luck, the four answers, plus every ticked crew ability and claim that fits the plan type (Door Kickers, Second Story and the seven claims).
3. **If nothing needs asking, it rolls at once**: the arithmetic card, then the roll card, exactly as v0.4.1 does now.
4. **If something needs asking**, you get a whisper first, for example:

   > Engagement, stealth plan. So far: 1 luck, +1 bold or daring, +1 Second Story = 3d.
   > Confirm what applies (each once): [Predators: the goal is murder, +1d] [Ayla, Weaving the Web: gathered information, +1d]
   > [Roll 3d]

   Each button you click adds its die and reposts the card with the new total and that button gone. **Roll** posts the public arithmetic card and the roll. Nothing rolls until you click Roll.
5. The public arithmetic card lists every answer and source, so the table can see where each die came from, for example "Stealth plan: 1 luck, +1 bold or daring, -1 target's strongest defense, +1 Second Story, +1 Ayla's Weaving the Web = 3d."

## 4. Which sources are automatic and which are asked

| Source | How it is handled | Why |
|---|---|---|
| Door Kickers | Automatic on an assault plan | Plan type decides it (your earlier ruling for Second Story applies the same way) |
| Second Story | Automatic on a stealth plan | Your ruling |
| The seven claims (plan types as built) | Automatic when ticked and the plan fits | Plan type decides it |
| **Predators** | **Asked** (a button), offered only on a stealth or deception plan | It needs "the goal is murder" |
| **Weaving the Web** | **Asked**, one button per Party PC who has it ticked | Needs "gathered information for this score" |
| **Eye for Weakness** | **Asked**, one button per Party PC who has it ticked | Needs "used what you learned to plan" |

River items stay out, as you decided.

## 5. How it would be built

- **Macro:** `!bitdcrew engagement <plan> <q1> <q2> <q3> <other>`. A macro with any other number of answers says "Run ~ Rebuild" and rolls nothing, as now. The Predators-dependent prompt and `hasMurderRow` go away.
- **Answers and checks:** q1 to q3 must be -1, 0 or 1; other must be -3 to 3; the plan must be one of the six.
- **Source table:** the current table gains an `ask` flag for Predators, and a short second table lists the two party abilities.
- **Party abilities are read from the PC sheets:** the script already finds Party PCs (the Party flag passed your live test; crew sheets marked as party members are not counted). For each, a ticked ability row is `repeating_ability_<row>_name` with `_check` equal to 1, the same test the PC script uses to list a PC's abilities. Names are matched as normalized English text, as crew abilities are. A hand-typed Veteran ability works if its name matches. **Read-only: nothing is written to a PC sheet.**
- **Follow-up card:** a flow record in the script's state (the same mechanism as the Payoff walk-through, last 40 kept) holds the plan, the pool so far, the lines for the arithmetic, and which extras are still unclicked. New verbs `engagement` (start), `engadd` (add one extra) and `engroll` (post the roll), each protected so a button works once. Players can use it only on crews they control, as every other verb.
- **Public output:** unchanged in form: the arithmetic card (type Engagement, title "3d") then the sheet's engagement roll card.
- **Not changed:** the crew sheet, the sheet's own Engagement button, any PC attribute, the Score flow.

## 6. Risks and open points

1. **Five prompts every time.** That is what you asked for. The Score already has seven. "Neither" first in each keeps the click path short.
2. **Ability names on the PC sheets.** If a party PC's ability text differs from "Weaving the Web" or "Eye for Weakness", it is not offered. I will check the live sheet text in the live test, and a `!bitdcrew debug on` line will name the PCs and abilities it found.
3. **Stale macro after the change.** Every crew needs `~ Rebuild` once. Old macros are refused with a clear message.
4. **Two PCs with the same ability.** The books do not say whether both dice count (decision 4).
5. **Eye for Weakness is not in either of your books.** It is on the sheet, so I treat its wording as in force, as I did for Publicity and Misdirection.
6. **Roll20 prompt limits.** Prompt labels cannot contain a pipe or brace, and an option can have only one comma. The wording in section 3 keeps to that.

## 7. Tests I would write

- Every combination boundary of the four answers (a pool built from -1/0/+1 answers and -3 to +3), including zero and negative pools (2d, keep the lowest).
- Each plan type with each automatic source (the existing matrix, re-run through the new macro).
- The follow-up card: appears only when a source is available; Predators only on stealth or deception; one button per Party PC ability; each button once; the total and button list update; Roll posts the cards once; a second Roll refuses; a stale card refuses.
- Party reading: unticked ability ignored; a crew sheet marked as a party member ignored; a non-party PC ignored; name matching (case, spacing, line breaks); no write to any PC attribute (snapshot test).
- Old and wrong argument counts refused; invalid answers refused; permission checks; a core crew (Downtime off) works.
- Mutation checks for each of the above, then new rows in the live test plan: one for the prompts and the arithmetic, one for the follow-up card with a Spider PC and a Rafiq PC (or hand-typed ability rows).

## 8. Decisions I need

1. **Prompts replaced.** Replace the Net dice prompt and the murder prompt (Predators becomes a button)? I recommend yes. Or replace only Net dice and keep the murder prompt?
2. **"Other elements" range.** -3 to +3? I recommend yes (district penalties of -1d and -2d plus a higher-Tier target reach -3).
3. **Asking method.** Follow-up card with buttons, only when something applies? I recommend yes. The alternative is extra prompts built at Rebuild for each ability present, which go stale whenever the party or the ticks change.
4. **Party abilities.** Include both Weaving the Web and Eye for Weakness? I recommend yes. If two Party PCs have the same ability, does each give +1d? I recommend yes, each PC counts once.
5. **Eye for Weakness against question 2.** Does the ability's +1d stack with a "weak point" answer of +1d? I recommend yes, since the ability says "also".
6. **Who sees the follow-up card.** The player who clicked, by whisper? I recommend yes.
7. **Optional, not in this plan unless you say so:** after the roll, read the dice and whisper the outcome from the book (1-3 desperate, 4/5 risky, 6 controlled, critical). It reuses the income roll's dice reader. I recommend adding it, as a separate step after this one.
