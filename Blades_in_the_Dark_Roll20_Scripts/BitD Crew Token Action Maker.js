/* BitD Crew Token Action Maker  v0.10.0
 * Roll20 API script for the Evil Hat "Blades in the Dark" sheet (v3.11), CREW sheets only.
 * Companion to "BitD Token Action Maker.js" (player characters, command !bitd). The two scripts share nothing:
 *   command !bitdcrew | variable BitDCrewTAM | state key BitDCrewTAM | ability marker bitd-crew-tam | macro CREW_TAM
 *
 * Setup:   select a crew token and run the global macro CREW_TAM (or the "~ Rebuild" token action once a token has
 *          actions). GMs: any crew. Players: only crews they control. Run ~ Rebuild again after a Deep Cuts module is
 *          switched on or off, or after a cohort is added or renamed (the token action text is built from the sheet).
 * Command: !bitdcrew <verb> ...   (see route() for the verbs)
 *
 * Rules: every automatic rule is from the books (see the Spec). Core rules apply to a crew with the Deep Cuts Downtime
 * module off, Deep Cuts rules to a crew with it on (per-crew setting_dc_downtime, read at click time).
 *   - Heat reaching 9: +1 Wanted, Heat clears, the excess rolls over (core, Heat). Fires on token bar 1 / sheet edits.
 *   - Score (button 4): Heat from the score. Downtime on: Fallout, Rep and the walk through the Payoff (Deep Cuts p80-81).
 *   - Entanglement roll (core only) names the table result; Deep Cuts has no entanglement roll.
 *   - Deep Cuts Downtime crews: a Heat and Hold card with a once-per-Downtime ledger (Just Passing Through, Reduce Heat,
 *     Assess hold, End Downtime with No Traces' +1 Rep), Leverage's +1 Rep on every Rep gain, Misdirection after a Score (half the Rep earned, as the card shows it).
 *   - Party link: !bitdcrew party (GM) lists the characters Roll20 marks as Party members; the Score's PC count can use it.
 *   - !bitdcrew debug on|off (GM) writes the new flows to the API console.
 *   - Engagement (button 2): a composed roll. The macro asks the plan type and the core book Major Advantage and Disadvantage
 *     questions. Ticked crew abilities and claims that fit the plan are added; abilities that need the table (Predators, and
 *     Weaving the Web or Eye for Weakness on Party PCs) are offered as buttons on a card everyone sees. The outcome is named.
 *   - Claims (Deep Cuts crews unless noted): "-2 heat per score" claims lower the Fallout Heat (core Score too), Victim Trophies
 *     adds Rep, Publicity and Doskvol's Most Wanted (Rep) and the +2 Coin claims are buttons on the Fallout card, and the
 *     income claims roll Tier dice from the Heat and Hold card (Coin added by a button).
 *   - Downtime (button 5, Deep Cuts Downtime crews only): opens the Heat and Hold card, starting a Downtime if none is open.
 *   - Claims (button 6b): a card with a button for each claim on the sheet, marked held or not held; a click shows the claim rules
 *     text (core book, Deep Cuts where it replaces it, and the sheet text) to the table.
 *   - Contacts (button 6a): a card with a button for each contact; a click shows the contact notes to the table. Favorites (the
 *     checked box on the contact row) carry a triangle on the button and in the output.
 *   - Crew Upgrades (button 6c): four categories (the crew type's Special upgrades, Lair, Training, Quality), each a list of the
 *     upgrades on the sheet with one circle per box; a click shows the upgrade text (sheet drop-down, core book for the specials,
 *     Deep Cuts where it changes the rule) to the table. Read-only.
 *   - Action module: after the engagement roll a Begin score card gives each Party PC 1 Edge (Bound in Darkness); the Fallout card can clear the
 *     party's Edge (Edge is lost when Downtime starts). These write only edge_amount on PC sheets and set token bar 2.
 */
