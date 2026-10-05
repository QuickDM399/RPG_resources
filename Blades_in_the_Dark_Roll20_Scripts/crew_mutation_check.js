// Breaks "BitD Crew Token Action Maker.js" in many small ways, one at a time, and checks that crew_mock_test.js fails each time.
// Usage: node crew_mutation_check.js <crew script> <translation.json> <PC script>
// A mutation that is not applied (its text is missing or ambiguous) or that survives (tests still pass) is a failure.
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const SCRIPT = process.argv[2], TRANS = process.argv[3], PC = process.argv[4];
if (!SCRIPT || !TRANS || !PC) { console.log('usage: node crew_mutation_check.js <crew script> <translation.json> <PC script>'); process.exit(2); }
const SRC = fs.readFileSync(SCRIPT, 'utf8');
const TEST = path.join(__dirname, 'crew_mock_test.js');

const M = [
  ['Heat track of 10', "var HEAT_MAX = 9, REP_MAX = 12", "var HEAT_MAX = 10, REP_MAX = 12"],
  ['Heat fills at 10 not 9', "while (total >= HEAT_MAX) {", "while (total > HEAT_MAX) {"],
  ['Wanted not capped', "if (wanted < w.max) { wanted++; } else { capped++; }", "wanted++;"],
  ['crew Tier left out of score Heat', "var total = base + tier + target1 + chaos + death + wit,", "var total = base + target1 + chaos + death + wit,"],
  ['Rep 1 per 3 Heat', "Math.floor(total / 2) + Math.max(0, tTier - tier)", "Math.floor(total / 3) + Math.max(0, tTier - tier)"],
  ['payoff 2 x target Tier', "var payoff = pcs + 3 * tTier;", "var payoff = pcs + 2 * tTier;"],
  ['tithe 1 per 5', "flow.tier <= 2 ? Math.floor(flow.earned / 4) : 0", "flow.tier <= 2 ? Math.floor(flow.earned / 5) : 0"],
  ['tithe up to Tier 3', "flow.tier <= 2 ? Math.floor(flow.earned / 4) : 0", "flow.tier <= 3 ? Math.floor(flow.earned / 4) : 0"],
  ['crew gate points at characters', "getAttr(ch.id, 'sheet_type', 'character') !== 'crew'", "getAttr(ch.id, 'sheet_type', 'character') !== 'character'"],
  ['crew auto rule fires on any sheet', "if (!ch || getAttr(cid, 'sheet_type', 'character') !== 'crew') { return; }", "if (!ch) { return; }"],
  ['anyone may use any crew', "return cb.indexOf('all') >= 0 || cb.indexOf(msg.playerid) >= 0;", "return true;"],
  ['command shared with the PC script', "var CMD = '!bitdcrew';", "var CMD = '!bitd';"],
  ['ability marker shared with the PC script', "var MARK = 'bitd-crew-tam';", "var MARK = 'bitd-tam';"],
  ['macro name shared with the PC script', "var MACRO_NAME = 'CREW_TAM';", "var MACRO_NAME = 'BLADES_TAM';"],
  ['state key shared with the PC script', "var STATE_KEY = 'BitDCrewTAM';", "var STATE_KEY = 'BitDTAM';"],
  ['entanglement table cell wrong', "['Reprisals', 'Unquiet Dead']", "['Reprisals', 'Rivals']"],
  ['entanglement Heat 6 column starts at 7', "w.heat >= 6 ? 2 : (w.heat >= 4 ? 1 : 0)", "w.heat >= 7 ? 2 : (w.heat >= 4 ? 1 : 0)"],
  ['entanglement zero dice take the highest', "lowest: pool <= 0", "lowest: false"],
  ['Downtime coin written to the standard track', "return mods(cid).downtime ? { attr: 'crewcoin_dc', max: 24 }", "return mods(cid).downtime ? { attr: 'crewcoin', max: 24 }"],
  ['vault holds 6', "4 + (v1 ? 8 : 0) + (v2 ? 12 : 0)", "4 + (v1 ? 6 : 0) + (v2 ? 12 : 0)"],
  ['hold strong only above Tier', "getNum(cid, 'turf', 0) >= getNum(cid, 'crew_tier', 0) ? 'strong' : 'weak'", "getNum(cid, 'turf', 0) > getNum(cid, 'crew_tier', 0) ? 'strong' : 'weak'"],
  ['5th Wanted box reads the wrong attribute', "{ attr: 'wantedDC', max: 5, label", "{ attr: 'wanted', max: 5, label"],
  ['a callback on the Tier roll', "'{{title=^{crew_tier}}} {{subtitle=^{roll_their}}} {{' + diceField(pool) + '}}' + tail(cid, t.c);\n      sendChat('player|' + msg.playerid, text);", "'{{title=^{crew_tier}}} {{subtitle=^{roll_their}}} {{' + diceField(pool) + '}}' + tail(cid, t.c);\n      sendChat('player|' + msg.playerid, text, function () {});"],
  ['bar 1 max of 12', "bar1_max: HEAT_MAX", "bar1_max: 12"],
  ['bar 1 not linked to heat', "tok.set({ bar1_link: a.id });", "tok.set({ bar2_link: a.id });"],
  ['Slippery does nothing', "Math.max(0, actual - 1)", "actual"],
  ['core advancement reminder with Downtime on', "before + 1 >= CREW_XP_MAX && !m.downtime", "before + 1 >= CREW_XP_MAX"],
  ['No Traces takes 2', "total -= 1; parts.push('No Traces -1');", "total -= 2; parts.push('No Traces -1');"],
  ['payoff steps can repeat', "flow.done[step] = true;\n    return flow;", "return flow;"],
  ['Incarceration keeps Heat', "setAttr(cid, 'heat', 0);\n        syncHeatBars(cid);", "syncHeatBars(cid);"],
  ['fencing Heat 1 per 2 Coin', "Math.floor(coins[code] / 4)", "Math.floor(coins[code] / 2)"],
  ['bonus dice not limited', "bonus = clamp(bonus, -3, 6);", ""],
  ['cohort ignores elite or expert', "((cohortType(cid, prefix) === 'elite' || cohortType(cid, prefix) === 'expert') ? 1 : 0)", "0"],
  ['impaired adds a die', "- getNum(cid, prefix + '_impaired', 0) +", "+ getNum(cid, prefix + '_impaired', 0) +"],
  ['Wanted level gained on Heat 8', "var res = applyHeat(cid, cur, 0);", "var res = applyHeat(cid, cur + 1, 0);"],
  ['Downtime crew can roll Entanglement', "if (m.downtime) {\n        whisper(msg, 'BitDCrew: Deep Cuts Downtime has no entanglement roll.", "if (false) {\n        whisper(msg, 'BitDCrew: Deep Cuts Downtime has no entanglement roll."],
  ['deposit ignores vault room', "Math.max(0, Math.min(coinCapacity(cid), tr.max) - cur)", "Math.max(0, tr.max - cur)"],
  ['half deposit rounds up', "(code === 'half' ? Math.floor(flow.net / 2) : 0)", "(code === 'half' ? Math.ceil(flow.net / 2) : 0)"],
  ['abilities menu lists unticked', "if (String(getAttrByName(cid, 'repeating_crewability_' + r.row + '_check')) !== '1') { return; }", ""],
  ['clock may pass its size', "var next = clamp(k.progress + (delta > 0 ? 1 : -1), 0, k.size);", "var next = clamp(k.progress + (delta > 0 ? 1 : -1), 0, 99);"],
  ["Reduce Heat takes 2", "    var res = addHeat(cid, -1);\n    note(msg, t.c, 'Heat', 'Heat ' + res.after", "    var res = addHeat(cid, -2);\n    note(msg, t.c, 'Heat', 'Heat ' + res.after"],
  ["Rep not capped at 12", "Math.min(REP_MAX, before + want)", "before + want"],
  ["Leverage on a gain of 0", "(n > 0 && crewAbilityOn(cid, 'Leverage')) ? 1 : 0", "crewAbilityOn(cid, 'Leverage') ? 1 : 0"],
  ["Leverage gives +2", "(n > 0 && crewAbilityOn(cid, 'Leverage')) ? 1 : 0", "(n > 0 && crewAbilityOn(cid, 'Leverage')) ? 2 : 0"],
  ["Misdirection gives up the larger half", "var give = Math.floor(rg.applied / 2);", "var give = Math.ceil(rg.applied / 2);"],
  ["Misdirection halves the Rep asked, not gained", "var give = Math.floor(rg.applied / 2);", "var give = Math.floor(repGain / 2);"],
  ["Misdirection offered at a gain of 1", "crewAbilityOn(cid, 'Misdirection') && rg.applied >= 2", "crewAbilityOn(cid, 'Misdirection') && rg.applied >= 1"],
  ["Misdirection offered without the ability", "crewAbilityOn(cid, 'Misdirection') && rg.applied >= 2", "rg.applied >= 2"],
  ["No Traces Rep at End Downtime with Heat 1", "      if (heat === 0) {\n        r = gainRep(cid, 1);", "      if (heat <= 1) {\n        r = gainRep(cid, 1);"],
  ["No Traces gives 2 Rep at End Downtime", "r = gainRep(cid, 1);", "r = gainRep(cid, 2);"],
  ["End Downtime leaves the Downtime open", "    d.ended = true;\n    L.push(d.startHeat", "    d.ended = false;\n    L.push(d.startHeat"],
  ["Just Passing Through takes 2 Heat", "res = addHeat(cid, -1);\n        d.log.push('Just Passing Through", "res = addHeat(cid, -2);\n        d.log.push('Just Passing Through"],
  ["Just Passing Through not once per Downtime", "        d.used.jpt = true;\n", ""],
  ["Just Passing Through spent at Heat 0", "if (getNum(cid, 'heat', 0) < 1) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce, so", "if (false) { note(msg, t.c, 'Heat', 'Heat 0', 'There is no Heat to reduce, so"],
  ["Just Passing Through button at Heat 0", "ab['just passing through'] === true && !d.used.jpt && heat > 0", "ab['just passing through'] === true && !d.used.jpt"],
  ["Reduce Heat buttons at Heat 0", "    if (heat > 0) {\n      L.push('Reduce Heat by 1", "    if (true) {\n      L.push('Reduce Heat by 1"],
  ["Downtime id not checked", "if (!d || !o.idx || d.id !== o.idx) {", "if (!d) {"],
  ["Heat and Hold on a crew without Downtime", "    if (!mods(cid).downtime) { whisper(msg, 'BitDCrew: Heat and Hold is a Deep Cuts Downtime step, and the module is off for this crew.'); return; }\n    var d = openDowntime(cid);", "    var d = openDowntime(cid);"],
  ["Score does not start a Downtime", "    startDowntime(cid, 'score');\n", ""],
  ["no Heat and Hold card after the deposit", "    var dd = openDowntime(cid);\n    if (dd) {", "    var dd = null;\n    if (dd) {"],
  ["an ended Downtime still counts as open", "return (d && !d.ended) ? d : null;", "return d || null;"],
  ["a new Downtime keeps the old used list", "used: {}, log: [], ended: false", "used: (prev ? prev.used : {}), log: [], ended: false"],
  ["party tag wrong", "var PARTY_TAG = '_roll20_internal_party_tag_';", "var PARTY_TAG = '_roll20_party_';"],
  ["party flag read from arrays only", "(typeof t === 'string' ? t : JSON.stringify(t)).indexOf(PARTY_TAG) >= 0;", "(typeof t === 'string' ? '' : JSON.stringify(t)).indexOf(PARTY_TAG) >= 0;"],
  ["party count includes crews", "return partyCharacters().filter(function (c) { return getAttr(c.id, 'sheet_type', 'character') === 'character'; }).length;", "return partyCharacters().length;"],
  ["empty party still scores", "if (pn < 1) {", "if (pn < 0) {"],
  ["party probe open to players", "    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can run the party check.'); return; }\n", ""],
  ["debug always on", "function dbg(text) { if (botState().debug) {", "function dbg(text) { if (true) {"],
  ["debug switch open to players", "    if (!playerIsGM(msg.playerid)) { whisper(msg, 'BitDCrew: only the GM can change debug logging.'); return; }\n", ""],
  ["Payoff prompt without the party option", "' ?{PCs for the Payoff (1 Coin each)|All party members,party|'", "' ?{PCs for the Payoff (1 Coin each)|'"],
  ["Downtime state not created", "    state[STATE_KEY].downtime = state[STATE_KEY].downtime || {};\n", ""],
  ["Status says Just Passing Through is active at Heat 5", "(heat <= 4 ? 'active now'", "(heat <= 5 ? 'active now'"],
  ['non-ASCII character in the source', "var NL = '\\n';", "var NL = '\\n'; var X = 'é';"]
];

let survived = 0, notApplied = 0, killed = 0;
M.forEach((m) => {
  const n = SRC.split(m[1]).length - 1;
  if (n !== 1) { notApplied++; console.log('NOT APPLIED (' + n + ' matches):', m[0]); return; }
  const file = path.join(os.tmpdir(), 'crew_mut_' + process.pid + '.js');
  fs.writeFileSync(file, SRC.replace(m[1], () => m[2]));
  const r = cp.spawnSync('node', [TEST, file, TRANS, PC], { encoding: 'utf8' });
  fs.unlinkSync(file);
  if (r.status === 0) { survived++; console.log('SURVIVED:', m[0]); }
  else { killed++; const first = (r.stdout.split('\n').find(l => /^FAIL:/.test(l)) || (r.stderr.split('\n')[0] || 'crashed')).slice(0, 110); console.log('killed  : ' + m[0] + '  <- ' + first); }
});
console.log(M.length + ' mutations: ' + killed + ' caught, ' + survived + ' survived, ' + notApplied + ' not applied');
process.exit(survived || notApplied ? 1 : 0);
