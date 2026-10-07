# Crew Abilities, Bundles 1 and 2: Build Plan (v0.2.1)

**Status: approved with changes, then built as v0.2.0 (mock tested; nothing run in the live game).** Section 0 records what was approved and what was dropped. Where the original proposal below differs from section 0, section 0 wins.

## 0. Approved scope and decisions

| Row | Ability | Decision | In v0.2.0 |
|---|---|---|---|
| A | Patron | Do not automate, do not code | No |
| B | High Society | Do not automate, do not code | No |
| C | Just Passing Through | Approved | Heat and Hold button, once per Downtime; Status line for its +1d |
| D | No Traces | Approved | End Downtime gives +1 Rep at Heat 0 (the Heat half existed) |
| E | Fiends | Do not automate, do not code | No |
| F | Accord | Do not automate, do not code | No |
| G | Leverage | Approved | +1 Rep on every Rep gain the script makes |
| H | Crow's Veil | Do not automate, do not code | No (so no Score pause step) |
| I | Emberdeath | Do not automate, do not code | No (so no ritual buttons in `5. Abilities`) |
| J | Misdirection | Approved | Button after the Score; gives up half the Rep earned (the card's figure, v0.2.1), rounded down |
| K | Downtime ledger | Not listed. Kept, because Just Passing Through and No Traces need it | Yes |

| Decision | Answer |
|---|---|
| 1. Payoff count | Allow "All party members", and keep fixed counts 1 to 8 because not every PC is on every score. The prompt is "PCs for the Payoff (1 Coin each)" |
| 2. Misdirection rounding | Round down. v0.2.1: half of the Rep earned as the card shows it, not half of what fit under 12 (user chose B after the first live test) |
| 3. Optional Status button (Heat -1 per +2 Status with a Tier 3+ faction) | Leave out |
| 4. After each Heat and Hold click | Repost the card (default) |
| 5. Which crew applies to the party | The crew sheet marked "Party member" (a later feature, no code now) |

**What the Heat and Hold card became:** Heat and Wanted, Reduce Heat by spending 1 Coin or 1 Rep, Just Passing Through (when ticked and Heat is above 0), Assess hold (the existing Deep Cuts rule, unchanged), End Downtime. **Not built** because their rows were dropped: Patron, High Society, Fiends and Accord buttons, the Crow's Veil pause, the ritual buttons, and any Fiends or Accord change to Assess hold.

**Built beyond the rows:** the party probe (`!bitdcrew party`, GM only), the debug switch (`!bitdcrew debug on|off`), and the Payoff prompt change. Sections 4.1 to 4.7 below describe the original design; sections 4.4 (Crow's Veil pause), 4.5 and the Fiends and Accord parts of 4.3 were not built.

## 1. What your answers decided

| Question | Your answer | Effect on the plan |
|---|---|---|
| `crew new` type | Bravos, not sure; assume any | Every ability is keyed on its ticked name, never on the crew type (this also covers Veteran) |
| Move all crews to Deep Cuts modules | Yes | New features are Downtime-on only. The core variants (core Patron, core Slippery, core Pack Rats, a core Crow's Veil Score button) are dropped. Crews with Downtime off keep today's behaviour |
| Once-per-Downtime ledger | Yes | Section 4.2 |
| Engagement | Composed by the script | Bundle 3, not in this plan. Noted for later |
| PC-to-crew link | Yes, via Roll20's party designation | Section 5. Only a small foundation is in this plan; the PC effects (Forged in the Fire, Edge) are Bundle 5 |

## 2. Scope

**In:** Patron, High Society, Just Passing Through, No Traces' +1 Rep, Fiends, Accord (Bundle 1); Leverage, Crow's Veil, Emberdeath, Misdirection (Bundle 2); the Downtime ledger; a party probe; one wording fix to the Payoff prompt (section 5).

**Out:** Bundles 3 to 5, Tier advancement, anything that writes to a PC sheet, any change to the PC script, core-rules variants.

## 3. Rules for your approval

Wording is quoted from Deep Cuts (book pages), the core book, or the text now on your sheets (the PC script's fixer puts the Deep Cuts wording on Crow's Veil, Emberdeath, High Society and Pack Rats on every crew). The last column is my reading where the wording leaves room.

| # | Ability | Wording | Behaviour I would build | My reading |
|---|---|---|---|---|
| A | **Patron** | "You have a benefactor that helps your crew in Downtime by reducing one crew upgrade cost by 2 -or- reducing your Heat by 2." (p88) | Heat & Hold button **Heat -2**, or **an upgrade costs 2 less** (a note; upgrades are paid by hand). Either one uses it up for this Downtime | Once per Downtime. The book does not say "once", but "in Downtime ... one upgrade -or- Heat" reads that way |
| B | **High Society** | "During Downtime, name a member of the city's elite: If they have a positive opinion of you, take -1 Heat. If not, ask the GM: Who are they connected to, and what's the nature of the relationship? What scandal, rumor, meeting, or liaison do they wish we didn't know about? Is there a way for us to profit from them?" | Two buttons: **positive opinion, Heat -1**, or **not positive**, which shows the three GM questions. Either uses it up | Once per Downtime |
| C | **Just Passing Through** | "During downtime, take -1 heat. When your heat is 4 or less, you get +1d to deceive people when you pass yourselves off as ordinary citizens." (unchanged by Deep Cuts) | Button **Heat -1**, once per Downtime. Status shows whether the +1d is active (Heat 4 or less) | Once per Downtime |
| D | **No Traces** | "When you take Heat in Downtime, reduce the total by 1. When you end downtime with zero Heat, take +1 Rep." (p88) | The Heat half is already built. New: **End Downtime** gives +1 Rep if Heat is 0 at that moment | The End Downtime button is the trigger for "end downtime" |
| E | **Fiends** | "You may count each wanted level as if it were turf. The maximum wanted level is 4." (core book, Bravos) | Assess hold counts turf + Wanted. The card shows both parts | Uses the actual Wanted level, not the Slippery effective one |
| F | **Accord** | "You may treat up to three +3 faction statuses you hold as if they are turf. If your status changes, you lose the turf until it becomes +3 again." (core, Hawkers) | Assess hold shows buttons for 1, 2 or 3 statuses counted. Nothing is stored | Faction Status is not on the crew sheet, so you tell me how many each time |
| G | **Leverage** | "Whenever you gain rep, gain +1 rep." | +1 Rep on every Rep gain the script makes (the Score, No Traces at End Downtime). Not on a manual Adjust Rep +1, and not when the gain is 0 | "Whenever you gain" applies to each gain |
| H | **Crow's Veil** | "Use a Downtime activity and spend 2 Coin to perform this occult ritual to consecrate a member of the crew. Until their next Downtime, any killings they commit will be hidden from the notice of the Deathseeker Crows. If there are no witnesses, these killings don't add extra Heat to the crew." | In `4. Score`, when Crow's Veil is ticked, Death is above 0 and Witnesses is None, the score **pauses before Heat is applied** and asks: killer consecrated (no death Heat) or not. A ritual button in `5. Abilities` spends the 2 Coin | The waiver needs no witnesses, so any witnesses answer skips the question |
| I | **Emberdeath** | "When you perform the Crow's Veil ritual, you may spend +4 Coin on rare arcane materials to create an empowered weapon which causes a named victim and their spirit to disintegrate in a shower of sparking embers at the time of death. This empowerment lasts until your next downtime." | `5. Abilities` button **ritual with Emberdeath: spend 6 Coin** (2 + 4) | The 4 Coin is on top of the ritual's 2 |
| J | **Misdirection** | "At the end of a score, you may sacrifice half the rep gained to make another faction lose status with your target instead of your crew. How do you pin it on someone else?" (sheet wording; the core book has no Vigilantes text) | After the Rep is applied, a button **give up half the Rep gained**. It lowers Rep and tells you to name the faction. The Status change is not tracked | Rounding is not given. I would give up the **smaller half** (round down) |
| K | **Ledger** | n/a | A Downtime starts at a Score or by "Start Downtime" and ends at "End Downtime" or the next start | See 4.2 |

Also in the Heat & Hold card, already sourced in Deep Cuts p84: **Reduce Heat 1 per Coin or Rep spent** (buttons that call the existing entries) and, optionally, **Heat -1 for each +2 Status with a Tier 3+ faction** (a button you press once per faction; Status is not tracked).

## 4. Design

### 4.1 Ability detection
One helper reads the crew's ticked ability rows once per command and returns a set of normalized names (curly and straight apostrophes treated alike). Every hook asks the set. This generalises the existing Slippery and No Traces checks. Click-time reads mean a newly ticked ability works without a Rebuild.

### 4.2 Downtime ledger
- **Shape:** `state.BitDCrewTAM.downtime[crewId] = { id, at, used: {}, log: [], startHeat, ended }`. One record per crew, so the state cannot grow.
- **Start:** a Deep Cuts `4. Score` starts one (replacing any earlier record). New Adjust entry **Downtime: start a new Downtime** starts one without a Score. Opening Heat & Hold with no record starts one and says so.
- **Use:** every Heat & Hold button carries the record's id. A click applies once, marks `used`, and appends a line to `log`. A click carrying an old id, or after End, answers "that Downtime has ended" and changes nothing.
- **End:** **End Downtime** applies No Traces' +1 Rep if Heat is 0 (plus Leverage's +1 if ticked), closes the record, and posts a public summary built from `log`: Heat after the Score and at the end, each ability used, Rep gained, hold.

### 4.3 The Heat & Hold card
Whispered to the clicker. Offered automatically after the last Score step (Deposit), and from Adjust as **Downtime: Heat & Hold**. Sections, each shown only when it applies:
1. Heat and Wanted now.
2. **Reduce Heat:** spend 1 Coin, spend 1 Rep (the existing logic), and the optional Status button. Hidden at Heat 0.
3. **Your abilities** (ticked and unused): Patron, High Society, Just Passing Through, each with its one-line wording and buttons. Heat buttons say "Heat is only N" when N is below the reduction.
4. **Hold:** the line "turf T + Wanted W (Fiends) + k (Accord) = E against Tier N: strong or weak", an **Assess hold** button, and Accord's 1/2/3 buttons when Accord is ticked.
5. **End Downtime.**
After each click the script posts a one-line confirmation and a fresh card showing what is left. Buttons in older cards are safe (the ledger refuses repeats).

### 4.4 Score changes (`4. Score`, Downtime on)
- **Refactor** the Deep Cuts Score into two steps so a decision can sit before Heat is applied: gather and validate, then apply.
- **Crow's Veil pause:** only when ticked and Death above 0 and Witnesses None. The card shows the two Heat totals (with and without the death Heat) and two buttons. Nothing is applied until you click, so no undo of a Wanted level is ever needed. If Witnesses is not None, the Fallout card says Crow's Veil does not help.
- **Leverage:** a shared `gainRep` helper applies Rep (cap 12) and Leverage's +1; the Fallout card shows "Leverage: +1 Rep".
- **Misdirection:** when ticked and the Rep gained is above 0, the Fallout card adds the button (once per Score).
- Everything else in the walk-through (seized assets, tithe, deposit, Wanted card) is unchanged.

### 4.5 `5. Abilities` gets action buttons
Under each ticked ability that has a mechanic, an action button next to its Show button: **Crow's Veil ritual (-2 Coin)** and **ritual with Emberdeath (-6 Coin)**. It checks the crew's Coin first and refuses if short. This keeps the Adjust dropdown unchanged and works at click time.

### 4.6 Status additions
Hold with its parts (Fiends, Accord not shown because it is per assessment), the Just Passing Through +1d line, and one line for the open Downtime ("Downtime open: Patron used, Heat -2").

### 4.7 Token action changes
Adjust gains two entries for Downtime-on crews: **Downtime: Heat & Hold** and **Downtime: start a new Downtime**. Existing crews need one `~ Rebuild`. The Score prompts stay at seven (see 5 for the wording fix).

## 5. Party link foundation (small, in this plan)

**What I found.** Roll20 has a "Party member" checkbox on a character's Edit screen and a "Define Party" right-click on selected tokens. A Roll20 forum thread, "Can Party Member attribute on the character sheet be used programmatically?", reports that scripts can read it as the character's `tags` property containing `_roll20_internal_party_tag_`. **I could not open Roll20 pages from this environment, so I have not read that thread or the API reference.** Treat it as reported, not verified.

**What I would build now:**
- A `partyCharacters()` helper that accepts `tags` as either an array or a string.
- A GM-only `!bitdcrew party` command listing every party character with its sheet type, plus the raw `tags` of any character that has tags. This is the first live check, before anything depends on the idea.
- A `!bitdcrew debug on|off` switch for verbose API-console logging of the new flows (ledger, Heat & Hold, pause step).
- **Payoff wording fix.** Deep Cuts says "1 Coin per PC". My Score prompt says "PCs on the score", which is my wording, not the book's. I would relabel it "PCs in the crew" and add a first option **Party (count now)**, which counts party characters with a character sheet at click time. If no party is found the script says so and applies nothing. Numbers 1 to 8 stay as the fallback.

**The one design limit.** The party flag is global to the game, not per crew, and your game holds several crews. The rule I propose for later: **the crew sheet that is itself marked "Party member" is the active crew, and its bonuses apply to the party's player characters.** If zero or several crew sheets carry the flag, the script says so instead of guessing. The PC-side effects (Forged in the Fire as `setting_resbonus_*`, Bound in Darkness Edge) stay in Bundle 5.

## 6. Tests

**Mock tests (new, about 100 checks):**
- *Ledger:* started by a Score and by Adjust; replaced by a new Score; old id refused; each source once; refused after End; one record per crew.
- *Heat & Hold:* only ticked abilities appear; Heat 0 hides Heat buttons; Patron -2 floors at 0 and the upgrade option; both High Society branches; Just Passing Through; End Downtime with Heat 0 and not 0; No Traces plus Leverage stacking; summary card is public; Downtime-off crew, non-controller and stale ids refused.
- *Hold:* Fiends adds Wanted (0 to 4, and 5 on the 5-box track); Accord 0 to 3; boundaries at turf = Tier; Slippery does not change Fiends.
- *Score:* Leverage on and off, Rep gain 0, Rep cap; the Crow's Veil matrix (ticked, death, witnesses: only one combination pauses); yes and no outcomes with exact Heat, Rep and Wanted; nothing applied before the click; once only; Misdirection amount, floor at 0, once only.
- *Abilities menu:* ritual buttons only when ticked, Coin deducted from the right track, refusal when short, Emberdeath costs 6.
- *Party:* tags as array, as string, absent; payoff count from the party; no party means nothing applied.
- *Coexistence:* the existing PC-script run covers the new verbs; the fixer attributes stay untouched.

**Mutation check:** about 25 more breaks (ledger once-only removed, Leverage on a zero gain, Crow's Veil asking without the witnesses test, Fiends using the Slippery value, Heat -2 becoming -1, End Downtime ignoring Heat, and so on). All must be caught.

**Live test plan additions:** Heat & Hold on crew E and an Assassins, Hawkers and Smugglers crew with the abilities ticked (tick them by hand; Veteran makes that legitimate); the Crow's Veil pause; Misdirection; ritual coin; and the party probe as the first step.

## 7. Milestones

| # | Work | Done when |
|---|---|---|
| M0 | Ability helper, ledger, `gainRep`, party probe, debug switch, Payoff relabel | New foundation tests pass; nothing user-visible changes except the prompt label and the two debug commands |
| M1 | Heat & Hold card, End Downtime, Assess hold with Fiends and Accord, Status lines | All Bundle 1 tests pass; hash reported |
| M2 | Score refactor with Leverage, the Crow's Veil pause, Misdirection, ritual buttons | All Bundle 2 tests pass; the full mutation list is caught |
| M3 | Spec, live test plan, hand-back with character count, hash and the unverified list | Everything committed to the branch; the PC script is untouched |

Sizes, relative: M0 small, M1 medium, M2 medium, M3 small. Each milestone ends with the full test run, so a problem is found in the step that caused it.

## 8. Risks and what stays unverified

- **Party tag** (section 5): live probe first. If it is wrong, the Payoff count falls back to the prompt and Bundle 5 needs another link.
- **Once-per-Downtime readings** (A, B, C): my interpretation. The ledger makes it cheap to change.
- **Ability names** are matched as English text, so a renamed row is missed. Curly apostrophes are handled.
- **Chat buttons** inside posted cards cannot prompt, so Accord's count and the Crow's Veil answer are fixed-choice buttons.
- **Ledger lost** (a sandbox state wipe): buttons answer "no longer available" and a new Downtime starts from Adjust. No Coin, Heat or Rep is ever stranded, because each click applies its own change immediately.
- **Rebuild needed** on every crew after the deploy (new Adjust entries, new Payoff prompt label).
- **Unverified live, as before:** prompt wording in real Roll20, the crew Show button, bar-edit events, reading dice from a posted card. The new items add: the party tag, and how the sheet shows an API-written Rep and Hold.

## 9. Decisions needed

Approve the rules in section 3 (or change any row), then answer:

1. **Payoff count:** relabel to "PCs in the crew" with a Party option, as in section 5. OK?
2. **Misdirection rounding:** give up the smaller half (round down). OK?
3. **Optional Status button** (Heat -1 per +2 Status with a Tier 3+ faction) in Heat & Hold: include or leave out?
4. **After each Heat & Hold click:** post a fresh card with what is left (my default), or a one-line confirmation only?
5. **Which crew applies to the party** (for Bundle 5, no code now): the crew sheet marked "Party member" is the active crew. OK as the working rule?