var BitDCrewTAM = BitDCrewTAM || (function () {
  'use strict';

  var VERSION = '0.10.0';
  var CMD = '!bitdcrew';
  var MARK = 'bitd-crew-tam';
  var SENDER = 'BitDCrew';
  var MACRO_NAME = 'CREW_TAM';
  var STATE_KEY = 'BitDCrewTAM';
  // Roll20's Party member flag, reported (not yet verified in this game) as this tag inside a character's tags property
  var PARTY_TAG = '_roll20_internal_party_tag_';

  // When Heat reaches 9 (token bar 1, the sheet or any other edit) add a Wanted level and clear Heat with rollover.
  var AUTO_HEAT = true;
  // After a script-posted Entanglement roll (core rules), read the dice and name the table result.
  var AUTO_ENTANGLEMENT = true;
  // After a script-posted Engagement roll, read the dice and name the position (core book, Engagement Roll).
  var AUTO_ENGAGEMENT = true;

  // Line separator inside {{content=...}}
  var NL = '\n';

  var HEAT_MAX = 9, REP_MAX = 12, TURF_MAX = 6, TIER_MAX = 4, CREW_XP_MAX = 10;
  var FLOW_MAX = 40;
  // Edge lives on PC sheets (Deep Cuts, Action module); the PC script keeps the same attribute
  var EDGE_ATTR = 'edge_amount', EDGE_MAX = 99;

  // Engagement roll (core book, The Score): 1d for sheer luck, +1d per major advantage, -1d per major disadvantage,
  // and the +1d (or -1d) from these abilities and claims. A source counts only when its row or box is ticked.
  var PLAN_TYPES = ['assault', 'deception', 'stealth', 'occult', 'social', 'transport'];
  var ENG_SOURCES = [
    { kind: 'ability', name: 'Door Kickers', plans: ['assault'] },
    { kind: 'ability', name: 'Second Story', plans: ['stealth'] },
    { kind: 'ability', name: 'Predators', plans: ['stealth', 'deception'], ask: 'the goal is murder' },
    { kind: 'claim', name: 'Ancient Altar', plans: ['occult'] },
    { kind: 'claim', name: 'Bluecoat Confederates', plans: ['assault'] },
    { kind: 'claim', name: 'City Records', plans: ['stealth'] },
    // Cover Identities: the core book says deception and social plans; the Deep Cuts crew sheets v1.2b say deception or transport for
    // the Hawkers, which the user ruled correct (the Assassins keep deception and social)
    { kind: 'claim', name: 'Cover Identities', plans: ['deception', 'social'], byType: { hawkers: ['deception', 'transport'] } },
    { kind: 'claim', name: 'Personal Clothier', plans: ['social'] },
    { kind: 'claim', name: 'Secret Pathways', plans: ['stealth'] },
    { kind: 'claim', name: 'Secret Routes', plans: ['transport'] }
  ];
  // The Major Advantage and Disadvantage questions (core book, Engagement Roll): +1d for the first, -1d for the second of each pair.
  // The fourth question, other elements, is a number from -3 to +3 (district text in the core book reaches -2d on its own).
  var ENG_QUESTIONS = [
    { plus: 'bold or daring', minus: 'complex or contingent' },
    { plus: 'weak point exposed', minus: 'target strongest here' },
    { plus: 'friends or contacts help', minus: 'enemies or rivals interfere' }
  ];
  var ENG_OTHER_MAX = 3;
  // Abilities of Party player characters that add +1d to the engagement roll (Weaving the Web: core book; Eye for Weakness: sheet only)
  var ENG_PC_ABILITIES = [
    { name: 'Weaving the Web', ask: 'gathered info' },
    { name: 'Eye for Weakness', ask: 'used it to plan' }
  ];
  // Claims that change Score numbers or give income (core book claim text; Bluecoat Confidants, Publicity and Doskvol's Most
  // Wanted are on the sheet only). Deep Cuts does not restate them; the user ruled that the Heat claims still apply.
  var APOS = String.fromCharCode(39);
  var HEAT_CLAIM = 2;
  var CLAIM_HEAT = ['Cover Operation', 'Bluecoat Intimidation', 'Bluecoat Confidants'];
  var CLAIM_REP_AUTO = 'Victim Trophies';
  var CLAIM_REP_BUTTONS = [
    { name: 'Publicity', label: 'takedown score', rep: 2 },
    { name: 'Doskvol' + APOS + 's Most Wanted', label: 'score against the law', rep: 2 }
  ];
  var CLAIM_COIN_BUTTONS = [
    { names: ['Envoy'], label: 'high-class clients' },
    { names: ['Fixer'], label: 'lower-class clients' },
    { names: ['Local Graft'], label: 'show of force or socializing' },
    { names: ['Loyal Fence'], label: 'burglary or robbery' },
    { names: ['Surplus Caches', 'Surplus Cache'], label: 'product sale or supply' },
    { names: ['Terrorized Citizens'], label: 'battle or extortion' },
    { names: ['Offertory'], label: 'occult operations' },
    { names: ['Street Fence'], label: 'lower-class targets' },
    { names: ['Luxury Fence'], label: 'high-class targets' },
    { names: ['Covert Drops', 'Covert Drop'], label: 'espionage or sabotage' }
  ];
  var CLAIM_INCOME = ['Vice Den', 'Drug Den', 'Gambling Den', 'Fighting Pits', 'Foreign Market', 'Protection Racket', 'Side Business'];
  // Claim rules text, verbatim from the core book (bladesinthedark_v8_2, the claim list of each crew chapter), keyed by the claim name as
  // the sheet shows it, in lower case. Each claim lists [crew types, text] pairs because some claims are worded differently by crew.
  // Vigilantes are not in the core book, so their claims have no entry here (the card shows the sheet text instead).
  var CLAIM_TEXT = {
    'ancient altar': [[['cult'], 'You get +1d to the engagement roll for occult plans. Its blessing is with you.']],
    'ancient gate': [
      [['cult'], 'Safe passage in the deathlands. When you leave the city through this gate, the spirits of the deathlands will not molest you unless directly provoked.'],
      [['smugglers'], 'Safe passage in the deathlands. When you leave the city through this gate, spirits in the deathlands will not molest you unless directly provoked.']],
    'ancient obelisk': [[['cult'], '-1 stress cost for all arcane powers and rituals. This effect applies to all cultists, everywhere - so long as the deity is well-pleased. You don\'t have to be on-site at the obelisk to benefit from its power.']],
    'ancient tower': [[['cult'], 'You get +1d to Consort with arcane entities on-site. This tower was prepared by sorcery from the pre-cataclysm and acts as an arcane lens to focus eldritch energy across the black mirror into the void.']],
    'barracks': [[['bravos'], 'Your Thug cohorts get +1 scale. Extra room means more gang members.']],
    'bluecoat confederates': [[['bravos'], 'You get +1d to the engagement roll for assault plans. The street patrol around here helps you out now.']],
    'bluecoat intimidation': [[['bravos'], 'You get -2 heat per score. The law doesn\'t want any trouble from you; they look the other way.']],
    'city records': [[['assassins'], 'You get +1d to the engagement roll for stealth plans. You can use blueprints and other documents to determine a good approach for infiltrations.']],
    'cloister': [[['cult'], 'Your Adept cohorts get +1 scale. More room for hopeful novices desperate to pledge their service.']],
    'cover identities': [[['assassins', 'hawkers'], 'You get +1d to the engagement roll for deception and social plans. False identities help confuse the opposition.']],
    'cover operation': [
      [['assassins', 'hawkers'], 'You get -2 heat per score. The cover of a legitimate operation helps deflect some of the heat from law enforcement.'],
      [['smugglers'], 'You get -2 heat per score. What\'s your cover? Who did you seize it from?']],
    'covert drops': [[['shadows'], 'You get +2 coin in payoff for scores that involve espionage or sabotage. The perfect hidden exchange point is worth the extra coin to discerning clientele.']],
    'drug den': [[['shadows'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. What\'s the drug of choice?']],
    'envoy': [[['assassins'], 'You get +2 coin in payoff for scores that involve high-class clients. This well-connected liaison will help arrange for a better payoff from rich clients.']],
    'fighting pits': [[['bravos'], 'During downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. The locals love to gamble away their hard-won coin on the blood-sports you host.']],
    'fixer': [[['assassins'], 'You get +2 coin in payoff for scores that involve lower-class clients. This well-respected agent will help arrange for a better payoff from poorer clients.']],
    'fleet': [[['smugglers'], 'Your cohorts have their own vehicles. Each cohort has a common vehicle, with quality equal to your Tier.']],
    'foreign market': [[['hawkers'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. Some of your product makes its way out of the city.']],
    'gambling den': [[['shadows'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. Cards, dice, or something more unusual on offer?']],
    'hagfish farm': [[['assassins', 'shadows'], 'When you use the reduce heat downtime activity after a score that involves killing, you get +1d to the roll and quiet, convenient disposal of any corpses you left on the job.']],
    'infirmary': [[['assassins', 'bravos', 'shadows'], 'You get +1d to healing treatment rolls. The infirmary also has beds for long-term convalescence.']],
    'informants': [
      [['assassins', 'bravos', 'shadows'], 'You get +1d to gather information for a score. Your eyes and ears on the streets are always on the lookout for new targets.'],
      [['hawkers', 'smugglers'], 'You get +1d to gather information for a score. Your eyes and ears on the streets are always on the lookout for new clients.']],
    'interrogation chamber': [[['shadows'], 'You get +1d to Command and Sway on-site. Grisly business, but effective.']],
    'local graft': [[['hawkers'], 'You get +2 coin in payoff for scores that involve a show of force or socializing. A few city officials share bribe money with those who show that they\'re players on the scene.']],
    'lookouts': [[['hawkers', 'shadows'], 'You get +1d to Hunt or Survey on your turf.']],
    'loyal fence': [[['shadows'], 'You get +2 coin in payoff for scores that involve burglary or robbery. It requires a skilled eye and good contacts to move stolen goods.']],
    'luxury fence': [[['smugglers'], 'You get +2 coin in payoff for scores that involve high-class targets. It requires a skilled eye and good contacts to move hot luxury goods.']],
    'luxury venue': [[['hawkers'], '+1d to Consort and Sway rolls on-site. Silks, paintings, and crystal impress the clientele.']],
    'offertory': [[['cult'], 'You get +2 coin in your payoff for scores that involve occult operations. The frightened locals offer you tribute when you perform your dark practices. They don\'t want to be next.']],
    'personal clothier': [[['hawkers'], 'You get +1d to the engagement roll for social plans. You always arrive on the scene in the most current and alluring fashion.']],
    'protection racket': [[['assassins', 'bravos'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. Some of the locals are terrified of you and will gladly pay for "protection."']],
    'sacred nexus': [[['cult'], 'You get +1d to healing treatment rolls. Ancient arcane energy seeps into the wounded here, speeding their recovery, and marking them consecrated by its power.']],
    'sanctuary': [[['cult'], '+1d to Command and Sway rolls on-site. Your sanctuary maintains its effect as long as your deity is well-pleased with your service.']],
    'secret pathways': [[['shadows'], 'You get +1d to the engagement roll for stealth plans. You might have access to long-forgotten underground canals, rooftop walkways, or some other route of your choosing.']],
    'secret routes': [[['smugglers'], 'You get +1d to the engagement roll for transport plans. You might have access to long-forgotten underground canals, dark streets normally hidden behind debris, or some other route of your choosing.']],
    'side business': [[['smugglers'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. What kind of legitimate business is this? How do you get paid in secret?']],
    'spirit well': [[['cult'], 'You get +1d to Attune rolls on-site. A spirit well draws ghosts and other things to its power, which you harness to aid your arts.']],
    'street fence': [[['bravos'], 'You get +2 coin in your payoff for scores that involve lower-class targets. An expert can find the treasure amid the trash you loot from your poorer victims.']],
    'surplus caches': [[['hawkers'], 'You get +2 coin in payoff for scores that involve product sale or supply. You have an abundance of product, which pads your pockets every now and then.']],
    'tavern': [[['shadows', 'smugglers'], 'You get +1d to Consort and Sway rolls on-site. Some booze and friendly conversation can go a long way.']],
    'terrorized citizens': [[['bravos'], 'You get +2 coin in your payoff for scores that involve battle or extortion. The frightened locals offer you tribute whenever you lash out. They don\'t want to be next.']],
    'training rooms': [[['assassins'], 'Your Skulks cohorts get +1 scale. Extra training enables them to fight like a larger gang.']],
    'vice den': [
      [['assassins', 'cult'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat.'],
      [['hawkers'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. Is this claim a den you\'ve overtaken from another purveyor, or a new establishment replacing something else?'],
      [['smugglers'], 'Any time during downtime, roll dice equal to your Tier. You earn coin equal to the highest result, minus your heat. Perhaps you sell some of the contraband you smuggle here? Or do you not mix your operations?']],
    'victim trophies': [[['assassins'], 'You get +1 rep per score. Word of your grisly "collection" gets around, and your boldness boosts your rep in the underworld.']],
    'warehouse': [[['smugglers'], 'You get +1d to acquire asset rolls. You have space to hold all the various items and supplies you end up with from your smuggling runs. They can be useful on their own or for barter when you need it.']],
    'warehouses': [[['bravos'], 'You get +1d to acquire asset rolls. You have space to hold all the various spoils you end up with after your battles. It can be useful on its own or for barter when you need it.']]
  };
  // Deep Cuts replaces the wording of these claims when the module is on (the sheet swaps its own text the same way). Core text is above.
  // Infirmary and Sacred Nexus: the Downtime module turns +1d to healing rolls into a tick (p88); the v1.2b crew sheets word the claims that way.
  var HEALING_TICK_DC = '+1 tick to healing clock in downtime, in place of +1d to healing rolls. (Deep Cuts p88: "+1d to healing rolls instead counts as 1 tick on the healing clock." The Deep Cuts crew sheets v1.2b word the claim the same way.)';
  // Hagfish Farm counts as turf on the Deep Cuts crew sheets v1.2b (user ruling: follow the sheets); it replaces the core Reduce Heat bonus.
  // The sheets do not name a module; the Downtime module is where turf and hold are used (Assess Hold, p84), so that is the switch.
  var CLAIM_DC = {
    'hagfish farm': { attr: 'setting_dc_downtime', module: 'Downtime', text: 'Body disposal + counts as turf. (Deep Cuts crew sheets v1.2b)' },
    'infirmary': { attr: 'setting_dc_downtime', module: 'Downtime', text: HEALING_TICK_DC },
    'sacred nexus': { attr: 'setting_dc_downtime', module: 'Downtime', text: HEALING_TICK_DC },
    'warehouses': { attr: 'setting_dc_downtime', module: 'Downtime', text: 'The crew gains an additional Acquire activity each Downtime. (Deep Cuts p88)' },
    'warehouse': { attr: 'setting_dc_downtime', module: 'Downtime', text: 'The crew gains an additional Acquire activity each Downtime. (Deep Cuts p88)' },
    'informants': { attr: 'setting_dc_action', module: 'Action', text: 'You get +1 tick on your long-term project clock when you work on an investigation during downtime.' }
  };
  // Claim wording that differs by crew type where the user ruled the Deep Cuts crew sheets (v1.2b) correct and the core book wrong for that crew.
  var CLAIM_TYPE_RULING = {
    'cover identities': { hawkers: 'You get +1d to the engagement roll for deception or transport plans. (Deep Cuts crew sheets v1.2b; the core book says deception and social plans.)' }
  };
  // Turf has no claim text of its own: the core book rules for claims, and the Deep Cuts rule for hold (Assess Hold, p84)
  var TURF_CORE = 'As soon as you seize a claim, you enjoy the listed benefit for as long as you hold the claim. Some claims count as turf. Others provide special benefits to the crew, such as bonus dice in certain circumstances, extra coin generated for the crew\'s treasury, or new opportunities for action.';
  var TURF_DC = 'Your crew\'s hold on their Tier is measured by your number of turf claims. To have strong hold on your Tier, you must have a number of turf claims equal to or greater than your Tier. While your number of turf claims is lower than your Tier, your hold is weak.';
  // the crew type is free text on the sheet, so it is matched by these stems
  var CREW_STEMS = [['assassin', 'assassins'], ['bravo', 'bravos'], ['cult', 'cult'], ['hawker', 'hawkers'], ['shadow', 'shadows'], ['smuggler', 'smugglers'], ['vigilante', 'vigilantes']];

  // Crew upgrades. The sheet keeps the Lair, Training and Quality upgrades as fixed attributes named upgrade_<key>_ plus name, check_N
  // and the drop-down text, and the crew-special ones in the repeating section "upgrade" (name, check_1 to check_3, numboxes, cost, text).
  var UPGRADE_CATEGORIES = ['special', 'lair', 'training', 'quality'];
  var UPGRADE_FIXED = {   // [key, boxes], in sheet order
    lair: [['carriage', 2], ['boat', 2], ['hidden', 1], ['quarters', 1], ['secure', 2], ['vault', 2], ['workshop', 1]],
    training: [['insight', 1], ['prowess', 1], ['resolve', 1], ['personal', 1], ['mastery', 4]],
    quality: [['documents', 1], ['gear', 1], ['implements', 1], ['supplies', 1], ['tools', 1], ['weapons', 1]]
  };
  // the second box of these improves the first (sheet text), so the upgrade is taken from any box; every other upgrade needs all its boxes
  var UPGRADE_LEVELS = ['carriage', 'boat', 'secure', 'vault'];
  var UPGRADE_COIN_PER_BOX = 10;   // Deep Cuts p83, Development: Lair Upgrade, Quality, Training, Mastery (per box)
  // The sheet's own drop-down text for each fixed upgrade (sheet translation file), used only when the attribute reads empty.
  var UPGRADE_SHEET_TEXT = {
    carriage: 'You have a carriage, two goats to pull it, and a stable. A second upgrade improves the carriage with armor and larger, swifter goats. Horses are very rare in Doskvol  -  most carriages in the city use the large Akorosian goat as their draft animal.',
    boat: 'You have a boat, a dock on a waterway, and a small shack to store boating supplies. A second upgrade improves the boat with armor and more cargo capacity.',
    hidden: 'Your lair has a secret location and is disguised to hide it from view. If your lair is discovered, use two downtime activities and pay coin equal to your Tier to relocate it and hide it once again.',
    quarters: 'Your lair includes living quarters for the crew. Without this upgrade, each PC sleeps elsewhere, and is vulnerable when they do so.',
    secure: 'Your lair has locks, alarms, and traps to thwart intruders. A second upgrade improves the defenses to include arcane measures that work against spirits. You might roll your crew\'s Tier if these measures are ever put to the test, to see how well they thwart an intruder.',
    vault: 'Your lair has a secure vault, increasing your storage capacity for coin to 8. A second upgrade increases your capacity to 16. A separate part of your vault can be used as a holding cell.',
    workshop: 'Your lair has a workshop appointed with tools for tinkering and alchemy, as well as a small library of books, documents, and maps. You may accomplish long-term projects with these assets without leaving your lair.',
    insight: 'Earn 2 xp when training insight during downtime.',
    prowess: 'Earn 2 xp when training prowess during downtime.',
    resolve: 'Earn 2 xp when training resolve during downtime.',
    personal: 'Earn 2 xp when training playbook during downtime.',
    mastery: 'Your crew has access to master level training. You may advance your PCs\' action ratings to 4 (until you unlock this upgrade, PC action ratings are capped at 3). This costs four upgrade boxes to unlock.',
    documents: '+1 quality for Documents.',
    gear: '+1 quality for Burglary Gear and Climbing Gear.',
    implements: '+1 quality for Arcane Implements.',
    supplies: '+1 quality for Subterfuge Supplies.',
    tools: '+1 quality for Demolition Tools and Tinkering Tools.',
    weapons: '+1 quality for Weapons.'
  };
  // Core book text of the crew-special upgrades (each crew's UPGRADES list) and the Smugglers' Vehicle, keyed by the name as the sheet
  // spells it once normalized (lower case, no bracket text, no apostrophes, & as and).
  var UPGRADE_BOOK = [
    [['assassin rigging', 'assassins rigging'], 'You get 2 free load worth of weapon or gear items. For example, you could carry a pistol (a weapon) and burglary tools (gear) for zero load.'],
    [['bravos rigging', 'bravo rigging'], 'You get 2 free load worth of weapon or armor items. For example, you could carry a sword & pistol or wear normal armor for zero load.'],
    [['cult rigging'], 'You get 2 free load worth of document or implement items. For example, you could carry a profane book of curses and a demon\'s hand for zero load.'],
    [['hawker rigging', 'hawkers rigging'], 'One carried item is concealed and has no load. For example, you could carry a load of drugs or a weapon, perfectly concealed, for zero load.'],
    [['thief rigging', 'thieves rigging'], 'You get 2 free load worth of tool or gear items. For example, you could carry burglary gear and tinkering tools for zero load.'],
    [['smuggler rigging', 'smugglers rigging'], 'Two of your carried items are perfectly concealed. You could carry 1 load of contraband and a pistol, perfectly concealed, even against a pat down.'],
    [['ironhook contacts'], 'Your Tier is effectively +1 higher in prison. This counts for any Tier-related element in prison, including the incarceration roll (see page 148).'],
    [['elite skulks'], 'All of your cohorts with the Skulks type get +1d to quality rolls for Skulk-related actions.'],
    [['elite rovers'], 'All of your cohorts with the Rovers type get +1d to quality rolls for Rover-related actions.'],
    [['elite rooks'], 'All of your cohorts with the Rooks type get +1d to quality rolls for Rook-related actions.'],
    [['elite adepts'], 'All of your cohorts with the Adepts type get +1d to quality rolls for Adept-related actions.'],
    [['elite thugs'], 'All of your cohorts with the Thugs type get +1d to quality rolls for Thug-related actions.'],
    [['hardened', 'ordained'], 'Each PC gets +1 trauma box. This costs three upgrades to unlock, not just one. This may bring a PC with 4 trauma back into play if you wish.'],
    [['composed', 'steady'], 'Each PC gets +1 stress box. This costs three upgrades to unlock, not just one.'],
    [['ritual sanctum in lair', 'ritual sanctum'], 'This counts as a sacred and arcane workshop for occult practices and rituals.'],
    [['underground maps and passkeys'], 'You have easy passage through the underground canals, tunnels, and basements of the city.'],
    [['camouflage'], 'Your vehicles are perfectly concealed when at rest. They blend in as part of the environment, or as an uninteresting civilian vehicle (your choice).'],
    [['barge'], 'Add mobility to your lair. You can move it to a new location as a downtime activity.'],
    [['vehicle'], 'All smugglers start with a vehicle. When the vehicle is upgraded (two boxes), it also gets armor.']
  ];
  var UPGRADE_QUALITY_RULE = 'Each upgrade improves the quality rating of all the PCs\' items of that type, beyond the quality established by the crew\'s Tier and fine items.';
  // Deep Cuts, Downtime module, where it changes or adds to an upgrade (the same layout as CLAIM_DC)
  var UPGRADE_TRAINING_DC = 'Training Upgrades: You always have access to a veteran instructor (Quality rating 3) in that area of expertise. Mastery gives you a Quality 4 instructor (and unlocks rating 4 actions). When you advance with one of these instructors, mark crew xp.';
  var UPGRADE_DC = {
    insight: { page: 'p88', replaces: true, text: UPGRADE_TRAINING_DC },
    prowess: { page: 'p88', replaces: true, text: UPGRADE_TRAINING_DC },
    resolve: { page: 'p88', replaces: true, text: UPGRADE_TRAINING_DC },
    personal: { page: 'p88', replaces: true, text: UPGRADE_TRAINING_DC },
    mastery: { page: 'p88', replaces: true, text: UPGRADE_TRAINING_DC },
    vault: { page: 'p88', replaces: true, text: 'Vaults are bigger: the first holds 8 Coin, the second holds 12.' },
    workshop: { page: 'p87', replaces: false, text: 'Long-term project, Work activity: Add +1 tick if you have a workshop and/or other special advantages.' }
  };
  // Status lines for ticked abilities that change no number the script tracks (wording from the sheet; All Hands is the Deep Cuts text)
  var STATUS_REMINDERS = [
    ['Zealotry', 'Zealotry: your cohorts get +1d to rolls against enemies of the faith (add it as Bonus dice on a cohort roll).'],
    ['Thorn in your Side', 'Thorn in your Side: when you use Stealth or Assault plans against a higher Tier faction, your Tier counts as +1.'],
    ['Roots', 'Roots: during Downtime one of your contacts or cohorts may take a Downtime action to acquire an asset, reduce Heat, or recover.'],
    ['All Hands', 'All Hands: during Downtime, one of your cohorts may perform an additional Downtime activity to Acquire or Work.'],
    ['Like Part of the Family', 'Like Part of the Family: one of your vehicles is a cohort whose quality is equal to your Tier +1.']
  ];

  // glyphs kept as char codes so the source stays plain ASCII
  var G_ON = String.fromCharCode(0x25CF), G_OFF = String.fromCharCode(0x25CB);
  var RE_SQ = new RegExp('[' + String.fromCharCode(0x2018, 0x2019) + ']', 'g');

  // 5. Downtime is built only for crews with the Deep Cuts Downtime module on (core crews show a gap at 5).
  // The token action bar sorts character by character, so 6a., 6b. and 6c. sort between 6. and 7. and nothing needs renumbering.
  var ABILITY_NAMES = ['1. Roll', '2. Engagement', '3. Fortune', '4. Score', '5. Downtime', '6. Abilities', '6a. Contacts', '6b. Claims',
    '6c. Crew Upgrades', '7. Adjust', '8. Clocks', '9. Status', '~ Rebuild'];
  var TRIANGLE = String.fromCharCode(0x25B2);
  var NOTES_MAX = 2000;

  // Core book, Entanglements: columns by Heat, rows by the roll result (1-3, 4/5, 6).
  var ENT_COLUMNS = [
    { name: 'Heat 0-3', rows: [['Gang Trouble', 'The Usual Suspects'], ['Rivals', 'Unquiet Dead'], ['Cooperation']] },
    { name: 'Heat 4-5', rows: [['Gang Trouble', 'Questioning'], ['Reprisals', 'Unquiet Dead'], ['Show of Force']] },
    { name: 'Heat 6+', rows: [['Flipped', 'Interrogation'], ['Demonic Notice', 'Show of Force'], ['Arrest']] }
  ];
  var ENT_ROW_NAMES = ['1-3', '4/5', '6'];

  // Deep Cuts p82, Bluecoats entanglement by Wanted level 0 to 4
  var BLUECOATS = [
    'Questioning, harassment, threats, observation/tailing.',
    'Beatings (Harm 1), demands, observation/tailing.',
    'Serious Beatings (Harm 2), interrogation, or seizure of assets.',
    'Severe Beatings (Harm 3), an arrest, or destruction of assets.',
    'Lethal force, arrests, or destruction/seizure of lair and all assets.'
  ];

  // ---------------------------------------------------------------- helpers

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // value that goes inside {{field=...}}
  function clean(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/[\r\n]+/g, ' ').replace(/\{\{|\}\}/g, '').replace(/\|/g, '/').trim();
  }
  // text that goes inside a [label](cmd) chat button
  function btn(s) {
    return clean(s).replace(/[\[\]()]/g, '').replace(/\s+/g, ' ').slice(0, 60);
  }
  // option text inside a ?{Label|text,value} prompt: no comma, bar, brace or bracket
  function opt(s) {
    return clean(s).replace(/[,\[\]{}()]/g, '').replace(/\s+/g, ' ').slice(0, 40);
  }

  function getAttr(cid, name, dflt) {
    var v = getAttrByName(cid, name);
    return (v === undefined || v === null || v === '') ? dflt : v;
  }
  function getNum(cid, name, dflt) {
    var n = parseInt(getAttrByName(cid, name), 10);
    return isNaN(n) ? (dflt || 0) : n;
  }
  function isOn(cid, name) { return String(getAttrByName(cid, name)) === '1'; }

  function setAttr(cid, name, value) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: name })[0];
    if (!a) {
      createObj('attribute', { _characterid: cid, name: name, current: String(value) });
    } else {
      a.setWithWorker({ current: String(value) });
    }
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function bar(n, max) {
    var s = '';
    for (var i = 0; i < max; i++) { s += (i < n ? G_ON : G_OFF); }
    return s;
  }

  function normName(s) {
    return String(s === undefined || s === null ? '' : s).replace(RE_SQ, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function who(msg) {
    var p = getObj('player', msg.playerid);
    return p ? p.get('_displayname') : String(msg.who || 'gm').replace(/ \(GM\)$/, '');
  }
  function whisper(msg, text) { sendChat(SENDER, '/w "' + who(msg) + '" ' + text); }
  function whisperPlayer(playerId, text) {
    var p = getObj('player', playerId);
    if (p) { sendChat(SENDER, '/w "' + p.get('_displayname') + '" ' + text); }
  }
  // GMs plus the players who control the character (everyone if it is controlled by "all")
  function recipients(ch) {
    var cb = String(ch.get('controlledby') || '').split(','), ids = [];
    findObjs({ _type: 'player' }).forEach(function (p) {
      if (playerIsGM(p.id) || cb.indexOf('all') >= 0 || cb.indexOf(p.id) >= 0) { ids.push(p.id); }
    });
    return ids;
  }

  function info(cid) {
    var ch = getObj('character', cid);
    return { id: cid, name: ch ? ch.get('name') : '?', image: getAttr(cid, 'chat_image', '') };
  }

  // sheet "bitd-broadcast" card
  function broadcast(c, o) {
    var s = '&{template:bitd-broadcast} {{charname=' + clean(c.name) + '}}';
    if (o.type) { s += ' {{type=' + o.type + '}}'; }
    if (o.title) { s += ' {{title=' + o.title + '}}'; }
    if (o.content) { s += ' {{content=' + o.content + '}}'; }
    if (c.image && !o.noimage) { s += ' {{charimage=' + clean(c.image) + '}}'; }
    return s;
  }

  // compact confirmation card: header type, big title, small content line
  function note(msg, c, type, title, content) {
    whisper(msg, broadcast(c, { type: clean(type), title: clean(title), content: clean(content) }));
  }

  function parse(content) {
    var t = content.trim().split(/\s+/);
    var o = { verb: String(t[1] || '').toLowerCase(), pos: [], c: null, row: null, idx: null, n: null };
    for (var i = 2; i < t.length; i++) {
      if (t[i] === '--c') { o.c = t[++i]; }
      else if (t[i] === '--row') { o.row = t[++i]; }
      else if (t[i] === '--idx') { o.idx = t[++i]; }
      else if (t[i] === '--n') { o.n = t[++i]; }
      else { o.pos.push(t[i]); }
    }
    return o;
  }

  function resolveChar(msg, o) {
    var id = o.c;
    if (!id && msg.selected && msg.selected.length) {
      var t = getObj('graphic', msg.selected[0]._id);
      if (t) { id = t.get('represents'); }
    }
    return id ? getObj('character', id) : null;
  }

  function allowed(msg, ch) {
    if (playerIsGM(msg.playerid)) { return true; }
    var cb = String(ch.get('controlledby') || '').split(',');
    return cb.indexOf('all') >= 0 || cb.indexOf(msg.playerid) >= 0;
  }

  // Common entry for every verb that works on one crew. Returns {ch, c} or null.
  function target(msg, o) {
    var ch = resolveChar(msg, o);
    if (!ch) { whisper(msg, 'BitDCrew: select a crew token first.'); return null; }
    if (!allowed(msg, ch)) { whisper(msg, 'BitDCrew: you can only use this on crews you control.'); return null; }
    if (getAttr(ch.id, 'sheet_type', 'character') !== 'crew') {
      whisper(msg, 'BitDCrew: ' + clean(ch.get('name')) + ' is a character or faction sheet. This script handles crew sheets only (player characters use !bitd).');
      return null;
    }
    return { ch: ch, c: info(ch.id) };
  }

  function mods(cid) {
    return {
      action: isOn(cid, 'setting_dc_action'),
      advancement: isOn(cid, 'setting_dc_advancement'),
      downtime: isOn(cid, 'setting_dc_downtime'),
      harm: isOn(cid, 'setting_dc_harm'),
      load: isOn(cid, 'setting_dc_load')
    };
  }

  function listRows(cid, section, field) {
    var re = new RegExp('^repeating_' + section + '_(.+)_' + field + '$');
    var rows = [];
    findObjs({ _type: 'attribute', _characterid: cid }).forEach(function (a) {
      var m = re.exec(a.get('name'));
      if (m) { rows.push({ row: m[1], value: a.get('current') }); }
    });
    var ord = findObjs({ _type: 'attribute', _characterid: cid, name: '_reporder_repeating_' + section })[0];
    if (ord) {
      var order = String(ord.get('current') || '').split(',');
      rows.sort(function (a, b) {
        var ia = order.indexOf(a.row), ib = order.indexOf(b.row);
        return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
      });
    }
    return rows;
  }

  function botState() {
    state[STATE_KEY] = state[STATE_KEY] || {};
    state[STATE_KEY].flows = state[STATE_KEY].flows || {};
    state[STATE_KEY].downtime = state[STATE_KEY].downtime || {};
    return state[STATE_KEY];
  }
  // verbose API-console logging for the newer flows; switched by !bitdcrew debug on|off
  function dbg(text) { if (botState().debug) { log('BitDCrew debug: ' + text); } }

  // Card text uses Roll20 chat markup: **bold** for what applies now (the state, the rule in force, the numbers) and *italic* for where a text
  // comes from. Whether the sheet's card template shows the markup is checked with !bitdcrew fmt probe; fmt off, fmt bold off and
  // fmt italic off (GM) switch it off again, kept in state.
  function fmtOn(kind) { var f = botState().fmt; return !f || f[kind] !== false; }
  function bold(x) { return fmtOn('bold') && x ? '**' + x + '**' : x; }
  function ital(x) { return fmtOn('italic') && x ? '*' + x + '*' : x; }
  // the numbers and dice in rule text stand out: +1d, -2 heat, +2 coin, +1 tick
  var RE_MECH = /[+-]\d+d?(?:\s(?:coin|heat|rep|tick|ticks|scale|stress|armor|quality|effect|edge)\b)?/gi;
  function mech(x) { return fmtOn('bold') ? String(x).replace(RE_MECH, function (m) { return '**' + m + '**'; }) : String(x); }
  // a labelled rule line: the label bold when the rule applies now, italic when it only says where a text comes from
  function ruleLine(label, text, source) { return (source ? ital(label) : bold(label)) + ' ' + mech(text); }

  // ---------------------------------------------------------------- sheet readers

  // Wanted: the 4-box track (wanted) normally; the 5-box track (wantedDC) when the sheet's 5th Wanted box is switched on
  function wantedInfo(cid) {
    return isOn(cid, 'setting_wanted_5th') ? { attr: 'wantedDC', max: 5, label: 'Wanted (5-box track)' } : { attr: 'wanted', max: 4, label: 'Wanted' };
  }

  // the crew's ticked abilities as a set of normalized names (a row counts only when its circle is ticked)
  function tickedRows(cid, section) {
    var on = {};
    listRows(cid, section, 'name').forEach(function (r) {
      if (String(getAttrByName(cid, 'repeating_' + section + '_' + r.row + '_check')) === '1') { on[normName(r.value)] = true; }
    });
    return on;
  }
  function abilitiesOn(cid) { return tickedRows(cid, 'crewability'); }
  function crewAbilityOn(cid, name) { return abilitiesOn(cid)[normName(name)] === true; }
  // true when the crew has a row with that name, ticked or not
  function crewAbilityListed(cid, name) {
    var want = normName(name);
    return listRows(cid, 'crewability', 'name').some(function (r) { return normName(r.value) === want; });
  }

  // the crew's ticked claims as a set of normalized names (a claim name can span lines on the sheet; a translation-key prefix is dropped)
  function claimsOn(cid) {
    var on = {};
    for (var i = 1; i <= 15; i++) {
      if (!isOn(cid, 'claim_' + i + '_check')) { continue; }
      var nm = normName(getAttrByName(cid, 'claim_' + i + '_name')).replace(/_/g, ' ').replace(/^claim /, '');
      if (nm) { on[nm] = true; }
    }
    return on;
  }

  function claimHas(cl, names) { return names.some(function (n) { return cl[normName(n)] === true; }); }

  // "-2 heat per score" claims come off the Fallout total, never below 0 (Rep then follows the reduced Heat, as with No Traces)
  function applyHeatClaims(cid, total, parts) {
    if (total < 1) { return total; }
    var cl = claimsOn(cid);
    CLAIM_HEAT.forEach(function (n) {
      if (claimHas(cl, [n])) { total -= HEAT_CLAIM; parts.push(n + ' -' + HEAT_CLAIM); }
    });
    if (total < 0) { total = 0; parts.push('not below 0'); }
    return total;
  }

  // the income claims the crew has ticked: [{slot, name}], with the name as the book spells it
  function incomeClaims(cid) {
    var out = [];
    for (var i = 1; i <= 15; i++) {
      if (!isOn(cid, 'claim_' + i + '_check')) { continue; }
      var nm = normName(getAttrByName(cid, 'claim_' + i + '_name')).replace(/_/g, ' ').replace(/^claim /, '');
      CLAIM_INCOME.forEach(function (c) { if (normName(c) === nm) { out.push({ slot: i, name: c }); } });
    }
    return out;
  }

  // one text per claim the script acts on, for 9. Status (the Deep Cuts claims only for Downtime crews)
  function claimsInPlay(cid, dt) {
    var cl = claimsOn(cid), out = [];
    CLAIM_HEAT.forEach(function (n) { if (claimHas(cl, [n])) { out.push(n + ' (-' + HEAT_CLAIM + ' Heat per score)'); } });
    if (dt) {
      if (claimHas(cl, [CLAIM_REP_AUTO])) { out.push(CLAIM_REP_AUTO + ' (+1 Rep per score)'); }
      CLAIM_REP_BUTTONS.forEach(function (c) { if (claimHas(cl, [c.name])) { out.push(c.name + ' (+' + c.rep + ' Rep, a button on the Fallout card)'); } });
      CLAIM_COIN_BUTTONS.forEach(function (c) { if (claimHas(cl, c.names)) { out.push(c.names[0] + ' (+2 Coin, a button on the Fallout card)'); } });
      incomeClaims(cid).forEach(function (c) { out.push(c.name + ' (income, a button in Heat and Hold)'); });
    }
    var type = crewTypeKey(cid, claimSlots(cid));
    ENG_SOURCES.forEach(function (src) { if (src.kind === 'claim' && claimHas(cl, [src.name])) { out.push(src.name + ' (+1d engagement, ' + engPlans(src, type).join(' or ') + ' plans)'); } });
    return out;
  }

  // Deep Cuts p88: Slippery makes the effective Wanted level one less than the actual value
  function slipperyOn(cid) { return mods(cid).downtime && crewAbilityOn(cid, 'Slippery'); }
  function effectiveWanted(cid) {
    var actual = getNum(cid, wantedInfo(cid).attr, 0);
    return slipperyOn(cid) ? Math.max(0, actual - 1) : actual;
  }

  // The sheet's coin track: crewcoin (16 boxes) normally, crewcoin_dc (24 boxes) with the Downtime module
  function coinTrack(cid) {
    return mods(cid).downtime ? { attr: 'crewcoin_dc', max: 24 } : { attr: 'crewcoin', max: 16 };
  }
  // coin the crew can hold: 4 on hand plus the vaults (sheet text: standard 4 / 8 / 16, Deep Cuts 4 / 12 / 24)
  function coinCapacity(cid) {
    var dt = mods(cid).downtime, v1 = isOn(cid, 'upgrade_vault_check_1'), v2 = isOn(cid, 'upgrade_vault_check_2');
    return dt ? 4 + (v1 ? 8 : 0) + (v2 ? 12 : 0) : 4 + (v1 ? 4 : 0) + (v2 ? 8 : 0);
  }

  // the ticked claims that count as turf: the Turf tiles, and Hagfish Farm with the Downtime module on (Deep Cuts crew sheets v1.2b)
  function turfClaimsTicked(cid) {
    var n = 0, dt = isOn(cid, 'setting_dc_downtime');
    for (var i = 1; i <= 15; i++) {
      var nm = normName(getAttrByName(cid, 'claim_' + i + '_name')).replace(/_/g, ' ').replace(/^claim /, '');
      if ((nm === 'turf' || (dt && nm === 'hagfish farm')) && isOn(cid, 'claim_' + i + '_check')) { n++; }
    }
    return n;
  }

  // Party member flag (Roll20): the character's tags hold PARTY_TAG, as an array or as text
  function isPartyMember(ch) {
    var t;
    try { t = ch.get('tags'); } catch (e) { return false; }
    if (t === undefined || t === null || t === '') { return false; }
    return (typeof t === 'string' ? t : JSON.stringify(t)).indexOf(PARTY_TAG) >= 0;
  }
  function partyCharacters() { return findObjs({ _type: 'character' }).filter(isPartyMember); }
  function partyPcCount() {
    return partyCharacters().filter(function (c) { return getAttr(c.id, 'sheet_type', 'character') === 'character'; }).length;
  }

  // Rep the script gives the crew. Leverage: "Whenever you gain rep, gain +1 rep" (not for a gain of 0). Capped at the track.
  function gainRep(cid, n, noLeverage) {
    var before = getNum(cid, 'rep', 0), bonus = (!noLeverage && n > 0 && crewAbilityOn(cid, 'Leverage')) ? 1 : 0;
    var want = n + bonus, after = Math.min(REP_MAX, before + want);
    if (after !== before) { setAttr(cid, 'rep', after); }
    dbg('gainRep ' + cid + ' asked ' + n + ' bonus ' + bonus + ': ' + before + ' to ' + after);
    return { asked: n, bonus: bonus, before: before, after: after, applied: after - before, full: before + want > REP_MAX };
  }

  function cohortList(cid) {
    var out = [];
    var n1 = String(getAttr(cid, 'cohort1_name', '')).trim();
    if (n1) { out.push({ code: 'cohort1', prefix: 'cohort1', name: n1 }); }
    listRows(cid, 'cohort', 'name').forEach(function (r) {
      var nm = String(r.value || '').trim();
      if (nm) { out.push({ code: 'cohort:' + r.row, prefix: 'repeating_cohort_' + r.row, name: nm }); }
    });
    return out;
  }
  function cohortType(cid, prefix) {
    var t = String(getAttr(cid, prefix + '_type', 'gang')).toLowerCase();
    return (t === 'gang' || t === 'elite' || t === 'expert') ? t : 'gang';
  }
  // sheet rule (calculateCohortDice): Tier, minus impaired, plus 1 for elite or expert
  function cohortPool(cid, prefix) {
    return getNum(cid, 'crew_tier', 0) - getNum(cid, prefix + '_impaired', 0) +
      ((cohortType(cid, prefix) === 'elite' || cohortType(cid, prefix) === 'expert') ? 1 : 0);
  }

  // ---------------------------------------------------------------- setup

  function intList(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) { out.push(i); }
    return out.join('|');
  }

  function scoreMacro(dt) {
    if (!dt) {
      return CMD + ' score ?{Exposure|Smooth and quiet 0,0|Contained 2,2|Loud and chaotic 4,4|Wild 6,6}' +
        ' ?{High-profile or well-connected target|No,0|Yes +1,1}' +
        ' ?{On hostile turf|No,0|Yes +1,1}' +
        ' ?{At war with another faction|No,0|Yes +1,1}' +
        ' ?{Killing involved|No,0|Yes +2,2}';
    }
    return CMD + ' score ?{Base Heat|Smooth and low exposure 0,0|Standard criminal operation 2,2}' +
      ' ?{Target|Ordinary target 0,0|High profile or well-connected +2,2}' +
      ' ?{Chaos|None 0,0|Open combat or destruction or mayhem +2,2|At war with another faction +2,2|Both +4,4}' +
      ' ?{Death|No death 0,0|Death in connection to the score +4,4}' +
      ' ?{Witnesses|None 0,0|Witnesses who can be questioned +2,2|Crew members identified +4,4}' +
      ' ?{Target Tier|' + intList(0, 6) + '}' +
      ' ?{PCs for the Payoff (1 Coin each)|All party members,party|' + intList(1, 8) + '}';
  }

  function tokenActions(cid) {
    var m = mods(cid), dt = m.downtime;
    var rollOpts = ['Tier (@{selected|crew_tier}),tier'];
    if (!dt) { rollOpts.push('Entanglement (@{selected|' + wantedInfo(cid).attr + '}),wanted'); }
    cohortList(cid).forEach(function (c) { rollOpts.push('Cohort ' + opt(c.name) + ',' + c.code); });
    var adjust = 'Heat +1,heat+1|Heat -1,heat-1|Wanted +1,wanted+1|Wanted -1,wanted-1' +
      '|Incarceration (Wanted -1 and clear Heat),incarc' +
      '|Rep +1,rep+1|Rep -1,rep-1|Turf +1,turf+1|Turf -1,turf-1' +
      '|Coin +1,coin+1|Coin +2,coin+2|Coin +4,coin+4|Coin -1,coin-1|Coin -2,coin-2|Coin -4,coin-4' +
      '|Tier +1,tier+1|Tier -1,tier-1|Hold: strong,hold-strong|Hold: weak,hold-weak' +
      '|Mark crew XP,xp+1' +
      (dt ? '|Debt clock +1,debt+1|Debt clock -1,debt-1' : '');
    // composed Engagement roll: the answers are asked here because prompts exist only in a token-action macro
    var engagement = CMD + ' engagement ?{Plan type|Assault,assault|Deception,deception|Stealth,stealth|Occult,occult|Social,social|Transport,transport}' +
      ' ?{Approach (bold or daring or overly complex)|Neither,0|Bold or daring (+1d),1|Overly complex or contingent (-1d),-1}' +
      ' ?{Plan detail (hits a weakness or meets the target strongest defense)|Neither,0|Exposes a weakness (+1d),1|Target strongest against it (-1d),-1}' +
      ' ?{Friends and enemies (aid or insight or interference)|Neither,0|Friends or contacts help (+1d),1|Enemies or rivals interfere (-1d),-1}' +
      ' ?{Other elements (lower or higher Tier target or the district)|0|1|2|3|-1|-2|-3}';
    var fortune = '&{template:blades} {{charname=@{selected|character_name}}} {{type=fortune}} {{subtitle=^{roll}}} ' +
      '{{title-fortune=1}} {{title=^{fortune}}} @{selected|numberofdice} {{notes=@{selected|notes_query}}} ' +
      '{{charimage=@{selected|chat_image}}} @{selected|title_text}';
    var list = [
      [ABILITY_NAMES[0], CMD + ' roll ?{Roll|' + rollOpts.join('|') + '} ?{Bonus dice|0|1|2|3|4|5|6|-1|-2|-3}'],
      [ABILITY_NAMES[1], engagement],
      [ABILITY_NAMES[2], fortune],
      [ABILITY_NAMES[3], scoreMacro(dt)]
    ];
    // the Downtime hub: the Heat and Hold card (Reduce Heat, Assess hold, income claims, End Downtime)
    if (dt) { list.push([ABILITY_NAMES[4], CMD + ' hh']); }
    list.push(
      [ABILITY_NAMES[5], CMD + ' abilities'],
      [ABILITY_NAMES[6], CMD + ' contacts'],
      [ABILITY_NAMES[7], CMD + ' claims'],
      [ABILITY_NAMES[8], CMD + ' upgrades'],
      [ABILITY_NAMES[9], CMD + ' adj ?{Adjust|' + adjust + '}'],
      [ABILITY_NAMES[10], CMD + ' clocks'],
      [ABILITY_NAMES[11], CMD + ' status'],
      [ABILITY_NAMES[12], CMD + ' setup']
    );
    return list;
  }

  // bar 1 = Heat: linked attribute, max = Heat boxes, shown to and editable by players
  function linkHeatBar(tok, cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'heat' })[0];
    if (!a) { a = createObj('attribute', { _characterid: cid, name: 'heat', current: String(getNum(cid, 'heat', 0)) }); }
    // link first, then value and max: linking copies the attribute's (empty) max over anything set in the same call
    tok.set({ bar1_link: a.id });
    tok.set({ bar1_value: a.get('current'), bar1_max: HEAT_MAX, showplayers_bar1: true, playersedit_bar1: true });
  }

  function doSetup(msg, o) {
    var seen = {}, count = 0;
    var targets = [], tokens = {};
    if (o.c) {
      targets.push(o);
    } else if (msg.selected && msg.selected.length) {
      msg.selected.forEach(function (s) {
        var t = getObj('graphic', s._id);
        var id = t ? t.get('represents') : null;
        if (!id) { return; }
        if (!seen[id]) { seen[id] = true; targets.push({ c: id }); tokens[id] = []; }
        tokens[id].push(t);
      });
    }
    if (!targets.length) { whisper(msg, 'BitDCrew: select one or more crew tokens first.'); return; }
    targets.forEach(function (to) {
      var t = target(msg, to);
      if (!t) { return; }
      var cid = t.ch.id;
      findObjs({ _type: 'ability', _characterid: cid }).forEach(function (a) {
        if (a.get('description') === MARK) { a.remove(); }
      });
      var taken = {};
      findObjs({ _type: 'ability', _characterid: cid }).forEach(function (a) { taken[a.get('name')] = true; });
      var made = 0, skipped = [];
      tokenActions(cid).forEach(function (d) {
        if (taken[d[0]]) { skipped.push(d[0]); return; }
        createObj('ability', { _characterid: cid, name: d[0], description: MARK, action: d[1], istokenaction: true });
        made++;
      });
      var m = mods(cid), on = [];
      ['advancement', 'downtime', 'harm', 'load', 'action'].forEach(function (k) { if (m[k]) { on.push(cap(k)); } });
      var text = made + ' created. Deep Cuts modules on: ' + (on.length ? on.join(', ') : 'none') + '. Rules used: ' +
        (m.downtime ? 'Deep Cuts Downtime' : 'core') + '.';
      if (skipped.length) { text += ' Skipped (an ability with that name already exists): ' + skipped.join(', ') + '.'; }
      var linked = (tokens[cid] || []).map(function (tok) { return linkHeatBar(tok, cid); }).length;
      if (linked) { text += ' Bar 1 is linked to Heat on ' + linked + ' token' + (linked > 1 ? 's' : '') + '.'; }
      note(msg, t.c, 'Setup', 'Token actions ready', text);
      count++;
    });
    return count;
  }

  // ---------------------------------------------------------------- Heat, Wanted

  // A linked token bar is not refreshed by an API write, so any bar 1 linked to heat is set to the attribute value.
  function syncHeatBars(cid) {
    var a = findObjs({ _type: 'attribute', _characterid: cid, name: 'heat' })[0];
    if (!a) { return; }
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      if (g.get('bar1_link') !== a.id) { return; }
      var cur = String(a.get('current'));
      if (String(g.get('bar1_value')) !== cur) { g.set('bar1_value', cur); }
    });
  }
  function healHeatBar(tokId) {
    var tok = getObj('graphic', tokId), link = tok ? tok.get('bar1_link') : null, a = link ? getObj('attribute', link) : null;
    if (!a || a.get('name') !== 'heat') { return; }
    var cur = String(a.get('current'));
    if (String(tok.get('bar1_value')) !== cur) { tok.set('bar1_value', cur); }
  }

  // Heat from a given starting value, with the book's rollover: each time it reaches 9 the crew gains a Wanted level
  // (up to the track's highest level) and Heat clears, the excess rolling over (core, Heat).
  function applyHeat(cid, startHeat, amount) {
    var w = wantedInfo(cid), wanted0 = getNum(cid, w.attr, 0);
    var total = Math.max(0, startHeat + amount), wraps = 0, wanted = wanted0, capped = 0;
    while (total >= HEAT_MAX) {
      total -= HEAT_MAX; wraps++;
      if (wanted < w.max) { wanted++; } else { capped++; }
    }
    setAttr(cid, 'heat', total);
    if (wanted !== wanted0) { setAttr(cid, w.attr, wanted); }
    syncHeatBars(cid);
    setTimeout(function () { syncHeatBars(cid); }, 1500);
    return { cid: cid, before: startHeat, after: total, wraps: wraps, capped: capped, w: w, wantedBefore: wanted0, wantedAfter: wanted };
  }
  function addHeat(cid, amount) { return applyHeat(cid, getNum(cid, 'heat', 0), amount); }

  // lines of the card shown when Heat filled (empty if it did not)
  function wantedLines(cid, res) {
    var L = [];
    if (res.wraps < 1) { return L; }
    var gained = res.wantedAfter - res.wantedBefore, m = mods(cid);
    if (gained > 0) {
      L.push('Heat reached ' + HEAT_MAX + ': Wanted level +' + gained + ' (now ' + res.wantedAfter + '/' + res.w.max + '). Heat is cleared and the excess rolls over (core rules, Heat).');
    }
    if (res.wraps > 1) { L.push('Heat filled ' + res.wraps + ' times in one go.'); }
    if (res.capped > 0) {
      L.push('Wanted was already at its highest level (' + res.w.max + '), so no level was added for ' + res.capped + ' fill' + (res.capped > 1 ? 's' : '') + '. Heat was cleared anyway.');
    }
    if (m.downtime && gained > 0) {
      var eff = Math.min(4, effectiveWanted(cid));
      L.push('Deep Cuts, Entanglements: mark crew xp and pick Bluecoats as the entanglement.');
      L.push('Bluecoats at Wanted level ' + eff + ', reduced by any positive Status you have with them: ' + BLUECOATS[eff]);
      L.push('They can be bought off for ' + (eff + 4) + ' Coin (wanted level + 4).');
      if (slipperyOn(cid)) {
        L.push('Slippery: your effective Wanted level is one less than the actual one, and any Coin, Heat or Rep cost you pay for an entanglement is reduced by one.');
      }
      L.push('[Mark crew XP](' + CMD + ' adj xp+1 --c ' + cid + ')');
    }
    return L;
  }

  function wantedCardText(c, res, headline) {
    var lines = [];
    if (headline) { lines.push(headline); }
    lines = lines.concat(wantedLines(c.id, res));
    return broadcast(c, { type: 'Heat', title: 'Wanted level', content: lines.join(NL) });
  }
  function announceWanted(ch, c, res, headline, exceptPid) {
    var text = wantedCardText(c, res, headline);
    recipients(ch).forEach(function (id) { if (id !== exceptPid) { whisperPlayer(id, text); } });
  }

  // heat attribute changed (token bar 1, the sheet): the track is full
  function autoHeat(obj) {
    var cid = obj.get('_characterid'), ch = getObj('character', cid);
    if (!ch || getAttr(cid, 'sheet_type', 'character') !== 'crew') { return; }
    var cur = parseInt(obj.get('current'), 10);
    if (isNaN(cur) || cur < HEAT_MAX) { return; }
    var res = applyHeat(cid, cur, 0);
    findObjs({ _type: 'graphic', represents: cid }).forEach(function (g) {
      setTimeout(function () { healHeatBar(g.id); }, 1500);
    });
    announceWanted(ch, info(cid), res, 'Heat was set to ' + cur + '. It is now ' + res.after + '/' + HEAT_MAX + '.', null);
  }

  // ---------------------------------------------------------------- rolls

  function diceField(pool) {
    if (pool > 0) {
      var d = [];
      for (var i = 0; i < pool; i++) { d.push('[[d6]]'); }
      return 'dice=' + d.join(', ');
    }
    return 'zerodice=[[d6]], [[d6]]';
  }

  function tail(cid, c) {
    return (c.image ? ' {{charimage=' + clean(c.image) + '}}' : '') + ' ' + getAttr(cid, 'title_text', '');
  }

  // Entanglement rolls posted by this script and not yet seen come back through the chat
  var watching = [];
  function watchRoll(w) {
    var now = Date.now();
    watching = watching.filter(function (x) { return now - x.at < 60000; });
    w.at = now;
    watching.push(w);
  }

  // watch a posted roll, and say so if it never comes back to be read instead of staying silent
  function watchWithTimeout(w, msg, failText) {
    watchRoll(w);
    setTimeout(function () {
      var i = watching.indexOf(w);
      if (i < 0) { return; }
      watching.splice(i, 1);
      whisper(msg, failText);
    }, 20000);
  }

  // values of the d6 inline rolls of a posted card, or null if there are not exactly n of them
  function readDice(msg, n) {
    var rolls = msg.inlinerolls || [], vals = [];
    rolls.forEach(function (r) {
      var rr = r && r.results && r.results.rolls && r.results.rolls[0];
      if (rr && rr.sides === 6 && rr.dice === 1) { vals.push(r.results.total); }
    });
    return vals.length === n ? vals : null;
  }

  function checkWatchedRoll(msg) {
    if (!watching.length) { return; }
    var content = String(msg.content || ''), i, w;
    for (i = 0; i < watching.length; i++) {
      w = watching[i];
      if (Date.now() - w.at > 60000) { continue; }
      if (msg.playerid && msg.playerid !== w.pid && msg.playerid !== 'API') { continue; }
      if (content.indexOf(w.marker || '{{title-entanglement=1}}') < 0 || content.indexOf('{{charname=' + w.name + '}}') < 0) { continue; }
      watching.splice(i, 1);
      try {
        if (w.kind === 'income') { afterIncomeRoll(msg, w); } else if (w.kind === 'engagement') { afterEngagementRoll(msg, w); } else { afterEntanglementRoll(msg, w); }
      } catch (e) { log('BitDCrew roll error: ' + (e && e.stack ? e.stack : e)); }
      return;
    }
  }

  // core, Entanglements: the column is the crew's Heat, the row is the result of the roll
  function afterEntanglementRoll(msg, w) {
    var vals = readDice(msg, w.dice);
    if (!vals) { log('BitDCrew: could not read the dice of that Entanglement roll, so no result was named.'); return; }
    var die = vals[0], i;
    for (i = 1; i < vals.length; i++) { die = w.lowest ? Math.min(die, vals[i]) : Math.max(die, vals[i]); }
    var col = ENT_COLUMNS[w.heat >= 6 ? 2 : (w.heat >= 4 ? 1 : 0)], row = die >= 6 ? 2 : (die >= 4 ? 1 : 0);
    var ch = getObj('character', w.cid);
    if (!ch) { return; }
    var text = broadcast(info(w.cid), {
      type: 'Entanglement', title: col.rows[row].join(' or '),
      content: 'Heat was ' + w.heat + ', so the ' + col.name + ' column. ' + (w.lowest ? 'Lowest' : 'Highest') + ' die ' + die +
        ' is the ' + ENT_ROW_NAMES[row] + ' row: ' + col.rows[row].join(' or ') + '.' + NL +
        'Pick one if there are two. Bring it into play now or hold it for the right moment (core rules, Entanglements).'
    });
    recipients(ch).forEach(function (id) { whisperPlayer(id, text); });
  }

  // Claim income (core book, claims such as Vice Den): "roll dice equal to your Tier. You earn coin equal to the highest result,
  // minus your heat." The dice are read from the posted card; the Coin is added only by a button.
  function doIncomeRoll(msg, t, d, slot) {
    var cid = t.ch.id, c = incomeClaims(cid).filter(function (x) { return x.slot === slot; })[0];
    if (!c) { whisper(msg, 'BitDCrew: that claim is no longer ticked on the sheet.'); return false; }
    if (d.used['inc' + slot]) { note(msg, t.c, 'Downtime', 'Already done', c.name + ' income was already rolled this Downtime.'); return false; }
    d.used['inc' + slot] = true;
    var tier = getNum(cid, 'crew_tier', 0), heat = getNum(cid, 'heat', 0), dice = tier > 0 ? tier : 2;
    var lead = c.name + ' income: ' + (tier > 0 ? tier + ' dice' : 'no dice, 2d keep the lowest') + ', highest die minus your Heat ' + heat + '.';
    var marker = '{{notes=' + clean(lead);
    var w = { kind: 'income', marker: marker, pid: msg.playerid, cid: cid, name: clean(t.c.name), heat: heat, dice: dice, lowest: tier <= 0, claim: c.name, slot: slot, ledger: d.id };
    watchWithTimeout(w, msg, 'BitDCrew: the ' + c.name + ' roll could not be read. Work it out by hand: the highest die (lowest if there were no dice) minus your Heat of ' + heat + ', then add the Coin with Adjust.');
    dbg('income roll ' + c.name + ' ' + cid + ' dice ' + dice + ' heat ' + heat);
    sendChat('player|' + msg.playerid, '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=fortune}} {{subtitle=^{roll}}} ' +
      '{{title-fortune=1}} {{title=^{fortune}}} {{' + diceField(tier) + '}} {{notes=' + clean(lead) + '}}' + tail(cid, t.c));
    return true;
  }

  function afterIncomeRoll(msg, w) {
    var ch = getObj('character', w.cid), d = botState().downtime[w.cid];
    if (!ch) { return; }
    var vals = readDice(msg, w.dice), tell = function (text) { recipients(ch).forEach(function (id) { whisperPlayer(id, text); }); };
    if (!vals) {
      tell('BitDCrew: could not read the dice of the ' + w.claim + ' roll. Work it out by hand: the highest die (lowest if there were no dice) minus your Heat of ' + w.heat + ', then add the Coin with Adjust.');
      return;
    }
    var die = vals[0], i;
    for (i = 1; i < vals.length; i++) { die = w.lowest ? Math.min(die, vals[i]) : Math.max(die, vals[i]); }
    var coin = Math.max(0, die - w.heat);
    var L = ['Dice ' + vals.join(', ') + '. ' + (w.lowest ? 'Lowest' : 'Highest') + ' die ' + die + ', minus Heat ' + w.heat + ' = ' + coin + ' Coin.'];
    if (d && d.id === w.ledger && !d.ended) {
      d.pending = d.pending || {};
      d.pending['inc' + w.slot] = coin;
      d.log.push(w.claim + ' income rolled: ' + coin + ' Coin (die ' + die + ', Heat ' + w.heat + ').');
      if (coin > 0) { L.push('[Add ' + coin + ' Coin to the crew](' + CMD + ' hhact incpay' + w.slot + ' --c ' + w.cid + ' --idx ' + d.id + ')'); }
      else { L.push('Nothing to add.'); }
    } else {
      L.push('That Downtime is no longer open, so there is no button. Add the Coin with Adjust if you want it.');
    }
    tell(broadcast(info(w.cid), { type: 'Income', title: w.claim, content: L.join(NL) }));
  }

  function doRoll(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, what = String(o.pos[0] || ''), bonus = parseInt(o.pos[1], 10);
    if (isNaN(bonus)) { bonus = 0; }
    bonus = clamp(bonus, -3, 6);
    var m = mods(cid), pool, text;
    if (what === 'tier') {
      pool = getNum(cid, 'crew_tier', 0) + bonus;
      text = '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=resist}} {{short=short}} {{title-crew_tier=1}} ' +
        '{{title=^{crew_tier}}} {{subtitle=^{roll_their}}} {{' + diceField(pool) + '}}' + tail(cid, t.c);
      sendChat('player|' + msg.playerid, text);
    } else if (what === 'wanted') {
      if (m.downtime) {
        whisper(msg, 'BitDCrew: Deep Cuts Downtime has no entanglement roll. The GM brings an entanglement in when Heat is 6 or more, or when the fiction demands it. Run ~ Rebuild to update the token actions.');
        return;
      }
      var wi = wantedInfo(cid), heat = getNum(cid, 'heat', 0);
      pool = getNum(cid, wi.attr, 0) + bonus;
      text = '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=vice}} {{short=short}} {{title-entanglement=1}} ' +
        '{{title=^{entanglement}}} {{subtitle=^{wantedroll1}' + heat + ' ' + clean(getAttr(cid, 'setting_heat_label', 'Heat')) + '^{wantedroll2}}} ' +
        '{{' + diceField(pool) + '}}' + tail(cid, t.c);
      if (AUTO_ENTANGLEMENT) {
        watchRoll({ pid: msg.playerid, cid: cid, name: clean(t.c.name), heat: heat, dice: pool > 0 ? pool : 2, lowest: pool <= 0 });
      }
      // a sendChat callback would stop the card being posted, so it is posted as usual and the posted message is watched
      sendChat('player|' + msg.playerid, text);
    } else if (what === 'cohort1' || what.indexOf('cohort:') === 0) {
      var co = cohortList(cid).filter(function (c) { return c.code === what; })[0];
      if (!co) { whisper(msg, 'BitDCrew: that cohort is no longer on the sheet. Run ~ Rebuild to refresh the Roll list.'); return; }
      var type = cohortType(cid, co.prefix), sub = clean(getAttr(cid, co.prefix + '_subtype', ''));
      var verb = clean(getAttr(cid, co.prefix + '_verb', type === 'expert' ? '^{rolls_their}' : '^{roll_their}'));
      pool = cohortPool(cid, co.prefix) + bonus;
      text = '&{template:blades} {{type=resist}} {{short=short}} {{charname=' + clean(co.name).replace(/\s+/g, ' ') + ' (^{' + type + '}' + (sub ? ', ' + sub : '') + ')}} ' +
        '{{title-cohort_quality=1}} {{title=^{cohort_quality}}} {{subtitle=' + verb + '}} {{' + diceField(pool) + '}}' + tail(cid, t.c);
      sendChat('player|' + msg.playerid, text);
    } else {
      whisper(msg, 'BitDCrew: unknown roll "' + clean(o.pos[0]) + '".');
    }
  }

  // ---------------------------------------------------------------- engagement roll

  // the plan types a source applies to: its own list, or the one for this crew type where the crew sheets differ
  function engPlans(src, type) {
    return (src.byType && src.byType[type]) || src.plans;
  }

  // the ticked abilities and claims that fit this plan and need no answer from the table
  function engagementBonuses(cid, plan) {
    var ab = abilitiesOn(cid), cl = claimsOn(cid), out = [], type = crewTypeKey(cid, claimSlots(cid));
    ENG_SOURCES.forEach(function (src) {
      var key = normName(src.name);
      if (src.ask) { return; }
      if ((src.kind === 'ability' ? ab[key] : cl[key]) !== true) { return; }
      if (engPlans(src, type).indexOf(plan) < 0) { return; }
      out.push(src.name);
    });
    return out;
  }

  // sources that need the table to say they apply: Predators (the goal is murder) and the abilities of Party player characters
  function engagementExtras(cid, plan) {
    var ab = abilitiesOn(cid), out = [];
    ENG_SOURCES.forEach(function (src) {
      if (!src.ask || ab[normName(src.name)] !== true || src.plans.indexOf(plan) < 0) { return; }
      out.push({ id: 'x' + out.length, name: src.name, label: src.name + ': ' + src.ask });
    });
    partyPcs().forEach(function (pc) {
      var have = tickedRows(pc.id, 'ability'), who = btn(pc.get('name'));
      ENG_PC_ABILITIES.forEach(function (a) {
        if (have[normName(a.name)] === true) {
          out.push({ id: 'x' + out.length, name: who + APOS + 's ' + a.name, label: who.slice(0, 16) + ', ' + a.name + ': ' + a.ask });
        }
      });
    });
    return out;
  }

  function engagementLine(flow) {
    return cap(flow.plan) + ' plan: ' + flow.parts.join(', ') + ' = ' + Math.max(flow.pool, 0) + 'd' +
      (flow.pool <= 0 ? ' (no dice: roll 2d and keep the lowest)' : '') + '.';
  }

  // the card everyone sees while there is something to confirm
  function engagementCard(msg, t, flow, nonce) {
    var cid = t.ch.id, L = [], open = flow.extras.filter(function (x) { return !flow.done[x.id]; });
    L.push(cap(flow.plan) + ' plan. So far: ' + flow.parts.join(', ') + ' = ' + Math.max(flow.pool, 0) + 'd' + (flow.pool <= 0 ? ' (no dice: roll 2d and keep the lowest)' : '') + '.');
    if (open.length) {
      L.push('Confirm what applies (each once):');
      L.push(open.map(function (x) { return '[' + btn(x.label + ', +1d') + '](' + CMD + ' engadd ' + x.id + ' --c ' + cid + ' --idx ' + nonce + ')'; }).join(' '));
    }
    L.push('[Roll](' + CMD + ' engroll --c ' + cid + ' --idx ' + nonce + ')');
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Engagement', title: 'Confirm', content: L.join(NL) }));
  }

  // the arithmetic card, then the roll card; the dice are read afterwards to name the position
  function finishEngagement(msg, t, flow) {
    var cid = t.ch.id, pool = flow.pool;
    dbg('engagement ' + cid + ' ' + engagementLine(flow));
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Engagement', title: Math.max(pool, 0) + 'd', content: clean(engagementLine(flow)) }));
    if (AUTO_ENGAGEMENT) {
      watchWithTimeout({ kind: 'engagement', marker: '{{title-engagement=1}}', pid: msg.playerid, cid: cid, name: clean(t.c.name), dice: pool > 0 ? pool : 2, lowest: pool <= 0 }, msg,
        'BitDCrew: the engagement roll could not be read, so no position was named. Use the highest die: 1-3 desperate, 4 or 5 risky, 6 controlled, two or more 6s critical.');
    }
    sendChat('player|' + msg.playerid, '&{template:blades} {{charname=' + clean(t.c.name) + '}} {{type=action}} {{short=short}} ' +
      '{{small-title=small-title}} {{subtitle=^{roll_for}}} {{title-engagement=1}} {{title=^{engagement}}} {{' + diceField(pool) + '}}' +
      tail(cid, t.c));
    // the engagement roll begins the score: Bound in Darkness (Action module) gives each Party PC 1 Edge, offered on a card for the table
    if (mods(cid).action && crewAbilityOn(cid, 'Bound in Darkness')) {
      var edgeCard = beginScoreCard(t);
      if (edgeCard) { sendChat('player|' + msg.playerid, edgeCard); }
      else { whisper(msg, 'BitDCrew: Bound in Darkness is ticked, but no player characters are marked as Party members, so no Edge was offered. Mark them in Roll20 (Edit character, Party member).'); }
    }
  }

  function doEngagement(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, i;
    if (o.pos.length !== 5) { whisper(msg, 'BitDCrew: this token action is out of date (the engagement questions changed). Run ~ Rebuild.'); return; }
    var plan = String(o.pos[0]).toLowerCase(), ans = [], bad = PLAN_TYPES.indexOf(plan) < 0;
    for (i = 1; i < 5; i++) { ans.push(/^-?\d+$/.test(String(o.pos[i])) ? parseInt(o.pos[i], 10) : NaN); }
    for (i = 0; i < 3; i++) { if (isNaN(ans[i]) || ans[i] < -1 || ans[i] > 1) { bad = true; } }
    if (isNaN(ans[3]) || ans[3] < -ENG_OTHER_MAX || ans[3] > ENG_OTHER_MAX) { bad = true; }
    if (bad) { whisper(msg, 'BitDCrew: those engagement answers are not valid.'); return; }
    var pool = 1, parts = ['1 luck'];
    ENG_QUESTIONS.forEach(function (q, k) {
      if (ans[k]) { pool += ans[k]; parts.push(ans[k] > 0 ? '+1 ' + q.plus : '-1 ' + q.minus); }
    });
    if (ans[3]) { pool += ans[3]; parts.push((ans[3] > 0 ? '+' : '-') + Math.abs(ans[3]) + ' other elements'); }
    engagementBonuses(cid, plan).forEach(function (name) { pool += 1; parts.push('+1 ' + name); });
    var extras = engagementExtras(cid, plan), flow = { plan: plan, pool: pool, parts: parts, extras: extras, done: {} };
    dbg('engagement extras ' + cid + ' ' + extras.map(function (x) { return x.name; }).join('; '));
    if (!extras.length) { finishEngagement(msg, t, flow); return; }
    flow.kind = 'eng'; flow.rolled = false;
    var nonce = newFlow(cid, flow);
    engagementCard(msg, t, flow, nonce);
  }

  // the engagement card a button belongs to, or null (after saying why)
  function engFlow(msg, t, o) {
    var flow = o.idx ? botState().flows[o.idx] : null;
    if (!flow || flow.cid !== t.ch.id || flow.kind !== 'eng') { whisper(msg, 'BitDCrew: that engagement card is no longer available. Run 2. Engagement again.'); return null; }
    if (flow.rolled) { note(msg, t.c, 'Engagement', 'Already rolled', 'That engagement roll was already made. Run 2. Engagement again for a new one.'); return null; }
    return flow;
  }

  function doEngAdd(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var flow = engFlow(msg, t, o); if (!flow) { return; }
    var id = String(o.pos[0] || ''), x = flow.extras.filter(function (e) { return e.id === id; })[0];
    if (!x) { whisper(msg, 'BitDCrew: unknown engagement choice.'); return; }
    if (flow.done[x.id]) { note(msg, t.c, 'Engagement', 'Already added', x.name + ' is already counted.'); return; }
    flow.done[x.id] = true; flow.pool += 1; flow.parts.push('+1 ' + x.name);
    engagementCard(msg, t, flow, o.idx);
  }

  function doEngRoll(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var flow = engFlow(msg, t, o); if (!flow) { return; }
    flow.rolled = true;
    finishEngagement(msg, t, flow);
  }

  // core book, Engagement Roll: critical (two or more 6s) is controlled and past the first obstacle; 6 controlled; 4 or 5 risky; 1 to 3 desperate
  function afterEngagementRoll(msg, w) {
    var ch = getObj('character', w.cid);
    if (!ch) { return; }
    var vals = readDice(msg, w.dice);
    if (!vals) {
      recipients(ch).forEach(function (id) { whisperPlayer(id, 'BitDCrew: could not read the dice of the engagement roll, so no position was named. Use the highest die: 1-3 desperate, 4 or 5 risky, 6 controlled, two or more 6s critical.'); });
      return;
    }
    var die = vals[0], sixes = 0, i;
    for (i = 0; i < vals.length; i++) {
      if (i > 0) { die = w.lowest ? Math.min(die, vals[i]) : Math.max(die, vals[i]); }
      if (vals[i] === 6) { sixes++; }
    }
    var crit = !w.lowest && sixes >= 2, title, text;
    if (crit) { title = 'Critical'; text = 'Two or more 6s: an exceptional result. You have already overcome the first obstacle and are in a controlled position for what is next.'; }
    else if (die >= 6) { title = 'Controlled position'; text = (w.lowest ? 'Lowest' : 'Highest') + ' die 6: a good result. You are in a controlled position when the action starts.'; }
    else if (die >= 4) { title = 'Risky position'; text = (w.lowest ? 'Lowest' : 'Highest') + ' die ' + die + ': a mixed result. You are in a risky position when the action starts.'; }
    else { title = 'Desperate position'; text = (w.lowest ? 'Lowest' : 'Highest') + ' die ' + die + ': a bad result. You are in a desperate position when the action starts.'; }
    sendChat('player|' + w.pid, broadcast(info(w.cid), { type: 'Engagement', title: title, content: 'Dice ' + vals.join(', ') + '. ' + text }));
  }

  // ---------------------------------------------------------------- abilities and clocks menus

  function doAbilities(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, buttons = [];
    listRows(cid, 'crewability', 'name').forEach(function (r) {
      var label = btn(r.value);
      if (!label) { return; }
      // only abilities the crew has: the circle next to the ability is ticked on the sheet
      if (String(getAttrByName(cid, 'repeating_crewability_' + r.row + '_check')) !== '1') { return; }
      buttons.push('[' + label + '](~' + cid + '|repeating_crewability_' + r.row + '_Show)');
    });
    whisper(msg, broadcast(t.c, {
      type: '^{special_ability}',
      title: 'Show to the table',
      content: buttons.length ? buttons.join(' ') : 'No crew abilities are ticked on this sheet. Tick the circle next to an ability to list it here.'
    }));
  }

  // ---------------------------------------------------------------- contacts

  // text from a sheet note, made safe to post: no brackets (inline rolls and chat buttons), no macro openers, no template braces,
  // no asterisks (they would turn into bold or italic)
  var ASTERISK_OP = String.fromCharCode(0x2217);
  function chatNotes(text, max) {
    var t = String(text === undefined || text === null ? '' : text).replace(/\r/g, '')
      .replace(/\[/g, '(').replace(/\]/g, ')').replace(/([@%?&])\{/g, '$1 {').replace(/\{\{|\}\}/g, '').replace(/\|/g, '/')
      .replace(/\*/g, ASTERISK_OP);
    t = t.split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join(NL).replace(/\n{3,}/g, NL + NL).trim();
    if (t.length > max) { t = t.slice(0, max).replace(/\s+\S*$/, '') + ' ... (the notes were cut at ' + max + ' characters)'; }
    return t;
  }

  // the crew contacts in sheet order: {row, name, fav}. A row with no name is skipped. The checked box on the row is the favorite flag.
  function contactList(cid) {
    var out = [];
    listRows(cid, 'contact', 'name').forEach(function (r) {
      // one safe line: the name goes in a card title as well as on a button
      var name = chatNotes(r.value, 100000).replace(/\s*\n\s*/g, ' ').slice(0, 120).trim();
      if (!name) { return; }
      out.push({ row: r.row, name: name, fav: String(getAttrByName(cid, 'repeating_contact_' + r.row + '_check')) === '1' });
    });
    return out;
  }

  function doContacts(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, list = contactList(cid);
    var lines = list.map(function (c) {
      return '[' + btn((c.fav ? TRIANGLE + ' ' : '') + c.name) + '](' + CMD + ' contact --c ' + cid + ' --row ' + c.row + ')';
    });
    whisper(msg, broadcast(t.c, {
      type: 'Contacts',
      title: 'Show to the table',
      content: list.length ? lines.join(NL) + NL + TRIANGLE + ' marks a favorite contact.' : 'There are no contacts on this sheet.'
    }));
  }

  // the notes of one contact, shown to the table
  function doContact(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, row = String(o.row || ''), c = contactList(cid).filter(function (x) { return x.row === row; })[0];
    if (!c) { whisper(msg, 'BitDCrew: that contact is no longer on the sheet. Run 6a. Contacts again.'); return; }
    var notes = chatNotes(getAttrByName(cid, 'repeating_contact_' + c.row + '_description'), NOTES_MAX);
    sendChat('player|' + msg.playerid, broadcast(t.c, {
      type: c.fav ? 'Favorite contact' : 'Contact',
      title: (c.fav ? TRIANGLE + ' ' : '') + c.name,
      content: notes || 'No notes on the sheet for this contact.'
    }));
  }

  // ---------------------------------------------------------------- claims

  var SMALL_WORDS = ' the of and a an in on ';
  // a claim name as text: the sheet may hold the translation key (the name with underscores) or the English text, which can span lines.
  // prefix is the key prefix to drop (the claim one by default; upgrades and the crew type pass their own)
  function claimDisplay(raw, prefix) {
    var r = String(raw === undefined || raw === null ? '' : raw), key = /_/.test(r) || r === r.toLowerCase();
    var n = r.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(prefix || /^claim /i, '');
    if (!key) { return n; }
    return n.split(' ').map(function (w, i) {
      return (i > 0 && SMALL_WORDS.indexOf(' ' + w + ' ') >= 0) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }

  // the claims on the sheet in slot order: {slot, name, key, held, sheet}. A slot with no name is skipped.
  function claimSlots(cid) {
    var out = [];
    for (var i = 1; i <= 15; i++) {
      var name = chatNotes(claimDisplay(getAttrByName(cid, 'claim_' + i + '_name')), 100000).replace(/\s*\n\s*/g, ' ').slice(0, 80).trim();
      if (!name) { continue; }
      out.push({
        slot: i, name: name, key: normName(name), held: isOn(cid, 'claim_' + i + '_check'),
        sheet: chatNotes(getAttrByName(cid, 'claim_' + i + '_desc'), 400).replace(/\s*\n\s*/g, ' ')
      });
    }
    return out;
  }

  // the crew type from its free text, else the type whose claim list overlaps this sheet most
  function crewTypeKey(cid, slots) {
    var tv = String(getAttr(cid, 'crew_type', '')).toLowerCase(), i, best = '', bestN = 0, counts = {};
    for (i = 0; i < CREW_STEMS.length; i++) { if (tv.indexOf(CREW_STEMS[i][0]) >= 0) { return CREW_STEMS[i][1]; } }
    slots.forEach(function (s) {
      (CLAIM_TEXT[s.key] || []).forEach(function (e) { e[0].forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
    });
    Object.keys(counts).forEach(function (c) { if (counts[c] > bestN) { best = c; bestN = counts[c]; } });
    return best;
  }

  function claimBookText(key, type) {
    var entries = CLAIM_TEXT[key], i;
    if (!entries) { return ''; }
    for (i = 0; i < entries.length; i++) { if (entries[i][0].indexOf(type) >= 0) { return entries[i][1]; } }
    return entries[0][1];
  }

  function postClaimCard(msg, t, held, title, lines) {
    sendChat('player|' + msg.playerid, broadcast(t.c, {
      type: held ? 'Claim held' : 'Claim not held',
      title: (held ? G_ON : G_OFF) + ' ' + title,
      content: lines.map(function (x) { return clean(x); }).join(NL)
    }));
  }

  function doClaims(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, slots = claimSlots(cid), lines = [], turfDone = false;
    var turfs = slots.filter(function (s) { return s.key === 'turf'; });
    slots.forEach(function (s) {
      if (s.key === 'turf') {
        if (turfDone) { return; }
        turfDone = true;
        var h = turfs.filter(function (x) { return x.held; }).length;
        lines.push('[' + btn((h ? G_ON : G_OFF) + ' Turf: ' + h + ' of ' + turfs.length + ' held') + '](' + CMD + ' claiminfo --c ' + cid + ' --row turf)');
        return;
      }
      lines.push('[' + btn((s.held ? G_ON : G_OFF) + ' ' + s.name) + '](' + CMD + ' claiminfo --c ' + cid + ' --n ' + s.slot + ')');
    });
    whisper(msg, broadcast(t.c, {
      type: 'Claims',
      title: 'Show to the table',
      content: slots.length ? lines.join(NL) + NL + ital(G_ON + ' held by the crew, ' + G_OFF + ' not held.') : 'There are no claims on this sheet.'
    }));
  }

  // a button that posts the other text of a claim or upgrade (the one not in force) to the table, if wanted
  function altButton(label, cmd) { return '[' + btn(label) + '](' + CMD + ' ' + cmd + ' alt)'; }

  // the rule in force for one claim, and the other text kept behind a button: {main, altLabel, alt}
  function claimRules(cid, s, type, dtOn) {
    var book = claimBookText(s.key, type), dc = CLAIM_DC[s.key], ruling = (CLAIM_TYPE_RULING[s.key] || {})[type];
    if (ruling) {
      return { main: ruleLine('Rules in force (Deep Cuts crew sheets v1.2b):', ruling), altLabel: 'Show the core book text',
        alt: book ? ruleLine('Core book text (not used for this crew):', book, true) : '' };
    }
    if (dc) {
      if (isOn(cid, dc.attr)) {
        return { main: ruleLine('Rules in force (Deep Cuts, ' + dc.module + ' module):', dc.text), altLabel: 'Show the core book text',
          alt: book ? ruleLine('Core book text (replaced while the module is on):', book, true) : '' };
      }
      var off = ruleLine('Deep Cuts text (' + dc.module + ' module, off for this crew):', dc.text, true);
      return book ? { main: ruleLine('Rules in force (core book):', book), altLabel: 'Show the Deep Cuts text, module off', alt: off } : { main: off, altLabel: '', alt: '' };
    }
    if (book) { return { main: ruleLine('Rules (core book):', book), altLabel: '', alt: '' }; }
    return { main: ital('No book text for this claim: the core book has no entry for it.'), altLabel: '', alt: '' };
  }

  // the rules text of one claim, shown to the table: the rule in force in full, the other text behind a button
  function doClaimInfo(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, slots = claimSlots(cid), type = crewTypeKey(cid, slots), L = [], dtOn = isOn(cid, 'setting_dc_downtime'), alt = String(o.pos[0] || '') === 'alt';
    if (String(o.row || '') === 'turf') {
      var turfs = slots.filter(function (s) { return s.key === 'turf'; }), held = turfs.filter(function (s) { return s.held; }).length, ttl = 'Turf: ' + held + ' of ' + turfs.length + ' held';
      if (!turfs.length) { whisper(msg, 'BitDCrew: there are no turf claims on this sheet. Run 6b. Claims again.'); return; }
      var tmain = dtOn ? ruleLine('Rules in force (Deep Cuts, Downtime module):', TURF_DC) : ruleLine('Rules (core book):', TURF_CORE);
      var tlabel = dtOn ? 'Show the core book text' : 'Show the Deep Cuts text, module off';
      var talt = dtOn ? ruleLine('Core book:', TURF_CORE, true) : ruleLine('Deep Cuts text (Downtime module, off for this crew):', TURF_DC, true);
      if (alt) { postClaimCard(msg, t, held > 0, ttl, [talt]); return; }
      L.push(bold('Turf claims held by this crew: ' + held + ' of ' + turfs.length + '.'));
      L.push(tmain);
      L.push(altButton(tlabel, 'claiminfo --c ' + cid + ' --row turf'));
      var hag = slots.filter(function (x) { return x.key === 'hagfish farm'; })[0];
      if (dtOn && hag) { L.push('Hagfish Farm also counts as turf (Deep Cuts crew sheets v1.2b): ' + bold(hag.held ? 'held' : 'not held') + '.'); }
      L.push(ital('Turf boxes marked on the sheet:') + ' ' + getNum(cid, 'turf', 0) + '.');
      postClaimCard(msg, t, held > 0, ttl, L);
      return;
    }
    var n = parseInt(o.n, 10), s = slots.filter(function (x) { return x.slot === n && x.key !== 'turf'; })[0];
    if (!s) { whisper(msg, 'BitDCrew: that claim is no longer on the sheet. Run 6b. Claims again.'); return; }
    var r = claimRules(cid, s, type, dtOn);
    if (alt) {
      if (!r.alt) { whisper(msg, 'BitDCrew: there is no other text for that claim.'); return; }
      postClaimCard(msg, t, s.held, s.name, [r.alt]);
      return;
    }
    L.push(bold(s.held ? 'Held by this crew.' : 'Not held by this crew.'));
    L.push(r.main);
    if (r.alt) { L.push(altButton(r.altLabel, 'claiminfo --c ' + cid + ' --n ' + s.slot)); }
    if (s.sheet) { L.push(ruleLine('On the sheet:', s.sheet, true)); }
    postClaimCard(msg, t, s.held, s.name, L);
  }

  // ---------------------------------------------------------------- crew upgrades

  // an upgrade name as text: the sheet may hold the translation key (crew_upgrade_elite_thugs) or the English text
  function upgradeName(raw) {
    return chatNotes(claimDisplay(raw, /^crew upgrade /i), 100000).replace(/\s*\n\s*/g, ' ').slice(0, 120).trim();
  }

  // the button and title form: the sheet puts the effect in brackets after some names, for example "Hardened (+1 trauma box)"
  function upgradeShort(name) {
    return name.replace(/\s*\(.*$/, '').trim() || name;
  }

  // the core book entry for an upgrade name, '' if there is none
  function upgradeBookText(name) {
    var n = normName(upgradeShort(name)).replace(/&/g, 'and').replace(/'/g, '').replace(/\s+/g, ' '), i;
    for (i = 0; i < UPGRADE_BOOK.length; i++) {
      if (UPGRADE_BOOK[i][0].indexOf(n) >= 0) { return UPGRADE_BOOK[i][1]; }
    }
    return '';
  }

  function upgradeBoxes(cid, prefix, n) {
    var out = [], i;
    for (i = 1; i <= n; i++) { out.push(isOn(cid, prefix + '_check_' + i)); }
    return out;
  }

  // one circle per box, in the order of the boxes on the sheet (the boxes are not linked: any one can be marked)
  function boxGlyphs(boxes) {
    return boxes.map(function (b) { return b ? G_ON : G_OFF; }).join('');
  }

  // taken: every box marked, except the lair upgrades whose second box only improves the first
  function upgradeState(boxes, levels) {
    var n = boxes.filter(Boolean).length;
    if (!n) { return 'none'; }
    return (levels || n === boxes.length) ? 'taken' : 'partial';
  }

  // the upgrades of one category in sheet order: {cat, ref, key, name, short, boxes, state, levels, text, copy, cost}
  function upgradeItems(cid, cat) {
    var out = [];
    if (cat === 'special') {
      listRows(cid, 'upgrade', 'name').forEach(function (r) {
        var name = upgradeName(r.value);
        if (!name) { return; }
        var base = 'repeating_upgrade_' + r.row, n = clamp(getNum(cid, base + '_numboxes', 1), 1, 3), boxes = upgradeBoxes(cid, base, n);
        out.push({
          cat: cat, ref: r.row, key: '', name: name, short: upgradeShort(name), boxes: boxes, levels: false, state: upgradeState(boxes, false),
          text: chatNotes(getAttrByName(cid, base + '_description'), 700).replace(/\s*\n\s*/g, ' '), copy: false,
          cost: getNum(cid, base + '_cost', 0)
        });
      });
      return out;
    }
    (UPGRADE_FIXED[cat] || []).forEach(function (def) {
      var key = def[0], prefix = 'upgrade_' + key, boxes = upgradeBoxes(cid, prefix, def[1]), levels = UPGRADE_LEVELS.indexOf(key) >= 0;
      var name = upgradeName(getAttrByName(cid, prefix + '_name')) || (key.charAt(0).toUpperCase() + key.slice(1));
      var text = chatNotes(getAttrByName(cid, prefix + '_description'), 700).replace(/\s*\n\s*/g, ' '), copy = false;
      if (!text) { text = UPGRADE_SHEET_TEXT[key]; copy = true; }
      out.push({
        cat: cat, ref: key, key: key, name: name, short: upgradeShort(name), boxes: boxes, levels: levels, state: upgradeState(boxes, levels),
        text: text, copy: copy, cost: UPGRADE_COIN_PER_BOX
      });
    });
    return out;
  }

  // "Bravos Special": the crew type from the sheet's free text, else the text itself, else "Crew"
  function crewTypeLabel(cid) {
    var tv = String(getAttr(cid, 'crew_type', '')), low = tv.toLowerCase(), i;
    for (i = 0; i < CREW_STEMS.length; i++) {
      if (low.indexOf(CREW_STEMS[i][0]) >= 0) { return CREW_STEMS[i][1].charAt(0).toUpperCase() + CREW_STEMS[i][1].slice(1); }
    }
    return chatNotes(claimDisplay(tv, /^crew /i), 100000).replace(/\s*\n\s*/g, ' ').slice(0, 30).trim() || 'Crew';
  }

  function upgradeCategoryLabel(cid, cat) {
    return cat === 'special' ? crewTypeLabel(cid) + ' Special' : cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  // first card: the four categories
  function doUpgrades(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, btns = [], counts = [];
    UPGRADE_CATEGORIES.forEach(function (cat) {
      var items = upgradeItems(cid, cat), label = upgradeCategoryLabel(cid, cat);
      var taken = items.filter(function (u) { return u.state === 'taken'; }).length, part = items.filter(function (u) { return u.state === 'partial'; }).length;
      btns.push('[' + btn(label) + '](' + CMD + ' upgradelist --c ' + cid + ' --row ' + cat + ')');
      counts.push(bold(clean(label) + ':') + ' ' + taken + ' of ' + items.length + ' taken' + (part ? ', ' + part + ' in progress' : ''));
      dbg('upgrades ' + cat + ': ' + items.length + ' found, ' + taken + ' taken, ' + part + ' in progress');
    });
    whisper(msg, broadcast(t.c, { type: 'Crew upgrades', title: 'Show to the table', content: btns.join(NL) + NL + counts.join(NL) }));
  }

  // second card: the upgrades of one category, one circle per box
  function doUpgradeList(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, cat = String(o.row || '');
    if (UPGRADE_CATEGORIES.indexOf(cat) < 0) { whisper(msg, 'BitDCrew: unknown upgrade category. Run 6c. Crew Upgrades again.'); return; }
    var items = upgradeItems(cid, cat), label = upgradeCategoryLabel(cid, cat);
    var lines = items.map(function (u) {
      return '[' + btn(boxGlyphs(u.boxes) + ' ' + u.short) + '](' + CMD + ' upgradeinfo --c ' + cid + ' --row ' + cat + ' --n ' + u.ref + ')';
    });
    var content;
    if (!items.length) {
      content = cat === 'special' ? 'There are no crew-special upgrades on this sheet. Set the crew type on the sheet and they fill in.' : 'There are no upgrades in this category on this sheet.';
    } else {
      content = lines.join(NL) + NL + ital('One circle per box on the sheet: ' + G_ON + ' marked, ' + G_OFF + ' empty. Upgrades with several boxes count as taken only when every box is marked' +
        (cat === 'lair' ? ', except Carriage, Boat, Secure and Vault, which count from the first box.' : '.'));
    }
    dbg('upgradelist ' + cat + ': ' + items.map(function (u) { return u.short + ' ' + boxGlyphs(u.boxes); }).join(', '));
    whisper(msg, broadcast(t.c, { type: 'Crew upgrades', title: label, content: content }));
  }

  // third card: one upgrade, shown to the table
  function doUpgradeInfo(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, cat = String(o.row || ''), ref = String(o.n === null || o.n === undefined ? '' : o.n);
    // the v0.9.0 buttons carried both in --row as category:upgrade; Roll20 did not run them, but a pasted command may
    if (cat.indexOf(':') >= 0) { ref = cat.slice(cat.indexOf(':') + 1); cat = cat.slice(0, cat.indexOf(':')); }
    dbg('upgradeinfo asked for category ' + JSON.stringify(cat) + ', upgrade ' + JSON.stringify(ref));
    var u = UPGRADE_CATEGORIES.indexOf(cat) < 0 ? null : upgradeItems(cid, cat).filter(function (x) { return x.ref === ref; })[0];
    if (!u) { whisper(msg, 'BitDCrew: that upgrade is no longer on the sheet. Run 6c. Crew Upgrades again.'); return; }
    var dtOn = isOn(cid, 'setting_dc_downtime'), L = [], n = u.boxes.length, marked = u.boxes.filter(Boolean).length, alt = String(o.pos[0] || '') === 'alt';
    var book = (cat === 'special' || cat === 'lair') ? upgradeBookText(u.name) : '', dc = u.key ? UPGRADE_DC[u.key] : null;
    var sheetLine = u.text ? ruleLine(u.copy ? 'Sheet text (copy kept in the script):' : 'On the sheet:', u.text, true) : '';
    // the rule in force goes in full; the text it replaces, or the Deep Cuts text while the module is off, waits behind a button
    var mainDc = '', altLine = '', altLabel = '';
    if (dc && dtOn && dc.replaces) {
      mainDc = ruleLine('Rules in force (Deep Cuts, Downtime module, ' + dc.page + '):', dc.text);
      if (u.text) {
        // a sheet that already carries the Deep Cuts wording needs no second line
        if (normName(u.text) === normName(dc.text)) { sheetLine = ''; }
        else { altLine = sheetLine; altLabel = 'Show the sheet text it replaces'; sheetLine = ''; }
      }
    } else if (dc && dtOn) {
      mainDc = ruleLine('Also in force (Deep Cuts, Downtime module, ' + dc.page + '):', dc.text);
    } else if (dc) {
      altLine = ruleLine('Deep Cuts text (Downtime module, off for this crew, ' + dc.page + '):', dc.text, true);
      altLabel = 'Show the Deep Cuts text, module off';
    }
    var state = u.state === 'taken' ? 'Upgrade taken' : u.state === 'partial' ? 'Upgrade in progress' : 'Upgrade not taken';
    function post(lines) {
      sendChat('player|' + msg.playerid, broadcast(t.c, { type: state, title: boxGlyphs(u.boxes) + ' ' + u.short, content: lines.map(function (x) { return clean(x); }).join(NL) }));
    }
    if (alt) {
      if (!altLine) { whisper(msg, 'BitDCrew: there is no other text for that upgrade.'); return; }
      post([altLine]);
      return;
    }
    L.push(n === 1 ? bold('Box on the sheet:') + ' ' + boxGlyphs(u.boxes) + (marked ? ' (marked).' : ' (not marked).') :
      bold('Boxes on the sheet:') + ' ' + boxGlyphs(u.boxes) + ' (' + marked + ' of ' + n + ' marked). ' +
      (u.levels ? 'Counts as taken from any box; a second box improves it.' : 'Counts as taken only when all ' + n + ' boxes are marked.'));
    if (u.short !== u.name) { L.push(ital('Sheet name:') + ' ' + u.name); }
    if (dtOn && u.cost > 0) {
      L.push(bold('Cost') + ' (Deep Cuts, Development, p83): ' + bold(u.cost + ' coin') + ' per box' + (n > 1 ? ' (' + (u.cost * n) + ' coin for all ' + n + ' boxes)' : '') + '.');
    }
    if (mainDc) { L.push(mainDc); }
    if (altLine) { L.push(altButton(altLabel, 'upgradeinfo --c ' + cid + ' --row ' + cat + ' --n ' + ref)); }
    if (book) { L.push(ruleLine('Core book:', book, true)); }
    else if (cat === 'special') { L.push(ital('No book text for this upgrade: the core book has no entry for it.')); }
    if (sheetLine) { L.push(sheetLine); }
    if (cat === 'quality') { L.push(ruleLine('Core book, Quality:', UPGRADE_QUALITY_RULE, true)); }
    dbg('upgradeinfo ' + cat + ':' + ref + ' state ' + u.state + ', text from ' + (u.copy ? 'script copy' : u.text ? 'sheet' : 'none') + ', book ' + (book ? 'yes' : 'no') + ', other text ' + (altLine ? 'behind a button' : 'none'));
    post(L);
  }

  function clockSize(cid, base) {
    var n = getNum(cid, base + '_size', 0);
    return [4, 6, 8, 10, 12].indexOf(n) >= 0 ? n : 4;
  }
  function crewClocks(cid) {
    var out = [];
    listRows(cid, 'crewclock', 'name').forEach(function (r) {
      var nm = String(r.value || '').trim();
      if (!nm) { return; }
      var base = 'repeating_crewclock_' + r.row;
      out.push({ row: r.row, name: nm, base: base, size: clockSize(cid, base), progress: getNum(cid, base + '_progress', 0) });
    });
    return out;
  }

  function doClocks(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, L = [];
    crewClocks(cid).forEach(function (k) {
      L.push(btn(k.name) + ' ' + k.progress + '/' + k.size + ' [-1](' + CMD + ' clock --c ' + cid + ' --row ' + k.row + ' --n -1) ' +
        '[+1](' + CMD + ' clock --c ' + cid + ' --row ' + k.row + ' --n 1) ' +
        '[Show](~' + cid + '|repeating_crewclock_' + k.row + '_Show)');
    });
    whisper(msg, broadcast(t.c, { type: '', title: 'Clocks', content: L.length ? L.join(NL) : 'No crew clocks are named on this sheet.' }));
  }

  function clockCard(msg, c, title, n, size) {
    whisper(msg, '&{template:bitd-broadcast} {{charname=' + clean(c.name) + '}} {{title=' + title + '}} {{clock=1}} {{clocksize=' + size +
      '}} {{clockprogress=' + n + '}}');
  }

  function doClockTick(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, delta = parseInt(o.n, 10);
    if (isNaN(delta) || delta === 0) { whisper(msg, 'BitDCrew: pick -1 or +1.'); return; }
    var k = crewClocks(cid).filter(function (x) { return x.row === o.row; })[0];
    if (!k) { whisper(msg, 'BitDCrew: that clock is no longer on the sheet.'); return; }
    var next = clamp(k.progress + (delta > 0 ? 1 : -1), 0, k.size);
    if (next === k.progress) { note(msg, t.c, 'Clock', btn(k.name) + ' ' + k.progress + ' / ' + k.size, delta > 0 ? 'Already full.' : 'Already empty.'); return; }
    setAttr(cid, k.base + '_progress', next);
    clockCard(msg, t.c, clean(k.name), next, k.size);
  }

  // ---------------------------------------------------------------- adjust

  function counter(msg, t, attrName, delta, lo, hi, label, noteText) {
    var cid = t.ch.id, cur = getNum(cid, attrName, 0), next = clamp(cur + delta, lo, hi);
    if (next === cur) { note(msg, t.c, label, label + ' ' + cur, delta > 0 ? 'Already at the maximum.' : 'Already at the minimum.'); return; }
    setAttr(cid, attrName, next);
    note(msg, t.c, label, label + ' ' + next + ' / ' + hi, 'Was ' + cur + '.' + (noteText ? ' ' + noteText : ''));
  }

  function tickClock(msg, t, attrName, delta, size, title) {
    var cid = t.ch.id, cur = getNum(cid, attrName, 0), next = clamp(cur + delta, 0, size);
    if (next === cur) { note(msg, t.c, 'Clock', cur + ' / ' + size, (delta > 0 ? 'Already full.' : 'Already empty.')); return; }
    setAttr(cid, attrName, next);
    clockCard(msg, t.c, title, next, size);
  }

  function adjustHeat(msg, t, delta) {
    var cid = t.ch.id, cur = getNum(cid, 'heat', 0);
    if (delta < 0 && cur === 0) { note(msg, t.c, 'Heat', 'Heat 0', 'Already at the minimum.'); return; }
    var res = addHeat(cid, delta);
    note(msg, t.c, 'Heat', 'Heat ' + res.after + ' / ' + HEAT_MAX, bar(res.after, HEAT_MAX) + (res.wraps ? ' Heat filled: see the Wanted card.' : ''));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, null); }
  }

  function adjustWanted(msg, t, delta) {
    var cid = t.ch.id, w = wantedInfo(cid);
    counter(msg, t, w.attr, delta, 0, w.max, 'Wanted');
  }

  function markCrewXp(msg, t) {
    var cid = t.ch.id, m = mods(cid);
    if (m.advancement) {
      var size = getNum(cid, 'dc_xp_clocksize', 6);
      for (var i = 1; i <= 4; i++) {
        var cur = getNum(cid, 'dc_crew_xpclock_' + i, 0);
        if (cur < size) {
          setAttr(cid, 'dc_crew_xpclock_' + i, cur + 1);
          clockCard(msg, t.c, 'Crew advancement clock ' + i, cur + 1, size);
          return;
        }
      }
      note(msg, t.c, 'XP', 'All clocks full', 'All four crew advancement clocks are full. Spend them on an advance, or add another clock (Deep Cuts, Advancement).');
      return;
    }
    var before = getNum(cid, 'crew_xp', 0);
    if (before >= CREW_XP_MAX) { note(msg, t.c, 'XP', 'Crew XP ' + before, 'Already at the maximum.'); return; }
    setAttr(cid, 'crew_xp', before + 1);
    note(msg, t.c, 'XP', 'Crew XP ' + (before + 1) + ' / ' + CREW_XP_MAX, 'Was ' + before + '.');
    // core crew advancement (both Deep Cuts modules off): reminder only, nothing is cleared or paid out
    if (before + 1 >= CREW_XP_MAX && !m.downtime) {
      whisper(msg, broadcast(t.c, {
        type: 'Crew XP', title: 'Crew advancement tracker full',
        content: 'Clear the marks and take a new special ability or mark two crew upgrade boxes (core rules, Crew Advancement). ' +
          'Each PC gets stash equal to the crew Tier+2 for the advance.' + NL +
          '[Clear the XP tracker](' + CMD + ' adj xpclear --c ' + cid + ')'
      }));
    }
  }

  function doAdjust(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), m = mods(cid), tr = coinTrack(cid), res;
    switch (code) {
      case 'heat+1': adjustHeat(msg, t, 1); break;
      case 'heat-1': adjustHeat(msg, t, -1); break;
      case 'wanted+1': adjustWanted(msg, t, 1); break;
      case 'wanted-1': adjustWanted(msg, t, -1); break;
      case 'incarc':
        // core, Incarceration: the wanted level is reduced by 1 and the crew clears its Heat
        var wi = wantedInfo(cid), wnow = getNum(cid, wi.attr, 0), wnext = Math.max(0, wnow - 1);
        setAttr(cid, wi.attr, wnext);
        setAttr(cid, 'heat', 0);
        syncHeatBars(cid);
        note(msg, t.c, 'Heat', 'Incarceration', 'Wanted ' + wnow + ' to ' + wnext + ', Heat cleared (core rules, Incarceration).' + (wnow === 0 ? ' Wanted was already 0.' : ''));
        break;
      case 'rep+1': counter(msg, t, 'rep', 1, 0, REP_MAX, 'Rep'); break;
      case 'rep-1': counter(msg, t, 'rep', -1, 0, REP_MAX, 'Rep'); break;
      case 'turf+1': counter(msg, t, 'turf', 1, 0, TURF_MAX, 'Turf'); break;
      case 'turf-1': counter(msg, t, 'turf', -1, 0, TURF_MAX, 'Turf'); break;
      case 'coin+1': counter(msg, t, tr.attr, 1, 0, tr.max, 'Coin'); break;
      case 'coin+2': counter(msg, t, tr.attr, 2, 0, tr.max, 'Coin'); break;
      case 'coin+4': counter(msg, t, tr.attr, 4, 0, tr.max, 'Coin'); break;
      case 'coin-1': counter(msg, t, tr.attr, -1, 0, tr.max, 'Coin'); break;
      case 'coin-2': counter(msg, t, tr.attr, -2, 0, tr.max, 'Coin'); break;
      case 'coin-4': counter(msg, t, tr.attr, -4, 0, tr.max, 'Coin'); break;
      case 'tier+1': counter(msg, t, 'crew_tier', 1, 0, TIER_MAX, 'Tier'); break;
      case 'tier-1': counter(msg, t, 'crew_tier', -1, 0, TIER_MAX, 'Tier'); break;
      case 'hold-strong':
      case 'hold-weak':
        setAttr(cid, 'hold', code === 'hold-strong' ? 'strong' : 'weak');
        note(msg, t.c, 'Hold', 'Hold ' + (code === 'hold-strong' ? 'strong' : 'weak'), 'Set by hand.');
        break;
      case 'holdassess':
        if (!m.downtime) { whisper(msg, 'BitDCrew: the Downtime module is off for this crew, so hold is set by hand.'); break; }
        assessHold(msg, t);
        break;
      case 'xp+1': markCrewXp(msg, t); break;
      case 'xpclear':
        setAttr(cid, 'crew_xp', 0);
        note(msg, t.c, 'XP', 'Crew XP 0', 'Tracker cleared.');
        break;
      case 'debt+1':
      case 'debt-1':
        if (!m.downtime) { whisper(msg, 'BitDCrew: the Downtime module is off for this crew.'); break; }
        tickClock(msg, t, 'crew_debt_dc', code === 'debt+1' ? 1 : -1, getNum(cid, 'crew_debt_dc_max', 4), '^{debt}');
        break;
      case 'rh-coin':
      case 'rh-rep':
        // Deep Cuts, Reduce Heat: Heat -1 for each Coin or Rep the crew expends
        if (!m.downtime) { whisper(msg, 'BitDCrew: Reduce Heat by spending Coin or Rep is a Deep Cuts Downtime rule, and the module is off for this crew.'); break; }
        reduceHeat(msg, t, code === 'rh-coin' ? 'Coin' : 'Rep');
        break;
      case 'hh': doHeatHold(msg, o); break;
      case 'dtstart': doDowntimeStart(msg, t); break;
      case 'beginscore': doBeginScore(msg, t); break;
      default: whisper(msg, 'BitDCrew: unknown adjustment "' + clean(code) + '".');
    }
  }

  // Deep Cuts, Assess Hold: strong hold when turf claims are equal to or greater than the Tier
  function holdByRule(cid) { return getNum(cid, 'turf', 0) >= getNum(cid, 'crew_tier', 0) ? 'strong' : 'weak'; }

  function assessHold(msg, t) {
    var cid = t.ch.id, holdNow = holdByRule(cid);
    setAttr(cid, 'hold', holdNow);
    note(msg, t.c, 'Hold', 'Hold ' + holdNow, 'Turf ' + getNum(cid, 'turf', 0) + ', Tier ' + getNum(cid, 'crew_tier', 0) +
      '. Strong hold needs turf claims equal to or greater than your Tier (Deep Cuts, Assess Hold).');
    return holdNow;
  }

  // Deep Cuts, Reduce Heat: Heat -1 for each Coin or Rep the crew expends. Returns true when it was applied.
  function reduceHeat(msg, t, payName) {
    var cid = t.ch.id, pay = payName === 'Coin' ? coinTrack(cid).attr : 'rep';
    if (getNum(cid, 'heat', 0) < 1) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce.'); return false; }
    if (getNum(cid, pay, 0) < 1) { note(msg, t.c, 'Heat', 'No ' + payName, 'The crew has no ' + payName + ' to spend.'); return false; }
    setAttr(cid, pay, getNum(cid, pay, 0) - 1);
    var res = addHeat(cid, -1);
    note(msg, t.c, 'Heat', 'Heat ' + res.after + ' / ' + HEAT_MAX, 'Spent 1 ' + payName + ' (now ' + getNum(cid, pay, 0) + ') to reduce Heat by 1 (Deep Cuts, Reduce Heat).');
    return true;
  }

  // ---------------------------------------------------------------- Downtime ledger and the Heat and Hold card
  // One record per crew: what was used this Downtime (once-per-Downtime abilities) and what happened. A Deep Cuts Score
  // starts one; so does 5. Downtime when none is open. End Downtime closes it.

  function startDowntime(cid, why) {
    var st = botState(), prev = st.downtime[cid];
    var rec = { id: Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), at: Date.now(), used: {}, pending: {}, log: [], ended: false, startHeat: null, assessed: null };
    st.downtime[cid] = rec;
    dbg('downtime start ' + cid + ' ' + rec.id + ' (' + why + ')' + (prev && !prev.ended ? ', replacing an open one' : ''));
    return rec;
  }
  function openDowntime(cid) {
    var d = botState().downtime[cid];
    return (d && !d.ended) ? d : null;
  }
  // the open Downtime a Heat and Hold button belongs to, or null (after telling the player why)
  function ledgerFor(msg, t, o) {
    var d = botState().downtime[t.ch.id];
    if (!d || !o.idx || d.id !== o.idx) {
      whisper(msg, 'BitDCrew: that Downtime is no longer open. Open it again with 5. Downtime, which starts a new one.');
      return null;
    }
    if (d.ended) { note(msg, t.c, 'Downtime', 'Already ended', 'That Downtime was ended. Start a new one with 5. Downtime.'); return null; }
    return d;
  }

  function heatHoldText(t, d) {
    var cid = t.ch.id, ab = abilitiesOn(cid), L = [], heat = getNum(cid, 'heat', 0), w = wantedInfo(cid);
    var turf = getNum(cid, 'turf', 0), tier = getNum(cid, 'crew_tier', 0), hold = String(getAttr(cid, 'hold', 'strong')).toLowerCase();
    var b = function (code, label) { return '[' + label + '](' + CMD + ' hhact ' + code + ' --c ' + cid + ' --idx ' + d.id + ')'; };
    L.push('Heat ' + bar(heat, HEAT_MAX) + ' ' + heat + '/' + HEAT_MAX + '. ' + w.label + ' ' + getNum(cid, w.attr, 0) + '/' + w.max + '.');
    if (heat > 0) {
      L.push('Reduce Heat by 1 for each Coin or Rep you spend (Deep Cuts, Heat and Hold): ' + b('rh-coin', 'Spend 1 Coin: Heat -1') + ' ' + b('rh-rep', 'Spend 1 Rep: Heat -1'));
    } else {
      L.push('Heat is 0, so there is nothing to reduce.');
    }
    if (ab['just passing through'] === true && !d.used.jpt && heat > 0) {
      L.push('Just Passing Through: during Downtime, take -1 Heat. ' + b('jpt', 'Just Passing Through: Heat -1'));
    }
    var inc = incomeClaims(cid);
    if (inc.length) {
      L.push('Claim income (roll your Tier in dice, highest die minus your Heat, core claims): ' + inc.map(function (c) {
        return d.used['inc' + c.slot] ? c.name + ' (rolled)' : b('inc' + c.slot, c.name + ' income');
      }).join(' '));
    }
    L.push('Hold is ' + hold + '. By the Deep Cuts rule (turf ' + turf + ', Tier ' + tier + ') it is ' + holdByRule(cid) + '. ' + b('hold', 'Assess hold'));
    if (d.log.length) { L.push('This Downtime so far:'); d.log.forEach(function (x) { L.push(x); }); }
    L.push(b('end', 'End Downtime'));
    return broadcast(t.c, { type: 'Heat and Hold', title: 'Downtime', content: L.join(NL) });
  }

  function doHeatHold(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Heat and Hold is a Deep Cuts Downtime step, and the module is off for this crew.'); return; }
    var d = openDowntime(cid);
    if (!d) {
      d = startDowntime(cid, 'opened Heat and Hold');
      note(msg, t.c, 'Downtime', 'Downtime started', 'No Downtime was open, so one was started now.');
    }
    if (d.startHeat === null) { d.startHeat = getNum(cid, 'heat', 0); }
    whisper(msg, heatHoldText(t, d));
  }

  function doDowntimeStart(msg, t) {
    var cid = t.ch.id;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Downtime steps need the Downtime module, and it is off for this crew.'); return; }
    var d = startDowntime(cid, 'adjust');
    d.startHeat = getNum(cid, 'heat', 0);
    note(msg, t.c, 'Downtime', 'Downtime started', 'A new Downtime is open. Anything used in an earlier one is available again.');
    whisper(msg, heatHoldText(t, d));
  }

  function doHhAct(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), res;
    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Heat and Hold is a Deep Cuts Downtime step, and the module is off for this crew.'); return; }
    var d = ledgerFor(msg, t, o); if (!d) { return; }
    dbg('hhact ' + code + ' ' + cid + ' ' + d.id);
    var mi = /^inc(\d+)$/.exec(code), mp = /^incpay(\d+)$/.exec(code);
    if (mi) {
      if (doIncomeRoll(msg, t, d, parseInt(mi[1], 10))) { whisper(msg, heatHoldText(t, d)); }
      return;
    }
    if (mp) {
      d.pending = d.pending || {};
      var ps = parseInt(mp[1], 10), pend = d.pending['inc' + ps];
      if (pend === undefined) { whisper(msg, 'BitDCrew: there is no income waiting for that claim.'); return; }
      if (d.used['incpay' + ps]) { note(msg, t.c, 'Downtime', 'Already done', 'That income was already added.'); return; }
      d.used['incpay' + ps] = true;
      var itr = coinTrack(cid), icur = getNum(cid, itr.attr, 0), iroom = Math.max(0, Math.min(coinCapacity(cid), itr.max) - icur), put = Math.min(pend, iroom);
      if (put > 0) { setAttr(cid, itr.attr, icur + put); }
      var iname = (incomeClaims(cid).filter(function (x) { return x.slot === ps; })[0] || { name: 'Claim' }).name;
      d.log.push(iname + ' income: +' + put + ' Coin to the crew' + (put < pend ? ' (' + (pend - put) + ' did not fit in the vaults; record it by hand)' : '') + '.');
      whisper(msg, heatHoldText(t, d));
      return;
    }
    switch (code) {
      case 'rh-coin':
      case 'rh-rep':
        if (reduceHeat(msg, t, code === 'rh-coin' ? 'Coin' : 'Rep')) { d.log.push('Spent 1 ' + (code === 'rh-coin' ? 'Coin' : 'Rep') + ' for Heat -1.'); }
        break;
      case 'jpt':
        if (!crewAbilityOn(cid, 'Just Passing Through')) { whisper(msg, 'BitDCrew: Just Passing Through is not ticked on this sheet.'); return; }
        if (d.used.jpt) { note(msg, t.c, 'Downtime', 'Already used', 'Just Passing Through was already used this Downtime.'); return; }
        if (getNum(cid, 'heat', 0) < 1) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce, so Just Passing Through was not used.'); return; }
        d.used.jpt = true;
        res = addHeat(cid, -1);
        d.log.push('Just Passing Through: Heat -1 (Heat now ' + res.after + ').');
        break;
      case 'hold':
        d.assessed = assessHold(msg, t);
        break;
      case 'end': endDowntime(msg, t, d); return;
      default: whisper(msg, 'BitDCrew: unknown Heat and Hold choice.'); return;
    }
    whisper(msg, heatHoldText(t, d));
  }

  // End Downtime: No Traces' "When you end downtime with zero Heat, take +1 Rep" (Deep Cuts p88), then a public summary
  function endDowntime(msg, t, d) {
    var cid = t.ch.id, ab = abilitiesOn(cid), L = [], heat = getNum(cid, 'heat', 0), r;
    d.ended = true;
    L.push(d.startHeat !== null ? 'Heat went from ' + d.startHeat + ' (when Heat and Hold opened) to ' + heat + '.' : 'Heat is ' + heat + '.');
    d.log.forEach(function (x) { L.push(x); });
    if (ab['no traces'] === true) {
      if (heat === 0) {
        r = gainRep(cid, 1);
        L.push('No Traces: the crew ended Downtime with zero Heat, so +1 Rep' + (r.bonus ? ' (+1 more from Leverage)' : '') + '. Rep now ' + r.after + '/' + REP_MAX + (r.full ? ' (the track is full)' : '') + '.');
      } else {
        L.push('No Traces: Heat is ' + heat + ', so no Rep this time.');
      }
    }
    L.push('Hold is ' + String(getAttr(cid, 'hold', 'strong')).toLowerCase() + (d.assessed ? ' (assessed: ' + d.assessed + ')' : '') + '.');
    dbg('downtime end ' + cid + ' ' + d.id);
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Downtime', title: 'Downtime ended', content: L.join(NL) }));
  }

  // ---------------------------------------------------------------- score and payoff

  function intOk(v, list) { return !isNaN(v) && list.indexOf(v) >= 0; }

  function newFlow(cid, data) {
    var st = botState(), nonce = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
    data.cid = cid; data.at = Date.now(); data.done = {};
    st.flows[nonce] = data;
    var keys = Object.keys(st.flows);
    if (keys.length > FLOW_MAX) {
      keys.sort(function (a, b) { return st.flows[a].at - st.flows[b].at; });
      while (keys.length > FLOW_MAX) { delete st.flows[keys.shift()]; }
    }
    return nonce;
  }

  // the flow a payoff button belongs to, or null (after telling the player why)
  function flowFor(msg, t, o, step) {
    var flow = o.idx ? botState().flows[o.idx] : null;
    if (!flow || flow.cid !== t.ch.id) { whisper(msg, 'BitDCrew: that score walk-through is no longer available. Start again from 4. Score.'); return null; }
    if (flow.done[step]) { note(msg, t.c, 'Score', 'Already done', 'That step was already applied. Use Adjust for corrections.'); return null; }
    flow.done[step] = true;
    return flow;
  }

  function doScore(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, m = mods(cid), a = o.pos.map(function (x) { return parseInt(x, 10); });
    if (m.downtime) {
      if (a.length !== 7) { whisper(msg, 'BitDCrew: this token action is out of date (the Downtime module changed). Run ~ Rebuild.'); return; }
      // the last answer may be "party": count the player characters Roll20 marks as Party members
      var fromParty = String(o.pos[6]).toLowerCase() === 'party';
      if (fromParty) {
        var pn = partyPcCount();
        if (pn < 1) {
          whisper(msg, 'BitDCrew: no player characters are marked as Party members, so there is nothing to count. Mark them in Roll20 (Edit character, Party member) or pick a number. Nothing was applied.');
          return;
        }
        a[6] = pn;
      }
      if (!intOk(a[0], [0, 2]) || !intOk(a[1], [0, 2]) || !intOk(a[2], [0, 2, 4]) || !intOk(a[3], [0, 4]) || !intOk(a[4], [0, 2, 4]) ||
          !intOk(a[5], [0, 1, 2, 3, 4, 5, 6]) || !(fromParty || intOk(a[6], [1, 2, 3, 4, 5, 6, 7, 8]))) {
        whisper(msg, 'BitDCrew: those score answers are not valid.'); return;
      }
      scoreDeepCuts(msg, t, a, fromParty);
    } else {
      if (a.length !== 5) { whisper(msg, 'BitDCrew: this token action is out of date (the Downtime module changed). Run ~ Rebuild.'); return; }
      if (!intOk(a[0], [0, 2, 4, 6]) || !intOk(a[1], [0, 1]) || !intOk(a[2], [0, 1]) || !intOk(a[3], [0, 1]) || !intOk(a[4], [0, 2])) {
        whisper(msg, 'BitDCrew: those score answers are not valid.'); return;
      }
      scoreCore(msg, t, a);
    }
  }

  // core, Heat: 0/2/4/6 by exposure, +1 high-profile target, +1 hostile turf, +1 at war, +2 killing
  function scoreCore(msg, t, a) {
    var cid = t.ch.id, total = a[0] + a[1] + a[2] + a[3] + a[4], parts = ['exposure ' + a[0]];
    if (a[1]) { parts.push('high-profile target +1'); }
    if (a[2]) { parts.push('hostile turf +1'); }
    if (a[3]) { parts.push('at war +1'); }
    if (a[4]) { parts.push('killing +2'); }
    total = applyHeatClaims(cid, total, parts);
    var res = addHeat(cid, total);
    var L = ['Heat +' + total + ' (' + parts.join(', ') + ').', 'Heat now ' + bar(res.after, HEAT_MAX) + ' ' + res.after + '/' + HEAT_MAX + '.',
      'Downtime module off: this is the core Score, Heat only. Rep and the Payoff are not tracked.'];
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Heat', content: L.join(NL) }));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, null); }
  }

  // Deep Cuts p80-81: Fallout (Heat), Rep, then the Payoff in steps. Heat and Rep are applied now; Coin only by button.
  function scoreDeepCuts(msg, t, a, fromParty) {
    var cid = t.ch.id, tier = getNum(cid, 'crew_tier', 0);
    var base = a[0], target1 = a[1], chaos = a[2], death = a[3], wit = a[4], tTier = a[5], pcs = a[6];
    startDowntime(cid, 'score');
    var total = base + tier + target1 + chaos + death + wit, parts = ['base ' + base, 'crew Tier +' + tier];
    if (target1) { parts.push('target +' + target1); }
    if (chaos) { parts.push('chaos or war +' + chaos); }
    if (death) { parts.push('death +' + death); }
    if (wit) { parts.push('witnesses +' + wit); }
    var L = [];
    if (total > 0 && crewAbilityOn(cid, 'No Traces')) {
      total -= 1; parts.push('No Traces -1');
    }
    total = applyHeatClaims(cid, total, parts);
    var res = addHeat(cid, total);
    L.push('Heat +' + total + ' (' + parts.join(', ') + ').');
    L.push('Heat now ' + bar(res.after, HEAT_MAX) + ' ' + res.after + '/' + HEAT_MAX + '.');
    var wl = wantedLines(cid, res);
    if (wl.length) { L = L.concat(wl); }
    if (res.after >= 6) { L.push('Heat is 6 or more: the GM brings an entanglement into play (Deep Cuts, Entanglements).'); }
    // Rep: 1 per 2 Heat generated by the score, +1 per Tier of the target above the crew's Tier
    var vt = claimHas(claimsOn(cid), [CLAIM_REP_AUTO]);
    var repGain = Math.floor(total / 2) + Math.max(0, tTier - tier) + (vt ? 1 : 0), rg = gainRep(cid, repGain);
    L.push('Rep +' + repGain + ' (1 per 2 Heat' + (tTier > tier ? ', +' + (tTier - tier) + ' for the target\'s Tier' : '') + (vt ? ', ' + CLAIM_REP_AUTO + ' +1' : '') + '). ' +
      (rg.bonus ? 'Leverage: +1 Rep. ' : '') + 'Rep now ' + rg.after + '/' + REP_MAX + (rg.full ? ' (the track is full)' : '') + '.');
    var payoff = pcs + 3 * tTier;
    L.push('Payoff: 1 Coin per PC (' + pcs + (fromParty ? ', the party' : '') + ') plus 3 x the target\'s Tier (' + tTier + ') = ' + payoff + ' Coin.');
    // Misdirection: "sacrifice half the rep gained" so another faction loses Status instead of the crew (round down).
    // Half of the Rep earned, the figure the card shows, even when part of it did not fit on the track.
    var earned = repGain + rg.bonus, give = Math.floor(earned / 2);
    var nonce = newFlow(cid, { base: payoff, tier: tier, heatGain: total, repGain: earned, repFit: rg.applied, misdirect: give });
    if (crewAbilityOn(cid, 'Misdirection')) {
      if (give >= 1) {
        L.push('Misdirection: you may give up half the Rep earned (' + give + ') so another faction loses Status with your target instead of your crew.');
        L.push('[Misdirection: give up ' + give + ' Rep](' + CMD + ' misdirect --c ' + cid + ' --idx ' + nonce + ')');
      } else {
        L.push('Misdirection is not offered: half of the Rep earned (' + earned + '), rounded down, is 0.');
      }
    } else if (crewAbilityListed(cid, 'Misdirection')) {
      L.push('Misdirection is on the crew sheet but its circle is not ticked, so it is not offered.');
    }
    // claims that depend on the kind of score or target: buttons, each once per Score (the Coin ones before the seized-assets step)
    var cl2 = claimsOn(cid), claimBtns = [];
    CLAIM_REP_BUTTONS.forEach(function (c, i) {
      if (claimHas(cl2, [c.name])) { claimBtns.push('[' + btn(c.name + ': ' + c.label + ', +' + c.rep + ' Rep') + '](' + CMD + ' claim rep' + i + ' --c ' + cid + ' --idx ' + nonce + ')'); }
    });
    CLAIM_COIN_BUTTONS.forEach(function (c, i) {
      if (claimHas(cl2, c.names)) { claimBtns.push('[' + btn(c.names[0] + ': ' + c.label + ', +2 Coin') + '](' + CMD + ' claim coin' + i + ' --c ' + cid + ' --idx ' + nonce + ')'); }
    });
    if (claimBtns.length) {
      L.push('Claims that apply only to some scores (use the ones that fit this score):');
      L.push(claimBtns.join(' '));
    }
    // Deep Cuts, Action module: "Any remaining Edge you have is lost when Downtime starts" (p92). A button, never automatic.
    if (mods(cid).action) {
      var pcs0 = partyPcs();
      if (!pcs0.length) {
        L.push('Edge is lost when Downtime starts, but no player characters are marked as Party members, so it cannot be cleared here.');
      } else {
        var holders = pcs0.filter(function (pc) { return edgeOf(pc.id) > 0; });
        if (holders.length) {
          L.push('Edge is lost when Downtime starts (Deep Cuts, Action): ' + holders.map(function (pc) { return btn(pc.get('name')) + ' ' + edgeOf(pc.id); }).join(', ') + '.');
          L.push('[Clear Edge for the party](' + CMD + ' edge clear --c ' + cid + ' --idx ' + nonce + ')');
        }
      }
    }
    var pick = function (code, label) { return '[' + label + '](' + CMD + ' seized ' + code + ' --c ' + cid + ' --idx ' + nonce + ')'; };
    L.push('Seized assets? Pick one:');
    L.push([pick('none', 'No seized assets'), pick('cash', 'Seized load of cash +4 Coin'), pick('fence2', 'Fence valuables for 2 Coin'),
      pick('fence4', 'Fence valuables for 4 Coin, +1 Heat'), pick('fence6', 'Fence valuables for 6 Coin, +1 Heat'),
      pick('fence8', 'Fence valuables for 8 Coin, +2 Heat')].join(' '));
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Fallout', content: L.join(NL) }));
    if (res.wraps) { announceWanted(t.ch, t.c, res, null, msg.playerid); }
  }

  // Publicity, Doskvol's Most Wanted (Rep) and the +2 Coin claims (Payoff): one click each per Score
  function doClaim(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), m = /^(rep|coin)(\d+)$/.exec(code);
    var def = m ? (m[1] === 'rep' ? CLAIM_REP_BUTTONS : CLAIM_COIN_BUTTONS)[parseInt(m[2], 10)] : null;
    if (!def) { whisper(msg, 'BitDCrew: unknown claim button.'); return; }
    var names = def.names || [def.name], label = names[0];
    if (!claimHas(claimsOn(cid), names)) { whisper(msg, 'BitDCrew: ' + label + ' is not ticked on this crew sheet.'); return; }
    var pre = o.idx ? botState().flows[o.idx] : null;
    if (pre && pre.cid === cid && m[1] === 'coin' && pre.done.seized) {
      whisper(msg, 'BitDCrew: the seized assets step is already done, so the Payoff is fixed. Add the Coin by hand with Adjust.'); return;
    }
    var flow = flowFor(msg, t, o, code); if (!flow) { return; }
    if (m[1] === 'rep') {
      // not boosted by Leverage again (user ruling): Leverage's +1 is once per Score
      var rg = gainRep(cid, def.rep, true);
      flow.repGain += def.rep; flow.repFit = (flow.repFit || 0) + rg.applied;
      whisper(msg, broadcast(t.c, { type: 'Claim', title: label + ' +' + def.rep + ' Rep', content: 'Rep now ' + rg.after + '/' + REP_MAX + (rg.full ? ' (the track is full)' : '') + '.' }));
    } else {
      flow.base += 2;
      whisper(msg, broadcast(t.c, { type: 'Claim', title: label + ' +2 Coin', content: 'The Payoff is now ' + flow.base + ' Coin. It counts toward the tithe.' }));
    }
  }

  function doMisdirect(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var flow = flowFor(msg, t, o, 'misdirect'); if (!flow) { return; }
    var cid = t.ch.id, give = flow.misdirect || 0;
    if (give < 1) { flow.done.misdirect = false; whisper(msg, 'BitDCrew: there is no Rep to give up for that score.'); return; }
    var before = getNum(cid, 'rep', 0), after = Math.max(0, before - give);
    setAttr(cid, 'rep', after);
    whisper(msg, broadcast(t.c, {
      type: 'Misdirection', title: 'Gave up ' + (before - after) + ' Rep',
      content: 'Rep is now ' + after + '/' + REP_MAX + '. Name the faction that loses Status with your target instead of your crew, and say how you pin it on them. Status is not tracked here.'
    }));
  }

  function doSeized(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || ''), coins = { none: 0, cash: 4, fence2: 2, fence4: 4, fence6: 6, fence8: 8 };
    if (!coins.hasOwnProperty(code)) { whisper(msg, 'BitDCrew: unknown seized-assets choice.'); return; }
    var flow = flowFor(msg, t, o, 'seized'); if (!flow) { return; }
    var cid = t.ch.id, L = [], heat = code.indexOf('fence') === 0 ? Math.floor(coins[code] / 4) : 0;
    if (coins[code]) { L.push((code === 'cash' ? 'Seized load of cash' : 'Fenced valuables') + ': +' + coins[code] + ' Coin.'); }
    if (heat) {
      var res = addHeat(cid, heat);
      L.push('Fencing valuables brings +' + heat + ' Heat (1 per 4 Coin of value). Heat now ' + res.after + '/' + HEAT_MAX + '.');
      L = L.concat(wantedLines(cid, res));
      if (res.wraps) { announceWanted(t.ch, t.c, res, null, msg.playerid); }
    }
    flow.earned = flow.base + coins[code];
    L.push('Earned from the score: ' + flow.earned + ' Coin.');
    var nonce = o.idx;
    // Deep Cuts, Tithe: Tier 2 or lower pays the ward boss 1 Coin for every 4 Coin earned
    flow.tithe = flow.tier <= 2 ? Math.floor(flow.earned / 4) : 0;
    if (flow.tithe > 0) {
      L.push('Tithe: you are Tier ' + flow.tier + ', so pay your ward boss 1 Coin for every 4 Coin earned: ' + flow.tithe + ' Coin.');
      L.push('If you cannot or will not pay, ask the GM if the boss will let you go into debt, accept a favor instead, or if their patience has run out.');
      L.push('[Pay the tithe: ' + flow.tithe + ' Coin](' + CMD + ' tithe pay --c ' + cid + ' --idx ' + nonce + ') ' +
        '[Not paying the tithe](' + CMD + ' tithe skip --c ' + cid + ' --idx ' + nonce + ')');
      whisper(msg, broadcast(t.c, { type: 'Score', title: 'Payoff', content: L.join(NL) }));
    } else {
      flow.net = flow.earned;
      flow.done.tithe = true;
      L = L.concat(depositLines(cid, flow, nonce));
      whisper(msg, broadcast(t.c, { type: 'Score', title: 'Payoff', content: L.join(NL) }));
    }
  }

  function doTithe(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || '');
    if (code !== 'pay' && code !== 'skip') { whisper(msg, 'BitDCrew: unknown tithe choice.'); return; }
    var flow = flowFor(msg, t, o, 'tithe'); if (!flow) { return; }
    if (flow.earned === undefined) { flow.done.tithe = false; whisper(msg, 'BitDCrew: pick the seized assets step first.'); return; }
    var cid = t.ch.id, L = [];
    flow.net = flow.earned - (code === 'pay' ? flow.tithe : 0);
    flow.paid = code === 'pay' ? flow.tithe : 0;
    L.push(code === 'pay' ? 'Tithe paid: ' + flow.tithe + ' Coin. ' + flow.net + ' Coin left to deposit.' : 'Tithe not paid. Work out the debt, favor or lost patience with the GM. ' + flow.net + ' Coin to deposit.');
    L = L.concat(depositLines(cid, flow, o.idx));
    whisper(msg, broadcast(t.c, { type: 'Score', title: 'Deposit', content: L.join(NL) }));
  }

  // Deep Cuts, Vaults & Banks: the crew's vaults, the Scoundrels' stashes, or a bank
  function depositLines(cid, flow, nonce) {
    var tr = coinTrack(cid), cap1 = coinCapacity(cid), cur = getNum(cid, tr.attr, 0), room = Math.max(0, cap1 - cur), L = [];
    L.push('Where does the Coin go? The crew holds ' + cur + ' Coin and has room for ' + room + ' more (4 on hand plus its vaults).');
    var half = Math.floor(flow.net / 2);
    L.push('[All ' + flow.net + ' to the crew](' + CMD + ' deposit all --c ' + cid + ' --idx ' + nonce + ') ' +
      '[Half, ' + half + ', to the crew](' + CMD + ' deposit half --c ' + cid + ' --idx ' + nonce + ') ' +
      '[None to the crew](' + CMD + ' deposit none --c ' + cid + ' --idx ' + nonce + ')');
    L.push('Coin that does not go to the crew goes to PC stashes or a bank. Record it there by hand.');
    return L;
  }

  function doDeposit(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var code = String(o.pos[0] || '');
    if (code !== 'all' && code !== 'half' && code !== 'none') { whisper(msg, 'BitDCrew: unknown deposit choice.'); return; }
    var flow = flowFor(msg, t, o, 'deposit'); if (!flow) { return; }
    if (flow.net === undefined) { flow.done.deposit = false; whisper(msg, 'BitDCrew: finish the earlier steps first.'); return; }
    var cid = t.ch.id, tr = coinTrack(cid), cur = getNum(cid, tr.attr, 0), want = code === 'all' ? flow.net : (code === 'half' ? Math.floor(flow.net / 2) : 0);
    var room = Math.max(0, Math.min(coinCapacity(cid), tr.max) - cur), put = Math.min(want, room), next = cur + put;
    if (put > 0) { setAttr(cid, tr.attr, next); }
    var elsewhere = flow.net - put, L = [];
    L.push('Heat +' + flow.heatGain + ', Rep +' + flow.repGain + (flow.repFit !== undefined && flow.repFit < flow.repGain ? ' earned, ' + flow.repFit + ' fit on the track' : '') + '.');
    L.push('Earned ' + flow.earned + ' Coin' + (flow.paid ? ', tithe ' + flow.paid + ' paid' : '') + ', ' + flow.net + ' to deposit.');
    L.push('To the crew: ' + put + ' Coin (crew now holds ' + next + ').');
    if (want > put) { L.push('The crew\'s vaults had room for only ' + put + ' of the ' + want + ' Coin you chose.'); }
    L.push('Elsewhere (PC stashes or a bank): ' + elsewhere + ' Coin.');
    if (getNum(cid, wantedInfo(cid).attr, 0) > 0) {
      L.push('The crew has wanted levels, so it cannot reach any bank funds until they are gone (Deep Cuts, Vaults and Banks).');
    }
    sendChat('player|' + msg.playerid, broadcast(t.c, { type: 'Score', title: 'Score recorded', content: L.join(NL) }));
    // the Score is done: the Heat and Hold step comes next
    var dd = openDowntime(cid);
    if (dd) {
      if (dd.startHeat === null) { dd.startHeat = getNum(cid, 'heat', 0); }
      whisper(msg, heatHoldText(t, dd));
    }
  }

  // ---------------------------------------------------------------- Edge for the party (Action module)
  // Writes only edge_amount on PC sheets and the token bars linked to it, only on a button click.

  function partyPcs() {
    return partyCharacters().filter(function (c) { return getAttr(c.id, 'sheet_type', 'character') === 'character'; });
  }
  function edgeOf(pcId) { return getNum(pcId, EDGE_ATTR, 0); }

  // a linked token bar is not refreshed by an API write, so every bar 2 linked to edge_amount is set to the value
  function syncEdgeBars(pcId) {
    var a = findObjs({ _type: 'attribute', _characterid: pcId, name: EDGE_ATTR })[0];
    if (!a) { return; }
    findObjs({ _type: 'graphic', represents: pcId }).forEach(function (g) {
      if (g.get('bar2_link') !== a.id) { return; }
      var cur = String(a.get('current'));
      if (String(g.get('bar2_value')) !== cur) { g.set('bar2_value', cur); }
    });
  }
  function setEdgeOf(pcId, n) {
    n = clamp(n, 0, EDGE_MAX);
    setAttr(pcId, EDGE_ATTR, n);
    syncEdgeBars(pcId);
    setTimeout(function () { syncEdgeBars(pcId); }, 1500);
    return n;
  }

  // the Begin score card (and its flow), or null when no player character is marked as a Party member
  function beginScoreCard(t) {
    var cid = t.ch.id, pcs = partyPcs();
    if (!pcs.length) { return null; }
    var nonce = newFlow(cid, { kind: 'edge' }), L = [];
    L.push('Bound in Darkness: when you begin a score, each PC that has not lost favor with your deity gains 1 Edge.');
    L.push('[All party PCs +1 Edge](' + CMD + ' edge all --c ' + cid + ' --idx ' + nonce + ')');
    L.push('Or one at a time, if someone lost favor: ' + pcs.map(function (pc) {
      return '[' + btn(pc.get('name')) + ' +1 Edge](' + CMD + ' edge pc --row ' + pc.id + ' --c ' + cid + ' --idx ' + nonce + ')';
    }).join(' '));
    return broadcast(t.c, { type: 'Action', title: 'Begin score', content: L.join(NL) });
  }

  // Deep Cuts, Action module, Bound in Darkness: "When you begin a score, each PC that has not lost favor with your deity gains 1 Edge."
  // Offered after the engagement roll; this command (!bitdcrew adj beginscore) is the manual way.
  function doBeginScore(msg, t) {
    var cid = t.ch.id;
    if (!mods(cid).action) { whisper(msg, 'BitDCrew: Edge comes from the Deep Cuts Action module, and it is off for this crew.'); return; }
    if (!crewAbilityOn(cid, 'Bound in Darkness')) {
      whisper(msg, 'BitDCrew: Bound in Darkness is not ticked on this crew sheet, so there is no Edge to hand out at the start of a score.'); return;
    }
    var card = beginScoreCard(t);
    if (!card) {
      whisper(msg, 'BitDCrew: no player characters are marked as Party members, so there is nobody to give Edge to. Mark them in Roll20 (Edit character, Party member). Nothing was applied.');
      return;
    }
    whisper(msg, card);
  }

  function doEdge(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, code = String(o.pos[0] || ''), L = [];
    if (code === 'clear') {
      var sc = flowFor(msg, t, o, 'edgeclear'); if (!sc) { return; }
      partyPcs().forEach(function (pc) {
        var had = edgeOf(pc.id);
        if (had > 0) { setEdgeOf(pc.id, 0); L.push(btn(pc.get('name')) + ' loses ' + had + ' Edge.'); }
      });
      if (!L.length) { sc.done.edgeclear = false; whisper(msg, 'BitDCrew: no party PC has any Edge to clear.'); return; }
      L.push('Edge is lost when Downtime starts (Deep Cuts, Action).');
      whisper(msg, broadcast(t.c, { type: 'Edge', title: 'Edge cleared', content: L.join(NL) }));
      return;
    }
    var flow = o.idx ? botState().flows[o.idx] : null;
    if (!flow || flow.cid !== cid || flow.kind !== 'edge') { whisper(msg, 'BitDCrew: that Begin score card is no longer available. Roll 2. Engagement again, or type !bitdcrew adj beginscore.'); return; }
    var pcs = partyPcs();
    if (code === 'all') {
      pcs.forEach(function (pc) {
        var step = 'pc:' + pc.id;
        if (flow.done[step]) { return; }
        flow.done[step] = true;
        var before = edgeOf(pc.id), after = setEdgeOf(pc.id, before + 1);
        L.push(btn(pc.get('name')) + ' Edge ' + before + ' to ' + after + '.');
      });
      if (!L.length) { note(msg, t.c, 'Edge', 'Already done', 'Everyone on this card already has their Edge.'); return; }
    } else if (code === 'pc') {
      var pc1 = pcs.filter(function (c) { return c.id === o.row; })[0];
      if (!pc1) { whisper(msg, 'BitDCrew: that character is no longer marked as a Party member.'); return; }
      var step1 = 'pc:' + pc1.id;
      if (flow.done[step1]) { note(msg, t.c, 'Edge', 'Already done', btn(pc1.get('name')) + ' already got Edge from this card.'); return; }
      flow.done[step1] = true;
      var b1 = edgeOf(pc1.id), a1 = setEdgeOf(pc1.id, b1 + 1);
      L.push(btn(pc1.get('name')) + ' Edge ' + b1 + ' to ' + a1 + '.');
    } else {
      whisper(msg, 'BitDCrew: unknown Edge choice.'); return;
    }
    whisper(msg, broadcast(t.c, { type: 'Edge', title: 'Edge gained', content: L.join(NL) }));
  }

  // ---------------------------------------------------------------- status

  function doStatus(msg, o) {
    var t = target(msg, o); if (!t) { return; }
    var cid = t.ch.id, m = mods(cid), L = [], dt = m.downtime;
    var heat = getNum(cid, 'heat', 0), w = wantedInfo(cid), wn = getNum(cid, w.attr, 0);
    L.push('Heat ' + bar(heat, HEAT_MAX) + ' ' + heat + '/' + HEAT_MAX);
    L.push(w.label + ' ' + bar(wn, w.max) + ' ' + wn + '/' + w.max + (slipperyOn(cid) ? ' (Slippery: effective ' + effectiveWanted(cid) + ')' : ''));
    if (dt && heat >= 6) { L.push('Heat is 6 or more: the GM brings an entanglement into play (Deep Cuts, Entanglements).'); }
    var turf = getNum(cid, 'turf', 0), ticked = turfClaimsTicked(cid);
    L.push('Rep ' + getNum(cid, 'rep', 0) + '/' + REP_MAX + ', Turf ' + turf + '/' + TURF_MAX + ', Tier ' + getNum(cid, 'crew_tier', 0) + '/' + TIER_MAX);
    if (ticked !== turf) {
      L.push('Note: ' + turf + ' turf boxes are marked but ' + ticked + ' Turf claims are ticked' + (dt && claimsOn(cid)['hagfish farm'] === true ? ' (counting Hagfish Farm)' : '') + '. They should match.');
    }
    var hold = String(getAttr(cid, 'hold', 'strong')).toLowerCase();
    if (dt) {
      var rule = holdByRule(cid);
      L.push('Hold ' + hold + '. By the Deep Cuts rule (turf ' + turf + ', Tier ' + getNum(cid, 'crew_tier', 0) + ') it is ' + rule + '.' +
        (rule !== hold ? ' [Assess hold](' + CMD + ' adj holdassess --c ' + cid + ')' : ''));
    } else {
      L.push('Hold ' + hold + '.');
    }
    if (abilitiesOn(cid)['just passing through'] === true) {
      L.push('Just Passing Through: +1d to pass yourselves off as ordinary citizens while Heat is 4 or less (' + (heat <= 4 ? 'active now' : 'not active, Heat is ' + heat) + ').');
    }
    var cip = claimsInPlay(cid, dt);
    if (cip.length) { L.push('Claims the script counts: ' + cip.join('; ') + '.'); }
    var on = abilitiesOn(cid);
    STATUS_REMINDERS.forEach(function (r) { if (on[normName(r[0])] === true) { L.push(r[1]); } });
    if (dt && openDowntime(cid)) { L.push('Downtime is open. [Heat and Hold](' + CMD + ' hh --c ' + cid + ')'); }
    var tr = coinTrack(cid);
    L.push('Coin ' + getNum(cid, tr.attr, 0) + ' (the crew can hold ' + coinCapacity(cid) + ')');
    if (m.advancement) {
      var size = getNum(cid, 'dc_xp_clocksize', 6), cl = [];
      for (var i = 1; i <= 4; i++) { cl.push(getNum(cid, 'dc_crew_xpclock_' + i, 0) + '/' + size); }
      L.push('Crew advancement clocks ' + cl.join('  '));
    } else {
      L.push('Crew XP ' + getNum(cid, 'crew_xp', 0) + '/' + CREW_XP_MAX);
    }
    if (dt) {
      var dmax = getNum(cid, 'crew_debt_dc_max', 4), dn = getNum(cid, 'crew_debt_dc', 0);
      L.push('Debt clock ' + bar(dn, dmax) + ' ' + dn + '/' + dmax);
    }
    crewClocks(cid).forEach(function (k) { L.push('Clock: ' + btn(k.name) + ' ' + k.progress + '/' + k.size); });
    cohortList(cid).forEach(function (c) {
      var imp = getNum(cid, c.prefix + '_impaired', 0);
      L.push('Cohort: ' + btn(c.name) + ' (' + cohortType(cid, c.prefix) + ', quality ' + cohortPool(cid, c.prefix) + (imp ? ', impaired' : '') + ')');
    });
    whisper(msg, broadcast(t.c, { type: '', title: 'Status', content: L.join(NL) }));
  }

  // GM tool: which characters does the script see as Roll20 Party members? Also shows the raw tags it can read.
  function doParty(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can run the party check.'); return; }
    var chars = findObjs({ _type: 'character' }), party = chars.filter(isPartyMember), L = [], seen = [], pcs = 0, crews = 0;
    party.forEach(function (c) {
      var st = getAttr(c.id, 'sheet_type', 'character');
      if (st === 'character') { pcs++; } else if (st === 'crew') { crews++; }
      L.push('Party member: ' + btn(c.get('name')) + ' (' + st + ')');
    });
    chars.forEach(function (c) {
      var t; try { t = c.get('tags'); } catch (e) { t = undefined; }
      var s = (t === undefined || t === null) ? '' : (typeof t === 'string' ? t : JSON.stringify(t));
      if (s && s !== '[]') { seen.push(btn(c.get('name')) + ': ' + btn(s).slice(0, 50)); }
    });
    L.unshift('Characters checked: ' + chars.length + '. Party members found: ' + party.length + ' (' + pcs + ' player character' + (pcs === 1 ? '' : 's') + ', ' + crews + ' crew sheet' + (crews === 1 ? '' : 's') + ').');
    if (!party.length) { L.push('None found. If you marked party members in Roll20 (Edit character, Party member), this script cannot see the flag.'); }
    L.push(seen.length ? 'Tags the script can read: ' + seen.slice(0, 8).join('; ') : 'No character has any tags the script can read.');
    log('BitDCrew party check: ' + party.length + ' party member(s) of ' + chars.length + ' characters; tags seen: ' + seen.length);
    whisper(msg, broadcast({ name: 'Party check', image: '' }, { type: 'Party', title: 'Party check', content: L.join(NL) }));
  }

  function doDebug(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can change debug logging.'); return; }
    var mode = String(o.pos[0] || '').toLowerCase(), st = botState();
    if (mode === 'on') { st.debug = true; }
    else if (mode === 'off') { st.debug = false; }
    else { whisper(msg, 'BitDCrew: debug logging is ' + (st.debug ? 'on' : 'off') + '. Use !bitdcrew debug on or off.'); return; }
    whisper(msg, 'BitDCrew: debug logging is now ' + (st.debug ? 'on' : 'off') + '. Messages go to the API console.');
  }

  // card formatting: GM tools for the **bold** and *italic* markup (see fmtOn)
  function doFmt(msg, o) {
    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can change the card formatting.'); return; }
    var a = String(o.pos[0] || '').toLowerCase(), b = String(o.pos[1] || '').toLowerCase(), st = botState(), f = st.fmt = st.fmt || {};
    if (a === 'probe') {
      var BACKTICK = String.fromCharCode(96);
      var L = ['Each line shows one kind of markup. If it works the marks disappear and the word is styled; if a line still shows the marks, that kind does not work in these cards.',
        'Bold: **bold text**', 'Italic: *italic text*', 'Both: ***bold and italic***', 'Underline: __underlined text__', 'Strikethrough: ~~struck text~~',
        'Code: ' + BACKTICK + 'code text' + BACKTICK, 'Slashes: //slashed text//', 'HTML bold: <b>html bold</b>', 'Heading: # heading text'];
      whisper(msg, broadcast({ name: 'Formatting test', image: '' }, { type: 'Formatting', title: 'What the cards show', content: L.join(NL) }));
      return;
    }
    if (a === 'on' || a === 'off') { f.bold = f.italic = (a === 'on'); }
    else if ((a === 'bold' || a === 'italic') && (b === 'on' || b === 'off')) { f[a] = (b === 'on'); }
    else {
      whisper(msg, 'BitDCrew: bold is ' + (fmtOn('bold') ? 'on' : 'off') + ', italic is ' + (fmtOn('italic') ? 'on' : 'off') + '. Use !bitdcrew fmt probe, fmt on, fmt off, fmt bold on|off or fmt italic on|off.');
      return;
    }
    whisper(msg, 'BitDCrew: card bold is now ' + (fmtOn('bold') ? 'on' : 'off') + ' and italic is ' + (fmtOn('italic') ? 'on' : 'off') + '.');
  }

  // ---------------------------------------------------------------- router

  function route(msg, o) {
    switch (o.verb) {
      case 'setup': case 'rebuild': return doSetup(msg, o);
      case 'roll': return doRoll(msg, o);
      case 'engagement': return doEngagement(msg, o);
      case 'engadd': return doEngAdd(msg, o);
      case 'engroll': return doEngRoll(msg, o);
      case 'abilities': return doAbilities(msg, o);
      case 'contacts': return doContacts(msg, o);
      case 'contact': return doContact(msg, o);
      case 'claims': return doClaims(msg, o);
      case 'claiminfo': return doClaimInfo(msg, o);
      case 'upgrades': return doUpgrades(msg, o);
      case 'upgradelist': return doUpgradeList(msg, o);
      case 'upgradeinfo': return doUpgradeInfo(msg, o);
      case 'clocks': return doClocks(msg, o);
      case 'clock': return doClockTick(msg, o);
      case 'adj': return doAdjust(msg, o);
      case 'score': return doScore(msg, o);
      case 'seized': return doSeized(msg, o);
      case 'tithe': return doTithe(msg, o);
      case 'deposit': return doDeposit(msg, o);
      case 'misdirect': return doMisdirect(msg, o);
      case 'claim': return doClaim(msg, o);
      case 'edge': return doEdge(msg, o);
      case 'hh': return doHeatHold(msg, o);
      case 'hhact': return doHhAct(msg, o);
      case 'party': return doParty(msg, o);
      case 'debug': return doDebug(msg, o);
      case 'fmt': return doFmt(msg, o);
      case 'status': return doStatus(msg, o);
      default:
        whisper(msg, 'BitD Crew Token Action Maker v' + VERSION + ': select a crew token and run ' + MACRO_NAME +
          ' (or the ~ Rebuild token action) to build the token actions.');
    }
  }

  function ensureMacro() {
    var gms = findObjs({ _type: 'player' }).filter(function (p) { return playerIsGM(p.id); });
    if (!gms.length) { return; }
    var m = findObjs({ _type: 'macro', name: MACRO_NAME })[0];
    if (!m) {
      createObj('macro', { _playerid: gms[0].id, name: MACRO_NAME, action: CMD + ' setup', visibleto: 'all' });
    } else if (m.get('visibleto') !== 'all') {
      m.set('visibleto', 'all');
    }
  }

  function register() {
    on('chat:message', function (msg) {
      if (msg.type !== 'api') { if (msg.rolltemplate === 'blades') { checkWatchedRoll(msg); } return; }
      if (String(msg.content).split(/\s+/)[0] !== CMD) { return; }
      try {
        dbg('command from ' + who(msg) + ': ' + msg.content);
        route(msg, parse(msg.content));
      } catch (e) {
        log('BitDCrew error: ' + (e && e.stack ? e.stack : e));
        try { whisper(msg, 'BitDCrew: something went wrong (' + clean(e && e.message ? e.message : e) + '). Check the API console.'); } catch (e2) { /* ignore */ }
      }
    });
    on('change:attribute:current', function (obj) {
      if (AUTO_HEAT && String(obj.get('name')) === 'heat') { autoHeat(obj); }
    });
    on('change:graphic:bar1_value', function (obj) {
      if (!AUTO_HEAT) { return; }
      var id = obj.id;
      setTimeout(function () { healHeatBar(id); }, 2000);
    });
    on('ready', function () {
      botState();
      ensureMacro();
      log('BitD Crew Token Action Maker v' + VERSION + ' ready');
    });
  }

  register();

  return { VERSION: VERSION, _route: route, _parse: parse, _entanglement: ENT_COLUMNS, _claimText: CLAIM_TEXT, _upgradeSheetText: UPGRADE_SHEET_TEXT, _upgradeBook: UPGRADE_BOOK };
}());
